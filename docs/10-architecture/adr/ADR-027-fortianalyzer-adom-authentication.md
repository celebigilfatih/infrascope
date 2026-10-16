# ADR-027: FortiAnalyzer target and authentication contract

**Status:** Accepted  
**Date:** 2026-10-16

## Decision

Audit B20 identifies hardcoded root ADOM paths and conflicting password/API-key requirements. Normalize one connection profile across settings, probes, shared clients, collectors, alarm runner, correlation and MITRE. Persist an explicit `adom` and `authMode` (`session` or `api-key`); old records default to root and infer API-key mode from a nonempty key. Accept the legacy `accessToken` alias and decrypt/protect it under its own credential context, but canonical new settings persist encrypted `apiKey`. Reject conflicting aliases rather than silently choosing a different key.

Session mode requires a username/password. API-key mode requires a key and sends `Authorization: Bearer <key>` without a JSON-RPC session, credential login or logout. Explicit mode wins over inactive fields; saving a mode change removes inactive secrets. Never automatically downgrade a rejected key to password authentication. Fortinet's JSON-RPC authentication and response-status guidance is documented at https://community.fortinet.com/fortimanager-27/technical-tip-using-fortimanager-fortianalyzer-api-113174 . FortiCloud OAuth exchange is a separate protocol and is not inferred from the key field.

Connection tests authenticate the entered profile with an isolated session where applicable, then perform a limited device read in the selected ADOM. Merely possessing a key or obtaining a session does not prove ADOM access. Saved secret reuse is allowed only for the same normalized host, auth mode and session username; changing ADOM with the same principal is allowed and the selected ADOM is tested. An explicit entered secret never falls back to a saved secret. Password bytes are preserved. Blank/masked edit fields retain only the matching active credential; returned settings contain presence flags, never secret values.

All ADOM-specific endpoints use the configured ADOM. A conflicting per-request MITRE ADOM override is rejected, not silently queried. Shared client/cache revision keys include ADOM/auth mode and a protocol-policy version, preventing old clients, cached events and heavy HTTP caches from surviving target/auth changes. Native event identities/raw evidence remain unchanged; no alarm-history replay or schema change is introduced.

## Verification and limits

Offline wire-level and route/runner/cache regressions cover root/non-root targets, both auth modes/aliases, permission denial and malformed responses, encrypted storage/redaction, rotation and safe secret reuse. Disposable PostgreSQL checks cover persisted profile/cache isolation. Real appliance/version-specific permissions remain a deployment verification requirement; no live customer credential or endpoint is used by automated fixtures. See `docs/30-runbooks/FORTIANALYZER_ADOM_AUTH.md` for actual results.
