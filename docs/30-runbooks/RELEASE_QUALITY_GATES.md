# Release quality gates

## Contract

`npm run build` executes `quality:release` before `next build`. Policy validation, the production TLS scan, TypeScript and the full configured Next.js lint scope must all succeed. Next.js also retains its own type/lint checks: `ignoreBuildErrors` and `ignoreDuringBuilds` are explicitly false. A direct `next build` still enforces these two native checks; use the supported npm command for the additional static policies. The build command uses `&&`, not an optional lifecycle hook or ignored exit status.

`quality:release` validates its own command chain and the unscoped `type-check`/`lint` scripts. It does not import the application, initialize Prisma, start jobs or load installation environment variables. Existing lint errors are blockers; no baseline, rule downgrade or blanket suppression was introduced. Normal ESLint warnings remain visible with their existing severity.

Tag/manual image publication waits for reusable release-quality, alarm/integration, dashboard, incident and backup workflows on that revision. The publish job has no `always()` or error-tolerating override. Failed, cancelled or skipped required jobs do not authorize a push. The image's existing Docker build invokes the same npm build command. Incident workflow concurrency includes the calling workflow name so an independent push run cannot cancel the reusable release run.

The TLS scanner now includes `.py` and `.cjs` and detects Python verification-off calls, unverified contexts, certificate/hostname disables and global overrides. It reports file/line/check names without matched source text. `scripts/check-production-tls.js` remains a compatible CLI wrapper for the ESM implementation. The established centralized Node TLS policy is still excluded; the Python development/test exception is limited to the exact reviewed `truthy`/`production_guard`/`tls_context` block. Its fingerprint changes if that policy is edited. Review the change and rerun `test:vmware-python` before updating that fingerprint. Do not add unrelated helper files to an exemption. This heuristic scan is not exhaustive security analysis.

## Commands

| Command | Scope |
|---|---|
| `npm run quality:release` | Policy, TLS scan, TypeScript, configured Next lint; stops on the first failure |
| `npm run build` | Same quality gate followed by the actual product build |
| `npm run test:release-quality` | 26 pure policy/scanner/workflow contract regressions |
| `npm run test:release-compiler` | Four actual minimal Next.js builds in owned temporary directories; current type/lint failures, clean positive control and legacy-bypass negative control |
| `npm run test:vmware-python` | Real helper protocol and loopback TLS/SDK regressions, including production rejection of the explicit development exception |

The compiler suite imports no product routes or startup hooks. It uses local minimal source, existing dependencies and system fonts, and passes a sanitized child environment without source/SMTP/database credentials. It verifies owned temporary paths before recursive cleanup. Its successful fixture build is not evidence that the product release builds successfully.

## Current product build verification — 2026-10-16

The Google font build dependency has subsequently been removed. Inter 4.1 and its OFL license are bundled in source, and `next/font/local` loads the variable font. The **real product `npm run build` now exits 0 in a fresh source copy with Docker networking disabled**, using already installed dependencies. Policy/TLS/type/lint checks, compilation, page collection, 112/112 static pages, optimization and build traces all complete. Generated manifest/CSS/login references and emitted font bytes are verified. See [local font verification](LOCAL_FONTS.md) for evidence, warnings and scope. The lint-cleanup and original B21 records below remain historical.

## Module lint cleanup — 2026-10-16 (before local-font change)

**All 390 lint errors are resolved.** Full configured Next lint exits 0 with **0 errors / 9 existing warnings**; `npm run quality:release` exits 0. Rules, severities, source scope, native build checks and the mandatory command chain are unchanged. No suppressions or baseline waivers were added. A successful product release build is not claimed: the isolated real build reaches compilation and fails fetching Inter from Google Fonts (`EAI_AGAIN`) with networking disabled.

Base commit remains `816e6036fea121be4402fcdc81a68aaadda7331e`; validation applies to the uncommitted working snapshot, including preserved B01–B21 and concurrent UI/incident/VMware workspace work. No commit, push, application restart or installation database change was performed by this cleanup.

| Module group | Initial errors | Change |
|---|---:|---|
| API routes | 147 | Concrete Prisma update/transaction/JSON types, saved-config projections, typed response caches and removal of unused handler bindings |
| Alarm engine, cache and queries | 95 | Typed log/CMDB results, shared ORM inference, narrowly typed legacy diagnostic globals and removal of unused registry imports/locals |
| Integration clients | 39 | Explicit FortiAnalyzer/FortiGate payload contracts and VMware direct-array/legacy-wrapper, task and enrichment shapes |
| Application screens | 71 | Location/tree/form/connection contracts, real response types, unused binding cleanup and equivalent JSX escaping |
| Topology helpers/components | 14 | Discovery/position metadata, edge styles, wizard payload and generic visibility filtering that retains original objects |
| Shared helpers | 24 | Role enum, audit/email/queue JSON contracts, API parameter types, opaque caches and a type-only toast action map |
| **Total** | **390** | **Final: 0 errors** |

Catch annotations and type assertions were checked against emitted JavaScript. Runtime changes in this cleanup are limited to unused bindings/helpers/pure calculations, explicit discards of intentionally ignored compatibility arguments and equivalent JSX text. Hook invocation order, awaited license writes, VMware host collection and credential-redaction destructuring are retained. Concurrent workspace behavior changes were preserved, not attributed to lint cleanup. Existing stubs, alternative source/cache paths and legacy diagnostics were not activated or redesigned.

| Check | Actual cleanup result |
|---|---|
| Full TypeScript | PASS, `tsc --noEmit --incremental false` against the working source, plus the unmodified npm type-check script through the full release gate |
| Full configured Next lint | PASS, exit 0; 0 errors / 9 warnings, same warning file/rule/message multiset as baseline |
| Complete `npm run quality:release` | PASS, exit 0: policy, production TLS scan, TypeScript and full lint |
| Product `npm run build` | FAIL, exit 1 after quality succeeds: `next/font/google` cannot fetch Inter without networking; page collection/prerendering not validated |
| Release policy/scanner/workflow suite | PASS, 26 scenarios; existing compiler-bypass and publication requirements remain enforced |
| Native compiler controls | PASS, 4 real minimal builds; type/lint errors fail, clean fixture passes, legacy bypass negative control admits the invalid fixture |
| Existing offline Node regressions | PASS, 32 scripts listed below; synthetic transports/ORM/timers or loopback fixtures |
| New `node scripts/check-topology-contracts.mjs` / `npm run test:topology-contracts` | PASS; zoom thresholds, object identity, both edge endpoints, parameterized organization scope, joined graph deduplication, stable/fallback positions and idempotent CDP discovery; explicitly linted with 0 messages |
| Python regressions | PASS: VMware protocol/TLS 18, poll scheduling 13, cluster collector 3, host workspace collector 4 tests |
| Disposable PostgreSQL regressions | PASS: occurrences, ownership (16 scenarios/four processes), FortiAnalyzer cache (4), FortiGate targets (5), FortiGate SNMP (6) and incident collaboration/rollback |

The 32 existing offline Node scripts are `alarm-occurrences`, `alarm-health`, `alarm-ownership`, `alarm-sources`, `alarm-dispatch`, `integration-permissions`, `fortianalyzer-auth`, `fortianalyzer-profile`, `fortianalyzer-profile-ui`, `fortianalyzer-cache`, `fortianalyzer-time`, `vmware-cache`, `vmware-collection`, `vmware-health`, `zabbix-auth`, `credential-storage`, `inventory-sync`, `inventory-scheduling`, `inventory-source-scope`, `fortigate-alarm-targets`, `fortigate-snmp`, `nms-backups`, `nms-device-ids`, `dashboard`, `incident-center`, `incident-detail`, `ui-turkish`, `room-layout`, `rack-workspace`, `device-inventory-ui`, `cluster-workspace` and `host-workspace` (`scripts/check-<name>.cjs`). The topology test is also required by reusable release-quality CI.

Checks used the same immutable Node image/runtime described in the B21 record below, read-only source/dependencies and writable tmpfs. Installation dotenv files, machine/license state, backups and logs were excluded from the product copy; existing migration SQL and the NMS backup profile contract were included as source. PostgreSQL 16 used image `sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea`, volatile data and the network-isolated checks container's loopback namespace, with no published ports. Migration deploy affected only that disposable database. Source and SMTP transports remained synthetic. No real recipients or source systems were contacted. Both owned containers were removed after verification.

Initial fixture setup attempts failed because the first source copy excluded required NMS profile/migration files; those source files were then included. The incident collaboration test and first FortiGate database invocation correctly refused missing opt-in flags. Both were subsequently run with explicit flags against the disposable PostgreSQL database and passed. No failing assertion was suppressed or changed.

The 9 remaining warnings are 3 hook dependency and 6 image-element warnings. Their severity is unchanged; dependency/image changes require a separate behavior/layout review. Browser/E2E checks, image publication and a successful product build were not performed here. The lint blocker is closed; the remote-font build dependency remains separately visible. See [sanitized cleanup evidence](../audits/LINT_MODULE_CLEANUP_2026-10-16.json).

## Historical B21 lint snapshot

At the initial B21 verification, the working tree was not release-ready. B21 removed the bypass without rewriting unrelated debt. Full configured Next lint failed with **390 errors and 9 warnings across 90 files with diagnostics**; the B21 before/after diagnostic multiset was identical. The cleanup above supersedes this lint status, not the historical evidence.

| Rule | Count | Severity / treatment |
|---|---|---|
| `@typescript-eslint/no-explicit-any` | 313 | Error; replace with real contracts/validated unknown values in the owning module |
| `@typescript-eslint/no-unused-vars` | 74 | Error; candidates for review, not proof that a file/module is unused |
| `react/no-unescaped-entities` | 3 | Error; fix JSX text in the owning screen |
| `react-hooks/exhaustive-deps` | 3 | Warning; review closure/refresh behavior before changing dependencies |
| `@next/next/no-img-element` | 6 | Warning; assess image loading/layout behavior |

See [the sanitized diagnostic evidence](../audits/B21_LINT_DIAGNOSTICS.json) for every file, line, rule and message. It contains no source bodies/fix payloads and is never read as a gate waiver. Its line numbers describe the inspected uncommitted snapshot. No unused candidate was automatically deleted.

Largest initial error concentrations were `app/network/NetworkTopologyContent.tsx` (37), `lib/alarms/detection-engine.ts` (34), the main FortiAnalyzer route (23), `lib/alarms/queries/index.ts` (20), `fortigate-cmdb.ts` (19), VMware client (17), FortiGate client (14) and the NMS device route (13). The gate stayed enabled during the module cleanup.

The initial B21 recommendation was to rerun the actual product build once lint was clean. The cleanup did so and confirmed the previously untested offline font-fetch failure described above. Do not infer a successful product build from the system-font fixtures.

## B21 verification — 2026-10-16

Base commit: `816e6036fea121be4402fcdc81a68aaadda7331e`. Existing B01–B20 and concurrent UI/incident/localization work were preserved. No dependencies, schema or installation data changed; no bulk lint fixes were applied.

Checks ran in a dedicated `--network none --read-only` container using immutable Node image `sha256:daf880f6655d0fdb5bd863f8a0407dcb93f57c2f530f3fa89dd573c36f60d3b0`. Node 20.20.2, Next 14.2.35, TypeScript 5.9.3 and Prisma 5.22.0 were used; the generated Prisma client lived only in tmpfs. Source/dependency mounts were read-only. Product-build copies excluded dotenv files, installation state, SQL dumps, logs and backups, and wrote only under `/work` tmpfs. The static scanner can inspect matching configuration text without sourcing it; it never prints credentials. No live database, customer network, source device, license server or notification recipient was available. Python tests used Python 3.11.2 / pinned pyvmomi 9.1.1.0 and loopback-only fixture servers.

| Check | Actual result |
|---|---|
| Policy/scanner/workflow regressions | PASS, 26 scenarios; bypass flags, skipped/ignored command chains, Python/CommonJS detection, exact trusted-file exclusions, policy-exception weakening, later unsafe assignments and publication dependencies |
| Actual Next compiler controls | PASS, 4 scenarios: current type-error fixture exit 1, lint-error fixture exit 1, clean fixture exit 0, legacy bypass negative control exit 0 with explicit skipping messages |
| Product `npm run build` in isolated final source copy | **FAIL, exit 1 as required**: policy, TLS and TypeScript pass; lint reports 390 errors / 9 warnings; compilation not reached. No successful product build is claimed. |
| Full TypeScript | PASS through the real build command before lint; no ignored type errors |
| Full configured Next lint | FAIL, exit 1; identical 390 errors / 9 warnings before and after B21, zero added diagnostics in this scope |
| Targeted ESLint: Next config, three new ESM quality scripts, TLS wrapper and scanner | PASS, zero messages |
| Extended targeted ESLint on the legacy FortiGate CJS fixture | Four pre-existing CommonJS `no-require-imports` style diagnostics remain outside Next's configured source scope; no new import-style diagnostic added |
| Expanded production TLS CLI | PASS against the current tree, including Python/CommonJS |
| Python VMware helper / verified loopback TLS | PASS, 18 tests: trusted CA, wrong hostname/untrusted certificate rejection, real SDK SOAP login/logout, protocol failures and production bypass rejection |
| Existing offline regressions | PASS, all 24 scripts listed below; no real source/SMTP/DB effects |

The 24 scripts cover occurrences, alarm health, ownership, source failures, source dispatch, integration permissions, FortiAnalyzer authentication/cache/time/profile/form, VMware cache/collection/health, Zabbix authentication, credential storage, inventory sync/scheduling/scope, FortiGate targets/SNMP, NMS backups/device IDs and dashboard behavior. B01 occurrence/delivery and B02 actual source/query/cache/engine error semantics are exercised rather than relying only on the older mocked alarm-health fixture.

The first broad run found five failures in the old FortiGate target test harness: its synthetic transactions did not model B19 `$queryRaw` ownership fences. The harness now uses the shared lease simulator, preserves synthetic incident rollback/heartbeat behavior and supplies abort globals. All original assertions remain; the final rerun passes all 40 target scenarios. The actual PostgreSQL fixture path was preserved. This was a harness compatibility repair, not a relaxation of production ownership.

Database, browser and full image publication workflows are now required in CI but were not rerun/dispatched locally for B21. No product runtime behavior or schema changed in this patch. Existing UI/browser results from other tasks are not represented as fresh B21 validation. No package upgrade/install, production build success, application/NMS restart, commit, tag, image push or deployment is claimed. The disposable checks container is stopped after verification.
