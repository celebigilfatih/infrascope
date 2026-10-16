# VMware vSphere Integration

> **Files:** `lib/integrations/vmware.ts`, `lib/integrations/vmware-source.ts`, `lib/integrations/vmware-health.ts`
> **Protocol:** vSphere REST API (`/api/vcenter/*`) + SOAP API (`/sdk`)
> **Auth:** Basic auth (username/password) → session cookie for SOAP
> **Data sources:** VMs, hosts, clusters, datastores, events, snapshots

## Saved Source and Health (B12)

Operational source creation, alarm initialization and health use `loadSavedVMwareIntegration` and `createSavedVMwareSource`. They select enabled `VMWARE_VCENTER` rows in creation-time/ID order, normalize the saved host and preserve exact saved credentials and profile settings. This makes the existing first-enabled model deterministic; it is not multi-vCenter aggregation. No source falls back to `VMWARE_HOST`, `VMWARE_USERNAME` or `VMWARE_PASSWORD`. Existing TLS runtime policy remains in use; B13 credential-at-rest migration is separate work.

`/api/health` uses `checkSavedVMwareHealth`: a fresh saved-record lookup and a lightweight REST status/version probe, with five seconds for the VMware branch and one independent second for owned-session cleanup. It closes the matching modern/legacy session and reports cleanup failure as unhealthy. The previous connection-test cleanup now uses the same close method while retaining B08's collection verification contract. Authentication response bodies must contain a usable session token; an empty successful HTTP reply cannot prove connectivity.

Health returns safe `target.configId`, `lastSyncAt` and `lastSyncStatus` from the same selected record. Missing/disabled profiles are unknown. Invalid configuration, storage/probe failures and timeouts are unhealthy; no alternate saved target or ENV credential is tried. Repeated requests re-read settings and do not reuse a cached health verdict. No username, host, password, session or private cache key belongs in the public VMware health result.

This probe does not run Python, collect inventory or prove all collector permissions. Optional version-read permission is separate from successful REST authentication. Each datasource retains its own health timing; the six-second VMware bound is not a bound for the entire health endpoint. See [ADR-019](../../10-architecture/adr/ADR-019-vmware-saved-source-health.md) and the [health runbook](../../30-runbooks/VMWARE_SAVED_SOURCE_HEALTH.md) for exact failure codes and cancellation limits.

## Architecture

InfraScope uses **two vSphere APIs simultaneously** (see `IMPROVEMENTS_ANALYSIS.md`):

| API | Protocol | Used for |
|---|---|---|
| **vSphere REST** | JSON over HTTPS (`/api/vcenter/*`) | VM/host/cluster/datastore lists, VM details, power ops, guest identity (IP) |
| **vSphere SOAP** | XML over HTTPS (`/sdk`) | EventHistoryCollector (snapshot events, VM lifecycle), ServiceContent bootstrap |

### Why both?

| REST advantage | SOAP advantage |
|---|---|
| Modern, easy (JSON, stateless, native fetch) | Event history (no REST equivalent) |
| vSphere 7+ recommended by VMware | ServiceContent (EventManager reference) |
| Lightweight (no SDK needed) | Authentication (`vmware_soap_session` cookie) |

| REST limitation | SOAP limitation |
|---|---|
| No VM→Host mapping in basic endpoint (workaround applied) | Complex XML parsing |
| No event history | Heavy SDK-like session management |
| No detailed performance metrics | Slower for bulk data |

## Data Flow

```
┌─────────────────────────────────────────────┐
│         InfraScope App Server                │
│                                             │
│  VMwareService                              │
│  ├── REST: /api/vcenter/vm                 │
│  ├── REST: /api/vcenter/host               │
│  ├── REST: /api/vcenter/datastore          │
│  ├── REST: /api/vcenter/cluster            │
│  └── SOAP: /sdk (EventHistoryCollector)    │
└─────────────────┬───────────────────────────┘
                  │
        ┌─────────▼─────────┐
        │  vCenter Server   │
        │  - REST :443      │
        │  - SOAP :443/sdk  │
        └─────────┬─────────┘
                  │
        ┌─────────▼─────────┐
        │  ESXi Hosts       │
        │  - VMs            │
        │  - Datastores     │
        └───────────────────┘
```

## Key Data Entities

### VMs
| Field | Source |
|---|---|
| `name`, `power_state`, `memory_size_MiB`, `cpu_count` | REST `/api/vcenter/vm` |
| `guest_IP` | REST `/api/vcenter/vm/{id}/guest/identity` |
| `host_id` (workaround) | Inferred from cluster + resource pool |
| `snapshot_count` | SOAP EventHistoryCollector |

### Datastores
| Field | Source |
|---|---|
| `name`, `type`, `capacity`, `free_space` | REST `/api/vcenter/datastore` |
| `usage_percent` (computed) | `(capacity - free_space) / capacity * 100` |

### Events (SOAP)
| Event type | Alarm trigger |
|---|---|
| `VmCreatedEvent` | VM_CLONED |
| `VmReconfiguredEvent` | VM_RECONFIGURED |
| `VmRemovedEvent` | VM_DELETED |
| `Snapshot` events | Snapshot age/size monitoring |

## Alarm Integration

VMware events feed into the alarm system via `lib/alarms/queries/vmware.ts`:

| Alarm Code | Trigger | Cooldown |
|---|---|---|
| `VM_RECONFIGURED` | `VmReconfiguredEvent` (CPU/mem/disk change) | 30 min |
| `VM_CLONED` | `VmCreatedEvent` with clone source | 30 min |
| `DATASTORE_SPACE_CRITICAL` | Datastore usage > 92% | 15 min |
| `DATASTORE_SPACE_LOW` | Datastore usage > 85% | 30 min |

### Automation Filtering

`isTrustedAutomation()` excludes events from automated systems:
```typescript
AUTOMATION_KEYWORDS = [
  'veeam', 'veeam backup', 'veeam replica', 'veeam agent',
  'vcenter', 'vmware', 'com.vmware.vim.eam',
  'pyvmomi',  // Python VMware SDK (automated provisioning scripts)
];
```

Events with these keywords in `userName` or `message` are **not** raised as alarms.

## Event Synchronization

The VMware sync process:
1. Connect to vCenter via REST (basic auth)
2. Bootstrap SOAP session via `/sdk` → get `vmware_soap_session` cookie
3. Fetch VM/host/cluster/datastore lists via REST (fast, parallel)
4. Start `EventHistoryCollector` via SOAP (for snapshot/lifecycle events)
5. Store events in `cached_events` table (same table as FA events, different source)
6. Alarm engine reads from `cached_events` on next check cycle

**Precondition:** vCenter must be reachable and credentials valid.
If vCenter is down, VMware alarms **do not fire** (Anayasa İlke #1: no mock data).

## Error Handling

| Error | Handler |
|---|---|
| REST 401 | Credentials invalid → log error, skip sync |
| SOAP session expired | Re-bootstrap via `/sdk` login |
| Network timeout | AbortController (configurable per-endpoint) |
| vCenter unreachable | Sync skipped, alarms silent (no false negatives from stale data) |

## Verified Cache Behavior (B07, 2026-10-15)

The cache contract below is verified against current code. The earlier event synchronization/error-handling overview is historical documentation; it does not establish that every transport has equivalent failure or persistence semantics. The B08 update below completes the Python/helper source-error contract.

- `lib/integrations/vmware-cache.ts` owns process-local entries and in-flight loads. Identity includes normalized host, username, password, thumbprint, polling interval and module switches. Identities and credentials are never returned as cache metadata. Identical profiles may share cached reads; different profiles cannot share MoRefs or data.
- `VMwareService` copies its profile and uses that identity for batch and per-VM snapshots, with five-minute freshness. Successful snapshot create/delete/revert invalidates that profile's service and response entries; failures retain them. Existing alarm callers inherit snapshot isolation without changing alarm evaluation.
- Authorized GET resolves current enabled DB configuration before cache lookup. Inventory/summary responses have five-minute freshness; snapshot responses have two minutes, including per-VM results. Stale responses are marked `X-Cache: STALE` and retain their original `X-Cache-Age` for up to thirty additional minutes. Fresh entries use `HIT`; live loads use `MISS`.
- Revalidation invokes the same data loader with source authentication and the immutable saved profile. No self HTTP request, cookie forwarding, scheduler or application-auth bypass is involved. `x-cache-bypass: 1` skips the cache only after normal application authorization. HTTP snapshot revalidation bypasses the lower snapshot cache so two-minute refresh cannot renew five-minute-old service data.
- Concurrent loads are shared by profile/resource; failed authentication and thrown source errors cannot advance freshness. A successful REST authentication alone is not proof that Python collection works; the full connection test now checks it explicitly.
- VMs warm scoped host/cluster/datastore loaders with the same authenticated service. Hosts use full cluster enrichment instead of claiming a provisional standalone cluster. Settings save invalidates both the previous and resolved saved profiles after DB success. Pending loads and their child warming cannot republish after invalidation; unrelated profiles remain cached.
- Configuration changes made outside the settings route are detected by the next authorized GET through its profile identity. This is an in-process cache, not a distributed invalidation mechanism. The existing first-enabled configuration selection is preserved; this change does not add multi-vCenter orchestration.

See [ADR-014](../../10-architecture/adr/ADR-014-vmware-target-cache-revalidation.md), [cache runbook](../../30-runbooks/VMWARE_CACHE_REFRESH.md) and `npm run test:vmware-cache`.

## Verified Collection Contract (B08, 2026-10-16)

All three helper call paths use `lib/integrations/vmware-python.ts`: fixed script paths relative to the application working directory, an optional `VMWARE_PYTHON_BIN` interpreter path, no shell, and a versioned stdin JSON request. Credentials, VM IDs and TLS material are absent from process arguments. Output is capped at 10 MiB, input at 1 MiB, and the process deadline is thirty seconds. Raw helper output and SDK exception text are not included in user errors or logs.

`scripts/vmware_helper.py` shares request parsing, TLS policy, structured failure codes and SDK session cleanup. Node supplies its bundled roots plus the existing `VMWARE_TLS_CA_CERT_PATH` material. Python requires chain and hostname verification and independently rejects production bypass. Development requires an explicit insecure flag; the thumbprint field does not implement pinning. Hosts and snapshots retain the intentional REST/PyVmomi source split.

Only `protocol: 1, success: true` with a validated collection array establishes data, including genuine empty arrays. Missing SDK/interpreter/script, malformed output, auth/permission failures, TLS errors, timeouts and partial collection reject. A requested missing VM is `VM_NOT_FOUND`, rather than a claim that it has no snapshots. Snapshot timestamps have explicit UTC offsets. Host hardware is required and matched by MoRef; missing hardware cannot silently become zero CPU/memory. VM host mapping propagates these source errors.

`VMwareService.testConnection()` checks runtime preflight, REST status and the actual host/snapshot loaders. The snapshot check bypasses and does not populate caches. Both collectors settle before the owned REST test session closes on its matching modern/legacy endpoint. POST `action: test` preserves `connected`, optional `version`/`error`, and adds a safe error code when available. It retains ADMIN authorization and does not save settings. Ordinary `getStatus()`/REST status remains a narrower transport status.

Snapshot API, dashboard aggregate, recent-snapshot reader and existing snapshot alarm evaluators propagate unavailable sources. Cold helper failures return HTTP 503, timeouts 504; they do not create successful cache entries. Previously collected stale data remains subject to ADR-014's bounded stale window and unchanged age. The alarm engine's existing error/health path handles failures; no alarm engine was duplicated.

Production and development runtime recipes require `scripts/requirements-vmware.txt` (`pyvmomi==9.1.1.0`) in an isolated `/opt/vmware` virtual environment. Production explicitly copies both collectors and the shared helper; missing required installation fails the build. This change does not migrate the database or upgrade Node dependencies. See [ADR-015](../../10-architecture/adr/ADR-015-vmware-python-collection-contract.md) and the [collection runbook](../../30-runbooks/VMWARE_PYTHON_COLLECTION.md).

## Connection-scoped Inventory (B16, 2026-10-16)

Persisted hosts/VMs, cluster/datastore identities, capacity history and topology now carry saved-connection/endpoint scope. Credential/module/interval changes preserve inventory identity; retargeting preserves old inventory and imports into a new scope. Native event/entity IDs and cooldown evidence are scoped inside the existing alarm engine. Operational API requests accept `configId` and reject ambiguous selection; health/alarm defaults retain ADR-019's deterministic source selection. Automatic inventory scheduling can process multiple enabled VMware targets independently. This supersedes the earlier first-enabled operational selection statement; cache profile identity remains as described above. See [ADR-023](../../10-architecture/adr/ADR-023-inventory-source-identities.md) and the [migration/identity runbook](../../30-runbooks/INVENTORY_SOURCE_IDENTITIES.md).

## Related References

- `docs/20-modules/_misc/IMPROVEMENTS_ANALYSIS.md` — VMware 3-API architecture analysis
- `lib/alarms/queries/vmware.ts` — VMware alarm query functions
- `docs/30-runbooks/DATASTORE_CRITICAL.md` — Datastore capacity playbook
