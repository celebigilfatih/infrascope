# InfraScope Architecture Overview

> Single-source-of-truth for the system's shape, data flow, and invariants.
> If this document conflicts with code, the code is right — file a PR to fix this doc.

---

## 1. System Purpose

InfraScope is a single-organization infrastructure monitoring and alarm platform.
It ingests telemetry from FortiAnalyzer, FortiGate, VMware vCenter, Zabbix, and
SNMP/SSH agents; evaluates 98 alarm rules against that data; and delivers
actionable notifications to on-call operators.

**Core value proposition:** every alarm is a signal (not noise) with a runbook.

---

## 2. Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Next.js 14+ App Router, TypeScript (strict) | Server components + client islands |
| UI Kit | Shadcn/ui (Tailwind CSS) | Turkish UI strings |
| Backend | Next.js API Routes | REST; JSON-RPC for FortiAnalyzer |
| Database | PostgreSQL + Prisma ORM | 80+ models, JSONB for flexible metadata |
| NMS Sidecar | Python FastAPI + pysnmp + paramiko | Docker network peer |
| Notification | Nodemailer + DLQ table | Retry queue with exponential backoff |
| Deployment | Docker Compose | Next.js container + NMS container |

---

## 3. High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      External Sources                           │
│  FortiAnalyzer  FortiGate  VMware vCenter  Zabbix  SNMP/SSH    │
└──────┬───────────┬────────────┬────────────┬───────┬───────────┘
       │           │            │            │       │
       ▼           ▼            ▼            ▼       ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Integration Layer                            │
│  FortiAnalyzerService  FortiGateService  VMwareService  Zabbix  │
│  (singleton + session lifecycle + exponential backoff)          │
└──────┬────────────────────┬──────────────────┬──────────────────┘
       │                    │                  │
       ▼                    ▼                  ▼
┌─────────────┐  ┌──────────────────┐  ┌──────────────┐
│ Event Cache  │  │ Detection Engine │  │ NMS Sidecar  │
│ (CachedEvent │  │ (98 alarm rules  │  │ (SNMP poll,  │
│  table, 5min │  │  → ALARM_QUERY_  │  │  SSH backup, │
│  bg sync)    │  │  REGISTRY)       │  │  topology)   │
└──────┬──────┘  └────────┬─────────┘  └──────┬───────┘
       │                  │                    │
       ▼                  ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                        PostgreSQL                                │
│  AlarmEvent · AlarmDefinition · CachedEvent · NmsInterface ·   │
│  NmsHealthMetric · Device · IntegrationConfig · NotificationDLQ│
└──────────────────────────┬──────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
┌────────────────────────┐  ┌─────────────────────┐
│   Next.js UI (TR/EN)   │  │  Email / DLQ Worker  │
│  Dashboard · Alerts ·  │  │  (Nodemailer, retry  │
│  Network · Security ·  │  │   with backoff)      │
│  Virtualization · NMS  │  └─────────────────────┘
└────────────────────────┘
```

---

## 4. Directory Structure (significant entries)

```
infrascope/
├── app/                           # Next.js App Router
│   ├── api/                       #   REST endpoints
│   │   ├── alarms/                #     Check, definitions, cleanup, whitelist
│   │   ├── health/                #     System + alarm subsystem health
│   │   ├── integrations/          #     FA, FG, VMware, Zabbix, NMS
│   │   ├── firewall-policies/     #     FortiGate policy queries
│   │   └── ...                    #     Devices, orgs, buildings, topology
│   ├── dashboard/                 #   Alert summary, risk dashboard
│   ├── network/                   #   Switches, VLANs, firewall, VPN, config-revisions
│   ├── security/                  #   IPS, MITRE, quarantine, policies
│   ├── virtualization/            #   Clusters, hosts, VMs, datastores, snapshots
│   └── integrations/              #   Integration status & config pages
│
├── lib/                           # Business logic
│   ├── alarms/                    #   Detection engine, event cache, queries, monitor
│   ├── integrations/              #   FortiAnalyzer, FortiGate, VMware, Zabbix services
│   ├── notifications/             #   Email sender + DLQ worker
│   ├── topology/                  #   Relationship graph engine
│   ├── security/                  #   Risk analyzer
│   └── prisma.ts                  #   Singleton PrismaClient
│
├── components/                    # React components
│   ├── ui/                        #   Shadcn/ui primitives
│   ├── shared/                    #   Reusable business components
│   ├── topology/                  #   Network graph visualization
│   └── layout/                    #   Header, sidebar, navigation
│
├── nms_service/                   # Python FastAPI sidecar
│   ├── orchestrator.py            #   Polling coordinator
│   ├── snmp/poller.py             #   SNMP interface & health polling
│   ├── ssh/poller.py              #   SSH config backup
│   └── discovery_worker.py        #   CIDR scan & device import
│
├── prisma/                        # Database
│   └── schema.prisma              #   80+ models, enums, indexes
│
├── docs/                          # Knowledge base
│   ├── 00-product/                #   CONSTITUTION.md
│   ├── 10-architecture/           #   This file + ADRs
│   ├── 20-modules/                #   Per-module docs + alarm catalog
│   └── 30-runbooks/               #   Operational runbooks
│
└── scripts/                       #   generate-alarm-catalog, DB seed, etc.
```

---

## 5. Alarm Pipeline (Detail)

```
Scheduler (10 min)  ──┐
                      ▼
Watchdog (15 min)  ──→ AlarmRunner.runAlarmCheck()
                          │
                          ├─ initSharedFortiAnalyzerService()
                          ├─ getOrInitFortiGateService()
                          ├─ init VMwareService
                          ├─ EventCacheService.startBackgroundSync()
                          │
                          └─ AlarmDetectionEngine.evaluate()
                              │
                              ├─ For each enabled AlarmDefinition:
                              │   ├─ ALARM_QUERY_REGISTRY.get(code) → queryFn
                              │   │   ├─ Cache query (CachedEvent table)
                              │   │   └─ Live API fallback (FA/FG/VMware)
                              │   ├─ SuppressionEngine.filter()
                              │   ├─ Cooldown check
                              │   └─ count >= threshold?
                              │       YES → create AlarmEvent + send email
                              │       NO  → auto-resolve if previously firing
                              │
                              └─ Write AlarmCheckLog (duration, status, counts)
```

**Key invariants:**
- Every alarm code has an entry in `ALARM_QUERY_REGISTRY` (AI-1)
- Every alarm has cooldown + auto-resolve (P5)
- Every integration client is a singleton (AI-2)
- Every external call has timeout + retry + abort signal (AI-7)

---

## 6. Integration Session Lifecycle

FortiAnalyzer is the most session-sensitive integration. The pattern is codified
in ADR-003 and enforced by Constitution principle #8:

```
login() ──→ logout() first ──→ POST /jsonrpc login
                                │
                     ┌──────────┴──────────┐
                     ▼                     ▼
               session OK             session expired
               (code=0)              (code=-11/-6)
                     │                     │
                     ▼                     ▼
               store token           invalidateSession()
               in globalState        (clear session + backoff)
                     │
                     ▼
               use for subsequent API calls
               if any response has expired session
               → invalidateSession() immediately
               → return null (no retry with dead session)
```

**Circuit breaker** (`fa-circuit-breaker.ts`): when FA returns code=-22
(account locked), the breaker opens for 5 minutes. All login attempts
are suppressed during this window, preventing indefinite lockout.

---

## 7. Background Services

| Service | Interval | Location | Purpose |
|---------|----------|----------|---------|
| Alarm Scheduler | 10 min | `lib/alarm-scheduler.ts` | Triggers detection engine |
| Alarm Monitor (Watchdog) | 15 min | `lib/alarms/alarm-monitor.ts` | Recovers silent scheduler |
| Event Cache Sync | 5 min (+backoff to 60 min) | `lib/alarms/event-cache.ts` | Syncs FA logs to CachedEvent |
| Alarm Cleanup | Daily 02:00 | `lib/alarms/cleanup-scheduler.ts` | Deletes old alarm events |
| NMS SNMP Poller | 30 s (configurable) | `nms_service/snmp/poller.py` | Interface + health metrics |
| NMS SSH Backup | 5 min (configurable) | `nms_service/ssh/poller.py` | Running-config backup |
| DLQ Worker | On-demand | `lib/notifications/dlq-worker.ts` | Retries failed notifications |

---

## 8. Architecture Invariants (Constitution AI-1 to AI-7)

| ID | Rule | Violation Consequence |
|----|------|-----------------------|
| AI-1 | Alarm in `alarm-definitions.ts` + `ALARM_QUERY_REGISTRY` | Engine can't find it → silent failure |
| AI-2 | Integration client via `getSharedXService()` singleton | Backoff state unsynced → account locked |
| AI-3 | DB access via `lib/prisma.ts` only | Connection pool exhaustion |
| AI-4 | UI calls own API via `lib/api.ts` | Race conditions, half-written data |
| AI-5 | Migration order: schema → migrate dev → code | Schema drift, prod breakage |
| AI-6 | Cooldown key: `deviceName + interface_name + alarmCode` | Same-port spam duplicates |
| AI-7 | External API: timeout + retry + abort signal | Hanging fetch blocks engine |

---

## 9. Out of Scope

- Multi-tenancy (single-org product)
- Native mobile app (responsive web only)
- Custom authentication (SSO/OAuth only)
- Real-time WebSocket notifications (polling sufficient)
- Own log aggregation (use FortiAnalyzer + cached_events)
- Customer plug-in system (PR-based extensions)

---

## 10. Related Documents

| Document | Location |
|----------|----------|
| Product Constitution | `docs/00-product/CONSTITUTION.md` |
| Bounded Contexts | `docs/10-architecture/BOUNDED_CONTEXTS.md` |
| ADR-001: Config Revisions Over CMDB Diff | `docs/10-architecture/adr/ADR-001-prefer-config-revisions-over-cmdb-diff.md` |
| ADR-002: Alarm Query Registry | `docs/10-architecture/adr/ADR-002-alarm-query-registry-pattern.md` |
| ADR-003: FA Session Lifecycle | `docs/10-architecture/adr/ADR-003-fortianalyzer-session-lifecycle.md` |
| Alarm Definitions Catalog | `docs/20-modules/alarms/DEFINITIONS.md` |
| Operational Runbooks | `docs/30-runbooks/` |
| Quest Mode Guide | `docs/QUEST_MODE_GUIDE.md` |
