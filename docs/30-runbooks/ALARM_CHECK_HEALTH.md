# Alarm check health and recovery

## Incident — 2026-10-15

The installation had no integration configuration records. Each scheduled NMS check completed, but the runner also appended `FORTIANALYZER_SOURCE: FortiAnalyzer not configured`. This produced repeated `PARTIAL` rows with one error each; seven rows were present in the last-hour window. The health endpoint degraded on more than five such rows.

An absent or disabled optional FortiAnalyzer integration is now skipped with a structured `source=FORTIANALYZER, reason=not-configured` log. A configured integration with missing credentials, an authentication/transport failure, or a real NMS evaluation error still creates an error result. Check logs retain their original values. Error summaries now include their codes in structured runner logs.

## Health semantics

Full and source-only checks share atomic ownership and cancellation. A `SOURCE_SUCCESS` from a VMware-only manual check cannot establish global recovery; startup cannot orphan a live owner's RUNNING row. See [alarm run ownership and recovery](ALARM_RUN_OWNERSHIP.md) for B19 diagnostics, deadlines and actual regression results.

- `alarms.recentErrors` is the number of checks containing errors during the last hour, including historical checks followed by recovery. It is not a count of distinct alarm definitions or current incidents.
- `alarms.unresolvedErrorChecks` counts error checks in that window after the most recent `SUCCESS` check with zero errors. An unfinished, partial or failed check cannot establish recovery.
- More than five unresolved error checks contribute `degraded` to the overall health status, preserving the existing threshold. A successful check clears that contribution without rewriting history. New errors accumulate again.
- Datasource failures, scheduler/monitor failure and permanent notification failures retain their separate health checks. An alarm recovery does not override them.

## Diagnosis and verification

1. Read `/api/health`, including datasource statuses, scheduler state and both alarm counters.
2. Inspect recent `alarm_check_logs` rows (`checkTime`, `status`, `totalAlarms`, `errorCount`). Find the matching `alarm-runner` structured logs; summaries include error codes. Logs from deleted containers require external log retention.
3. Check enabled integration configuration metadata without printing credentials. Do not enable or fabricate a FortiAnalyzer integration for an NMS-only installation.
4. Correct an actual source/query failure, then let the scheduler run or use the authenticated manual alarm-check action. Confirm a new `SUCCESS` row with zero errors and review overall health. Historical `recentErrors` may remain nonzero until its one-hour window expires.

Regression command: `npm run test:alarm-health`. The isolated suite executes the real runner and health route with simulated dependencies; it covers absent/disabled integrations, malformed configured credentials, login/query/license failures, successful recovery, renewed degradation and preservation of historical logs. It sends no notifications and contacts no live integrations.

## Local verification — 2026-10-15

After restarting the web process with the fix, the normal scheduler completed a real NMS check at `07:17:52 UTC` (`10:17:52 Europe/Istanbul`): `SUCCESS`, one evaluated alarm, zero errors, 78 ms. `/api/health` returned `healthy`, `unresolvedErrorChecks: 0`, and healthy scheduler, monitor, database and NMS. The seven original `PARTIAL` rows remained unchanged; the oldest had aged outside the one-hour counter by verification time. TypeScript, targeted ESLint, alarm-health regressions, switch-alarm checks and NMS backup API checks all passed.

## B02 — Source failure diagnosis

FortiAnalyzer alarm queries now reject failures instead of returning clean empty events. A completed LogView response (`percentage: 100`, success status, data array) can legitimately contain zero events. A pending search, missing TID/completion metadata, HTTP/auth/session/status error or DB write failure cannot establish success.

The existing runner stores these evaluation errors in `PARTIAL`/`FAILED` checks and includes their alarm codes/messages in structured logs. Do not clear old check rows to restore health. Correct the source/storage failure and verify a subsequent `SUCCESS` check with zero errors. Existing datasource and scheduler health checks still apply independently.

Inspect structured source codes such as `SEARCH_NOT_STARTED`, `SEARCH_INCOMPLETE`, `SOURCE_HTTP_ERROR`, `SOURCE_SESSION_EXPIRED`, `SOURCE_REJECTED`, `SOURCE_INVALID_RESPONSE` and `SOURCE_TIMEOUT`. Check enabled configuration metadata, trusted connectivity, analyzer permissions and LogView response compatibility without printing credentials or raw customer events. A session error invalidates the cached session; retry on the next normal cycle rather than creating a login storm.

`EventCacheService.getCacheStatus()` includes `failedLogtypes`; per-type failures also appear in structured sync logs. A failed refresh immediately invalidates that logtype; a targeted event-search failure invalidates `event`. Global `isFresh` requires all seven logtypes. A recent global `lastSyncTime` alone is not proof of complete coverage. Queries may recover through a confirmed live result while the background cache remains unavailable. Retention cleanup failure is logged separately and does not invalidate a successfully persisted source scan.

`npm run test:alarm-sources` uses real source/query/cache/engine code with fake I/O/timers and composes its results with the real runner/health fixture. It contacts no live devices, DB or SMTP. Run alongside `test:alarm-occurrences` and `test:alarm-health`. The original live NMS verification above predates B02; it is not a live FortiAnalyzer verification of this change. See [ADR-009](../10-architecture/adr/ADR-009-alarm-source-failure-semantics.md) for completion/deadline contracts and remaining audit boundaries.

## B03 — Independent sources

The scheduler/manual runner now preserves NMS, VMware and direct FortiGate SSL-VPN evaluation when FA is absent, disabled, misconfigured or failing. Inspect enabled source configuration and alarm metadata independently. VMware uses `VMWARE_VCENTER`; direct SSL-VPN uses the existing FortiGate connector. FA-backed firewall log alarms still require FA.

Absent/disabled optional integrations are skipped. Configured-source init/auth/query failures remain errors scoped to that source's rules. A FA configuration/decryption error appears as `FORTIANALYZER_SOURCE`; an unexpected shared catalog/engine exception appears as `ALARM_ENGINE`. Neither should be mislabeled as a successful empty query. NMS runs once in the runner and is excluded from the subsequent engine dispatch.

The explicit VMware action uses the same engine with only VMware selected; missing/disabled VMware configuration with enabled VMware rules produces an error summary. It does not read FA settings or start unrelated source work. Its POST permissions and disabled GET trigger are described under B04 below.

Run `npm run test:alarm-dispatch` with the occurrence/source/health suites. The dispatch suite uses fake I/O, executes real routing and VMware/FG evaluators, and sends no notifications. For diagnosis, compare the per-rule error codes and check-log status; a healthy independent source does not erase another configured source's failure. Source timeout/session lifecycle and VMware collection semantics remain separate audit work. See [ADR-010](../10-architecture/adr/ADR-010-independent-alarm-source-dispatch.md).

## B04 — Manual actions and endpoint permissions

Manual `/api/alarms/check` and `/api/alarms/check-vmware` actions require an active ADMIN/EDITOR session and POST. GET/HEAD must not be used as a scheduling trigger; the GET handler returns 405 with `Allow: POST` and performs no evaluation. Internal scheduler/watchdog use the runner directly. VMware manual POST also enforces the existing license check.

Legacy integration writes now use current database roles. Credential/settings tests and saves require ADMIN; operational sync/monitoring controls follow the existing device/alarm write policy. An invalid/deactivated session returns 401, insufficient permission 403, and an unavailable identity lookup 503 before any downstream operation. Do not retry with spoofed role headers or convert the call back to GET. Restore the actual session/permission or wait for identity-store recovery.

VMware capacity collection and Events/SOAP diagnostics use POST JSON actions `collect-metrics`, `test-events-api`, `test-soap-events`; their former GET forms return 405. SOAP `minutes` is an optional JSON field. The capacity UI has been migrated; external scripts require the same migration. Normal reads remain available to VIEWER. See [ADR-011](../10-architecture/adr/ADR-011-integration-endpoint-authorization.md) and run `npm run test:integration-permissions` plus `test:nms-backups` and the alarm regressions.

## B10 — Multiple FortiGate alarm targets

For multiple FortiGate integrations, direct SSL-VPN rules now evaluate each saved configuration/VDOM independently. Runner error summaries retain `target` metadata, and check totals count target/rule evaluations. A failed target keeps the check partial while other targets continue. See [FortiGate alarm target diagnosis](FORTIGATE_ALARM_TARGETS.md) and [ADR-017](../10-architecture/adr/ADR-017-fortigate-alarm-target-scope.md).

## B12 — VMware saved-source health

VMware health now selects the enabled saved profile with the same loader/factory used by operational reads and alarm initialization. Legacy VMware ENV credentials no longer choose the probe target. Compare `datasources.vmware.target.configId` and sync metadata, which belong to that selected record. Missing/disabled profiles are unknown; malformed/store/source/timeout or cleanup failures are unhealthy. The VMware branch has a five-second probe budget plus one second for owned-session cleanup; it does not run collectors or alter history. See [saved-source health diagnosis](VMWARE_SAVED_SOURCE_HEALTH.md) and [ADR-019](../10-architecture/adr/ADR-019-vmware-saved-source-health.md).
