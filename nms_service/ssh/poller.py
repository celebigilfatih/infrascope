"""SSH polling engine with production-grade session lifecycle management.

Design principles:
  - Stateless polling: connect -> execute -> close (no long-lived sessions)
  - Safe close: idempotent, swallow exceptions, always null out refs
  - Config-aware re-register: reuse only when credentials/host are identical
  - Concurrency control: global semaphore caps parallel SSH opens
  - Structured logging: open/close/reuse/failure events are traceable

Backwards-compatible with existing orchestrator callers:
  - register_device(SSHDeviceConfig)
  - poll_interfaces(device_id) -> List[InterfaceMetric]
  - poll_device_health(device_id, vendor) -> Optional[DeviceHealthMetric]
  - close_all()
"""

from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from contextlib import contextmanager
import base64
import hashlib
import re
import socket
import threading

import paramiko

from nms_service.core.logger import logger
from nms_service.core.config import config
from nms_service.core.models import (
    InterfaceMetric,
    DeviceHealthMetric,
)


# ---------------------------------------------------------------------------
# Global concurrency control
# ---------------------------------------------------------------------------
# Caps the number of simultaneous SSH TCP connections across the entire
# orchestrator so we never overwhelm upstream vty resources.
_SSH_MAX_CONCURRENT = getattr(config, "ssh_max_concurrent", 15)
_ssh_semaphore = threading.BoundedSemaphore(_SSH_MAX_CONCURRENT)

# ANSI escape sequences commonly emitted by device pagers (cursor moves, color)
_ANSI_RE = re.compile(r"\x1B\[[0-9;?]*[A-Za-z]")

_READ_ONLY_COMMANDS = {
    "cisco": {
        "interfaces": "show interfaces status",
        "status": "show version",
        "backup": "show running-config",
    },
    "hp": {
        "interfaces": "display interface brief",
        "status": "display version",
        "backup": "display current-configuration",
    },
    "huawei": {
        "interfaces": "display interface brief",
        "status": "display version",
        "backup": "display current-configuration",
    },
    "juniper": {
        "interfaces": "show interfaces terse | no-more",
        "status": "show version | no-more",
        "backup": "show configuration | display set | no-more",
    },
    "fortinet": {
        "status": "get system status",
        "backup": "show full-configuration",
    },
}

_VENDOR_ALIASES = {
    "fortigate": "fortinet",
    "fortios": "fortinet",
    "hpe": "hp",
    "comware": "hp",
    "h3c": "hp",
    "procurve": "hp",
    "vrp": "huawei",
    "junos": "juniper",
    "ios": "cisco",
    "iosxe": "cisco",
    "cisco_ios": "cisco",
    "cisco_xe": "cisco",
    "nxos": "cisco",
    "cisco_nxos": "cisco",
    "arista": "cisco",
    "eos": "cisco",
}


def _canonical_vendor(vendor: str) -> str:
    normalized = (vendor or "").strip().lower()
    return _VENDOR_ALIASES.get(normalized, normalized)


def host_key_fingerprint(key: paramiko.PKey) -> str:
    digest = hashlib.sha256(key.asbytes()).digest()
    return f"SHA256:{base64.b64encode(digest).decode('ascii').rstrip('=')}"


def inspect_ssh_host_key(host: str, port: int = 22, timeout: int = 10) -> Tuple[str, str]:
    """Fetch a server host key without authenticating or trusting it."""
    sock = socket.create_connection((host, port), timeout=timeout)
    transport = paramiko.Transport(sock)
    try:
        transport.start_client(timeout=timeout)
        key = transport.get_remote_server_key()
        return key.get_name(), host_key_fingerprint(key)
    finally:
        transport.close()
        sock.close()


class PinnedHostKeyPolicy(paramiko.MissingHostKeyPolicy):
    def __init__(self, expected_fingerprint: str):
        self.expected_fingerprint = expected_fingerprint.strip()

    def missing_host_key(self, client, hostname, key):
        observed = host_key_fingerprint(key)
        if observed != self.expected_fingerprint:
            raise paramiko.SSHException(
                f"SSH host key mismatch for {hostname}; expected {self.expected_fingerprint}, observed {observed}"
            )
        client.get_host_keys().add(hostname, key.get_name(), key)

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
    host_key_fingerprint: str = ""
    host_key_algorithm: str = ""


# ---------------------------------------------------------------------------
# SSHSession — lifecycle-safe wrapper around paramiko
# ---------------------------------------------------------------------------
class SSHSession:
    """SSH session with safe connect/close and context-manager support."""

    def __init__(self, cfg: SSHDeviceConfig):
        self.device_id = cfg.device_id
        self.device_name = cfg.device_name
        self.ip_address = cfg.ip_address
        self.username = cfg.username
        self.password = cfg.password
        self.port = cfg.port
        self.vendor = cfg.vendor
        self.timeout = cfg.timeout
        self.host_key_fingerprint = cfg.host_key_fingerprint
        self.host_key_algorithm = cfg.host_key_algorithm
        self.client: Optional[paramiko.SSHClient] = None
        self._lock = threading.Lock()  # prevents double-connect/close

    # ---- Config identity check ------------------------------------------------
    def is_same_config(self, cfg: SSHDeviceConfig) -> bool:
        """Return True if cfg has identical connection parameters."""
        return (
            self.ip_address == cfg.ip_address
            and self.username == cfg.username
            and self.password == cfg.password
            and self.port == cfg.port
            and self.host_key_fingerprint == cfg.host_key_fingerprint
        )

    # ---- Connect --------------------------------------------------------------
    def connect(self) -> bool:
        """Open an SSH shell; no-op if already connected.

        Acquires the global SSH semaphore to cap parallelism across all devices.
        Caller is responsible for calling close() when done.
        """
        with self._lock:
            if self.client is not None:
                # Already connected — reuse
                logger.debug(f"SSH reuse existing session for {self.device_name}")
                return True

            # Bound parallel SSH opens across the whole orchestrator
            _ssh_semaphore.acquire()
            try:
                if not self.host_key_fingerprint:
                    raise paramiko.SSHException("SSH host key has not been explicitly trusted")
                client = paramiko.SSHClient()
                client.set_missing_host_key_policy(PinnedHostKeyPolicy(self.host_key_fingerprint))
                client.connect(
                    self.ip_address,
                    username=self.username,
                    password=self.password,
                    port=self.port,
                    timeout=self.timeout,
                    auth_timeout=self.timeout,
                    banner_timeout=self.timeout,
                    look_for_keys=False,
                    allow_agent=False,
                )

                self.client = client

                logger.info(
                    f"SSH open: {self.device_name} ({self.ip_address}) "
                    f"[concurrent={_SSH_MAX_CONCURRENT - _ssh_semaphore._value}/"
                    f"{_SSH_MAX_CONCURRENT}]"
                )
                return True
            except Exception as e:
                # Release the slot on failure — otherwise we leak a permit
                _ssh_semaphore.release()
                logger.error(
                    f"SSH connect FAILED {self.device_name} ({self.ip_address}): {e}"
                )
                self.client = None
                return False

    # ---- Command execution ----------------------------------------------------
    def execute_operation(self, operation: str) -> str:
        """Execute one exact read-only command selected from the vendor allowlist."""
        if self.client is None:
            logger.warning(
                f"execute_operation called on closed session: {self.device_name}"
            )
            return ""
        vendor = _canonical_vendor(self.vendor)
        command = _READ_ONLY_COMMANDS.get(vendor, {}).get(operation)
        if not command:
            raise ValueError(f"SSH operation '{operation}' is not allowed for vendor '{vendor or 'unknown'}'")
        stdin, stdout, stderr = self.client.exec_command(
            command,
            timeout=self.timeout,
            get_pty=False,
        )
        stdin.close()
        output = stdout.read(10 * 1024 * 1024 + 1)
        error = stderr.read(64 * 1024)
        if len(output) > 10 * 1024 * 1024:
            raise ValueError("SSH command output exceeds the 10 MiB safety limit")
        text = _ANSI_RE.sub("", output.decode(errors="replace"))
        error_text = error.decode(errors="replace").strip()
        if error_text and not text.strip():
            raise ValueError("SSH device rejected the read-only operation")
        return text

    # ---- Close ----------------------------------------------------------------
    def close(self) -> None:
        """Idempotent, exception-safe close. Always nulls refs and releases slot."""
        with self._lock:
            if self.client is None:
                return  # already closed

            had_slot = self.client is not None

            # Best-effort client close
            if self.client is not None:
                try:
                    self.client.close()
                except Exception:
                    pass
                self.client = None

            # Release the semaphore permit acquired in connect()
            if had_slot:
                try:
                    _ssh_semaphore.release()
                except ValueError:
                    # Already released — defensive
                    pass
                logger.info(f"SSH close: {self.device_name} ({self.ip_address})")

    # ---- Context manager ------------------------------------------------------
    def __enter__(self):
        if not self.connect():
            raise ConnectionError(
                f"SSH connect failed for {self.device_name} ({self.ip_address})"
            )
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()
        return False  # do not suppress exceptions


# ---------------------------------------------------------------------------
# SSHPoller — device registry + stateless polling operations
# ---------------------------------------------------------------------------
class SSHPoller:
    """SSH-based poller.

    Sessions are stored per device_id but the polling methods follow a
    stateless connect->execute->close pattern. The registry is mainly used
    for config tracking and to allow in-flight session reuse via context
    managers.
    """

    def __init__(self):
        # device_id -> stored SSHDeviceConfig (used for config-identity checks)
        self.configs: Dict[int, SSHDeviceConfig] = {}
        # device_id -> SSHSession (may be short-lived / may be None when closed)
        self.sessions: Dict[int, SSHSession] = {}
        # default credentials fallback
        self.credentials: Dict[str, Dict[str, str]] = {}
        self._registry_lock = threading.Lock()

    # ---- Credentials ----------------------------------------------------------
    def set_default_credentials(self, username: str, password: str) -> None:
        self.credentials["default"] = {"username": username, "password": password}

    def set_device_credentials(
        self, ip_address: str, username: str, password: str
    ) -> None:
        self.credentials[ip_address] = {"username": username, "password": password}

    def _get_credentials(self, ip_address: str) -> Dict[str, str]:
        return self.credentials.get(
            ip_address, self.credentials.get("default", {})
        )

    # ---- Registration ---------------------------------------------------------
    def register_device(self, cfg: SSHDeviceConfig) -> None:
        """Register a device. Reuses existing session if config is identical;
        otherwise closes the old one before replacing.
        """
        if not cfg.enabled:
            return

        creds = self._get_credentials(cfg.ip_address)
        if not creds and not (cfg.username and cfg.password):
            logger.warning(
                f"No SSH credentials for {cfg.device_name} ({cfg.ip_address})"
            )
            return

        # Build the effective config with resolved credentials
        effective = SSHDeviceConfig(
            device_id=cfg.device_id,
            device_name=cfg.device_name,
            ip_address=cfg.ip_address,
            username=creds.get("username", cfg.username),
            password=creds.get("password", cfg.password),
            port=cfg.port,
            vendor=cfg.vendor,
            enabled=True,
            timeout=cfg.timeout,
            host_key_fingerprint=cfg.host_key_fingerprint,
            host_key_algorithm=cfg.host_key_algorithm,
        )

        with self._registry_lock:
            existing_cfg = self.configs.get(cfg.device_id)
            existing_session = self.sessions.get(cfg.device_id)

            # Reuse if identical config
            if (
                existing_cfg is not None
                and existing_session is not None
                and existing_session.is_same_config(effective)
            ):
                logger.debug(
                    f"SSH register: reuse existing session for {cfg.device_name}"
                )
                return

            # Different config (or first registration) — close old session
            if existing_session is not None:
                logger.info(
                    f"SSH register: config changed for {cfg.device_name}, "
                    f"closing old session"
                )
                existing_session.close()

            self.configs[cfg.device_id] = effective
            self.sessions[cfg.device_id] = SSHSession(effective)
            logger.debug(f"SSH registered: {cfg.device_name} ({cfg.ip_address})")

    def unregister_device(self, device_id: int) -> None:
        """Remove a device and close any retained session state."""
        with self._registry_lock:
            session = self.sessions.pop(device_id, None)
            self.configs.pop(device_id, None)
        if session is not None:
            session.close()

    # ---- Stateless session acquisition ---------------------------------------
    @contextmanager
    def _stateless_session(self, device_id: int):
        """Yield a connected SSHSession and guarantee it's closed afterward."""
        with self._registry_lock:
            cfg = self.configs.get(device_id)

        if cfg is None:
            logger.warning(f"SSH device {device_id} not registered")
            yield None
            return

        # Always build a fresh session to avoid stale state
        session = SSHSession(cfg)
        try:
            if not session.connect():
                yield None
                return
            yield session
        finally:
            session.close()

    # ---- Polling: interfaces --------------------------------------------------
    def poll_interfaces(self, device_id: int) -> List[InterfaceMetric]:
        """Stateless interface poll: connect -> show -> close."""
        with self._stateless_session(device_id) as session:
            if session is None:
                return []
            try:
                output = session.execute_operation("interfaces")
                interfaces = self._parse_interfaces(output, device_id)
                logger.info(
                    f"SSH polled {len(interfaces)} interfaces for device {device_id}"
                )
                return interfaces
            except Exception as e:
                logger.error(
                    f"SSH interface poll failed for device {device_id}: {e}"
                )
                return []

    # ---- Polling: device health ----------------------------------------------
    def poll_device_health(
        self, device_id: int, vendor: str = "cisco"
    ) -> Optional[DeviceHealthMetric]:
        """Stateless health poll via `show version`."""
        with self._stateless_session(device_id) as session:
            if session is None:
                return None
            try:
                output = session.execute_operation("status")
                uptime_seconds = self._parse_uptime(output)
                health = DeviceHealthMetric(
                    device_id=device_id,
                    device_name=session.device_name,
                    uptime_seconds=uptime_seconds,
                    cpu_usage=None,
                    memory_usage=None,
                    temperature=None,
                )
                logger.info(
                    f"SSH polled health for device {device_id} "
                    f"(uptime: {uptime_seconds}s)"
                )
                return health
            except Exception as e:
                logger.error(
                    f"SSH health poll failed for device {device_id}: {e}"
                )
                return None

    # ---- Backup: running configuration ---------------------------------------
    def read_status(self, device_id: int) -> Optional[Dict[str, str]]:
        """Return a small, non-sensitive status summary from an allowlisted command."""
        with self._stateless_session(device_id) as session:
            if session is None:
                return None
            try:
                output = session.execute_operation("status")
                if not output.strip():
                    return None
                result: Dict[str, str] = {}
                for line in output.splitlines():
                    if ":" not in line:
                        continue
                    key, value = line.split(":", 1)
                    normalized = key.strip().lower()
                    if normalized in {
                        "version", "serial-number", "serial number", "hostname",
                        "current ha mode", "system time", "operation mode",
                    }:
                        result[normalized.replace(" ", "_")] = value.strip()[:512]
                return result or {"status": "reachable"}
            except Exception as e:
                logger.error(f"SSH status read failed for device {device_id}: {e}")
                return None

    def backup_running_config(
        self, device_id: int, vendor: str = "cisco"
    ) -> Optional[str]:
        """Read a configuration using one exact vendor allowlisted command."""
        with self._stateless_session(device_id) as session:
            if session is None:
                logger.warning(f"SSH backup unavailable for device {device_id}")
                return None
            try:
                output = session.execute_operation("backup")
                lower = output.lower()
                error_markers = (
                    "unrecognized command", "invalid input", "% invalid",
                    "ambiguous command", "syntax error", "unknown command",
                    "command fail", "permission denied",
                )
                if any(marker in lower for marker in error_markers):
                    raise ValueError("Device rejected the allowlisted backup operation")
                if len(output.strip()) < 50:
                    raise ValueError("Configuration output is unexpectedly short")
                logger.info(
                    f"SSH backup read completed for device {device_id} "
                    f"(vendor={_canonical_vendor(vendor)}, size={len(output)} bytes)"
                )
                return output
            except Exception as e:
                logger.error(f"SSH backup failed for device {device_id}: {e}")
                return None

    # ---- Parsers --------------------------------------------------------------
    def _parse_interfaces(
        self, output: str, device_id: int
    ) -> List[InterfaceMetric]:
        interfaces: List[InterfaceMetric] = []
        for line in output.split("\n"):
            parts = line.split()
            if len(parts) < 2:
                continue
            interface_name = parts[0]
            status = parts[1].lower()

            # Skip header/banner lines
            if interface_name.startswith(("Device", "Interface", "Port")):
                continue
            if not any(
                interface_name.startswith(p)
                for p in ("Gi", "Te", "Fa", "Et", "Po", "Xg")
            ):
                continue

            # Map status
            if status == "connected":
                admin_status, oper_status = "up", "up"
            elif status == "notconnect":
                admin_status, oper_status = "up", "down"
            elif status == "disabled" or "admin" in status:
                admin_status, oper_status = "down", "down"
            else:
                admin_status, oper_status = "up", "down"

            # Parse speed
            speed = 0
            for part in parts:
                if "10G" in part:
                    speed = 10_000_000_000
                    break
                if "1000" in part or "10/100/1000" in part:
                    speed = 1_000_000_000
                    break
                if part == "100":
                    speed = 100_000_000
                    break

            if_index = self._parse_interface_index(interface_name)

            interfaces.append(InterfaceMetric(
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
            ))
        return interfaces

    def _parse_uptime(self, output: str) -> int:
        """Parse Cisco IOS uptime. Returns 0 if not found."""
        m = re.search(
            r"uptime is (\d+) year.*?(\d+) week.*?(\d+) day.*?(\d+) hour.*?(\d+) minute",
            output,
            re.IGNORECASE,
        )
        if m:
            years, weeks, days, hours, minutes = map(int, m.groups())
            return (
                years * 365 * 24 * 3600
                + weeks * 7 * 24 * 3600
                + days * 24 * 3600
                + hours * 3600
                + minutes * 60
            )
        return 0

    def _parse_interface_index(self, interface_name: str) -> int:
        type_map = {
            "TenGigabitEthernet": 10200, "Te": 10200,
            "GigabitEthernet": 1000, "Gi": 1000,
            "FastEthernet": 500, "Fa": 500,
        }
        for prefix, base in type_map.items():
            if interface_name.startswith(prefix):
                suffix = interface_name[len(prefix):]
                parts = suffix.split("/")
                try:
                    if len(parts) == 2:
                        return base + int(parts[0]) * 100 + int(parts[1])
                    if len(parts) == 1:
                        return base + int(parts[0])
                except ValueError:
                    return 0
        return 0

    # ---- Shutdown -------------------------------------------------------------
    def close_all(self) -> None:
        """Close every tracked session (for graceful shutdown)."""
        with self._registry_lock:
            sessions = list(self.sessions.values())
            self.sessions.clear()
            self.configs.clear()
        for s in sessions:
            try:
                s.close()
            except Exception:
                pass
        logger.info("All SSH sessions closed")
