# ADR-014: VMware Target Cache and Revalidation

**Status:** Accepted  
**Date:** 2026-10-15  
**Scope:** Audit B07; preserves REST, SOAP and Python source alternatives.

## Decision

Bind process-local VMware response and snapshot cache entries to an opaque identity of the normalized target and the complete connection profile, including credentials and certificate settings. Never expose identities or credentials in response headers or logs. Snapshot MoRefs are unique only within that profile. Copy configuration at client construction so a caller cannot change the identity behind cached values.

Resolve saved enabled configuration after application authorization and before reading response caches. Revalidate through the same server-side loader and its source authentication, without self HTTP requests or user-cookie forwarding. Deduplicate concurrent loads per profile and resource. Keep the existing five-minute inventory freshness, two-minute snapshot response freshness and thirty-minute stale window. Explicit cache bypass must happen before cache reads, and never bypass authorization.

Failed authentication or thrown source errors cannot replace cache contents or advance freshness. Invalidating a profile fences pending writes as well as removing entries; another profile is unaffected. Invalidate after successful settings saves and source mutations. Bound retained entries by their expiry. Preserve existing REST/SOAP/Python transport behavior and separately tracked B08 source-error/protocol limitations.

This intentionally retains request-scoped VMware clients while sharing cache and in-flight loads across module reloads. A singleton session/backoff redesign, encrypted credential migration, transport parity and existing Python/helper failure semantics are outside B07. No new Prisma client, dependency, schema, scheduler or alarm engine is introduced.

## Verification

Use actual service/cache/route code with synthetic source and ORM fixtures, deterministic time and forbidden live network/child-process execution. Cover target and credential isolation, overlapping MoRefs, stale refresh authentication, failed refresh retry, concurrent loads, invalidation races, disabled settings, authorization and existing response contracts. Record executed results here when verification finishes.

### Executed verification (2026-10-15)

Base commit: `816e6036fea121be4402fcdc81a68aaadda7331e`. Preserved the existing uncommitted B01–B06, dashboard and incident collaboration changes. B07 changed no dependency version, lockfile, schema or migration. Added only a package test script and regression-workflow triggers/step.

Before each relevant production change, the two reproductions failed in actual code: target B received target A's batch snapshots (`A !== B`), and stale response revalidation did not perform the second source authentication (`1 !== 2`). Both now pass. Additional concurrent-error coverage exposed a shared consumed response body; each waiting request now gets its own readable response clone. A stable internal error tag preserves HTTP 401 across module reloads.

The isolated Node runtime prefix was:

```text
docker run --rm --network none --read-only --volumes-from infrascope-web-dev:ro --tmpfs /tmp -w /app --entrypoint node sha256:daf880f6655d0fdb5bd863f8a0407dcb93f57c2f530f3fa89dd573c36f60d3b0
```

Source and installed dependency volumes were read-only, with networking disabled and temporary writes confined to tmpfs. Fixtures substitute ORM, source transport and helper execution; no application environment file, live customer database, vCenter, helper process or notification recipient was used. One host-side temporary lint baseline file was removed after comparison.

| Check | Actual result |
|---|---|
| Prefix + `scripts/check-vmware-cache.cjs` (`npm run test:vmware-cache`) | PASS, 52 scenarios, exit 0. Actual service/route/cache code, synthetic I/O: host and same-MoRef isolation, username/password/thumbprint/module changes, immutable configuration, normalization, service and HTTP expiry, authorized bypass, source Basic authentication and owned session use, response contracts, scoped warming, missing/disabled settings, thrown/auth failures, unchanged stale age and retry, concurrent success/error, save/mutation invalidation, failed saves, password preservation, late writes/child warming and module reloads. |
| Prefix + `node_modules/typescript/bin/tsc --noEmit --incremental false` | PASS, exit 0 on final production code. |
| Prefix + ESLint JS API (`lintText` before, `lintFiles` after) on the route, service and new cache module | Zero new diagnostics. Existing diagnostics decreased from 43 to 34 (route 21→13, service 22→21, cache 0). This is a comparison of severity/rule/message multisets, not a claim that legacy lint is clean. |
| Prefix + `scripts/check-alarm-occurrences.cjs` | PASS, 19 scenarios, exit 0. |
| Prefix + `scripts/check-alarm-sources.cjs` | PASS, 46 scenarios, exit 0. |
| Prefix + `scripts/check-alarm-dispatch.cjs` | PASS, 35 scenarios, exit 0. |
| Prefix + `scripts/check-integration-permissions.cjs` | PASS, 144 scenarios, exit 0; repeated after final route error handling. |
| Prefix + `scripts/check-fortianalyzer-auth.cjs` | PASS, 45 scenarios, exit 0. |
| Prefix + `scripts/check-fortianalyzer-cache.cjs` | PASS, 34 scenarios, exit 0. |
| Prefix + `scripts/check-alarm-health.cjs` | PASS, exit 0: optional sources, failures, recovery and health history. |
| Prefix + `--check scripts/check-vmware-cache.cjs` | PASS, exit 0. The final expanded script also executed successfully. |
| Workflow parsed using installed `js-yaml`; VMware source/test triggers and `test:vmware-cache` step asserted | PASS, exit 0. GitHub-hosted CI itself was not run. |
| `git diff --check --` scoped to changed tracked B07 paths | PASS, exit 0. Git's existing LF/CRLF notice for `package.json` is not a whitespace failure. |

No full Next build, full-repository lint, live VMware end-to-end validation, actual Python/PyVmomi execution, notification delivery or PostgreSQL integration suite was performed for B07. There is no database/schema change; ORM fixtures exercise settings-save/cache invalidation behavior. Full-build and transport/runtime parity are not established by the successful type and behavioral checks. No process restart, commit or push was performed.

## Remaining Boundaries

- Failed REST authentication and thrown collection errors cannot establish fresh cache entries. Existing snapshot helpers can still catch failures and return an empty list; dashboard snapshot collection is also best effort. B08 must repair that source contract before claiming all source failures are distinguishable from empty data. The cache does not invent a failure that its loader has hidden.
- Source work already issued before invalidation may complete remotely. Fences prevent cache publication and child warming from the retired load; they do not cancel the remote operation or retroactively change a response already requested under the old profile.
- Mutation invalidation is process-local. Other application processes retain their bounded TTL unless current configuration changes their identity. Identical complete profiles intentionally share cache; selecting multiple simultaneously enabled vCenters remains the pre-existing first-enabled policy.
- Legacy unscoped globals are not consulted. Normal deployment loads the new namespace. A request-scoped VMware session/logout/backoff redesign, encryption and transport trust parity remain outside this cache fix.
