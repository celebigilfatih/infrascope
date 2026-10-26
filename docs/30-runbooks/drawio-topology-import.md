# Reviewed draw.io topology import

This local maintenance workflow imports a reviewed, uncompressed draw.io page into the existing inventory and topology. It does not probe devices, start monitoring or execute instructions found in drawing labels. Keep source drawings, selected snapshots, mappings, plans and database backups in ignored local output storage.

## Evidence and planning

1. Read the product constitution and topology guide. Take a PostgreSQL custom-format backup before changing inventory. Keep concurrent user edits intact.
2. Run `python scripts/read-drawio-topology.py <source.drawio> <evidence.json>`. Images are stripped from the evidence. Pairing candidates require review; proximity alone does not prove device identity or physical location.
3. Prepare a reviewed mapping with the exact source SHA-256, page ID, existing organization ID and node entries (`labelId`, `refs`, `name`, nullable `managementIp`, `rawIps`, `type`, `vendor`, `model`, nullable `buildingName`/`floorNumber`, `locationEvidence`, `notes`). Resolve shared HA addresses, VRRP addresses, stacks and copied labels explicitly. Retain ambiguous values as notes rather than guessing.
4. Export a selected snapshot with `node scripts/import-drawio-topology.cjs snapshot <snapshot.json>` using the application's environment. The CLI uses the shared Prisma client.
5. Run `node scripts/drawio-topology-plan.cjs <evidence.json> <snapshot.json> <mapping.json> <plan.json>`. Review all devices, locations, endpoint names, held edges and issues, then verify the original file hash again.

Existing devices are reused by an unambiguous management IP. Existing names, types, monitoring associations, credentials, health and rack placement remain authoritative. Unknown-address devices use source-cell identities. Direct floor placement uses `Device.floorId`; it does not create fictitious rooms or cabinets. Building transfers clear stale direct floor assignments; assigning a cabinet clears direct building/floor placement.

NMS `ifNNN` identities are matched through physical interface descriptions while retaining their original reservation keys. Numeric port suffixes match only one physical candidate. Multiple matches or conflicting reservations remain unresolved. Device-to-device drawing links can retain zero or one known port endpoint. Missing media, speed and live status remain unknown. Normal manually created links still require both ports.

In building views, a discovery observation with the same device pair and all known drawing ports does not add another visual edge. Parallel observations on different ports remain separate. A portless drawing link cannot identify a discovery edge. This visual deduplication does not change the drawing's recorded ports or claim that its live status was verified. Floor filtering shows links whose two devices are in that scope; the interface explains how to return to cross-floor connections.

## Applying and verification

Run the isolated import and topology checks plus TypeScript and scoped lint before applying. Apply with `node scripts/import-drawio-topology.cjs apply <plan.json> <current-active-admin-id> <reviewed-plan-hash>` in the application environment. A fresh valid local license cache and sufficient licensed device capacity are required.

The importer verifies the plan digest and current identity/location/port snapshot, then writes all records, provenance, registry and audit entry in a serializable transaction. A changed snapshot requires replanning. A repeated identical plan returns the recorded outcome without writes; a different plan for an already imported page requires explicit reconciliation. Do not delete the registry to force another import.

Read back every planned device, floor, interface and link. Check reused IDs and NMS associations, endpoint ownership/reservation keys, unchanged manual building connections and unknown state for drawing-only evidence. Account for every source edge as imported, duplicate or held. Verify floor filtering, drawing provenance and full paginated inventory in the browser. Restart the development web process after Prisma generation if its loaded client is stale.

Database backups are recovery artifacts, not a routine undo operation: a full restore can overwrite later user activity. Reconcile or remove imported records only with explicit scope and current-reference checks; preserve immutable audit history.

## Completing reviewed mappings

Use `scripts/reconcile-drawio-topology.cjs` to prepare a separate correction artifact from the immutable original plan, source evidence, current selected snapshot, original mapping, reviewed decisions and selected NMS observations. Apply it through `scripts/import-drawio-topology.cjs reconcile <correction-plan> <active-admin-id> <plan-hash>`. The original import registry is retained; each correction has a separate hashed registry and append-only audit entry, with duplicate-safe replay and serializable snapshot checks.

Only explicitly reviewed held edges are eligible for new device links. Resolve floating endpoints against the source drawing, retain ambiguous endpoints and distinguish network-scope illustrations from physical devices. NMS hostname aliases are accepted only for a unique inventory owner; port enrichment requires a recent observation corroborated by the known endpoint and compatible source labels. Conflicting observations and competing port claims remain unassigned. A user-confirmed label correction is recorded explicitly.

Numbered vendor descriptions such as `24 Gigabit - Level` can identify the exact physical port. A placeholder interface created by the original import may be merged into that NMS interface only when the source identity matches. Retire the old placeholder only after confirming it has no IP, MAC, VLAN, changed interface type/status or remaining switch/connection/endpoint references; save its full pre-change row in the correction registry. Any unexpected reference or user data aborts the complete transaction. Preserve NMS interfaces, historical aliases and unrelated inventory.

Shared HA addresses belong to the pair's source evidence. Release an incorrectly assigned drawing-only member address only with user confirmation, preserve that member's ID and metadata, and create a second member using its distinct source-cell identity. This is not permission to rename or clear management addresses on pre-existing monitored inventory.

Additional checks: `scripts/check-drawio-reconciliation.cjs` covers source/actor/hash/snapshot guards, NMS ambiguity/staleness, physical reservations, metadata preservation, placeholder retirement guards, transaction rollback and idempotent replay. Take a new local backup before applying corrections and verify the written locations, floors, endpoint ownership, registry and audit counts afterwards.

## BUSKİ mapping decisions

- D Blok maps to the existing Genel Müdürlük building (user confirmed).
- ISLETMELER_SW1 maps to İşletmeler; ISLETMELER_SW2 maps to İşletmeler 2 (user confirmed).
- The two FortiGate 400F HA members remain distinct; the shared management address is retained as source evidence, not assigned to both members.
- The copied Gençosman/Görükle router IP remains unresolved for Gençosman.
- A label containing both ZEMIN and KAT8 has no floor assignment until clarified. Other unproven locations and port ambiguities remain in the local review report.

Checks: `scripts/check-drawio-topology-import.cjs`, `scripts/check-building-devices.cjs`, `scripts/check-building-device-connections.cjs`, `scripts/check-building-connections.cjs`, `scripts/check-topology-workspace.cjs`. The import checker uses synthetic records and no live database writes.
