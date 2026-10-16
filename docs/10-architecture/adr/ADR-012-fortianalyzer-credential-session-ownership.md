# ADR-012: FortiAnalyzer Credential and Probe Session Ownership

**Status:** Accepted  
**Date:** 2026-10-15  
**Scope:** Audit B05; refines ADR-003 authentication ownership.

## Context and decision

A connection-test constructor still adopted the host-global collector session. A new account/password could therefore appear valid without being sent to FortiAnalyzer. The global login queue could also return another credential's session. The shared factory's existing credential fingerprint did not constrain this lower-level state.

Bind shared sessions, login results, invalidation and logout to a hash of the normalized host and exact authentication credentials. Snapshot constructor configuration so identity cannot change after binding. Do not adopt legacy host-only state. Preserve shared-session reuse and concurrent-login deduplication for identical credentials, including across module instances.

Provide one centralized `FortiAnalyzerService.testConnection` entry point. This is an explicit exception to the singleton rule for a bounded, ephemeral password probe: it always owns a fresh session state, sends the resolved username/password, and attempts logout for only its own returned session in `finally`. It cannot adopt or publish a collector session. Ordinary API-token clients keep their existing stateless behavior; adding token diagnostics is outside B05.

Keep account lockout protection distinct from session ownership: normalized host plus exact username share failure backoff and serialize login attempts, including probes. Changing passwords must not bypass active account backoff. A suppressed probe reports failure, never successful validation. A failed probe may delay a future login for that same account because the remote account also counts failed logins; it must not invalidate a valid collector session or affect another account. Saving configuration resets only that configured account's backoff, retaining the existing explicit recovery action without resetting unrelated hosts/accounts.

A successful probe retains account ownership through its bounded logout attempt, preventing concurrent probes from opening a burst of sessions while cleanup is delayed. Account queue waits are bounded and cancelled waiters are removed. Same-credential waiters receive a session only when that login attempt actually succeeds; a suppressed login cannot release an old cached session as a successful result.

Use existing TLS transport and source-deadline helper for the whole login operation, including JSON parsing, and bounded best-effort logout. Reject HTTP failures, outer RPC errors, malformed responses and non-string/empty sessions. Late completions after cancellation cannot publish session state. Do not retry a failed credential probe automatically or log authentication payloads, sessions, raw provider messages or credential-bearing transport errors.

## Compatibility and limits

The existing ADMIN authorization runs first. Explicit nonempty passwords take precedence; blank/omitted passwords retain the encrypted saved-password fallback. The test does not save settings, initialize an event cache or invoke alarm/notification work. Responses retain `success` and `connected` booleans. Test sessions are always transient; positive results require successful authentication with the resolved credentials.

This decision does not rebind old EventCache timers, clear response caches or fix the broader configuration lifecycle (B06). No schema, dependency, TLS policy or alarm-engine change is required. Provider-side lockout/session expiry and process restarts remain external limitations; logout is bounded best effort, not a guarantee of remote cleanup.

Subsequent B06 lifecycle work is documented separately in [ADR-013](ADR-013-fortianalyzer-cache-configuration-lifecycle.md); the B05 verification below remains historical evidence for this authentication boundary.

## Verification

Reviewed base: `816e6036fea121be4402fcdc81a68aaadda7331e` plus the preserved uncommitted B01–B04/dashboard work. The original reproduction was executed before modifying the authentication path: a wrong probe password returned `connected:true` using a valid collector session, and a correct probe did not create/close its own session. Both new reproduction assertions failed against the original path and pass after the fix.

One fresh read-only boundary investigator and one fresh candidate reviewer were used. The reviewer found that releasing the account mutex before probe logout allowed eight concurrent sessions while cleanup hung. This was independently reproduced as `8 !== 1`, corrected by retaining the probe lease through cleanup, and covered with recovery after queue/logout deadlines. A separate parent check found an unsuccessful/suppressed login could deliver an old session to same-credential waiters (`[false,true]`); it now returns `[false,false]`. Both assertions failed before their corrections and pass in the final suite. No second review cycle was performed.

Checks ran in the existing pinned runtime with this prefix:

```text
docker run --rm --network none --read-only --volumes-from infrascope-web-dev:ro --tmpfs /tmp -w /app --entrypoint node sha256:daf880f6655d0fdb5bd863f8a0407dcb93f57c2f530f3fa89dd573c36f60d3b0
```

No application environment file was loaded. Source/dependencies were mounted read-only; temporary writes were disposable. Actual auth/session, TLS-call decisions, HTTP test route, schema validation, encrypted credential protection/decryption and source-deadline code ran with fake transport/ORM and a deterministic clock. No customer login, DB or notification recipient was contacted.

| Ordered gate | Command / check | Actual result |
|---|---|---|
| 1: types/imports | Prefix + `node_modules/typescript/bin/tsc --noEmit --incremental false` | PASS, exit 0 on final source |
| 1: scoped hygiene | Host `git diff --check -- <B05 tracked paths>` | PASS, exit 0 |
| 2: credential boundary and alternate forms | Prefix + `scripts/check-fortianalyzer-auth.cjs` (`npm run test:fortianalyzer-auth` alias) | PASS, 45 scenarios, exit 0 |
| 2: original trigger | Same suite: valid collector session + explicit wrong password | Real outgoing credential payload captured by fake transport, result false, collector session retained; same-credential probe with correct password creates a different session and logs out only that session |
| 3: legitimate controls | Same suite | PASS: shared credential pooling/deduplication across module reloads, normalized hosts, different accounts/password revisions, concurrent probes/collectors, encrypted blank/omitted-password fallback, explicit-password precedence, whitespace, token collectors, ADMIN authorization and scoped save recovery |
| 3: failure/lifecycle controls | Same suite | PASS: account backoff/lock status, HTTP/RPC/malformed response failures, request/body deadlines, late results, logout failure/deadline, queued cancellation, cleanup serialization and redacted logs |
| 3: B01 | Prefix + `scripts/check-alarm-occurrences.cjs` | PASS, 19 scenarios, exit 0 |
| 3: B02 | Prefix + `scripts/check-alarm-sources.cjs` | PASS, 46 scenarios, exit 0 |
| 3: B03 | Prefix + `scripts/check-alarm-dispatch.cjs` | PASS, 34 scenarios, exit 0 |
| 3: B04 | Prefix + `scripts/check-integration-permissions.cjs` | PASS, 144 scenarios, exit 0; FA mock follows the centralized test entry point, actual B05 test independently runs the real client/route |
| 3: health | Prefix + `scripts/check-alarm-health.cjs` | PASS, exit 0 |
| 3: encryption compatibility | Prefix + `-e` registering `ts-node` with `compilerOptions:{module:'CommonJS'}` then requiring `./scripts/check-integration-credentials.ts` | PASS, exit 0: integrations, NMS v1/v2c/v3, backups, tamper and rotation. An initial CLI invocation failed to parse escaped compiler-option JSON before loading the test; the programmatic registration above corrected that invocation. |
| 3: targeted lint | ESLint `lintText` multiset comparison of severity/rule/message with the captured pre-B05 sources | PASS for no new diagnostics. FA service 9 → 6, FA route 24 → 23, 0 added. Existing diagnostics remain; full-repository lint is not claimed clean. |
| 3: CI wiring | `js-yaml` parse; assert package alias, regression step and script path trigger | PASS, exit 0. Remote CI was not triggered. |

Full Next build, browser/live FA authentication and production DB tests were not run. The relevant auth proof is the real path with controlled source responses plus TypeScript and compatibility suites. Real provider transport/session behavior is not established by fixtures. No dependencies, schema, credentials or customer configuration were changed. No commit/push was performed.

## Related

- [ADR-003](ADR-003-fa-session-management.md)
- [Audit B05](../../audits/POST_MERGER_ARCHITECTURE_BEHAVIOR_AUDIT.md)
- [FA account lockout runbook](../../30-runbooks/FA_ACCOUNT_LOCKED.md)
