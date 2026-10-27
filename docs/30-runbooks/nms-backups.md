# Device configuration backup operations

## Backup workspace

The configuration-backup screen opens on **Cihaz durumu**. Last-success times come from the device policy endpoint across all persisted backups, independently of file-list filters or pagination. **Yedek güncel** and **Yedek gecikmiş** compare the last successful backup of the scheduled type (`lastPolicySuccessAt`) with the enabled policy's `staleAfterHours`; a fresh backup of another type cannot hide an overdue scheduled type. The most recent backup of any type remains separately available as `lastSuccessAt`. A disabled schedule shows **Yedek var**, without claiming freshness. Missing backups, malformed timestamps and future timestamps require attention. Failed refreshes retain the previous records and explicitly mark their freshness as unknown. Times use Europe/Istanbul (TSİ).

**Yedekleri gör** opens the device's filtered files. **İncele** shows file metadata, download progress/errors and a manual recovery guide. Download uses the existing permission, decryption, checksum and audit workflow; its success message means the file was handed to the browser. It does not indicate a device restore. There is no automatic device-restore endpoint. Operators must follow the manufacturer's supported procedure and verify device/firmware compatibility. Archived files remain inspectable; their removed inventory identity is stated explicitly. Read-only users can inspect metadata and the guide but cannot download content.

Run `npm run test:nms-backup-view` for freshness/time/size/filename presentation checks and `npm run test:nms-backups` for API contracts, including role restrictions and archive integrity. Neither requires a real device backup or restore.

`tests/incident-e2e/nms-backup-workspace.spec.ts` adds nine browser cases to the isolated shared regression suite. Synthetic NMS responses cover independent scheduled-type freshness, retained stale records, filters, archived metadata/recovery instructions, actual browser download handoff, HTTP/network/empty-content errors, cancellation, read-only controls, idempotent queue retries and 390px light/dark layouts. A real signed-session request verifies that the current database role blocks content access. No test contacts a customer device or restores a configuration. The shared runner also runs the presentation/API checks and strict lint for the changed workspace files.

## Deployment contract

One company owns one application, database, NMS service, encryption key and recovery destination. There is no shared tenant database. Customer Compose includes `postgres`, `app`, `nms` and `database-backup`. NMS starts after the application's migrations and readiness check. Port 8500 is internal in production. The NMS container needs routed TCP access to the devices' SSH ports; SNMP monitoring is not a prerequisite for backup.

Use the same pinned release for both application and NMS images. Offline installations need both `infrascope-<version>.tar` and `infrascope-nms-<version>.tar`. Compose project names must be unique on a shared host and must remain stable after installation; changing a project name selects different volumes. The source production Compose also supports `INFRASCOPE_CONTAINER_PREFIX` while preserving its existing default volume names.

`INTEGRATION_CREDENTIALS_KEY` must contain 32 random bytes encoded as base64 or hex. It must match in application and NMS. Production refuses a missing key. Preserve `NEXTAUTH_SECRET` as well: older artifacts may use the session-derived key until the startup migration re-encrypts them. Do not replace keys on an existing installation without the rotation procedure.

## Request lifecycle

1. ADMIN or EDITOR submits an explicit Running Config or supported Startup Config request. An optional `Idempotency-Key` allows safe HTTP retries; clients retain the same key after an ambiguous network failure.
2. The application commits a job and an immutable request audit entry together, then returns HTTP 202. Acceptance does not mean that a backup exists.
3. NMS claims jobs with `FOR UPDATE SKIP LOCKED`, a five-minute lease and a fresh fencing token. A unique active-device key and a session advisory lock serialize captures for one device, including across worker processes. Worker concurrency defaults to two.
4. The worker reloads the current inventory record and encrypted credentials, validates the trusted SSH key, executes a fixed command and validates output. It never uses an arbitrary command from a request.
5. Complete output is encrypted with AES-256-GCM. The artifact, SHA-256, success state and completion audit commit together. A stale lease owner cannot commit.
6. Only transient transport/timeouts retry (at most three attempts, exponential delay plus jitter). Authentication, trust, unsupported platform/type and incomplete output fail explicitly. Repeated jobs with unchanged failed credentials cannot authenticate again for 15 minutes. Editing credentials clears that revision's block.

Jobs are `queued`, `running`, `retrying`, `succeeded` or `failed`. The browser can close without cancelling a job. On restart, expired running jobs are recovered; exhausted jobs become failed. The retired synchronous NMS endpoint returns HTTP 410.

## Platform qualification

Profiles live in `nms_service/ssh/backup_profiles.json` and are shared with the application. Explicit `backupPlatform` overrides inventory inference. Ambiguous HP/Aruba metadata requires an operator to select the operating system under Konfigürasyon yedekleri → Platform ve zamanlama ayarları.

| Profile | Running configuration | Startup configuration |
|---|---|---|
| Cisco IOS / IOS XE, NX-OS, Arista EOS | `show running-config` | `show startup-config` |
| HPE/H3C Comware, Huawei VRP | `display current-configuration` | Not implemented; rejected |
| HP ProCurve / ArubaOS-Switch | `show running-config` | `show config` |
| Aruba AOS-CX | `show running-config` | `show startup-config` |
| Juniper Junos | `show configuration \| display set \| no-more` | Not a separate startup configuration; rejected |
| FortiOS | `show full-configuration` | Not a separate startup configuration; rejected |
| MikroTik RouterOS | `/export terse` | Not a separate startup configuration; rejected |

All profiles have output fixtures; a fixture is not hardware certification. Validate each device model, firmware and account privilege level in a customer acceptance test. A text export is not necessarily a complete appliance image: certificates, external files, private keys and device-specific secret redaction may require a manufacturer's separate recovery process. Do not advertise unsupported full backups or automatic device restore.

Reads are bounded by total deadlines and 10 MiB. Exec channels must reach EOF and drain stderr/stdout; nonzero status, command rejection, pager markers and malformed output are rejected. Platforms with explicit end markers must contain them. Terminal fallback uses only session paging settings and requires the original prompt to return. No persistent device configuration is changed. Configurations without a platform footer rely on clean transport/prompt completion plus their structural checks; only a hardware restore exercise can establish operational recoverability.

Command references: [Cisco configuration management](https://www.cisco.com/c/en/us/td/docs/routers/ios/config/17-x/syst-mgmt/b-system-management/m_cm-config-files-0.html), [ArubaOS-Switch running configuration](https://arubanetworking.hpe.com/techdocs/AOS-S/16.11/MCG/KB/content/kb/sho-run-con129.htm), [H3C fundamentals](https://www.h3c.com/en/Support/Resource_Center/EN/Home/Public/00-Public/Technical_Documents/Reference_Guides/Command_References/H3C_CR-18389/01/202404/2101865_294551_0.htm).

## Scheduling, retention and alarms

Schedules are disabled until an ADMIN explicitly enables a policy. Intervals are UTC elapsed hours, independent of daylight saving time. Saving a policy sets its next run one interval ahead. Missed intervals coalesce into one current job; a busy device defers scheduling by one minute instead of losing a full interval. Retention applies only to enabled policies, removes at most 500 old artifacts per device per maintenance pass, and always keeps at least `keepLast` newest artifacts. Inventory deletion does not delete encrypted artifacts; archived artifacts remain available through the global backup endpoint. Policies whose inventory identity no longer exists cannot target a reused NMS integer ID.

`NMS_BACKUP_FAILED` reads authoritative PostgreSQL state even without FortiAnalyzer. It reports the most recent terminal failure until a successful job, or an enabled policy whose last successful artifact exceeds `staleAfterHours`. The built-in rule uses HIGH severity, a 60-minute cooldown and automatic incident resolution. No email is enabled by this new rule. Before enabling notifications, confirm the customer's recipients and notification policy.

`/api/integrations/nms/backups/health` reports capability availability to authenticated users. The NMS readiness endpoint checks the queue schema, live worker/scheduler threads and recent successful queue polling. Application readiness remains independent so stored backups are readable while NMS is down. `docker compose ps` also reports the database-dump service's health.

## Database and key recovery

Regular custom-format database dumps run immediately and then every 86400 seconds by default. `DB_BACKUP_INTERVAL_SECONDS` (minimum 60) and `DB_BACKUP_RETENTION_DAYS` control the interval and local retention. Dumps are written atomically under `backups/database`, checked with `pg_restore --list`, checksummed and protected with private filesystem permissions. A failed dump cannot update the last-success marker. These local dumps contain the application database and are not independently encrypted; the host disk and backup directory require protection. A host-local copy is not disaster recovery.

Create a private passphrase file with at least 16 bytes, keep it separate from the recovery destination, then run from the customer installation directory:

```bash
INFRASCOPE_RECOVERY_PASSPHRASE_FILE=/secure/recovery-passphrase \
INFRASCOPE_RECOVERY_DESTINATION=/mnt/independent-company-backups \
  bash ./backup.sh
```

The command creates an authenticated AES-256-GCM `.isbackup` bundle containing a fresh custom-format DB dump and the current/previous integration keys, session secret, internal service token and database connection settings. It also captures the installation `.env`, persisted machine ID and license cache when present, so recovery does not silently create a new licensed machine identity. The passphrase is read from stdin, never logged or placed in command arguments. Copy the encrypted bundle to an independent, access-controlled destination. Automate this command with the customer's host scheduler and a monitored mount; no off-host copy is implied by the default Compose installation.

Recovery to an **isolated new installation**, never directly over an active database:

1. Keep the old installation stopped during a production recovery. Preserve its volumes and files.
2. Load the corresponding NMS image and mount the recovery directory. Extract with `python -m nms_service.recovery extract --input /recovery/file.isbackup --directory /recovery/restored` inside that image, passing the passphrase on stdin. The destination must be new. Authentication must finish before `database.dump` or `installation-keys.json` is published.
3. Configure the new installation with the recovered keys and secrets. If present, restore `environment.env` as `.env`, `machine-id` under `data/machine-id/machine-id`, and `license.json` under `data/license-cache/license.json`. Adjust URLs, ports and the database hostname/password for the new host without changing encryption keys or the persisted machine identity. Restore ownership for the application's UID 1001. Keep recovery key files private. For older key-only bundles, retain the original installation identity separately or coordinate license reactivation.
4. Start only PostgreSQL, create an empty target database, and use its matching-major-version `pg_restore --exit-on-error --no-owner --no-acl` against `database.dump`. Do not restore into a database already initialized by the application.
5. Start the matching application version (which applies any forward migrations), then NMS. Verify readiness, existing artifact decryption/checksums and a fresh job before switching users.
6. Rotate internal tokens/session secrets only after older session-derived artifacts have been migrated. Remove temporary plaintext extraction material after verification. Retain the independently encrypted recovery bundle and its separate passphrase according to policy.

For key rotation: stop NMS; retain the current key as `INTEGRATION_CREDENTIALS_PREVIOUS_KEY`; install the new key in both services; restart the application and wait for its credential migration; restart NMS. Verify old and new artifacts before removing the previous key. Never discard the only key for a stored artifact.

## Failure response

| Code | Action |
|---|---|
| `AUTH_FAILED`, `AUTH_COOLDOWN` | Correct the encrypted credentials/account privileges. Avoid repeated login attempts; changed credentials can be tested immediately. |
| `HOST_KEY_UNTRUSTED`, `HOST_KEY_REJECTED` | Verify the device identity out of band before approving the observed fingerprint. |
| `UNSUPPORTED_PLATFORM`, `UNSUPPORTED_TYPE` | Select the correct OS profile or use a supported backup type. |
| `INCOMPLETE_OUTPUT`, `PAGED_OUTPUT`, `COMMAND_REJECTED` | Check firmware, read privileges, pager behavior and profile compatibility; do not use the output as a recovery backup. |
| `TIMEOUT`, `CONNECTION_FAILED` | Check routing, firewall rules and SSH capacity; bounded retries occur automatically. |
| `CREDENTIALS_UNAVAILABLE` | Restore the matching encryption key; do not replace it or overwrite encrypted data. |
| `STORAGE_OR_WORKER_ERROR`, `WORKER_INTERRUPTED` | Check DB/storage capacity and NMS health; inspect sanitized logs and durable job state. |

The device backup tab lists missing platform, management address, SSH credentials, trusted host key and role prerequisites, with links to the corresponding settings. A ready prerequisite check does not establish valid SSH authentication or a successful backup. Unsupported startup backups stay disabled independently of running backups; enabling a schedule is not required for manual capture.

For HP ProCurve / ArubaOS-Switch, structural validation requires the `Configuration Editor` header and a `hostname` line. A failed check names the missing marker and selected profile without exposing configuration contents. Check the actual device OS/model and transport completion before changing the profile; do not infer the OS from the HP brand or bypass validation to save the output. Existing historical job messages are unchanged.

## Regression checks

Create a dedicated database ending in `_backup_tests`, apply all Prisma migrations using that database URL, then:

```bash
docker compose exec -T web node scripts/check-nms-backups.cjs
docker compose exec -T web npm run security:credentials-check
docker compose run --rm -T --no-deps -v "$PWD:/workspace" -w /workspace nms python -m nms_service.tests.run_backups
docker compose exec -T web npm run type-check
```

The Python runner forces the test database name and generates isolated encryption keys. It refuses to truncate an installation database. Additional release checks: build both images, start the actual customer Compose against empty volumes, run real HTTP permission/queue tests, verify a database dump by restoring it to a second isolated database, test key decryption after restore, interrupt/restart a running worker, and qualify representative hardware. Record the tested models/firmware and limits in release evidence.
