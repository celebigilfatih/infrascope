# VMware vSphere Integration

> **File:** `lib/integrations/vmware.ts` (79K lines — largest integration)
> **Protocol:** vSphere REST API (`/api/vcenter/*`) + SOAP API (`/sdk`)
> **Auth:** Basic auth (username/password) → session cookie for SOAP
> **Data sources:** VMs, hosts, clusters, datastores, events, snapshots

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

## Related

- `docs/20-modules/_misc/IMPROVEMENTS_ANALYSIS.md` — VMware 3-API architecture analysis
- `lib/alarms/queries/vmware.ts` — VMware alarm query functions
- `docs/30-runbooks/DATASTORE_CRITICAL.md` — Datastore capacity playbook
