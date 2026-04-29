"""SNMP polling engine for periodic data collection

Synchronous polling with async-ready architecture for scalability.
Supports multiple vendors and configurable polling intervals.
"""

from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from dataclasses import dataclass
import time

from nms_service.core.logger import logger
from nms_service.core.models import (
    InterfaceMetric,
    DeviceHealthMetric,
    DeviceInventory,
    SNMPMetric,
    TopologyMetric,
)
from nms_service.snmp.session import SNMPSession, SNMPError, SNMPDeviceUnreachable
from nms_service.snmp.vendor_oids import oid_manager


@dataclass
class DeviceConfig:
    """Device polling configuration"""
    device_id: int
    device_name: str
    ip_address: str
    community_string: str
    vendor: str  # "generic", "cisco", "fortinet", "mikrotik"
    snmp_port: int = 161
    snmp_version: str = "2c"
    enabled: bool = True
    
    # Poll intervals (override global defaults)
    interface_poll_interval: Optional[int] = None
    health_poll_interval: Optional[int] = None
    inventory_poll_interval: Optional[int] = None


def safe_int(val, default=0):
    if val is None: return default
    try:
        # Handle cases where val might be a string containing error message or OID value
        val_str = str(val).strip()
        if not val_str or any(c.isalpha() for c in val_str if c not in '.-'):
            return default
        return int(float(val_str))
    except (ValueError, TypeError):
        return default

def safe_float(val, default=0.0):
    if val is None: return default
    try:
        val_str = str(val).strip()
        if not val_str or any(c.isalpha() for c in val_str if c not in '.-'):
            return default
        return float(val_str)
    except (ValueError, TypeError):
        return default

class SNMPPoller:
    """Synchronous SNMP poller for collecting metrics
    
    Architecture supports async scaling:
    - Currently synchronous for < 50 devices
    - Ready for async/concurrent refactoring for > 50 devices
    - Distributed polling can be added by spawning multiple instances
    """
    
    def __init__(self):
        """Initialize SNMP poller"""
        self.sessions: Dict[int, SNMPSession] = {}
        self.last_poll_time: Dict[int, Dict[str, datetime]] = {}
    
    def register_device(self, config: DeviceConfig) -> None:
        """Register a device for polling (idempotent).

        Args:
            config: Device configuration
        """
        if not config.enabled:
            logger.info(f"Device {config.device_name} is disabled, skipping")
            return

        # Idempotent: skip if already registered with same connection parameters
        existing = self.sessions.get(config.device_id)
        if (
            existing is not None
            and existing.ip_address == config.ip_address
            and existing.community_string == config.community_string
            and existing.port == config.snmp_port
            and existing.version == (config.snmp_version or "2c")
        ):
            return  # nothing changed — keep existing session silently

        try:
            session = SNMPSession(
                device_id=config.device_id,
                device_name=config.device_name,
                ip_address=config.ip_address,
                community_string=config.community_string,
                version=config.snmp_version,
                port=config.snmp_port,
            )
            
            self.sessions[config.device_id] = session
            self.last_poll_time[config.device_id] = {}
            
            logger.info(
                f"Device registered: {config.device_name} "
                f"({config.ip_address}) - Vendor: {config.vendor}"
            )
        except Exception as e:
            logger.error(
                f"Failed to register device {config.device_name}: {e}"
            )
    
    def unregister_device(self, device_id: int) -> None:
        """Unregister a device
        
        Args:
            device_id: Device identifier
        """
        if device_id in self.sessions:
            self.sessions[device_id].close()
            del self.sessions[device_id]
            del self.last_poll_time[device_id]
            logger.info(f"Device {device_id} unregistered")
    
    def poll_interfaces(
        self,
        device_id: int,
    ) -> List[InterfaceMetric]:
        """Poll interface metrics for a device
        
        Args:
            device_id: Device identifier
            
        Returns:
            List of InterfaceMetric objects
        """
        if device_id not in self.sessions:
            logger.warning(f"Device {device_id} not registered")
            return []
        
        session = self.sessions[device_id]
        metrics = []
        
        try:
            # Walk the interface table
            interface_oids = oid_manager.get_interface_oids()
            
            # Get interface indices first
            indices = session.walk("1.3.6.1.2.1.2.2.1.1")
            logger.info(f"Found {len(indices)} interface indices for {session.device_name}")
            
            # Group OIDs to fetch by index to avoid massive get_multiple calls
            for index_oid, index_value in indices.items():
                try:
                    # The value of ifIndex is the integer index
                    iface_idx = int(index_value)
                    
                    # Instead of get_multiple for ALL interfaces, let's do it per-interface
                    # or in small batches. Per-interface is safer for slow devices.
                    oids_to_fetch = {
                        "descr": "1.3.6.1.2.1.2.2.1.2." + str(iface_idx),
                        "type": "1.3.6.1.2.1.2.2.1.3." + str(iface_idx),
                        "mtu": "1.3.6.1.2.1.2.2.1.4." + str(iface_idx),
                        "speed": "1.3.6.1.2.1.2.2.1.5." + str(iface_idx),
                        "admin_status": "1.3.6.1.2.1.2.2.1.7." + str(iface_idx),
                        "oper_status": "1.3.6.1.2.1.2.2.1.8." + str(iface_idx),
                        "in_octets": "1.3.6.1.2.1.2.2.1.10." + str(iface_idx),
                        "in_errors": "1.3.6.1.2.1.2.2.1.14." + str(iface_idx),
                        "out_octets": "1.3.6.1.2.1.2.2.1.16." + str(iface_idx),
                        "out_errors": "1.3.6.1.2.1.2.2.1.20." + str(iface_idx),
                    }
                    
                    values = session.get_multiple(list(oids_to_fetch.values()))
                    
                    admin_status_int = safe_int(values.get(oids_to_fetch["admin_status"]), 1)
                    oper_status_int = safe_int(values.get(oids_to_fetch["oper_status"]), 2)
                    
                    admin_status = "up" if admin_status_int == 1 else "down"
                    oper_status = "up" if oper_status_int == 1 else "down"
                    
                    metric = InterfaceMetric(
                        device_id=device_id,
                        interface_index=iface_idx,
                        interface_name=f"if{iface_idx}",
                        description=str(values.get(
                            oids_to_fetch["descr"], f"Interface {iface_idx}"
                        )),
                        admin_status=admin_status,
                        oper_status=oper_status,
                        speed=safe_int(values.get(oids_to_fetch["speed"])),
                        in_octets=safe_int(values.get(oids_to_fetch["in_octets"])),
                        out_octets=safe_int(values.get(oids_to_fetch["out_octets"])),
                        in_errors=safe_int(values.get(oids_to_fetch["in_errors"])),
                        out_errors=safe_int(values.get(oids_to_fetch["out_errors"])),
                        mtu=safe_int(values.get(oids_to_fetch["mtu"]), 1500),
                        timestamp=datetime.utcnow(),
                    )
                    
                    metrics.append(metric)
                    
                except (ValueError, TypeError, KeyError) as e:
                    logger.warning(
                        f"Failed to parse interface {iface_idx} metrics: {e}"
                    )
                    continue
            
            logger.info(
                f"Polled {len(metrics)} interfaces for device {device_id}"
            )
            
        except SNMPDeviceUnreachable as e:
            logger.warning(f"Device {device_id} unreachable: {e}")
        except Exception as e:
            logger.error(f"Interface polling failed for device {device_id}: {e}")
        
        return metrics
    
    def poll_device_health(
        self,
        device_id: int,
        vendor: str,
    ) -> Optional[DeviceHealthMetric]:
        """Poll device health metrics (CPU, memory, temperature)
        
        Args:
            device_id: Device identifier
            vendor: Vendor name for OID selection
            
        Returns:
            DeviceHealthMetric or None if failed
        """
        if device_id not in self.sessions:
            logger.warning(f"Device {device_id} not registered")
            return None
        
        session = self.sessions[device_id]
        
        try:
            # Get basic system info
            sys_name = session.get("1.3.6.1.2.1.1.5.0")
            uptime_ticks = session.get("1.3.6.1.2.1.1.3.0")
            
            if uptime_ticks is None:
                logger.warning(f"Could not get uptime for device {device_id}")
                return None
            
            uptime_seconds = int(int(uptime_ticks) * 0.01)  # Convert ticks to seconds
            
            # Get vendor-specific metrics
            cpu_usage = None
            memory_usage = None
            temperature = None
            
            if vendor.lower() == "cisco":
                # CPU OIDs to try (Table columns or indexed leaves)
                cpu_oids = [
                    "1.3.6.1.4.1.9.9.109.1.1.1.1.5.1", # 1-min average index 1
                    "1.3.6.1.4.1.9.9.109.1.1.1.1.5",   # 1-min average (column)
                    "1.3.6.1.4.1.9.2.1.58.0",           # old Cisco CPU OID
                ]
                for oid in cpu_oids:
                    val = session.get(oid)
                    cpu_usage = safe_float(val, None)
                    if cpu_usage is not None: break
                
                # Memory OIDs
                # Try Pool 1 (Processor) first
                m_used = safe_int(session.get("1.3.6.1.4.1.9.9.48.1.1.1.5.1"), None)
                m_free = safe_int(session.get("1.3.6.1.4.1.9.9.48.1.1.1.6.1"), None)
                
                # Fallback to walk if indexed get failed
                if m_used is None or m_free is None:
                    m_used = safe_int(session.get("1.3.6.1.4.1.9.9.48.1.1.1.5"), None)
                    m_free = safe_int(session.get("1.3.6.1.4.1.9.9.48.1.1.1.6"), None)
                
                if m_used is not None and m_free is not None:
                    total_mem = m_used + m_free
                    if total_mem > 0:
                        memory_usage = (m_used / total_mem) * 100
                
                # Temperature
                # Try common Cisco indices first
                temp_oids = [
                    "1.3.6.1.4.1.9.9.13.1.3.1.3.1", 
                    "1.3.6.1.4.1.9.9.13.1.3.1.3.1004", # common for some 2960X
                    "1.3.6.1.4.1.9.9.13.1.3.1.3.1001",
                ]
                for oid in temp_oids:
                    val = session.get(oid)
                    temperature = safe_float(val, None)
                    if temperature is not None and temperature > 0: 
                        # Cisco often returns temp in 10ths of degrees
                        if temperature > 150: # Likely 10ths
                            temperature = temperature / 10.0
                        break
                
                # Try CISCO-ENTITY-SENSOR-MIB if still None
                if temperature is None:
                    sensor_types = session.walk("1.3.6.1.4.1.9.9.91.1.1.1.1.1")
                    for s_oid, s_type in sensor_types.items():
                        if str(s_type) == "8": # Celsius
                            idx = s_oid.split(".")[-1]
                            temperature = safe_float(session.get(f"1.3.6.1.4.1.9.9.91.1.1.1.1.4.{idx}"), None)
                            if temperature is not None and temperature > 0:
                                # Entity sensor might also be in 10ths or 1000ths
                                if temperature > 1000:
                                    temperature = temperature / 1000.0
                                elif temperature > 150:
                                    temperature = temperature / 10.0
                                break
                
                # If still None, try a quick walk on old temperature table
                if temperature is None:
                    temp_table = session.walk("1.3.6.1.4.1.9.9.13.1.3.1.3")
                    if temp_table:
                        for t_val in temp_table.values():
                            if t_val and float(str(t_val)) > 0:
                                temperature = float(str(t_val))
                                break
            
            elif vendor.lower() == "fortinet":
                cpu_oid = "1.3.6.1.4.1.12356.101.13.2.1.1.2"
                mem_oid = "1.3.6.1.4.1.12356.101.13.2.1.2.1"
                temp_oid = "1.3.6.1.4.1.12356.101.13.2.1.3.1"
                
                cpu_value = session.get(cpu_oid)
                cpu_usage = safe_float(cpu_value, None)
                
                mem_value = session.get(mem_oid)
                memory_usage = safe_float(mem_value, None)
                
                temp_value = session.get(temp_oid)
                temperature = safe_float(temp_value, None)
            
            elif vendor.lower() == "mikrotik":
                cpu_oid = "1.3.6.1.4.1.14988.1.1.3.2"
                mem_total_oid = "1.3.6.1.4.1.14988.1.1.3.3"
                mem_free_oid = "1.3.6.1.4.1.14988.1.1.3.4"
                
                cpu_value = session.get(cpu_oid)
                cpu_usage = safe_float(cpu_value, None)
                
                mem_total = session.get(mem_total_oid)
                mem_free = session.get(mem_free_oid)
                if mem_total is not None and mem_free is not None:
                    m_total = safe_int(mem_total, None)
                    m_free = safe_int(mem_free, None)
                    if m_total is not None and m_free is not None and m_total > 0:
                        used = m_total - m_free
                        memory_usage = (used / m_total) * 100
            
            else:
                # Generic fallback using HOST-RESOURCES-MIB (RFC 2790)
                # CPU Load - Table
                cpu_table = session.walk("1.3.6.1.2.1.25.3.3.1.2")
                if cpu_table:
                    loads = [float(str(v)) for v in cpu_table.values() if v]
                    if loads:
                        cpu_usage = sum(loads) / len(loads)
                
                # Memory - Table
                storage_table = session.walk("1.3.6.1.2.1.25.2.3.1")
                # Indices: .4=Units, .5=Size, .6=Used
                # Type .2=hrStorageRam
                ram_index = None
                for oid, val in storage_table.items():
                    if oid.endswith(".2") and ".1.3.6.1.2.1.25.2.3.1.2." in oid:
                        ram_index = oid.split(".")[-1]
                        break
                
                if ram_index:
                    units = safe_int(storage_table.get(f"1.3.6.1.2.1.25.2.3.1.4.{ram_index}"), 1)
                    size = safe_int(storage_table.get(f"1.3.6.1.2.1.25.2.3.1.5.{ram_index}"), 0)
                    used = safe_int(storage_table.get(f"1.3.6.1.2.1.25.2.3.1.6.{ram_index}"), 0)
                    if size > 0:
                        memory_usage = (used / size) * 100
            
            metric = DeviceHealthMetric(
                device_id=device_id,
                device_name=str(sys_name) if sys_name else f"Device{device_id}",
                uptime_seconds=uptime_seconds,
                cpu_usage=cpu_usage,
                memory_usage=memory_usage,
                temperature=temperature,
                timestamp=datetime.utcnow(),
            )
            
            logger.debug(f"Polled health metrics for device {device_id}")
            return metric
            
        except SNMPDeviceUnreachable as e:
            logger.warning(f"Device {device_id} unreachable: {e}")
            return None
        except Exception as e:
            logger.error(f"Health polling failed for device {device_id}: {e}")
            return None
    
    def poll_inventory(
        self,
        device_id: int,
    ) -> Optional[DeviceInventory]:
        """Poll device hardware/inventory information
        
        Args:
            device_id: Device identifier
            
        Returns:
            DeviceInventory or None if failed
        """
        if device_id not in self.sessions:
            logger.warning(f"Device {device_id} not registered")
            return None
        
        session = self.sessions[device_id]
        
        try:
            sys_descr = session.get("1.3.6.1.2.1.1.1.0")
            sys_name = session.get("1.3.6.1.2.1.1.5.0")
            
            if sys_descr is None:
                logger.warning(f"Could not get system description for device {device_id}")
                return None
            
            # Initialize with basic info
            inventory = DeviceInventory(
                device_id=device_id,
                sys_descr=str(sys_descr),
                serial_number=None,
                firmware_version=None,
                vendor=None,
                model=None,
                timestamp=datetime.utcnow(),
            )
            
            # Try to extract vendor from sysDescr
            sys_descr_lower = str(sys_descr).lower()
            if "cisco" in sys_descr_lower:
                inventory.vendor = "cisco"
                
                # Cisco-specific serial number (ENTITY-MIB)
                # Walk entPhysicalSerialNum and pick the first non-empty
                physical_serials = session.walk("1.3.6.1.2.1.47.1.1.1.1.11")
                for oid, val in physical_serials.items():
                    if val and str(val).strip():
                        inventory.serial_number = str(val).strip()
                        break
                
                # Try to extract version from sysDescr (e.g., "Version 15.2(4)E7")
                import re
                version_match = re.search(r"Version ([^,\s]+)", str(sys_descr))
                if version_match:
                    inventory.firmware_version = version_match.group(1)
                
                # Try to get model from entPhysicalModelName
                physical_models = session.walk("1.3.6.1.2.1.47.1.1.1.1.13")
                for oid, val in physical_models.items():
                    if val and str(val).strip():
                        inventory.model = str(val).strip()
                        break
                    
            elif "fortinet" in sys_descr_lower or "fortigate" in sys_descr_lower:
                inventory.vendor = "fortinet"
                # Fortinet Serial
                serial = session.get("1.3.6.1.4.1.12356.100.1.1.1.0")
                if serial:
                    inventory.serial_number = str(serial)
            
            elif "mikrotik" in sys_descr_lower:
                inventory.vendor = "mikrotik"
                # MikroTik version
                version = session.get("1.3.6.1.4.1.14988.1.1.4.4.0")
                if version:
                    inventory.firmware_version = str(version)

            logger.info(f"Polled inventory for device {device_id}: {inventory.vendor} {inventory.model}")
            return inventory
            
        except SNMPDeviceUnreachable as e:
            logger.warning(f"Device {device_id} unreachable: {e}")
            return None
        except Exception as e:
            logger.error(f"Inventory polling failed for device {device_id}: {e}")
            return None
    
    def poll_topology(
        self,
        device_id: int,
    ) -> List[TopologyMetric]:
        """Poll device neighbor information (topology)
        
        Args:
            device_id: Device identifier
            
        Returns:
            List of TopologyMetric objects
        """
        if device_id not in self.sessions:
            logger.warning(f"Device {device_id} not registered")
            return []
        
        session = self.sessions[device_id]
        topology_links = []
        
        try:
            # 1. Try LLDP (Link Layer Discovery Protocol)
            # lldpRemTable OIDs
            lldp_rem_sys_name = "1.3.6.1.2.1.88.1.4.1.1.9"
            lldp_rem_port_id = "1.3.6.1.2.1.88.1.4.1.1.7"
            
            # Walk LLDP system names to find neighbors
            neighbors = session.walk(lldp_rem_sys_name)
            for oid, name in neighbors.items():
                if not name: continue
                
                # OID format: .1.3.6.1.2.1.88.1.4.1.1.9.time_mark.local_port_num.rem_index
                parts = oid.split(".")
                if len(parts) < 3: continue
                
                local_port_idx = parts[-2]
                rem_idx = parts[-1]
                time_mark = parts[-3]
                
                # Get remote port
                rem_port = session.get(f"{lldp_rem_port_id}.{time_mark}.{local_port_idx}.{rem_idx}")
                
                # Get local port name/description
                local_port_name = session.get(f"1.3.6.1.2.1.2.2.1.2.{local_port_idx}")
                
                topology_links.append(TopologyMetric(
                    local_device_id=device_id,
                    local_interface=str(local_port_name) if local_port_name else f"Port{local_port_idx}",
                    remote_device_name=str(name),
                    remote_interface=str(rem_port) if rem_port else "unknown",
                    protocol="lldp"
                ))
            
            # 2. Try CDP (Cisco Discovery Protocol) if LLDP is sparse or for Cisco devices
            if not topology_links:
                cdp_cache_device_id = "1.3.6.1.4.1.9.9.23.1.2.1.1.6"
                cdp_cache_device_port = "1.3.6.1.4.1.9.9.23.1.2.1.1.7"
                
                cdp_neighbors = session.walk(cdp_cache_device_id)
                for oid, name in cdp_neighbors.items():
                    if not name: continue
                    
                    # OID format: .1.3.6.1.4.1.9.9.23.1.2.1.1.6.local_if_index.device_index
                    parts = oid.split(".")
                    if len(parts) < 2: continue
                    
                    local_if_idx = parts[-2]
                    device_idx = parts[-1]
                    
                    rem_port = session.get(f"{cdp_cache_device_port}.{local_if_idx}.{device_idx}")
                    local_port_name = session.get(f"1.3.6.1.2.1.2.2.1.2.{local_if_idx}")
                    
                    topology_links.append(TopologyMetric(
                        local_device_id=device_id,
                        local_interface=str(local_port_name) if local_port_name else f"Port{local_if_idx}",
                        remote_device_name=str(name),
                        remote_interface=str(rem_port) if rem_port else "unknown",
                        protocol="cdp"
                    ))
            
            logger.info(f"Polled {len(topology_links)} topology links for device {device_id}")
            return topology_links
            
        except Exception as e:
            logger.error(f"Topology polling failed for device {device_id}: {e}")
            return []
    
    def close_all(self) -> None:
        """Close all SNMP sessions"""
        for session in self.sessions.values():
            try:
                session.close()
            except Exception as e:
                logger.warning(f"Error closing session: {e}")
        
        self.sessions.clear()
        self.last_poll_time.clear()
        logger.info("All SNMP sessions closed")
    
    def __repr__(self) -> str:
        return f"SNMPPoller(devices={len(self.sessions)})"
