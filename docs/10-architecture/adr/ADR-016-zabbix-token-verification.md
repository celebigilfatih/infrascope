# ADR-016: Zabbix Token Verification

**Status:** Accepted  
**Date:** 2026-10-16  
**Scope:** Audit B09; token-only test/status/sync authentication.

## Decision

The existing Zabbix configuration has an API token, not username/password session credentials. Remove the unsupported URL-derived, passwordless login attempt. Never call user.login, user.logout or token-revocation methods in this token-owned-by-operator path. A missing token fails before source access.

Discover the API version with an unauthenticated apiinfo.version request, then validate the configured token through a bounded host.get read (hostid only, limit one). A successful version lookup alone cannot establish authentication. An explicitly successful empty host list is valid: visibility may legitimately be empty while the method is authorized. Source errors or malformed responses are failures, not successful absence.

Use JSON-RPC auth for token-capable releases before 6.4 and Authorization: Bearer for 6.4 and later. Do not send both, attach credentials to version discovery, or retry rejected tokens using a password login or another authentication encoding. Per-instance immutable configuration, request IDs and bounded fetch/body parsing prevent state/response confusion. Repeated authentication revalidates the token; simultaneous verification on one instance shares one attempt. Failed verification clears usable authentication state.

Keep getStatus connected/version/error and sync result contracts, adding safe error codes to status. Preserve existing B04 resource/action permissions. Remote errors and tokens must not be included in logs, errors or sync history. No new password mode, client singleton redesign, credential-storage migration, schema change or inventory mapping redesign is introduced.

The immediate post-verification host inventory read must also use the documented query shape: selectInventory is a query (`extend`), and host.get has no selectHosts subselect. Correct those two arguments without changing mapping or persistence. A dedicated regression must reject the old boolean/unsupported-subselect request.

## Primary Protocol References

- [Zabbix 5.4 Token API](https://www.zabbix.com/documentation/5.4/manual/api/reference/token) and [6.0 API](https://www.zabbix.com/documentation/6.0/en/manual/api): configured API tokens and JSON-RPC auth.
- [Zabbix 6.4 API](https://www.zabbix.com/documentation/6.4/en/manual/api): Bearer authorization; auth property deprecated.
- [Zabbix 7.2 changes](https://www.zabbix.com/documentation/7.2/en/manual/api/changes): auth property removed.
- [apiinfo.version](https://www.zabbix.com/documentation/7.2/en/manual/api/reference/apiinfo/version): unauthenticated discovery.
- [host.get](https://www.zabbix.com/documentation/7.2/en/manual/api/reference/host/get): read access can be restricted by role; version visibility is not token validity.
- [Query type](https://www.zabbix.com/documentation/7.2/en/manual/api/reference_commentary): inventory selection uses a property list or `extend`, not boolean true.

Protocol fixtures exercise these versions; they are not a live-server compatibility certification or a recommendation to deploy unsupported releases.

## Validation

Reproduce the current failure with the real service and a fixture that rejects user.login but accepts its valid configured token. Then cover invalid/expired tokens, method permission denial, real empty reads, malformed/error responses, timeouts, concurrent/repeated authentication, token rotation/profile isolation, API authorization and actual sync persistence using a fake ORM. Loopback-only JSON-RPC fixtures exercise real fetch serialization for both transports without customer credentials or database writes. Record executed results after verification.

### Executed Verification (2026-10-16)

Base commit: `816e6036fea121be4402fcdc81a68aaadda7331e`. Existing uncommitted B01–B08, dashboard and incident work was preserved. The only B09 production implementation edit is `lib/integrations/zabbix.ts`; the existing Zabbix route/authorization code was not changed. Package/workflow edits only add regression execution, not dependency versions. No schema or database changes were made.

Before the fix, the real service failed a valid-token reproduction (`false !== true`) because the source fixture rejected passwordless user.login before the configured token was selected. The final suite verifies that discovery is anonymous, the protected read carries the configured token in exactly one version-appropriate location, and no login/logout/revocation request occurs. A second red test confirmed the existing host-read query used boolean inventory selection; the corrected query now passes the protocol control.

Isolated Node prefix:

```text
docker run --rm --network none --read-only --volumes-from infrascope-web-dev:ro --tmpfs /tmp -w /app --entrypoint node sha256:daf880f6655d0fdb5bd863f8a0407dcb93f57c2f530f3fa89dd573c36f60d3b0
```

Source and installed dependency mounts were read-only. The real service/routes use fixture ORM/source replacements; the real HTTP checks bind only to container loopback. No app environment file, customer token, live Zabbix, customer database or notification recipient was used. The disposable host-side lint baseline file was removed after comparison.

| Check | Actual result |
|---|---|
| Prefix + `scripts/check-zabbix-auth.cjs` (`npm run test:zabbix-auth`) | PASS, 79 scenarios, exit 0. Version fixtures 5.4/6.0/6.2/6.4/7.0/7.2/7.4, valid/invalid/expired/blank tokens, anonymous discovery, one protected probe, real empty success, permission/HTTP/RPC failures, malformed envelopes/version/probe data, fetch/body deadlines and abort, concurrent/repeated verification, profile isolation, endpoint normalization, source-error redaction, all inventory readers, fake-ORM persistence and existing API roles. Real loopback JSON-RPC servers validate both accepted and rejected tokens on 6.0/6.4/7.2 protocol fixtures. |
| Prefix + `node_modules/typescript/bin/tsc --noEmit --incremental false` | PASS, exit 0 on final implementation. |
| ESLint JS API before/after severity/rule/message comparison on `lib/integrations/zabbix.ts` | Zero new diagnostics; the same one pre-existing finding remains. This is not a claim of clean full-repository lint. |
| Prefix + `scripts/check-integration-permissions.cjs` | PASS, 144 scenarios, exit 0; existing real authorization boundaries preserved. |
| Prefix + `scripts/check-alarm-dispatch.cjs` | PASS, 35 scenarios, exit 0. |
| Prefix + `scripts/check-alarm-sources.cjs` | PASS, 46 scenarios, exit 0. |
| Prefix + `scripts/check-alarm-occurrences.cjs` | PASS, 19 scenarios, exit 0. |
| Prefix + `scripts/check-fortianalyzer-auth.cjs` | PASS, 45 scenarios, exit 0. |
| Prefix + `scripts/check-fortianalyzer-cache.cjs` | PASS, 34 scenarios, exit 0. |
| Prefix + `scripts/check-vmware-cache.cjs` | PASS, 52 scenarios, exit 0. |
| Prefix + `scripts/check-vmware-collection.cjs` | PASS, 65 scenarios, exit 0. |
| Prefix + `scripts/check-alarm-health.cjs` | PASS, exit 0. |
| Workflow parsed with installed `js-yaml`; source/test triggers and `test:zabbix-auth` step asserted | PASS, exit 0. Hosted CI itself was not run. |
| Scoped `git diff --check` plus new regression-script whitespace/syntax and document-link checks | PASS, exit 0; unchanged legacy source spacing and the pre-existing package LF/CRLF notice are not added-line whitespace failures. |

Scripts in the compatibility batch were launched with `spawnSync(process.execPath, ['scripts/<name>'])` under the prefix above, recording their actual exit status. B08 Python, real-DB, full Next build and full-repository lint checks were not repeated: B09 changes no Python/runtime/schema code, and scope validation used strict TypeScript plus the affected behavioral suites. No process restart, commit or push was performed.

### Limits

The local server is a protocol fixture, not an installed Zabbix release. Customer-specific TLS, reverse-proxy header forwarding and token/role policy still need the customer's real endpoint to pass the same authorized read. No live connection claim is made. Unsupported/future release compatibility is not established by the tested version strings. Method-specific inventory permissions, partial-sync success vocabulary, first-enabled target/ID scope and credential-at-rest findings remain separate audit work.
