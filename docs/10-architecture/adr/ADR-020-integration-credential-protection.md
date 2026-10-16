# ADR-020: Protect VMware, Zabbix and SMTP Secrets

**Status:** Accepted
**Date:** 2026-10-16
**Related:** Audit B13; ADR-014, ADR-019

## Decision

Extend the existing versioned AES-256-GCM credential envelope and key lifecycle to VMware passwords, Zabbix API tokens and SMTP passwords. Keep hostnames, usernames and recipients as readable configuration metadata. Do not introduce a second cipher, key store or schema.

Encrypt before ORM writes; decrypt only inside saved-source and SMTP runtime boundaries. Retain legacy plaintext reads during migration. Public configuration remains masked. Blank or masked edits preserve the secret from the exact named configuration, never another target. Unsaved connection tests use entered credentials and cannot silently resolve another target's secret.

Migrate enabled and disabled integration records and the email notification record before starting background work. Preflight decryption and encryption, then atomically compare-and-update the integration/email snapshots. A wrong key, malformed envelope or concurrent configuration change aborts that transaction without overwriting a newer setting. Repeated ordinary startup migration leaves protected records unchanged. Extend explicit key rotation to the same records. Existing NMS credential/backup migration remains a separate phase.

Fail closed on decryption failure. SMTP configuration failure must be recorded as a retryable delivery failure, never as disabled notifications or successful delivery. Never log plaintext, envelopes or keys. Legacy backups still need their historical key and may contain pre-migration plaintext; operators retain and handle them securely.

## Verification

Verified against HEAD `816e6036fea121be4402fcdc81a68aaadda7331e` plus existing B01–B12/UI/incident changes, which were preserved. B13 changes no schema or dependencies. No commit, push or application restart was issued.

| Check | Actual result |
|---|---|
| `test:credential-storage` | PASS, 47 scenarios. Real API encryption; exact-profile blank/omitted/masked preservation; replacement; no cross-profile borrowing; entered-credential tests; manual sync; masked responses; unsupported Zabbix input aliases excluded; runtime health/authentication/alarm initialization; invitation/reset/alarm/test SMTP; wrong-key, malformed/tampered envelopes and context substitution; retryable failures/DLQ; disabled semantics; migration idempotence, session upgrade, rotation, missing keys and rollback/conflicts. |
| `test:credential-storage:db` | PASS, 7 scenarios against a new PostgreSQL 15 container. Existing 22 migrations applied only there. Actual API writes, disabled records, exact-secret round trips, unchanged second run, real migration/rotation CLI, key removal after rotation, wrong SMTP key rollback and two independent concurrent-save cases passed. |
| Existing crypto check | PASS: Fortinet, NMS v1/v2c/v3, backup, tamper and previous-key rotation checks. |
| Strict TypeScript | `tsc --noEmit --incremental false`: PASS, exit 0. |
| Scoped ESLint | Zero added diagnostics; credential helpers, migration, rotation script, saved-source, Zabbix and notification API clean. Existing VMware route/email findings remain (10 / 2). This is not a clean whole-repository lint claim. |
| Existing integration regressions | PASS: VMware cache 52, collection 65, health 54; Zabbix 79; alarm dispatch 35, sources 46, occurrences 19 and alarm-health suite; integration permissions 144; FA auth 45/cache 34; FortiGate target 40/SNMP 55; NMS backup API contracts. |
| Script/CI checks | Script syntax and workflow YAML/package aliases validated; hosted CI itself was not run. |
| Independent review | Fresh read-only security-boundary investigation and candidate review completed. Candidate reviewer reported no actionable issues; its own execution attempt was blocked by missing host `next/server`. Parent verification used installed container dependencies. |

Non-database checks used the immutable installed Node runtime, read-only repository/dependencies, temporary `/tmp` and `--network none`. PostgreSQL tests used a separate container with memory-backed data and no published ports, sharing only that container's network namespace. Test source/mail transports were synthetic; no installation ENV or real recipients were loaded into tests. The disposable database was removed after testing.

The existing VMware cache assertion was updated to require an envelope and verify its decrypted value, rather than require plaintext in the ORM row. Alarm dispatch's simulated FA decryption failure is now explicitly scoped to FA so it does not also fail the newly added VMware read boundary. The shared test loader supplies Node clone/text-encoding globals and a synthetic fixture key, never installation ENV. No source or permission assertions were removed.

A separate read-only inventory of the local `infrascope-web-dev` installation found zero VMware, Zabbix and email configuration records; no live credential records were changed or claimed migrated. Its dedicated-key variable was absent (development fallback only). Production's existing dedicated-key requirement remains enforced by deployment startup. Existing-record conversion was executed with synthetic legacy records in disposable PostgreSQL, not customer data. Deployment instructions are in [the storage runbook](../../30-runbooks/INTEGRATION_CREDENTIAL_STORAGE.md).

No live VMware/Zabbix/SMTP probe, notification delivery, full Next production build, Python worker or hosted CI was run. These tests verify storage/migration and caller contracts, not customer network access or source permissions. Legacy backup retention, key custody and stopping old plaintext-writing versions remain operator responsibilities.
