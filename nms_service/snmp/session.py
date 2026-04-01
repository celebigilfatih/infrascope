"""SNMP device communication engine

Provides sync and async-ready SNMP operations with graceful error handling.
"""

import asyncio
import socket
from typing import Dict, Optional, Any, List, Tuple
from datetime import datetime
from pysnmp.hlapi import (
    getCmd, nextCmd, bulkCmd,
    SnmpEngine, UdpTransportTarget,
    CommunityData, ContextData,
    ObjectIdentity, ObjectType,
)

from nms_service.core.logger import logger
from nms_service.core.config import config
from nms_service.snmp.vendor_oids import oid_manager


class SNMPError(Exception):
    """Base exception for SNMP operations"""
    pass


class SNMPTimeoutError(SNMPError):
    """SNMP operation timeout"""
    pass


class SNMPAuthError(SNMPError):
    """SNMP authentication/authorization error"""
    pass


class SNMPDeviceUnreachable(SNMPError):
    """Device is unreachable"""
    pass


class SNMPSession:
    """Manages SNMP sessions with a single device"""
    
    def __init__(
        self,
        device_id: int,
        device_name: str,
        ip_address: str,
        community_string: str,
        version: str = "2c",
        port: int = 161,
        timeout: int = None,
        retries: int = None,
    ):
        """Initialize SNMP session
        
        Args:
            device_id: Unique device identifier
            device_name: Human-readable device name
            ip_address: IP address of SNMP device
            community_string: SNMP community string (for v2c)
            version: SNMP version ("2c" or "3")
            port: SNMP port (default 161)
            timeout: Request timeout in seconds
            retries: Number of retries for failed requests
        """
        self.device_id = device_id
        self.device_name = device_name
        self.ip_address = ip_address
        self.community_string = community_string
        self.version = version or "2c"
        self.port = port
        self.timeout = timeout if timeout is not None else config.snmp.snmp_timeout
        self.retries = retries if retries is not None else config.snmp.snmp_retries
        
        # Lazy initialization
        self._engine: Optional[SnmpEngine] = None
        self._transport: Optional[UdpTransportTarget] = None
        self._auth: Optional[CommunityData] = None
    
    def _validate_connectivity(self) -> bool:
        """Test basic connectivity to device (UDP check is limited, so we skip TCP check)"""
        # SNMP uses UDP, so TCP connect check is inappropriate and fails on most devices.
        # We'll let the actual SNMP GET handle the timeout.
        return True
    
    def _init_snmp_engine(self) -> None:
        """Initialize SNMP engine and transport"""
        if self._engine is not None:
            return
        
        try:
            self._engine = SnmpEngine()
            self._transport = UdpTransportTarget(
                (self.ip_address, self.port),
                timeout=self.timeout,
                retries=self.retries
            )
            
            logger.debug(f"Initializing SNMP engine with version: '{self.version}'")
            
            if self.version in ["2c", "v2c"]:
                self._auth = CommunityData(self.community_string)
            else:
                # TODO: Implement SNMP v3 authentication
                raise NotImplementedError(f"SNMP version '{self.version}' not yet implemented")
            
            logger.debug(
                f"SNMP engine initialized for {self.device_name} "
                f"({self.ip_address})"
            )
        except Exception as e:
            logger.error(f"Failed to initialize SNMP engine: {e}")
            raise SNMPError(f"SNMP initialization failed: {e}")
    
    def _parse_snmp_value(self, value: Any) -> Any:
        """Convert pysnmp value to native Python type"""
        try:
            if hasattr(value, 'prettyPrint'):
                value_str = value.prettyPrint()
                
                # Try to convert to numeric types
                if value_str.isdigit():
                    return int(value_str)
                try:
                    return float(value_str)
                except ValueError:
                    return value_str
            return value
        except Exception as e:
            logger.warning(f"Failed to parse SNMP value: {e}")
            return str(value)
    
    def get(self, oid: str) -> Optional[Any]:
        """Get a single OID value (synchronous)
        
        Args:
            oid: Object identifier to retrieve
            
        Returns:
            Value or None if failed
        """
        if not self._validate_connectivity():
            raise SNMPDeviceUnreachable(
                f"Device {self.device_name} ({self.ip_address}) is unreachable"
            )
        
        try:
            self._init_snmp_engine()
            
            error_indication, error_status, error_index, var_binds = next(
                getCmd(
                    self._engine,
                    self._auth,
                    self._transport,
                    ContextData(),
                    ObjectType(ObjectIdentity(oid))
                )
            )
            
            if error_indication:
                logger.error(
                    f"SNMP get error for {self.device_name}: "
                    f"{error_indication}"
                )
                raise SNMPError(f"SNMP get failed: {error_indication}")
            
            if error_status:
                logger.warning(
                    f"SNMP error status for {self.device_name}: "
                    f"{error_status}"
                )
                return None
            
            # Extract value from response
            for name, value in var_binds:
                return self._parse_snmp_value(value)
            
            return None
            
        except SNMPDeviceUnreachable:
            raise
        except Exception as e:
            logger.error(
                f"SNMP get operation failed for {self.device_name}: {e}"
            )
            raise SNMPError(f"SNMP operation failed: {e}")
    
    def get_multiple(self, oids: List[str]) -> Dict[str, Optional[Any]]:
        """Get multiple OID values in a single request
        
        Args:
            oids: List of OIDs to retrieve
            
        Returns:
            Dictionary mapping OID to value
        """
        if not self._validate_connectivity():
            raise SNMPDeviceUnreachable(
                f"Device {self.device_name} ({self.ip_address}) is unreachable"
            )
        
        try:
            self._init_snmp_engine()
            
            error_indication, error_status, error_index, var_binds = next(
                getCmd(
                    self._engine,
                    self._auth,
                    self._transport,
                    ContextData(),
                    *[ObjectType(ObjectIdentity(oid)) for oid in oids]
                )
            )
            
            results = {oid: None for oid in oids}
            
            if error_indication:
                logger.error(
                    f"SNMP get_multiple error for {self.device_name}: "
                    f"{error_indication}"
                )
                return results
            
            if error_status:
                logger.warning(
                    f"SNMP error status for {self.device_name}: "
                    f"{error_status}"
                )
                return results
            
            # Map values to OIDs
            for name, value in var_binds:
                oid_str = str(name)
                results[oid_str] = self._parse_snmp_value(value)
            
            return results
            
        except SNMPDeviceUnreachable:
            raise
        except Exception as e:
            logger.error(
                f"SNMP get_multiple operation failed for {self.device_name}: {e}"
            )
            return {oid: None for oid in oids}
    
    def walk(self, oid: str) -> Dict[str, Any]:
        """Walk OID subtree (synchronous bulk operation)
        
        Args:
            oid: Root OID to walk
            
        Returns:
            Dictionary mapping OIDs to values
        """
        if not self._validate_connectivity():
            raise SNMPDeviceUnreachable(
                f"Device {self.device_name} ({self.ip_address}) is unreachable"
            )
        
        results = {}
        
        try:
            self._init_snmp_engine()
            
            # Use bulkCmd for efficient walking
            use_bulk = config.snmp.bulk_walk_enabled
            
            if use_bulk:
                iterator = bulkCmd(
                    self._engine,
                    self._auth,
                    self._transport,
                    ContextData(),
                    0,  # nonRepeaters
                    25,  # maxRepetitions
                    ObjectType(ObjectIdentity(oid))
                )
            else:
                iterator = nextCmd(
                    self._engine,
                    self._auth,
                    self._transport,
                    ContextData(),
                    ObjectType(ObjectIdentity(oid))
                )
            
            for error_indication, error_status, error_index, var_binds in iterator:
                if error_indication:
                    logger.warning(
                        f"SNMP walk error for {self.device_name}: "
                        f"{error_indication}"
                    )
                    break
                
                if error_status:
                    logger.warning(
                        f"SNMP error status during walk for {self.device_name}: "
                        f"{error_status}"
                    )
                    break
                
                stop_walk = False
                for name, value in var_binds:
                    oid_str = str(name)
                    # Check if we are still within the requested OID subtree
                    if not oid_str.startswith(oid):
                        stop_walk = True
                        break
                    results[oid_str] = self._parse_snmp_value(value)
                
                if stop_walk:
                    break
            
            logger.debug(
                f"SNMP walk completed for {self.device_name}, "
                f"collected {len(results)} OIDs"
            )
            
            return results
            
        except SNMPDeviceUnreachable:
            raise
        except Exception as e:
            logger.error(
                f"SNMP walk operation failed for {self.device_name}: {e}"
            )
            return results
    
    def close(self) -> None:
        """Close SNMP session"""
        if self._engine:
            try:
                self._engine.closeDispatcher()
                logger.debug(f"SNMP session closed for {self.device_name}")
            except Exception as e:
                logger.warning(f"Error closing SNMP session: {e}")
            finally:
                self._engine = None
                self._transport = None
                self._auth = None
    
    def __repr__(self) -> str:
        return (
            f"SNMPSession(device_id={self.device_id}, "
            f"name={self.device_name}, ip={self.ip_address})"
        )
    
    def __enter__(self):
        """Context manager entry"""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.close()
