# ADR-003: FortiAnalyzer Session Lifecycle Management

**Status:** Accepted
**Date:** 2026-02-17
**Supersedes:** — (no prior ADR)

## Context

The FortiAnalyzer integration (`lib/integrations/fortianalyzer.ts`) suffered from **permanent
account lockout** that could only be fixed by deleting and recreating the FA user account.
Root cause analysis identified two compounding problems:

1. **Server-side session pile-up.** `FortiAnalyzerService` never called `/sys/logout`. Every
   login (including after code hot-reloads, session expiry, alarm runner restarts) created a new
   session on FA. FA has a max-concurrent-sessions-per-admin limit (default ~5). Once exceeded,
   FA marks the account as "abusive" and locks it.

2. **Stale session reuse.** `isSessionValid()` only checked a local 30-minute TTL. But FA's
   `admin-idletimeout` (default 5 min) is shorter. After FA killed the session server-side,
   the code kept sending the dead session token on every API call. FA counted each dead-session
   call as a failed auth attempt → `admin-lockout-threshold` hit → account locked.

GUI "Unlock" only cleared the lockout flag; orphan sessions and abuse counter persisted.
The account relocked within minutes. Only **user recreation** purged both.

This incident caused:
- 31 alarm queries failing with `search-timeout` / `no TID` in a single check cycle
- All FA-based alarms (config-change, IPS, IOC, SSL-VPN, web-analytics, ...) going silent
- Repeated manual intervention (FA GUI unlock → relock → user recreate)

## Decision

`FortiAnalyzerService` must manage session lifecycle with three mandatory mechanisms:

### 1. Logout before every new login

```typescript
async login(): Promise<boolean> {
  // ... API key / valid session early returns ...

  const state = getGlobalLoginState(this.config.host);

  // Best-effort logout if we have a stale/cached session on file.
  if (state.session) {
    await this.logout();
  }
  // ... backoff, mutex, actual login ...
}
```

`logout()` calls `POST /sys/logout` on FA, then clears both local and global session state:

```typescript
private async logout(): Promise<void> {
  const state = getGlobalLoginState(this.config.host);
  const sess = state.session || this.session;
  if (!sess || this.config.accessToken) return; // no session or API-key auth

  // POST /sys/logout (best-effort, ignore errors)
  await fetchWithAgent(this.baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'exec',
      params: [{ url: '/sys/logout' }],
      session: sess,
      id: 99,
    }),
  } as any).catch(() => null);

  // Always clear state regardless of logout success
  state.session = null; state.lastLoginTime = 0;
  this.session = null; this.lastLoginTime = 0;
}
```

### 2. Session-expiry detection on every API response

```typescript
private isSessionExpiredError(code?: number, message?: string): boolean {
  if (code === -11 || code === -6) return true;
  const msg = (message || '').toLowerCase();
  return msg.includes('invalid session') || msg.includes('session expired') ||
         msg.includes('login required') || msg.includes('no permission');
}
```

When any API call returns a session-expired error, `invalidateSession()` clears the cached
session so the next call triggers a fresh login instead of hammering FA with a dead token.

### 3. GlobalThis-level state sharing

Session state is keyed by `host` in `globalThis._fazGlobalState[host]`. This ensures:
- Hot-reloaded module instances share the same session.
- Alarm runner and API routes share backoff state.
- The login mutex (`isConnecting`) prevents parallel login storms.

## Consequences

### Easier
- FA account will **never** lock due to session pile-up or stale reuse again.
- Session expiry triggers automatic re-login (transparent to caller).
- Multi-instance scenarios (dev hot-reload, SSR + API route) no longer race.

### Harder / New responsibilities
- Every new FA integration method must use `getSharedFortiAnalyzerService()` or
  `initSharedFortiAnalyzerService()` — **never** `new FortiAnalyzerService()`.
- If FA JSON-RPC error codes change in future FA versions, `isSessionExpiredError()`
  may need updating.
- The `logout()` call adds ~10ms overhead per login (negligible; login is ~2-3s).

### Rollback
To revert: remove `logout()` calls from `login()`, remove `invalidateSession()` calls
from API response handlers. **Warning:** this will reintroduce the lockout problem.

## Related

- `docs/00-product/CONSTITUTION.md` — İlke #8 (logout zorunlu), #10 (singleton), #11 (lockout tespiti)
- `docs/30-runbooks/FA_ACCOUNT_LOCKED.md` — Incident playbook (triage, cleanup, prevention)
- `lib/integrations/fortianalyzer.ts` — Implementation (logout, invalidateSession, isSessionExpiredError)
- `lib/integrations/fortigate.ts` — Reference (FortiGate already had logout pattern)

## History

| Date | Change |
|---|---|
| 2026-02-17 | Initial — session pile-up fix, logout + expiry detection + global state |
| 2026-05-20 | Inner status check added to `startLogSearch()`, `getMitreAttackMatrix()`, `getMitreTechniqueDetails()` — all 8 API methods now covered (outer error + inner status) |
