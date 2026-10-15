# NMS (Network Monitoring System) Integration

> **Architecture:** Separate Python agent service + InfraScope PostgreSQL shared DB
> **Protocol:** SNMP v2c/v3 polling + SSH CLI (fallback)
> **API:** REST endpoints under `/api/integrations/nms/*`
> **DB tables:** `nms_health_metrics`, `nmsInterface`, `devices` (shared with InfraScope)

## Architecture

```
┌─────────────────────────────────────────────────┐
│         InfraScope App Server (Next.js)          │
│                                                  │
│  /api/integrations/nms/*                        │
│  ├── /devices         → device CRUD             │
│  ├── /devices/[id]/ports/monitored              │
│  ├── /alarms          → NMS alarm queries       │
│  ├── /backups         → config backup retrieval │
│  ├── /discovery       → network device discovery│
│  └── /network-devices → switch/router data      │
└──────────────────────┬──────────────────────────┘
                       │ shared PostgreSQL
┌──────────────────────▼──────────────────────────┐
│         PostgreSQL (infrascope DB)               │
│                                                  │
│  tables:                                         │
│  ├── devices              (shared)              │
│  ├── "nmsInterface"       (monitored ports)     │
│  ├── nms_health_metrics   (poll results)        │
│  └── alarm_events         (NMS_PORT_DOWN, ...)  │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│         NMS Agent (Python service)               │
│                                                  │
│  - SNMP polling (configurable interval + jitter) │
│  - SSH CLI fallback (vendor-aware)               │
│  - Writes to shared PostgreSQL tables            │
│  - Exposes REST API on separate port             │
└──────────────────────┬──────────────────────────┘
                       │ SNMP/SSH
              ┌────────▼────────┐
              │ Network Devices │
              │ - Switches      │
              │ - Routers       │
              │ - Firewalls     │
              └─────────────────┘
```

## Data Model

### `devices` table (shared)
| Column | Purpose |
|---|---|
| `id`, `name`, `management_ip` | Device identity |
| `device_type`, `vendor`, `model` | Classification |
| `snmp_community`, `snmp_version` | SNMP config |
| `status` | Online/offline (computed from last poll) |

### `nmsInterface` table
| Column | Purpose |
|---|---|
| `id`, `nms_device_id` (FK → devices) | Link to device |
| `interface_name`, `interface_index` | Port identity |
| `description` | Admin description (used for port name lookup) |
| `admin_status`, `oper_status` | Up/down state |
| `monitored` | Whether this interface triggers alarms |
| `speed`, `mtu`, `mac_address` | Port metadata |

### `nms_health_metrics` table
| Column | Purpose |
|---|---|
| `id`, `nms_device_id` | Device reference |
| `cpu_usage`, `memory_usage` | Resource utilization |
| `uptime` | Device uptime (seconds) |
| `polled_at` | Timestamp of poll |

## SNMP Configuration

| Parameter | Value | Rationale |
|---|---|---|
| **Timeout** | 3s | Fail-fast — don't block poll cycles |
| **Retries** | 1 | One retry is enough; unreachable devices should fail quickly |
| **Community** | Per-device encrypted value | Configurable per device |
| **Polling interval** | Configurable + jitter | Prevents thundering herd |

## NMS_PORT_DOWN Alarm

**Detection logic** (in `lib/alarms/detection-engine.ts`):

1. Query `nmsInterface` for all `monitored=true` interfaces
2. Filter where `oper_status = 'down'` AND `admin_status = 'up'`
3. Check cooldown: `deviceName + interface_name + alarmCode` (AI-6)
4. Check in-memory dedup: `createdPortsThisEval` Set (race condition fix)
5. Create `alarm_event` with `rawData: { interface_name, admin_status, oper_status }`

**Auto-resolve:** On next check cycle, if the port's `oper_status` is back to `up`,
the alarm is auto-resolved.

**Port enrichment:** The alarm modal's "Port Listesini Getir" button calls
`/api/integrations/nms/devices/[id]/ports/monitored` to show:
- All monitored interfaces for the device
- Monitored-down ports highlighted in red
- admin/oper status, description, speed, error counters

## Config Backup Integration

Configuration backups use durable PostgreSQL jobs and an independent NMS worker.
ADMIN/EDITOR requests commit a job and audit entry, then return HTTP 202. Fixed OS
profiles select actual Running/Startup commands; unsupported combinations fail.
SSH capture enforces approved host keys, bounded output/deadlines, clean completion
and platform-specific structural checks. Successful artifacts are encrypted with
AES-256-GCM and verified by SHA-256 on content access.

The worker reloads current device credentials independently of SNMP polling,
serializes work per device, retries only transient failures and fences stale lease
owners. Failed authentication blocks unchanged credentials for 15 minutes. The UI
shows durable job state separately from saved artifacts. Active users can read
metadata; ADMIN/EDITOR can create/read content; ADMIN controls deletion/policies.
Content reads, outcomes, policy changes and retention are audited. Deleting an
inventory device preserves its encrypted artifacts as global archive records.

Per-device interval schedules are explicitly enabled by ADMIN. Retention preserves
the newest configured count. Failure and overdue signals use `NMS_BACKUP_FAILED`
in the existing query registry, with cooldown and automatic incident resolution.
Database-only queries do not depend on FortiAnalyzer cache availability.

Customer packages contain application, PostgreSQL, NMS and persistent database-dump
services. Dedicated encryption keys are mandatory in production. Local dumps and
portable authenticated DB-and-key recovery bundles serve different purposes; see
`docs/30-runbooks/nms-backups.md` and ADR-007 for platform limits, recovery and tests.
## Network Device Discovery

`/api/integrations/nms/discovery` endpoint:
- Scans subnet for SNMP-responsive devices
- Identifies vendor via SNMP sysObjectID
- Creates device records with auto-detected properties
- Supports batch import

## Error Handling

| Error | Handler |
|---|---|
| SNMP timeout (3s) | Interface marked unreachable, retry next cycle |
| SNMP auth fail | Logged, device flagged for credential review |
| SSH connection fail | Config backup skipped, logged |
| NMS agent unreachable | Alarm runner skips NMS queries, no false alarms from stale data |

## Related

- `docs/30-runbooks/DUPLICATE_PORT_DOWN_EVENTS.md` — Race condition fix
- `docs/20-modules/alarms/NMS_ALARM_FALSE_POSITIVE_PREVENTION.md` — False positive prevention
- `lib/alarms/detection-engine.ts` — NMS_PORT_DOWN detection logic
- `docs/10-architecture/IMPROVEMENTS_ANALYSIS.md` — NMS DB consolidation notes
