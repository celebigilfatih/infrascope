"""NMS Orchestrator for InfraScope

Reads polling-enabled devices from InfraScope's PostgreSQL, polls them
via SNMP concurrently, and writes metrics directly to nms_* tables.

NO alarm evaluation here -- TypeScript detection-engine.ts handles that.
NO HTTP client -- direct DB writes only.

Polling architecture:
  - ThreadPoolExecutor: all devices polled in parallel (no blocking)
  - Per-device interval throttle: respects each device's polling_interval from DB
  - Thread-safe shared state: locks protect topology/last-poll dicts
  - Independent DB sessions per thread (SQLAlchemy sessions are NOT thread-safe)
"""

import time
import threading
import random
from concurrent.futures import ThreadPoolExecutor, wait as futures_wait
from typing import Dict, Optional, Set
from datetime import datetime

from nms_service.core.logger import logger
from nms_service.core.config import config
from nms_service.snmp.poller import SNMPPoller, DeviceConfig
from nms_service.ssh.poller import SSHPoller, SSHDeviceConfig
from nms_service.security.credentials import CredentialEnvelopeError, decrypt_nms_credential
from nms_service.database.models import db_manager, Device
from nms_service.database.repository import (
    DeviceRepository,
    MetricsRepository,
    TopologyRepository,
)


class NMSOrchestrator:
    """Main NMS service orchestrator -- concurrent polling via ThreadPoolExecutor"""

    def __init__(self):
        self.poller = SNMPPoller()
        self.ssh_poller = SSHPoller()
        # nms_device_id (int) -> Device record
        self.device_map: Dict[int, Device] = {}
        self.last_topology_poll: Dict[int, datetime] = {}
        self.last_device_poll: Dict[int, datetime] = {}  # per-device interval throttle
        # Per-device outcome tracking to drive dynamic polling intervals
        # status: 'snmp_ok' | 'ssh_only' | 'unstable'
        self.device_status: Dict[int, str] = {}
        # Jitter offsets (0..poll_jitter_max) applied per device to spread the load
        self._jitter_offset: Dict[int, int] = {}
        # Active poll set — prevents parallel polls for the same device
        self._active_polls: Set[int] = set()
        self._active_lock = threading.Lock()
        # Device IDs whose previous poll was cancelled — skip one cycle to let
        # the thread finish winding down before re-submitting
        self._pending_cancellations: Set[int] = set()
        self._snmp_config_warnings: Set[int] = set()
        self._ssh_config_warnings: Set[int] = set()
        self._topo_lock = threading.Lock()       # protects last_topology_poll
        self._last_poll_lock = threading.Lock()  # protects last_device_poll
        # Persistent thread pool — avoids ThreadPoolExecutor.__exit__ blocking
        self._executor = ThreadPoolExecutor(
            max_workers=config.snmp.max_concurrent_pollers,
        )
        logger.info(
            f"NMS Orchestrator initialized "
            f"(workers={config.snmp.max_concurrent_pollers}, "
            f"ssh_max={getattr(config, 'ssh_max_concurrent', 15)}, "
            f"snmp_timeout={config.snmp.snmp_timeout}s, "
            f"snmp_retries={config.snmp.snmp_retries})"
        )

    # ------------------------------------------------------------------
    # Dynamic polling interval based on last poll outcome
    # ------------------------------------------------------------------
    def _effective_interval(self, nms_device_id: int, device) -> int:
        """Pick a polling interval for this device.

        Falls back to the device record's polling_interval if no outcome is
        tracked yet. Applies deterministic per-device jitter to spread load.
        """
        status = self.device_status.get(nms_device_id)
        if status == 'snmp_ok':
            base = getattr(config, 'poll_interval_snmp_ok', 60)
        elif status == 'ssh_only':
            base = getattr(config, 'poll_interval_ssh_only', 300)
        elif status == 'unstable':
            base = getattr(config, 'poll_interval_unstable', 600)
        else:
            base = (device.polling_interval or 300) if device else 300

        # Deterministic jitter per device (0..jitter_max)
        jitter = self._jitter_offset.get(nms_device_id)
        if jitter is None:
            jitter = random.randint(0, max(0, getattr(config, 'poll_jitter_max', 10)))
            self._jitter_offset[nms_device_id] = jitter
        return base + jitter

    def register_devices_from_db(self) -> int:
        """Load polling-enabled devices from InfraScope DB.

        Queries devices WHERE nms_device_id IS NOT NULL AND polling_enabled = TRUE.
        Uses management_ip as the SNMP target and nms_device_id as the poller integer ID.
        Re-called every cycle to pick up newly added devices automatically.
        Also registers devices for SSH polling as fallback.
        """
        try:
            session = db_manager.get_session()
            device_repo = DeviceRepository(session)
            devices = device_repo.get_all_polling_enabled()
            count = 0

            for device in devices:
                if not device.nms_device_id:
                    continue

                vendor = self._detect_vendor(device.name, device.vendor)

                # SNMPv1/v2c uses an explicit community; SNMPv3 uses encrypted USM secrets.
                snmp_version = (device.snmp_version or "2c").lower()
                snmp_community = ""
                if device.snmp_community:
                    try:
                        snmp_community = decrypt_nms_credential(
                            device.snmp_community, "snmpCommunity"
                        )
                    except CredentialEnvelopeError:
                        snmp_community = ""
                v3_auth_password = ""
                if device.snmp_v3_auth_password:
                    try:
                        v3_auth_password = decrypt_nms_credential(
                            device.snmp_v3_auth_password, "snmpV3AuthPassword"
                        )
                    except CredentialEnvelopeError:
                        v3_auth_password = ""
                v3_privacy_password = ""
                if device.snmp_v3_privacy_password:
                    try:
                        v3_privacy_password = decrypt_nms_credential(
                            device.snmp_v3_privacy_password, "snmpV3PrivacyPassword"
                        )
                    except CredentialEnvelopeError:
                        v3_privacy_password = ""
                v3_security_level = device.snmp_v3_security_level or "authPriv"
                v3_ready = (
                    snmp_version in ("3", "v3")
                    and bool(device.snmp_v3_username)
                    and len(v3_auth_password) >= 8
                    and v3_security_level in ("authNoPriv", "authPriv")
                    and (
                        v3_security_level == "authNoPriv"
                        or len(v3_privacy_password) >= 8
                    )
                )
                v12_ready = (
                    bool(snmp_community)
                    and snmp_version in ("1", "v1", "2c", "v2c")
                )
                if v12_ready or v3_ready:
                    self._snmp_config_warnings.discard(device.nms_device_id)
                    device_cfg = DeviceConfig(
                        device_id=device.nms_device_id,
                        device_name=device.name,
                        ip_address=device.management_ip,
                        community_string=snmp_community,
                        vendor=vendor,
                        snmp_port=device.snmp_port or 161,
                        snmp_version=snmp_version,
                        enabled=device.polling_enabled,
                        v3_username=device.snmp_v3_username or "",
                        v3_security_level=v3_security_level,
                        v3_auth_protocol=device.snmp_v3_auth_protocol or "SHA",
                        v3_auth_password=v3_auth_password,
                        v3_privacy_protocol=device.snmp_v3_privacy_protocol or "AES",
                        v3_privacy_password=v3_privacy_password,
                    )
                    self.poller.register_device(device_cfg)
                else:
                    self.poller.unregister_device(device.nms_device_id)
                    if device.nms_device_id not in self._snmp_config_warnings:
                        logger.warning(
                            f"SNMP not registered for {device.name}: complete encrypted credentials required"
                        )
                        self._snmp_config_warnings.add(device.nms_device_id)
                
                # Register for SSH polling (fallback)
                ssh_username = device.ssh_username or ""
                ssh_password = ""
                if device.ssh_password:
                    try:
                        ssh_password = decrypt_nms_credential(
                            device.ssh_password, "sshPassword"
                        )
                    except CredentialEnvelopeError:
                        ssh_password = ""
                if (
                    ssh_username
                    and ssh_password
                    and device.ssh_host_key_fingerprint
                ):
                    self._ssh_config_warnings.discard(device.nms_device_id)
                    self.ssh_poller.register_device(SSHDeviceConfig(
                        device_id=device.nms_device_id,
                        device_name=device.name,
                        ip_address=device.management_ip,
                        username=ssh_username,
                        password=ssh_password,
                        port=device.ssh_port or 22,
                        vendor=vendor,
                        enabled=device.polling_enabled,
                        host_key_fingerprint=device.ssh_host_key_fingerprint,
                        host_key_algorithm=device.ssh_host_key_algorithm or "",
                    ))
                else:
                    self.ssh_poller.unregister_device(device.nms_device_id)
                    if device.nms_device_id not in self._ssh_config_warnings:
                        logger.warning(
                            f"SSH not registered for {device.name}: encrypted credentials and an approved host key are required"
                        )
                        self._ssh_config_warnings.add(device.nms_device_id)
                
                self.device_map[device.nms_device_id] = device
                count += 1

            session.close()
            logger.info(
                f"Loaded {count} polling-enabled device candidates from InfraScope DB "
                f"(SNMP registered={len(self.poller.sessions)}, SSH registered={len(self.ssh_poller.sessions)})"
            )
            return count

        except Exception as e:
            logger.error(f"Failed to register devices from DB: {e}")
            return 0

    def _detect_vendor(self, device_name: str, configured_vendor: Optional[str] = None) -> str:
        """Infer vendor from inventory metadata first, then the device name."""
        identity = f"{configured_vendor or ''} {device_name or ''}".lower()
        if "cisco" in identity:
            return "cisco"
        if "fortinet" in identity or "fortigate" in identity:
            return "fortinet"
        if "mikrotik" in identity:
            return "mikrotik"
        if "huawei" in identity:
            return "huawei"
        if "aruba" in identity:
            return "aruba"
        if any(k in identity for k in ("h3c", "comware", "hpe", "procurve", "_hp_", "hp-", "hp_")):
            return "hp"
        if "juniper" in identity or "junos" in identity:
            return "juniper"
        if "arista" in identity:
            return "arista"
        return "generic"

    def _poll_single_device(self, nms_device_id: int) -> bool:
        """Poll one device in a thread-pool worker.

        Each call gets its own DB session (SQLAlchemy sessions are NOT thread-safe).
        Tries SNMP first, falls back to SSH if SNMP fails.
        Returns True if device was polled, False if skipped (interval not yet reached).
        """
        # Poll deduplication — prevent parallel polls for the same device
        with self._active_lock:
            if nms_device_id in self._active_polls:
                return False
            # Skip devices whose previous poll was cancelled (thread may still be winding down)
            if nms_device_id in self._pending_cancellations:
                self._pending_cancellations.discard(nms_device_id)
                return False
            self._active_polls.add(nms_device_id)

        try:
            return self._poll_single_device_inner(nms_device_id)
        finally:
            with self._active_lock:
                self._active_polls.discard(nms_device_id)

    def _poll_single_device_inner(self, nms_device_id: int) -> bool:
        snmp_session = self.poller.sessions.get(nms_device_id)
        ssh_session = self.ssh_poller.sessions.get(nms_device_id)
        
        if not snmp_session and not ssh_session:
            return False

        device_name = snmp_session.device_name if snmp_session else (ssh_session.device_name if ssh_session else "Unknown")
        device = self.device_map.get(nms_device_id)
        polling_interval = self._effective_interval(nms_device_id, device)

        # Per-device interval throttle -- respect the dynamic polling_interval
        now = datetime.utcnow()
        with self._last_poll_lock:
            last_poll = self.last_device_poll.get(nms_device_id)
            if last_poll:
                elapsed = (now - last_poll).total_seconds()
                if elapsed < polling_interval:
                    return False  # not yet due for this device

        # Each thread uses its own independent DB session
        session = db_manager.get_session()
        try:
            metrics_repo = MetricsRepository(session)
            device_repo = DeviceRepository(session)

            # -- Interface polling (SNMP first, then SSH fallback) -------------------
            interfaces = []
            snmp_failed = False
            used_ssh = False
            
            if snmp_session:
                try:
                    interfaces = self.poller.poll_interfaces(nms_device_id)
                    if interfaces:
                        logger.info(f"SNMP: Found {len(interfaces)} interfaces for {device_name}")
                    else:
                        # SNMP returned empty list - likely timeout/unreachable
                        logger.warning(f"SNMP returned no interfaces for {device_name}, trying SSH")
                        snmp_failed = True
                except Exception as e:
                    logger.warning(f"SNMP interface poll failed for {device_name}: {e}")
                    snmp_failed = True
            
            # SSH fallback if SNMP failed or not available
            if (snmp_failed or not snmp_session) and ssh_session:
                try:
                    interfaces = self.ssh_poller.poll_interfaces(nms_device_id)
                    if interfaces:
                        logger.info(f"SSH: Found {len(interfaces)} interfaces for {device_name}")
                        used_ssh = True
                except Exception as e:
                    logger.error(f"SSH interface poll failed for {device_name}: {e}")

            # Track outcome -> drives dynamic polling interval next cycle
            prev_status = self.device_status.get(nms_device_id)
            if interfaces and not used_ssh:
                new_status = 'snmp_ok'
            elif interfaces and used_ssh:
                new_status = 'ssh_only'
            else:
                new_status = 'unstable'
            if new_status != prev_status:
                logger.info(
                    f"Device {device_name} status transition: "
                    f"{prev_status or 'none'} -> {new_status}"
                )
            self.device_status[nms_device_id] = new_status
            
            # Save interfaces
            if interfaces:
                for iface in interfaces:
                    metrics_repo.save_interface_metrics(
                        nms_device_id=nms_device_id,
                        interface_index=iface.interface_index,
                        interface_name=iface.interface_name,
                        description=iface.description,
                        admin_status=iface.admin_status,
                        oper_status=iface.oper_status,
                        speed=iface.speed,
                        in_octets=iface.in_octets,
                        out_octets=iface.out_octets,
                        in_errors=iface.in_errors,
                        out_errors=iface.out_errors,
                        mtu=iface.mtu,
                    )

            # -- Health polling (SNMP first, then SSH fallback) ----------------------
            health = None
            snmp_health_failed = False
            
            if snmp_session:
                try:
                    vendor = self._detect_vendor(device.name, device.vendor) if device else "generic"
                    health = self.poller.poll_device_health(nms_device_id, vendor)
                    if health:
                        logger.info(f"SNMP: Polled health for {device_name}")
                except Exception as e:
                    logger.warning(f"SNMP health poll failed for {device_name}: {e}")
                    snmp_health_failed = True
            
            # SSH fallback if SNMP failed or not available
            if (snmp_health_failed or not snmp_session or not health) and ssh_session:
                try:
                    vendor = self._detect_vendor(device.name, device.vendor) if device else "generic"
                    health = self.ssh_poller.poll_device_health(nms_device_id, vendor)
                    if health:
                        logger.info(f"SSH: Polled health for {device_name}")
                except Exception as e:
                    logger.error(f"SSH health poll failed for {device_name}: {e}")
            
            # Save health
            if health:
                metrics_repo.save_health_metrics(
                    nms_device_id=nms_device_id,
                    uptime_seconds=health.uptime_seconds,
                    cpu_usage=health.cpu_usage,
                    memory_usage=health.memory_usage,
                    temperature=health.temperature,
                )

            # -- Topology polling (throttled -- 1 hour by default) -------------------
            with self._topo_lock:
                last_topo = self.last_topology_poll.get(nms_device_id)
                topo_due = (
                    not last_topo
                    or (now - last_topo).total_seconds() > config.polling.topology_poll_interval
                )

            if topo_due:
                try:
                    topo_links = self.poller.poll_topology(nms_device_id)
                    if topo_links:
                        topo_repo = TopologyRepository(session)
                        for link in topo_links:
                            topo_repo.save_neighbor(
                                nms_device_id=nms_device_id,
                                local_interface=link.local_interface,
                                remote_device_name=link.remote_device_name,
                                remote_interface=link.remote_interface,
                                protocol=link.protocol,
                            )
                        with self._topo_lock:
                            self.last_topology_poll[nms_device_id] = now
                        logger.info(f"Polled {len(topo_links)} topology links for device {nms_device_id}")
                except Exception as e:
                    logger.error(f"Topology poll failed for {device_name}: {e}")

            # -- Update last_polled_at -----------------------------------------------
            device_repo.update_last_polled(nms_device_id)
            with self._last_poll_lock:
                self.last_device_poll[nms_device_id] = now

            return True

        except Exception as e:
            logger.error(f"Error polling device {device_name} (nms_id={nms_device_id}): {e}")
            return False
        finally:
            session.close()

    def poll_cycle(self) -> None:
        """Concurrent polling cycle -- all devices polled in parallel.

        Uses a persistent ThreadPoolExecutor (no `with` context manager) so that
        the cycle function can return promptly after MAX_CYCLE_SECONDS without
        waiting for hung threads to finish.  With subprocess-based SNMP calls,
        each thread's I/O runs in a child process that honours its own timeout.
        """
        cycle_start = time.time()
        device_ids = list(self.poller.sessions.keys())

        if not device_ids:
            return

        polled = 0
        skipped = 0
        MAX_CYCLE_SECONDS = 90

        future_map = {
            self._executor.submit(self._poll_single_device, did): did
            for did in device_ids
        }
        done, not_done = futures_wait(future_map, timeout=MAX_CYCLE_SECONDS)

        # Process completed futures
        for future in done:
            did = future_map[future]
            try:
                if future.result():
                    polled += 1
                else:
                    skipped += 1
            except Exception as e:
                logger.error(f"Thread error for device {did}: {e}")

        # Log timed-out devices and cancel their futures to prevent zombie threads
        if not_done:
            names = []
            for future in not_done:
                did = future_map[future]
                device = self.device_map.get(did)
                names.append(device.name if device else str(did))
                # Cancel the future so the thread pool can reclaim the worker
                future.cancel()
                self._pending_cancellations.add(did)
            logger.warning(f"Poll timeout (>{MAX_CYCLE_SECONDS}s): {', '.join(names)}")
            logger.info(f"Cancelled {len(not_done)} timed-out future(s)")

        elapsed = time.time() - cycle_start
        if polled > 0:
            logger.info(
                f"Poll cycle done: {polled} polled, {skipped} skipped -- "
                f"{len(device_ids)} total devices in {elapsed:.2f}s "
                f"(max_workers={self._executor._max_workers})"
            )

    def run(self) -> None:
        """Continuous polling loop -- re-registers devices each cycle to pick up changes."""
        logger.info("Starting NMS service (InfraScope shared-DB mode, concurrent polling)")

        try:
            while True:
                try:
                    # Re-read devices on every cycle to pick up newly added devices
                    self.register_devices_from_db()

                    if self.poller.sessions:
                        self.poll_cycle()
                    else:
                        logger.info("No polling-enabled devices registered yet, sleeping...")

                    # Short sleep -- per-device throttle controls actual poll frequency
                    time.sleep(config.polling.interface_poll_interval)

                except KeyboardInterrupt:
                    logger.info("Keyboard interrupt received, shutting down")
                    break
                except Exception as e:
                    logger.error(f"Polling loop error: {e}")
                    time.sleep(5)

        finally:
            self.shutdown()

    def shutdown(self) -> None:
        """Graceful shutdown"""
        logger.info("Shutting down NMS service")
        try:
            self._executor.shutdown(wait=False, cancel_futures=True)
            self.poller.close_all()
            self.ssh_poller.close_all()
            db_manager.close()
            logger.info("NMS service shutdown complete")
        except Exception as e:
            logger.error(f"Shutdown error: {e}")


def main():
    """Entry point for background polling worker"""
    try:
        config.validate()
        orchestrator = NMSOrchestrator()
        orchestrator.run()
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        exit(1)


if __name__ == "__main__":
    main()
