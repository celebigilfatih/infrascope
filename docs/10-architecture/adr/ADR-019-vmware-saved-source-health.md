# ADR-019: VMware Health Uses the Saved Source

**Status:** Accepted
**Date:** 2026-10-16
**Related:** ADR-014, ADR-015; audit B12

## Context

The health route constructs a VMware client from `VMWARE_HOST/USERNAME/PASSWORD` while independently reading database sync metadata. This can probe one vCenter and report another profile's sync state, or ignore a configured source when ENV values are absent. The existing status client also creates sessions without a health-specific deadline/cleanup owner.

## Decision

- Share the enabled `VMWARE_VCENTER` database loader and saved-profile resolution across health, operational API and alarm initialization. Select deterministically by creation time then ID, retaining the existing first-enabled product model; this is not multi-vCenter aggregation.
- Use the saved host, exact credentials and connection profile. Never fall back to VMware ENV credentials. Keep the existing plaintext/profile format; credential-at-rest migration is separate B13 scope.
- Report last sync metadata from the same record used to build the probe. Expose only the configuration ID as target metadata, never host/user/password, session token or private cache identity. Missing/disabled configuration is unknown; store/configuration/probe failure is unhealthy.
- Resolve the saved profile on every health request. Do not cache health results or share a health-owned session with an operational client. Use the existing VMwareService and TLS policy, a five-second VMware branch deadline and an independent one-second cleanup budget.
- Pass cancellation through authentication/version reads, including body consumption, and check cancellation before issuing fallback/late I/O. A DB observer timeout cannot cancel an in-progress Prisma query, but its late result must not start a probe.
- Close the owned modern or legacy REST session on success/failure. A cleanup failure is visible and cannot leave a successful health result. Reuse the cleanup method for the existing connection test without changing its collection contract.
- Health remains a lightweight REST connectivity/version probe. It does not execute Python collectors, sync inventory, start a background worker or certify collector permissions. Existing B08 connection tests remain the stronger collection check.

## Consequences

Old ENV targets cannot override or activate a saved/disabled profile. Source failures retain existing overall-health aggregation semantics and sync history. Health clients are intentionally ephemeral owners of short-lived sessions; no new global session/cache system or alarm engine is introduced. The VMware branch is bounded independently of other datasource checks. A remote login accepted without returning a session token before cancellation cannot be reliably revoked and still relies on server expiry; no stronger guarantee is claimed.

## Verification — 2026-10-16

Verified against HEAD `816e6036fea121be4402fcdc81a68aaadda7331e` plus the existing B01–B11/dashboard/incident working tree. Existing user changes were preserved. No database/schema/dependency change, application restart, commit or push was performed.

Tests used the installed immutable runtime with read-only source/dependency mounts and no network access:

```text
docker run --rm --network none --read-only --volumes-from infrascope-web-dev:ro --tmpfs /tmp -w /app --entrypoint node sha256:daf880f6655d0fdb5bd863f8a0407dcb93f57c2f530f3fa89dd573c36f60d3b0
```

Initial sandbox access to the Docker pipe was denied. The same offline/read-only checks were then run with approved Docker access; the access error is not a TypeScript/lint failure. Tests load no application ENV file and replace ORM, source transport, other datasource probes and delivery. The new suite executes actual saved-source, VMware client, health route and API code, plus actual alarm initialization with its existing synthetic transport fixture. Timers are virtual; no real background job or remote session is created.

| Check | Actual result |
|---|---|
| New `test:vmware-health` | PASS, 54 scenarios, exit 0. The initial four cases failed before the fix. Covers absent ENV with configured DB, old ENV target/credentials, absent/disabled/invalid/changed profiles, deterministic selection, no fallback on selected-profile failure, exact request headers, saved sync metadata, API/alarm alignment, concurrent configuration changes, modern/legacy sessions, malformed auth/version replies, storage/transport errors, full fetch/body deadlines, late DB/source completion, primary+cleanup timeout, session cleanup failure, no collector/background side effects and public-result redaction. |
| `tsc --noEmit --incremental false` | PASS, exit 0 on the final production source; no build cache written. |
| ESLint API baseline comparison on health route, VMware route/service, alarm engine and both new helpers | Zero new diagnostics. Health route/new helpers zero; existing VMware route/service/engine findings remain 12 / 17 / 34. This is not a clean full-repository lint claim. |
| `test:vmware-cache`, `test:vmware-collection` | PASS, 52 / 65 cases, exit 0. Existing target/cache and B08 collection/test-session behavior retained. |
| `test:alarm-dispatch`, `test:alarm-health`, `test:alarm-occurrences`, `test:alarm-sources` | PASS, 35 / health suite / 19 / 46 cases, exit 0. Alarm-health fixtures now explicitly isolate the VMware datasource, rather than mutating the process's VMware ENV. Real VMware health has the new dedicated suite. The shared VM loader includes Node's URL global, and the dispatch fixture records its supplied connection profile; no behavioral assertions were removed. |
| `test:integration-permissions` | PASS, 144 cases, exit 0; existing route authorization retained. |
| `test:fortigate-alarm-targets`, `test:fortigate-snmp` | PASS, 40 / 55 cases, exit 0. |
| `test:fortianalyzer-auth`, `test:fortianalyzer-cache`, `test:zabbix-auth` | PASS, 45 / 34 / 79 cases, exit 0. |
| Script syntax, package alias, CI YAML/step/triggers, new-file whitespace, document links and static no-ENV-credential check | PASS, exit 0. Hosted CI itself was not run. |
| Scoped `git diff --check` | PASS. Existing Git LF/CRLF notices are not added-line whitespace failures. |

The compatibility suites ran in separate Node processes under the same offline prefix. A real-DB suite, full Next build, Python/NMS worker and live vCenter check were not run for B12: no schema/Python change is involved, and this fix is covered by strict TypeScript, actual source/route/client execution and explicit ORM-query predicates/order in isolated fixtures. The tests do not certify installed vCenter permissions, transport/TLS/network reachability, collector capability, multi-vCenter aggregation or B13 at-rest credential protection. The existing VMware service module's legacy Prisma arrangement is not refactored here; health performs no inventory queries or writes through it.
