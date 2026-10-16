# NMS Device ID Allocation

**Scope:** Audit B17, separate application/database per company. Related decision: [ADR-024](../10-architecture/adr/ADR-024-shared-nms-device-id-allocation.md).

## Active allocation paths

| Entry point | Allocation and persistence boundary |
|---|---|
| `POST /api/integrations/nms/devices` | Enable an existing inventory device under the shared lock; re-read existing NMS identity and duplicate management IP, then update in one transaction |
| `POST /api/integrations/nms/discovery/[scanId]/import` | Under the same lock, re-read discovered-row ownership/import status and inventory eligibility; inventory update and discovery `imported/importedAt` marker commit together |
| `POST /api/firewalls` | Existing onboarding transaction uses the same allocator for optional SNMP/SSH; device, integration and connector commit together before the existing remote probe starts |

All three paths call `lib/nms/device-id.ts::reserveNextNmsDeviceId` within explicit **ReadCommitted** transactions. Its PostgreSQL transaction advisory key remains `2147380047`. The lock survives until commit/rollback, so the next successful waiter sees the previous committed MAX before choosing its integer. The unique `Device.nmsDeviceId` index remains in place. There is no new application mutex, counter table, sequence, retry loop or schema migration.

The helper selects an integer sentinel from `pg_advisory_xact_lock`, avoiding Prisma 5.22's inability to deserialize a returned `void` column. MAX + 1 is calculated as bigint and validated in the positive PostgreSQL integer range. Invalid/missing results and exhausted range fail without inventing ID 1 or truncating an identifier. A reservation alone is not durable: callers must persist it before the same transaction returns.

Input validation, authorization, encryption, polling configuration and response shapes retain their existing contracts. Repeat enable/import requests re-read state under the lock and return 409 instead of reassigning the winner's ID. Same-IP legacy enable contenders likewise return one 201 and one 409. Missing inventory and scan ownership checks retain their 404/400 behavior. Failure before commit returns an error; a discovery record cannot be marked imported independently from inventory. Database errors are not hidden as successful empty results.

REST-only firewall onboarding retains a null NMS identity. SSH-only onboarding still reserves an NMS integer, with SNMP polling disabled unless configured. Unavailable firewall probes retain the existing post-commit onboarding behavior. No source connection, NMS polling request or notification is added to the allocation transaction.

## Operating notes

- Release this code through the existing application build/restart procedure. B17 adds no migration or dependency change. Previously prepared migrations, including B16, keep their own deployment requirements.
- Allocation correctness depends on all writers using this helper and the same database. Manual SQL/import tools that write `nms_device_id` outside it are not certified.
- ReadCommitted is explicit so a customer database's default repeatable-read setting cannot retain an old MAX snapshot while waiting for the lock.
- MAX-based reuse after removing the highest active identifier is unchanged. Historical backup/job ownership remains protected by the existing inventory ID checks; B17 does not introduce a never-reuse policy.
- Existing delete/edit transactions and firewall host/VDOM duplicate policy are separate workflows. This change does not claim to serialize every inventory operation.
- On database outage, timeout or integer exhaustion, preserve the failed request for investigation. Do not manually guess a number or disable the unique constraint. Rollback releases the transaction lock, so ordinary requests can be retried after recovery.

## Verification performed

Reviewed HEAD: `816e6036fea121be4402fcdc81a68aaadda7331e` plus existing B01–B16 and concurrent UI/incident changes. Existing changes were retained. Tests used the immutable installed Node 20.20.2 / Prisma 5.22 / TypeScript 5.9.3 runtime, read-only application/dependencies and a regenerated client in executable tmpfs. PostgreSQL 15 ran with no published port, no persistent data volume and no external network. Its fixture database had **default repeatable-read isolation**; the actual writer transactions reported read committed. Installation ENV, customer devices and real notification recipients were not used.

Two negative controls reproduced the old failure modes in that disposable database: unprotected MAX + independent updates produced one `P2002`; direct SELECT of the advisory-lock function's void result produced Prisma `P2010`. The current helper and route tests then passed.

| Check | Actual result |
|---|---|
| `test:nms-device-ids` | PASS, 20 scenarios: common helper, independent/repeated enables, discovery atomicity/repeats, write/commit rollback and retry, REST/SSH-only onboarding, encrypted/redacted SNMPv3/SSH credentials, denied/invalid/missing requests and allocator bounds |
| `test:nms-device-ids:db` | PASS, 18 scenarios: negative controls; synchronized legacy/legacy, legacy/firewall, discovery/legacy, discovery/firewall and six mixed writers; repeated device/discovery and same-IP conflicts; real rollback at device/marker/integration/connector/late-transaction boundaries; independent client pools behind a held PostgreSQL lock; last valid integer and exhaustion |
| `test:integration-permissions` | PASS, 144 scenarios; fixture now supplies the real allocator's lock/MAX result contract |
| `security:firewall-onboarding-check` | PASS, existing validation and probe-after-transaction contract |
| `test:nms-backups` | PASS, existing backup API contracts |
| `test:inventory-source-scope` | PASS, 24 scenarios; previous connection identity behavior retained |
| TypeScript | PASS, full `tsc --noEmit --incremental false` with regenerated client |
| ESLint | Allocator and discovery route clean. Compared against B17 starting snapshots: discovery 6 → 0, legacy NMS route 8 → 4, firewall route 2 → 2; no new diagnostic message/category. Remaining diagnostics are pre-existing `any` uses in legacy GET and firewall configuration payloads. |

Both new suites are registered in package scripts and CI, including firewall/helper path triggers. No live source test, installation migration, application/NMS restart, production build, commit or push is represented as performed. Temporary test containers are removed after validation.

## Regression commands

```sh
npm run test:nms-device-ids
npm run test:integration-permissions
npm run security:firewall-onboarding-check
npm run test:nms-backups
```

The PostgreSQL suite requires explicit `INFRASCOPE_NMS_ID_DB_TEST=1` and a local `127.0.0.1` PostgreSQL URL whose database name ends in `_occurrence_tests`. It applies the existing migrations and creates/removes owned fixture inventory and discovery rows. Supply only disposable test credentials, then run `npm run test:nms-device-ids:db`. It must not target the installation database.
