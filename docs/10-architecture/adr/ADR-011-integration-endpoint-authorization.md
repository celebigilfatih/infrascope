# ADR-011: Integration Endpoint Authorization and Safe GET Requests

**Status:** Accepted  
**Date:** 2026-10-15  
**Scope:** Audit B04; integration HTTP boundaries and manual alarm actions.

## Context

Legacy FA, VMware, Zabbix and NMS endpoints were absent from the middleware resource map. Any signed-in role could reach credential saves, connection tests, inventory sync, discovery, VM operations or NMS configuration changes. Several handlers relied exclusively on middleware and did not reload the current active user's role. Alarm GETs evaluated rules and could persist incidents/send notifications. VMware GET `collect-metrics` persisted capacity measurements; diagnostic GETs also initiated explicit tests.

## Decision

Reuse the existing session verification, `getRequestActor` and static `canAccessSync` permission policy. Add `authorizeApiRequest` as the shared server boundary; it verifies an ACTIVE database user/current role, returns 401 without a valid active identity, 403 for denied resource/action, and 503 when identity verification is unavailable. Headers and JWT role claims cannot override the database role. Denial happens before downstream data/config/credential access, client initialization or operations. Identity verification itself requires the existing user lookup; it is not a business-data mutation.

Edge middleware adds path-segment-aware integration mappings and HEAD read checks. Handler checks remain authoritative for current roles and body-dependent actions; middleware is an additional coarse gate. No new roles, identity system, dynamic-permission grants or DB tables are introduced.

| Operation | Existing permission / allowed roles |
|---|---|
| Integration/status/configuration reads | Relevant resource `read`; ADMIN, EDITOR, VIEWER |
| FA/VMware/Zabbix saved settings and credential/diagnostic tests | `settings.write`; ADMIN |
| Legacy FortiGate test/save/sync | Existing `firewall.write`; ADMIN |
| VMware/Zabbix inventory sync, VM power/create/revert snapshot, capacity collection | `devices.write`; ADMIN, EDITOR |
| VMware snapshot delete (transported by POST) | `devices.delete`; ADMIN |
| NMS enable/update polling, discovery start/import, monitored ports, legacy backend update | `devices.write`; ADMIN, EDITOR |
| NMS monitoring/backend deletion | `devices.delete`; ADMIN |
| NMS alarm acknowledgement and manual alarm checks | `alarms.write`; ADMIN, EDITOR |
| Backup creation/content | Existing backup service checks; ADMIN, EDITOR |
| Backup deletion/policy changes/SSH trust approval | Existing ADMIN checks; policy middleware maps to `settings` |

Body-dependent VMware/Zabbix actions first pass the operational write gate, then use the same parsed action for the stricter settings/delete gate. Unknown actions retain their existing invalid-action response and cannot reach a source operation. Protected NMS backup/SSH aliases keep their existing service-level guards.

## GET and caller migration

- `/api/alarms/check` and `/api/alarms/check-vmware` GET return 405 with `Allow: POST`, without calling an engine. Authorized POST is retained; VMware POST now also checks the existing license gate. Scheduler/watchdog continue to call the runner directly in process.
- VMware GET types `collect-metrics`, `test-events-api`, `test-soap-events` return 405 before resolving a service. Use POST JSON `action` with the same name. SOAP diagnostics retain optional `minutes` in the body (default 120). Restore the preceding REST authenticate/401 behavior for moved operations, and retain SOAP authentication for SOAP diagnostics.
- Normal source reads, their necessary provider login/search sessions, and cache refreshes remain reads; they do not become inventory sync or metric-persistence triggers.
- Capacity UI explicitly POSTs collection and displays failed requests. VMware UI sync uses persisted settings directly, allowing an authorized EDITOR to sync without first making an ADMIN-only settings write. Configuration edits use the existing explicit save button; save failures are displayed. The sync label explains that stored settings are used.

## Verification and limits

`test:integration-permissions` executes actual middleware, server actor/permission checks and affected handlers with simulated signed-session results/current DB identity, fake ORM/source calls and no live I/O. Tests separate identity lookups from downstream calls, and assert zero downstream DB/client/network/notification operations on denial. Coverage includes anonymous/VIEWER/EDITOR/ADMIN, stale elevated JWT vs downgraded DB user, inactive/deleted/expired identities, unavailable identity lookup, backend aliases, GET/HEAD and encoded/duplicate parameter forms, POST action parsing, normal allowed controls, diagnostics authentication, and caller migration.

The original middleware issue reproduced as VIEWER POST returning middleware-next (200) before the change. Afterward it returns 403, and directly invoking handlers cannot bypass the current-user checks. Authorized test/save/sync/device/backup workflows retain their original sinks and response contracts.

One fresh read-only security-boundary investigation and one fresh candidate review were performed. The review found the moved Events API diagnostic lacked its previous REST authentication; this was independently reproduced with fake I/O, corrected, and covered with authenticated/failing-authentication controls. No additional concrete candidate bypass was identified.

### Executed checks (2026-10-15)

Reviewed base: `816e6036fea121be4402fcdc81a68aaadda7331e` plus the existing uncommitted B01/B02/B03 and dashboard work. Those changes were preserved. Checks used the existing dependency runtime in pinned image `sha256:daf880f6655d0fdb5bd863f8a0407dcb93f57c2f530f3fa89dd573c36f60d3b0` with this invocation prefix:

```text
docker run --rm --network none --read-only --volumes-from infrascope-web-dev:ro --tmpfs /tmp -w /app --entrypoint node <image>
```

No application environment file was loaded. Source/dependency mounts were read-only, writes were limited to disposable `/tmp`, and network access was disabled. ORM, source services and notifications used in regression checks were fixtures, not customer systems.

| Ordered verification gate | Command / check after the prefix above | Actual result |
|---|---|---|
| 1: syntax, imports and types | `node_modules/typescript/bin/tsc --noEmit --incremental false` | PASS, exit 0 |
| 1: scoped patch hygiene | Host `git diff --check -- <B04 tracked source paths>` | PASS, exit 0. Whole-tree check separately found seven whitespace lines in the unrelated dashboard alerts page; these were not edited. |
| 2: security trigger and alternate inputs | `scripts/check-integration-permissions.cjs` | PASS, 144 scenarios, exit 0. Previously accepted VIEWER write is denied; direct handlers, stale elevated identities, aliases, encoded query values, duplicate parameters/action keys and HEAD cannot bypass the tested boundary. Denied requests reach no downstream operation. |
| 3: legitimate controls | Included in `scripts/check-integration-permissions.cjs` | PASS. Authorized settings tests/saves, sync, capacity collection, diagnostics, VM power/delete and NMS operations retain their existing operation paths. Failed source authentication returns 401. |
| 3: B01 occurrence regression | `scripts/check-alarm-occurrences.cjs` | PASS, 19 scenarios, exit 0; isolated DB/email fixtures |
| 3: B02 source failure regression | `scripts/check-alarm-sources.cjs` | PASS, 46 scenarios, exit 0 |
| 3: B03 independent dispatch regression | `scripts/check-alarm-dispatch.cjs` | PASS, 34 scenarios, exit 0; route fixture supplies an authorized request without replacing the engine |
| 3: alarm health | `scripts/check-alarm-health.cjs` | PASS, exit 0 |
| 3: backup API compatibility | `scripts/check-nms-backups.cjs` | PASS, exit 0; roles, acceptance, duplicates, downloads, integrity, policies and alarms |
| 3: middleware/firewall compatibility | `scripts/check-firewall-write-guard.js` | PASS, 12 checks, exit 0 |
| 3: targeted lint comparison | ESLint `lintText` on 23 changed TypeScript files, comparing `[severity, ruleId, message]` multisets against HEAD | PASS for no newly introduced diagnostics: 119 at HEAD, 115 current, 0 added. Existing legacy diagnostics remain; this is not a clean full-repository lint result. New permission helper and middleware have zero diagnostics. |
| 3: CI wiring | Parse workflow with `js-yaml`; assert package scripts, permission declaration, B04 path triggers and new regression steps | PASS, exit 0. Remote GitHub CI has not been triggered. |

The package alias is `npm run test:integration-permissions`; CI also runs it alongside the existing alarm checks and backup API suite. The commands above execute the same script entry points directly through Node in the isolated runtime.

Tests do not prove live customer connectivity or change broader integration collection/session behavior. Existing backend transport/credential findings remain separate. External callers using removed GET operations must switch to authenticated authorized POST; a 405 is intentional. Full application build/live browser writes and production DB tests are not a substitute for the isolated authorization proof and are not claimed to have run. Source code, dependencies and DB schema are otherwise unchanged outside the scoped patch and preserved working-tree work.

Rollback would reopen the authorization/GET issue; no schema rollback is required. Do not restore GET mutation aliases to work around denied operations.

## Related

- [Audit B04](../../audits/POST_MERGER_ARCHITECTURE_BEHAVIOR_AUDIT.md)
- [Alarm check health](../../30-runbooks/ALARM_CHECK_HEALTH.md)
- [ADR-010 independent sources](ADR-010-independent-alarm-source-dispatch.md)
- `lib/auth/request-actor.ts`, `lib/auth/permission-policy.ts`, `lib/auth/api-permission.ts`

## History

| Date | Change |
|---|---|
| 2026-10-15 | Existing role policy applied to integration boundaries; state-changing GET migration and regressions. |
