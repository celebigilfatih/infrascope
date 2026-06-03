#!/usr/bin/env python3
"""Host-side SNMP poller for InfraScope NMS

Runs on the macOS HOST (not inside Docker) to bypass the known
macOS Docker Desktop UDP routing bug that causes intermittent SNMP timeouts.

Uses native macOS snmpbulkwalk / snmpget (net-snmp) which have reliable
UDP access to the physical network.

Usage:
    python3 scripts/snmp_host_poller.py              # one-shot poll all devices
    python3 scripts/snmp_host_poller.py --daemon      # continuous polling loop
    python3 scripts/snmp_host_poller.py --device 10.5.0.66  # poll one device

DB connection: reads DATABASE_URL from .env or defaults to localhost:5434.
"""

import os
import re
import sys
import time
import uuid
import subprocess
import argparse
import logging
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Optional, Tuple, Any

import psycopg2
from psycopg2.extras import execute_values

# ── Logging ──────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("snmp-host-poller")

# ── Config ───────────────────────────────────────────────────────────────
SNMP_TIMEOUT = 3       # seconds per attempt
SNMP_RETRIES = 1       # number of retries
MAX_WORKERS = 10       # concurrent device polls
POLL_INTERVAL = 60     # seconds between daemon cycles
BULK_REPETITIONS = 25  # snmpbulkwalk -Cr


def load_env() -> str:
    """Load DATABASE_URL from .env file or environment."""
    env_file = os.path.join(os.path.dirname(__file__), "..", ".env.local")
    if not os.path.exists(env_file):
        env_file = os.path.join(os.path.dirname(__file__), "..", ".env")
    if os.path.exists(env_file):
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    v = v.strip().strip('"').strip("'")
                    os.environ.setdefault(k.strip(), v)

    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        # Fallback: compose dev DB
        user = os.environ.get("DB_USER", "infrascope")
        pwd = os.environ.get("DB_PASSWORD", "infrascope-dev")
        db = os.environ.get("DB_NAME", "infrascope")
        db_url = f"postgresql://{user}:{pwd}@localhost:5434/{db}"
    else:
        # Replace Docker-internal host with localhost
        db_url = db_url.replace("@db:", "@localhost:5434")
        if ":5432/" in db_url and "localhost" in db_url:
            db_url = db_url.replace(":5432/", ":5434/")
    # Strip query params (e.g. ?schema=public) — psycopg2 doesn't accept them
    if "?" in db_url:
        db_url = db_url.split("?")[0]
    return db_url


def generate_cuid() -> str:
    """Generate a simple CUID-like unique ID."""
    return f"c{uuid.uuid4().hex[:24]}"


# ── SNMP CLI wrappers ────────────────────────────────────────────────────

def snmpget(community: str, ip: str, port: int, oids: List[str],
            timeout: int = SNMP_TIMEOUT, retries: int = SNMP_RETRIES) -> Dict[str, str]:
    """Run snmpget for one or more OIDs. Returns {oid: value}."""
    cmd = [
        "snmpget", "-v", "2c", "-c", community,
        "-t", str(timeout), "-r", str(retries),
        "-Oqn", f"{ip}:{port}", *oids,
    ]
    results = {}
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True,
                              timeout=timeout * (retries + 1) + 5)
        if proc.returncode != 0:
            return results
        for line in proc.stdout.strip().splitlines():
            if not line:
                continue
            parts = line.split(" ", 1)
            if len(parts) >= 2:
                oid_key = parts[0].lstrip(".")
                results[oid_key] = parts[1].strip().strip('"')
    except subprocess.TimeoutExpired:
        pass
    return results


def snmpbulkwalk(community: str, ip: str, port: int, oid: str,
                 timeout: int = SNMP_TIMEOUT, retries: int = SNMP_RETRIES) -> Dict[str, str]:
    """Run snmpbulkwalk on an OID subtree. Returns {oid: value}."""
    cmd = [
        "snmpbulkwalk", "-v", "2c", "-c", community,
        "-t", str(timeout), "-r", str(retries),
        "-Oqn", f"-Cr{BULK_REPETITIONS}",
        f"{ip}:{port}", oid,
    ]
    results = {}
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True,
                              timeout=timeout * (retries + 1) + 10)
        if proc.returncode != 0:
            return results
        for line in proc.stdout.strip().splitlines():
            if not line:
                continue
            parts = line.split(" ", 1)
            if len(parts) >= 2:
                oid_key = parts[0].lstrip(".")
                if not oid_key.startswith(oid):
                    break
                results[oid_key] = parts[1].strip().strip('"')
    except subprocess.TimeoutExpired:
        pass
    return results


def safe_int(val: Optional[str], default: int = 0) -> int:
    if val is None:
        return default
    try:
        s = str(val).strip()
        if not s or any(c.isalpha() for c in s if c not in '.-'):
            return default
        return int(float(s))
    except (ValueError, TypeError):
        return default


# ── Interface polling ────────────────────────────────────────────────────

IF_INDEX_OID = "1.3.6.1.2.1.2.2.1.1"
IF_DESCR_OID = "1.3.6.1.2.1.2.2.1.2"
IF_TYPE_OID = "1.3.6.1.2.1.2.2.1.3"
IF_MTU_OID = "1.3.6.1.2.1.2.2.1.4"
IF_SPEED_OID = "1.3.6.1.2.1.2.2.1.5"
IF_ADMIN_OID = "1.3.6.1.2.1.2.2.1.7"
IF_OPER_OID = "1.3.6.1.2.1.2.2.1.8"
IF_IN_OCTETS_OID = "1.3.6.1.2.1.2.2.1.10"
IF_IN_ERRORS_OID = "1.3.6.1.2.1.2.2.1.14"
IF_OUT_OCTETS_OID = "1.3.6.1.2.1.2.2.1.16"
IF_OUT_ERRORS_OID = "1.3.6.1.2.1.2.2.1.20"

# Walk all interface table columns at once (efficient)
WALK_OIDS = [
    IF_INDEX_OID, IF_DESCR_OID, IF_MTU_OID, IF_SPEED_OID,
    IF_ADMIN_OID, IF_OPER_OID, IF_IN_OCTETS_OID, IF_IN_ERRORS_OID,
    IF_OUT_OCTETS_OID, IF_OUT_ERRORS_OID,
]


def poll_device_interfaces(community: str, ip: str, port: int = 161,
                           device_name: str = "") -> List[Dict[str, Any]]:
    """Poll all interfaces for a single device via SNMP bulk walk.

    Returns list of dicts ready for DB upsert.
    """
    # Walk all columns in parallel (each walk is a separate process)
    walk_results: Dict[str, Dict[str, str]] = {}
    with ThreadPoolExecutor(max_workers=len(WALK_OIDS)) as pool:
        futures = {
            pool.submit(snmpbulkwalk, community, ip, port, oid): oid
            for oid in WALK_OIDS
        }
        for fut in as_completed(futures):
            oid = futures[fut]
            try:
                walk_results[oid] = fut.result()
            except Exception:
                walk_results[oid] = {}

    # Extract interface indices from ifIndex walk
    indices_data = walk_results.get(IF_INDEX_OID, {})
    if not indices_data:
        log.warning(f"No interfaces found for {device_name} ({ip})")
        return []

    interfaces = []
    for idx_oid, idx_val in indices_data.items():
        try:
            iface_idx = int(idx_val)
        except (ValueError, TypeError):
            continue

        # Helper to extract value for this index from walk results
        def get_val(oid_base: str, default: str = "") -> str:
            key = f"{oid_base}.{iface_idx}"
            return walk_results.get(oid_base, {}).get(key, default)

        admin_int = safe_int(get_val(IF_ADMIN_OID, "1"), 1)
        oper_int = safe_int(get_val(IF_OPER_OID, "2"), 2)

        desc = get_val(IF_DESCR_OID, f"Interface {iface_idx}")
        # Clean up "No Such Object" errors
        if "No Such" in desc or "No more" in desc:
            desc = f"Interface {iface_idx}"

        interfaces.append({
            "interface_index": iface_idx,
            "interface_name": f"if{iface_idx}",
            "description": desc,
            "admin_status": "up" if admin_int == 1 else "down",
            "oper_status": "up" if oper_int == 1 else "down",
            "speed": safe_int(get_val(IF_SPEED_OID)),
            "in_octets": safe_int(get_val(IF_IN_OCTETS_OID)),
            "out_octets": safe_int(get_val(IF_OUT_OCTETS_OID)),
            "in_errors": safe_int(get_val(IF_IN_ERRORS_OID)),
            "out_errors": safe_int(get_val(IF_OUT_ERRORS_OID)),
            "mtu": safe_int(get_val(IF_MTU_OID, "1500"), 1500),
        })

    log.info(f"Polled {len(interfaces)} interfaces for {device_name} ({ip})")
    return interfaces


# ── Health polling (sysDescr, uptime, CPU, memory) ──────────────────────

def poll_device_health(community: str, ip: str, port: int = 161,
                       device_name: str = "", vendor: str = "generic") -> Optional[Dict[str, Any]]:
    """Poll health metrics: uptime, CPU, memory, temperature."""
    # System basics
    basics = snmpget(community, ip, port, [
        "1.3.6.1.2.1.1.3.0",  # sysUpTime
        "1.3.6.1.2.1.1.5.0",  # sysName
    ])
    uptime_raw = basics.get("1.3.6.1.2.1.1.3.0")
    if uptime_raw is None:
        return None

    # Parse uptime: could be raw integer (timeticks) or formatted "D:H:M:S.ss"
    uptime_seconds = 0
    try:
        if ":" in str(uptime_raw):
            # Format: days:hours:minutes:seconds.hundredths
            parts = str(uptime_raw).split(":")
            days = int(parts[0])
            hours = int(parts[1])
            minutes = int(parts[2])
            secs = float(parts[3])
            uptime_seconds = days * 86400 + hours * 3600 + minutes * 60 + int(secs)
        else:
            uptime_seconds = int(int(uptime_raw) * 0.01)
    except (ValueError, IndexError):
        uptime_seconds = 0

    cpu_usage = None
    memory_usage = None
    temperature = None

    if vendor.lower() == "cisco":
        health_oids = [
            "1.3.6.1.4.1.9.9.109.1.1.1.1.5.1",  # CPU 1-min
            "1.3.6.1.4.1.9.9.48.1.1.1.5.1",      # mem used
            "1.3.6.1.4.1.9.9.48.1.1.1.6.1",      # mem free
        ]
        vals = snmpget(community, ip, port, health_oids)

        cpu_raw = vals.get("1.3.6.1.4.1.9.9.109.1.1.1.1.5.1")
        if cpu_raw:
            try:
                cpu_usage = float(cpu_raw)
            except (ValueError, TypeError):
                pass

        m_used = safe_int(vals.get("1.3.6.1.4.1.9.9.48.1.1.1.5.1"), -1)
        m_free = safe_int(vals.get("1.3.6.1.4.1.9.9.48.1.1.1.6.1"), -1)
        if m_used >= 0 and m_free >= 0 and (m_used + m_free) > 0:
            memory_usage = (m_used / (m_used + m_free)) * 100

    return {
        "uptime_seconds": uptime_seconds,
        "cpu_usage": cpu_usage,
        "memory_usage": memory_usage,
        "temperature": temperature,
    }


# ── DB upsert ────────────────────────────────────────────────────────────

UPSERT_INTERFACE_SQL = """
    INSERT INTO nms_interfaces
        (id, nms_device_id, interface_index, interface_name, description,
         admin_status, oper_status, speed, in_octets, out_octets,
         in_errors, out_errors, mtu, down_since, oper_up_since,
         last_polled_at, created_at, updated_at)
    VALUES
        (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (nms_device_id, interface_index) DO UPDATE SET
        interface_name = EXCLUDED.interface_name,
        description = EXCLUDED.description,
        admin_status = EXCLUDED.admin_status,
        oper_status = EXCLUDED.oper_status,
        speed = EXCLUDED.speed,
        in_octets = EXCLUDED.in_octets,
        out_octets = EXCLUDED.out_octets,
        in_errors = EXCLUDED.in_errors,
        out_errors = EXCLUDED.out_errors,
        mtu = EXCLUDED.mtu,
        down_since = CASE
            WHEN nms_interfaces.oper_status = 'up' AND EXCLUDED.oper_status = 'down'
                THEN EXCLUDED.last_polled_at
            WHEN EXCLUDED.oper_status = 'up'
                THEN NULL
            WHEN nms_interfaces.down_since IS NULL AND EXCLUDED.oper_status = 'down'
                THEN EXCLUDED.last_polled_at
            ELSE nms_interfaces.down_since
        END,
        oper_up_since = CASE
            WHEN EXCLUDED.oper_status = 'up'
                THEN EXCLUDED.last_polled_at
            ELSE nms_interfaces.oper_up_since
        END,
        last_polled_at = EXCLUDED.last_polled_at,
        updated_at = EXCLUDED.updated_at
"""

UPSERT_HEALTH_SQL = """
    INSERT INTO nms_health_metrics
        (id, nms_device_id, uptime_seconds, cpu_usage, memory_usage,
         temperature, collected_at, created_at)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
"""

UPDATE_LAST_POLLED_SQL = """
    UPDATE devices SET last_polled_at = %s WHERE nms_device_id = %s
"""


def upsert_device_results(conn, nms_device_id: int, interfaces: List[Dict],
                          health: Optional[Dict], now: datetime):
    """Write interface + health results to PostgreSQL."""
    cur = conn.cursor()
    try:
        # Batch upsert interfaces
        for iface in interfaces:
            params = (
                generate_cuid(),
                nms_device_id,
                iface["interface_index"],
                iface["interface_name"],
                iface["description"],
                iface["admin_status"],
                iface["oper_status"],
                iface["speed"],
                iface["in_octets"],
                iface["out_octets"],
                iface["in_errors"],
                iface["out_errors"],
                iface["mtu"],
                now if iface["oper_status"] == "down" else None,
                now if iface["oper_status"] == "up" else None,
                now, now, now,
            )
            cur.execute(UPSERT_INTERFACE_SQL, params)

        # Insert health metrics
        if health:
            cur.execute(UPSERT_HEALTH_SQL, (
                generate_cuid(),
                nms_device_id,
                health.get("uptime_seconds"),
                health.get("cpu_usage"),
                health.get("memory_usage"),
                health.get("temperature"),
                now, now,
            ))

        # Update last_polled_at
        cur.execute(UPDATE_LAST_POLLED_SQL, (now, nms_device_id))

        conn.commit()
    except Exception as e:
        conn.rollback()
        log.error(f"DB upsert failed for device {nms_device_id}: {e}")
        raise


# ── Main orchestration ───────────────────────────────────────────────────

def get_devices(conn, target_ip: Optional[str] = None) -> List[Dict]:
    """Query polling-enabled devices from DB."""
    cur = conn.cursor()
    if target_ip:
        cur.execute("""
            SELECT nms_device_id, name, management_ip, snmp_community, snmp_port, vendor
            FROM devices
            WHERE polling_enabled = true AND nms_device_id IS NOT NULL
              AND management_ip = %s
        """, (target_ip,))
    else:
        cur.execute("""
            SELECT nms_device_id, name, management_ip, snmp_community, snmp_port, vendor
            FROM devices
            WHERE polling_enabled = true AND nms_device_id IS NOT NULL
              AND management_ip IS NOT NULL
        """)
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def poll_one_device(db_url: str, device: Dict) -> Tuple[int, int, bool]:
    """Poll one device: SNMP interfaces + health, then upsert to DB.
    Returns (nms_device_id, interface_count, success).
    """
    nms_id = device["nms_device_id"]
    name = device["name"]
    ip = device["management_ip"]
    community = device["snmp_community"] or "public"
    port = device["snmp_port"] or 161
    vendor = device["vendor"] or "generic"

    try:
        # Quick reachability check
        test = snmpget(community, ip, port, ["1.3.6.1.2.1.1.3.0"])
        if not test:
            log.warning(f"SNMP unreachable: {name} ({ip})")
            return (nms_id, 0, False)

        # Poll interfaces
        interfaces = poll_device_interfaces(community, ip, port, name)

        # Poll health
        health = poll_device_health(community, ip, port, name, vendor)

        # Write to DB (each thread gets its own connection)
        now = datetime.now(timezone.utc).replace(tzinfo=None)  # naive UTC for DB compat
        conn = psycopg2.connect(db_url)
        try:
            upsert_device_results(conn, nms_id, interfaces, health, now)
        finally:
            conn.close()

        return (nms_id, len(interfaces), True)

    except Exception as e:
        log.error(f"Poll failed for {name} ({ip}): {e}")
        return (nms_id, 0, False)


def run_poll_cycle(db_url: str, target_ip: Optional[str] = None, max_workers: int = MAX_WORKERS):
    """Run one full poll cycle across all devices."""
    conn = psycopg2.connect(db_url)
    try:
        devices = get_devices(conn, target_ip)
        if not devices:
            log.warning("No polling-enabled devices found")
            return

        log.info(f"Starting poll cycle for {len(devices)} devices (from host)")
        total_ok = 0
        total_fail = 0
        total_ifaces = 0

        with ThreadPoolExecutor(max_workers=max_workers) as pool:
            futures = {
                pool.submit(poll_one_device, db_url, dev): dev
                for dev in devices
            }
            for fut in as_completed(futures):
                dev = futures[fut]
                try:
                    nms_id, iface_count, success = fut.result()
                    if success:
                        total_ok += 1
                        total_ifaces += iface_count
                    else:
                        total_fail += 1
                except Exception as e:
                    log.error(f"Thread error for {dev['name']}: {e}")
                    total_fail += 1

        log.info(
            f"Poll cycle done: {total_ok} OK, {total_fail} failed, "
            f"{total_ifaces} interfaces total"
        )
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description="Host-side SNMP poller for InfraScope NMS")
    parser.add_argument("--daemon", action="store_true", help="Run continuously")
    parser.add_argument("--device", type=str, help="Poll single device by IP")
    parser.add_argument("--interval", type=int, default=POLL_INTERVAL,
                        help=f"Daemon poll interval in seconds (default {POLL_INTERVAL})")
    parser.add_argument("--workers", type=int, default=MAX_WORKERS,
                        help=f"Max concurrent device polls (default {MAX_WORKERS})")
    args = parser.parse_args()

    max_workers = args.workers

    db_url = load_env()
    log.info(f"DB: {db_url.split('@')[1] if '@' in db_url else 'configured'}")

    if args.daemon:
        log.info(f"Running in daemon mode (interval={args.interval}s)")
        while True:
            try:
                run_poll_cycle(db_url, args.device, max_workers)
            except Exception as e:
                log.error(f"Poll cycle error: {e}")
            time.sleep(args.interval)
    else:
        run_poll_cycle(db_url, args.device, max_workers)


if __name__ == "__main__":
    main()
