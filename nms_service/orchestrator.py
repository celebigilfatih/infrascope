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
from concurrent.futures import ThreadPoolExecutor, wait as futures_wait
from typing import Dict, Optional
from datetime import datetime

from nms_service.core.logger import logger
from nms_service.core.config import config
from nms_service.snmp.poller import SNMPPoller, DeviceConfig
from nms_service.ssh.poller import SSHPoller, SSHDeviceConfig
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
        # Set default SSH credentials from environment
        ssh_username = getattr(config, 'ssh_username', 'admin')
        ssh_password = getattr(config, 'ssh_password', 'admin')
        if ssh_username and ssh_password:
            self.ssh_poller.set_default_credentials(ssh_username, ssh_password)
        # nms_device_id (int) -> Device record
        self.device_map: Dict[int, Device] = {}
        self.last_topology_poll: Dict[int, datetime] = {}
        self.last_device_poll: Dict[int, datetime] = {}  # per-device interval throttle
        self._topo_lock = threading.Lock()       # protects last_topology_poll
        self._last_poll_lock = threading.Lock()  # protects last_device_poll
        # Persistent thread pool — avoids ThreadPoolExecutor.__exit__ blocking
        self._executor = ThreadPoolExecutor(
            max_workers=config.snmp.max_concurrent_pollers,
        )
        logger.info("NMS Orchestrator initialized (concurrent polling mode with SSH fallback)")

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

                # Detect vendor from device name for OID selection
                vendor = self._detect_vendor(device.name)

                # Register for SNMP polling
                device_cfg = DeviceConfig(
                    device_id=device.nms_device_id,
                    device_name=device.name,
                    ip_address=device.management_ip,
                    community_string=device.snmp_community or "public",
                    vendor=vendor,
                    snmp_port=device.snmp_port or 161,
                    snmp_version=device.snmp_version or "2c",
                    enabled=device.polling_enabled,
                )
                self.poller.register_device(device_cfg)
                
                # Register for SSH polling (fallback)
                ssh_cfg = SSHDeviceConfig(
                    device_id=device.nms_device_id,
                    device_name=device.name,
                    ip_address=device.management_ip,
                    username=device.ssh_username or "admin",
                    password=device.ssh_password or "",
                    port=device.ssh_port or 22,
                    vendor=vendor,
                    enabled=device.polling_enabled,
                )
                self.ssh_poller.register_device(ssh_cfg)
                
                self.device_map[device.nms_device_id] = device
                count += 1

            session.close()
            logger.info(f"Registered {count} polling-enabled devices from InfraScope DB (SNMP + SSH)")
            return count

        except Exception as e:
            logger.error(f"Failed to register devices from DB: {e}")
            return 0

    def _detect_vendor(self, device_name: str) -> str:
        """Infer SNMP vendor from device name for OID selection"""
        name_lower = device_name.lower()
        if "cisco" in name_lower:
            return "cisco"
        if "fortinet" in name_lower or "fortigate" in name_lower:
            return "fortinet"
        if "mikrotik" in name_lower:
            return "mikrotik"
        return "generic"

    def _poll_single_device(self, nms_device_id: int) -> bool:
        """Poll one device in a thread-pool worker.

        Each call gets its own DB session (SQLAlchemy sessions are NOT thread-safe).
        Tries SNMP first, falls back to SSH if SNMP fails.
        Returns True if device was polled, False if skipped (interval not yet reached).
        """
        snmp_session = self.poller.sessions.get(nms_device_id)
        ssh_session = self.ssh_poller.sessions.get(nms_device_id)
        
        if not snmp_session and not ssh_session:
            return False

        device_name = snmp_session.device_name if snmp_session else (ssh_session.device_name if ssh_session else "Unknown")
        device = self.device_map.get(nms_device_id)
        polling_interval = (device.polling_interval or 300) if device else 300

        # Per-device interval throttle -- respect each device's own polling_interval
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
                except Exception as e:
                    logger.error(f"SSH interface poll failed for {device_name}: {e}")
            
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
                    vendor = self._detect_vendor(device.name) if device else "generic"
                    health = self.poller.poll_device_health(nms_device_id, vendor)
                    if health:
                        logger.info(f"SNMP: Polled health for {device_name}")
                except Exception as e:
                    logger.warning(f"SNMP health poll failed for {device_name}: {e}")
                    snmp_health_failed = True
            
            # SSH fallback if SNMP failed or not available
            if (snmp_health_failed or not snmp_session or not health) and ssh_session:
                try:
                    vendor = self._detect_vendor(device.name) if device else "generic"
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

        # Log timed-out devices (they'll finish in background)
        if not_done:
            names = []
            for future in not_done:
                did = future_map[future]
                device = self.device_map.get(did)
                names.append(device.name if device else str(did))
            logger.warning(f"Poll timeout (>{MAX_CYCLE_SECONDS}s): {', '.join(names)}")

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
