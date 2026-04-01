"""Data models for SNMP metrics and alarms"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, Dict, Any
from enum import Enum


class AlarmSeverity(str, Enum):
    """Alarm severity levels"""
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class AlarmType(str, Enum):
    """Alarm classification types"""
    PORT_DOWN = "port_down"
    DEVICE_UNREACHABLE = "device_unreachable"
    CPU_HIGH = "cpu_high"
    MEMORY_HIGH = "memory_high"
    TEMPERATURE_HIGH = "temperature_high"
    FAN_FAILURE = "fan_failure"
    POWER_SUPPLY_FAILURE = "power_supply_failure"
    DEVICE_REACHABLE = "device_reachable"  # Recovery alarm
    PORT_UP = "port_up"  # Recovery alarm


class DeviceStatus(str, Enum):
    """Device connectivity status"""
    REACHABLE = "reachable"
    UNREACHABLE = "unreachable"
    UNKNOWN = "unknown"


@dataclass
class SNMPMetric:
    """Generic SNMP metric data structure"""
    oid: str
    value: Any
    timestamp: datetime = field(default_factory=datetime.utcnow)
    unit: Optional[str] = None
    
    def __repr__(self) -> str:
        return f"SNMPMetric(oid={self.oid}, value={self.value}, unit={self.unit})"


@dataclass
class InterfaceMetric:
    """Network interface metrics"""
    device_id: int
    interface_index: int
    interface_name: str
    description: str
    admin_status: str  # "up" or "down"
    oper_status: str   # "up" or "down"
    speed: int         # bps
    in_octets: int
    out_octets: int
    in_errors: int = 0
    out_errors: int = 0
    mtu: int = 1500
    timestamp: datetime = field(default_factory=datetime.utcnow)
    
    def is_port_down(self) -> bool:
        """Detect port down condition: admin=up, oper=down"""
        return self.admin_status.lower() == "up" and self.oper_status.lower() == "down"


@dataclass
class DeviceHealthMetric:
    """Device health and resource metrics"""
    device_id: int
    device_name: str
    uptime_seconds: int
    cpu_usage: Optional[float] = None  # percentage
    memory_usage: Optional[float] = None  # percentage
    temperature: Optional[float] = None  # celsius
    timestamp: datetime = field(default_factory=datetime.utcnow)


@dataclass
class DeviceInventory:
    """Hardware and inventory information"""
    device_id: int
    sys_descr: str
    serial_number: Optional[str] = None
    firmware_version: Optional[str] = None
    vendor: Optional[str] = None
    model: Optional[str] = None
    timestamp: datetime = field(default_factory=datetime.utcnow)


@dataclass
class TopologyMetric:
    """Network neighbor/link information"""
    local_device_id: int
    local_interface: str
    remote_device_name: str
    remote_interface: str
    remote_ip: Optional[str] = None
    protocol: str = "lldp"  # "lldp" or "cdp"
    timestamp: datetime = field(default_factory=datetime.utcnow)


@dataclass
class Alarm:
    """Alarm data structure for storage and display"""
    id: Optional[int] = None
    device_id: int = None
    device_name: Optional[str] = None
    type: AlarmType = None
    severity: AlarmSeverity = None
    message: str = ""
    acknowledged: bool = False
    created_at: datetime = field(default_factory=datetime.utcnow)
    acknowledged_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    metadata: Dict[str, Any] = field(default_factory=dict)  # vendor-specific data
    
    def __repr__(self) -> str:
        return (
            f"Alarm(id={self.id}, device_id={self.device_id}, "
            f"type={self.type}, severity={self.severity})"
        )


@dataclass
class PreviousState:
    """Track previous metric state for alarm comparison"""
    device_id: int
    metric_type: str  # "interface", "device_health", etc.
    metric_key: str   # interface_index or device_id
    state: Dict[str, Any]
    timestamp: datetime = field(default_factory=datetime.utcnow)
