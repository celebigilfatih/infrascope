"""Vendor-agnostic SNMP OID mapping

Maps OIDs to human-readable metric names. Supports multiple vendors:
- Generic (standard SNMP MIBs)
- Cisco (CISCO-PROCESS-MIB, etc.)
- Fortinet (FortiGate)
- MikroTik

Adding a new vendor requires editing only this file.
"""

import json
from pathlib import Path
from typing import Dict, Optional, List, Any
from dataclasses import dataclass, asdict


@dataclass
class OIDMapping:
    """OID mapping configuration"""
    oid: str
    name: str
    description: str
    metric_type: str  # "gauge", "counter", "string", "bits"
    unit: Optional[str] = None
    vendor: Optional[str] = None  # "generic", "cisco", "fortinet", "mikrotik"
    conversion_factor: float = 1.0  # For unit conversion (e.g., ticks to seconds)


class VendorOIDManager:
    """Manage vendor-specific and generic OID mappings"""
    
    # Generic (standard RFC MIBs)
    GENERIC_OIDS = {
        # System
        "1.3.6.1.2.1.1.1.0": OIDMapping(
            oid="1.3.6.1.2.1.1.1.0",
            name="sysDescr",
            description="System description",
            metric_type="string",
            vendor="generic"
        ),
        "1.3.6.1.2.1.1.3.0": OIDMapping(
            oid="1.3.6.1.2.1.1.3.0",
            name="sysUpTime",
            description="System uptime in ticks (10ms)",
            metric_type="counter",
            unit="ticks",
            conversion_factor=0.01,  # Convert to seconds
            vendor="generic"
        ),
        "1.3.6.1.2.1.1.5.0": OIDMapping(
            oid="1.3.6.1.2.1.1.5.0",
            name="sysName",
            description="System name (hostname)",
            metric_type="string",
            vendor="generic"
        ),
        
        # Interface table (IF-MIB)
        "1.3.6.1.2.1.2.2.1.1": OIDMapping(
            oid="1.3.6.1.2.1.2.2.1.1",
            name="ifIndex",
            description="Interface index",
            metric_type="gauge",
            vendor="generic"
        ),
        "1.3.6.1.2.1.2.2.1.2": OIDMapping(
            oid="1.3.6.1.2.1.2.2.1.2",
            name="ifDescr",
            description="Interface description",
            metric_type="string",
            vendor="generic"
        ),
        "1.3.6.1.2.1.2.2.1.3": OIDMapping(
            oid="1.3.6.1.2.1.2.2.1.3",
            name="ifType",
            description="Interface type",
            metric_type="gauge",
            vendor="generic"
        ),
        "1.3.6.1.2.1.2.2.1.5": OIDMapping(
            oid="1.3.6.1.2.1.2.2.1.5",
            name="ifSpeed",
            description="Interface speed in bits per second",
            metric_type="gauge",
            unit="bps",
            vendor="generic"
        ),
        "1.3.6.1.2.1.2.2.1.7": OIDMapping(
            oid="1.3.6.1.2.1.2.2.1.7",
            name="ifAdminStatus",
            description="Interface administrative status (1=up, 2=down, 3=testing)",
            metric_type="gauge",
            vendor="generic"
        ),
        "1.3.6.1.2.1.2.2.1.8": OIDMapping(
            oid="1.3.6.1.2.1.2.2.1.8",
            name="ifOperStatus",
            description="Interface operational status (1=up, 2=down, 3=testing)",
            metric_type="gauge",
            vendor="generic"
        ),
        "1.3.6.1.2.1.2.2.1.10": OIDMapping(
            oid="1.3.6.1.2.1.2.2.1.10",
            name="ifInOctets",
            description="Octets received on the interface",
            metric_type="counter",
            unit="octets",
            vendor="generic"
        ),
        "1.3.6.1.2.1.2.2.1.16": OIDMapping(
            oid="1.3.6.1.2.1.2.2.1.16",
            name="ifOutOctets",
            description="Octets sent on the interface",
            metric_type="counter",
            unit="octets",
            vendor="generic"
        ),
        
        # LLDP (LLDP-MIB)
        "1.3.6.1.2.1.88.1.4.1.1.7": OIDMapping(
            oid="1.3.6.1.2.1.88.1.4.1.1.7",
            name="lldpRemPortId",
            description="LLDP remote port ID",
            metric_type="string",
            vendor="generic"
        ),
        "1.3.6.1.2.1.88.1.4.1.1.9": OIDMapping(
            oid="1.3.6.1.2.1.88.1.4.1.1.9",
            name="lldpRemSysName",
            description="LLDP remote system name",
            metric_type="string",
            vendor="generic"
        ),
    }
    
    # Cisco-specific OIDs
    CISCO_OIDS = {
        # CPU usage (CISCO-PROCESS-MIB)
        "1.3.6.1.4.1.9.9.109.1.1.1.1.3": OIDMapping(
            oid="1.3.6.1.4.1.9.9.109.1.1.1.1.3",
            name="cpmCPUTotal5sec",
            description="Cisco CPU usage 5-second average",
            metric_type="gauge",
            unit="%",
            vendor="cisco"
        ),
        "1.3.6.1.4.1.9.9.109.1.1.1.1.5": OIDMapping(
            oid="1.3.6.1.4.1.9.9.109.1.1.1.1.5",
            name="cpmCPUTotal1min",
            description="Cisco CPU usage 1-minute average",
            metric_type="gauge",
            unit="%",
            vendor="cisco"
        ),
        
        # Memory usage (CISCO-MEMORY-POOL-MIB)
        "1.3.6.1.4.1.9.9.48.1.1.1.5": OIDMapping(
            oid="1.3.6.1.4.1.9.9.48.1.1.1.5",
            name="ciscoMemoryPoolUsed",
            description="Cisco memory pool used",
            metric_type="gauge",
            unit="bytes",
            vendor="cisco"
        ),
        "1.3.6.1.4.1.9.9.48.1.1.1.6": OIDMapping(
            oid="1.3.6.1.4.1.9.9.48.1.1.1.6",
            name="ciscoMemoryPoolFree",
            description="Cisco memory pool free",
            metric_type="gauge",
            unit="bytes",
            vendor="cisco"
        ),
        
        # Temperature (CISCO-ENVMON-MIB)
        "1.3.6.1.4.1.9.9.13.1.3.1.3": OIDMapping(
            oid="1.3.6.1.4.1.9.9.13.1.3.1.3",
            name="ciscoEnvMonTemperatureValue",
            description="Temperature reading in Celsius",
            metric_type="gauge",
            unit="celsius",
            vendor="cisco"
        ),
        
        # CDP (CISCO-CDP-MIB)
        "1.3.6.1.4.1.9.9.23.1.2.1.1.6": OIDMapping(
            oid="1.3.6.1.4.1.9.9.23.1.2.1.1.6",
            name="cdpCacheDeviceId",
            description="CDP remote device ID",
            metric_type="string",
            vendor="cisco"
        ),
        "1.3.6.1.4.1.9.9.23.1.2.1.1.7": OIDMapping(
            oid="1.3.6.1.4.1.9.9.23.1.2.1.1.7",
            name="cdpCacheDevicePort",
            description="CDP remote device port",
            metric_type="string",
            vendor="cisco"
        ),
    }
    
    # Fortinet (FortiGate) specific OIDs
    FORTINET_OIDS = {
        # CPU usage
        "1.3.6.1.4.1.12356.101.13.2.1.1.2": OIDMapping(
            oid="1.3.6.1.4.1.12356.101.13.2.1.1.2",
            name="fgSysCpuUsage",
            description="FortiGate CPU usage",
            metric_type="gauge",
            unit="%",
            vendor="fortinet"
        ),
        
        # Memory usage
        "1.3.6.1.4.1.12356.101.13.2.1.2.1": OIDMapping(
            oid="1.3.6.1.4.1.12356.101.13.2.1.2.1",
            name="fgSysMemUsage",
            description="FortiGate memory usage",
            metric_type="gauge",
            unit="%",
            vendor="fortinet"
        ),
        
        # Temperature
        "1.3.6.1.4.1.12356.101.13.2.1.3.1": OIDMapping(
            oid="1.3.6.1.4.1.12356.101.13.2.1.3.1",
            name="fgSysTemperature",
            description="FortiGate temperature",
            metric_type="gauge",
            unit="celsius",
            vendor="fortinet"
        ),
    }
    
    # MikroTik specific OIDs
    MIKROTIK_OIDS = {
        # CPU usage
        "1.3.6.1.4.1.14988.1.1.3.2": OIDMapping(
            oid="1.3.6.1.4.1.14988.1.1.3.2",
            name="mtxrHlCpuLoad",
            description="MikroTik CPU load percentage",
            metric_type="gauge",
            unit="%",
            vendor="mikrotik"
        ),
        
        # Memory usage
        "1.3.6.1.4.1.14988.1.1.3.3": OIDMapping(
            oid="1.3.6.1.4.1.14988.1.1.3.3",
            name="mtxrHlMemSize",
            description="MikroTik total memory",
            metric_type="gauge",
            unit="bytes",
            vendor="mikrotik"
        ),
        "1.3.6.1.4.1.14988.1.1.3.4": OIDMapping(
            oid="1.3.6.1.4.1.14988.1.1.3.4",
            name="mtxrHlMemFree",
            description="MikroTik free memory",
            metric_type="gauge",
            unit="bytes",
            vendor="mikrotik"
        ),
    }
    
    def __init__(self):
        """Initialize OID manager with all vendor mappings"""
        self._oid_map: Dict[str, OIDMapping] = {}
        self._name_to_oid: Dict[str, str] = {}
        
        # Load all vendors
        self._register_oids(self.GENERIC_OIDS)
        self._register_oids(self.CISCO_OIDS)
        self._register_oids(self.FORTINET_OIDS)
        self._register_oids(self.MIKROTIK_OIDS)
    
    def _register_oids(self, oid_dict: Dict[str, OIDMapping]) -> None:
        """Register OID mappings"""
        for oid, mapping in oid_dict.items():
            self._oid_map[oid] = mapping
            self._name_to_oid[mapping.name] = oid
    
    def get_oid_by_name(self, name: str) -> Optional[str]:
        """Get OID by metric name"""
        return self._name_to_oid.get(name)
    
    def get_mapping_by_oid(self, oid: str) -> Optional[OIDMapping]:
        """Get OID mapping by OID"""
        return self._oid_map.get(oid)
    
    def get_mapping_by_name(self, name: str) -> Optional[OIDMapping]:
        """Get OID mapping by metric name"""
        oid = self.get_oid_by_name(name)
        return self._oid_map.get(oid) if oid else None
    
    def get_interface_oids(self) -> Dict[str, OIDMapping]:
        """Get all interface-related OIDs (generic)"""
        return {
            k: v for k, v in self._oid_map.items()
            if "if" in v.name.lower() and v.vendor == "generic"
        }
    
    def get_health_oids_for_vendor(self, vendor: str) -> Dict[str, OIDMapping]:
        """Get health/resource OIDs for specific vendor"""
        vendor_lower = vendor.lower()
        return {
            k: v for k, v in self._oid_map.items()
            if v.vendor == vendor_lower and any(
                x in v.name.lower() for x in ["cpu", "mem", "temp"]
            )
        }
    
    def get_all_oids_for_vendor(self, vendor: str) -> Dict[str, OIDMapping]:
        """Get all OIDs available for a vendor"""
        vendor_lower = vendor.lower()
        return {
            k: v for k, v in self._oid_map.items()
            if v.vendor == vendor_lower or v.vendor == "generic"
        }
    
    def to_json(self, output_path: Optional[Path] = None) -> str:
        """Serialize OID mappings to JSON"""
        oid_dicts = {
            oid: {
                "oid": mapping.oid,
                "name": mapping.name,
                "description": mapping.description,
                "metric_type": mapping.metric_type,
                "unit": mapping.unit,
                "vendor": mapping.vendor,
                "conversion_factor": mapping.conversion_factor,
            }
            for oid, mapping in self._oid_map.items()
        }
        
        json_str = json.dumps(oid_dicts, indent=2)
        
        if output_path:
            Path(output_path).write_text(json_str)
        
        return json_str
    
    @classmethod
    def from_json(cls, json_path: Path) -> "VendorOIDManager":
        """Load OID mappings from JSON file"""
        manager = cls()
        
        if not json_path.exists():
            return manager
        
        data = json.loads(json_path.read_text())
        manager._oid_map.clear()
        manager._name_to_oid.clear()
        
        for oid, config in data.items():
            mapping = OIDMapping(
                oid=config["oid"],
                name=config["name"],
                description=config["description"],
                metric_type=config["metric_type"],
                unit=config.get("unit"),
                vendor=config.get("vendor"),
                conversion_factor=config.get("conversion_factor", 1.0),
            )
            manager._oid_map[oid] = mapping
            manager._name_to_oid[mapping.name] = oid
        
        return manager


# Global OID manager instance
oid_manager = VendorOIDManager()
