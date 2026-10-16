# ADR-021: Consistent Inventory Sync Outcomes

**Status:** Accepted
**Date:** 2026-10-16
**Related:** Audit B14; ADR-009, ADR-020

## Decision

VMware and Zabbix inventory syncs share `success / partial / failed` outcome semantics. `success: true` means no errors, including a genuinely empty successful source response. Any error with acknowledged inventory writes is partial; errors without acknowledged writes mean failed. Authentication/collection errors follow the same rule. Partial results retain committed inventory writes; no all-inventory rollback or alternate sync engine is introduced.

Count only successful ORM calls. Processed totals include clusters, hosts, VMs and datastores for VMware, and hosts, interfaces and triggers for Zabbix. Existing created/updated counters remain precise for operations that distinguish them; auxiliary upserts count as processed without inventing create/update classifications. Error count is a count of captured failures, not a count of missing source objects.

Record the outcome and completion time consistently in the sync log and configuration in one metadata transaction. An HTTP sync response keeps its existing successful-request transport status for all completed outcomes; callers use `status` and `success` to distinguish results. Failure to record metadata remains an HTTP error and cannot publish a successful attempt. Existing authorization, encrypted credential resolution and source mappings remain in place.

Present partial results distinctly in VMware UI and mark partial metadata as incomplete in integration/dashboard summaries. Source inventory counts do not prove that a sync ran and must not synthesize a successful sync result.

No schema/status-column migration is needed: the existing log explicitly supports all three values. Historic rows cannot be reliably reclassified and are left unchanged. Target identity and scheduling findings B15/B16 remain separate.

## Verification

Verified on HEAD `816e6036fea121be4402fcdc81a68aaadda7331e` plus the existing B01–B13/UI/incident working tree. Existing user changes were preserved. B14 adds no schema or dependency change. No installation database writes, live source probes, notifications, application restart, commit or push were performed.

Both new synthetic one-host-write-failure reproductions failed before the fix because the real services returned `success: true`. After the fix:

| Check | Actual result |
|---|---|
| `test:inventory-sync` | PASS, 55 scenarios, exit 0. Actual services/API and metadata transaction helper; one/all item failures, lookup/source/auth errors, create/update counters, genuine empty/no-op results, all four VMware write categories, Zabbix interface/trigger progress, later-source failure after earlier writes, metadata failure rollback, retry recovery, status summary and Turkish labels. Actual VMware page source is transpiled and server-rendered with isolated React hooks and UI primitives to check labels/icons/totals and absence of fabricated initial success. This is not a full browser/navigation test. |
| `test:inventory-sync:db` | PASS, 9 scenarios, exit 0. Actual routes/services with synthetic collection/inventory; real PostgreSQL log/config transactions. Both sources' success/partial/failed results persist the same status/counts/timestamp; actual missing-row update failures roll back already inserted logs; cluster-only/datastore-only totals persist. |
| `tsc --noEmit --incremental false` | PASS, exit 0, without writing a build cache. |
| ESLint baseline comparison | Zero added diagnostics across both services, both source API routes, integration status, dashboard summary and VMware page. New outcome/log helpers clean. Existing findings remain in VMware service (17), Zabbix service (1), VMware route (10), integration status (3); this is not a clean whole-repository lint claim. |
| Compatibility | PASS: VMware cache 52, collection 65, health 54; Zabbix token 79; credential storage 47; integration permissions 144; alarm dispatch 35, sources 46, occurrences 19, and alarm-health suite. |
| Dashboard | PASS, including fresh success/partial/failed source metadata mapping and explicit incomplete-state message. |
| Script/CI checks | New scripts syntax checked; workflow YAML and npm script references validated. Hosted CI itself was not executed. |

Checks used the installed immutable Node runtime with repository/dependency mounts read-only, temporary `/tmp` and network disabled. PostgreSQL ran in a new read-only container with temporary data, no published ports, and a private container network namespace shared only by the check process. The existing 22 schema migrations were applied only to that disposable database. Fixture records were removed and the temporary database container deleted after checks.

The older Zabbix token fixture gained a transaction adapter; the credential-storage source stub now supplies the expanded result contract. No existing behavioral assertions were removed. Type-only VMware UI imports do not import the server client at runtime. The metadata helper uses the shared Prisma singleton; existing service-level legacy Prisma construction is not refactored in this task.

No live customer sync, full Next production build, Python/NMS worker or browser screenshot run was performed. Tests validate outcome accounting and metadata transactions, not customer permissions or deployed network reachability. Successful writes acknowledged before a later fault remain progress; a transport timeout with unknown commit outcome cannot be inferred as an acknowledged write. No historical sync-log repair or cross-target import/scheduling fix is claimed.

Operational contract and diagnosis: [Inventory sync outcomes](../../30-runbooks/INVENTORY_SYNC_OUTCOMES.md).
