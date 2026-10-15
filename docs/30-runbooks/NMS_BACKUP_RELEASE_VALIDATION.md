# Configuration backup validation — 2026-10-15

## Scope and outcome

Implemented for independent per-company installations. Local acceptance checks passed. No shared tenancy, device configuration writes, automatic device restore or registry publication was performed. The implementation and validation evidence are recorded together in the repository; image publication is a separate release step.

## Evidence

| Check | Result |
|---|---|
| Python unit/protocol/PostgreSQL suite | 26 tests passed. Dedicated `_backup_tests` database, generated test keys. |
| Platform fixtures | All 10 OS profiles structurally validated. This is not hardware qualification. |
| Real SSH protocol fixtures | Exec, terminal-only fallback, distinct Running/Startup output, truncated output rejection and host-key rejection before authentication passed. |
| Queue coordination | Concurrent claims, expired lease fencing, per-device advisory locks, durable restart, retries and unchanged-credential cooldown passed. |
| Policies | Idempotent scheduling, busy-device deferral and retention preserving newest artifacts passed. |
| Inventory deletion | Artifact retained with null device link and name snapshot; global archived download passed. |
| API contracts | VIEWER metadata-only, ADMIN/EDITOR content/create, ADMIN deletion/policies; malformed input, idempotency conflicts, checksum failure and private caching passed. |
| Clean schema | All 20 forward migrations applied to a dedicated fresh database. Prisma diff to schema reported no difference. |
| Customer Compose | Actual application, PostgreSQL 16, NMS and database-dump service became healthy on independent volumes/port, alongside the existing installation. |
| HTTP acceptance | Real middleware/session/DB/SSH/artifact download path passed. Five simultaneous requests with the same key returned one job. |
| NMS outage/restart | Existing artifact list remained readable, new request remained queued and completed after NMS restarted. |
| Alarm lifecycle | A synthetic bad-password job created one OPEN incident; repeated evaluations did not duplicate it. Corrected credentials and a successful job resolved the incident. No notification email was enabled. |
| Browser | Test account signed in; UI-created job moved from queued to succeeded and appeared in the archive. Screenshot: ignored `output/backup-hardening/acceptance.png`. |
| Regular DB dumps | Valid custom-format dump restored into an independent database. A bad DB password could not update the success marker. |
| Full recovery | Actual `backup.sh` produced an authenticated bundle; dump, recovered keys, `.env` and machine identity were recovered. Seven artifacts in the restored DB decrypted and matched SHA-256. A different installation key was rejected. |
| Recovery failure handling | Wrong passphrase and modified ciphertext rejected without publishing extraction files. |
| Encryption | Existing integration/NMS checks passed for tampering, dedicated/session envelopes and previous-key rotation. |
| Factory image | Production web and NMS image builds passed. Runtime image contained no build DSN, inherited machine identity or license cache. |
| Distribution | Customer ZIP and appliance TAR created and checked for recovery scripts, NMS, DB backup service, docs and Unix script permissions. No live `.env` or central license server was packaged. |
| Static checks | TypeScript type-check, targeted ESLint, shell syntax, Compose validation and CI YAML parsing passed. |

## Real inventory verification

Two previously approved devices were read through the new durable worker. No device configuration was written.

| Device | Platform | Artifact | Bytes |
|---|---|---|---:|
| ISG_DEPO_SW | cisco_ios | `53a34d96-1b2e-4f89-9b5b-e91d0cf03e5a` | 3960 |
| ANABINA_GUVENLİK | cisco_ios | `cb6c6fd8-3e35-49aa-9774-90614349e3e4` | 3885 |

Both artifacts passed structural checks, decryption and checksum verification. Their contents matched the previous verified artifacts after normalizing CRLF and surrounding whitespace (158 and 152 lines respectively). The earlier encrypted artifacts were preserved.

## Release and customer acceptance boundaries

- The new GitHub checks are configured for pull requests and are a prerequisite of image publication. Their underlying checks ran locally; the hosted workflow has not been dispatched or published by this task.
- Actual hardware qualification here covers two Cisco devices. HP/H3C, Aruba, Huawei, Juniper, Fortinet and MikroTik profile fixtures are regression evidence; qualify the customer's exact models, firmware, account privileges and recovery procedure before claiming support. Ambiguous HP/Aruba metadata requires explicit OS selection.
- Full exports can omit secrets/certificates or external files according to the device platform and account. A manufacturer-supported hardware recovery exercise remains required; this module does not automatically apply configurations to devices.
- Schedules are opt-in. The default database dumps are local protected files. Each company must supply a separately protected recovery passphrase, independent storage destination and monitored host schedule for off-host recovery bundles. No off-site destination was configured in the existing installation.
- The production image build emitted existing jose Edge-runtime/Browserslist warnings; they did not block the tested session flow. Existing npm dependency audit findings were outside this backup implementation and are not a completed repository-wide security assessment.

Operational procedure: `docs/30-runbooks/nms-backups.md`. Architecture: ADR-007.
