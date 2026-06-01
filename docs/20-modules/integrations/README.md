# Integrations Module

> External system connections. Each integration has its own service, auth lifecycle, and error handling.

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
