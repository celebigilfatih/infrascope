# Integration Credential Storage

**Scope:** B13: VMware password, Zabbix `authToken`, SMTP `smtpPass`.

## Storage and reads

All supported secret writes use the existing AES-256-GCM `enc:v1` envelope. Authentication includes the integration profile and field as associated data; a token cannot be copied to a different profile/field. Host, username, port, recipients and module choices remain readable metadata. No new schema or dependency is required.

VMware operational reads, alarm initialization, health and manual inventory sync resolve the saved secret before constructing a client or cache identity. Zabbix status/sync resolve its token; Zabbix remains token-only. SMTP alarm/test mail and invitation/password-reset mail share the decrypted configuration loader. Connection tests with entered credentials remain transient and do not modify saved configuration. Public VMware/SMTP configuration responses remain masked. Blank/omitted/`********` edits retain the secret from the exact named record; a new named record must supply its own secret.

## Existing-record migration

1. Preserve the installation's existing encryption key and `NEXTAUTH_SECRET`. Production requires `INTEGRATION_CREDENTIALS_KEY`: exactly 32 bytes encoded as base64 or 64 hexadecimal characters. Use the existing installer/key provisioning procedure. Do not invent a fresh key for an existing encrypted database. Development retains the existing session-derived fallback; it is not a production key provisioning procedure.
2. Deploy the matching application version. Node instrumentation awaits credential migration before starting alarm/background work. Enabled and disabled VMware/Zabbix/FortiGate/FortiAnalyzer records and the email notification record are inspected. Legacy plaintext remains readable during deployment so old rows do not cause a false authentication failure.
3. The integration/email migration preflights encryption/decryption and updates snapshot-matched JSON in one database transaction. Wrong/missing keys or a concurrent settings change abort that transaction. Retry after correcting the cause. Already protected records are validated but not rewritten during ordinary startup. No plaintext sidecar/export or migration ledger is created.
4. For a maintenance invocation with a dedicated key already loaded in the application environment, run `npm run security:credentials-migrate`. It uses the same integration/email transaction, prints counts only, and starts no source collectors or notification sends. It excludes NMS devices/backups; their existing startup migration remains a subsequent, separate phase. Do not mistake integration/email atomicity for atomic migration of the entire database.
5. Confirm the completion counts and application health without printing stored JSON. An installation with no matching records has nothing to migrate. Save future secrets through the application API so they are encrypted immediately.

If migration reports a concurrent change, no migration update survives the transaction; the settings save survives. Retry normally. Database sync metadata changes alone do not trigger an unnecessary conflict because the comparison is on configuration JSON. Stop older application writers during a production version rollout: an older writer can still save plaintext after migration. A future startup protects any such legacy record again; do not run mixed application versions as a steady state.

## Rotation and recovery

Keep the old dedicated key as `INTEGRATION_CREDENTIALS_PREVIOUS_KEY`, provision the new active key durably, and run `npm run security:credentials-rotate` in the matching application environment. It re-encrypts all supported integration profiles and SMTP in the same transaction even if plaintext is unchanged. Verify decryption before removing the previous key. For NMS credentials/configuration backups follow [the existing NMS rotation procedure](./nms-backups.md); the CLI's integration/email transaction does not rotate those artifacts.

Session-derived envelopes require the original `NEXTAUTH_SECRET` until upgraded to a dedicated key. Retain historical keys with historical recovery bundles. Encrypting active rows does not erase plaintext from older database dumps, database WAL/history, exports or snapshots; retain/expire those under the installation's backup policy. Restore a matching key before retrying a wrong-key failure; never strip an envelope or use ciphertext as a password. Follow the isolated restore procedure in the NMS runbook rather than restoring over an active database.

## Failure behavior

- Invalid ciphertext or a wrong key stops source construction before remote authentication; VMware health reports an unhealthy saved configuration.
- SMTP configuration load/decrypt failure causes a retryable notification attempt and DLQ scheduling when an alarm-event ID is present and retries are enabled. It is never reported as disabled delivery or successful mail. Test mail returns failure; invitation/reset delivery returns failure through the existing caller contract.
- Migration failures prevent subsequent startup jobs from starting. Inspect only safe error messages and counts. Never paste a password, token, envelope, key or raw configuration into logs/tickets.

## Verification

Run `npm run test:credential-storage` without installation ENV or network access. The suite uses the real encryption, API, saved-source, notification and migration modules with synthetic ORM/source/mail boundaries.

`npm run test:credential-storage:db` is destructive only to explicitly named fixture records in an isolated test database. It refuses to start without `INFRASCOPE_CREDENTIAL_DB_TEST=1`, a loopback PostgreSQL URL and a database name ending `_occurrence_tests`. Run it only in a new disposable database after applying the existing schema migrations. It executes real API persistence, migration/rotation CLI, rollback and concurrent-save scenarios, with source/mail transports replaced. Never point it at an installation database.

Evidence and actual run results: [ADR-020](../10-architecture/adr/ADR-020-integration-credential-protection.md).
