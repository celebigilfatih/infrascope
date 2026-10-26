# ADR-029: Logical network groups over preserved physical topology

**Status:** Accepted  
**Date:** 2026-10-20

## Decision

Store named, organization-scoped network groups and explicit building memberships in separate relational tables. A group references an existing source device and an optional owned catalog port. Membership is operator-managed, exclusive per building and non-nested in v1. Physical port occupancy is neither reserved nor changed by a logical anchor. Source-device deletion is restricted until dependent groups are removed or reconfigured.

Render the overview as a pure projection over building and general device graphs. Collapsing hides member icons and internal paths, and represents external paths—including backup paths—with distinct logical summary edges. Opening a group replaces the overview canvas with a focused, responsive source → group → site surface in the same workspace. One group is focused at a time; sites retain their existing building workspaces for real device/port graphs. Physical records and membership are not redrawn as duplicate spokes. The general device tab lists devices inside their site cards. Virtual relations never contribute to physical inventory totals. Search reveals the owning group before focusing a hidden site or opening a device in its site workspace.

Group edits, membership replacement and append-only audit entries share a serializable transaction. Version checks reject stale writes; a database uniqueness constraint protects membership races. Deleting a group cascades only its memberships. Existing device identities, locations, port assignments, manual positions and physical connections are preserved.

Group positions are independent per map view. Folding is a browser preference. Unsaved/generated layout may adapt to the visible buildings; persisted physical positions remain authoritative. Group load failure leaves the existing flat topology usable and shows an error. Only recent selected-port evidence can provide a line status; member inventory status is reported separately and never propagates into assumed WAN health.

## Bootstrap and validation

The local draw.io bootstrap validates the original artifact hash and import registry, exact source identity, expected distinct site count and current organization membership. It creates one group without creating devices, ports or links. Replay preserves the existing group; edited or removed seeded groups are not silently overwritten or resurrected. No new network probes or external integration requests are introduced.

Synthetic route/model tests cover authorization, ownership, concurrency, rollback and safe deletion; projection tests cover folding, backup paths, layout preservation and corrupt preferences. Browser verification covers both maps, search, reload, forms and narrow layouts.
