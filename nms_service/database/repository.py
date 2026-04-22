"""Repository layer for InfraScope-integrated NMS

All nms_* tables use nms_device_id (Int) as the link to Device,
NOT device.id (String CUID). The NMS integer ID is the bridge key.

oper_up_since tracking: Records when a port was last seen oper-up.
Used by the detection engine to distinguish "always been down" from
"was working, now down" (the latter should generate alarms).
"""

from typing import List, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import desc, and_, text

from nms_service.core.logger import logger
from nms_service.database.models import (
    Device,
    NmsInterface,
    NmsHealthMetric,
    NmsTopologyLink,
    NmsDiscoveryScan,
    NmsDiscoveredDevice,
    cuid,
)


class DeviceRepository:
    """Read polling-enabled InfraScope devices"""

    def __init__(self, session: Session):
        self.session = session

    def get_all_polling_enabled(self) -> List[Device]:
        """Return devices with polling_enabled=True and nms_device_id set"""
        return self.session.query(Device).filter(
            and_(
                Device.nms_device_id.isnot(None),
                Device.polling_enabled == True,
                Device.management_ip.isnot(None),
            )
        ).all()

    def get_by_nms_id(self, nms_device_id: int) -> Optional[Device]:
        """Get device by NMS integer ID"""
        return self.session.query(Device).filter(
            Device.nms_device_id == nms_device_id
        ).first()

    def update_last_polled(self, nms_device_id: int) -> bool:
        """Update last_polled_at timestamp"""
        try:
            device = self.get_by_nms_id(nms_device_id)
            if device:
                device.last_polled_at = datetime.utcnow()
                self.session.commit()
                return True
            return False
        except Exception as e:
            self.session.rollback()
            logger.error(f"Failed to update last_polled_at for nms_id={nms_device_id}: {e}")
            return False


class MetricsRepository:
    """Write SNMP metrics to nms_* tables"""

    def __init__(self, session: Session):
        self.session = session

    def save_interface_metrics(
        self,
        nms_device_id: int,
        interface_index: int,
        interface_name: str,
        description: str,
        admin_status: str,
        oper_status: str,
        speed: int,
        in_octets: int,
        out_octets: int,
        in_errors: int = 0,
        out_errors: int = 0,
        mtu: int = 1500,
    ) -> NmsInterface:
        """Upsert interface state into nms_interfaces.
        
        Uses ON CONFLICT on (nms_device_id, interface_index) to update
        existing row rather than inserting duplicates.
        """
        try:
            now = datetime.utcnow()
            self.session.execute(
                text("""
                    INSERT INTO nms_interfaces
                        (id, nms_device_id, interface_index, interface_name, description,
                         admin_status, oper_status, speed, in_octets, out_octets,
                         in_errors, out_errors, mtu, down_since, oper_up_since,
                         last_polled_at, created_at, updated_at)
                    VALUES
                        (:id, :nms_device_id, :interface_index, :interface_name, :description,
                         :admin_status, :oper_status, :speed, :in_octets, :out_octets,
                         :in_errors, :out_errors, :mtu, :down_since, :oper_up_since,
                         :now, :now, :now)
                    ON CONFLICT (nms_device_id, interface_index) DO UPDATE SET
                        interface_name = EXCLUDED.interface_name,
                        description = EXCLUDED.description,
                        admin_status = EXCLUDED.admin_status,
                        oper_status = EXCLUDED.oper_status,
                        speed = EXCLUDED.speed,
                        in_octets = EXCLUDED.in_octets,
                        out_octets = EXCLUDED.out_octets,
                        in_errors = EXCLUDED.in_errors,
                        out_errors = EXCLUDED.out_errors,
                        mtu = EXCLUDED.mtu,
                        down_since = CASE
                            WHEN nms_interfaces.oper_status = 'up' AND EXCLUDED.oper_status = 'down'
                                THEN EXCLUDED.last_polled_at
                            WHEN EXCLUDED.oper_status = 'up'
                                THEN NULL
                            WHEN nms_interfaces.down_since IS NULL AND EXCLUDED.oper_status = 'down'
                                THEN EXCLUDED.last_polled_at
                            ELSE nms_interfaces.down_since
                        END,
                        oper_up_since = CASE
                            WHEN EXCLUDED.oper_status = 'up'
                                THEN EXCLUDED.last_polled_at
                            ELSE nms_interfaces.oper_up_since
                        END,
                        last_polled_at = EXCLUDED.last_polled_at,
                        updated_at = EXCLUDED.updated_at
                """),
                {
                    "id": cuid(),
                    "nms_device_id": nms_device_id,
                    "interface_index": interface_index,
                    "interface_name": interface_name,
                    "description": description,
                    "admin_status": admin_status,
                    "oper_status": oper_status,
                    "speed": speed,
                    "in_octets": in_octets,
                    "out_octets": out_octets,
                    "in_errors": in_errors,
                    "out_errors": out_errors,
                    "mtu": mtu,
                    "down_since": now if oper_status == 'down' else None,
                    "oper_up_since": now if oper_status == 'up' else None,
                    "now": now,
                },
            )
            self.session.commit()
            logger.debug(f"Upserted interface {interface_index} for nms_device_id={nms_device_id}")
        except Exception as e:
            self.session.rollback()
            logger.error(f"Failed to save interface metrics for nms_device_id={nms_device_id}: {e}")
            raise

    def save_health_metrics(
        self,
        nms_device_id: int,
        uptime_seconds: int,
        cpu_usage: Optional[float] = None,
        memory_usage: Optional[float] = None,
        temperature: Optional[float] = None,
    ) -> None:
        """Insert new health metric row into nms_health_metrics (time series)"""
        try:
            now = datetime.utcnow()
            metric = NmsHealthMetric(
                id=cuid(),
                nms_device_id=nms_device_id,
                uptime_seconds=uptime_seconds,
                cpu_usage=cpu_usage,
                memory_usage=memory_usage,
                temperature=temperature,
                collected_at=now,
                created_at=now,
            )
            self.session.add(metric)
            self.session.commit()
            logger.debug(
                f"Saved health metric for nms_device_id={nms_device_id}: "
                f"CPU={cpu_usage}% MEM={memory_usage}%"
            )
        except Exception as e:
            self.session.rollback()
            logger.error(f"Failed to save health metrics for nms_device_id={nms_device_id}: {e}")
            raise

    def get_latest_health(self, nms_device_id: int, limit: int = 10) -> List[NmsHealthMetric]:
        return self.session.query(NmsHealthMetric).filter(
            NmsHealthMetric.nms_device_id == nms_device_id
        ).order_by(desc(NmsHealthMetric.collected_at)).limit(limit).all()

    def get_interface_state(self, nms_device_id: int) -> List[NmsInterface]:
        return self.session.query(NmsInterface).filter(
            NmsInterface.nms_device_id == nms_device_id
        ).all()


class TopologyRepository:
    """Topology link upserts"""

    def __init__(self, session: Session):
        self.session = session

    def save_neighbor(
        self,
        nms_device_id: int,
        local_interface: str,
        remote_device_name: str,
        remote_interface: str,
        protocol: str = "lldp",
    ) -> None:
        """Upsert topology link in nms_topology_links"""
        try:
            now = datetime.utcnow()
            self.session.execute(
                text("""
                    INSERT INTO nms_topology_links
                        (id, nms_device_id, local_interface, remote_device_name,
                         remote_interface, protocol, last_seen_at, created_at, updated_at)
                    VALUES
                        (:id, :nms_device_id, :local_interface, :remote_device_name,
                         :remote_interface, :protocol, :now, :now, :now)
                    ON CONFLICT (nms_device_id, local_interface, remote_device_name) DO UPDATE SET
                        remote_interface = EXCLUDED.remote_interface,
                        protocol = EXCLUDED.protocol,
                        last_seen_at = EXCLUDED.last_seen_at,
                        updated_at = EXCLUDED.updated_at
                """),
                {
                    "id": cuid(),
                    "nms_device_id": nms_device_id,
                    "local_interface": local_interface,
                    "remote_device_name": remote_device_name,
                    "remote_interface": remote_interface,
                    "protocol": protocol,
                    "now": now,
                },
            )
            self.session.commit()
        except Exception as e:
            self.session.rollback()
            logger.error(f"Failed to save topology neighbor: {e}")
            raise

    def get_all(self) -> List[NmsTopologyLink]:
        return self.session.query(NmsTopologyLink).all()
