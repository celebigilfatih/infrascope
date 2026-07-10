"""FastAPI wrapper for NMS service — internal port 8500

Provides HTTP endpoints for Next.js to:
- List polling-enabled devices and their SNMP status
- Trigger on-demand polls for specific devices
- Start network discovery scans and query their progress
- Query latest SNMP metrics

This API is INTERNAL ONLY (Docker network, not internet-exposed).
The main SNMP polling loop runs as a background thread.
"""

import asyncio
import hashlib
import threading
import uuid
from typing import List, Optional, Dict, Any
from datetime import datetime

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import text

from nms_service.core.config import config
from nms_service.core.logger import logger
from nms_service.database.models import db_manager, cuid
from nms_service.database.repository import (
    DeviceRepository,
    MetricsRepository,
    TopologyRepository,
)
from nms_service.orchestrator import NMSOrchestrator
from nms_service.discovery_worker import run_discovery


# ── App setup ─────────────────────────────────────────────────────────────────

app = FastAPI(
    title="InfraScope NMS Service",
    description="Internal SNMP polling and network discovery sidecar",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://web:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Global orchestrator ───────────────────────────────────────────────────────

orchestrator = NMSOrchestrator()
poller_thread: Optional[threading.Thread] = None


# ── Lifecycle ─────────────────────────────────────────────────────────────────

@app.on_event("startup")
def startup_event():
    global poller_thread
    poller_thread = threading.Thread(target=orchestrator.run, daemon=True, name="nms-poller")
    poller_thread.start()
    logger.info("NMS background polling thread started")


@app.on_event("shutdown")
def shutdown_event():
    orchestrator.shutdown()


# ── Schemas ───────────────────────────────────────────────────────────────────

class DiscoveryRequest(BaseModel):
    cidr: str
    communities: List[str] = ["public"]
    ssh_user: str = ""
    ssh_pass: str = ""


class BackupRequest(BaseModel):
    backup_type: str = "Running Config"
    description: Optional[str] = None


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "poller_alive": poller_thread is not None and poller_thread.is_alive(),
        "registered_devices": len(orchestrator.poller.sessions),
        "timestamp": datetime.utcnow().isoformat(),
    }


# ── Devices ───────────────────────────────────────────────────────────────────

@app.get("/devices")
def list_polling_devices():
    """List polling-enabled devices with their SNMP registration status"""
    session = db_manager.get_session()
    try:
        repo = DeviceRepository(session)
        devices = repo.get_all_polling_enabled()
        return {
            "devices": [
                {
                    "id": d.id,
                    "name": d.name,
                    "nms_device_id": d.nms_device_id,
                    "management_ip": d.management_ip,
                    "snmp_version": d.snmp_version,
                    "snmp_port": d.snmp_port,
                    "polling_interval": d.polling_interval,
                    "last_polled_at": d.last_polled_at.isoformat() if d.last_polled_at else None,
                    "is_registered": d.nms_device_id in orchestrator.poller.sessions,
                }
                for d in devices
            ],
            "total": len(devices),
        }
    finally:
        session.close()


@app.post("/devices/{nms_device_id}/poll")
def trigger_poll(nms_device_id: int):
    """Trigger an on-demand SNMP poll for a specific device"""
    if nms_device_id not in orchestrator.poller.sessions:
        raise HTTPException(status_code=404, detail=f"nms_device_id={nms_device_id} not registered")

    session = db_manager.get_session()
    try:
        metrics_repo = MetricsRepository(session)
        device = orchestrator.device_map.get(nms_device_id)
        vendor = orchestrator._detect_vendor(device.name, device.vendor) if device else "generic"

        ifaces = orchestrator.poller.poll_interfaces(nms_device_id)
        for iface in ifaces:
            metrics_repo.save_interface_metrics(
                nms_device_id=nms_device_id,
                interface_index=iface.interface_index,
                interface_name=iface.interface_name,
                description=iface.description,
                admin_status=iface.admin_status,
                oper_status=iface.oper_status,
                speed=iface.speed,
                in_octets=iface.in_octets,
                out_octets=iface.out_octets,
                in_errors=iface.in_errors,
                out_errors=iface.out_errors,
                mtu=iface.mtu,
            )

        health = orchestrator.poller.poll_device_health(nms_device_id, vendor)
        if health:
            metrics_repo.save_health_metrics(
                nms_device_id=nms_device_id,
                uptime_seconds=health.uptime_seconds,
                cpu_usage=health.cpu_usage,
                memory_usage=health.memory_usage,
                temperature=health.temperature,
            )

        return {
            "success": True,
            "nms_device_id": nms_device_id,
            "interfaces_saved": len(ifaces),
            "health_saved": health is not None,
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        logger.error(f"On-demand poll failed for nms_device_id={nms_device_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()


# ── Backups ───────────────────────────────────────────────────────────────────

@app.post("/devices/{nms_device_id}/backup")
def trigger_backup(nms_device_id: int, req: BackupRequest):
    """Trigger SSH-based config backup for a device.

    Connects via SSH (stateless), executes vendor-specific running-config command,
    saves the result to nms_backups, and returns the new backup record.
    """
    if nms_device_id not in orchestrator.ssh_poller.sessions:
        raise HTTPException(
            status_code=404,
            detail=f"nms_device_id={nms_device_id} not registered for SSH polling",
        )

    session = db_manager.get_session()
    try:
        device = orchestrator.device_map.get(nms_device_id)
        device_name = device.name if device else f"NMS Device {nms_device_id}"
        # Prefer DB-stored vendor (set by discovery/user); fall back to name heuristic
        db_vendor = (getattr(device, "vendor", None) or "").strip() if device else ""
        vendor = db_vendor or (orchestrator._detect_vendor(device.name) if device else "cisco")

        config_text = orchestrator.ssh_poller.backup_running_config(nms_device_id, vendor)
        if not config_text:
            raise HTTPException(
                status_code=502,
                detail=f"SSH backup failed for {device_name} (no output / connection error)",
            )

        size_bytes = len(config_text.encode("utf-8"))
        checksum = hashlib.sha256(config_text.encode("utf-8")).hexdigest()
        backup_id = cuid()
        now = datetime.utcnow()
        backup_file = f"backup_{nms_device_id}_{now.strftime('%Y%m%d_%H%M%S')}.cfg"

        session.execute(
            text(
                """
                INSERT INTO nms_backups
                  (id, nms_device_id, backup_type, backup_file, description,
                   size_bytes, checksum, configuration, created_at, updated_at)
                VALUES
                  (:id, :dev, :btype, :bfile, :desc,
                   :size, :csum, :cfg, :ts, :ts)
                """
            ),
            {
                "id": backup_id,
                "dev": nms_device_id,
                "btype": req.backup_type or "Running Config",
                "bfile": backup_file,
                "desc": req.description,
                "size": size_bytes,
                "csum": checksum,
                "cfg": config_text,
                "ts": now,
            },
        )
        session.commit()

        logger.info(
            f"Backup created: id={backup_id} device={device_name} "
            f"size={size_bytes}B vendor={vendor}"
        )
        return {
            "success": True,
            "backup": {
                "id": backup_id,
                "nms_device_id": nms_device_id,
                "device_name": device_name,
                "backup_type": req.backup_type or "Running Config",
                "backup_file": backup_file,
                "size_bytes": size_bytes,
                "checksum": checksum,
                "created_at": now.isoformat(),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        logger.error(f"Backup failed for nms_device_id={nms_device_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()


# ── Metrics ───────────────────────────────────────────────────────────────────

@app.get("/devices/{nms_device_id}/health")
def get_health_metrics(nms_device_id: int, limit: int = 20):
    """Get latest health metrics for a device by NMS integer ID"""
    session = db_manager.get_session()
    try:
        repo = MetricsRepository(session)
        metrics = repo.get_latest_health(nms_device_id, limit=limit)
        return {
            "nms_device_id": nms_device_id,
            "metrics": [
                {
                    "cpu_usage": m.cpu_usage,
                    "memory_usage": m.memory_usage,
                    "temperature": m.temperature,
                    "uptime_seconds": m.uptime_seconds,
                    "collected_at": m.collected_at.isoformat() if m.collected_at else None,
                }
                for m in metrics
            ],
        }
    finally:
        session.close()


@app.get("/devices/{nms_device_id}/interfaces")
def get_interface_state(nms_device_id: int):
    """Get current interface state for a device by NMS integer ID"""
    session = db_manager.get_session()
    try:
        repo = MetricsRepository(session)
        ifaces = repo.get_interface_state(nms_device_id)
        return {
            "nms_device_id": nms_device_id,
            "interfaces": [
                {
                    "interface_index": i.interface_index,
                    "interface_name": i.interface_name,
                    "description": i.description,
                    "admin_status": i.admin_status,
                    "oper_status": i.oper_status,
                    "speed": i.speed,
                    "in_octets": i.in_octets,
                    "out_octets": i.out_octets,
                    "last_polled_at": i.last_polled_at.isoformat() if i.last_polled_at else None,
                }
                for i in ifaces
            ],
        }
    finally:
        session.close()


# ── Discovery ─────────────────────────────────────────────────────────────────

@app.post("/discovery/start")
async def start_discovery(req: DiscoveryRequest, background_tasks: BackgroundTasks):
    """Start a network discovery scan and return scan_id for polling"""
    scan_id = cuid()

    # Create scan record upfront so caller gets a valid ID immediately
    session = db_manager.get_session()
    try:
        session.execute(
            text("""
                INSERT INTO nms_discovery_scans (id, cidr, status, total_hosts, processed_hosts, found_devices, created_at, updated_at)
                VALUES (:id, :cidr, 'pending', 0, 0, 0, NOW(), NOW())
            """),
            {"id": scan_id, "cidr": req.cidr},
        )
        session.commit()
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to create scan record: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()

    async def run_async():
        try:
            await run_discovery(req.cidr, req.communities, scan_id, req.ssh_user, req.ssh_pass)
        except Exception as e:
            logger.error(f"Discovery scan {scan_id} failed: {e}")
            s = db_manager.get_session()
            try:
                s.execute(
                    text("UPDATE nms_discovery_scans SET status='failed', error_message=:err, updated_at=NOW() WHERE id=:id"),
                    {"err": str(e), "id": scan_id},
                )
                s.commit()
            finally:
                s.close()

    background_tasks.add_task(asyncio.ensure_future, run_async())

    return {
        "scan_id": scan_id,
        "status": "pending",
        "cidr": req.cidr,
        "message": f"Scan started. Poll /discovery/{scan_id} for progress.",
    }


@app.get("/discovery/{scan_id}")
def get_scan_status(scan_id: str):
    """Get discovery scan progress"""
    session = db_manager.get_session()
    try:
        row = session.execute(
            text("""
                SELECT id, cidr, status, total_hosts, processed_hosts, found_devices,
                       error_message, created_at, updated_at
                FROM nms_discovery_scans WHERE id = :id
            """),
            {"id": scan_id},
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Scan {scan_id} not found")
        return {
            "scan_id": row.id,
            "cidr": row.cidr,
            "status": row.status,
            "total_hosts": row.total_hosts,
            "processed_hosts": row.processed_hosts,
            "found_devices": row.found_devices,
            "error_message": row.error_message,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }
    finally:
        session.close()


@app.get("/discovery/{scan_id}/results")
def get_scan_results(scan_id: str):
    """Get discovered devices from a scan"""
    session = db_manager.get_session()
    try:
        rows = session.execute(
            text("""
                SELECT id, ip_address, hostname, vendor, snmp_community,
                       sys_descr, snmp_status, ssh_status, imported, created_at
                FROM nms_discovered_devices
                WHERE scan_id = :scan_id
                ORDER BY ip_address
            """),
            {"scan_id": scan_id},
        ).fetchall()
        return {
            "scan_id": scan_id,
            "count": len(rows),
            "devices": [
                {
                    "id": r.id,
                    "ip_address": r.ip_address,
                    "hostname": r.hostname,
                    "vendor": r.vendor,
                    "snmp_community": r.snmp_community,
                    "sys_descr": r.sys_descr,
                    "snmp_status": r.snmp_status,
                    "ssh_status": r.ssh_status,
                    "imported": r.imported,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
                for r in rows
            ],
        }
    finally:
        session.close()


# ── Topology ──────────────────────────────────────────────────────────────────

@app.get("/topology")
def get_topology():
    """Get all LLDP/CDP topology links"""
    session = db_manager.get_session()
    try:
        repo = TopologyRepository(session)
        links = repo.get_all()
        return {
            "count": len(links),
            "links": [
                {
                    "id": l.id,
                    "nms_device_id": l.nms_device_id,
                    "local_interface": l.local_interface,
                    "remote_device_name": l.remote_device_name,
                    "remote_interface": l.remote_interface,
                    "protocol": l.protocol,
                    "last_seen_at": l.last_seen_at.isoformat() if l.last_seen_at else None,
                }
                for l in links
            ],
        }
    finally:
        session.close()


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "nms_service.main:app",
        host="0.0.0.0",
        port=config.api_port,
        reload=False,
        log_level=config.log_level.lower(),
    )
