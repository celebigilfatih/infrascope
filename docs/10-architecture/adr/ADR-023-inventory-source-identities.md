# ADR-023: Connection-scoped VMware and Zabbix inventory identities

Status: Accepted
Date: 2026-10-16

## Context

Remote VMware MoRefs and Zabbix host/trigger IDs are unique only within their source. Existing imports search them globally; datastore/trigger imports even use them as database primary keys. Two saved connections can overwrite each other's inventory and relations. The B15 scheduler therefore refuses multiple enabled configurations.

## Decision

Persist a nullable source scope alongside external IDs, with compound unique constraints for devices, clusters, datastores and trigger-host associations. The scope is SHA-256 of the integration configuration ID, source type and normalized non-secret endpoint (newline separated). Credentials, module selection and polling intervals do not change inventory identity. Retargeting the same configuration creates a different scope; returning to an earlier endpoint reuses its original records. Deleting/disabling a configuration retains inventory and database IDs. Source scope has no cascading foreign key.

VMware endpoint normalization removes HTTP(S) prefixes and trailing slashes, lowercases the authority and removes the default HTTPS port. Zabbix normalization lowercases scheme/authority, preserves path case and non-default ports, removes trailing slashes and the optional `/api_jsonrpc.php` suffix. URL credentials, queries and fragments are rejected. SQL migration normalization and application normalization must agree (regression vectors cover both).

Only a sole saved configuration of the corresponding type, including disabled configurations, can receive legacy records automatically. Duplicate external-ID groups remain unassigned. Multiple configurations leave legacy records unassigned rather than guessing ownership. Unassigned records remain readable, retain IDs/relations, and are never claimed by normal imports; an operator must reconcile ambiguous history separately. No migration can recover inventory already overwritten before this fix.

Saved-source construction passes its trusted configuration ID; unsaved connection tests may read the source but cannot write inventory without a scope. Every external-ID lookup for import/relationships and every auxiliary upsert includes scope. Trigger identity includes host ID because one trigger can reference multiple hosts. Capacity history is scoped too, retaining raw remote IDs for source operations. The existing VMware alarm engine annotates collected evidence with this scope; entity/native-event identities and cooldown reads use it. Historical unscoped occurrences are retained without rewriting immutable history, so the first scoped evaluation of an ongoing condition can create a new incident.

Manual sync selects `configId` explicitly when more than one enabled connection exists, returning an ambiguity error otherwise. VMware operational requests also accept `configId` and reject ambiguity; health/alarm default selection remains deterministic as specified in ADR-019 (this change does not implement multi-target VMware alarm evaluation). Writes and inventory relationships carry the selected source scope.

VMware/Zabbix scheduler jobs and manual sync share per-configuration exclusion; different connections may run concurrently. Database uniqueness is the final integrity boundary. FortiGate retains its type-wide guard and automatic single-configuration restriction because its inventory identity migration is outside B16.

## Consequences and validation

Requires a forward migration and regenerated Prisma client before deployment. Test with isolated PostgreSQL: legacy attribution/ambiguity, retained primary keys/relations, two connections with identical external IDs, updates, retargeting, duplicate rejection and independent interfaces/triggers. Offline tests cover selection, scheduling, normalization, missing scope and source-failure regressions. No customer source, notification recipient or installation database is needed for validation.
