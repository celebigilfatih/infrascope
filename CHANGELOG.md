# Changelog

All notable changes to InfraScope will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

- **FortiGate workspaces and scoped reads** — Add Turkish connection settings, source-aware device overview, virtual IP inspection and bounded same-device configuration comparisons. Keep probe and inventory histories separate, require atomic version/identity guards on settings updates, preserve encrypted credentials and recheck the current ACTIVE account before protected operations. Distinguish unknown, stale, disabled and failed source results; retain explicit profile/VDOM scope and safe retry behavior. Add isolated contracts, authorization/database and responsive browser regressions without contacting customer appliances.

- **FortiAnalyzer settings workspace** — Separate private DB-only profile/collector metadata, saved-secret and entered-secret ADOM probes. Preserve selected profile identity, disabled state, schedule metadata and encrypted same-principal credentials; remove inactive secrets on auth-mode changes. Require observed versions and atomic save guards, reject competing creation, retain stale drafts and block uncertain retries. Add disposable browser/PostgreSQL coverage and keep the existing authentication, cache and UTC regressions.

- **VMware connection settings workspace** — Separate DB-only profile/history reads, saved-secret and entered-credential tests, and scoped manual inventory sync. Preserve encrypted secrets, disabled state and module metadata; validate target authorities before source access or persistence. Use immutable profile IDs, optional observed versions and atomic update guards; make workspace creation reject same-name conflicts. Verify sync response scope, retain drafts/stale data and block uncertain retries. Remove the blanket public VMware HTTP-cache rule so private settings headers remain effective; preserve the source-scoped server inventory cache. Add isolated PostgreSQL/browser regressions and refresh existing VMware test adapters without contacting customer vCenters.

- **License status workspace** — Replace incompatible issuer-action buttons with a read-only license/capacity view and canonical plan comparison. Distinguish unknown, zero, over-limit, grace and expired states; calculate duration from the server observation and keep stale reads explicit. Recheck the current ACTIVE identity before license/status reads, mark the route dynamic and preserve existing settings read roles. Add isolated source/browser/PostgreSQL coverage without changing customer keys, cache or issuer protocol.

- **Organization identity and location workspace** — Replace unsupported organization status/contact/account fields with actual identity, hierarchy totals and responsive inspection. Preserve unknown subtrees and stale reads, submit changed fields, verify write targets and block uncertain retries. Use the current ACTIVE identity for organization reads/writes, retain administrator-only mutations and remove the stale process cache. Explain permanent cascade/detachment scope and require typed UI confirmation; add disposable PostgreSQL and signed-session browser coverage without changing customer records.

- **Invitation lifecycle and recipient verification** — Add responsive invitation inspection with server-derived expiry, explicit mail submission/failure/development outcomes and confirmed resend scope. Preserve recipient, role and link identity on renewal; recheck current account permissions and keep bearer tokens out of management responses/audits. Enable only the existing token-authenticated verification GET/POST for first-time recipients, enforce single-use acceptance and recheck quota in a serializable transaction. Verify HTTP status, target identity and stale-response boundaries in the UI; add isolated mail, browser and PostgreSQL regressions without sending real invitations.

- **User account workspace and current-identity checks** — Add responsive account inspection, absolute Istanbul timestamps, status/role filters and a read-only view of the role rules used at runtime. Verify changed-field saves, preserve drafts after rejected/uncertain writes and block uncertain retries until refresh. Recheck the current ACTIVE user for account/activity reads and account/password writes, preserve existing role policy and record the actual actor separately from the target in management audit entries. Add isolated transport, PostgreSQL and signed-session browser regressions without changing customer accounts or contacting license providers.

- **API-key capability boundary** — Replace fabricated application keys, dates and usage times with explicit unavailable/unknown states. Disable creation with an associated explanation, remove unsupported refresh/copy/revoke actions and distinguish integration credentials from application keys. Add responsive light/dark presentation and a native keyboard-accessible information guide; no key store, authentication or lifecycle backend is introduced.

- **Audit inspection and export** — Add a responsive read-only audit workspace with explicit applied filters, actor search, immutable detail inspection and stale/error states. Share validated Istanbul calendar-day filters and deterministic timestamp/id ordering between pagination and bounded UTF-8 CSV exports, retaining formula escaping and signalling truncation. Recheck the current ACTIVE administrator before list/export access, reject malformed rows and preserve scalar JSON details including false/zero. Add isolated database/browser and synthetic-I/O coverage without reading customer audit data.

- **Alarm rule management** — Add searchable, responsive rule inspection with source-specific condition descriptions and explicit state/cooldown/email edits. Preserve drafts after failed or unverified saves, distinguish stale reads and saved email-channel state, keep masked SMTP credentials and require confirmation before test mail. Validate definition patches and recheck the current ACTIVE database identity before definition/channel reads, writes or test delivery; render the channel API dynamically. Add isolated browser and synthetic-I/O regressions without contacting customer devices or SMTP recipients.

- **Incident acknowledgement recovery** — Apply current-role capability checks to detail acknowledgement and withdrawal controls. Preserve drafts/selections on 401/403, show action-specific Turkish feedback and offer one contextual new-tab login link for expired sessions. Verify canonical acknowledgement actor/time, clearing of incident/occurrence approval on withdrawal and idempotent retries with signed-session browser, callback and rollback-only PostgreSQL regressions. Give the expanded browser job 30 minutes while retaining every test and quality gate.

- **Incident lifecycle authorization recovery** — Preserve detail drafts, owner selection and list selections when resolve/close, archive/restore or legal-hold requests receive 401/403. Show operation-specific Turkish warnings and one contextual new-tab login link for expired sessions. Derive separate archive/legal-hold capabilities from the current database role and disable unavailable detail actions while retaining EDITOR collaboration access. Add signed-session browser, non-JSON response and rollback-only PostgreSQL regressions for denied writes, canonical audit/history, successful recovery and duplicate replays; existing server authorization rules remain in force.

- **NMS backup coverage and file inspection** — Open configuration backups on device coverage with scheduled-type freshness, independent all-type success dates and explicit unknown states after failed refreshes. Add archived-file metadata, a manual recovery guide and permission-aware browser downloads with cancellation, bounded waiting and explicit error states. Preserve queue acceptance/idempotency and existing encrypted content, checksum and audit APIs. Add presentation/API and isolated desktop/mobile browser regressions; no device restore or schema/dependency change is introduced.

- **NMS monitoring and setup** — Separate polling configuration, last response freshness and independently timestamped CPU/memory measurements; preserve unknown values, real zeroes and previous records after failed refreshes. Add responsive measurement summaries and an optional, permission-checked SNMPv2c/v3 setup probe using the entered credentials, without registering devices or starting collection. Fence cancelled/stale results, bound agent concurrency/timeouts and report unexpected SNMP tool failures as service errors. Add isolated UI, proxy, agent and CLI regressions with CI coverage; update the web and NMS agent together when deploying this feature.

- **Topology inspection and source coverage** — Add layered device placement, selectable status-labelled connection edges, a searchable keyboard-accessible connection list and responsive device/connection inspectors. Map each switch port to its joined peer interface without attributing legacy unjoined IDs to another device. Preserve unknown states and unavailable source counts, distinguish NMS port evidence from inventory/link status, and retain dragged positions. Add model and isolated browser regressions; migrate topology images to Next.js Image while preserving direct loading for uploaded/exported images.

- **Incident unassignment recovery** — Extend assignment session/permission regressions to removing an existing owner. Keep the pending unassigned selection and unsaved note after denied requests, show a removal-specific Turkish permission message, and verify canonical actor metadata, cleared assignment timestamps and one history/audit entry after authorized retries. No schema or dependency change is required.

- **Snapshot workspace UI** — Replace the legacy snapshot screen with a responsive inventory, VM links, elapsed-age filters, TSİ dates and filtered CSV export. Distinguish unknown/partial associated-file sizes from zero, confirm destructive actions with both VM and snapshot identity, and block writes on stale/failed reads or missing capabilities. Add browser coverage with intercepted VMware I/O, alongside model and Python collector checks in the isolated regression runner.

- **Incident assignment recovery** — Preserve the chosen owner, unsaved operation note and incident selection when assignment receives 401/403, including non-JSON responses. Show a Turkish assignment-specific warning and place the new-tab login link beside the assignment controls. Add real-session browser and rollback-only database regressions for denied writes, recovery, history/audit integrity and duplicate retries.

- **Snapshot collection contracts** — Add a read-only, source-scoped VMware snapshot workspace API and Python collector to the runtime image. Keep snapshot/file identities, UTC dates and unknown/zero associated-file sizes distinct; reject duplicate layout/file identities and invalid or inexact bridge measurements. Compute capabilities per request after shared data-cache reads. Add SDK, bridge, source selection, permission, cache and packaging regressions. The existing snapshot API and mutation routes remain available; see `docs/30-runbooks/VMWARE_SNAPSHOT_COLLECTION.md`.

- **Local Inter / offline release build** — Replace the Google font loader with `next/font/local` and bundle the unmodified Inter 4.1 variable WOFF2 plus its OFL license. Preserve normal style, weights 100–900, swap display and root font application. Add source/output asset regressions and a CI source check. The actual product `npm run build` passes in a fresh, network-isolated source copy with existing dependencies, including 112/112 static pages and verified font emission/preloading; see `docs/30-runbooks/LOCAL_FONTS.md`.

- **Module lint cleanup** — Resolve all 390 release-blocking lint errors across API routes, alarms, integration clients, topology and shared/UI helpers using concrete Prisma, source-payload and component contracts. Preserve request handling, query semantics, credential redaction and hook order without changing lint severity or scope. Add isolated topology contract regressions to release CI; verify existing offline, Python and disposable PostgreSQL suites. The full quality gate passes with 9 existing warnings; the isolated product build reaches compilation but cannot fetch the remote Inter font. See `docs/30-runbooks/RELEASE_QUALITY_GATES.md`.

- **B21 — Enforced release quality** — Enable native Next.js TypeScript/ESLint build checks and require policy/TLS/type/lint checks before compilation. Gate tag/manual image publication on reusable quality, alarm/integration, dashboard, incident and backup regressions. Expand TLS scanning to Python/CommonJS with tested centralized-policy exceptions, add actual compiler positive/negative controls, and update the multi-target test harness for B19 ownership. Existing lint errors now block releases; sanitized diagnostics and actual outcomes are recorded in `docs/30-runbooks/RELEASE_QUALITY_GATES.md`.

- **B20 — FortiAnalyzer ADOM and API-key consistency** — Settings, probes, DVM/LogView/FortiView/MITRE, alarms, correlation and health now share a saved target/authentication profile. Local API keys use Bearer headers without password/session fallback; scoped probes verify actual ADOM access. Legacy key aliases participate in encryption migration, edits retain only matching secrets, and client/cache/health revisions isolate ADOM changes. Added offline wire/runtime/form and disposable PostgreSQL regressions with CI coverage; see `docs/30-runbooks/FORTIANALYZER_ADOM_AUTH.md` for results and deployment limits.

- **B19 — Alarm execution ownership** — Atomically claim an owner lease and RUNNING log; fail closed on unavailable ownership, preserve live owners at startup and fence stale finalization. Propagate cancellation through alarm DB writes, incident recording, delivery attempts and FortiAnalyzer searches, including timed search stages; verify ownership before SMTP handoff. Share the gate with VMware-only manual checks without treating their success as global recovery. Preserve detached shared cache collection, guard retention startup/restart and invalidate stopped scheduler ticks. Added offline and independent-process PostgreSQL regressions; see `docs/30-runbooks/ALARM_RUN_OWNERSHIP.md`.

- **B18 — FortiAnalyzer UTC event times** — Cache collection, live queries, correlation and occurrence recording now share one UTC normalizer with explicit timezone offsets and second/ms/us/ns epoch support. Invalid source times fail visibly instead of becoming arrival time or empty success. Version cache timestamps and collector revisions to exclude old derived dates until recollection; preserve raw occurrence evidence and cover the widest rule window before batch filtering. Added offline timezone and isolated PostgreSQL regressions; see `docs/30-runbooks/FORTIANALYZER_EVENT_TIME.md`.

- **B17 — Atomic NMS device ID allocation** — Legacy enablement and discovery import now share firewall onboarding's transaction advisory lock and explicit ReadCommitted isolation. Repeated requests cannot reassign a winning identity; discovery inventory and imported markers commit together. Return a Prisma-readable lock sentinel, validate integer allocation bounds and preserve rollback/probe ordering. Added offline and isolated PostgreSQL concurrency regressions; see `docs/30-runbooks/NMS_DEVICE_ID_ALLOCATION.md`.

- **B16 — VMware/Zabbix inventory source isolation** — Scope remote device, cluster, datastore and trigger-host identities by saved connection and endpoint, with forward migration and compound uniqueness. Retargeting retains previous inventory; ambiguous legacy ownership remains unassigned. Scope VMware metrics/topology and occurrence/cooldown evidence; require `configId` for ambiguous operational/manual selection. Allow independent VMware/Zabbix scheduled imports while retaining FortiGate's guard. Added offline and isolated PostgreSQL regressions; see `docs/30-runbooks/INVENTORY_SOURCE_IDENTITIES.md`.

### Fixed

- **Saved sync/poll scheduling** — VMware/Zabbix/FortiGate inventory imports now run on their saved minute interval through the existing source services, with current credential resolution, manual/scheduled exclusion, two-source automatic concurrency and consistent outcome recording. Relational intervals override stale JSON copies, including VMware cache invalidation. NMS polling now retains each device's saved seconds as its base, preserves slower recovery floors/jitter, refreshes due work/settings within the loop's five-second wake bound and skips stale registration. Added 50 Node, 13 Python and 6 isolated PostgreSQL regressions with CI coverage; automatic multi-profile imports remain blocked pending B16 identity isolation.

- **Inventory sync outcome consistency** — VMware/Zabbix imports now distinguish complete, partial and failed results using acknowledged writes and captured errors. Log and last-sync metadata commit together with matching counts/status/timestamps; authentication failures also finalize duration. VMware results and dashboard/integration summaries expose incomplete outcomes, and live inventory counts no longer fabricate an initial successful sync. Added 55 isolated service/API/page regressions and 9 disposable PostgreSQL transaction scenarios with CI coverage.

- **VMware, Zabbix and SMTP credential storage** — Passwords/API tokens now use the existing authenticated encryption envelope before database writes and are resolved at saved-source/email boundaries. Named-profile masked edits preserve the correct secret; invalid ciphertext fails before source access and SMTP failures remain retryable. Added atomic, snapshot-checked legacy migration and integration/email key rotation, maintenance commands, 47 isolated regressions and 7 disposable PostgreSQL scenarios with CI coverage.

- **VMware saved-source health** — Health now resolves the enabled saved VMware profile through the same loader/factory as operational reads and alarm initialization. Legacy ENV credentials cannot override or activate a target, and sync metadata belongs to the probed record. Added bounded cancellation, modern/legacy owned-session cleanup, safe target/error metadata and isolated target/configuration/concurrency/deadline regressions with CI coverage. Missing configuration remains unknown; real store, source and cleanup failures remain unhealthy.

- **FortiGate SNMP inventory source** — Removed the HTTP/161 pseudo-client and empty interface stub. SNMP/both interface sync now consumes explicitly linked, fresh NMS observations with target, time and availability checks; device-wide data is never projected into an unsupported VDOM. Missing fields stay unknown, counters retain precision, and failed reads/writes cannot report successful empty inventory. REST-only modules require REST/both mode. Added isolated source/API and real PostgreSQL source-to-inventory regressions with CI coverage.

- **FortiGate alarm target scope** — Direct SSL-VPN alarms now enumerate every enabled integration through explicit shared-connector selection and its saved VDOM. Incident identity, session replay detection, user/target cooldowns, notifications and error summaries retain the originating target. One firewall failure preserves the remaining source results; later cycles re-resolve changed settings. Added isolated factory/client/engine/manual/scheduler/email regressions and opt-in PostgreSQL relation, uniqueness and concurrent-delivery checks with CI coverage.

- **Zabbix token verification** — Token-only connections no longer attempt a passwordless `user.login`. Test/status/sync discover the version without credentials and verify the configured token with a limited authorized host read. Version-selected JSON-RPC/Bearer transport, bounded parsing, sanitized failures and fresh verification prevent public version replies or rejected credentials from claiming success. Added offline service/route/sync and loopback JSON-RPC regressions with CI coverage.

- **VMware collection capability and source errors** — Connection tests now verify Python/PyVmomi plus the actual host and uncached snapshot readers with the entered credentials. All helper calls are asynchronous and shell-free, carry secrets only through stdin, share verified VMware CA policy, and return bounded, validated results. Helper failures no longer become empty snapshots, clean alarm evaluations, zero-capacity host enrichment or successful cached dashboard data. Hosts are matched by MoRef; SDK views and owned test sessions are closed. Production/development recipes now install the same pinned SDK and explicitly package the helpers. Added offline Node, Python, local TLS and real SDK SOAP regressions with CI coverage.

- **VMware target cache and background refresh** — Snapshot and HTTP response caches now follow the normalized target and connection profile, including credential and certificate changes. Stale data refreshes through the authenticated source loader instead of a sessionless self-request; simultaneous loads are deduplicated. Successful settings saves and snapshot mutations invalidate their profile and fence late writes, including background warming. Added isolated target, authentication, expiry, concurrency and invalidation regressions with CI coverage.

- **FortiAnalyzer cache configuration rotation** — Event-cache collectors now follow the saved configuration revision, retire old timers/source work after a successful save, and recheck settings before scheduled collection. Persisted events and heavy HTTP response caches are revision-scoped so old or late results cannot appear as current target data. Shared initialization, encrypted credential resolution, native event identities and matching live fallbacks are preserved. Added offline lifecycle and opt-in PostgreSQL provenance regressions with CI coverage.

- **Independent alarm source dispatch** — VMware and direct FortiGate SSL-VPN alarms now run with their own enabled configuration when FortiAnalyzer is absent, disabled or failing. The shared engine initializes only selected sources, keeps source failures scoped, preserves NMS results without duplicate evaluation, and exposes the same VMware path to the manual VMware check. Configured-source errors remain visible; absent optional sources are skipped. Added isolated dispatch regressions and CI coverage.

- **Alarm source failure propagation** — FortiAnalyzer log-query failures, unfinished searches and event-cache read/write failures no longer become successful empty alarm checks. Completed empty searches remain valid; failed logtypes and targeted event scans invalidate only their cache coverage. Source deadlines cancel log-search I/O, dedicated queries retain their meaning on failure, and isolated regressions cover error logging, health degradation and recovery without rewriting history.

- **Fortinet alarm occurrence identity** — Event-type `logid` values no longer suppress later source events. Occurrences use analyzer scope, physical device/VDOM, exact source time and native evidence; proven legacy replays keep their existing records without another notification. Added isolated recording/email regressions and opt-in PostgreSQL transaction/concurrent-delivery checks. Incident grouping, cooldown and notification preferences are preserved.

- **Shared dashboard navigation and theme** — The home dashboard now uses the interior pages' complete sidebar and shared green theme tokens, including dark appearance, focus rings and derived chart shades. Container-based responsive rules preserve the existing card layout at expanded/collapsed menu widths. Removed the unused interrupted alarm-page stylesheet; Alarm Operations retains its current UI.

- **Alarm health recovery** — An absent or disabled optional FortiAnalyzer integration no longer creates repeated alarm-check errors in NMS-only installations. Configured-source failures still surface. Health preserves the last-hour error history and clears the alarm degradation contribution after a successful check; subsequent failures are counted again.

- **Reliable per-company configuration backups** — Added durable PostgreSQL jobs with fenced leases, per-device locking, bounded retries and authentication backoff; explicit OS profiles and Running/Startup capabilities; structural output validation; role-controlled, audited content access; archived artifacts after inventory deletion; opt-in schedules, retention and failure/overdue alarms. Customer and production packages include NMS and persistent database dumps, with an authenticated recovery bundle for database and installation keys. Fresh-install schema gaps are reconciled by forward migrations.

- **General configuration backups** — The general backup page now lists the same persisted records as device details, supports device/type/search filters, downloads decrypted configurations with checksum verification, and uses the existing audited device workflow for creation and ADMIN-only deletion. API failures are displayed instead of appearing as an empty list.

- **Login rate-limit isolation** — Dashboard and other API traffic no longer consumes the login request budget. Session checks use the general API limit, authentication attempts retain their stricter limit, and the login page displays the retry delay when the limit is reached.

### Security

- **FortiAnalyzer test credential isolation** — Connection tests authenticate with the resolved entered credentials using an owned transient session and close only that session. Shared session reuse and login results are bound to exact credentials; account backoff and serialized login attempts remain shared by host/user. Login parsing, queue waits and logout are bounded; malformed/error responses cannot claim successful authentication. Saved-password fallback and API-token collectors remain compatible. Added offline auth regressions and CI coverage.

- **Integration endpoint authorization** — Legacy integration routes now enforce the active database user's existing resource/action permissions before source access or mutation. Settings and credential tests require ADMIN; device operations retain ADMIN/EDITOR access, deletions require ADMIN, and backup rules stay intact. Alarm trigger GETs and VMware collection/diagnostic GETs return 405; explicit authorized POST actions replace them. VMware diagnostics retain source authentication and the VMware alarm action checks its license. Added isolated role/session/alias regressions and CI coverage.

- **FortiGate write guard** — Direct quarantine changes are now disabled by default, require an active ADMIN session when explicitly enabled, use a dedicated firewall RBAC resource, and emit audit records for successful legacy changes.
- **Development TLS safety** — Removed the global `NODE_TLS_REJECT_UNAUTHORIZED=0` setting from the development Compose service; integration-specific TLS behavior remains explicit and production-safe.
- **Integration credential encryption** — FortiGate passwords/tokens and FortiAnalyzer passwords/API keys now use versioned AES-256-GCM envelopes at rest. Existing plaintext records are upgraded idempotently at startup, API responses expose only credential presence, customer installs generate a dedicated key, and two-key rotation is supported without accepting plaintext fallback.
- **NMS SSH trust and secret protection** — SNMP communities, SSH passwords, and configuration backups now use the same versioned AES-256-GCM envelope at rest. SSH sessions reject unknown or changed host keys, execute only vendor-scoped read operations, and require an explicit ADMIN fingerprint approval recorded in the audit log. Internal NMS operations require a service token and no longer expose backend addresses or raw errors.
- **SNMPv3 USM credentials** — NMS devices now support encrypted `authNoPriv` and `authPriv` credentials with SHA/SHA-256 authentication and AES-128 privacy. Secret values are never returned by the API, blank edit fields preserve existing credentials, and discovery records cannot carry USM secrets.
- **Target-scoped FortiGate connectors** — FortiGate sessions and response caches now use a shared connector factory keyed by integration config and VDOM. Arbitrary first-config selection is rejected when multiple targets exist, REST calls carry VDOM scope, sync queries use the resolved inventory device, and the integration service now uses the shared Prisma client.
- **FortiGate failure semantics** — REST reads now classify TLS, authentication, timeout, network, rate-limit and unsupported-operation failures, enforce bounded timeouts and retries, and no longer report upstream failures as successful empty lists. Non-idempotent writes are never retried automatically, and TLS agents rotate when trusted CA content changes.
- **Fail-closed firewall write audit** — Legacy quarantine writes now require an immutable audit reservation before contacting FortiGate and append explicit success/failure outcomes. An unavailable audit database prevents the external write from starting.
- **Per-firewall trusted CA management** — Firewall administrators can now upload a validated root/intermediate CA PEM chain from the Firewall detail page. The chain is encrypted with the integration configuration, never returned by the API, scoped to one FortiGate, audited, and immediately applied to a fresh trusted REST probe without restoring any global TLS bypass.

### Added

- **Mint operations dashboard** — Implemented the selected light dashboard with searchable inventory and incidents, device-scoped CPU/memory history, 6-hour/24-hour/7-day ranges, CSV export, exact incident details, monitoring coverage and integration states. Authenticated read APIs preserve missing measurements and report failures explicitly; responsive navigation supports keyboard focus management. Added isolated dashboard regressions and CI checks.

- **Switch alarm pipeline health** — Alarm health now reports NMS polling devices, registered collectors, monitored ports, fresh interface/health data, last successful poll, last alarm check, and actionable blocking reasons. Alarm Operations displays this status only when switch monitoring needs attention.

- **Firewall capability state foundation** — Added typed `FULL/LIMITED/UNAVAILABLE` monitoring evaluation and consistent `available/stale/unavailable` data envelopes for FortiGate REST, FortiAnalyzer, event-cache, SNMP, SSH and database sources.
- **Non-blocking firewall onboarding** — Added authenticated `/api/firewalls` inventory onboarding that stores encrypted credentials and preserves the `Device + IntegrationConfig` transaction when the initial trusted REST probe fails, including expired-certificate diagnostics.
- **Persistent FortiGate identity** — Added the `FirewallConnector` model and ADR-006 so management addresses can change without creating a second inventory device. Trusted probes identify devices by serial + VDOM, surface duplicate/drift conflicts for explicit ADMIN review, and preserve verified serials when a conflicting candidate is observed. Legacy FortiGate integrations are exposed as unlinked and can be attached to an explicit firewall inventory record through an audited API without host-based guessing.
- **Firewall source and freshness API** — Added connector-scoped read endpoints for status, interfaces, policies, addresses, VIPs, HA, SSL-VPN sessions and IPsec tunnels. Responses consistently distinguish `available`, database-backed `stale`, and `unavailable` data, include collection time and target scope, normalize live/snapshot DTOs, redact HA credentials, and provide bounded pagination plus allowlisted search/filter behavior for list resources.
- **FortiAnalyzer firewall event correlation** — Added ADMIN-controlled exact serial/devid + VDOM correlation, device-scoped FortiAnalyzer searches, indexed event-cache identity, and bounded auth/security/config event endpoints. Same-name or same-IP devices are never inferred as matches; responses expose source freshness without returning raw log payloads.
- **Fortinet SNMP fallback foundation** — Corrected FortiGate CPU and memory OIDs against the official MIB, replaced the invalid temperature scalar with hardware-sensor table parsing, removed implicit `public` community fallback, and added connector-scoped SNMP health/interface endpoints with bounded pagination and freshness-aware capability state. SNMPv1/v2c and encrypted SNMPv3 `authNoPriv`/`authPriv` sessions share the same polling and freshness contract.
- **FortiOS SSH fallback foundation** — Added pinned SHA-256 host-key inspection/trust APIs, a customer-facing trust control in NMS device settings, FortiOS `get system status` fallback, and encrypted `show full-configuration` backups with checksum verification and audit metadata. SSH remains strictly read-only and never substitutes for FortiGate REST CMDB data.
- **FortiGate automatic recovery** — Added distributed due-probe claiming, persistent 5/10/20/40/60-minute REST backoff, process-level in-flight deduplication, ADMIN-only rate-limited manual probes, and recovery heartbeat reporting. Successful trusted REST probes automatically promote eligible connectors from `LIMITED` to `FULL` without discarding SNMP, SSH, or FortiAnalyzer capability state.
- **FortiGate read-only operations workspace** — Replaced the legacy single-device configuration screen with multi-firewall inventory and connector detail routes. The UI exposes `FULL/LIMITED/UNAVAILABLE` mode, per-source freshness, explicit unavailable states, identity conflict review, FortiAnalyzer correlation, SSH host-key trust, and all bounded read resources without exposing any FortiGate write action.
- **Hybrid FortiGate onboarding** — Firewall onboarding now configures encrypted SNMPv1/v2c or SNMPv3 USM credentials and optional SSH fallback directly on the inventory device, atomically reserves the NMS identifier, preserves the device when trusted REST fails, and automatically promotes it to `LIMITED` when fresh fallback metrics arrive.
- **Firewall connection removal** — Firewall Management now lets an ADMIN remove a connector or legacy unlinked integration with an explicit confirmation and immutable audit record. Removal never calls FortiGate and keeps the linked inventory device under `/devices`.
- **AlarmIncident lifecycle architecture** — Alarm detections now create deduplicated incidents with append-only occurrences, immutable lifecycle transitions, authoritative notification attempts, cursor pagination, legal hold, soft archive, compressed payload retention, and audited OPEN/ACKNOWLEDGED/RESOLVED/CLOSED transitions.
- **Automatic alarm catalog synchronization** — Customer deployments now install and update the 103 built-in alarm definitions, including NMS port, reachability, CPU, memory, and temperature rules, during server startup while preserving operator enable/email/cooldown preferences.

- **Customer demo install runbook** — Added customer-server demo documentation for central license creation, Docker on-prem install, first admin setup, activation verification, and fallback demo flow (`docs/30-runbooks/CUSTOMER_DEMO_INSTALL.md`, `deploy/DEMO_INSTALL.md`, `Kurulum/*.html`).
- **Readiness health endpoint** — Added `/api/health/ready` as a lightweight app+database readiness endpoint for Docker health checks, separate from integration/alarm health.

- **Authentication System** — Full login/logout flow with bcrypt password hashing, localStorage session management, and activity tracking:
  - Login page (`/login`) with modern gradient UI, email/password validation, and error handling
  - Logout page (`/logout`) with confirmation dialog
  - `/api/auth/login` endpoint: bcrypt verification, status check (ACTIVE required), lastLoginAt update, UserActivity logging
  - Admin user seed: Fatih Çelebigil (fatihcelebigil@gmail.com)
  - Password strength validation (8+ chars, uppercase, number, special character)
  - Session persistence via localStorage with cross-tab sync (storage events)

- **User Management System** — Complete RBAC-enabled user admin interface:
  - Modern card-based user list with avatars (initials fallback), search/filter by name/email/role
  - Stats dashboard: Total users, Active, Inactive, Admins
  - Create/Edit/Delete user dialogs with role assignment (Admin/Editor/Viewer)
  - Password change dialog with real-time strength meter and validation checks
  - Activity accordion per user (lazy-loaded recent activities)
  - Permission Matrix tab: Grid showing roles (columns) vs permissions (rows) with checkboxes
  - Database schema: Permission, RolePermission, UserActivity, Invitation, AuditLog models
  - API endpoints: `/api/permissions` (GET/PATCH), `/api/users/activities` (GET), `/api/users/password` (PATCH)

- **Dual-Bar UI Architecture** — Sidebar + TopBar navigation pattern:
  - **Sidebar** (left): Full navigation menu with collapsible sections, theme toggle, and dynamic user profile
  - **TopBar** (top): Notifications bell (with badge) + compact user profile (avatar + name + role + chevron)
  - UserProfile component: Reusable across sidebar (expanded) and topbar (compact mode)
  - Clickable user name in sidebar → dropdown menu (Settings, API Keys, Invitations, Logout)
  - Clickable profile in topbar → same dropdown menu
  - Cross-component state sync via localStorage + storage events

- **Radix UI Components** — Added shadcn/ui primitives:
  - `@radix-ui/react-accordion` — Activity expansion in user cards
  - `@radix-ui/react-avatar` — User profile avatars with fallbacks
  - `@radix-ui/react-checkbox` — Permission matrix toggles
  - `@radix-ui/react-popover` — User profile dropdown menus
  - `@radix-ui/react-separator` — Visual dividers in dropdowns

### Changed

- **Alarm settings catalog status** — Removed the stale manual “load 25 alarms” controls and now display the installed catalog count dynamically from the alarm definitions API.
- **Alarm Center lifecycle UI** — Alarm Center now reads incident aggregates instead of an ever-growing flat event list, supports lifecycle and archive filters, displays occurrence counts, and replaces destructive cleanup with closed-incident archiving.

- **NMS device edit UI** — Reorganized connection, SNMP, SSH, and polling settings into a responsive Turkish operations form with secure credential-state indicators and password visibility controls.
- **Header (TopBar) redesign** — Removed InfraScope logo and navigation menu from top bar. Now shows only notifications bell (left) and user profile (right). Navigation fully moved to sidebar
- **Sidebar user profile** — Replaced hardcoded "Yönetici / admin@infrascope.io" with dynamic UserProfile component. Shows logged-in user's name, email, avatar. Name/email clickable → opens settings dropdown
- **Layout structure** — `app/layout.tsx` now wraps content with `<Header />` (TopBar) + scrollable content area. Sidebar remains static left panel

### Fixed

- **Independent switch alarm evaluation** — NMS alarms now run even when FortiAnalyzer is missing or unavailable. Alarm scheduling starts once during application boot, performs an immediate first check, records every terminal check state, and no longer relies on a health endpoint side effect.
- **NMS reachability and port recovery timing** — Failed SNMP/SSH attempts no longer advance the last successful poll time, SSH-only devices participate in polling, and port up/down transition timestamps remain stable so five-minute debounce and auto-resolution work correctly.

- **FortiGate REST-only onboarding** — The optional SNMP fallback is now disabled by default, so an empty SNMP community no longer blocks a firewall created with REST credentials. Enabling SNMP still requires valid SNMP credentials.
- **Mobile application navigation** — Replaced the fixed-width mobile sidebar with an accessible header-triggered drawer so detail forms retain the full viewport width while desktop collapse behavior remains unchanged.
- **Aruba SNMP health polling** — Added support for formatted Net-SNMP TimeTicks values and inventory-based Aruba vendor detection while preserving generic IF-MIB port polling; removed hard-coded NMS SSH credential fallbacks.
- **Local middleware startup** — Removed Prisma from the Edge middleware dependency graph so local startup no longer fails before routing when database environment loading is unavailable to the Edge bundle.
- **NMS SSH credential editing** — NMS-monitored devices can now update SSH username, port, and password without exposing or overwriting the stored password when the password field is left blank.
- **Fresh-install NMS device details** — Added the missing NMS interface monitoring migration so device detail pages work on clean Docker databases.
- **Docker healthcheck false negatives before integrations are configured** — Customer and license-server compose health checks now use `/api/health/ready` so unconfigured FortiAnalyzer/VMware/NMS alarm health does not mark a fresh demo install unhealthy.
- **Port conflict: package.json hardcoded PORT=8170 vs Docker PORT=3000** — `npm run dev` and `npm run start` scripts now use `${PORT:-3000}` instead of hardcoded `8170`. Next.js now respects the `PORT` env var from `docker-compose.yml`, aligning container health checks (port 3000) with actual Next.js binding. Prevents `unhealthy` container status and 500 errors when running via Docker

### Changed

- **Dev server port: 3000 → 8170** — `package.json` dev/start scripts updated to use port 8170. `PORT=8170` env var passed to `dev-startup.sh` so alarm services curl the correct local URL. Matches Docker Compose external mapping (`8170:3000`)
- **Performance: FortiAnalyzer polling — exponential backoff** — Replaced all 4 hardcoded delays (6s, 1s, 4s×4, 5s×4) with `pollForResult()` that starts at 1s, doubles each attempt, returns as soon as data arrives (cap at 8s). Total worst-case reduced from 22s to 15s; typical first-data latency 1-3s
- **Performance: Dashboard two-phase loading** — Dashboard now loads `/api/dashboard/summary` (DB-only, ~100-200ms) first, showing instant metrics, then fetches external API detail data progressively. Eliminates perceived blank-screen wait
- **Performance: Dashboard summary endpoint enriched** — `/api/dashboard/summary` now returns VMware VM count + host details + datastore details, FortiGate policy count from DB, NMS online/offline device counts. Reduces need for separate API calls on initial load
- **Performance: Navigation skeleton loading** — Added `loading.tsx` server components for 5 heavy routes: alerts, network topology, locations, config-revisions, NMS devices. Instant skeleton UI during navigation instead of blank page
- **Performance: ReactFlow lazy-load** — Network topology page now uses `next/dynamic` to lazy-load the heavy ReactFlow canvas (165 KB+). Page shell renders instantly; topology loads asynchronously with spinner
- **Performance: Server-side cache for config-revisions** — FortiAnalyzer config-revisions results cached in-memory with 2-min TTL. Prevents redundant 5-15s FA log searches on page refreshes
- **Performance: PrismaClient connection leak fix** — Dashboard summary endpoint replaced per-request `new PrismaClient()` with shared singleton `prisma` import. Prevents connection pool exhaustion under load
- **Alerts dashboard refresh behavior** — Silent background refresh pattern replaces disruptive auto-refresh:
  - Added `refreshing` state separate from `loading` so auto-refreshes don't show spinner
  - Changed auto-refresh interval from 60s to 120s (silent mode, no loading indicator)
  - Removed redundant client-side auto-check (`POST /api/alarms/check` every 5 min) — server-side scheduler already runs every 10 min
  - Post-ack/cleanup/whitelist actions now use silent refresh

### Added

- **SWR client-side data caching** — Added `swr` package and `lib/hooks/useApi.ts` hook wrapper. Provides automatic request deduplication, stale-while-revalidate, and focus-based revalidation. Adopted in config-revisions page; available for incremental adoption in other pages
- **Config change alarm detail enrichment** — Before/after change details now visible in alarm messages and detail modal:
  - `cfgattr` field parsed for `->` before/after patterns (e.g., `status:enable->disable` → "Durum: Aktif → Pasif")
  - New value extracted from `msg` field when `cfgattr` only contains attribute name (e.g., "set status disable" → "→ Pasif")
  - FortiGate attribute names and common values mapped to Turkish labels (status→Durum, enable→Aktif, disable→Pasif, etc.)
  - Alarm detail modal shows structured "Değişiklik Detayleri" section reading from `rawData`: action badges (add=green, delete=red, edit=blue), Turkish config-path labels, attribute change table with old value (red strikethrough) → new value (green highlight)
  - Extended config change alarm handler to cover 8 additional codes: ADMIN_PRIVILEGE_CHANGE, ADMIN_PASSWORD_CHANGED, NEW_ADMIN_USER, SERVICE_GROUP_CHANGED, NAT_POLICY_CHANGED, SNAT_POOL_CHANGED, IPSEC_TUNNEL_CHANGED, SSL_VPN_SETTINGS_CHANGED, SCHEDULE_OBJECT_CHANGED
  - Backend helpers added: `parseCfgAttr()`, `getAttrLabel()`, `getValueLabel()`, `extractNewValueFromMsg()` in detection-engine.ts
  - Frontend helpers added: `parseCfgAttr()`, `getAttrLabel()`, `getValueLabel()`, `extractNewValueFromMsg()`, `getCfgPathLabel()`, `buildConfigChangeEntries()` in page.tsx
- **Performance: Reports page code splitting** — Reports page (`recharts` ~225 kB) split into lazy-loaded chunk via `next/dynamic`. Page shell (`page.tsx`) now 2.08 kB; `ReportsContent.tsx` + recharts loaded on-demand only when user navigates to `/reports`. First Load JS reduced from ~225 kB to ~90 kB
- **Performance: Alarm server-side pagination + infinite scroll** — Alarm list moved from client-side (200 items, `Array.slice()` pagination) to server-side `offset`/`limit` (25 per page) with `IntersectionObserver`-based infinite scroll. API `/api/alarms` now supports `source` and `search` params with code-prefix matching (vmware→VM_/SNAPSHOT_, switch→NMS_/SNMP_/PORT_, firewall→fortianalyzer/fortigate-sslvpn). Reduces initial payload and DB query time for 1000+ alarm datasets

### Added

- **NMS & VMware alarms in ALARM_QUERY_REGISTRY** — 18 alarm codes registered with dedicated query functions (ADR-002 compliance):
  - NMS: `NMS_PORT_DOWN` (nmsInterface query), `NMS_DEVICE_UNREACHABLE` (nmsHealthMetric query), `NMS_BACKUP_FAILED` (stub)
  - VMware: `DATASTORE_SPACE_CRITICAL`, `DATASTORE_SPACE_LOW`, `VM_CREATED`, `VM_DELETED`, `VM_POWERED_ON`, `VM_POWERED_OFF`, `VM_SUSPENDED`, `VM_RESTARTED`, `VM_CPU_CRITICAL`, `VM_MEMORY_CRITICAL`, `VM_RECONFIGURED`, `VM_CLONED`, `VM_MIGRATED`, `SNAPSHOT_CREATED`, `SNAPSHOT_DELETED`, `SNAPSHOT_REVERTED` (cached_events source=vmware JSONB filter)
  - Prevents NMS/VMware alarms from falling through to generic `performLogSearch()` which would query FortiAnalyzer (incorrect source)
- **FA session-expiry detection across all API methods** — `isSessionExpiredError()` + `invalidateSession()` pattern from `getStatus()` extended to 7 additional methods (ADR-003 compliance):
  - `getAdoms()`, `getDevices()`, `startLogSearch()`, `fetchLogResults()`, `getFortiView()` (add + poll), `getMitreAttackMatrix()`, `getMitreTechniqueDetails()`
  - Detects expired FA sessions (code=-11/-6, "invalid session", "login required") and invalidates cache immediately instead of retrying with dead session (which drives account lockout)
- **FA singleton enforcement** — 3 API routes replaced `new FortiAnalyzerService()` with `initSharedFortiAnalyzerService()` (Constitution İlke #10 compliance):
  - `app/api/integrations/fortianalyzer/route.ts` (GET handler), `app/api/integrations/fortianalyzer/mitre/route.ts`, `app/api/alarms/check-vmware/route.ts`
  - Prevents session pile-up from multiple independent instances not sharing global login state
  - Test action (`action=test`) intentionally keeps `new FortiAnalyzerService()` for credential validation with unsaved credentials
- **Auto-generated alarm catalog** — `scripts/generate-alarm-catalog.ts` reads `alarm-definitions.ts` and generates `docs/20-modules/alarms/DEFINITIONS.md` (98 definitions, grouped by category, sorted by severity):
  - Includes: TOC, severity summary table, per-category summary tables, per-alarm detail sections
  - Run via `npx tsx scripts/generate-alarm-catalog.ts`
- **Health endpoint enrichment** — `/api/health` now surfaces FA session status, event cache sync state, VMware version + sync status, and NMS agent status:
  - FA: `session.active` (login state), `eventCache` (lastSyncAt, isFresh, syncInProgress, consecutiveSyncFailures, nextSyncDelayMin)
  - VMware: `version` (vSphere version string), `lastSyncAt` + `lastSyncStatus` from IntegrationConfig table; uses `getStatus()` instead of bare `authenticateSOAP()`
  - NMS: `pollerAlive` (FastAPI /health), `pollingDevices`, `recentHealthMetrics`, `pollingActive`; degrades to `unhealthy` when devices are registered but no metrics collected in 10 min
  - NMS counts toward overall status (degraded if 1 datasource unhealthy, unhealthy if 2+)
  - Exported `getEventCacheStatus()` from detection-engine.ts for cache observability
- **Architecture documentation** — Two new docs replacing the stale archived `ARCHITECTURE.md`:
  - `docs/10-architecture/OVERVIEW.md` — System purpose, tech stack, data flow diagram, directory structure, alarm pipeline, session lifecycle, background services, architecture invariants
  - `docs/10-architecture/BOUNDED_CONTEXTS.md` — DDD-style decomposition into 8 contexts (Alarms, Integrations, Inventory, Topology, Security, Audit, NMS, Virtualization) with ownership matrix, cross-context communication patterns, and anti-corruption layers
- **Integration docs** — `docs/20-modules/integrations/` with README + individual docs for FortiAnalyzer (session lifecycle, log search), FortiGate (REST/SNMP/SSH modes, vendor-aware CLI), VMware (REST+SOAP dual API), NMS (SNMP polling, port-down, device discovery)
- **Quest Mode Guide** — `docs/QUEST_MODE_GUIDE.md` with 6 ready-to-run quests (anchor files, prompts, knowledge capture steps)
- **ADR-001** — Prefer Config Revision Events Over CMDB-Diff Alarms (13 CMDB-diff alarms disabled, ADMIN_CONFIG_CHANGE created)
- **ADR-002** — Alarm Query Registry Pattern (ALARM_QUERY_REGISTRY Map, cache+fallback engine)
- **Admin Config Change critical alarm** — Admin config changes from Config Revisions page now fire as `ADMIN_CONFIG_CHANGE` (CRITICAL) alarms, showing user, IP, device, VDOM, access method, and per-change breakdown
- **`pyvmomi` automation filter** — VMware automation events from `pyvmomi` (Python SDK) are now excluded from `VM_CLONED` and `VM_RECONFIGURED` alarms
- **NMS_PORT_DOWN race condition fix** — Two-layer dedup (in-memory Set + `interface_name` in cooldown key) prevents duplicate events created 1ms apart
- **FortiAnalyzer session lifecycle** — `logout()` before every login, `invalidateSession()` on expiry, `isSessionExpiredError()` detection. Prevents permanent FA account lockout
- **Product Constitution** (`docs/00-product/CONSTITUTION.md`) — 21 non-negotiable product principles + 7 architecture invariants
- **ADR framework** (`docs/10-architecture/adr/`) — Template + ADR-003 (FA Session Lifecycle)
- **Runbooks** (`docs/30-runbooks/`) — FA_ACCOUNT_LOCKED, DUPLICATE_PORT_DOWN_EVENTS, DATASTORE_CRITICAL

### Changed

- **Documentation reorganization** — All docs moved to `docs/` structure; stale v1.0 files archived to `docs/_archive/`
- **Docker docs** — Consolidated 3 Docker files into single `DOCKER.md`; archived redundant copies
- **Root README** — Updated to point at `docs/` as authoritative knowledge base; warns about stale top-level files

### Fixed

- **FortiAnalyzer "no TID" errors** — 31 alarm queries failing due to FA session pile-up (root cause: missing logout + stale session reuse)
- **VM automation noise** — 64 `VM_RECONFIGURED` + 63 `VM_CLONED` events from `BUSKI.LOCAL\fatih` (pyvmomi) now filtered
- **NMS_PORT_DOWN duplicates** — Same port generating 2 events 1ms apart (Elk_Sw_1 if10202)

### Removed

- `SETUP.md` — Empty file (0 bytes)
- `INDEX.md`, `ARCHITECTURE.md`, `DELIVERABLES.md`, `NEXT_STEPS.md`, `PROJECT_SUMMARY.md`, `QUICK_START.md` — Archived (v1.0 state, no longer accurate)

---

## [2025-06-12] — Dev Environment Stability & Performance Fixes

### Fixed

- **Docker Desktop rate limiting bypass** — All browser requests share Docker Desktop host gateway IP (`::ffff:192.168.65.1`), exhausting the 100 req/min limit. Added `DEV_BYPASS_IPS` Set in `lib/rate-limit.ts` that skips rate limiting for Docker Desktop gateway IPs, localhost IPs, and Docker bridge IPs. Permanent fix for recurring 429 "Too many requests" errors
- **Modal input focus loss on /racks** — `FormModal` component defined inside `RacksPage` caused unmount/remount on every state change, losing input focus. Replaced with two inline `<Dialog>` blocks (Add + Edit) directly in the return JSX (`app/racks/page.tsx`)
- **Fast Refresh infinite rebuild loop** — Duplicate route pre-warming in `entrypoint.sh` AND `dev-startup.sh` caused cascading Turbopack compilations, sending 17+ HMR rebuild messages to the browser. Removed duplicate pre-warming from `entrypoint.sh`; added 30s delay to `dev-startup.sh` pre-warming so it fires after user's initial page load
- **AbortError on dashboard unmount** — `fetchWithTimeout` created independent AbortControllers that threw uncaught AbortErrors when the component unmounted during Fast Refresh rebuilds. Replaced with shared `AbortController` (`abortRef`) that gracefully aborts all in-flight requests on unmount, with per-request timeout + parent abort signal chaining (`app/dashboard/page.tsx`)
- **Turbopack stale module cache** — `.next` cache inside Docker container had stale build artifacts from previous sessions. Fixed by clearing host-side `.next` directory (`rm -rf .next`) + container restart. The anonymous volume for `.next` (`- /app/.next` in docker-compose.yml) correctly isolates container cache from host

### Changed

- **`entrypoint.sh` simplified** — Removed background alarm pre-warming subshell (44 lines). Pre-warming is now handled exclusively by `dev-startup.sh` with a 30s delay to avoid Turbopack HMR conflicts
- **`dev-startup.sh` pre-warming delay** — Route pre-warming (`/dashboard`, `/devices`, core APIs) now runs in a background subshell with 30s delay after alarm services start. Prevents compilation cascade during user's initial page load
- **Dashboard fetch architecture** — All data loading functions (`loadSummary`, `loadVmwareData`, `loadNmsData`, `loadFirewallData`, `loadSSLUsers`) now use shared `AbortController` via `abortRef`. `isAborted()` helper silently handles AbortError. Per-request timeout uses child controller with parent signal chaining

### Added

- **npm packages** — `jose` (JWT), `pino` (logging), `@radix-ui/react-avatar`, `@radix-ui/react-popover`, `@radix-ui/react-separator` installed inside Docker container for dashboard/alerts page dependencies

---

## Template for new releases

### Added
### Changed
### Deprecated
### Removed
### Fixed
### Security

---

**Note:** This file is append-only. Never edit past entries.
**Guideline:** One line per user-visible change. Link to ADRs/runbooks where relevant.
