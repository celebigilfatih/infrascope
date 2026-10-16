# ADR-022: Saved Inventory and Poll Scheduling

**Status:** Accepted
**Date:** 2026-10-16
**Related:** B15, ADR-020, ADR-021; B16 remains a separate identity change

**Follow-up:** ADR-023 supersedes only VMware/Zabbix's type-wide exclusion and automatic single-configuration restriction after scoped inventory migration. FortiGate retains those restrictions; the interval/lifecycle decision below remains in force.

## Decision

`IntegrationConfig.syncInterval` is the inventory synchronization interval in minutes for VMware, Zabbix and FortiGate. It is authoritative over any legacy JSON copy. Register only the missing inventory job with existing Node instrumentation; do not create a second alarm engine or use self-HTTP. Every 15 seconds inspect enabled saved records and invoke their existing services with decrypted current credentials, under the same process-global exclusion used by manual sync. Limit automatic collection to two concurrent sources, do not queue catch-up runs, and reuse B14 outcome recording. A valid license is required for automatic work.

Compute due time from the last completed attempt (or creation for a never-synced record) plus the current saved interval. Re-read before starting. Record local completion on metadata failure to avoid a 15-second retry storm. Shorter/longer interval changes take effect at the next scan without restarting; disabled/deleted records cannot start new work. An in-flight attempt keeps its original settings and exclusion until it actually settles. Stopping the timer prevents new starts; it must not unlock still-running source work. An interval is not a hard real-time deadline.

Use the application's existing single Node service ownership model, with a global timer/cycle/type guard surviving module reload. This is not a distributed queue: one active application scheduler process per installation is required, as with existing alarm scheduling. Do not silently automate multiple enabled configurations of one source type before the B16 import identity boundary is fixed. Report the ambiguity and require one enabled inventory source per type for automatic sync. Explicit manual FortiGate selection remains supported.

NMS `Device.pollingInterval` is a minimum base interval in seconds. Successful SNMP uses that base plus stable per-device jitter. SSH-only and unstable outcomes use the greater of the saved base and their existing configured recovery floors, plus jitter. No outcome can cause polling faster than the saved base. Re-read settings each loop; bound the loop's sleep to five seconds and the next due time so a 30-second global sleep does not override a 10-second device interval. Clear stale scheduling state on removal/re-registration. Preserve active-poll exclusion and independent thread sessions; do not implement alarms in Python.

FortiAnalyzer event-cache cadence, alarm evaluation, source-query/cache TTLs, topology cadence and NMS backup scheduling remain separate policies, not inventory interval aliases. No schema/dependency change is required. Preserve English code/logs and Turkish scheduling labels/help text.

## Verification

Verified on HEAD `816e6036fea121be4402fcdc81a68aaadda7331e` plus existing B01–B14/UI/incident changes. User changes, including concurrent UI work, were preserved. No dependency/schema change, installation DB mutation, application/NMS restart, commit or push was issued. Live source collection was not invoked for verification.

| Check | Actual result |
|---|---|
| `test:inventory-scheduling` | PASS, 50 scenarios. All three sources' minute boundaries, interval edits through actual save routes, relational interval precedence, encrypted credential resolution, malformed settings/credentials, missing organization, disabled/deleted sources, late settings changes, license/storage failures, shared timer/cycle across reload, maximum automatic concurrency, manual-first and scheduled-first exclusion, metadata-failure retry throttling, source independence, stop/restart fencing, owned VMware cleanup, startup order/license-server mode, real FortiGate connector/manual guard, authoritative config read and VMware prior-cache invalidation when legacy JSON disagrees. |
| `test:poll-scheduling` | PASS, 13 Python tests with parameterized interval/outcome/jitter cases. Actual orchestrator class; saved-second boundaries, reload after shorter/longer edits, stable bounded jitter, SSH/unstable floors and recovery, no-data/write-failure throttle, fresh-state gate after registration failure, disabled/deleted/re-enabled cleanup, short-loop sleep and active-thread exclusion. Fixtures omit module startup side effects and do not certify SQLAlchemy/SNMP/SSH transport initialization. |
| `test:inventory-scheduling:db` | PASS, 6 scenarios. Actual PostgreSQL interval reads/save updates, token/password encryption, completion/outcome persistence, restart reconstruction, interval edits and disabled/deleted/failing sources; source transport/license/clock remain synthetic. |
| Strict TypeScript | `tsc --noEmit --incremental false`: PASS, exit 0. No build cache written. |
| ESLint baseline comparison | No added diagnostics in B15 core TS/TSX changes. New scheduler/coordinator and startup/source helpers clean. Existing VMware route (10), FortiGate route (6) and connector factory's pre-existing unused import remain. The concurrently rewritten NMS edit page has 12 unused-symbol diagnostics outside the B15 interval/help edits; these in-progress UI symbols were preserved. This is not a clean whole-repository lint claim. |
| Existing Node regressions | PASS: inventory outcomes 55, credential storage 47, Zabbix 79, permissions 144, VMware health 54/cache 52/collection 65, FortiGate SNMP 55/targets 40, alarm dispatch 35/sources 46/occurrences 19 and alarm-health suite, FA auth 45/cache 34, dashboard and NMS backup API checks. |
| Existing PostgreSQL regressions | PASS: inventory outcomes 9, credential migration 7, FortiGate SNMP 6. |
| Static/CI checks | Script syntax, Python parse, workflow YAML/npm aliases, whitespace and documentation references validated. Hosted CI itself was not run. |

Non-DB checks used the immutable installed runtime with read-only source/dependency mounts, temporary `/tmp` and network disabled. PostgreSQL used a separate container with temporary memory-backed data, no published ports and a network namespace shared only with the test process. The existing 22 schema migrations were applied only to that disposable database. Test fixtures were cleaned and the container removed afterward.

No full Next production build, real customer sync, full NMS worker/database/transport run, browser screenshot or distributed-replica race test was performed. The existing single scheduler-owner model, explicit automatic duplicate-profile restriction, in-flight settings semantics and timing/capacity limits are described in [the runbook](../../30-runbooks/SAVED_SYNC_POLL_SCHEDULING.md). No multi-source identity fix, new alarm cadence or hard real-time guarantee is claimed.

Concurrent UI edits briefly caused a Header JSX syntax failure and a NMS save-handler event-type mismatch in full-repository checks. Header was subsequently corrected by the concurrent work. The NMS handler's event type was generalized to `React.SyntheticEvent` because it only calls `preventDefault` and is attached to a button as well as intended form use; no save/validation behavior was changed. The global check was rerun after these changes; earlier passing snapshots were not used to hide the intervening failures.
