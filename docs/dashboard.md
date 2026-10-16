# Operations dashboard

`/dashboard` retains the selected card and chart layout and uses the same complete sidebar as the interior pages, including collapse preferences, grouped navigation and the user footer. Its green accents, focus rings and chart shades derive from the shared `primary`, `primary-foreground` and `ring` theme tokens in both light and dark appearance. The content adapts to the available width when the sidebar is expanded or collapsed. It uses the installation's database and existing session; no new configuration or migration is required.

## Data and controls

- `GET /api/dashboard/summary` returns inventory, active incident counts, priority incidents, source states and monitoring coverage. Coverage is the number of NMS-linked devices with polling enabled divided by network inventory (switch/router/firewall or NMS-linked devices). This is not uptime. A successful poll within ten minutes counts as fresh even when the separate inventory status is `UNKNOWN`.
- `GET /api/dashboard/analytics?deviceId=<inventory-id>&range=24h` requires a session and a linked NMS device. Allowed ranges are `6h`, `24h`, `7d`; the default is `24h`. Aggregations contain 24, 24 and 28 bounded buckets respectively, with average and peak values. The default device is selected from a high/critical open NMS device incident, then from polling inventory. The selector lists up to 250 devices; search can select devices outside that list.
- `GET /api/dashboard/search?q=<text>` requires a session and 2–100 characters. It returns up to six device name/IP matches and four active incident title/code matches, with explicit safe field projections.
- The existing incident endpoint supplies the exact selected incident's details. Opening a detail dialog does not change its lifecycle.
- The resource card's download control exports the selected device's real resource buckets as UTF-8 CSV. There is no download when no samples exist.

Metrics outside 0–100 are omitted; zero remains a valid measurement. Missing intervals are null, never invented, interpolated or replaced with zero. Latest values retain their collection timestamps. Chart ranges apply to history while the labeled latest values can predate the selected range. Disabled polling, stale data and unconfigured integrations are explicit. Read failures show errors with retry controls; refresh failures retain a labeled last successful view. Requests are cancelled on selection changes and have a 15-second timeout. Visible pages refresh every minute and when brought back into view.

## Verification

Run `npm run test:dashboard` for isolated read-route regressions, including authorization, validation, parameterized query bounds, missing/zero values, coverage, incident mapping, empty installations and source failures. Run `npm run type-check` for the shared contracts. The dashboard GitHub workflow runs both checks for affected pull requests.

Visual comparison and browser interaction evidence are recorded in [`design-qa.md`](../design-qa.md). The compact integration marks reuse the existing brand SVG assets with cropped view boxes.
