# Zabbix Token Authentication

**Scope:** B09 test/status/sync verification. No customer credentials belong in diagnostic reports.

## Expected Behavior

Use the configured frontend base URL or API endpoint and an operator-owned API token. A successful connection check performs unauthenticated version discovery, followed by a token-authorized host read. Public version visibility alone must not produce `connected: true`. The source token must be active, unexpired, and associated with a user role allowed to call `host.get`. An authorized empty host list is a legitimate success; it does not prove inventory is globally empty or every other enabled method is permitted.

The client selects the version-specific transport documented in [ADR-016](../10-architecture/adr/ADR-016-zabbix-token-verification.md). It must not call `user.login`, infer usernames from URLs, create sessions, call `user.logout` or revoke API tokens. Invalid credentials are not retried through a password path or a different encoding.

## Diagnosis

| Safe code | Investigation |
|---|---|
| `ZABBIX_TOKEN_REQUIRED` | Enter the intended API token. No source request was sent. |
| `ZABBIX_CONFIG_INVALID` | Check the API/frontend URL and token formatting. Do not put a username/password or token query parameter in the URL. |
| `ZABBIX_VERSION_UNSUPPORTED` | The returned source version predates configured API-token support. Password sessions are a separate, unimplemented product mode. |
| `ZABBIX_RPC_ERROR`, `ZABBIX_ACCESS_DENIED` | Check token status, expiry, owner and API role permissions. A public version reply is insufficient. Do not paste the token into tickets. |
| `ZABBIX_RESPONSE_INVALID` | Check that the URL points at the JSON-RPC API, not an HTML/proxy login page; inspect only response structure/status without credentials or source inventory. |
| `ZABBIX_TIMEOUT`, `ZABBIX_NETWORK_ERROR`, `ZABBIX_HTTP_ERROR` | Investigate source reachability, certificate trust, reverse-proxy status and latency. RPC fetch/body parsing is bounded at thirty seconds. |

For Bearer-based installations behind Apache/reverse proxies, ensure the Authorization header reaches the Zabbix API. Do not work around dropped headers by falling back to password login. Refer to [official authorization header forwarding guidance](https://www.zabbix.com/documentation/7.2/en/manual/api#by-authorization-header).

POST test uses the entered token and does not save it. GET status and sync use the saved enabled profile; changing settings requires the existing ADMIN action. A successful test does not save the new token automatically. Rejected sync authentication must not create/update device, interface or trigger records, or write a successful sync log. Existing partial-sync vocabulary and per-item error behavior are separate audit scope.

## Safe Regression Check

```text
npm run test:zabbix-auth
npm run test:integration-permissions
npm run type-check
```

The authentication suite executes the real service and route code against synthetic tokens, mocked ORM/source transport and loopback-only HTTP servers. It covers valid/invalid tokens, version-selected serialization, permission failures, genuine empty reads, malformed replies, deadlines, state reset, repeated/concurrent verification, token/profile isolation, API authorization and actual inventory mapping with fixture persistence. No application environment file, customer Zabbix, production DB or notification recipient is needed. It is protocol-fixture validation, not live-server compatibility certification.
