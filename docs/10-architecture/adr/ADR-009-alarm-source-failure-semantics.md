# ADR-009: Alarm Source Failure Semantics

**Status:** Accepted  
**Date:** 2026-10-15  
**Scope:** Audit B02; existing FortiAnalyzer log queries and event-cache consumers in the alarm engine.

## Context

The shared query runner caught live-source exceptions and returned successful empty events. Missing search task IDs and exhausted polls also looked empty. The cache ignored every upsert failure and counted unstarted searches as successful syncs. A single successful logtype could make all cache queries appear fresh. Consequently, the runner and health endpoint could not observe some real source failures.

The bundled LogView API v3 reference (`api-ref/faz_logview.htm`, "Fetch search results") documents `percentage=100` as completion of the requested search/page. Nonempty partial data is not proof of completion. Failure and pending states must not establish an authoritative empty result.

## Decision

- Keep the existing engine, query registry, cache-first strategy and runner/health contracts. A `QueryResult` represents success; source and storage failures reject. The existing batch/evaluation error boundary produces `EvaluationResult.error`, which the runner records as an error check.
- `runAlarmQuery` may recover a failed cache read with a successful live query. Empty-cache verification runs once and must succeed. Database-only queries never call FortiAnalyzer, including when soft verification is requested.
- Log-search start/result methods reject HTTP, authentication/session, provider-status and malformed-response failures. They keep session invalidation on expiry. Alarm/cache polling requests explicit completion metadata; pending pages return `null`, completed pages return arrays, including `[]`. The optional strict completion mode avoids changing legacy callers that intentionally read partial results.
- Share bounded start/poll helpers across dedicated queries, generic searches, cache sync/pagination and correlation secondary searches. Start has a 10-second budget; alarm polls have a 12-second budget (four attempts, two-second intervals). Cache polls have larger bounded budgets. Deadlines include response parsing and cancel log-search request signals. They do not replace the global runner/sync scheduling lifecycle addressed separately in the audit.
- A registered query failure propagates; it cannot switch to a generic query with different selection semantics. Generic cache reads require fresh coverage for their logtype, including nonempty results.
- Track freshness per logtype in the existing process-local cache service. Coverage requires completed source searches and successful writes. A targeted event-search failure invalidates event coverage; successful unrelated types remain usable. A failed refresh invalidates coverage immediately, even if the previous sync was recent. Global freshness requires all seven types. Partial cycles participate in sync backoff.
- Retry a Prisma `P2002` upsert race once. Only confirmed persistence counts as success; arbitrary write errors and failed duplicate retries propagate. Partial writes may remain but cannot establish fresh coverage. Cache reads reject on DB failure.
- `forceSync` remains non-throwing for its existing callers; failure is observable through per-type/global status and structured logs. Alarm queries then use live fallback. A successful live query can establish a successful alarm check even while cache coverage remains unavailable.

## Limits and consequences

No schema, dependency, credential, alarm threshold, notification policy or production data changes. Historical check rows are retained. A completed empty check may establish recovery under the existing health rules; a source failure cannot.

An analyzer that omits documented completion metadata now fails visibly on these alarm paths instead of reporting a clean check. Its response contract must be verified and adapted explicitly. Cache state is still process-local; source/config scoping, multi-process coordination, broader cancellation, cache event identity/time parsing, VMware collection failure semantics and independent source dispatch remain separate audit findings. Unregistered legacy FortiGate query exports are not activated or rewritten by this change.

## Verification

`npm run test:alarm-sources` executes real FortiAnalyzer client, query, cache, engine, runner and health code with fake transport, ORM, notifications and deterministic source timers. It covers completed empty/nonempty results, partial progress/recovery, missing metadata/TIDs, auth/session/status/transport failures, request/body deadlines, cancellation, cache I/O failures, duplicate retries, partial coverage, pagination, correlation and check-health recovery/history. No real integration, installation database or notification recipient is contacted.

Also run occurrence and alarm-health regressions, TypeScript and targeted lint. CI includes source regressions in the existing alarm-check workflow. Passing fixtures do not constitute a live firmware or customer-environment smoke test.

Local verification on 2026-10-15 used the existing pinned Node 20 development image in disposable containers with `--network none`, read-only application/dependency mounts and a temporary `/tmp`. No application environment file was loaded.

| Check | Result |
|---|---|
| `test:alarm-sources` | 46 scenarios passed |
| `test:alarm-occurrences` | 19 scenarios passed |
| `test:alarm-health` | Passed |
| TypeScript `--noEmit --incremental false` | Passed |
| `test:nms-backups`, `test:dashboard`, `test:switch-alarms` | Passed |
| `security:fortianalyzer-correlation-check` | Passed |
| Workflow YAML/package command validation; `git diff --check` | Passed |
| Targeted ESLint baseline comparison against HEAD | No new diagnostics: base/types/new helpers 0; event-cache 8, engine 38 and FA client 9 unchanged |

Targeted lint still exits nonzero for those pre-existing diagnostics; this is not a clean repository-wide lint result. Full Next.js build, live-source tests and the opt-in PostgreSQL occurrence suite were not rerun in B02. Storage failures here use the real cache logic with a fake ORM; actual database migration/transaction/concurrency verification remains recorded separately under B01. Remote CI was not triggered.

Rollback can revert these source/query changes without a DB migration, but restores the false-success behavior. Do not repair health by editing historical check records or representing an incomplete provider response as an empty success.

## Related

- [Audit B02](../../audits/POST_MERGER_ARCHITECTURE_BEHAVIOR_AUDIT.md)
- [Alarm check health](../../30-runbooks/ALARM_CHECK_HEALTH.md)
- [ADR-008](ADR-008-fortinet-occurrence-identity.md)

## History

| Date | Change |
|---|---|
| 2026-10-15 | B02 failure propagation, completed-result contract, per-logtype cache coverage and isolated regressions. |
