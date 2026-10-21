# Network groups

Network groups provide a collapsible logical layer on the existing building and device maps. They do not create physical devices or connections. Building-level device workspaces remain unchanged.

## Operator workflow

- The device overview uses the same circular group component as the balanced building map. **Ağ özeti** includes actual endpoints of known cross-location links and explicit group centers; it does not infer a location from connectivity. Visible/total counts, folded devices and devices outside the summary remain explicit. **Tüm cihazlar**, location selection, global filters and Turkish name/IP search reach the complete inventory; hidden group members continue to open through the existing group/site focus workflow.
- Device selection shows its actual direct peers, including peers across locations, without inferring link status or direction. The connection list keeps every physical and parallel record in scope with source/target port names and honest missing-port text. An optional visual forest suppresses extra lines only; it does not designate primary or backup routing. The extra-line toggle restores all paths. Grey unknown physical paths and teal logical group summaries retain different meanings.
- **Cihaz ve bağlantı seçenekleri → Ağ gruplarına odaklan** brings the source and circular group into view; the card's existing open/details actions remain functional. On narrow screens, this explicit focus centers the circular group at readable scale. **Ekrana sığdır** fits the complete scope; **Okunur görünüm** restores readable scale. Device icons use concentric network-style placement and soft curves with separate lanes for parallel links. The saved/editable device layout is available under map options and is never overwritten by display layout, selection or filtering.

- The building overview defaults to **Dengeli görünüm**: the most connected building is centered, surrounding buildings retain their icons, and only network-group cards use the large circular design. The logical group path has its own east-facing corridor. **Harita seçenekleri → Kayıtlı düzen / Düzenleme** opens the original manual map; **Dengeli görünüme dön** restores the display preset. This choice is stored in the browser and never rewrites saved coordinates.
- Physical cross-links between the hub's direct neighbors are summarized by an explicit hidden count and a **Göster** toggle; selecting an endpoint also reveals its cross-links. Other components and parallel physical records are preserved. Colors retain existing connection metadata, grey dashed paths remain unknown, and the teal dashed group path is a logical summary. Unlocated devices are accessible separately. Building/group search, the location list, filters and PNG export remain available from the compact toolbar.

- Open **Ağ grupları** to inspect groups, or **Ağ grubu oluştur** to create one. The device action **Bu noktadan ağ grubu oluştur** preselects its source. Inventory-interface actions also preselect the owned interface.
- Select the organization, group name/type, source device, optional source port and member locations. Source locations cannot be members. A location belongs to one group; groups cannot be nested. Discovery does not alter membership.
- **Grubu aç** opens one group focus surface within the existing map workspace. The source device and independently measured line status lead into an outlined group containing alphabetically ordered site cards. The building tab shows site/device counts; the device tab lists the actual member devices and IP addresses inside those cards. Opening a site or device reuses its existing building topology with real port links. This avoids drawing both the physical site spokes and a second set of membership spokes on the overview.
- **Tüm ağa dön / Grubu kapat** restores the folded overview, with existing manual coordinates unchanged. One focused group is remembered in browser storage. Search automatically reveals the owning group and focuses a site or opens the searched device in its building workspace. Searching outside the group returns to the overview. Group-local search matches Turkish site/device names and IPs; active global device filters remain effective. Filtering never changes group membership or its total counts.
- The focused surface uses normal-size text and a responsive, vertically scrollable card grid rather than fitting all sites into a tiny zoom. Buttons, scroll region, source details, line/central connection list, full-map toggle and PNG export remain accessible. Collapsing returns keyboard focus to the original group toggle when it is visible.
- The detail view distinguishes selected-port line status from member-device inventory status. No selected port or a measurement older than 15 minutes means unknown line status. No branch failure is inferred from a common uplink.
- Moving a group in edit mode saves its position independently for the building/device view. Existing saved building/device positions are not replaced. Deleting a group removes only the logical group and its memberships.

## API and data

`GET /api/network/groups` returns groups and `canManage`; `?options=1` returns organization/location/source options, and adding `sourceDeviceId` returns its port catalog. Authenticated reads use no-store responses. `POST /api/network/groups`, `PATCH /api/network/groups/:id` and `DELETE /api/network/groups/:id` require `devices/write`.

Configuration writes include `name`, `kind` (`WAN`, `VPN`, `MPLS`, `LAN`, `OTHER`), `organizationId`, `sourceDeviceId`, nullable `sourcePortId` and `memberBuildingIds`. Updates/deletes require the current `version`. Position-only PATCH uses `{ version, position: { view: 'building' | 'physical', x, y } }`. Conflicting membership, names, versions or concurrent transactions return 409. Audit failure rolls back the mutation.

Schema migration: `20261020080000_network_groups`. It adds `network_groups` and `network_group_members`; it does not backfill or modify inventory. Apply with the normal migration deployment workflow after a database backup and regenerate the Prisma client.

## Reviewed drawing bootstrap

Run within the application environment with the shared Prisma client:

```text
node scripts/seed-drawio-network-group.cjs <original-plan.json> <source-IP> <group-name> <active-admin-id> <expected-sites> --preview
node scripts/seed-drawio-network-group.cjs <original-plan.json> <source-IP> <group-name> <active-admin-id> <expected-sites> --apply
```

The original import must already exist. Membership derives only from reviewed drawing-router identities connected to the unique source, with current building IDs in the original organization. Uncertain source ports remain null. The registry prevents duplicate bootstrap; intentionally edited/deleted groups require explicit reconciliation. Source drawings, plans, backups and installation-specific verification stay in ignored local output.

Validation: `npm run test:network-groups`, existing topology building/workspace and device-inventory regressions, TypeScript and scoped lint. Device deletion rejects an active group anchor with a Turkish 409 response, including a concurrently introduced FK reference. After bootstrap, verify membership count, null/owned source port, unchanged inventory/link records and duplicate-safe replay.
