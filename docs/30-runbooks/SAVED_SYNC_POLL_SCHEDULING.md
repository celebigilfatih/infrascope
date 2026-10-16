# Saved Sync and Poll Scheduling

**Scope:** Audit B15, application inventory scheduling and NMS device polling. Units are not interchangeable.

## Which setting controls which work?

| Setting | Unit | Runtime owner / policy |
|---|---|---|
| VMware/Zabbix/FortiGate `IntegrationConfig.syncInterval` | minutes, 1–1440 | Automatic inventory import through the existing source services. Manual imports share per-configuration VMware/Zabbix exclusion; FortiGate retains source-type exclusion. |
| Legacy integration JSON `pollingInterval` | minutes | Settings APIs write the relational interval too. The relational value is authoritative when old JSON disagrees. VMware/FortiGate configuration reads and source profiles follow it. |
| NMS `Device.pollingInterval` | seconds, 10–86400 | Per-device minimum base for interface/health polling, with adaptive recovery floors and jitter. |
| Alarm evaluation, FortiAnalyzer event cache, graph/client refresh, VMware cache TTL | separate policies | These are not aliases of the inventory interval. No second alarm engine or FA inventory importer was added. |
| NMS topology and backup schedules | separate policies | Their existing cadence remains in place. |

Firewall onboarding's device polling field is NMS **seconds**, not FortiGate inventory minutes. The source configuration and device configuration control different jobs. An interval value is never copied between those domains.

## Inventory scheduling

Existing Node instrumentation starts the inventory scheduler after credential migration and normal service initialization. It is skipped in license-server mode. Scans run every 15 seconds, without an immediate startup collection. The existing license runtime must consider the installation valid; the inventory scan does not start its own external license validation timer.

For each enabled source, due time is:

```text
(last completed sync attempt, or configuration creation if never synced) + current saved interval
```

The coordinator also retains local completion time when an attempt cannot write metadata, preventing a source retry on every scan. Valid completed/partial/failed attempts persist their completion through the existing log/config transaction, so a new process can reconstruct due time. Local fallback timing is lost on a process restart; that may allow a retry after recovery, rather than falsely persisting success.

Settings are queried every scan and re-read before collection. Shortening an interval can make a source due on the next scan; lengthening it postpones work relative to the previous completion. A new record normally waits its first interval. Disabled/deleted records cannot start a new job. Current in-flight work keeps its captured connection profile until it settles; editing or disabling does not forcibly interrupt database writes already underway.

At most two automatic sources run concurrently. There is no catch-up queue, and one slow/failed source does not erase another source's completed result. Manual and automatic work share a process-global guard (per configuration for VMware/Zabbix after B16, per type for FortiGate); an overlapping manual request returns HTTP 409 with `INVENTORY_SYNC_BUSY`. The guard remains held through real source completion and metadata recording, even after stopping the timer. Repeated starts/module reloads share one timer/cycle. Owned automatic VMware sessions close on success and on collector exceptions; FortiGate continues to use its shared target connector.

This follows the installation's existing **one active Node scheduler process** model. The guard is not a distributed lease, and this change does not certify multiple active web replicas or external cron jobs calling sync simultaneously. Operate one scheduler owner per installation; do not add an external cron for the same work. Whole-run runtime depends on bounded source operations, inventory size and DB availability; no fake timeout releases a still-running import. Schedule scans, queueing and source runtime may add latency beyond a requested interval.

After B16, VMware/Zabbix automatic imports use connection-scoped inventory and per-configuration manual/automatic exclusion. Every enabled saved target is eligible independently. FortiGate still requires **one enabled configuration** for automatic inventory because its legacy inventory identities are outside B16; multiple enabled FortiGate records produce an explicit warning/skip. Explicit manual FortiGate selection remains supported. See [inventory source identities](INVENTORY_SOURCE_IDENTITIES.md) for migration requirements and `configId` selection.

## NMS adaptive base and timing

The orchestrator re-reads enabled device settings each loop. Effective intervals are:

```text
SNMP success / no prior outcome: saved base + per-device jitter
SSH-only outcome:              max(saved base, POLL_INTERVAL_SSH_ONLY) + jitter
unstable outcome:              max(saved base, POLL_INTERVAL_UNSTABLE) + jitter
```

Default recovery floors are 300 and 600 seconds. `POLL_INTERVAL_SNMP_OK` remains the fallback for missing/invalid legacy base values; it no longer replaces an explicitly saved value. Jitter is chosen once per registered device from zero through `POLL_JITTER_MAX` (default 10 seconds). Registration removal clears old timing/outcome/jitter state. A lower saved base cannot bypass the recovery floors; a higher saved base can never be shortened by a poll outcome. Successful recovery returns to the saved SNMP base.

The orchestrator wakes within five seconds or sooner for the next due poll, rather than always sleeping the global interface interval. Existing active-poll exclusion prevents duplicate calls while a worker remains active. Poll start times throttle attempts even after data/persistence failure; `last_polled_at` still advances only after successful data collection. Registration/storage failure prevents the loop from collecting with stale saved settings. Device-load logging is emitted when registration counts change, avoiding repeated informational logging on every faster refresh.

These are minimum scheduling intervals, not real-time guarantees. Source calls, the existing bounded poll-cycle wait, worker capacity and jitter can delay a device. Topology throttling and health/source availability reporting remain separate policies. Apply the changed Python code through the normal NMS deployment/restart procedure; changing a saved device interval after that requires no worker restart.

## Diagnose a missing run

1. Confirm units and the enabled saved configuration/device, rather than a JSON interval copied from another subsystem.
2. For inventory, inspect the latest integration sync log and `lastSyncAt/lastSyncStatus`. A run can be `partial` or `failed`; see [outcomes](./INVENTORY_SYNC_OUTCOMES.md). Check license state, duplicate-profile warnings, valid interval, organization setup and source credentials. Metadata failures return/log failure rather than inventing completion.
3. The application's `getInventorySchedulerStatus()` exposes timer/cycle state and the latest scan counts in the owning process. Importing it in a new CLI process cannot inspect an already-running server's memory. Startup/completion/error messages and persisted sync logs provide operational evidence without logging source data or secrets.
4. For NMS, verify saved base, latest interface outcome, recovery floor, jitter and worker availability. A device configured for 30 seconds may intentionally be slower on SSH-only/failure. Do not treat a successful attempted poll as fresh data when no source data arrived.

## Tests

- `npm run test:inventory-scheduling`: fake-clock Node checks of actual scheduler, save/manual routes, connector/source resolution and startup registration. ORM, source transport and license are synthetic.
- `npm run test:poll-scheduling`: standard-library Python fixture executes the actual orchestrator class extracted from its AST; module startup imports are omitted to avoid initializing real DB/logger/SNMP/SSH clients. Clock, repositories and transports are synthetic; active-worker exclusion uses a controlled thread gate.
- `npm run test:inventory-scheduling:db`: actual settings persistence, schedule reads and sync metadata in a new PostgreSQL database, with fake source/license/time. Requires explicit `INFRASCOPE_SCHEDULE_DB_TEST=1`, loopback database URL and a disposable database ending `_occurrence_tests`; never use an installation database.

Actual verification evidence: [ADR-022](../10-architecture/adr/ADR-022-saved-inventory-poll-scheduling.md).
