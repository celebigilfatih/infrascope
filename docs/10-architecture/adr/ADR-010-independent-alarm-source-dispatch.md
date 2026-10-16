# ADR-010: Independent Alarm Source Dispatch

**Status:** Accepted  
**Date:** 2026-10-15  
**Scope:** Audit B03; source dispatch in the existing alarm runner/engine and the VMware-only action.

## Context

The runner evaluated NMS but returned early when FortiAnalyzer was absent or lacked a password. VMware/FortiGate initialization occurred only after that gate. The engine also required FA unconditionally, warmed the FA cache before examining enabled rules, and counted the VMware group as requiring a FA login. A FA login error therefore prevented direct FortiGate evaluation as well. The VMware-only route required FA settings and called private engine methods through TypeScript suppressions.

## Decision

- Keep one engine and its existing VMware, FortiGate SSL-VPN, NMS, FA query and correlation evaluators. Change dispatch and initialization boundaries, not detection algorithms, severity, cooldown, source occurrence identity or notification preferences.
- The runner still evaluates NMS independently once. It resolves optional FA settings inside a dedicated error boundary, then always invokes the shared engine with `includeNms: false`, even when the FA service is unavailable. Configuration/decryption failures remain `FORTIANALYZER_SOURCE` errors; an unexpected shared engine/catalog failure is `ALARM_ENGINE`.
- Determine source from the existing rule metadata: NMS metadata/code prefix, VMware metadata/legacy `logtype=vmware`, then direct `fortigate-sslvpn` metadata, otherwise FA. A FortiGate log stored in FA continues to require FA. Dormant direct-log/CMDB exports are not activated.
- Read enabled rules and partition selected sources before remote initialization. Initialize VMware only for VMware rules using enabled `VMWARE_VCENTER` configuration. Initialize direct FortiGate only for its rules, using the existing target-scoped connector factory. Preserve its refusal to guess among multiple enabled targets. Clear its event/CMDB cycle caches once before its alarm evaluation.
- Complete NMS, VMware and direct FortiGate evaluation before FA login/cache warmup. Only FA groups/correlation require FA. Preserve existing FA cache/live fallback, logtype concurrency and correlation ordering.
- An absent/disabled optional source is skipped. A configured source with invalid credentials, authentication/init failure or query failure produces errors for its rules while other sources continue. Failed initialization remains retryable on a later engine cycle.
- `evaluateAllAlarms` accepts a source selection and an explicit missing-configuration policy. The VMware-only route selects only VMware with `requireConfiguredSources: true`; it reads no FA settings, initializes no FA/FG/NMS client, calls no private engine methods and performs no global cooldown cleanup or historical delivery retry. Existing response summary/error fields are retained.
- Full cycles retain global delivery retries. The existing runner lock, license preflight, check-log aggregation and health-recovery rules remain in place. FA API-token configuration is accepted without requiring a password.

## Limits and consequences

No DB schema/migration, package upgrade, second alarm engine, fake production events or customer-data changes. Missing optional integrations no longer produce service-unavailable errors solely because their catalog rules exist. Explicit VMware checks with enabled rules still report missing/disabled VMware configuration through their error summary.

This isolates source selection and ordinary failures. It does not introduce distributed execution/leases or repair the outer timeout/cancellation behavior (B19). A hung source can still delay final cycle reporting. VMware client collection error semantics (B08), process/session lifecycle and target scoping remain separate findings. The existing VMware service construction is retained; this does not claim to introduce a shared VMware session manager or repair its extra Prisma pool.

The VMware-only route's existing GET behavior, authorization and license enforcement are not expanded or considered fixed by B03; those require the B04 entry-point permission work. Independent alarms continue to be subject to their existing own-source data availability and detection rules.

Rollback reintroduces the FA configuration/login gate. No database rollback is needed; do not edit check history to conceal source failures.

## Verification

`npm run test:alarm-dispatch` executes the actual runner, source dispatch, initializers, VMware datastore evaluator, FortiGate SSL-VPN evaluator and VMware POST route with fake integration transport, ORM and notifications. FA/cache workers are replaced at their boundary; B02 separately exercises actual FA queries/cache/engine behavior.

Scenarios cover independent-only installs, mixed sources, missing/disabled/malformed FA settings, config lookup/decryption/auth/query failure, per-source failure isolation, ambiguous FG selection, once-only NMS/FG cycle preparation, disabled rules, initialization recovery, legacy metadata, correlation dependency, API-token configuration, catalog failure and license preflight. Tests never load application credentials, contact customer systems or send email.

TypeScript, targeted ESLint comparison and existing occurrence/source/health regressions accompany this change. A live firmware smoke test, full build and database occurrence suite are not implied by these isolated checks. The alarm CI workflow includes dispatch checks.

Local verification (2026-10-15, HEAD `816e6036fea121be4402fcdc81a68aaadda7331e` plus the preserved B01/B02/dashboard working-tree changes):

| Check | Actual result |
|---|---|
| `test:alarm-dispatch` | 34 scenarios passed |
| `test:alarm-sources` | 46 scenarios passed |
| `test:alarm-occurrences` | 19 scenarios passed |
| `test:alarm-health` | Passed |
| TypeScript `--noEmit --incremental false` | Passed |
| `test:switch-alarms`, `test:nms-backups` | Passed |
| Targeted ESLint vs HEAD | No new diagnostics; runner 0, VMware route 0 (was 3), engine 36 (was 38) |
| Workflow YAML/package command validation | Passed; remote CI not triggered |

Checks ran in disposable containers from the existing pinned Node 20 image with networking disabled, read-only workspace/dependency mounts and temporary `/tmp`. No environment file, installation DB, live integration or SMTP was used. The engine's remaining lint diagnostics are pre-existing; repository-wide lint is not claimed clean. Full build, live-source smoke tests and the PostgreSQL occurrence suite were not rerun for B03. No migration or dependency change was made.

The legacy private `evaluateLogTypeGroup` no longer has an active VMware-route caller. It remains a compatibility/removal candidate; it was not automatically deleted as part of dispatch repair.

## Related

- [Audit B03](../../audits/POST_MERGER_ARCHITECTURE_BEHAVIOR_AUDIT.md)
- [Alarm check health](../../30-runbooks/ALARM_CHECK_HEALTH.md)
- [ADR-009 source failures](ADR-009-alarm-source-failure-semantics.md)
- [ADR-005 scoped FG connectors](ADR-005-fortigate-target-scoped-connectors.md)

## History

| Date | Change |
|---|---|
| 2026-10-15 | B03 source dispatch, VMware action reuse and isolated regressions. |
