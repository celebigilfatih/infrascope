# FortiGate Integration

> **Files:** `lib/integrations/fortigate.ts`, `lib/integrations/fortigate-snmp.ts`, `lib/firewall/snmp-read.ts`
> **Protocol:** FortiGate REST (`/api/v2/`); stored NMS interface observations from the existing SNMP/SSH collector. No direct Node SNMP transport.
> **Auth:** Cookie-based (APSCOOKIE) with CSRF token; fallback to API token
> **Pattern:** Shared connector registry per `IntegrationConfig.id + normalized VDOM`; settings fingerprints retire stale clients (ADR-005).

## Direct SSL-VPN Alarm Targets (B10)

The existing alarm engine enumerates enabled FortiGate integration IDs only when selected direct SSL-VPN rules exist. Each explicit `configId` is resolved through `getFortiGateConnector`; its saved VDOM, or `root`, defines the alarm scope. Arbitrary first-target selection remains forbidden. This does not discover other VDOMs on an appliance. An unlinked legacy configuration remains supported; linked targets retain the factory's management host and inventory mapping.

`runAlarmCheck` is shared by manual POST, scheduler and watchdog. NMS, VMware, FortiAnalyzer and notification retries still run once per full cycle. Direct-target failures produce rule errors with `target.configId` and, after successful resolution, `target.vdom`/`target.key`. Other targets continue. The next cycle resolves saved credentials, host, VDOM and enabled state again.

Direct SSL-VPN evidence carries target identifiers. Incidents and cooldowns use a target/user entity for per-user rules and a target entity for the business-hours aggregate. Session occurrence IDs use stable session evidence rather than duration or traffic counters. Email still passes through the existing incident delivery path, so two targets with the same username have separate incident cooldowns. Target identity is operational configuration/VDOM scope, not a newly inferred physical serial identity.

The old process-global service injection hook had no active callers and was removed from the engine. Exported direct-log/CMDB query helpers remain intentionally inactive in the registry; this fix does not activate them or reroute FortiAnalyzer-backed log alarms. Historical unscoped incidents are retained; uncertain ownership is not guessed during transition. See [ADR-017](../../10-architecture/adr/ADR-017-fortigate-alarm-target-scope.md) and the [alarm target runbook](../../30-runbooks/FORTIGATE_ALARM_TARGETS.md).

## Architecture

```text
connector-factory (explicit configuration + VDOM)
  -> FortiGateService
     -> REST mode interfaces / enabled REST modules -> FortiGate REST API
     -> SNMP/both interfaces -> readFortiGateSnmpInterfaces
        -> readFirewallSnmpInterfaceSnapshot -> stored nms_interfaces
                                             <- existing NMS SNMP/SSH collector
```

NMS collection and SSH backups belong to the existing NMS service. No HTTP/161 shim, alternate collector or new background job is used. Mode and source boundaries are documented in [ADR-018](../../10-architecture/adr/ADR-018-fortigate-snmp-inventory-source.md).

## Three Integration Modes

| Mode | Used for | Config |
|---|---|---|
| **REST** | Firewall policies, NAT, VIPs, zones, SD-WAN, VPNs, addresses | `syncMode: 'rest'` |
| **SNMP** | Fresh stored NMS interfaces for a linked root/device-wide target; enabled REST-only modules are unsupported | `syncMode: 'snmp'` |
| **Both** | NMS interfaces plus enabled REST modules; source failure does not silently fall back | `syncMode: 'both'` |

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
| `fetchInterfaces()` | Stored NMS interface observations or REST (`/cmdb/system/interface`) according to mode | `FortiGateInterface[]` with nullable uncollected fields and NMS observation metadata |
| `fetchVLans()` | REST (`/cmdb/system/vlan`); no SNMP VLAN implementation | `FortiGateVlan[]` |

The NMS path reads existing polled observations rather than starting a new SNMP request. It requires a matching enabled integration/connector/device, management host and NMS polling profile. No new inventory is created if the complete interface source cannot be validated. It retains observed names/states/speed/MTU/counters and collection time, while uncollected IP/mask/type/duplex/parent remain null. Schema-required unknown interface values use `OTHER`/`UNKNOWN`; existing IP/MAC/type metadata is preserved on updates. Sync results expose `interfaceSource` as `nms` or `fortigate-rest` with collection time.

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

Configure polling, management address, SNMP version and credentials on the linked NMS inventory device. SNMPv2c uses its protected community; SNMPv3 uses its configured username, security level, auth/privacy protocols and protected secrets. The existing NMS collector resolves those credentials. No credentials belong in this document or a diagnostic response.

Legacy FortiGate SNMP fields are retained without being treated as an operational transport. Stored NMS interface data may also come from the existing SSH fallback, so sync reports `nms` provenance and collection time rather than claiming a new SNMP handshake. Fresh data, matching target identity and root/device-wide scope are required. See [FortiGate SNMP inventory](../../30-runbooks/FORTIGATE_SNMP_INVENTORY.md) for supported modes, freshness, unknown fields and validation limits.

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
| Missing/stale/invalid NMS observations | Explicit unavailable result; no inventory source writes, silent REST fallback or successful empty snapshot |
| SSH connection fail | Config backup skipped, logged, retry next cycle |
| Rate limit (REST) | Backoff in poll scheduler (not in service itself) |

## Related

- `docs/10-architecture/adr/ADR-001-prefer-config-revisions-over-cmdb-diff.md` — CMDB-diff decision
- `lib/alarms/queries/fortigate-config.ts` — FG event log queries for alarms
- `lib/alarms/queries/fortigate-vpn.ts` — FG VPN event queries
- `app/network/config-revisions/page.tsx` — Config Revisions UI
