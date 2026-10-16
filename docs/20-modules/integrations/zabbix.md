# Zabbix Integration

## Active Entry Points

`app/api/integrations/zabbix/route.ts` selects the explicit enabled `configId` for GET status and POST sync, or the sole enabled record. Multiple enabled records without a selector return HTTP 409. POST test uses the entered URL/token without saving. POST save-config retains the existing persistence path. B04 application authorization remains in force: status requires device read, settings/test require ADMIN, and operational sync retains ADMIN/EDITOR access.

All three source paths use `ZabbixService` in `lib/integrations/zabbix.ts`. The configuration supports an operator-managed API token (`authToken`); it contains no username/password session fields. There is no login, logout or token revocation in this path. B15 added saved inventory scheduling; B16 isolates hosts/interfaces/trigger-host associations by connection and endpoint and permits independent scheduled targets. No automatic incident-notification bridge was added. See [source identities](../../30-runbooks/INVENTORY_SOURCE_IDENTITIES.md).

## Token and Transport Contract (B09)

1. Require a nonblank configured token before source access. Normalize surrounding paste whitespace; reject embedded line breaks. Copy the connection profile on client construction so later caller edits cannot change an instance's identity.
2. Read `apiinfo.version` without credentials and validate its JSON-RPC envelope/version. This public request does not establish token validity.
3. Use JSON-RPC `auth` for token-capable releases before 6.4; use `Authorization: Bearer` from 6.4 onward. Never send both or fall back to username/password after rejection. This follows the [versioned Zabbix API contract](../../10-architecture/adr/ADR-016-zabbix-token-verification.md#primary-protocol-references).
4. Verify with `host.get`, `output: [hostid]`, `limit: 1`. A valid successful empty list is permitted. A permission/auth/RPC/HTTP error or malformed result fails verification.
5. Revalidate on each authenticate/status/sync call; simultaneous verification on one instance shares one attempt. Failures clear the instance token/transport state. There is no process-global verified-token cache.

Frontend base URLs, trailing slashes, subpaths and an explicit `api_jsonrpc.php` endpoint are supported. Query/fragment and URL-embedded credentials are not accepted as token configuration. Each RPC bounds fetch plus body parsing at thirty seconds using the existing source-deadline helper. JSON-RPC IDs and result/error exclusivity are checked; raw server diagnostic text is not logged or persisted as an authentication failure.

`getStatus()` retains `connected`, optional `version`/`error`, and adds a safe `code` on failure. User-facing messages are Turkish; code/log messages remain English. Sync authentication failure returns `success: false` before device/interface/trigger mutations. Successful sync retains the existing data mappings and writes. Host-read authentication is not a guarantee that every enabled inventory method is allowed by the source role.

The subsequent full host read uses `selectInventory: extend` and no unsupported `selectHosts` argument. This preserves inventory enrichment after token verification; it does not redesign source item mappings.

## Boundaries

B09 does not change the API routes' permission policy, saved credential format, Prisma pool ownership, first-enabled target selection, cross-target inventory identity, partial-sync status vocabulary or scheduling. Those audit findings remain separate. Generic inventory payload/mapping behavior outside the token probe is not redesigned. No source session exists that the application should log out or revoke.

See [ADR-016](../../10-architecture/adr/ADR-016-zabbix-token-verification.md), [token diagnostics](../../30-runbooks/ZABBIX_TOKEN_AUTH.md) and `npm run test:zabbix-auth`.
