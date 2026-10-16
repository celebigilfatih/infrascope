# FortiAnalyzer Integration

**B20 update (2026-10-16):** All active readers now resolve one decrypted host/ADOM/authentication profile. Settings expose explicit ADOM and session/API-key selection; local keys use Bearer headers without JSON-RPC sessions, and connection tests perform a bounded read in the selected ADOM. Legacy root defaults and `accessToken` aliases remain supported; keys are protected at rest. Client, event-cache, FortiView response-cache and health revisions isolate target changes. See [ADR-027](../../10-architecture/adr/ADR-027-fortianalyzer-adom-authentication.md) and the [ADOM/authentication runbook](../../30-runbooks/FORTIANALYZER_ADOM_AUTH.md) for current contracts, coverage and limitations. Historical singleton/root examples below are not the current target/authentication contract.

> **File:** `lib/integrations/fortianalyzer.ts` (1,072 lines, 17 async methods)
> **Protocol:** JSON-RPC over HTTPS (`/jsonrpc`)
> **Auth:** Username/password session (30-min TTL) or API key (stateless)
> **Singleton:** `getSharedFortiAnalyzerService()` / `initSharedFortiAnalyzerService()`

**B05 update (2026-10-15):** Shared authentication is bound to normalized host and exact credentials in `globalThis._fazAuthStateV2`; account backoff/serialization is bound to host plus username. The older host-only diagram/examples below are historical. Use `FortiAnalyzerService.testConnection` for the ADMIN password test: it owns a fresh, bounded session and attempts logout in `finally`, without adopting or closing a collector session. Blank passwords retain the saved encrypted-password fallback; active account backoff returns failure rather than a successful validation. See [ADR-012](../../10-architecture/adr/ADR-012-fortianalyzer-credential-session-ownership.md) and run `npm run test:fortianalyzer-auth`.

## Architecture

**B06 update (2026-10-15):** `fortianalyzer-cache-runtime.ts` owns one process-global collector per saved configuration revision. Successful saves retire old timers/source work and rebind an already running collector; scheduled cycles re-read settings. Cache IDs/JSONB provenance and HTTP cache keys are revision-scoped. Native results exclude internal provenance metadata. See [ADR-013](../../10-architecture/adr/ADR-013-fortianalyzer-cache-configuration-lifecycle.md); run `test:fortianalyzer-cache` and the opt-in `test:fortianalyzer-cache:db`. The historical diagram below is not the current ownership contract.

```
┌─────────────────────────────────────────────────┐
│              InfraScope App Server               │
│                                                  │
│  ┌─────────────────────────────────────────┐    │
│  │  globalThis._fazGlobalState[host]       │    │
│  │  - session, backoffUntil, isConnecting  │    │
│  │  - consecutiveFailures, isAccountLocked │    │
│  └──────────────┬──────────────────────────┘    │
│                 │ shared across all instances   │
│  ┌──────────────▼──────────────────────────┐    │
│  │  FortiAnalyzerService (singleton)       │    │
│  │  - login() with global mutex            │    │
│  │  - logout() before re-login             │    │
│  │  - invalidateSession() on expiry        │    │
│  │  - withRetry() exponential backoff      │    │
│  └──────────────┬──────────────────────────┘    │
│                 │                               │
│  ┌──────────────▼──────────────────────────┐    │
│  │  Alarm Query Layer (queries/*.ts)       │    │
│  │  - runAlarmQuery() cache-first          │    │
│  │  - soft fallback to FA live API         │    │
│  └─────────────────────────────────────────┘    │
└─────────────────┬───────────────────────────────┘
                  │ HTTPS POST /jsonrpc
                  ▼
        ┌───────────────────┐
        │  FortiAnalyzer    │
        │  - event logs     │
        │  - cached_events  │
        │  - FortiView      │
        │  - MITRE ATT&CK   │
        └───────────────────┘
```

## Session Lifecycle (ADR-003)

| State | Behavior |
|---|---|
| **login()** | Checks global mutex → logout stale session → login → store in `globalThis` |
| **logout()** | `POST /sys/logout` (best-effort) → clears local + global state |
| **invalidateSession()** | Clears session on `code === -11 / -6` or message matching |
| **Backoff** | Exponential: 1→1min, 2→2min, 3→4min, ... 6+→60min |
| **Account locked** | FA returns `code === -22` → `isAccountLocked = true`, backoff extends |

**Key invariant:** Every login has a logout. No session pile-up on FA server.

## Methods

### Core
| Method | Purpose | Returns |
|---|---|---|
| `login()` | Authenticate with user/pass or use API key | `boolean` |
| `logout()` | Release server-side session | `void` |
| `getStatus()` | FA system status | `Record<string, unknown> \| null` |
| `getAdoms()` | List ADOMs | `Array<Record> \| null` |
| `getDevices()` | List managed devices | `Array<Record> \| null` |

### Log Search (batch pattern)
| Method | Purpose | Returns |
|---|---|---|
| `startLogSearch(logtype, limit, filter?)` | Start async log search, get TID | `number \| null` |
| `fetchLogResults(tid, offset, limit)` | Fetch results by TID | `Array<Record> \| null` |

Used by alarm queries: `startLogSearch` → poll with `fetchLogResults` → return events.

### FortiView
| Method | Purpose |
|---|---|
| `getFortiView(viewName, limit, sortBy?, filter?, timeRangeMinutes)` | Run FortiView query, poll until 90%+ complete |

Used by: IPS, Web Analytics, IOC, MITRE ATT&CK pages.

### MITRE ATT&CK
| Method | Purpose |
|---|---|
| `getMitreAttackMatrix(options)` | Get ATT&CK matrix with event counts |
| `getMitreTechniqueDetails(techId, options)` | Get technique details with handler summary |

## Alarm Query Integration

FA is the **primary data source** for ~60% of InfraScope alarms via `lib/alarms/queries/`:

| Query file | Alarm types |
|---|---|
| `config-change.ts` | ADMIN_CONFIG_CHANGE, FW_POLICY_CHANGED, FIRMWARE_CHANGE, ... |
| `auth-events.ts` | ADMIN_LOGIN_FAILED, OFFHOURS_ADMIN_LOGIN, ... |
| `vpn-events.ts` | VPN_BRUTE_FORCE, SSLVPN_LOCKOUT, IPSEC_TUNNEL_DOWN, ... |
| `security-events.ts` | IPS signatures, IOC hosts, web analytics |

Query pattern: `runAlarmQuery(ctx, description, cacheQueryFn, faQueryFn, options)`
1. Try Prisma on `cached_events` (fast, local DB)
2. If cache stale/empty → FA live API via `startLogSearch` + `fetchLogResults`
3. Optional soft fallback for critical alarms

## Error Handling

| Error | Code | Handler |
|---|---|---|
| Network timeout | AbortController (60s login, 90s search, 120s results) | Retry with backoff |
| Invalid session | `-11`, `-6`, message contains "session" | `invalidateSession()` → re-login on next call |
| Account locked | `-22` | `isAccountLocked = true`, backoff extends, log warning |
| Search timeout | `no TID` response | Alarm gets `error: "search-timeout"` |

## Health Endpoint

`getFortiAnalyzerLoginHealth(host)` returns:
```json
{
  "consecutiveFailures": 0,
  "isAccountLocked": false,
  "backoffRemainingSec": 0,
  "lastFailureAt": null
}
```

Exposed via `/api/health` → used by alarm runner to skip FA queries when locked.

## Related

- [UTC event-time contract and cache recovery](../../30-runbooks/FORTIANALYZER_EVENT_TIME.md) — B18 normalization, explicit offsets, invalid-source errors and derived-cache versioning.

- `docs/10-architecture/adr/ADR-003-fa-session-management.md` — Session lifecycle decision
- `docs/30-runbooks/FA_ACCOUNT_LOCKED.md` — Incident playbook
- `lib/alarms/queries/base.ts` — `runAlarmQuery()` cache+fallback engine
