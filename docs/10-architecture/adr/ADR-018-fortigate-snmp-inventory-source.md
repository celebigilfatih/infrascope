# ADR-018: FortiGate SNMP Inventory Source

**Status:** Accepted
**Date:** 2026-10-16
**Related:** ADR-005, ADR-009, ADR-017; audit B11

## Context

The legacy FortiGate SNMP client uses HTTP on port 161 instead of SNMP, its walk and interface methods return constant empty arrays, and `both` mode silently uses REST interfaces. NMS already collects device interface observations and the firewall module reads them with explicit availability/freshness. A second SNMP implementation is not appropriate.

## Decision

- Remove the unused pseudo-SNMP transport and route `snmp`/`both` interface inventory through the existing firewall/NMS read boundary. Do not create a new collector, call customer devices during tests, or copy legacy SNMP credentials to another profile.
- Require an enabled, explicitly linked firewall integration/device and the same management host/NMS device mapping. NMS device polling/credentials remain authoritative. Legacy `FortiGateConfig.snmp` fields do not verify or override them. Unsaved/unlinked profiles report unavailable rather than choosing another device.
- NMS interface rows do not include VDOM membership. Only device-wide inventory through a `root` connector is supported; non-root VDOM projection is explicitly unsupported. Never label a physical table as a specific VDOM's interfaces.
- Read a bounded complete snapshot with one table query, require polling configuration and fresh observations for every row, and reject absent, stale, future, inconsistent or malformed data before inventory writes. There is no completed-empty poll marker, so an empty NMS table cannot establish a successful empty source. Existing paginated UI stale-read behavior remains unchanged.
- Preserve available name/state/speed/MTU/counters and collection time. Uncollected IP/netmask, parent, type and duplex remain null. Do not invent Ethernet, link down, MTU 1500, IPs or health values in the adapter. Inventory uses explicit UNKNOWN/OTHER when its schema requires an enum, and preserves existing IP/type metadata on updates.
- `rest` retains REST interfaces. `both` uses NMS interfaces plus enabled REST modules, with no silent fallback. SNMP-only sync supports interfaces; enabling REST-only modules reports unsupported instead of calling REST and claiming a full SNMP sync.
- Collect interfaces before creating inventory records. NMS writes keep the validated device ID; a deleted device must fail its foreign key rather than being recreated under a guessed target. A failed source produces `success: false`; item write errors must not produce success. The API records failed sync consistently and carries source/collection metadata. No rows are deleted on an unsuccessful read.
- NMS current-state rows may also be produced by its existing SSH fallback and contain no transport provenance. Expose this path as stored NMS observations, not proof of a new SNMP handshake or the entered legacy credentials. Per-transport provenance requires separate model/collector work.

## Consequences

Existing genuine NMS observations become usable by the legacy sync path. Configurations lacking a linked polled device or supported scope fail explicitly and need configuration rather than synthetic data. SNMP v2c/v3 and polling still belong to the existing NMS collector. No new dependency, database migration, background job, alternate alarm engine or direct SNMP transport is introduced. Real-device compatibility is separate from isolated source and persistence regression evidence.

The source table does not retain per-field sampling provenance. Historical NMS defaults cannot be distinguished retroactively from measured values; the adapter preserves stored source values and does not certify a new SNMP exchange. The existing paginated UI reader keeps its prior stale-data envelope behavior. The strict inventory snapshot does not reuse that UI availability decision for mixed-age rows.

## Verification — 2026-10-16

Verified on HEAD `816e6036fea121be4402fcdc81a68aaadda7331e` plus the pre-existing B01–B10/dashboard/incident working tree. User changes were preserved. No commit, push or application restart was performed.

Node checks used the existing immutable runtime and read-only source/dependency mounts, without app ENV loading:

```text
docker run --rm --network none --read-only --volumes-from infrascope-web-dev:ro --tmpfs /tmp -w /app --entrypoint node sha256:daf880f6655d0fdb5bd863f8a0407dcb93f57c2f530f3fa89dd573c36f60d3b0
```

The new real-DB suite used a fresh `postgres:15-alpine` container with networking disabled, no published port and tmpfs-only storage. Test runtimes shared only its loopback network, with an explicit fixture URL for `infrascope_b11_occurrence_tests` and opt-in flags. All 21 existing migrations applied to this disposable DB. Real synthetic Device/IntegrationConfig/FirewallConnector/NmsInterface rows were read through the real factory and adapter and written to NetworkInterface; no customer row or configuration was read. Cleanup left zero fixture devices, configurations, observations, inventory rows or alarm events. The test container was removed.

| Check | Actual result |
|---|---|
| New `test:fortigate-snmp` | PASS, 55 cases, exit 0. The first five tests failed against the pre-fix code. A later deletion-race test also exposed target recreation and passed after keeping the validated device ID. Coverage includes actual source adapter/reader and API, REST/snmp/both, complete reads beyond UI pagination, source/target/configuration/permission errors, v2c/v3 profile presence, freshness, mixed-age/future/malformed/duplicate/oversized data, nullable fields, exact counters, inventory preservation, write failures, source/time metadata and unchanged labelled-stale UI reads. ORM/source transport are synthetic. |
| New `test:fortigate-snmp:db` | PASS, six cases, exit 0. Actual PostgreSQL NMS values and subsequent updates reach the adapter; scoped rows persist correctly, shared port names stay on their devices, stale/ambiguous data cannot create or erase inventory, and 202 interfaces sync beyond the ordinary UI page size. |
| `test:fortigate-alarm-targets:db` | PASS, five cases, exit 0. Existing target/incident/cooldown relations and concurrent recording remain valid with the changed service imports. Source and delivery remain synthetic. |
| `tsc --noEmit --incremental false` | PASS, exit 0 after source changes; no build cache written. |
| ESLint API baseline comparison on service, NMS reader, API and new adapter | Zero new diagnostics. FortiGate service 16 to 14 existing findings; API six existing findings; NMS reader/new adapter zero. Full-repository lint is not claimed clean. |
| `test:fortigate-alarm-targets`, `test:alarm-occurrences`, `test:alarm-sources`, `test:alarm-dispatch` | PASS, 40 / 19 / 46 / 35 cases, exit 0. |
| `test:integration-permissions` | PASS, 144 cases, exit 0. |
| `test:fortianalyzer-auth`, `test:fortianalyzer-cache` | PASS, 45 / 34 cases, exit 0. |
| `test:vmware-cache`, `test:vmware-collection`, `test:zabbix-auth` | PASS, 52 / 65 / 79 cases, exit 0. |
| `test:alarm-health` | PASS, exit 0; existing error history/recovery semantics retained. |
| `security:fortigate-connector-check`, `security:firewall-error-check`, `security:credentials-check`, `security:firewall-read-check` | PASS, exit 0; static connector/envelope and pure classifier/encryption regressions. |
| `security:fortinet-snmp-check` | PASS, exit 0. Existing Python OID, SNMP parameter/credential, scope and freshness checks under immutable NMS runtime `sha256:5988de67d062aaee6518aad61989d26241c21372f86359f9f75ebe75be1e295b`, with network disabled and writes restricted to tmpfs. No SNMP device request was made. |
| New script syntax, CI YAML/steps/aliases and three negative DB guards | PASS, exit 0. Missing opt-in, installation DB name and remote host are rejected before a Prisma client is created. Hosted CI itself was not run. |
| Scoped diff/new-file whitespace and documentation links | PASS. Git LF/CRLF notices are not added-line whitespace failures. |

The full Next build and full NMS worker were not run: B11 changes an application-side source adapter and inventory contract, with strict TypeScript, real PostgreSQL and the affected behavioral suites providing the local evidence. No installed customer device, installation database or SMTP recipient was contacted. The tests do not establish customer-specific SNMP permissions, transport provenance, TLS/network reachability, VDOM membership or the completeness of a previous physical poll. Those require their own source evidence and must not be represented as successful live verification.
