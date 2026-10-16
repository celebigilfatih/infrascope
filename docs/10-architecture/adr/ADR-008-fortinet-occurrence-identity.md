# ADR-008: Fortinet Source Occurrence Identity

**Status:** Accepted  
**Date:** 2026-10-15  
**Supersedes:** No prior ADR; refines source-event deduplication in the existing incident lifecycle.

## Context

Audit B01 demonstrated that Fortinet `logid` is an event-type identifier. Treating it as a unique occurrence ID suppresses later events, including after an incident is closed. The event cache already distinguishes type from occurrence, but raw logs reaching `fireAlarm` still contain the type ID.

## Decision

- Keep the existing engine, incident fingerprint, cooldown, notification preferences and `(alarmId, sourceEventId)` constraint.
- Canonicalize Fortinet occurrences in `lib/alarms/fortinet-occurrence-identity.ts`. Use a versioned SHA-256 ID scoped by analyzer configuration, source, physical device/VDOM, log type, native event ID/time and stable source evidence. The runner passes the selected analyzer config ID to the engine; credentials are never part of the ID.
- Preserve source timestamp strings without converting nanoseconds to `Date`. A timestamp shaped like nanoseconds can still come from a coarse clock, so native actor/action/message fields distinguish events when no true event ID exists.
- Without source time/instance ID, hash the deterministic first-event payload. Never use ingestion time, random values or unrelated events in the batch to create an occurrence ID.
- Preserve explicit NMS IDs and generic VMware event IDs. This change does not fix event-cache source scope, source timestamp parsing, query failure semantics or source dispatch findings.
- Use the canonical key for transactional lookup, insertion and unique-conflict recovery. Notify only after a newly committed occurrence, as before.

## Legacy transition

Do not rewrite/delete existing events or launch a historical replay. If the new key is absent, inspect the old type-ID record. Suppress a legacy replay only when retained raw evidence proves the same physical device, VDOM, native ID/time and event contents. Missing evidence must not permanently suppress future events. Old records have no analyzer scope, so this compatibility comparison uses physical source evidence; all newly stored keys include config scope.

An ambiguous first post-upgrade observation can create one new occurrence and follow existing notification limits. Previously suppressed events cannot be recovered from records that were never written. A retrospective backfill requires a separate operator decision and delivery policy.

## Consequences and verification

No schema/dependency change or installation DB migration is required. Repeated identical events remain idempotent; a new event after CLOSED creates a new incident, while a RESOLVED condition follows the existing reopen policy. Retained legacy records remain unchanged.

Provider precision already lost during JSON decoding cannot be reconstructed. Events with identical source evidence require a provider instance ID to distinguish them. The first-event representative and existing incident grouping policy are preserved rather than rewritten here.

`test:alarm-occurrences` executes real recording/notification decisions with isolated fixtures. `test:alarm-occurrences:db` requires explicit opt-in to a local dedicated test DB and exercises real PostgreSQL transactions/uniqueness with concurrent delivery. SMTP is mocked in both. CI runs these plus the existing alarm-health regressions against an ephemeral PostgreSQL service.

Rollback can revert the code, but restoring type-only deduplication reintroduces B01 and can replay events stored under new keys. Do not mutate historical IDs to perform a rollback; review notification settings and retained evidence first.

## Related

- `docs/audits/POST_MERGER_ARCHITECTURE_BEHAVIOR_AUDIT.md` — B01 and original reproduction.
- `docs/20-modules/alarms/LIFECYCLE.md` — lifecycle and transition behavior.
- `docs/00-product/CONSTITUTION.md` — real evidence, idempotency and immutable history.

## History

| Date | Change |
|---|---|
| 2026-10-15 | Canonical source occurrence IDs, conservative legacy compatibility and regression coverage. |
