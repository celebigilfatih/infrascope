"""SSH polling engine for devices that don't support SNMP or have SNMP disabled

Uses paramiko to SSH into network devices and parse CLI output for metrics.
Currently supports Cisco IOS devices.
"""

from typing import Dict, List, Optional, Any
from datetime import datetime
from dataclasses import dataclass
import re
import time

import paramiko

from nms_service.core.logger import logger
from nms_service.core.models import (
    InterfaceMetric,
    DeviceHealthMetric,
)


@dataclass
class SSHDeviceConfig:
    """SSH device connection configuration"""
    device_id: int
    device_name: str
    ip_address: str
    username: str
    password: str
    port: int = 22
    vendor: str = "cisco"
    enabled: bool = True
    timeout: int = 10


class SSHSession:
    """SSH session manager for network devices"""
    
    def __init__(self, config: SSHDeviceConfig):
        self.device_id = config.device_id
        self.device_name = config.device_name
        self.ip_address = config.ip_address
        self.username = config.username
        self.password = config.password
        self.port = config.port
        self.vendor = config.vendor
        self.timeout = config.timeout
        self.client: Optional[paramiko.SSHClient] = None
        self.channel = None
    
    def connect(self) -> bool:
        """Establish SSH connection"""
        try:
            self.client = paramiko.SSHClient()
            self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            self.client.connect(
                self.ip_address,
                username=self.username,
                password=self.password,
                port=self.port,
                timeout=self.timeout,
                look_for_keys=False,
                allow_agent=False,
            )
            
            # Create interactive channel
            self.channel = self.client.invoke_shell()
            time.sleep(1)
            
            # Disable paging
            self._send_command("terminal length 0")
            
            logger.info(f"SSH connected to {self.device_name} ({self.ip_address})")
            return True
            
        except Exception as e:
            logger.error(f"SSH connection failed for {self.device_name}: {e}")
            return False
    
    def _send_command(self, command: str) -> str:
        """Send command and get output"""
        if not self.channel:
            return ""
        
        self.channel.send(f"{command}\n")
        time.sleep(2)
        
        output = ""
        while self.channel.recv_ready():
            output += self.channel.recv(65535).decode()
        
        return output
    
    def execute_command(self, command: str) -> str:
        """Execute a single command and return output"""
        if not self.client:
            if not self.connect():
                return ""
        
        return self._send_command(command)
    
    def close(self):
        """Close SSH connection"""
        if self.client:
            try:
                self.client.close()
            except:
                pass
            self.client = None
            self.channel = None


class SSHPoller:
    """SSH-based poller for network devices"""
    
    def __init__(self):
        self.sessions: Dict[int, SSHSession] = {}
        self.credentials: Dict[str, Dict[str, str]] = {}  # ip -> {username, password}
    
    def set_default_credentials(self, username: str, password: str):
        """Set default SSH credentials for all devices"""
        self.credentials["default"] = {"username": username, "password": password}
    
    def set_device_credentials(self, ip_address: str, username: str, password: str):
        """Set SSH credentials for specific device"""
        self.credentials[ip_address] = {"username": username, "password": password}
    
    def _get_credentials(self, ip_address: str) -> Dict[str, str]:
        """Get credentials for device (device-specific or default)"""
        return self.credentials.get(ip_address, self.credentials.get("default", {}))
    
    def register_device(self, config: SSHDeviceConfig) -> None:
        """Register a device for SSH polling"""
        if not config.enabled:
            logger.info(f"SSH device {config.device_name} is disabled, skipping")
            return
        
        # Get credentials
        creds = self._get_credentials(config.ip_address)
        if not creds:
            logger.warning(f"No SSH credentials for {config.device_name} ({config.ip_address})")
            return
        
        session = SSHSession(SSHDeviceConfig(
            device_id=config.device_id,
            device_name=config.device_name,
            ip_address=config.ip_address,
            username=creds.get("username", config.username),
            password=creds.get("password", config.password),
            port=config.port,
            vendor=config.vendor,
            enabled=True,
        ))
        
        self.sessions[config.device_id] = session
        logger.info(f"SSH device registered: {config.device_name} ({config.ip_address})")
    
    def poll_interfaces(self, device_id: int) -> List[InterfaceMetric]:
        """Poll interface status via SSH"""
        if device_id not in self.sessions:
            logger.warning(f"SSH device {device_id} not registered")
            return []
        
        session = self.sessions[device_id]
        if not session.client:
            if not session.connect():
                return []
        
        try:
            # Get interface status
            output = session.execute_command("show interfaces status")
            
            interfaces = []
            for line in output.split('\n'):
                # Parse: Gi0/1  connected  trunk  full  10G  10GBase-SR
                parts = line.split()
                if len(parts) < 2:
                    continue
                
                interface_name = parts[0]
                status = parts[1].lower()
                
                # Skip non-interface lines
                if interface_name.startswith('Device') or interface_name.startswith('Interface'):
                    continue
                
                # Determine admin and oper status
                if status == 'connected':
                    oper_status = 'up'
                    admin_status = 'up'
                elif status == 'notconnect':
                    oper_status = 'down'
                    admin_status = 'up'
                elif status == 'disabled':
                    oper_status = 'down'
                    admin_status = 'down'
                elif 'admin' in status:
                    oper_status = 'down'
                    admin_status = 'down'
                else:
                    oper_status = 'down'
                    admin_status = 'up'
                
                # Parse speed
                speed = 0
                for part in parts:
                    if '10G' in part:
                        speed = 10000000000
                    elif '1000' in part or '10/100/1000' in part:
                        speed = 1000000000
                    elif '100' in part:
                        speed = 100000000
                
                # Create interface metric
                # Extract interface index from name (e.g., Gi0/1 -> 1001)
                if_index = self._parse_interface_index(interface_name)
                
                iface = InterfaceMetric(
                    device_id=device_id,
                    interface_index=if_index,
                    interface_name=interface_name,
                    description="",
                    admin_status=admin_status,
                    oper_status=oper_status,
                    speed=speed,
                    in_octets=0,
                    out_octets=0,
                    in_errors=0,
                    out_errors=0,
                    mtu=1500,
                )
                interfaces.append(iface)
            
            logger.info(f"SSH polled {len(interfaces)} interfaces for device {device_id}")
            return interfaces
            
        except Exception as e:
            logger.error(f"SSH interface poll failed for device {device_id}: {e}")
            return []
    
    def poll_device_health(self, device_id: int, vendor: str = "cisco") -> Optional[DeviceHealthMetric]:
        """Poll device health metrics via SSH"""
        if device_id not in self.sessions:
            logger.warning(f"SSH device {device_id} not registered")
            return None
        
        session = self.sessions[device_id]
        if not session.client:
            if not session.connect():
                return None
        
        try:
            # Get system uptime from 'show version'
            output = session.execute_command("show version")
            
            # Parse uptime: "uptime is 2 years, 3 weeks, 4 days, 5 hours, 6 minutes"
            uptime_seconds = 0
            uptime_match = re.search(
                r'uptime is (\d+) year.*?(\d+) week.*?(\d+) day.*?(\d+) hour.*?(\d+) minute',
                output,
                re.IGNORECASE
            )
            if uptime_match:
                years = int(uptime_match.group(1))
                weeks = int(uptime_match.group(2))
                days = int(uptime_match.group(3))
                hours = int(uptime_match.group(4))
                minutes = int(uptime_match.group(5))
                uptime_seconds = (years * 365 * 24 * 3600) + (weeks * 7 * 24 * 3600) + \
                                (days * 24 * 3600) + (hours * 3600) + (minutes * 60)
            
            # CPU/Memory not easily available via SSH on Cisco IOS without specific commands
            # Return basic health with uptime
            health = DeviceHealthMetric(
                device_id=device_id,
                device_name=session.device_name,
                uptime_seconds=uptime_seconds,
                cpu_usage=None,
                memory_usage=None,
                temperature=None,
            )
            
            logger.info(f"SSH polled health for device {device_id} (uptime: {uptime_seconds}s)")
            return health
            
        except Exception as e:
            logger.error(f"SSH health poll failed for device {device_id}: {e}")
            return None
    
    def _parse_interface_index(self, interface_name: str) -> int:
        """Convert interface name to numeric index"""
        # Gi0/1 -> 1001, Te0/1 -> 10201, Fa0/1 -> 501
        type_map = {
            'GigabitEthernet': 1000,
            'Gi': 1000,
            'TenGigabitEthernet': 10200,
            'Te': 10200,
            'FastEthernet': 500,
            'Fa': 500,
        }
        
        for prefix, base in type_map.items():
            if interface_name.startswith(prefix):
                suffix = interface_name[len(prefix):]
                parts = suffix.split('/')
                if len(parts) == 2:
                    return base + int(parts[0]) * 100 + int(parts[1])
                elif len(parts) == 1:
                    return base + int(parts[0])
        
        return 0
    
    def close_all(self):
        """Close all SSH sessions"""
        for device_id, session in self.sessions.items():
            try:
                session.close()
            except:
                pass
        self.sessions.clear()
        logger.info("All SSH sessions closed")
