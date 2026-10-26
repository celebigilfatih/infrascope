# Remaining workspaces and route review

A route-level review after the dependencies workspace identified six remaining customer pages with legacy body layouts: /reports, /analytics/capacity, /analytics/forecast, /analytics/sprawl, /infrastructure/capacity and /dashboard/risks. Their shared heading alone had previously been updated. Customer-navigation pages and NMS/firewall detail/edit screens already have module-specific layouts. Authentication/setup flows retain their distinct entry-page layout; the IPS/DoS page remains deliberately disabled. License-server administration remains mode-specific. The six reviewed routes are now exposed in the customer sidebar as described below. The disabled IPS/DoS feature remains absent from the menu.

## Common presentation

The six pages now use shared headings/icons, semantic badges, themed cards, responsive layouts and Turkish labels. Analysis pages share local source search, metric/status filters, ten-record paging, record dialogs, response receipt times and analysis cross-links. Capacity adds a labelled 1/7/30-day selection. CSV exports all filtered results (including other pages), quoting semicolon-delimited fields and guarding spreadsheet formulas. Failed refreshes retain previous results with clear warnings; source-period changes keep the previous period identified. Superseded reads are aborted and cannot replace newer results. Automatic polling was replaced with explicit refresh so inspecting or exporting a result remains stable.

## Analytics evidence and existing collection

The existing authorized VMware capacity-trends, growth-forecast and sprawl contracts remain in use through lib/api.ts. This change does not alter their calculations, profile selection or source lifecycle. Invalid envelopes or duplicate identity tuples fail validation. Invalid numeric values remain unknown, zero remains zero, and unrecognized state is never rendered as normal.

Capacity currentValue is the recent-group mean and trendPercent is a difference in percentage points, not a relative percentage. Resource averages are explicitly unweighted and represent valid source/metric pairs, not a capacity-weighted cluster total. Individual details separate response receipt from the latest available sample timestamp.

The existing forecast implementation regresses against sample indices, not elapsed timestamps. Its nominal 30/60/90 outputs are therefore presented as forward sample steps, with an explicit limitation instead of claiming calendar-day forecasts or a reliable fill date. No forecast confidence interval is invented. Invalid/out-of-range percentages remain unknown.

Sprawl is presented as review candidates, not proven waste or a delete recommendation. The screen derives Turkish reasons from recorded power and snapshot facts. It does not repeat the legacy unverified 30+ powered-off-day claim or a recommendation to delete a VM. Unknown host/power/snapshot age remains unknown. Review guidance links the decision to ownership, workload and backup needs.

Existing explicit collect-metrics is preserved behind a contextual dialog. A synchronous lock prevents duplicate starts; pending collection does not replace the read view. The acknowledgement distinguishes partial collection (with a safe count) from complete collection and does not display raw integration diagnostics. Unconfirmed collection blocks another start until a successful manual refresh. Source authorization continues on the server. Collection was exercised only through the isolated synthetic transport during QA.

## Reports

GET /api/reports/workspace is an additive selected read boundary; legacy /api/reports contracts remain untouched. It uses the shared Prisma client and current ACTIVE devices/read actor, with an additional alarms/read check for the incident section. Each inventory, cabinet, VMware and incident section has its own repeatable-read transaction, timestamp and failure state. Responses are private/no-store. A failed section cannot silently become zero or prevent the others being shown.

Inventory aggregates the complete database with groupBy, avoiding the legacy first-1,000-device sample. VMware numbers are recorded database counts across sources, not live source-health or synchronization evidence. Open incidents are OPEN and ACKNOWLEDGED records, rather than the old capped trigger list. Cabinet reporting reuses presentRack: saved occupied U, nominal U, estimated unpositioned U and placement conflicts are distinguished. It reads selected cabinet/room/device placement fields; server-only metadata used for unit height is never returned. More than 10,000 cabinets or 50,000 assigned devices fails that section explicitly. Room identity is preserved so equal room names do not merge.

Power/cooling estimates and inferred source-use percentages are not shown as measured values. Reports provide links to the existing detailed resource workspaces. Distribution bars have textual labels and exact counts, remain usable in dark mode and replace the previously English chart legends. Reports no longer load the unused chart package.

## Unavailable sources

The old /infrastructure/capacity and /dashboard/risks pages contained fixed sample values. Those production samples were removed. Power/cooling and a unified asset-risk score currently have no verified data provider, so the pages state this and link to actual cabinet, datastore, host, risky-policy, incident and monitored-device workspaces. They do not invent percentages or assert that no risk exists.

## Verification

node scripts/check-analytics-workspace.cjs runs the real pure models, current-actor permission path, rack placement helper and new report handler against isolated persistence. It covers unknown/zero, percentage-point formatting, forecast sample semantics, unverified power-duration suppression, CSV quoting/formula guards, complete counts beyond 1,000, saved versus estimated U, bounds, independent section failures, private projection and active/role gates. Full TypeScript and scoped ESLint run for the changed paths.

Browser QA used the real components with explicit TEST VERİSİ / Gerçek yazma: 0 labels under output/remaining-screens-refresh. Checks passed for report tabs, independent capacity failure, preserved inventory, metric/status filters, paging, detail timestamps, zero/unknown values, stale scope labels, empty results, partial collection and unconfirmed retry locking. CSV download contained the six filtered VM rows and Turkish headers, with no unverified source claims. At 390×844, dark reports, forecast dialog, static pages and record cards had no horizontal overflow. Screenshots are in the output directory.

An independent live /reports read succeeded: inventory, cabinet, VMware and incident sections rendered real database results. Cabinet details separated saved placement from estimates. No real metric collection or inventory/security write was performed for QA.

## Sidebar discoverability

At the user’s request, Riskli Varlıklar is grouped under Genel Bakış, Güç ve Kapasite under Fiziksel Altyapı, and the four report/analysis pages under Raporlar ve Analiz (stable ID Analytics). Each item reuses its existing route and shared page icon. The six routes were removed from the breadcrumb-only fallback list so labels and icons have a single navigation source. The Riskli Varlıklar breadcrumb now matches its page/menu label. License-server navigation remains separate. Existing active-item matching, automatic expansion of the active group, stored section preferences, collapsed icon labels and mobile close-on-navigation behavior apply to the new entries.

Navigation verification passed for six unique sidebar routes, exact active matching, existing nested routes and separate license navigation. Live browser checks confirmed Riskli Varlıklar and Güç ve Kapasite navigation, the matching risk breadcrumb, active report highlighting, automatic reopening of the closed Analytics group, and accessible labels/titles in the 80px collapsed menu. At 390×844, the mobile menu remained 288px wide without document overflow, keyboard Tab reached the next analysis link, and selecting a new link closed the menu. The viewport and expanded sidebar state were restored. TypeScript, scoped ESLint and diff whitespace checks passed. Screenshots are retained under output/sidebar-discoverability/screenshots.
