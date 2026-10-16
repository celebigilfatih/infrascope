# Inventory Sync Outcomes

**Scope:** Audit B14, VMware and Zabbix manual inventory sync.

## Result contract

Both services and their sync API responses now use one outcome vocabulary:

| Status | `success` | Meaning |
|---|---|---|
| `success` | `true` | No captured authentication, collection or persistence errors. A genuine empty source or disabled inventory-module no-op has zero processed items and is successful. |
| `partial` | `false` | At least one inventory write was acknowledged and at least one error occurred. Existing successful writes remain committed. |
| `failed` | `false` | Errors occurred without an acknowledged inventory write. Includes failed authentication, early upstream failure and all-item write failure. |

`itemsProcessed` counts acknowledged inventory write operations, including updates to existing rows. It is not the current inventory size or the number of unique source objects. VMware includes clusters, hosts, VMs and datastores; Zabbix includes hosts, interfaces and triggers. `itemsCreated` and `itemsUpdated` aggregate existing classified counters. Datastore/interface/trigger upserts contribute to processed totals without guessing whether an upsert inserted or updated. `errorCount` counts captured error entries, not skipped/unavailable objects. Existing module-selection and association behavior is unchanged.

For example, one saved host and one failed host produces `partial`, `success: false`, `itemsProcessed: 1`, `errorCount: 1`. A saved host followed by a failed interface write is also partial: the host was already committed. A later module's collection error after earlier writes follows the same rule. Source failure must not become an empty successful run.

Completed attempts retain the existing HTTP 200 response convention for compatibility. Read `status` and `success`; an HTTP 200 alone is insufficient proof of a complete sync. The response retains existing resource counters, errors and duration. Duration is finalized even for authentication failure.

## Metadata and user-visible state

The sync log and integration configuration are written in one metadata transaction. They share the exact outcome and completion timestamp. Log `startedAt` marks the API's actual inventory call; `lastSyncAt` denotes the last recorded attempt, including partial/failed attempts, rather than only the last complete sync. Log processed/created/updated totals match the API; `errorDetails.errorCount` records the captured failure count.

If metadata persistence fails, the API returns an HTTP error and the metadata transaction rolls back. Inventory writes made before recording are independent and remain committed. This does not provide an all-inventory transaction or claim automatic retry/idempotence of the whole import. Earlier log entries remain unchanged. A subsequent manual retry is a new attempt and can record success after the source or persistence fault is corrected.

The VMware result panel distinguishes completion, partial completion and failure with Turkish labels and separate icons. Source dashboard counts no longer synthesize a successful sync result on page load. Before a real sync response, its result counts show an unknown placeholder. Dashboard summary maps partial metadata to its existing incomplete/stale category with an explicit partial-sync message. Integration status uses its existing error category with a partial-sync message, preserving the public status enum.

## Investigation and recovery

1. Check the latest attempt's `status`, `itemsProcessed` and `errorCount`. A nonzero error count must not be treated as complete success.
2. For `failed` without inventory writes, verify the saved target, authentication and source availability. For item errors, investigate the relevant mapping, relation or DB-write failure without exposing customer data/credentials in tickets.
3. For `partial`, retain existing inventory and correct the failure before retrying. Do not delete successful rows to make status look clean. Compare the new attempt rather than rewriting history.
4. If the API cannot persist metadata, investigate database availability/constraints. The previous last-sync metadata still describes the previous attempt; the failed HTTP response is not evidence of a new successful record.

Historical logs and last-sync fields that were misreported by older code are not rewritten. A future sync records the corrected semantics. Source-scoped import identity (B16), scheduler/interval behavior (B15), whole-run concurrent sync ordering, and partial outcomes in other connectors are separate work.

## Regression checks

- `npm run test:inventory-sync`: actual services, API routes, summary handling and VMware page rendering with synthetic sources, ORM faults and clock. No installation ENV, external source or notification is used.
- `npm run test:inventory-sync:db`: opt-in real PostgreSQL log/config transactions. Requires `INFRASCOPE_SYNC_DB_TEST=1`, a loopback URL, a disposable database ending `_occurrence_tests`, and the existing schema migrations. It creates/deletes named fixture records. Collection/inventory mutation remains synthetic; do not run against an installation database.

Actual verification results: [ADR-021](../10-architecture/adr/ADR-021-inventory-sync-outcomes.md).
