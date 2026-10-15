# Alarm check health and recovery

## Incident — 2026-10-15

The installation had no integration configuration records. Each scheduled NMS check completed, but the runner also appended `FORTIANALYZER_SOURCE: FortiAnalyzer not configured`. This produced repeated `PARTIAL` rows with one error each; seven rows were present in the last-hour window. The health endpoint degraded on more than five such rows.

An absent or disabled optional FortiAnalyzer integration is now skipped with a structured `source=FORTIANALYZER, reason=not-configured` log. A configured integration with missing credentials, an authentication/transport failure, or a real NMS evaluation error still creates an error result. Check logs retain their original values. Error summaries now include their codes in structured runner logs.

## Health semantics

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
