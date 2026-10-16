# FortiAnalyzer event time and UTC cache recovery

## Contract

See [ADR-025](../10-architecture/adr/ADR-025-fortianalyzer-event-time-utc.md). Cache collection, dedicated/generic live queries, correlation and alarm occurrence timestamps use `lib/alarms/fortianalyzer-event-time.ts`.

- Valid native `eventtime` takes precedence over `itime_t`, then `itime`, then `date` + `time`.
- Epochs use contemporary second/millisecond/microsecond/nanosecond magnitudes; `tz` never adjusts an epoch. Sub-millisecond digits remain in raw evidence/identity even though database date comparisons use milliseconds.
- Text with an inline offset uses that offset. Otherwise apply the separate numeric `tz`. Without either, the compatibility policy is UTC, independent of operating-system timezone. Unrecognized timezone names and invalid calendars are rejected unless another valid source field exists.
- UTC range bounds are inclusive. Future and expired records cannot enter a live window simply because their timestamp was unrecognized.
- `SOURCE_EVENT_TIME_INVALID` means no valid source timestamp exists. Affected collection coverage becomes unavailable rather than successful empty data; recovery requires a completed valid collection. Do not mask this error or substitute collection time.

## Upgrade behavior

No schema or dependency change is required. On the next application deployment/reload, the timestamp policy changes the cache runtime revision, retiring previous collectors. Only cache rows carrying the current internal time-policy version can satisfy reads. Normal collection repopulates the derived cache with corrected UTC dates and establishes freshness only after successful searches/writes. Until then, the existing matching live fallback or explicit source error applies.

Do not rewrite historical alarm occurrences, occurrence IDs or audit evidence. Recollection may reveal a recent occurrence previously excluded by the wrong timezone; the existing deduplication, cooldown and notification policy still applies. A historical backfill requires a separate delivery decision. Existing wrong-time cache rows remain excluded and age out under ordinary retention; no installation-wide data repair is run by this change.

## Diagnose

1. Inspect sanitized source-check outcomes for `SOURCE_EVENT_TIME_INVALID` and the affected logtype. Keep customer payloads/credentials out of reports and public logs.
2. Compare a privately retained timestamp shape with the contract above. For example `itime=2026-10-15 12:00:00`, `tz=+0300` means `2026-10-15T09:00:00.000Z`; an epoch for 09:00Z also means 09:00Z regardless of `tz`.
3. If native `eventtime` and receipt time disagree, the native occurrence time determines the alarm window. Verify source clock synchronization and format. Do not compensate by changing host timezone or hardcoding a customer offset.
4. After correcting source format, confirm a completed refresh, fresh logtype coverage and matching cache/live UTC windows. A malformed/incomplete search cannot establish freshness.

## Safe verification

`npm run test:fortianalyzer-time` uses synthetic transport, in-memory persistence and notifications that reject sending. Run under both `TZ=UTC` and `TZ=Europe/Istanbul`; CI includes both. `npm run test:fortianalyzer-time:db` refuses to run unless `INFRASCOPE_FA_TIME_DB_TEST=1` and the explicit PostgreSQL URL points to `127.0.0.1` with a dedicated `*_occurrence_tests` database. Supply a disposable DB, never the installation DB.

The DB suite tests real Prisma timestamp persistence, range/order queries, cache-version exclusion/recollection, text-time keys, invalid-batch rejection and UTC retention boundaries. Existing occurrence, source-failure, dispatch and FA cache regressions cover compatible surrounding behavior. No live customer connection is required.

## B18 verification record — 2026-10-16

Base commit: `816e6036fea121be4402fcdc81a68aaadda7331e`, with preserved uncommitted B01–B17 and concurrent UI/incident/localization work. The pre-B18 cache source was captured before editing; running that actual parser reproduced 12:00Z for the +0300 example, while the new parser returned 09:00Z.

Tests use the existing immutable Node runtime `sha256:daf880f6655d0fdb5bd863f8a0407dcb93f57c2f530f3fa89dd573c36f60d3b0`, read-only project/dependency mounts, tmpfs-generated Prisma client and a disposable `postgres:15-alpine` container with no published ports, outbound network or persistent volumes. Only its loopback namespace is shared with the checks container. All 23 existing migrations were applied exclusively to that empty fixture database. No installation migration or live source/SMTP operation is involved.

| Check | Actual result |
|---|---|
| `test:fortianalyzer-time`, `TZ=UTC` | PASS, 62 scenarios, exit 0 |
| `test:fortianalyzer-time`, `TZ=Europe/Istanbul` | PASS, same 62 scenarios, exit 0 |
| `test:fortianalyzer-time:db` with guarded fixture URL/opt-in | PASS, 11 real PostgreSQL persistence/range/order/retention/transition scenarios, exit 0; owned rows removed in `finally` |
| DB suite without opt-in | Expected refusal, exit 1 before Prisma construction or DB I/O |
| `test:fortianalyzer-cache` | PASS, 34 lifecycle/rotation/cancellation/HTTP fallback scenarios |
| `test:fortianalyzer-cache:db` | PASS, 4 PostgreSQL provenance/uniqueness/specialized-query scenarios |
| `test:alarm-occurrences` | PASS, 19 identity/recording/notification scenarios |
| `test:alarm-occurrences:db` | PASS, real transaction/uniqueness/legacy/closed-incident checks, including five concurrent deliveries; SMTP mocked |
| `test:alarm-sources` | PASS, 46 failure/freshness/runner/health scenarios |
| `test:alarm-dispatch` | PASS, 35 independent-source scenarios |
| `test:alarm-health` | PASS, recovery and retained failure history |
| Full TypeScript `tsc --noEmit --incremental false` | PASS with isolated generated Prisma client, exit 0 |
| Targeted ESLint | New normalizer, base query and revision helper clean. Captured starting sources: engine 34 → 34, cache 8 → 7, base/revision 0 → 0, with no added diagnostic category/message. The specialized config query retains its 2 pre-existing `any` diagnostics; full targeted lint still exits 1 for existing debt. |
| CI YAML/package inspection | PASS, parsed workflow and asserted both timezone runs, DB opt-in, aliases and path triggers; remote CI not triggered |
| Scoped `git diff --check` | PASS after removing an added trailing blank line |

The saved pre-B18 reproduction is an expected negative control, not a passing claim about old behavior. Full Next build and full-repository lint were not run: this change is validated through isolated source/query/engine/DB suites and TypeScript; repository-wide lint debt remains. Live customer timezone formats, source connectivity and SMTP delivery were not exercised. No schema/dependency change, installation data rewrite, application/NMS restart, commit or push is performed. Disposable test containers are removed after verification.
