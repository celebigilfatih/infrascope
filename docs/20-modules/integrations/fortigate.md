# FortiGate Integration

> **File:** `lib/integrations/fortigate.ts` (1,439 lines, 29 async methods)
> **Protocol:** REST API (`/api/v2/`) + SNMP v2c/v3 + SSH (config backup)
> **Auth:** Cookie-based (APSCOOKIE) with CSRF token; fallback to API token
> **Pattern:** Per-device service instance (not singleton — each FortiGate has its own config)

## Architecture

```
┌─────────────────────────────────────────────────┐
│              InfraScope App Server               │
│                                                  │
│  ┌─────────────────────────────────────────┐    │
│  │  FortiGateService (per-device)          │    │
│  │  - sessionCookie + csrfToken            │    │
│  │  - logout() before every re-login       │    │
│  │  - _eventLogCache (per-cycle)           │    │
│  └──────────────┬──────────────────────────┘    │
│                 │                               │
│    ┌────────────┼────────────┐                  │
│    ▼            ▼            ▼                  │
│  REST API    SNMP v2c/v3   SSH                 │
│  (policies,  (interfaces,  (config             │
│   addresses,  routing,      backup,            │
│   VIPs, ...)   HA status)   CMDB diff)         │
└─────────────────┬───────────────────────────────┘
                  │
        ┌─────────▼─────────┐
        │  FortiGate Device │
        │  - REST /api/v2/  │
        │  - SNMP :161      │
        │  - SSH :22        │
        └───────────────────┘
```

## Three Integration Modes

| Mode | Used for | Config |
|---|---|---|
| **REST** | Firewall policies, NAT, VIPs, zones, SD-WAN, VPNs, addresses | `syncMode: 'rest'` |
| **SNMP** | Interfaces, VLANs, routing basics, HA status, port counters | `syncMode: 'snmp'` |
| **Both** | Full sync — REST for policies + SNMP for interfaces | `syncMode: 'both'` |

Modules can be individually enabled/disabled via `enabledModules`:
```typescript
enabledModules: {
  interfaces: true,
  vlans: true,
  policies: true,
  addresses: true,
  vips: true,
  sdwan: true,
}
```

## Session Management

FortiGate uses **cookie-based auth** (APSCOOKIE) with CSRF protection:

| Method | Behavior |
|---|---|
| `login()` | POST `/logincheck` with username+secretkey → extract APSCOOKIE + CSRF token |
| `logout()` | GET `/logout` with cookie header → clear sessionCookie, csrfToken, csrfCookie |
| **Invariant** | Always calls `logout()` before new `login()` — prevents session pile-up |

Session expiry is **not explicitly detected** — failed API calls with 401/403 trigger re-login on next cycle.

## Key Methods

### Interfaces & VLANs (SNMP or REST)
| Method | Source | Returns |
|---|---|---|
| `fetchInterfaces()` | SNMP (IF-MIB) or REST (`/cmdb/system/interface`) | `FortiGateInterface[]` |
| `fetchVlans()` | SNMP (Q-BRIDGE-MIB) or REST | `FortiGateVlan[]` |

SNMP is preferred for interfaces because:
- Faster than REST for large interface lists
- Works even if REST API is rate-limited
- Returns live operational status (admin/oper state)

### Firewall Policies & Objects (REST only)
| Method | REST Endpoint | Returns |
|---|---|---|
| `fetchFirewallPolicies()` | `/cmdb/firewall/policy` | Policy rules with src/dst, service, action |
| `fetchAddresses()` | `/cmdb/firewall/address` | Address objects (IP, FQDN, range, geo) |
| `fetchVIPs()` | `/cmdb/firewall/vip` | Virtual IPs (DNAT rules) |
| `fetchZones()` | `/cmdb/firewall/zone` | Security zones |
| `fetchSDWANMembers()` | `/cmdb/system/sdwan` | SD-WAN members and rules |

### Event Logs (REST)
| Method | Purpose |
|---|---|
| `getEventLogs(filter, rows)` | Fetch event logs with filter (cached per-cycle) |
| `getAdminLoginEvents()` | Wrapper: `subtype==system&&action==login` |

Event log cache: `_eventLogCache` is a Map keyed by `filter|rows`, cleared each poll cycle.
Multiple alarms sharing the same broad filter (e.g., `subtype==system`) make only **1 API call**.

### Config Backup & Diff (SSH)
| Method | Purpose |
|---|---|
| `fetchRunningConfig()` | SSH `show full-configuration` → raw config text |
| `getConfigDiff(previousHash, currentConfig)` | Line-by-line diff of consecutive snapshots |

CMDB snapshots stored in `cmdb_snapshots` table:
- `device_serial`, `config_hash`, `config_text` (compressed), `taken_at`
- Diff computed on-demand when config-revisions page loads

## SNMP Configuration

```typescript
snmp: {
  community: 'Nat3k20May17',  // Cisco/FortiGate community string
  version: '2c' | '3',
  credentials?: {             // SNMPv3 only
    user, authPassword, privPassword,
    authProtocol: 'MD5' | 'SHA',
    privProtocol: 'DES' | 'AES',
  }
}
```

SNMP fail-fast config: **timeout 3s, retry 1** — avoids blocking poll cycles on unreachable devices.

## Vendor-Aware CLI

For SSH config backup, the service detects device vendor and uses the correct command:
- **FortiOS:** `show full-configuration`
- **Cisco IOS/NX-OS:** `show running-config`
- **HP Comware:** `display current-configuration`
- **Pagers** (`--More--`) are auto-dismissed via terminal width setting

## Error Handling

| Error | Handler |
|---|---|
| REST 401/403 | Session expired → `logout()` + re-login on next poll |
| SNMP timeout | 3s timeout, 1 retry → interface marked "unreachable" |
| SSH connection fail | Config backup skipped, logged, retry next cycle |
| Rate limit (REST) | Backoff in poll scheduler (not in service itself) |

## Related

- `docs/10-architecture/adr/ADR-001-prefer-config-revisions-over-cmdb-diff.md` — CMDB-diff decision
- `lib/alarms/queries/fortigate-config.ts` — FG event log queries for alarms
- `lib/alarms/queries/fortigate-vpn.ts` — FG VPN event queries
- `app/network/config-revisions/page.tsx` — Config Revisions UI
