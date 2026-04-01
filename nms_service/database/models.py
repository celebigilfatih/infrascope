"""SQLAlchemy models mapping to InfraScope's PostgreSQL tables

CRITICAL: These models MUST exactly match the Prisma schema.
Mismatch causes FK violations or data corruption.

Key facts:
- NmsInterface/NmsHealthMetric/NmsTopologyLink all use nms_device_id (Int)
  as FK pointing to devices.nms_device_id (unique non-PK column)
- PKs for all nms_* records are String CUIDs (generated via Python uuid4)
- NmsDiscoveryScan uses String CUID PK (not user-provided string)
- NmsInterface is UPSERTED (unique on nms_device_id + interface_index)
"""

import uuid
from datetime import datetime
from sqlalchemy import (
    Column,
    Integer,
    BigInteger,
    String,
    Float,
    Boolean,
    DateTime,
    Text,
    JSON,
    Index,
    UniqueConstraint,
    ForeignKey,
    create_engine,
)
from sqlalchemy.orm import declarative_base, sessionmaker, Session

from nms_service.core.config import config

Base = declarative_base()


def cuid() -> str:
    """Generate a UUID4-based unique ID (compatible with Prisma CUID role)"""
    return str(uuid.uuid4())


class Device(Base):
    """InfraScope Device — partial mapping to `devices` table.
    
    Prisma manages the full schema. Only NMS-relevant columns are declared here.
    """
    __tablename__ = "devices"
    __table_args__ = {"extend_existing": True}

    id = Column(String, primary_key=True)
    name = Column(String(255), nullable=False)
    # nms_device_id is an integer assigned when linking a device to NMS polling
    nms_device_id = Column(Integer, unique=True, nullable=True)
    management_ip = Column(String(45), nullable=True)
    snmp_community = Column(String(255), nullable=True)
    snmp_version = Column(String(10), default="2c")
    snmp_port = Column(Integer, default=161)
    polling_enabled = Column(Boolean, default=False)
    polling_interval = Column(Integer, default=30)
    last_polled_at = Column(DateTime, nullable=True)


class NmsInterface(Base):
    """Current SNMP interface state — `nms_interfaces` table.
    
    Upserted every poll cycle (unique on nms_device_id + interface_index).
    References devices.nms_device_id (Int unique FK, not devices.id).
    """
    __tablename__ = "nms_interfaces"
    __table_args__ = (
        UniqueConstraint("nms_device_id", "interface_index", name="nms_interfaces_nms_device_id_interface_index_key"),
        Index("idx_nms_iface_device_id", "nms_device_id"),
        Index("idx_nms_iface_status", "admin_status", "oper_status"),
    )

    id = Column(String, primary_key=True, default=cuid)
    # FK to devices.nms_device_id (unique integer, not PK)
    nms_device_id = Column(Integer, nullable=False)
    interface_index = Column(Integer, nullable=False)
    interface_name = Column(String(255), nullable=False)
    description = Column(String(255), nullable=True)
    admin_status = Column(String(10), nullable=False)   # "up" | "down"
    oper_status = Column(String(10), nullable=False)    # "up" | "down"
    speed = Column(BigInteger, default=0)
    in_octets = Column(BigInteger, default=0)
    out_octets = Column(BigInteger, default=0)
    in_errors = Column(Integer, default=0)
    out_errors = Column(Integer, default=0)
    mtu = Column(Integer, default=1500)
    last_polled_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class NmsHealthMetric(Base):
    """SNMP health metrics time series — `nms_health_metrics` table.
    
    New row inserted on each poll (time series).
    References devices.nms_device_id.
    """
    __tablename__ = "nms_health_metrics"
    __table_args__ = (
        Index("idx_nms_health_device_collected", "nms_device_id", "collected_at"),
        Index("idx_nms_health_collected", "collected_at"),
    )

    id = Column(String, primary_key=True, default=cuid)
    nms_device_id = Column(Integer, nullable=False)
    uptime_seconds = Column(Integer, nullable=True)
    cpu_usage = Column(Float, nullable=True)
    memory_usage = Column(Float, nullable=True)
    temperature = Column(Float, nullable=True)
    collected_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)


class NmsTopologyLink(Base):
    """SNMP topology links (LLDP/CDP) — `nms_topology_links` table.
    
    Upserted on each topology poll (unique on nms_device_id + localInterface + remoteDeviceName).
    References devices.nms_device_id.
    """
    __tablename__ = "nms_topology_links"
    __table_args__ = (
        UniqueConstraint("nms_device_id", "local_interface", "remote_device_name",
                         name="nms_topology_links_nms_device_id_local_interface_remote_device_name_key"),
        Index("idx_nms_topo_device_id", "nms_device_id"),
    )

    id = Column(String, primary_key=True, default=cuid)
    nms_device_id = Column(Integer, nullable=False)
    local_interface = Column(String(255), nullable=False)
    remote_device_name = Column(String(255), nullable=False)
    remote_interface = Column(String(255), nullable=False)
    protocol = Column(String(20), default="lldp")
    last_seen_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class NmsDiscoveryScan(Base):
    """Network discovery scan job — `nms_discovery_scans` table.
    
    PK is a CUID String (auto-generated by Prisma default on INSERT,
    or by Python uuid4 when inserted from Python).
    """
    __tablename__ = "nms_discovery_scans"
    __table_args__ = (
        Index("idx_nms_scan_status", "status"),
        Index("idx_nms_scan_created", "created_at"),
    )

    id = Column(String, primary_key=True, default=cuid)
    cidr = Column(String(100), nullable=False)
    status = Column(String(20), default="pending")   # pending | running | completed | failed
    total_hosts = Column(Integer, default=0)
    processed_hosts = Column(Integer, default=0)
    found_devices = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class NmsDiscoveredDevice(Base):
    """Devices found during discovery scan — `nms_discovered_devices` table.
    
    FK to nms_discovery_scans.id (String CUID).
    Unique on (scan_id, ip_address).
    """
    __tablename__ = "nms_discovered_devices"
    __table_args__ = (
        UniqueConstraint("scan_id", "ip_address", name="nms_discovered_devices_scan_id_ip_address_key"),
        Index("idx_nms_disc_scan_id", "scan_id"),
        Index("idx_nms_disc_ip", "ip_address"),
    )

    id = Column(String, primary_key=True, default=cuid)
    scan_id = Column(String, ForeignKey("nms_discovery_scans.id", ondelete="CASCADE"), nullable=False)
    ip_address = Column(String(45), nullable=False)
    hostname = Column(String(255), nullable=True)
    vendor = Column(String(50), default="Generic")
    snmp_community = Column(String(255), nullable=True)
    sys_descr = Column(Text, nullable=True)
    snmp_status = Column(String(20), default="none")    # success | failed | none
    ssh_status = Column(String(20), default="none")     # success | failed | open | closed | none
    imported = Column(Boolean, default=False)
    imported_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class DatabaseManager:
    """Manage database connection and sessions"""

    def __init__(self):
        self.engine = create_engine(
            config.database.connection_string,
            pool_size=config.database.pool_size,
            max_overflow=config.database.max_overflow,
            echo=config.debug,
        )
        self.SessionLocal = sessionmaker(bind=self.engine)

    def init_db(self) -> None:
        """Prisma manages schema — this is a no-op.
        
        Do NOT call Base.metadata.create_all() as it would try to re-create
        tables that Prisma already manages, causing constraint conflicts.
        """
        pass

    def get_session(self) -> Session:
        """Get a new database session"""
        return self.SessionLocal()

    def close(self) -> None:
        """Close database connection"""
        self.engine.dispose()


# Global database manager instance
db_manager = DatabaseManager()
