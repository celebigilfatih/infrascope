# ADR-017: FortiGate Alarm Target Scope

**Status:** Accepted
**Date:** 2026-10-16
**Related:** ADR-005, ADR-008, ADR-010; audit B10

## Context

The connector factory requires explicit selection when several FortiGate integrations are enabled. The direct SSL-VPN alarm dispatcher still calls it without a selector. Its alarm-wide and per-user cooldown queries also have no firewall/VDOM scope, and user incidents can share notification cooldowns across targets.

## Decision

- Enumerate enabled FortiGate integration IDs once per alarm cycle, only when direct SSL-VPN rules are selected. Resolve each through the existing factory with an explicit `configId`; the saved VDOM (default `root`) defines that integration's alarm target. Do not discover all appliance VDOMs or infer additional targets from UI navigation.
- Pass each resolved connector explicitly to the existing SSL-VPN evaluator. Do not mutate a process-global current target or repeat NMS, VMware, FortiAnalyzer or notification-retry dispatch per firewall.
- Resolve connectors anew on subsequent cycles so saved credentials, host, VDOM and enabled-state changes use the factory's existing revision fencing. One target failure must remain visible without suppressing other targets.
- Carry safe target identifiers in evaluation results, runner errors and sample evidence. Never expose credentials or decrypted configuration.
- Scope direct SSL-VPN incident entities and cooldown queries to the target key and, for per-user rules, the username. Keep display usernames readable. The existing incident service and email delivery path own recording, replay deduplication and notification cooldowns.
- Identify active-session occurrences deterministically from target scope and stable session evidence, excluding changing duration/traffic counters. Include target context in notifications. Do not rewrite old unscoped incidents or let them suppress another target.
- Keep log-based FortiAnalyzer rules, their registry/cache paths, and the intentionally inactive direct-log/CMDB query exports unchanged.

## Consequences

Existing single-target installations are included without a selector change at their callers. Legacy configurations without a persistent firewall connector still use their saved VDOM. Alarm totals count target/rule evaluations; errors identify the failing target. A first check after upgrade may create a new scoped incident for a still-active legacy unscoped session; uncertain historical ownership is never guessed. No schema, dependency or scheduler changes are required. Live-device verification remains separate from isolated regression checks.

## Verification — 2026-10-16

Changes were verified on HEAD `816e6036fea121be4402fcdc81a68aaadda7331e` plus the pre-existing B01–B09/dashboard/incident working tree. Existing user changes were preserved; no commit, push or application restart was performed.

Offline Node checks used the installed immutable runtime with read-only source/dependency mounts:

```text
docker run --rm --network none --read-only --volumes-from infrascope-web-dev:ro --tmpfs /tmp -w /app --entrypoint node sha256:daf880f6655d0fdb5bd863f8a0407dcb93f57c2f530f3fa89dd573c36f60d3b0
```

The real target factory, REST client and engine run with synthetic ORM/transport/delivery boundaries. One case additionally runs the real email cooldown and HTML template with a fake SMTP transporter/attempt recorder. The real scheduler interval is invoked through a fake timer; no background application worker is started.

PostgreSQL checks used a new `postgres:15-alpine` container with networking disabled, no published port and only tmpfs database storage. Test runtimes shared that container's loopback network with an explicit fixture-only URL for `infrascope_b10_occurrence_tests`. All 21 existing migrations applied successfully to this disposable database; installation schema/data were never accessed or modified. Source configurations/transport and SMTP were still fixtures. Test cleanup left zero fixture rules, events and incidents. The disposable container was then removed.

| Check | Actual result |
|---|---|
| New `test:fortigate-alarm-targets` | PASS, 40 cases, exit 0. Two/three targets, same host/username, saved/default VDOM, linked inventory, per-target credentials, settings changes, disabled/deleted targets, real empty versus failed reads, failed persistence, scoped incidents/cooldowns, stable replay, independent notifications, manual POST and actual scheduler interval. The initial three tests failed against the pre-fix engine and passed after implementation. |
| New `test:fortigate-alarm-targets:db` | PASS, five cases, exit 0. Real PostgreSQL scoped relation filters, event/incident uniqueness, target/user and target-wide cooldowns, replay, new sessions, and five concurrent evaluations committing/notifying each target session once without error results. |
| `test:alarm-occurrences:db` | PASS, three cases, exit 0. Existing B01 transactions, closed incidents, legacy replay and five concurrent deliveries. |
| `tsc --noEmit --incremental false` | PASS, exit 0 on the final source. No TypeScript build cache written. |
| ESLint API comparison on engine, runner and new scope helper | Zero new diagnostics. Engine baseline 36 findings becomes 34 after removing the obsolete import and unsafe global injection; runner/helper have zero. This is not a clean full-repository lint claim. |
| `test:alarm-occurrences`, `test:alarm-sources`, `test:alarm-dispatch` | PASS, 19 / 46 / 35 cases, exit 0. Dispatch fixture now supplies explicit target enumeration and asserts the selected configuration; existing behavioral assertions retained. |
| `test:integration-permissions` | PASS, 144 cases, exit 0. |
| `test:fortianalyzer-auth`, `test:fortianalyzer-cache` | PASS, 45 / 34 cases, exit 0. |
| `test:vmware-cache`, `test:vmware-collection`, `test:zabbix-auth` | PASS, 52 / 65 / 79 cases, exit 0. |
| `test:alarm-health` | PASS, exit 0; historical failures and recovery remain distinct. |
| `security:fortigate-connector-check` | PASS, exit 0; existing static singleton/target/VDOM/Prisma/cache rules. |
| New script syntax, CI YAML/step/alias assertions, three negative DB guards | PASS, exit 0. Missing opt-in, installation DB name and remote host are rejected before creating a DB client. Hosted CI itself was not run. |
| Scoped diff whitespace and new-file/link checks | PASS. Existing Git LF/CRLF notices are not added-line whitespace failures. |

Compatibility suites ran as separate Node processes under the offline prefix. The real-DB suites replace only the incident/event persistence boundary, retain source/delivery fixtures, and require explicit opt-in. No live FortiGate/FortiAnalyzer, customer database or recipient was contacted. No full Next build, Python/NMS worker or live-device check was run: B10 changes only alarm target dispatch/identity/result propagation and uses strict TypeScript plus the affected runtime suites. This does not certify customer network/TLS/API-permission compatibility or resolve the remaining audit findings.
