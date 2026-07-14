"""SNMP device communication engine — CLI-based (net-snmp)

Uses subprocess calls to snmpget / snmpbulkwalk instead of pysnmp.
This eliminates Python GIL contention and pysnmp internal serialization
that caused ThreadPoolExecutor poll cycles to run for hours.

Each SNMP call spawns an independent OS process → true parallelism.
"""

import re
import subprocess
from typing import Dict, Optional, Any, List

from nms_service.core.logger import logger
from nms_service.core.config import config


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
    """Manages SNMP sessions with a single device via CLI tools (snmpget/snmpbulkwalk)"""

    def __init__(
        self,
        device_id: int,
        device_name: str,
        ip_address: str,
        community_string: str = "",
        version: str = "2c",
        port: int = 161,
        timeout: int = None,
        retries: int = None,
        v3_username: str = "",
        v3_security_level: str = "authPriv",
        v3_auth_protocol: str = "SHA",
        v3_auth_password: str = "",
        v3_privacy_protocol: str = "AES",
        v3_privacy_password: str = "",
    ):
        self.device_id = device_id
        self.device_name = device_name
        self.ip_address = ip_address
        self.community_string = community_string
        normalized_version = (version or "2c").lower()
        if normalized_version not in ("1", "v1", "2c", "v2c", "3", "v3"):
            raise SNMPAuthError("Unsupported SNMP version")
        self.version = (
            "1" if normalized_version in ("1", "v1")
            else "3" if normalized_version in ("3", "v3")
            else "2c"
        )
        self.v3_username = v3_username.strip()
        self.v3_security_level = v3_security_level
        self.v3_auth_protocol = self._normalize_auth_protocol(v3_auth_protocol)
        self.v3_auth_password = v3_auth_password
        self.v3_privacy_protocol = self._normalize_privacy_protocol(v3_privacy_protocol)
        self.v3_privacy_password = v3_privacy_password
        if self.version == "3":
            if self.v3_security_level not in ("authNoPriv", "authPriv"):
                raise SNMPAuthError("SNMPv3 security level must be authNoPriv or authPriv")
            if not self.v3_username:
                raise SNMPAuthError("SNMPv3 username is required")
            if len(self.v3_auth_password) < 8:
                raise SNMPAuthError("SNMPv3 authentication password must contain at least 8 characters")
            if self.v3_security_level == "authPriv" and len(self.v3_privacy_password) < 8:
                raise SNMPAuthError("SNMPv3 privacy password must contain at least 8 characters")
        elif not community_string:
            raise SNMPAuthError("SNMP community is required for SNMPv1/v2c")
        self.port = port
        self.timeout = timeout if timeout is not None else config.snmp.snmp_timeout
        self.retries = retries if retries is not None else config.snmp.snmp_retries

    # ── helpers ───────────────────────────────────────────────────────────

    def _subprocess_timeout(self) -> int:
        """Max wall-clock seconds to wait for a single snmp* subprocess."""
        return self.timeout * (self.retries + 1) + 5

    @staticmethod
    def _normalize_auth_protocol(value: str) -> str:
        protocols = {
            "sha": "SHA",
            "sha1": "SHA",
            "sha-1": "SHA",
            "sha256": "SHA-256",
            "sha-256": "SHA-256",
        }
        normalized = protocols.get((value or "SHA").strip().lower())
        if not normalized:
            raise SNMPAuthError("SNMPv3 authentication protocol is not supported")
        return normalized

    @staticmethod
    def _normalize_privacy_protocol(value: str) -> str:
        protocols = {"aes": "AES", "aes128": "AES", "aes-128": "AES"}
        normalized = protocols.get((value or "AES").strip().lower())
        if not normalized:
            raise SNMPAuthError("SNMPv3 privacy protocol is not supported")
        return normalized

    def _base_args(self) -> List[str]:
        """Common CLI flags shared by snmpget / snmpbulkwalk."""
        if self.version == "3":
            args = [
                "-v", "3",
                "-l", self.v3_security_level,
                "-u", self.v3_username,
                "-a", self.v3_auth_protocol,
                "-A", self.v3_auth_password,
            ]
            if self.v3_security_level == "authPriv":
                args.extend([
                    "-x", self.v3_privacy_protocol,
                    "-X", self.v3_privacy_password,
                ])
            return [*args, "-t", str(self.timeout), "-r", str(self.retries)]
        return [
            "-v", self.version,
            "-c", self.community_string,
            "-t", str(self.timeout),
            "-r", str(self.retries),
        ]

    @staticmethod
    def _parse_cli_value(raw: str) -> Any:
        """Convert a net-snmp quick-print value to a Python type.

        Input examples (with -Oq):
            "1"
            "GigabitEthernet0/1"
            "No Such Object available on this agent at this OID"
            "No Such Instance currently exists at this OID"
        """
        if not raw:
            return None
        # net-snmp error sentinels
        if "No Such" in raw or "No more" in raw:
            return None
        raw = raw.strip().strip('"')
        # Try integer
        if raw.isdigit():
            return int(raw)
        try:
            return int(raw)
        except ValueError:
            pass
        # Try float
        try:
            return float(raw)
        except ValueError:
            pass
        return raw

    # ── public API (same interface as the old pysnmp-based session) ───────

    def get(self, oid: str) -> Optional[Any]:
        """Get a single OID value via snmpget.

        Returns:
            Parsed value, or None on failure.
        """
        cmd = [
            "snmpget",
            *self._base_args(),
            "-Oqv",                         # quick-print, value only
            f"{self.ip_address}:{self.port}",
            oid,
        ]
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=self._subprocess_timeout(),
            )
            if result.returncode != 0:
                stderr = result.stderr.strip()
                if "Timeout" in stderr:
                    raise SNMPError(f"SNMP get failed: No SNMP response received before timeout")
                raise SNMPError(f"SNMP get failed: {stderr}")
            return self._parse_cli_value(result.stdout.strip())
        except subprocess.TimeoutExpired:
            logger.error(f"SNMP get subprocess timeout for {self.device_name}")
            raise SNMPError(f"SNMP get failed: No SNMP response received before timeout")
        except SNMPError:
            raise
        except Exception as e:
            logger.error(f"SNMP get operation failed for {self.device_name}: {e}")
            raise SNMPError(f"SNMP operation failed: {e}")

    def get_multiple(self, oids: List[str]) -> Dict[str, Optional[Any]]:
        """Get multiple OID values in a single snmpget call.

        Returns:
            Dict mapping each requested OID → parsed value (or None).
        """
        results: Dict[str, Optional[Any]] = {oid: None for oid in oids}
        if not oids:
            return results

        cmd = [
            "snmpget",
            *self._base_args(),
            "-Oqn",                          # quick-print, numeric OIDs
            f"{self.ip_address}:{self.port}",
            *oids,
        ]
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=self._subprocess_timeout(),
            )
            if proc.returncode != 0:
                stderr = proc.stderr.strip()
                if "Timeout" in stderr:
                    logger.error(f"SNMP get_multiple timeout for {self.device_name}")
                return results

            for line in proc.stdout.strip().splitlines():
                if not line:
                    continue
                parts = line.split(" ", 1)
                if len(parts) < 2:
                    continue
                oid_key = parts[0].lstrip(".")
                val = self._parse_cli_value(parts[1])
                results[oid_key] = val

        except subprocess.TimeoutExpired:
            logger.error(f"SNMP get_multiple subprocess timeout for {self.device_name}")
        except Exception as e:
            logger.error(f"SNMP get_multiple failed for {self.device_name}: {e}")

        return results

    def walk(self, oid: str) -> Dict[str, Any]:
        """Walk OID subtree via snmpbulkwalk.

        Returns:
            Dict mapping full numeric OIDs → parsed values.
        """
        cmd = [
            "snmpbulkwalk",
            *self._base_args(),
            "-Oqn",                          # quick-print, numeric OIDs
            "-Cr25",                         # max-repetitions 25
            f"{self.ip_address}:{self.port}",
            oid,
        ]
        results: Dict[str, Any] = {}
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=self._subprocess_timeout(),
            )
            if proc.returncode != 0:
                stderr = proc.stderr.strip()
                if "Timeout" in stderr:
                    logger.warning(f"SNMP walk error for {self.device_name}: No SNMP response received before timeout")
                return results

            for line in proc.stdout.strip().splitlines():
                if not line:
                    continue
                parts = line.split(" ", 1)
                if len(parts) < 2:
                    continue
                oid_key = parts[0].lstrip(".")
                # Stop if we've walked past the requested subtree
                if not oid_key.startswith(oid):
                    break
                results[oid_key] = self._parse_cli_value(parts[1])

            logger.debug(
                f"SNMP walk completed for {self.device_name}, "
                f"collected {len(results)} OIDs"
            )

        except subprocess.TimeoutExpired:
            logger.warning(f"SNMP walk error for {self.device_name}: No SNMP response received before timeout")
        except Exception as e:
            logger.error(f"SNMP walk operation failed for {self.device_name}: {e}")

        return results

    def close(self) -> None:
        """No-op: CLI sessions have no persistent state."""
        pass

    def __repr__(self) -> str:
        return (
            f"SNMPSession(device_id={self.device_id}, "
            f"name={self.device_name}, ip={self.ip_address})"
        )

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
