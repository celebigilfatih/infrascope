"""Network Discovery Worker for InfraScope NMS

Async CIDR-range scanner. Stores results in nms_discovery_scans and
nms_discovered_devices using the exact Prisma schema column names.

Usage:
    python -m nms_service.discovery_worker <cidr> <communities_json> <scan_id> [ssh_user] [ssh_pass]
"""

import sys
import os
import ipaddress
import asyncio
import json
import socket
import logging
import uuid
from typing import List, Dict, Any, Optional
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from nms_service.snmp.session import SNMPSession
from nms_service.database.models import db_manager
from sqlalchemy import text

# Logging
log_dir = "/app/logs"
os.makedirs(log_dir, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(os.path.join(log_dir, "discovery.log")),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("discovery")


def gen_cuid() -> str:
    return str(uuid.uuid4())


def sync_check_ssh(ip: str, username: str, password: str) -> Dict[str, str]:
    """Blocking SSH check (runs in thread pool)"""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.5)
            if s.connect_ex((ip, 22)) != 0:
                return {"status": "closed"}
        if username and password:
            try:
                import paramiko
                ssh = paramiko.SSHClient()
                ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
                ssh.connect(ip, username=username, password=password, timeout=2, banner_timeout=2)
                ssh.close()
                return {"status": "success"}
            except Exception:
                return {"status": "failed"}
        return {"status": "open"}
    except Exception:
        return {"status": "closed"}


def sync_check_snmp(ip: str, community: str) -> Optional[Dict[str, Any]]:
    """Blocking SNMP probe (runs in thread pool)"""
    try:
        with SNMPSession(0, "Discovery", ip, community, timeout=0.8, retries=0) as session:
            data = session.get_multiple([".1.3.6.1.2.1.1.1.0", ".1.3.6.1.2.1.1.5.0"])
            sys_descr = data.get(".1.3.6.1.2.1.1.1.0")
            if sys_descr:
                return {
                    "community": community,
                    "hostname": str(data.get(".1.3.6.1.2.1.1.5.0", "") or ""),
                    "sys_descr": str(sys_descr),
                    "status": "success",
                }
    except Exception:
        pass
    return None


async def scan_ip(ip: str, communities: List[str], ssh_user: str = "", ssh_pass: str = "") -> Optional[Dict[str, Any]]:
    """Probe one IP via SNMP + SSH in parallel threads"""
    snmp_tasks = [asyncio.to_thread(sync_check_snmp, ip, c) for c in communities]
    ssh_task = asyncio.to_thread(sync_check_ssh, ip, ssh_user, ssh_pass)
    results = await asyncio.gather(*snmp_tasks, ssh_task)

    ssh_info = results[-1]
    snmp_results = [r for r in results[:-1] if r]

    found = False
    rec: Dict[str, Any] = {
        "ip_address": ip,
        "hostname": None,
        "vendor": "Generic",
        "snmp_community": None,
        "sys_descr": None,
        "snmp_status": "none",
        "ssh_status": ssh_info.get("status", "closed"),
    }

    if snmp_results:
        best = snmp_results[0]
        rec["hostname"] = best["hostname"] or None
        rec["snmp_community"] = best["community"]
        rec["sys_descr"] = best["sys_descr"]
        rec["snmp_status"] = "success"
        sd_lower = best["sys_descr"].lower()
        if "cisco" in sd_lower:
            rec["vendor"] = "Cisco"
        elif any(k in sd_lower for k in ["procurve", "hpe", "aruba"]):
            rec["vendor"] = "HP"
        elif "fortinet" in sd_lower:
            rec["vendor"] = "Fortinet"
        elif "mikrotik" in sd_lower:
            rec["vendor"] = "MikroTik"
        found = True

    if ssh_info.get("status") not in ("closed", "none"):
        found = True

    return rec if found else None


async def run_discovery(
    network_cidr: str,
    communities: List[str],
    scan_id: str,
    ssh_user: str = "",
    ssh_pass: str = "",
) -> None:
    """Scan CIDR range and persist to nms_discovery_scans / nms_discovered_devices"""
    loop = asyncio.get_running_loop()
    loop.set_default_executor(ThreadPoolExecutor(max_workers=500))

    try:
        network = ipaddress.ip_network(network_cidr, strict=False)
    except Exception as e:
        logger.error(f"Invalid CIDR '{network_cidr}': {e}")
        return

    hosts = list(network.hosts())
    total = len(hosts)
    logger.info(f"Scanning {network_cidr} ({total} hosts), scan_id={scan_id}")

    # Initialize scan record
    session = db_manager.get_session()
    try:
        session.execute(
            text("""
                UPDATE nms_discovery_scans
                SET status = 'running', total_hosts = :total, updated_at = NOW()
                WHERE id = :id
            """),
            {"id": scan_id, "total": total},
        )
        session.commit()
    except Exception as e:
        logger.error(f"Failed to init scan record: {e}")
        session.rollback()
    finally:
        session.close()

    found_count = 0
    processed_count = 0
    batch_size = 50

    for i in range(0, total, batch_size):
        batch = hosts[i:i + batch_size]
        tasks = [scan_ip(str(ip), communities, ssh_user, ssh_pass) for ip in batch]
        try:
            batch_results = await asyncio.wait_for(asyncio.gather(*tasks), timeout=30)
        except asyncio.TimeoutError:
            tasks = [scan_ip(str(ip), communities, ssh_user, ssh_pass) for ip in batch]
            batch_results = await asyncio.gather(*tasks, return_exceptions=True)
            batch_results = [r for r in batch_results if r and not isinstance(r, Exception)]

        discovered = [r for r in batch_results if r]
        processed_count += len(batch)
        found_count += len(discovered)

        session = db_manager.get_session()
        try:
            for r in discovered:
                session.execute(
                    text("""
                        INSERT INTO nms_discovered_devices
                            (id, scan_id, ip_address, hostname, vendor, snmp_community,
                             sys_descr, snmp_status, ssh_status, imported, created_at)
                        VALUES
                            (:id, :scan_id, :ip, :hostname, :vendor, :community,
                             :sys_descr, :snmp_status, :ssh_status, false, NOW())
                        ON CONFLICT (scan_id, ip_address) DO UPDATE SET
                            hostname = EXCLUDED.hostname,
                            vendor = EXCLUDED.vendor,
                            snmp_community = EXCLUDED.snmp_community,
                            sys_descr = EXCLUDED.sys_descr,
                            snmp_status = EXCLUDED.snmp_status,
                            ssh_status = EXCLUDED.ssh_status
                    """),
                    {
                        "id": gen_cuid(),
                        "scan_id": scan_id,
                        "ip": r["ip_address"],
                        "hostname": r.get("hostname"),
                        "vendor": r.get("vendor", "Generic"),
                        "community": r.get("snmp_community"),
                        "sys_descr": r.get("sys_descr"),
                        "snmp_status": r.get("snmp_status", "none"),
                        "ssh_status": r.get("ssh_status", "none"),
                    },
                )
            session.execute(
                text("""
                    UPDATE nms_discovery_scans
                    SET processed_hosts = :p, found_devices = :f, updated_at = NOW()
                    WHERE id = :id
                """),
                {"p": processed_count, "f": found_count, "id": scan_id},
            )
            session.commit()
            logger.info(f"Progress: {processed_count}/{total}, found={found_count}")
        except Exception as e:
            logger.error(f"Batch save failed: {e}")
            session.rollback()
        finally:
            session.close()

    # Mark completed
    session = db_manager.get_session()
    try:
        session.execute(
            text("UPDATE nms_discovery_scans SET status = 'completed', updated_at = NOW() WHERE id = :id"),
            {"id": scan_id},
        )
        session.commit()
    finally:
        session.close()

    logger.info(f"Discovery complete. scan_id={scan_id}, found={found_count}/{total}")


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python -m nms_service.discovery_worker <cidr> <communities_json> <scan_id> [ssh_user] [ssh_pass]")
        sys.exit(1)

    arg_cidr = sys.argv[1]
    try:
        arg_communities = json.loads(sys.argv[2])
    except Exception:
        arg_communities = [c.strip() for c in sys.argv[2].strip("[]'\" ").split(",")]

    arg_scan_id = sys.argv[3]
    arg_ssh_user = sys.argv[4] if len(sys.argv) > 4 else ""
    arg_ssh_pass = sys.argv[5] if len(sys.argv) > 5 else ""

    asyncio.run(run_discovery(arg_cidr, arg_communities, arg_scan_id, arg_ssh_user, arg_ssh_pass))
