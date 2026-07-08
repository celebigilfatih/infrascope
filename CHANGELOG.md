# Changelog

All notable changes to InfraScope will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added

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

- **Header (TopBar) redesign** — Removed InfraScope logo and navigation menu from top bar. Now shows only notifications bell (left) and user profile (right). Navigation fully moved to sidebar
- **Sidebar user profile** — Replaced hardcoded "Yönetici / admin@infrascope.io" with dynamic UserProfile component. Shows logged-in user's name, email, avatar. Name/email clickable → opens settings dropdown
- **Layout structure** — `app/layout.tsx` now wraps content with `<Header />` (TopBar) + scrollable content area. Sidebar remains static left panel

### Fixed

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
