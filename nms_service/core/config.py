"""Configuration management for NMS service (InfraScope-integrated)

Reads DATABASE_URL from environment (same as InfraScope Next.js app).
No separate API config — NMS writes directly to shared PostgreSQL.
"""

import os
from dataclasses import dataclass, field
from pathlib import Path
from sqlalchemy.engine import URL, make_url


@dataclass
class DatabaseConfig:
    """PostgreSQL database configuration"""
    host: str
    port: int
    username: str
    password: str
    database: str
    pool_size: int = 10
    max_overflow: int = 20
    options: dict = field(default_factory=dict)

    @property
    def connection_string(self) -> str:
        """Generate SQLAlchemy connection string"""
        return URL.create('postgresql', username=self.username, password=self.password,
                          host=self.host, port=self.port, database=self.database,
                          query=self.options).render_as_string(hide_password=False)


@dataclass
class SNMPConfig:
    """SNMP global configuration"""
    snmp_timeout: int = 3           # shorter probe; fail-fast to SSH fallback
    snmp_retries: int = 1           # at most one retry -> ~ (timeout * 2)
    max_concurrent_pollers: int = 20
    bulk_walk_enabled: bool = True


@dataclass
class SSHConfig:
    """SSH global configuration"""
    ssh_username: str = "admin"
    ssh_password: str = "admin"
    ssh_timeout: int = 10
    ssh_port: int = 22


@dataclass
class PollingConfig:
    """Polling interval configuration"""
    interface_poll_interval: int = 30      # seconds
    cpu_memory_poll_interval: int = 300    # 5 minutes
    inventory_poll_interval: int = 3600   # 1 hour
    topology_poll_interval: int = 3600    # 1 hour


@dataclass
class AlarmConfig:
    """Raw metric thresholds — for NMS reference only.
    
    Actual alarm evaluation is done by the TypeScript detection engine.
    These values are stored as metadata in nms_health_metrics for TS to read.
    """
    cpu_threshold: float = 80.0
    memory_threshold: float = 80.0
    temperature_threshold: float = 80.0


class Config:
    """Main configuration class"""

    def __init__(self):
        self.env = os.getenv("NMS_ENV", "development")
        self.debug = os.getenv("NMS_DEBUG", "false").lower() == "true"
        self.log_level = os.getenv("NMS_LOG_LEVEL", "INFO")

        # Parse DATABASE_URL if set (format: postgresql://user:pass@host:port/db)
        database_url = os.getenv("DATABASE_URL", "")
        if database_url and database_url.startswith("postgresql://"):
            url = make_url(database_url)
            self.database = DatabaseConfig(
                host=url.host or 'localhost', port=url.port or 5432,
                username=url.username or '', password=url.password or '', database=url.database or '',
                options={name: value for name, value in url.query.items() if name in (
                    'sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'connect_timeout', 'application_name', 'target_session_attrs', 'options'
                )},
            )
        else:
            # Fallback to individual env vars
            self.database = DatabaseConfig(
                host=os.getenv("DB_HOST", "localhost"),
                port=int(os.getenv("DB_PORT", "5432")),
                username=os.getenv("DB_USER", "infrascope"),
                password=os.getenv("DB_PASSWORD", "infrascope-dev"),
                database=os.getenv("DB_NAME", "infrascope"),
                pool_size=int(os.getenv("DB_POOL_SIZE", "10")),
            )

        # SNMP
        self.snmp = SNMPConfig(
            snmp_timeout=int(os.getenv("SNMP_TIMEOUT", "3")),
            snmp_retries=int(os.getenv("SNMP_RETRIES", "1")),
            max_concurrent_pollers=int(os.getenv("MAX_CONCURRENT_POLLERS", "20")),
        )

        # SSH
        self.ssh_username = os.getenv("SSH_USERNAME", "")
        self.ssh_password = os.getenv("SSH_PASSWORD", "")
        self.ssh_timeout = int(os.getenv("SSH_TIMEOUT", "10"))
        self.ssh_port = int(os.getenv("SSH_PORT", "22"))
        # Cap concurrent SSH TCP connections across the orchestrator
        self.ssh_max_concurrent = int(os.getenv("SSH_MAX_CONCURRENT", "15"))

        # Jitter (seconds) applied to per-device poll schedule to avoid thundering herd
        self.poll_jitter_max = int(os.getenv("POLL_JITTER_MAX", "10"))

        # Dynamic polling intervals (seconds) by device status
        self.poll_interval_snmp_ok = int(os.getenv("POLL_INTERVAL_SNMP_OK", "60"))
        self.poll_interval_ssh_only = int(os.getenv("POLL_INTERVAL_SSH_ONLY", "300"))
        self.poll_interval_unstable = int(os.getenv("POLL_INTERVAL_UNSTABLE", "600"))

        # Polling intervals
        self.polling = PollingConfig(
            interface_poll_interval=int(os.getenv("INTERFACE_POLL_INTERVAL", "30")),
            cpu_memory_poll_interval=int(os.getenv("CPU_MEMORY_POLL_INTERVAL", "300")),
            inventory_poll_interval=int(os.getenv("INVENTORY_POLL_INTERVAL", "3600")),
            topology_poll_interval=int(os.getenv("TOPOLOGY_POLL_INTERVAL", "3600")),
        )

        # Alarm thresholds (used as metadata hints for TS alarm engine)
        self.alarm = AlarmConfig(
            cpu_threshold=float(os.getenv("CPU_THRESHOLD", "80.0")),
            memory_threshold=float(os.getenv("MEMORY_THRESHOLD", "80.0")),
            temperature_threshold=float(os.getenv("TEMPERATURE_THRESHOLD", "80.0")),
        )

        # FastAPI internal port
        self.api_port = int(os.getenv("NMS_API_PORT", "8500"))
        self.internal_token = os.getenv("NMS_INTERNAL_TOKEN", "")

        # Vendor OID mapping path
        self.vendor_oid_config_path = os.getenv(
            "VENDOR_OID_CONFIG_PATH",
            str(Path(__file__).parent.parent / "snmp" / "vendor_oids.json")
        )

    def validate(self) -> None:
        """Validate critical configuration"""
        if not self.database.password and self.env == "production":
            raise ValueError("DB_PASSWORD (or DATABASE_URL) must be set in production")
        if self.env == "production" and not self.internal_token:
            raise ValueError("NMS_INTERNAL_TOKEN must be set in production")
        if self.env == "production":
            from nms_service.security.credentials import _dedicated_key
            _dedicated_key(os.getenv("INTEGRATION_CREDENTIALS_KEY", ""))

    def __repr__(self) -> str:
        return (
            f"Config(env={self.env}, db_host={self.database.host}:{self.database.port}, "
            f"db={self.database.database})"
        )


# Global config instance
config = Config()
