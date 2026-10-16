# Integrations Module

> External system connections. Each integration has its own service, auth lifecycle, and error handling.

VMware/Zabbix inventory identity is now scoped by saved connection and endpoint. Multiple enabled sources may import independently; ambiguous manual/operational selection requires `configId`. See [source identities](../../30-runbooks/INVENTORY_SOURCE_IDENTITIES.md) and [ADR-023](../../10-architecture/adr/ADR-023-inventory-source-identities.md), including conservative legacy attribution and deployment requirements.

Saved inventory intervals and NMS polling now have separate runtime contracts; see [scheduling](../../30-runbooks/SAVED_SYNC_POLL_SCHEDULING.md) and [ADR-022](../../10-architecture/adr/ADR-022-saved-inventory-poll-scheduling.md). Automatic inventory work uses the existing source services and manual exclusion, not an alarm-engine copy.

VMware/Zabbix inventory imports share explicit `success / partial / failed` outcomes and atomic log/config metadata. Partial progress is never full success. See [the sync outcome runbook](../../30-runbooks/INVENTORY_SYNC_OUTCOMES.md) and [ADR-021](../../10-architecture/adr/ADR-021-inventory-sync-outcomes.md).

## Integrations

| Integration | File | Protocol | Auth | Singleton? |
|---|---|---|---|---|
| **FortiAnalyzer** | `lib/integrations/fortianalyzer.ts` | JSON-RPC HTTPS | Session (30-min TTL) / API key | ✅ Yes |
| **FortiGate** | `lib/integrations/fortigate.ts` | REST + SNMP + SSH | Cookie (APSCOOKIE) / Token | ❌ Per-device |
| **VMware vSphere** | `lib/integrations/vmware.ts` | REST + SOAP | Basic auth → session cookie | ✅ Yes |
| **NMS** | Python agent + shared DB | SNMP + SSH | Community string / SSH key | N/A (separate service) |

## Module READMEs

- **[fortianalyzer.md](./fortianalyzer.md)** — Session lifecycle, log search, FortiView, MITRE ATT&CK
- **[fortigate.md](./fortigate.md)** — REST/SNM/SSH modes, config backup, vendor-aware CLI
- **[vmware.md](./vmware.md)** — REST+SOAP dual API, event sync, datastore monitoring
- **[nms.md](./nms.md)** — SNMP polling, port-down detection, config backup, device discovery

## Related

- `docs/00-product/CONSTITUTION.md` — İlke #8-11 (entegrasyon hijyeni)
- `docs/10-architecture/adr/ADR-003-fa-session-management.md` — FA session lifecycle
- `docs/30-runbooks/FA_ACCOUNT_LOCKED.md` — FA lockout incident playbook
- `docs/20-modules/_misc/IMPROVEMENTS_ANALYSIS.md` — VMware 3-API architecture analysis
