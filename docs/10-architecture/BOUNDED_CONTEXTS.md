# Bounded Contexts

> DDD-style decomposition of InfraScope into autonomous domains.
> Each context owns its data, logic, and integration contracts.
> Cross-context communication goes through API routes or shared DB tables with clear ownership.

---

## Context Map

```
                    ┌─────────────────────────────────────────┐
                    │           ALARMS (Core)                  │
                    │  Detection · Evaluation · Notification  │
                    └──────┬──────────┬──────────┬────────────┘
                           │          │          │
              ┌────────────┘    ┌─────┘     ┌────┘
              ▼                 ▼           ▼
┌──────────────────┐  ┌────────────────┐  ┌──────────────────┐
│  INTEGRATIONS     │  │   INVENTORY    │  │   TOPOLOGY       │
│  FA · FG · VMware │  │  Devices · VMs │  │  LLDP · Deps    │
│  Zabbix · NMS     │  │  Racks · Orgs  │  │  Impact graph   │
└────────┬─────────┘  └───────┬────────┘  └──────────────────┘
         │                    │
         ▼                    ▼
┌──────────────────┐  ┌────────────────┐
│   SECURITY       │  │    AUDIT       │
│  IPS · Risk ·    │  │  AuditLog ·    │
│  MITRE · Quar.   │  │  Change trail  │
└──────────────────┘  └────────────────┘
```

---

## Contexts

### 1. ALARMS

**Obligation:** Detect, evaluate, notify, and auto-resolve infrastructure anomalies.

| Aspect | Detail |
|--------|--------|
| **Ubiquitous language** | AlarmDefinition, AlarmEvent, AlarmCode, Cooldown, Suppression, Whitelist, Auto-resolve, Threshold, TimeWindow |
| **Entry points** | `lib/alarms/`, `app/api/alarms/` |
| **Owned tables** | `AlarmDefinition`, `AlarmEvent`, `AlarmCheckLog`, `CachedEvent`, `AlarmWhitelist`, `NotificationDLQ`, `NotificationConfig` |
| **Key services** | `AlarmDetectionEngine`, `EventCacheService`, `AlarmScheduler`, `AlarmMonitor` (watchdog), `SuppressionEngine`, `CleanupScheduler` |
| **Query layer** | `ALARM_QUERY_REGISTRY` (ADR-002): maps alarm code → `AlarmQueryFn`. Each function: cache-first (`CachedEvent`), live API fallback |
| **Invariants** | AI-1 (registry mandatory), AI-6 (cooldown key format), P4 (every alarm has runbook), P5 (cooldown + auto-resolve), P6 (automation events filtered) |
| **Dependencies** | Reads from **INTEGRATIONS** (FA/FortiGate/VMware APIs + event cache), reads from **INVENTORY** (device names for cooldown keys) |
| **Notifies** | Email via `NotificationDLQ` (retry with exponential backoff) |

**Alarm evaluation flow:**
1. Scheduler triggers `AlarmRunner.runAlarmCheck()` every 10 min
2. Runner initializes integration singletons + event cache sync
3. `AlarmDetectionEngine.evaluate()` iterates enabled definitions
4. Per alarm: `ALARM_QUERY_REGISTRY.get(code)` → queryFn → cache or live API
5. Suppression engine filters false positives
6. Cooldown prevents duplicates
7. If count >= threshold: create `AlarmEvent`, send email
8. If previously firing but count < threshold: auto-resolve
9. Log result to `AlarmCheckLog`

---

### 2. INTEGRATIONS

**Obligation:** Manage connections to external systems; provide typed, resilient API clients.

| Aspect | Detail |
|--------|--------|
| **Ubiquitous language** | Session, Login, Logout, Backoff, Circuit Breaker, Sync, IntegrationConfig, SyncLog |
| **Entry points** | `lib/integrations/`, `app/api/integrations/` |
| **Owned tables** | `IntegrationConfig`, `IntegrationSyncLog` |
| **Key services** | `FortiAnalyzerService` (JSON-RPC), `FortiGateService` (REST + cookie auth), `VMwareService` (REST + SOAP), `ZabbixService` (REST), `fa-circuit-breaker.ts` |
| **Invariants** | AI-2 (singleton clients), P8 (login→logout cycle), P9 (backoff + health endpoint), P10 (no `new XService()` in routes), P11 (lockout detection code=-22) |
| **Contracts to ALARMS** | FA: `login()`, `startLogSearch()`, `fetchLogResults()`, `getFortiView()`, `getStatus()`; FG: `getCMDBSnapshot()`, `getConfigRevisions()`, `getAdminEventLogs()`; VMware: `queryEventsSOAP()`, `fetchVMLifecycleEvents()` |
| **Contracts to INVENTORY** | VMware sync creates/updates `VMwareCluster`, `VMwareDatastore`, VM `Device` records; NMS sync updates `NmsInterface`, `NmsHealthMetric` |

**Session lifecycle (FortiAnalyzer, ADR-003):**
- `login()` calls `logout()` first, then authenticates
- Session stored in `globalThis._fazGlobalState[host]` (hot-reload safe)
- Every API response checked for session expiry (code -11/-6)
- `invalidateSession()` clears token + enters backoff
- Circuit breaker opens on code=-22 (account locked) for 5 min

**Session lifecycle (FortiGate):**
- Cookie-based auth (`ccsrftoken` + session cookie)
- Stored in `globalThis._fgtGlobalState[host]`
- Per-request username/password required for cookie refresh

**VMware:**
- REST session token + SOAP session cookie
- No persistent session reuse (fresh auth per operation)

---

### 3. INVENTORY

**Obligation:** Maintain the canonical model of physical and virtual assets and their organizational placement.

| Aspect | Detail |
|--------|--------|
| **Ubiquitous language** | Device, Rack, RackUnit, Building, Floor, Room, Organization, NetworkInterface, SwitchPort, VLAN, Subnet |
| **Entry points** | `app/api/devices/`, `app/api/organizations/`, `app/api/buildings/`, `app/api/racks/`, `app/dashboard/`, `app/devices/` |
| **Owned tables** | `Organization`, `User`, `Building`, `Floor`, `Room`, `Rack`, `RackUnit`, `Device`, `NetworkInterface`, `SwitchPort`, `Connection`, `Service`, `Dependency`, `Application`, `Vlan`, `Subnet` |
| **Key services** | None (CRUD via API routes; no long-running services) |
| **Invariants** | AI-3 (Prisma singleton), AI-4 (UI calls own API) |
| **Consumed by** | ALARMS (device names in cooldown keys), TOPOLOGY (device endpoints), SECURITY (device policy mapping) |

**Device model:**
- Polymorphic: `SERVER`, `SWITCH`, `ROUTER`, `FIREWALL`, `VM`, `PDU`, `AP`, etc.
- Cross-references: `zabbixHostId`, `vmwareMoid`, `nmsDeviceId`, `fortiGateVdom`
- Parent-child: VM → ESXi host relationship

---

### 4. TOPOLOGY

**Obligation:** Discover and model network relationships; compute blast-radius impact analysis.

| Aspect | Detail |
|--------|--------|
| **Ubiquitous language** | Relationship, Link, Topology, Neighbor, LLDP, CDP, Impact, Blast Radius, Dependency Chain |
| **Entry points** | `lib/topology/`, `app/api/topology/`, `app/network/` |
| **Owned tables** | `Relationship` (device-to-device link with type + confidence) |
| **Key services** | `TopologyEngine` (relationship graph, impact analysis) |
| **Data sources** | NMS topology (LLDP/CDP via `NmsTopologyLink`), manual `Connection` records, `Dependency` graph |
| **Consumed by** | SECURITY (impact-aware quarantine), ALARMS (device context enrichment) |

---

### 5. SECURITY

**Obligation:** Surface and analyze security events; provide policy visibility and risk scoring.

| Aspect | Detail |
|--------|--------|
| **Ubiquitous language** | IPS Event, Threat, Risk Score, Quarantine, MITRE ATT&CK, Firewall Policy, IOC, DNS Tunnel, SSL-VPN |
| **Entry points** | `lib/security/`, `app/api/security/`, `app/api/firewall-policies/`, `app/security/` |
| **Owned tables** | `FirewallPolicy`, `FirewallAddress`, `AlertEvent` (security-sourced) |
| **Key services** | `RiskAnalyzer` (risk scoring engine) |
| **Data sources** | FortiAnalyzer security logs (IPS, malware, web filter, DNS), FortiGate policies, MITRE ATT&CK matrix |
| **Consumed by** | ALARMS (security alarm codes: `IPS_HIGH_SEVERITY`, `MALWARE_DETECTED`, `IOC_HIT`, etc.), INVENTORY (device risk badge) |

---

### 6. AUDIT

**Obligation:** Maintain an immutable, append-only trail of all significant state changes.

| Aspect | Detail |
|--------|--------|
| **Ubiquitous language** | AuditLog, Change, Action, Entity, Before/After |
| **Entry points** | Written to by API routes across all contexts |
| **Owned tables** | `AuditLog` |
| **Key services** | None (passive; other contexts write to it) |
| **Invariants** | P20 (immutable, append-only) |
| **Written by** | All contexts append entries on create/update/delete operations |

---

### 7. NMS (Network Management System)

**Obligation:** Collect SNMP/SSH telemetry from network devices; provide interface status, health metrics, and config backups.

| Aspect | Detail |
|--------|--------|
| **Ubiquitous language** | Poller, Interface, Health Metric, Topology Link, Discovery Scan, Backup, Running-Config |
| **Entry points** | `nms_service/` (Python FastAPI on port 8500), `app/api/integrations/nms/` |
| **Owned tables** | `NmsInterface`, `NmsHealthMetric`, `NmsTopologyLink`, `NmsInterfaceMetric`, `NmsDeviceMetric`, `NmsDiscoveryScan`, `NmsDiscoveredDevice`, `NmsBackup` |
| **Key services** | `NMSOrchestrator` (polling coordinator), `SNMPPoller`, `SSHPoller`, `DiscoveryWorker` |
| **Invariants** | Stateless polling (no persistent SNMP sessions), SSH semaphore (max 5 concurrent), fail-fast timeouts (3s SNMP, 10s SSH) |
| **Contracts to ALARMS** | `NmsInterface` data drives `NMS_PORT_DOWN`, `NmsHealthMetric` drives `NMS_DEVICE_UNREACHABLE` (via `ALARM_QUERY_REGISTRY` entries in `lib/alarms/queries/nms.ts`) |
| **Contracts to TOPOLOGY** | `NmsTopologyLink` feeds relationship graph |
| **Contracts to INVENTORY** | Updates `Device` (polling state, nmsDeviceId); discovered devices can be imported as `Device` records |

**Runtime topology:**
```
Next.js container                    NMS container
┌──────────────────┐                ┌──────────────────┐
│  API routes      │──HTTP :8500──→ │  FastAPI /health  │
│  (nms/*)         │                │  /polls/{id}      │
│                  │                │  /discovery       │
│  Prisma ←─────── │──PostgreSQL──→ │  SQLAlchemy       │
│  (shared DB)     │                │  (shared DB)      │
└──────────────────┘                └──────────────────┘
```

---

### 8. VIRTUALIZATION

**Obligation:** Track VMware vCenter inventory (clusters, hosts, VMs, datastores, snapshots) and surface lifecycle events.

| Aspect | Detail |
|--------|--------|
| **Ubiquitous language** | Cluster, Host, VM, Datastore, Snapshot, vCenter, MOID, Power State, Provisioned/Used Storage |
| **Entry points** | `app/api/integrations/vmware/`, `app/virtualization/` |
| **Owned tables** | `VMwareCluster`, `VMwareDatastore`, `VmSnapshot`, `CapacityMetric` |
| **Key services** | `VMwareService` (REST + SOAP dual API) |
| **Data sources** | VMware vCenter REST API (inventory) + SOAP API (event queries) |
| **Contracts to ALARMS** | VMware events drive `VM_CREATED`, `VM_DELETED`, `DATASTORE_SPACE_CRITICAL`, etc. (via `lib/alarms/queries/vmware.ts`) |
| **Contracts to INVENTORY** | VMs stored as `Device` records with `vmwareMoid`; linked to host `Device` via `parentId` |

---

## Cross-Context Communication Patterns

| From | To | Mechanism | Contract |
|------|----|-----------|----------|
| ALARMS | INTEGRATIONS | Direct singleton method calls | `getSharedFortiAnalyzerService().startLogSearch()` |
| ALARMS | NMS | Prisma table reads | `nmsInterface.findMany()`, `nmsHealthMetric.count()` |
| ALARMS | INVENTORY | Prisma table reads | `device.findUnique()` for cooldown key device names |
| INTEGRATIONS | INVENTORY | Prisma table writes on sync | `device.upsert()` during VMware/NMS sync |
| NMS | TOPOLOGY | Prisma table writes | `nmsTopologyLink` from LLDP/CDP discovery |
| SECURITY | ALARMS | Prisma table reads | Security log queries in `ALARM_QUERY_REGISTRY` |
| All | AUDIT | Prisma table appends | `auditLog.create()` on state changes |

**Rules:**
1. No context reaches into another context's `lib/` internals — only through exported functions or shared DB tables.
2. Shared tables have a single owning context that defines the schema; other contexts read only.
3. Integration singletons are the sole entry point for external API access (AI-2).

---

## Anti-Corruption Layers

| Boundary | Protection | Implementation |
|----------|-----------|----------------|
| FA JSON-RPC → ALARMS | Session lifecycle, retry, backoff | `FortiAnalyzerService` wraps all FA API complexity; detection engine never sees raw JSON-RPC |
| VMware REST/SOAP → ALARMS | Event normalization, automation filter | `VMwareService` returns typed event objects; `SuppressionEngine` filters pyvmomi/vCenter automation |
| NMS SNMP → ALARMS | Interface status interpretation | `nms.ts` query functions map SNMP admin/oper status to up/down semantics with false-positive prevention |
| FortiGate CMDB → ALARMS | Config revision vs. CMDB diff | ADR-001: prefer `/config-revision` API over CMDB snapshot diff for change detection |
| External credentials → DB | Encryption at rest | `IntegrationConfig.config` stored as encrypted JSON |

---

## Context Ownership Matrix

| Table | Owner | Readers |
|-------|-------|---------|
| `AlarmDefinition` | ALARMS | INVENTORY (UI display) |
| `AlarmEvent` | ALARMS | INVENTORY, SECURITY (UI display) |
| `AlarmCheckLog` | ALARMS | — |
| `CachedEvent` | ALARMS | — |
| `AlarmWhitelist` | ALARMS | — |
| `NotificationDLQ` | ALARMS | — |
| `IntegrationConfig` | INTEGRATIONS | ALARMS (health status), VIRTUALIZATION (sync state) |
| `IntegrationSyncLog` | INTEGRATIONS | — |
| `Device` | INVENTORY | ALARMS, TOPOLOGY, SECURITY, NMS, VIRTUALIZATION |
| `Organization`, `Building`, `Floor`, `Room`, `Rack` | INVENTORY | — |
| `Relationship` | TOPOLOGY | SECURITY, ALARMS |
| `NmsInterface`, `NmsHealthMetric` | NMS | ALARMS |
| `NmsTopologyLink` | NMS | TOPOLOGY |
| `VMwareCluster`, `VMwareDatastore` | VIRTUALIZATION | INVENTORY (cross-ref) |
| `FirewallPolicy`, `FirewallAddress` | SECURITY | INVENTORY (UI display) |
| `AuditLog` | AUDIT | — (write-only for all others) |

---

## Evolving the Contexts

When adding a new integration or capability:

1. **Identify the context** — Does it fit an existing one or need a new one?
2. **Define owned tables** — Which Prisma models does this context own?
3. **Define contracts** — What does it expose to other contexts? (functions, tables, API)
4. **Respect invariants** — Singleton clients (AI-2), Prisma singleton (AI-3), UI→API pattern (AI-4)
5. **Register in ALARM_QUERY_REGISTRY** — If the new source produces alarm-relevant data
6. **Update this document** — Add the new context to the map and ownership matrix
