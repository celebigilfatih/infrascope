# FortiAnalyzer ADOM and authentication consistency

## Connection contract

Settings select a host, ADOM and authentication mode. Omitted legacy ADOM means `root`; omitted legacy mode means API-key when `apiKey`/`accessToken` is present, otherwise session. Explicit mode wins over inactive credential fields. Conflicting key aliases are rejected. ADOM names retain case, reject path/control characters and are encoded as one path segment.

Session mode requires username/password and retains credential-owned pooling, isolated test sessions, logout and account throttling from B05. API-key mode requires no username/password. All JSON-RPC requests send `Authorization: Bearer <key>` and omit `session`; no credential login/logout or password fallback occurs. Key verification performs an actual ADOM device read rather than accepting a nonempty string. Authentication verification has a 15-second ADOM-read deadline including response parsing.

The settings page sends the same selected profile for test/save. A session probe logs in with entered credentials and reads the selected ADOM before returning success; it closes only its own session. The probe uses a restricted field list and range, not a complete inventory sync. A successful probe proves this limited read, not permission for every LogView/FortiView/MITRE feature. Errors, denied ADOMs, nonzero RPC statuses, malformed responses and HTTP failures cannot pass the probe.

Blank, omitted or masked edit secrets retain only the saved secret for the same normalized host/authentication mode (and same username for sessions). ADOM edits may retain that principal's secret, but the test reads the newly selected ADOM. Explicit wrong credentials never use saved fallback. Changing mode discards inactive credentials when saving. Settings responses expose only `passwordSet`/`apiKeySet`, host, username, ADOM and mode.

New saves canonicalize keys to encrypted `apiKey`. Legacy `accessToken` remains readable and now participates in the existing idempotent credential-protection/rotation migration under its own encryption context, including disabled records. No schema migration is needed. Use the established dedicated credential key and backup/rotation procedure; do not copy credentials into logs, diagnostics or tickets.

This is the local REST API-key protocol. FortiCloud OAuth access tokens require a different login/exchange workflow and are not silently treated as local API keys. Protocol references: [Fortinet JSON-RPC and API-key guidance](https://community.fortinet.com/fortimanager-27/technical-tip-using-fortimanager-fortianalyzer-api-113174), [FortiAnalyzer Cloud API-user exchange](https://docs.fortinet.com/document/fortianalyzer-cloud/7.2.12/cloud-deployment/510042/adding-api-users), and [Fortinet LogView ADOM examples](https://community.fortinet.com/fortianalyzer-6/technical-tip-api-calls-to-search-logs-from-analytics-database-logview-in-fortianalyzer-188625). Firmware/API-user permissions must be checked on the deployment's actual appliance.

## Active paths

| Entry | Profile and behavior |
|---|---|
| Settings UI / POST `test`, `save-config` | `fortianalyzer-profile.ts` merges/normalizes active credentials; test uses an isolated client; save protects canonical JSON and retires old collector/cache revisions |
| Main integration GET | `readFortiAnalyzerProfile` decrypts/normalizes saved settings; DVM, LogView and FortiView use that client's ADOM and transport; FortiView HTTP cache keys include revision |
| MITRE GET | Same saved profile; matrix/technique use selected ADOM; conflicting query ADOM is rejected; denied reads are failures, not successful null results |
| Manual/scheduled alarm runner | `alarm-runner.ts` resolves saved profile through the same helper and existing engine; no second engine or scheduling path |
| Shared background collector / dedicated query fallback | `fortianalyzer-cache-runtime.ts` binds selected profile; every scheduled cycle rechecks settings; B06 fencing and B18 time provenance remain active |
| Firewall correlation / event pages | Common profile resolver accepts both aliases/modes; DVM uses selected ADOM. Event rows, counts and freshness aggregates filter the selected analyzer revision; live fallback receives the resolved configuration ID |
| Health GET | Re-reads enabled saved profile, verifies that ADOM and scopes failed-health caching to revision; a previously accessed unrelated shared client/cache cannot substitute for the selected target |

`fortianalyzer-source.ts` is the shared decrypted settings boundary. `fortianalyzer.ts` is the shared wire/authentication boundary. Client keys and revisions include ADOM/mode plus profile-policy version. ADOM/auth changes retire old collectors and exclude old/unscoped cache rows without deleting history. Native event IDs, incident lifecycle and B19 run ownership remain unchanged. Global system-status/ADOM-list endpoints intentionally retain their global RPC paths; all ADOM-specific paths use the configured ADOM.

The unused legacy `getConfigLogs`/mock `getConfigRevisions` helpers were not activated or used to implement this change. Active config-revision reads continue through the real LogView/cache route. No automatic deletion/refactor of unused candidates was performed.

## Deployment verification

1. Open FortiAnalyzer settings as ADMIN; choose the exact ADOM and supported local auth mode. Existing records display their legacy defaults.
2. Enter a new active secret or retain the matching saved secret. Run the test. Verify the selected ADOM's read permission and the API user's trusted source hosts on the appliance.
3. Save the profile. An existing collector is retired/rebound; a subsequent alarm check uses the saved profile. Health must show the selected `target.adom`/`target.authMode`.
4. Check device correlation and an authorized LogView/FortiView/MITRE read in that ADOM. Feature-specific permission failures remain visible even if the restricted connection probe passed.
5. After ADOM/key edits, verify new collection freshness and target-specific event results. Old source history stays stored but cannot satisfy the new revision. Do not clear incident history to recover connectivity.

Saving settings does not itself assert remote connectivity; use the test action. B20 does not add a FortiCloud OAuth exchange or a new multiple-analyzer management UI. Existing explicit correlation configuration selection and ambiguity guards remain in place.

## Safe regression commands

`npm run test:fortianalyzer-profile` runs actual client/settings/collector/runner/health logic with synthetic transport/store/clock, plus actual TSX component event handlers with synthetic hooks/fetch. It never reads installation ENV or reaches sources/recipients. The component suite checks state and payloads, not screenshots or browser layout.

`npm run test:fortianalyzer-profile:db` requires `INFRASCOPE_FA_PROFILE_DB_TEST=1` and an explicit loopback PostgreSQL URL for an empty dedicated `*_occurrence_tests` database. It refuses without opt-in before Prisma construction. It uses real Prisma settings, credential migration and JSONB/cache queries, with synthetic FA transport, connector identity and capability persistence. Owned rows are cleaned in `finally`. Never point it at the installation database. CI runs the new offline/form/DB checks alongside existing regression suites.

## B20 verification record — 2026-10-16

Base commit: `816e6036fea121be4402fcdc81a68aaadda7331e`, with existing B01–B19 and concurrent UI/incident/localization changes preserved. Starting versions of changed files were captured for comparison. No dependency/schema changes were introduced.

Checks ran in immutable Node image `sha256:daf880f6655d0fdb5bd863f8a0407dcb93f57c2f530f3fa89dd573c36f60d3b0`, Node 20.20.2 / TypeScript 5.9.3 / Prisma 5.22.0 / Next 14.2.35. Project/dependencies were mounted read-only; generated Prisma files used tmpfs. PostgreSQL 15 was disposable, without published ports, persistent volumes or external network; the checks shared only its loopback namespace. All 23 existing migrations were applied exclusively to this empty fixture database. No installation ENV, customer systems or notification recipients were used.

| Check | Actual result |
|---|---|
| `test:fortianalyzer-profile` | PASS: 47 client/runtime scenarios plus 2 form scenarios; root/non-root/encoded ADOMs, both modes/aliases, real ADOM probe, denial/HTTP/malformed/deadline behavior, pooling, encrypted/redacted writes and retained edits, ADOM cache rotation, MITRE mismatch, FortiView failure/empty distinction, runner/cache/correlation/health targets and secret-safe rejection logs |
| `test:fortianalyzer-profile:db` | PASS: 5 real PostgreSQL scenarios; canonical encrypted writes, retained edits/redaction, disabled legacy-alias migration/idempotence, real profile resolution/probe, identical native IDs across ADOM revisions, firewall event row/count scope and wrong-key rejection |
| DB script without opt-in | Expected refusal, exit 1 before Prisma/DB I/O |
| `test:fortianalyzer-auth` | PASS: 45 scenarios; fixture now supplies actual scoped device reads and checks Bearer/no-session behavior |
| `test:fortianalyzer-cache` / `:db` | PASS: 35 offline and 4 PostgreSQL scenarios |
| `test:fortianalyzer-time` / `:db` | PASS: 62 offline and 11 PostgreSQL scenarios |
| `test:alarm-sources` / `test:alarm-dispatch` | PASS: 46 / 35 scenarios; synthetic source wire now handles ADOM verification separately from LogView responses |
| `test:alarm-health` | PASS: optional sources, failures, recovery and source-only checks; valid fixture profiles include username and health probe methods |
| `test:alarm-ownership` / `:db` | PASS: 25 offline and 16 PostgreSQL scenarios, including independent worker processes and late-write/notification fencing |
| `test:alarm-occurrences` / `:db` | PASS: 19 offline scenarios and PostgreSQL transaction/uniqueness/legacy/closed-incident checks with five concurrent deliveries; SMTP mocked |
| `test:credential-storage` | PASS: 47 scenarios |
| `test:integration-permissions` | PASS: 144 scenarios |
| `security:fortianalyzer-correlation-check` | PASS: exact device identity and event scope |
| Full `tsc --noEmit --incremental false` | PASS, exit 0 |
| Targeted ESLint | New profile/source helpers clean. Twelve changed TS/TSX files: 30 pre-existing messages before, 29 after (client 6, main route 23; MITRE unused import removed). Multiset comparison: zero new messages. Targeted lint still has existing debt; full-repository lint was not represented as passed. |
| Workflow/package inspection | PASS: parsed YAML and asserted new aliases, offline/form/DB CI steps, opt-in and path triggers; remote CI not triggered |
| Scoped `git diff --check` | PASS |

No live appliance/version compatibility claim, actual SMTP delivery, production build or visual browser verification is made. A production build was not run: the immutable test mount is read-only and build/startup lifecycle isolation was not established for this check. No installation migration, data repair, application/NMS restart, commit or push was performed.

Fixture cleanup was verified before shutdown: integration configs, cached events, alarm-check logs and alarm events each had zero remaining rows. The two B20 test containers were stopped after verification; installation and unrelated test containers were left running.
