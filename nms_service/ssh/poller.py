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

from typing import Dict, List, Optional
from dataclasses import dataclass
from contextlib import contextmanager
import re
import threading
import time

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
        self.client: Optional[paramiko.SSHClient] = None
        self.channel = None
        self._lock = threading.Lock()  # prevents double-connect/close

    # ---- Config identity check ------------------------------------------------
    def is_same_config(self, cfg: SSHDeviceConfig) -> bool:
        """Return True if cfg has identical connection parameters."""
        return (
            self.ip_address == cfg.ip_address
            and self.username == cfg.username
            and self.password == cfg.password
            and self.port == cfg.port
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
                client = paramiko.SSHClient()
                client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
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

                # Interactive shell for vendor-specific CLI prompts
                channel = client.invoke_shell()
                time.sleep(1)

                self.client = client
                self.channel = channel

                # Disable pager — swallow any initial MOTD noise
                self._send_command("terminal length 0")

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
                self.channel = None
                return False

    # ---- Command execution ----------------------------------------------------
    def _send_command(self, command: str, wait: float = 2.0) -> str:
        """Send a command on the interactive channel and collect output."""
        if self.channel is None:
            return ""
        try:
            self.channel.send(f"{command}\n")
            time.sleep(wait)
            output = ""
            while self.channel.recv_ready():
                output += self.channel.recv(65535).decode(errors="replace")
            return output
        except Exception as e:
            logger.warning(
                f"SSH send failed on {self.device_name}: {e}"
            )
            return ""

    def execute_command(self, command: str) -> str:
        """Execute a command — caller must have called connect()."""
        if self.client is None:
            logger.warning(
                f"execute_command called on closed session: {self.device_name}"
            )
            return ""
        return self._send_command(command)

    # ---- Close ----------------------------------------------------------------
    def close(self) -> None:
        """Idempotent, exception-safe close. Always nulls refs and releases slot."""
        with self._lock:
            if self.client is None and self.channel is None:
                return  # already closed

            had_slot = self.client is not None

            # Best-effort channel close
            if self.channel is not None:
                try:
                    self.channel.close()
                except Exception:
                    pass
                self.channel = None

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
                output = session.execute_command("show interfaces status")
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
                output = session.execute_command("show version")
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
    def backup_running_config(
        self, device_id: int, vendor: str = "cisco"
    ) -> Optional[str]:
        """Stateless config backup: connect -> show/display config -> close.

        Returns raw config text on success, None on failure.
        Vendor-aware: tries the primary command for the given vendor, and
        automatically falls back to other dialects if the device rejects it.
        """
        v = (vendor or "cisco").strip().lower()

        # Primary command per vendor dialect. Ordered list of fallbacks if the
        # device rejects the first one with "Unrecognized command" / etc.
        CISCO = "show running-config"
        HP_COMWARE = "display current-configuration"
        HUAWEI = "display current-configuration"
        JUNIPER = "show configuration | display set | no-more"

        if v in ("cisco", "cisco_ios", "ios", "cisco_xe", "iosxe", "cisco_nxos", "nxos", "arista", "eos"):
            candidates = [CISCO, HP_COMWARE]
        elif v in ("hp", "hpe", "comware", "h3c", "3com", "procurve"):
            candidates = [HP_COMWARE, CISCO]
        elif v in ("huawei", "vrp"):
            candidates = [HUAWEI, CISCO]
        elif v in ("juniper", "junos"):
            candidates = [JUNIPER, CISCO, HP_COMWARE]
        else:
            # Unknown vendor: try the two most common dialects
            candidates = [CISCO, HP_COMWARE, JUNIPER]

        # Error markers that mean "this CLI doesn't understand the command"
        ERROR_MARKERS = (
            "unrecognized command",
            "invalid input",
            "% invalid",
            "ambiguous command",
            "syntax error",
            "unknown command",
        )

        # Pager prompts that mean "press space to continue"
        PAGER_MARKERS = (
            "---- more ----",
            "--more--",
            " --more-- ",
            "<--- more --->",
            " more ",
        )

        def _looks_like_error(text: str) -> bool:
            lower = text.lower()
            return any(m in lower for m in ERROR_MARKERS)

        def _has_pager(text: str) -> bool:
            # Check only the tail to avoid false positives on keyword "more" in config
            tail = text[-200:].lower()
            return any(m in tail for m in PAGER_MARKERS)

        with self._stateless_session(device_id) as session:
            if session is None:
                logger.warning(
                    f"SSH backup: cannot acquire session for device {device_id}"
                )
                return None
            try:
                # Vendor-specific pre-commands to disable pager / enable full output
                if v in ("hp", "hpe", "comware", "h3c", "3com"):
                    session._send_command("screen-length disable", wait=1.0)
                elif v in ("huawei", "vrp"):
                    session._send_command("screen-length 0 temporary", wait=1.0)
                else:
                    # Cisco / Arista / Juniper generic: already sent 'terminal length 0'
                    pass

                last_output = ""
                for cmd in candidates:
                    output = session._send_command(cmd, wait=3.0)
                    # Drain remaining buffer; advance the pager by sending space
                    # until no 'more' prompt is seen or a safety cap is reached.
                    MAX_PAGER_STEPS = 200  # enough for very large configs
                    for _ in range(MAX_PAGER_STEPS):
                        time.sleep(0.6)
                        if session.channel is None:
                            break
                        # Drain any available bytes
                        while session.channel.recv_ready():
                            try:
                                output += session.channel.recv(65535).decode(errors="replace")
                            except Exception:
                                break
                        if _has_pager(output):
                            # Send space to advance the pager
                            try:
                                session.channel.send(" ")
                            except Exception:
                                break
                            continue
                        # No pager and no more data ready -> give it one more tick
                        time.sleep(0.8)
                        if session.channel.recv_ready():
                            continue
                        break

                    # Strip pager markers from final output (case-insensitive)
                    for m in PAGER_MARKERS:
                        output = re.sub(re.escape(m), "", output, flags=re.IGNORECASE)
                    # Strip ANSI escape sequences left by the pager (cursor ops)
                    output = _ANSI_RE.sub("", output)
                    last_output = output
                    if _looks_like_error(output):
                        logger.info(
                            f"SSH backup: device {device_id} rejected '{cmd}', "
                            f"trying next dialect"
                        )
                        continue
                    if output and len(output.strip()) >= 50:
                        logger.info(
                            f"SSH backup OK for device {device_id} via '{cmd}' "
                            f"(size={len(output)} bytes)"
                        )
                        return output

                logger.warning(
                    f"SSH backup: all command dialects failed for device {device_id} "
                    f"(last_len={len(last_output)})"
                )
                return None
            except Exception as e:
                logger.error(
                    f"SSH backup FAILED for device {device_id}: {e}"
                )
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
