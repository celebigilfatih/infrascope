# ADR-013: FortiAnalyzer Cache Configuration Lifecycle

**Status:** Accepted  
**Date:** 2026-10-15  
**Scope:** Audit B06; refines event-cache lifecycle after ADR-009 and ADR-012.

## Decision

Bind the active event-cache collector to the saved FortiAnalyzer configuration ID and revision. Compute an opaque revision from the stored configuration record, including its encrypted configuration and update timestamp; do not persist a digest of decrypted passwords. A process-global coordinator prevents duplicate initializations across module reloads. A successful settings save invalidates retired collectors immediately; each scheduled sync also reloads current configuration so changes outside the save route cannot keep the old target indefinitely. New collection uses the existing shared client factory and encrypted credential resolution.

Revision input includes non-secret connection settings and encrypted credential envelopes; legacy plaintext secrets are excluded. Model/API writers must maintain `updatedAt`. Encrypted credential changes remain distinguishable even if timestamps coincide. Normalize the existing `apiKey`/`accessToken` storage aliases before initializing both the runner and collector; no new authentication protocol is introduced.

Retiring a collector clears its timer, cancels pending source work, removes freshness, prevents subsequent writes/scheduling and rejects old cache reads. Already issued DB writes cannot be aborted; scope them to their retired revision so they cannot overwrite or contaminate current data. Keep one initial-sync promise and one recurring timer per active revision. Failed/disabled/deleted current configuration must not silently continue using an old client. Initialization failures remain visible or fall back to the matching live client without inheriting previous freshness.

Namespace persisted FA cache IDs and reserved raw-log metadata by revision without changing the DB schema. Scope dedicated/generic cache queries and API cache fallbacks to the matching revision; strip internal metadata before returning native events so occurrence identities stay stable. Existing unscoped FA rows remain historical cache data and cannot establish current coverage. Preserve independent NMS database queries and VMware source behavior. Do not delete incidents or source history.

Scope heavy HTTP response-cache keys by the same saved revision and invalidate them after a successful save. An old request completing late can write only its old response-cache key. Preserve cache plus live fallback and the rule that failed collection cannot establish freshness. Bound warmup waits and clear their timers; a retired initialization cannot overwrite a newer cache reference.

## Limits and verification

No new alarm engine, dependency, schema or deployment change. Tests use real lifecycle/query/route code with isolated configuration, transport, ORM and deterministic timer fixtures. No live customer systems or notifications. Source work already sent before a settings change can finish remotely; cancellation and revision fences prevent its result from becoming current data. Cross-process changes are detected when a scheduled cycle or current configuration read occurs, rather than through a distributed invalidation bus.

Deploy this version with an application-process restart to remove legacy timers without stop handles. Later configuration changes do not require restarts. Actual remote sessions/queries may finish after cancellation; no remote cleanup guarantee is asserted. Existing inactive CMDB-diff helper queries were not reactivated or redesigned.

### Executed verification (2026-10-15)

Base commit: `816e6036fea121be4402fcdc81a68aaadda7331e`, with preserved uncommitted B01–B05, dashboard and incident collaboration work. B06 did not modify the schema, migrations or dependencies. The existing 21 migrations, including the unrelated pending incident-notes migration, were applied only to a disposable fixture database.

Before the implementation, two actual-engine reproductions failed: a second engine reused the first target's cache/client, and saving settings left the old collector fresh and scheduled. The final lifecycle suite passes both triggers and captures source calls and writes to prove collection uses the new host/resolved credentials. It also uses real credential encryption/decryption for a rotated-password save.

The isolated Node runtime prefix was:

```text
docker run --rm --network none --read-only --volumes-from infrascope-web-dev:ro --tmpfs /tmp -w /app --entrypoint node sha256:daf880f6655d0fdb5bd863f8a0407dcb93f57c2f530f3fa89dd573c36f60d3b0
```

Source and installed dependency volumes were read-only. No application environment file, customer source or notification recipient was used by the fixture suites. The DB checks used a separately created `postgres:15-alpine` container with network disabled, no published ports and tmpfs storage. The Node DB client shared only that container's loopback network namespace, with an explicit fixture URL and `INFRASCOPE_FA_CACHE_DB_TEST=1`.

| Check | Actual result |
|---|---|
| Prefix + `scripts/check-fortianalyzer-cache.cjs` (`npm run test:fortianalyzer-cache`) | PASS, 34 scenarios, exit 0: host/password/key rotation, encrypted settings, one initialization/timer, reloads, external configuration changes, failure/disable/delete/recovery, stopped collectors, cancellation, late source/DB/init/HTTP results, revision filtering, empty current source, safe fallback, queued metadata reads and bounded warmup. |
| DB runtime + `node_modules/prisma/build/index.js migrate deploy` | PASS, all 21 existing migrations applied to the empty fixture DB; no installation DB touched. |
| DB runtime + `scripts/check-fortianalyzer-cache-db.cjs` (`npm run test:fortianalyzer-cache:db`) | PASS, 4 scenarios, exit 0: real Prisma uniqueness/idempotency, JSONB scope plus existing filters, specialized admin query and retired writer rejection. Fixture rows are removed in `finally`. |
| DB script without explicit opt-in | Expected refusal, exit 1 before Prisma construction or DB I/O. |
| Prefix + `node_modules/typescript/bin/tsc --noEmit --incremental false` | PASS, exit 0. |
| Targeted ESLint `lintText` multiset comparison with captured pre-B06 sources | PASS for no new diagnostics, 13 TypeScript files, 70 before / 70 current / 0 added. Existing legacy findings remain; this is not a clean full-repository lint result. Both new TypeScript modules have zero diagnostics. |
| Prefix + `scripts/check-alarm-occurrences.cjs` | PASS, 19 B01 scenarios, exit 0. |
| Prefix + `scripts/check-alarm-sources.cjs` | PASS, 46 B02 scenarios, exit 0. |
| Prefix + `scripts/check-alarm-dispatch.cjs` | PASS, 35 scenarios, exit 0; existing B03 checks plus the stored `apiKey` alias control. |
| Prefix + `scripts/check-integration-permissions.cjs` | PASS, 144 B04 scenarios, exit 0. |
| Prefix + `scripts/check-fortianalyzer-auth.cjs` | PASS, 45 B05 scenarios, exit 0. |
| Prefix + `scripts/check-alarm-health.cjs` | PASS, exit 0. |
| `js-yaml` workflow parse plus assertions for package aliases, steps, opt-in environment and path triggers | PASS, exit 0; remote CI was not triggered. |
| Host `git diff --check -- <B06 tracked paths>` | PASS, exit 0. |

No live FA login/collection, production DB verification, full Next build or full repository lint was run. The source transport is simulated in lifecycle tests; DB provenance is independently exercised against PostgreSQL. Existing enabled-configuration selection remains the application's single active FA selection contract; multiple-target UI/routing is not added here. External plaintext-credential writers must update the configuration timestamp rather than mutating secret fields without a revision change. All temporary DB resources and lint-baseline staging files are removed after verification. No commit/push or live application restart is performed.

## Related

- [Audit B06](../../audits/POST_MERGER_ARCHITECTURE_BEHAVIOR_AUDIT.md)
- [ADR-009](ADR-009-alarm-source-failure-semantics.md)
- [ADR-012](ADR-012-fortianalyzer-credential-session-ownership.md)
