# Risky policy review workspace

`/security/risks` uses the common Turkish workspace: shared heading/icons, semantic severity and definition-state badges, source selector, summaries, search/filters, responsive records and an accessible scrollable detail dialog. Each policy appears once with all matching reasons. The row's level is its highest finding level. Multiple findings never inflate policy counts; total finding count is separately labelled.

## Source and read boundary

The screen reuses `GET /api/firewall-policies/workspace`, the strict shared FortiGate connector and `parsePolicySnapshot`. The current ACTIVE actor needs `firewall/read`. Configuration ID, VDOM and observed host are explicit, disabled targets never read, changed hosts are rejected, and module/SNMP-only restrictions remain intact. The private/no-store snapshot contains policy definitions and a reading time. No server-to-server call to the legacy cache endpoint, new collector/client, inventory write, policy change or risk persistence is added. The legacy risky-rules endpoint/analyzer contracts are unchanged; this screen no longer consumes their unscoped result.

Policy fields, reasons and detail evidence all derive from the same validated snapshot. Missing, malformed or wrong-scope responses are unavailable rather than a successful zero-risk list. Same-scope refresh errors retain clearly marked previous results and their original reading time. Device/VDOM/host changes remount the view, clear old details and cancel/ignore superseded reads. Dates use Europe/Istanbul with TSİ labels; the snapshot timestamp is not a risk creation date.

## Review meaning

`lib/security/risky-rules.ts` applies three deterministic, local review checks to normalized definitions. These are review priorities, not appliance-reported severity, vulnerabilities, a complete security audit or proof of effective connectivity. The screen states these limits and exposes each check's evidence, limits and suggested review in Turkish.

| Check | Level | Matching evidence | Limits |
|---|---|---|---|
| Broad permission | Critical | Action `accept`, explicit source and destination object `all`, service `ALL`, all three address/service negation flags explicitly disabled | Only exact reserved names match. Negated wildcards do not match; missing/invalid negation evidence makes an otherwise matching broad-permission check unknown. Named groups/custom `any` are not expanded. Interfaces, schedule, order and other controls can limit effective reachability. |
| External-to-internal candidate | High | Action `accept`, an interface named WAN/Internet/External to LAN/Internal/DMZ | A bounded name pattern identifies candidates only. Actual interface roles, routing and Internet reachability must be verified. All reported interfaces participate. |
| Zero hit counter | Low | Explicit canonical hit count `0` | Missing/unsafe counters never match. Counter interval/reset time is unknown, so zero does not prove an unused rule. No age or removal conclusion is invented. |

The preceding legacy analyzer used the same three review intentions, but accepted arbitrary case-insensitive `any` object names as unrestricted, defaulted missing counters to zero and inferred exposure from arbitrary interface-name substrings. This workspace uses the normalized policy evidence and labels the interface check as an inference. It does not change alarm definitions, severities or dispatch.

Each control reports matched, not matched, or insufficient evidence. Missing action, required lists/counters or unrecognized actions produce unknown control outcomes; empty lists never mean all. Missing rule enablement is also labelled. A coverage count shows policies with unknown checks/state, even if they have no matching finding. A clean result only means these checks found no match, not that the firewall is secure.

Enabled, disabled and unknown-state definitions remain separate from severity and configured action. Disabled definitions can retain review findings, with an explicit detail note that they do not establish current traffic. Neither destination object counts nor fixed team names become invented affected-asset counts/owners.

## Interaction and verification

All levels, including low, are visible by default. Filters select the highest row severity, any individual matching reason, and definition state. Search covers all names/addresses/services (including compacted items), rule ID, comments and Turkish reason labels. Filters run locally without appliance reads. Sorting uses highest severity, then source list position; policy ID is not priority. Paging shows ten policies, and empty filtered results are distinct from source-empty, no-match and read-error states. The detail dialog contains all reasons and review suggestions, complete source/target/service definitions, metadata and all three control outcomes.

`node scripts/check-risky-rules-workspace.cjs` exercises the actual review model, normalized policy reader, shared factory and authorized route with isolated I/O. It covers policy/finding counts, multi-reason severity and sorting, disabled/unknown states, exact reserved names, conservative name matching, null/zero/large counters, all-reason/Turkish/full-list filters, scope/host/module/SNMP/permission guards, safe errors and no writes. `check-security-policies.cjs` protects the reused source contract; TypeScript and scoped ESLint also run.

`tests/incident-e2e/risky-rules-workspace.spec.ts` exercises the actual component and protected policy API in a private PostgreSQL/browser network. Successful source transport is synthetic and saved profiles remain disabled. Checks cover grouped policies/findings, source order within severity, all-reason and full-field filters, disabled/unknown/negated evidence, exact counters, separate no-match/insufficient/empty/unavailable states, labeled old results, current-account roles, stale host/VDOM replies, keyboard details and 390px light/dark layout. Screenshot capture waits for background scrolling to settle. No customer appliance or installation database is used.

## Negation evidence

The shared source projects srcaddr-negate, dstaddr-negate and service-negate without changing existing alarm/VIP readers. The normalized snapshot carries optional nullable boolean flags; missing older payload fields remain unknown, and malformed present fields are rejected. Risk details show each flag. A broad wildcard check requires all three explicitly false; any true flag excludes this check and an unknown flag prevents a definite match. Other check outcomes remain independent. This follows the [FortiOS policy reference](https://docs.fortinet.com/document/fortigate/7.0.7/cli-reference/325620/config-firewall-policy); the view still does not infer effective reachability or expand address/service groups.

## Commit review — 19 October 2026

Candidate after 374a764624d7a4b154e097c93543c5feaa5c9b46 passed 19/19 Chromium cases (zero retries), full non-incremental TypeScript, strict scoped ESLint and shared static/model/database gates. Shared source gates and offline release used tree 2e1e14cf94ce423f718d0991a0594d75ebf3d828; the final browser/type/lint/model run used f20ec998690121054a4c3042d77406cfa5722142. Application source is identical; only the corrected browser selector and module documentation differ. Release quality/TLS/type/lint/compilation, 102/102 static pages and emitted local Inter validation passed without network access. Desktop and stable-scroll mobile light/dark/detail screenshots were inspected.

The negated-wildcard regression failed before the fix (match instead of no-match) and passes afterward. It covers all three raw flags, missing/null/invalid evidence, actual shared reader projection and strict parser rejection. Existing Security Policies, VIP, quarantine, IPsec/SSL-VPN and legacy alarm paths remain protected. No dependencies, schema, installation data, customer source systems or recipients were changed; four existing unrelated lint warnings remain. Only the focused browser suite is claimed, with synthetic successful source transport and real local account/target guards in private PostgreSQL. Evidence: output/risks-review-20261019/verification.json, runner.log, build.log, unit-before.log and final/incident-regression/report/index.html.
