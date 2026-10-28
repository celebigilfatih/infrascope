# Topology direct editing — approved implementation

Source of truth: user-approved plan in the current conversation (27 October 2026).

Goal: same-map View/Edit, persisted manual positions, visible connection creation, distinct Scan/Expand/Shrink controls and actual browser fullscreen with a safe page-expansion fallback. Preserve existing inventory/layout models and public endpoints. No drawing objects, NMS edits, customer packaging or publication.

## Tasks
- [x] 1. API regression: authenticated/authorized building creation, validation, UNKNOWN defaults and exact replay; device-connection exact replay and port conflicts. Tests first, no schema additions.
- [x] 2. Shared map controls and fullscreen lifecycle. Portals/menus/forms remain inside fullscreen; permission-denied fallback and Esc state synchronize.
- [x] 3. Building overview stays the same canvas in View/Edit, honors saved positions, exposes autosave/retry and direct connection creation; camera actions never mutate layout.
- [x] 4. Device workspace uses consistent controls, a direct source/target picker and existing port form; retains drafts/errors and prevents accidental navigation while dragging.
- [x] 5. Browser regression, topology suites, full isolated incident regression, TypeScript/lint, final review, cleanup and report. Copy only approved topology/shared primitive changes to the live development checkout after verification; preserve its unrelated NMS WIP.

## Acceptance
- View mode never writes; dragging saves only in Edit and survives refresh.
- Buttons and handle dragging open the same forms; real source/target/port validation is preserved.
- Retry after a committed-but-lost response returns the matching record rather than a duplicate; conflicting contents return409. Unauthorized requests never write.
- Real fullscreen, menus/forms, exit/Esc, responsive layout, filtering and visible links work together.
- Existing customer HTTPS/package plan remains deferred.
