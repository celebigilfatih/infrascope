# VMware and Zabbix Inventory Source Identities

**Scope:** Audit B16. Separate application/database installations per company; this is connection isolation inside one installation, not multitenancy.

## Identity and active paths

| Data | Identity used by active imports/readers |
|---|---|
| VMware host/VM `Device` | `vmwareSourceScope + vmwareMoref` |
| VMware cluster/datastore | `sourceScope + vcenterId`; datastore database IDs are no longer remote MoRefs |
| VMware VM/host/cluster topology | Scoped external-ID lookup, followed by database IDs; topology rejects cross-source parent pointers |
| VMware capacity history | `sourceScope` on writes and on trend/forecast reads; raw remote `resourceId` remains unchanged |
| VMware occurrences/incidents/cooldown | Internal `inventorySourceScope` in collected evidence; source-scoped entity/native-event identity and JSON-scoped cooldown lookup |
| Zabbix `Device` | `zabbixSourceScope + zabbixHostId` |
| Zabbix interface | Existing `deviceId + name`, after a scoped host lookup |
| Zabbix trigger-host association | `sourceScope + triggerId + hostId`; database IDs are no longer trigger IDs |

`inventory-source-scope.ts` hashes source type, saved configuration ID and normalized endpoint. It never hashes passwords/tokens into persistent inventory identity. Credential/module/interval edits retain inventory IDs. Changing the endpoint on the same saved configuration creates a separate scope; returning to the earlier endpoint reuses its existing IDs. Two different saved configurations retain different ownership even for an identical endpoint. Disabling/deleting a configuration does not cascade-delete inventory.

`createSavedVMwareSource` supplies its saved ID; manual Zabbix sync and `inventory-scheduler.ts` likewise override any JSON `integrationId` with the selected database record ID. An unsaved client can test/read its source but inventory/metric writes fail before source authentication without a saved ID. No unscoped external-ID fallback remains in the active VMware/Zabbix import paths.

Manual sync and the VMware operational API require an explicit `configId` if multiple enabled sources exist. With exactly one enabled source the existing implicit selection remains compatible. Examples:

```http
POST /api/integrations/vmware
Content-Type: application/json

{"action":"sync","configId":"<saved-config-id>"}
```

```http
GET /api/integrations/vmware?type=vms&configId=<saved-config-id>
GET /api/integrations/zabbix?configId=<saved-config-id>
```

Zabbix manual sync uses the same POST body on `/api/integrations/zabbix`. VMware power/snapshot/metric/diagnostic POST actions accept `configId` too. Ambiguity or malformed selectors return HTTP 409 with `INVENTORY_SOURCE_SELECTION_REQUIRED`; unknown/disabled explicit IDs do not fall back to another connection. Existing application permissions still run before selection or source access. This change adds API selection, not a new multi-target UI picker.

Automatic VMware/Zabbix imports may now process every enabled saved configuration, at most two automatic jobs concurrently. Manual/automatic exclusion is per configuration, including module reloads; a configuration retarget cannot bypass its running lock. FortiGate retains the B15 type-wide guard and automatic single-configuration restriction. One active Node scheduler process per installation remains required; this is not a distributed lease.

## Forward migration and legacy history

Deploy `20261016140000_inventory_source_scope` and regenerate Prisma before starting this code. Use the normal installation backup/release procedure, stop old scheduler ownership, apply `prisma migrate deploy`, generate the release client and start the new release. Do not hot-swap old unscoped writers alongside scoped writers. No installation migration or restart was performed as part of the B16 checks.

The migration adds nullable scope columns and compound unique indexes. It preserves all primary keys, interfaces and existing database-ID relationships. Legacy rows are attributed only when exactly one saved configuration of the corresponding type exists, counting disabled configurations too. Duplicate external-ID groups are left unassigned. Missing or multiple saved configurations leave the old inventory unassigned; a new sync creates scoped rows rather than guessing which legacy record to update. SQL/application normalization parity is tested.

This attribution uses the saved configuration at migration time; historical endpoint changes/deleted configurations cannot be reconstructed from the old schema. Review such histories before deployment. A pre-upgrade collision may already have overwritten data; the migration cannot recover that history. Historical VMware alarm rows are not rewritten. Unscoped cooldowns deliberately cannot suppress a newly scoped target; the first evaluation can create a new scoped incident for an ongoing condition.

Read-only check for unresolved attribution (counts only, no credentials/customer content):

```sql
SELECT 'vmware-device' AS kind, count(*) FROM devices WHERE "vmwareMoref" IS NOT NULL AND "vmwareSourceScope" IS NULL
UNION ALL SELECT 'zabbix-device', count(*) FROM devices WHERE "zabbixHostId" IS NOT NULL AND "zabbixSourceScope" IS NULL
UNION ALL SELECT 'vmware-cluster', count(*) FROM vmware_clusters WHERE "sourceScope" IS NULL
UNION ALL SELECT 'vmware-datastore', count(*) FROM vmware_datastores WHERE "sourceScope" IS NULL
UNION ALL SELECT 'zabbix-trigger', count(*) FROM zabbix_triggers WHERE "sourceScope" IS NULL;
```

Do not bulk-assign ambiguous rows by name/IP or delete them automatically. Establish their source from operator-approved evidence, review their interfaces/relations and reconcile under a backed-up maintenance change. Inventory lists/reports may still include historical unassigned records; target-specific metric reads exclude unassigned history. No automatic cleanup is added.

The VMware alarm/health default remains the deterministic source selection from ADR-019. B16 isolates evidence for the selected target; it does not implement evaluating every saved VMware target in one alarm run. Zabbix trigger import remains its existing inventory/report path, with no new alarm engine or notification bridge.

## Verification performed

Reviewed HEAD: `816e6036fea121be4402fcdc81a68aaadda7331e` plus existing B01–B15 and concurrent UI/incident changes. Those changes were retained. Tests used an immutable installed Node 20.20.2 / Prisma 5.22 / TypeScript 5.9.3 runtime with read-only repository/dependencies and a separately generated Prisma client in executable tmpfs. PostgreSQL 15 ran with no published port, no persistent volume and no external network. Its explicit fixture database was the only database used. Remote clients, source records, clocks and notifications were synthetic where needed; installation ENV and customer systems were not loaded.

| Check | Actual result |
|---|---|
| `test:inventory-source-scope` | PASS, 24 scenarios: equal IDs across targets, independent concurrent writes, scoped parents/auxiliary records, retarget/return, missing-ID failure, same endpoint/different configs, manual guard/selection, normalization (including IPv6/IDN saved-source parity), credential-independent identity, scoped metric writes/reads and VM operation selection, occurrence identity and actual alarm initialization |
| `test:inventory-source-scope:db` | PASS, 16 scenarios: full forward migration chain; legacy attribution/ambiguity/missing config/duplicate group; SQL normalization parity; real concurrent importer writes, retained IDs/relations, retarget/retry, unique constraints, unresolved legacy rows never claimed by import, topology boundary and native-event/incident/notification/cooldown isolation |
| `test:inventory-sync` / `:db` | PASS, 55 / 9 scenarios |
| `test:inventory-scheduling` / `:db` | PASS, 50 / 6 scenarios; multiple VMware/Zabbix sources now independent, FortiGate restriction retained |
| `test:zabbix-auth` | PASS, 79 scenarios |
| `test:vmware-cache` / `test:vmware-collection` / `test:vmware-health` | PASS, 52 / 65 / 54 scenarios |
| `test:credential-storage` | PASS, 47 scenarios |
| `test:integration-permissions` | PASS, 144 scenarios |
| `test:alarm-occurrences` / `test:alarm-dispatch` / `test:alarm-sources` | PASS, 19 / 35 / 46 scenarios |
| TypeScript | PASS, full `tsc --noEmit --incremental false` with regenerated client |
| Prisma schema/database comparison | PASS, `migrate diff --exit-code`: no difference after the full forward chain |
| ESLint | New scope/selection/scheduler/coordinator/source helpers clean. Five edited legacy files retain the same 69 diagnostics as the B16 starting snapshots (10 VMware API, 17 VMware service, 1 Zabbix service, 7 topology, 34 detection engine); no new diagnostic category/message. Existing unrelated UI work was not rewritten. |

CI includes both new suites and their source/migration triggers. No build, live device collection, production database migration, real notification, application restart, commit or push is represented as performed.

## Regression commands

```sh
npm run test:inventory-source-scope
npm run test:inventory-sync
npm run test:inventory-scheduling
```

The DB suite additionally requires a disposable local PostgreSQL database named `*_occurrence_tests`, `DATABASE_URL` with host `127.0.0.1` and `INFRASCOPE_SCOPE_DB_TEST=1`. It applies migrations and owns fixture schemas/rows. Never supply installation credentials to it. Run `npm run test:inventory-source-scope:db` only in that isolated environment.
