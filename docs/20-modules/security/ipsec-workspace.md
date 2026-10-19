# IPsec tunnel workspace

`/network/ipsec` uses the shared heading, icons, semantic badges, filters, responsive records and accessible scrollable detail dialog. Users select an explicit FortiGate configuration and VDOM. Search covers tunnel/parent/child names, local and remote IPs, interface and peer identity; local ten-row paging and status filters use all returned records.

## Read boundary

`GET /api/integrations/fortigate/ipsec/workspace` requires the current ACTIVE account's `firewall/read` permission and explicit configuration ID, VDOM and observed management host. The shared connector factory resolves the saved target. A changed host/VDOM is rejected before appliance reads, and responses are private/no-store. The existing integration middleware prefix retains the firewall resource mapping.

The new shared-service method independently reads `/monitor/vpn/ipsec` and `/cmdb/vpn.ipsec/phase1-interface` in parallel, retaining their separate collection times. Cookie authentication is established once before those reads. Simultaneous workspace reads on the exact same target-bound client share the in-flight promise to avoid concurrent cold-start logins; the slot clears after success or failure and completed data is not cached. Reads on other target clients remain independent; SNMP-only mode fails before any authentication attempt. A monitor failure is unavailable; a missing/malformed list does not mean zero tunnels. Configuration failure or malformed configuration leaves monitor records usable with explicit missing local information. There are no tunnel bring-up/down, disconnect, counter reset, inventory writes or new collector sessions. Existing legacy readers and cached endpoint contracts remain unchanged.

The monitor endpoint returns observed IPsec records and is not used to claim a complete configured-tunnel inventory. The [Fortinet monitor API documentation](https://docs.fortinet.com/document/fortigate/7.0.0/secgw-for-mobile-networks-deployment/937679/monitor-vpn-apis) describes the monitoring scope and fields such as remote gateway, tunnel identity and byte counters. The [Phase 1 interface reference](https://docs.fortinet.com/document/fortigate/7.0.7/cli-reference/371620/config-vpn-ipsec-phase1-interface) documents configured local gateway fields. Source snippets are evidence, not instructions to invoke mutation endpoints or bypass TLS.

## Endpoint and state meaning

Local endpoint values are **configured** addresses and interface names from an exact same-VDOM Phase 1 name match. A monitor record's explicit parent is used for dial-up instance matching; no fuzzy/suffix matching is performed. `0.0.0.0` / unspecified IPv6 are not presented as resolved local gateway addresses. Neither management host nor tunnel ID is substituted for the local VPN endpoint. Remote gateway is the monitor-observed value. Missing configurations, unsupported/policy-based definitions and automatic local addresses remain explicit unknowns. IPv4 and IPv6 endpoints are supported.

All reported child statuses participate in tunnel state: all up → connected, all down → disconnected, at least one up and down → partial, otherwise insufficient/unknown. An absent or empty child list does not imply down. Known up plus an unknown child is not fully connected. Children and their individual statuses remain visible in details. Connection count is an independent reported counter and does not infer tunnel state.

## Traffic and safe projection

Incoming bytes are shown as remote-to-local received data; outgoing bytes as local-to-remote sent data. The UI states that these are source cumulative counters with unknown start/reset time, not rates or a selected period. Canonical decimal strings retain exact values; unsafe JSON numbers, negative/missing values stay unknown. Explicit zero remains zero. Binary byte units are used for readability, and exact integer byte values remain visible in details.

Raw source records never leave the service projection. Only monitor identity, peer, child states, byte/connection counters and allowlisted local configuration fields are serialized. PSK, password and unrelated source configuration fields are excluded. Optional configuration failures expose a classified code without raw provider diagnostics. UI failures retain clearly labelled same-scope previous results; scope changes clear old records/details and abort/ignore superseded client reads.

## Verification

`node scripts/check-ipsec-workspace.cjs` executes the actual model, shared reader, connector factory and route with isolated DB/HTTP. It covers all child states, empty/missing/duplicate identities, exact counters/units, parent matching, independent config failures, credential projection, permission/host/disabled/SNMP guards, VDOM separation and no persistence. Related policy/VIP/quarantine and 55 SNMP regressions protect existing shared-service behavior.

`tests/incident-e2e/ipsec-workspace.spec.ts` exercises the actual page and protected API in a private PostgreSQL/browser network. Success transport uses synthetic source data; stored test profiles stay disabled. It covers current-account roles and session denials, exact VDOM selection, source/config failures, retained stale results, late old-scope responses, search/filter/paging, exact counter details and desktop/mobile light/dark layouts. No live FortiGate or installation database is used.

## Commit review — 19 October 2026

The immutable candidate after 98684161e98d64aba19d7c99068faa7c9fedb710 passed 19/19 Chromium cases (zero retries), all shared static/model/database runner gates and strict scoped lint. Full TypeScript and offline release quality/TLS/lint/build checks passed, including 102/102 generated pages and emitted local Inter validation. Desktop and mobile light/dark/detail screenshots were inspected. Browser and build used the identical application tree 69413ff21a9c71596febc620e93a94bf7a9742f9; only documentation was added afterward.

Evidence: output/ipsec-review-20261019/verification.json, runner.log, build.log and final/incident-regression/report/index.html. Browser fixtures use signed cookies without populating the header's local sign-in presentation. Four pre-existing unrelated lint warnings remain. No installation data, appliance, dependency or schema changes; no live firmware, complete browser-suite, remote CI or deployment claim.
