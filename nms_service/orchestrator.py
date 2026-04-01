"""NMS Orchestrator for InfraScope

Reads polling-enabled devices from InfraScope's PostgreSQL, polls them
via SNMP, and writes metrics directly to nms_* tables.

NO alarm evaluation here — TypeScript detection-engine.ts handles that.
NO HTTP client — direct DB writes only.
"""

import time
from typing import Dict, Optional
from datetime import datetime, timedelta

from nms_service.core.logger import logger
from nms_service.core.config import config
from nms_service.snmp.poller import SNMPPoller, DeviceConfig
from nms_service.database.models import db_manager, Device
from nms_service.database.repository import (
    DeviceRepository,
    MetricsRepository,
    TopologyRepository,
)


class NMSOrchestrator:
    """Main NMS service orchestrator for InfraScope"""

    def __init__(self):
        self.poller = SNMPPoller()
        # nms_device_id (int) → Device record
        self.device_map: Dict[int, Device] = {}
        self.last_topology_poll: Dict[int, datetime] = {}
        logger.info("NMS Orchestrator initialized (InfraScope shared-DB mode)")

    def register_devices_from_db(self) -> int:
        """Load polling-enabled devices from InfraScope DB.
        
        Queries devices WHERE nms_device_id IS NOT NULL AND polling_enabled = TRUE.
        Uses management_ip as the SNMP target and nms_device_id as the poller integer ID.
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
                self.device_map[device.nms_device_id] = device
                count += 1

            session.close()
            logger.info(f"Registered {count} polling-enabled devices from InfraScope DB")
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

    def poll_cycle(self) -> None:
        """Single polling cycle — collect and store SNMP metrics"""
        logger.debug("Starting NMS polling cycle")
        cycle_start = time.time()

        try:
            session = db_manager.get_session()
            metrics_repo = MetricsRepository(session)
            device_repo = DeviceRepository(session)

            for nms_device_id, snmp_session in list(self.poller.sessions.items()):
                device_name = snmp_session.device_name
                try:
                    # ── Interface polling ──────────────────────────────────
                    try:
                        interfaces = self.poller.poll_interfaces(nms_device_id)
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
                            logger.debug(f"Saved {len(interfaces)} interfaces for {device_name}")
                    except Exception as e:
                        logger.error(f"Interface poll failed for {device_name}: {e}")

                    # ── Health polling ─────────────────────────────────────
                    try:
                        device = self.device_map.get(nms_device_id)
                        vendor = self._detect_vendor(device.name) if device else "generic"
                        health = self.poller.poll_device_health(nms_device_id, vendor)
                        if health:
                            metrics_repo.save_health_metrics(
                                nms_device_id=nms_device_id,
                                uptime_seconds=health.uptime_seconds,
                                cpu_usage=health.cpu_usage,
                                memory_usage=health.memory_usage,
                                temperature=health.temperature,
                            )
                            logger.debug(
                                f"Saved health for {device_name}: "
                                f"CPU={health.cpu_usage}% MEM={health.memory_usage}%"
                            )
                    except Exception as e:
                        logger.error(f"Health poll failed for {device_name}: {e}")

                    # ── Topology polling (throttled) ────────────────────────
                    now = datetime.utcnow()
                    last_topo = self.last_topology_poll.get(nms_device_id)
                    topo_interval = timedelta(seconds=config.polling.topology_poll_interval)

                    if not last_topo or (now - last_topo) > topo_interval:
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
                                self.last_topology_poll[nms_device_id] = now
                                logger.info(f"Saved {len(topo_links)} topo links for {device_name}")
                        except Exception as e:
                            logger.error(f"Topology poll failed for {device_name}: {e}")

                    # ── Update last_polled_at ──────────────────────────────
                    device_repo.update_last_polled(nms_device_id)

                except Exception as e:
                    logger.error(f"Error polling device nms_id={nms_device_id}: {e}")

            session.close()

        except Exception as e:
            logger.error(f"Polling cycle failed: {e}")

        logger.debug(f"Polling cycle done in {time.time() - cycle_start:.2f}s")

    def run(self) -> None:
        """Continuous polling loop — re-registers devices each cycle to pick up changes"""
        logger.info("Starting NMS service (InfraScope shared-DB mode)")

        try:
            while True:
                try:
                    # Re-read devices on every cycle to pick up new SNMP-enabled devices
                    self.register_devices_from_db()

                    if self.poller.sessions:
                        self.poll_cycle()
                    else:
                        logger.info("No polling-enabled devices registered yet, sleeping...")

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
