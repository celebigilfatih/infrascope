# SSL-VPN session workspace

`/network/ssl-vpn` uses the shared Turkish heading, green icons, semantic badges, summary cards, filters, responsive records and accessible scrollable detail dialog. Explicit FortiGate configuration and VDOM selection keeps each session list scoped to its source. Search covers username, remote client address, every child address and interface; duration and two-factor filters apply before local ten-row paging and CSV export.

## Source and field meaning

The shared connector's `getSSLVPNWorkspace()` reads `/monitor/vpn/ssl` once per completed workspace collection and projects only allowlisted fields. Concurrent calls on the exact target-bound client share one active read and cookie authentication. The in-flight slot clears on success/failure; completed data is not cached and other targets remain independent. The legacy `getSSLVPNUsers()` contract and alarm consumers remain unchanged. The new screen does not join an independently sampled summary or use the legacy cached endpoint.

`remote_host` is the source/remote client address. Every subsession `aip` is shown separately as a tunnel/destination address; it is not substituted for the source. This distinction follows the [Fortinet SSL-VPN monitor](https://docs.fortinet.com/document/fortigate/7.6.0/administration-guide/28104/ssl-vpn-monitor) columns. No assumption is made that every address belongs to tunnel mode rather than a web-mode destination. The UI retains all subsessions in details and searches even addresses omitted from compact rows.

Each source connection record remains separate, including multiple records for the same username/client. Distinct user counts use exact returned names and become unknown if a name is missing. Record identities include a snapshot-local ordinal; details close on refresh rather than following an ambiguous record into a new snapshot.

Duration is a nonnegative safe integer in seconds, presented as full Turkish day/hour/minute/second units. Zero is real zero; missing/invalid duration is unknown. Positive Unix login timestamps are converted to ISO; screen dates use Europe/Istanbul and TSİ labels. Two-factor evidence requires a boolean: true, false and missing remain distinct; a missing value never means disabled.

All child `in_bytes` and `out_bytes` counters contribute to their respective session totals, then all session totals contribute to summary cards. Canonical decimal strings and BigInt sums preserve exact bytes beyond JavaScript's safe number range. Unsafe numbers, missing operands and empty/missing child lists leave session totals unknown; explicit zero stays zero. A successful empty top-level list has zero records/users/traffic, whereas a missing/malformed list fails. Binary units and exact byte details are cumulative source counters, not rates or an inferred time period. Incoming/outgoing labels do not claim client upload/download semantics.

## Read boundary and refresh

`GET /api/integrations/fortigate/ssl-vpn/workspace` requires the current ACTIVE actor's `firewall/read` permission and explicit configuration ID, VDOM and observed host. The shared connector resolves saved configuration, rejects disabled targets and checks host/VDOM before source reads. SNMP-only mode fails before REST/authentication. Responses are private/no-store, safe classified errors omit provider diagnostics, and the client validates scope, timestamp, identities and counter sums.

Manual refresh is the default, with optional 30/60-second renewal. Polling does not overlap requests and pauses while details are open. Abort and sequence guards ignore superseded reads; scope changes remount and clear old data/details. Failed same-scope refreshes retain clearly marked previous results without advancing their reading time. Connection-list failures also mark retained results as historical. There are no disconnects, counter resets, configuration changes or inventory writes.

CSV exports every filtered record, independent of the visible page. UTF-8 BOM, quoted semicolon-delimited cells, escaped quotes/newlines and formula prefixes protect spreadsheet consumption. The export includes exact bytes, missing-value labels, device/configuration/VDOM scope, explicitly UTC timestamps and historical-data status.

## Verification

`node scripts/check-sslvpn-workspace.cjs` runs the actual model, shared reader, connector factory and authorized route against isolated I/O. Coverage includes multiple sessions per user, all child counters, 79-digit aggregate precision, null/zero distinctions, source versus child addresses, strict two-factor evidence, dates/durations, CSV safety, scope/host/disabled/SNMP/permission guards, safe failures, legacy-reader compatibility and no persistence. Related FortiGate alarm-target (40), alarm-dispatch (35), SNMP (55) and IPsec checks protect shared behavior.

`tests/incident-e2e/sslvpn-workspace.spec.ts` exercises the actual page and protected API on a private PostgreSQL/browser network. Success responses use synthetic source transport while saved fixtures remain disabled. Coverage includes actual current-account roles/session guards, exact same-configuration VDOM selection, all filtered CSV records, formula escaping, source errors and wrong scopes, delayed scope transitions, disabled/empty targets, 30/60-second polling without overlapping reads or open-dialog refresh, and responsive keyboard details. No installation database or real appliance is used.

## Commit review — 19 October 2026

The candidate after 8178357ea44a074a0e0a1cfc83a1080d88cb10f6 passed 21/21 Chromium cases with zero retries, full non-incremental TypeScript, strict scoped ESLint and all shared static/model/database runner gates. Source errors, scopes, session access, all-filtered CSV, 30/60-second polling and responsive keyboard details are covered. Mobile dialog/title bounds are checked after completed animations and screenshot capture. Desktop and mobile light/dark/detail images were inspected.

Offline release quality/TLS/type/lint/compilation, 102/102 static pages and emitted local Inter validation passed on tree 6449feb912dc671db0911436783857c72ae9240f. Final runner tree b6d1d991ad49980eba9c2c52f5b2e53727262c62 has identical application source; only browser expectations/animation checks and documentation differ. Concurrent cold-cookie reads failed before the client-local in-flight fix (two logins) and pass afterward. Completed reads are not cached, failures release the slot, and targets stay independent.

Evidence: output/sslvpn-review-20261019/verification.json, runner.log, build.log, unit-before.log and final/incident-regression/report/index.html. Initial failed test expectations and the passing intermediate run are preserved separately. Four existing unrelated lint warnings remain. No customer appliance, installation database, dependencies, schema, recipients or tunnel mutations were involved. Signed-cookie fixtures do not populate the header's local sign-in presentation. No live-firmware, complete browser-suite, remote CI or deployment claim.

An extra capture-only visual probe was not completed after Docker became unavailable. The final 21-case suite passed before this interruption, including live post-animation dialog/title bounds; the viewport screenshot offset remains a capture observation, not a reproduced application defect. Owned container cleanup is pending Docker availability.
