# Alarm runner ownership, cancellation and startup recovery

## Contract

[ADR-026](../10-architecture/adr/ADR-026-alarm-run-ownership.md) documents B19. Scheduler, watchdog, full manual checks and VMware-only manual checks use the existing runner. A PostgreSQL advisory transaction lock (`2147380048`) serializes a short atomic claim in the existing `SystemConfig` key `alarm-runner-lease-v1` and creation of its RUNNING check log. Ownership contains only a random owner token, run-log ID, database-clock expiry and start time. It contains no source credentials or customer payload.

The run deadline is ten minutes; its owner lease expires after twelve minutes. A busy request returns an explicit unsuccessful busy result, never a previous successful result. A claim/database failure starts no evaluation. The process-global busy guard handles local reload overlap, while the database claim handles independent module instances/processes. This does not add cross-installation tenancy or a second engine.

Startup reconciliation only marks the expired owner's RUNNING log and sufficiently old legacy RUNNING logs ORPHANED. A recent legacy RUNNING row blocks a new claim until its twelve-minute safety window expires. A live owner is preserved. Completion/release verifies the current owner and cannot overwrite a successor. Completed historical check/incident/audit rows are not rewritten by startup reconciliation.

## Cancellation and boundaries

The AsyncLocalStorage scope follows the existing runner's asynchronous work. Alarm-engine, incident, delivery-attempt and DLQ DB operations use a facade over the shared Prisma singleton. Scoped reads check cancellation before and after awaiting; scoped writes/raw SQL/transactions verify ownership under the same database lock, check again before commit, and roll back if cancelled. No new Prisma connection pool is created by the facade. Calls outside a finite run keep their existing behavior.

The overall deadline covers source evaluation, result/metric reads, notification retry processing and health-alert processing. Individual timed search stages cancel their own continuations without cancelling the parent run. FortiAnalyzer search requests combine run/stage cancellation with the existing source signal. SMTP checks current ownership immediately before handing a message to the transport.

An already-issued bounded VMware/FortiGate read may finish when its client exposes no cancellation; its late result cannot initiate a scoped write or notification. A source-side operation, SMTP message already accepted by the server, or database commit already handed to PostgreSQL cannot be recalled. This change does not promise exactly-once external delivery. Previously committed effects are retained; future replay still uses existing occurrence identity and notification rules.

Shared FortiAnalyzer cache initialization/recurring collection is deliberately detached from the finite check. Check cancellation must not poison that collector's signal/freshness. Its existing revision binding and shared initialization promise remain in force. The engine's explicit force-sync warmup is also detached. Cache warmup may outlive an individual check as independent background work.

VMware-only results use `SOURCE_SUCCESS`, `SOURCE_PARTIAL` or `SOURCE_FAILED` check statuses and do not replace the cached full-run result. Only a complete zero-error `SUCCESS` establishes global health recovery. The watchdog excludes source-only completed logs when checking full-run recency.

Retention guards both the first scheduled timeout and recurring timer. `stopAlarmRetentionScheduler()` clears both; repeated start/reload and stop/restart leave one schedule. The existing watchdog singleton remains shared. Scheduler generation checks prevent a queued immediate tick from starting after stop/restart.

Stopping an already inactive watchdog also clears its pending automatic recovery timer, so an explicit stop cannot later restart it unexpectedly.

## Diagnosis

1. A busy response normally means another owner is active. Inspect only ownership metadata and the associated check-log status/time; do not delete the lease to force an overlapping run.
2. After a crash, wait for the remaining twelve-minute lease window. Startup or the next claim then reconciles that expired owner and permits recovery. Restarting another worker must not mark a live owner's row orphaned.
3. `ALARM_LEASE_INVALID` means persisted ownership cannot be validated. Claims fail closed. Investigate unexpected writers/corruption before manually repairing internal state; preserve check history.
4. `ALARM_LEASE_LOST`, `ALARM_RUN_CANCELLED` and `ALARM_STAGE_TIMEOUT` identify fenced/expired work. A timed-out run records FAILED when it still owns finalization. If the DB is unavailable or ownership has already changed, finalization is logged as unavailable and the later owner/expiry reconciliation decides the old RUNNING row.
5. Verify a subsequent full-run SUCCESS and source health. A VMware-only success cannot erase another integration's errors. Do not clear immutable event/audit history as a recovery action.

Deploy/restart all application workers with the same version. Old binaries do not participate in the new owner fence; a recent pre-upgrade sentinel is only a conservative overlap safeguard. No schema/dependency migration or installation data repair is required. Background services are not restarted by this patch.

## Safe regression commands

`npm run test:alarm-ownership` uses deterministic time, synthetic I/O and actual runner/lease/engine/SMTP decision paths. `npm run test:alarm-ownership:db` requires `INFRASCOPE_ALARM_RUN_DB_TEST=1`, an explicit loopback PostgreSQL URL with a dedicated `*_occurrence_tests` DB, and an initially empty alarm-check/lease store. It refuses missing opt-in before constructing Prisma. Supply only a disposable database; never use the installation DB.

The DB suite starts four independent Node processes/client pools, uses actual transactions/advisory locks, ages only owned fixture leases to simulate crash expiry, and removes owned fixtures in `finally`. SMTP/source operations are simulated. CI runs the new suites alongside existing occurrence, dispatch, source, cache, health and permissions checks.

## B19 verification record — 2026-10-16

Base commit: `816e6036fea121be4402fcdc81a68aaadda7331e`, with existing uncommitted B01–B18 and concurrent UI/incident/localization changes preserved. Starting versions of changed TypeScript files were captured before editing for lint comparison. No new dependencies/schema changes were made.

The checks use immutable Node runtime `sha256:daf880f6655d0fdb5bd863f8a0407dcb93f57c2f530f3fa89dd573c36f60d3b0` with read-only project/dependency mounts and a tmpfs-generated Prisma client. PostgreSQL 15 runs in a disposable, network-disabled container without published ports or persistent volumes; the checks container shares only its loopback namespace. All 23 existing migrations were applied exclusively to that empty fixture DB. Installation ENV, customer source systems and real notification recipients are not used.

| Check | Actual result |
|---|---|
| `test:alarm-ownership` | PASS, 25 scenarios, exit 0: overlap, failed claims, startup/crash/legacy recovery, malformed ownership, stale finalization, global/stage/finalization deadlines, late read/write/email/DLQ continuations, actual SMTP decision path, detached background work, watchdog/retention/scheduler timers and source-only health semantics |
| `test:alarm-ownership:db` | PASS, 16 scenarios, exit 0: read/create negative control, four independent processes/pools with one winner, preserved live owner, crash expiry, stale owner/finalizer rejection, transaction rollback, tagged raw SQL, actual incident/notification decisions, release/reclaim and malformed/legacy ownership |
| DB script without opt-in | Expected refusal, exit 1 before Prisma construction/DB I/O |
| `test:alarm-occurrences` and `test:alarm-occurrences:db` | PASS, 19 offline scenarios plus real PostgreSQL recording/uniqueness/legacy/closed-incident and five concurrent-delivery checks; SMTP mocked |
| `test:alarm-sources` | PASS, 46 scenarios |
| `test:alarm-dispatch` | PASS, 35 scenarios, including updated VMware manual route through the same runner |
| `test:alarm-health` | PASS, including source-only success preserving unresolved global failures |
| `test:fortianalyzer-cache` | PASS, 35 scenarios; added actual shared-collector completion after finite-run cancellation |
| `test:fortianalyzer-time` | PASS, 62 B18 scenarios |
| `test:credential-storage` | PASS, 47 scenarios, including existing SMTP configuration/delivery behavior |
| `test:integration-permissions` | PASS, 144 scenarios; source-only route retains POST/license/role enforcement |
| Full `tsc --noEmit --incremental false` | PASS, exit 0 with isolated generated Prisma client |
| Targeted ESLint | Three new TypeScript helpers clean. All 12 changed TypeScript files have 38 pre-existing diagnostics before and after; multiset comparison found zero added messages/categories (engine 34, email 2, DLQ 2). Targeted lint still fails for this existing debt; full-repository lint was not represented as passed. |
| Workflow/package inspection | PASS, parsed YAML and asserted new aliases, offline/DB CI steps, opt-in and path triggers; remote CI not triggered |
| Scoped `git diff --check` | PASS |

Short guarded transactions use ReadCommitted isolation, a five-second acquisition wait and a ten-second transaction limit. An unavailable/blocked ownership check never falls back to unguarded execution. Source cancellation and external-delivery limitations are described above; no live customer source test, SMTP delivery, production build or full-repository lint was run. No installation migration/data repair, application/NMS restart, commit or push is performed. Temporary test containers are removed after verification.
