# InfraScope UI conventions

The application uses the icon, spacing and semantic-color treatment established by the dashboard and Olay Merkezi. New screens should use the shared components rather than copy page-specific color classes.

## Navigation and language

`components/layout/navigation.ts` defines Turkish navigation labels, route matching and section icons for the sidebar and topbar. Its section icons come from the same map as `PageHeading`. Add or rename routes here, and keep the corresponding page heading in Turkish. Preserve proper product names and protocol abbreviations (VMware, FortiAnalyzer, SNMP, IPsec). Stable section IDs preserve saved collapse preferences when labels change. The longest matching route is the active menu item; nested routes must not highlight two items.

The mobile drawer supports Escape, keyboard focus containment, background isolation and focus return to its opening button. Account and notification popovers share the same surfaces, labelled controls and semantic palette as the rest of the application.

## Page identity

Use `PageHeading` from `components/ui/page-heading` for application page headings. Select the appropriate `section`; its icon is decorative, and the title remains an accessible `h1`.

```tsx
<PageHeading section="devices" description="Fiziksel ve sanal varlıkları yönetin.">
  Cihaz Envanteri
</PageHeading>
```

Keep actions beside the heading on desktop and stack them on narrow screens. Use `compact` for constrained workspaces such as the room viewer. Use `showIcon={false}` only when the surrounding header already supplies its own identity icon. Authentication and setup screens retain their separate layout.

When returning early for a loading or error state, wrap that state in `PageStateFrame` so the screen keeps its section icon and heading.

## Status and priority

- `StatusBadge` presents known operational states, with a readable label and icon. Unknown source values remain neutral; they must never be shown as healthy by default.
- `SeverityBadge` presents `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `INFO` and their `ALARM_` equivalents.
- `SemanticBadge` supports domain-specific wording and icons. Polling freshness, account roles and lifecycle states should retain their own meaning rather than borrow an unrelated state label.
- `Badge` remains suitable for counts, categories and existing variant-based labels. Its `success`, `warning`, `destructive` and `info` variants use the shared palette. Pass `icon={null}` for compact numeric counters.

The five tones are success (green), warning (amber), danger (rose), information (blue) and neutral. Their light/dark values and primary-action colors are defined once by `--ui-*` variables in `app/globals.css`. Status information must also be conveyed by text; color alone is insufficient.

## Controls and surfaces

Use the shared `Button`, `Input`, `Select`, `Card`, `Table`, `Tabs`, `Popover`, `Dialog` and `AlertDialog` components. They provide consistent corners, borders, icon gaps, focus states and viewport bounds. Their explicit `className` overrides remain available for specialized workspaces and visualizations.

Use a recognizable icon for an action and keep its text label. `ActionIcon` supplies common actions when a screen does not need a custom Lucide icon. Every icon-only button needs an accessible name, preferably including the affected record (for example, `Cihaz A cihazını düzenle`). Do not add an icon to a count or category simply to fill space.

Dialogs support scrolling within the viewport, a labelled close control and return focus to the opening control. Caller-provided autofocus handlers retain priority. Select and popover portals must remain above their parent modal. Preserve native keyboard interaction and reduced-motion preferences.

Tables may scroll horizontally inside their own container. Pages and modal shells should not require horizontal scrolling. Specialized charts, topology canvases and room viewers retain their interaction model.

## Turkish interface copy

Keep buttons, table headings, filters, placeholders, loading/empty states and validation text in Turkish. Preserve vendor/product names, protocol abbreviations, user-entered names and technical identifiers.

Use `uiLabel` and `auditActionLabel` from `lib/i18n/tr` when rendering known enum values. Keep each option's original `value`, state keys and request payloads intact. Unknown source codes remain identifiable. `uiError` localizes known API, transport and validation messages at the display boundary; `api-errors.tr.ts` contains application-owned API copy. Original response objects and diagnostics remain available unchanged.

Import Zod through `lib/i18n/validation` for Turkish default validation issues and supply Turkish custom messages. The shared `Input` provides Turkish native constraint messages while preserving caller handlers. Use the `tr-TR` locale for displayed dates and numbers; keep machine timestamps and serialized values unchanged.

Run `npm run test:ui-turkish` when updating language helpers. It verifies localized display, preserved identifiers/payloads and Turkish validation without live requests.

## Verification

The room workspace uses labelled 3B/plan tabs, a filter shared by both scenes, numbered cabinets in the plan, and a separate capacity/device inspector. Display-only camera changes preserve the selected cabinet. Plan editing saves on drop and must restore original coordinates on cancellation or failure. Run `npm run test:room-layout` for isolated pointer, filter, collision and save/rollback checks without live requests.

The cabinet workspace uses the same capacity calculation as the room view, including each device's `metadata.unitHeight`. Its elevation shows saved U positions only, with U 1 at the bottom; unassigned devices appear in the device list and their estimated capacity is labelled separately. Overlaps must remain visible rather than cover one device with another. `npm run test:rack-workspace` verifies these cases and explicit list refresh without live requests or writes.

The device inventory exposes cabinet, room, saved U range and device height together. Its placement editor previews changes before saving, explains pending positions, and offers the first contiguous free range. UI and API validate cabinet bounds and overlaps while excluding the edited device; height updates preserve existing metadata. Filtered totals cover all matching rows; placement summaries explicitly cover the current page. Run `npm run test:device-inventory-ui` for isolated query, placement, API and metadata checks without live writes.

The cluster workspace keeps reported vCenter health, ESXi connection, power and maintenance states distinct. Cluster membership comes from SDK MoRefs, including duplicate names. Resource totals are physical CPU/memory, without subtracting HA reservations; usage appears only when every member has a current measurement. Unknown values stay unknown. Memory uses GiB/TiB; CPU MHz are displayed as GHz. `type=cluster-workspace` is a read-only, source-scoped cached API; manual refresh bypasses its cache. Existing lightweight cluster consumers retain their response contract. Run `npm run test:cluster-workspace` and `npm run test:cluster-collector` for isolated presentation, API, bridge and collector checks.

Source semantics: [ComputeResourceSummary](https://developer.broadcom.com/xapis/virtual-infrastructure-json-api/latest/data-structures/ComputeResourceSummary/) and [Host quick stats](https://developer.broadcom.com/xapis/vsphere-web-services-api/latest/vim.host.Summary.QuickStats.html). No inferred HA headroom is presented as allocatable capacity.

The ESXi workspace uses `type=host-workspace`, with the same source authorization, five-minute cache and explicit refresh as clusters. It reads all HostSystem objects, including standalone hosts. A parent ClusterComputeResource supplies the exact cluster ID; a ComputeResource parent means standalone, and an unknown parent remains unknown. Reported health, connection, power and maintenance remain distinct. Missing/offline measurements do not become zero usage. Summary totals cover the complete source; filters/pagination affect the list, and CSV includes all filtered pages. The cluster link opens the matching ID in the cluster inspector. Run `npm run test:host-workspace`, `npm run test:host-workspace-collector` and the cluster checks when editing the shared SDK projection.

The VM workspace uses the read-only `type=vm-workspace` SDK projection, with source-scoped caching and explicit refresh. Runtime power is independent of the guest OS state; the executing ESXi comes from `summary.runtime.host`, not the VM's folder parent. Known templates are omitted. Configured vCPU/memory remain separate from measured CPU/active memory. CPU usage (MHz) is compared to runtime `maxCpuUsage`, a current upper bound, not a reservation. Guest active memory (MB) is compared to configured memory and never subtracted to claim free guest RAM. Host-consumed memory includes overhead and is labelled separately. Missing/offline measurements remain unknown; valid zero remains zero. The ESXi link opens the exact host ID. Power actions retain the existing API contract, require write capability and explicit confirmation, and never optimistically change the reported state. Capability is added per request outside the shared data cache. Run `npm run test:vm-workspace` and `npm run test:vm-workspace-collector`; these use synthetic SDK records and mocked power writes only.

VM metric semantics: [VirtualMachine runtime](https://developer.broadcom.com/xapis/vsphere-web-services-api/latest/vim.vm.RuntimeInfo.html) and [VM quick stats](https://developer.broadcom.com/xapis/vsphere-web-services-api/latest/vim.vm.Summary.QuickStats.html).

The datastore workspace reads `type=datastore-workspace` without changing the legacy datastore API. It retains byte precision and derives used bytes from total minus free bytes. Only accessible, complete, consistent measurements enter summary totals; partial totals explicitly identify their coverage. General occupancy divides summed used bytes by summed capacity, rather than averaging percentages. Each datastore MoRef is counted once regardless of host count. Known zero free bytes means full storage; missing values never become zero. GiB/TiB labels match binary conversion. Default visual thresholds remain 75% warning and 90% critical. Datastore access, maintenance and per-host mounts are distinct. Exact host MoRefs identify links and filters; unknown mounts differ from an empty list. The source-scoped five-minute cache supports manual bypass, preserved data after failed refresh and a visible stale-cache state. Run `npm run test:datastore-workspace` and `npm run test:datastore-workspace-collector` with synthetic data, then inspect host details, full/unknown capacities, filters, pagination and mobile/dark layouts.

Storage source semantics: [Datastore summary](https://developer.broadcom.com/xapis/vsphere-web-services-api/latest/vim.Datastore.Summary.html) and [Host mount information](https://developer.broadcom.com/xapis/vsphere-web-services-api/latest/vim.host.MountInfo.html). Aggregate datastore accessibility does not prove access from every host; unvalidated capacity is not presented as usable space.

The snapshot workspace uses the read-only `type=snapshot-workspace` projection and a two-minute source-scoped cache. Manual refresh and post-mutation reads bypass it. VM IDs plus snapshot IDs identify rows and actions; display names and snapshot IDs alone are insufficient. Dates are displayed in Europe/Istanbul with explicit TSİ labels, while wire timestamps stay UTC. Elapsed-time age markers start at exactly 7 and 30 days; these are visual review thresholds, not changes to alarm rules or vendor retention policy. Missing or future dates remain neutral. Age updates independently of the cached source timestamp.

Snapshot size means associated file bytes, including disk chains, base disks, state and optional memory files resolved through each snapshot's layout references. It is not incremental storage or reclaimable space. Each VM's shared file references enter the summary once. Different VMs retain independent file namespaces, so the total is not a deduplicated storage allocation measure across linked clones. Missing layouts or file measurements stay unknown; partial summary coverage is labelled. Existing snapshot alarm/legacy API contracts remain intact. Create/delete/revert payloads remain unchanged; capabilities are evaluated per request outside the cache, and delete requires both write and delete permission. UI confirmations name the VM and snapshot; stale reads block writes. Run `npm run test:snapshot-workspace` and `npm run test:snapshot-workspace-collector`, then check create, cancel, failure, permissions, VM links, CSV, pagination and mobile/dark views using mock writes only.

Snapshot size sources: [Snapshot layout](https://developer.broadcom.com/xapis/vsphere-web-services-api/latest/vim.vm.FileLayoutEx.SnapshotLayout.html), [Disk unit references](https://developer.broadcom.com/xapis/vsphere-web-services-api/latest/vim.vm.FileLayoutEx.DiskUnit.html) and [File sizes](https://developer.broadcom.com/xapis/vsphere-web-services-api/latest/vim.vm.FileLayoutEx.FileInfo.html).

The shared disposable regression command, `npm run test:incidents:regression`, also runs five snapshot browser cases in `tests/incident-e2e/snapshot-workspace.spec.ts`, strict workspace lint and the snapshot model/collector checks. These browser cases use the fixture database for authentication and intercept every VMware read and write. They cover pagination, filtered CSV, the exact VM deep link, create/cancel/failure/retry, confirmation targets, duplicate submission guards, stale/error states, read-only capabilities and mobile light/dark layouts. They do not validate a live vCenter task.

For shared component changes, run TypeScript and targeted lint, then inspect a populated table, a form dialog, a filtered/empty state, and a narrow screen in both themes. Check that existing data, permissions and write operations are unchanged. The dashboard and incident presentation regression scripts cover the previously established screens.
