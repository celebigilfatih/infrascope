# Applications workspace

`/services/apps` uses the shared Turkish heading, icons, semantic badges, summary cards, filters, ten-row paging, responsive records and accessible scrollable detail dialog. It replaces the old hardcoded application/CPU/memory/instance examples with real `Application → Service → Dependency → Device` records. No production fixtures or synthetic runtime metrics are used.

## Read boundary

`GET /api/services/apps/workspace` requires the current ACTIVE actor's `devices/read` permission through the existing authorization policy. The shared Prisma client reads applications, their assigned services, source-service relationships and allowlisted hosting/target device identity in a repeatable-read transaction. The same transaction counts unassigned services separately. All application records, including applications without services, participate; no grouping by name or service type invents application identity. Unassigned services do not inflate assigned-service totals.

Responses are private/no-store with explicit `database` provenance and a reading time. Only names, vendor/version, record timestamps, service status/type/port/protocol and relationship evidence are selected. License keys, installation paths, service metadata and device credentials are excluded. More than 5,000 apps, 20,000 assigned services or 50,000 relations fails explicitly before the nested snapshot query; the screen never presents a silently truncated list. The route performs no probes, syncs, configuration changes or persistence. Existing service/dependency CRUD routes are unchanged.

The generic service-route public cache matcher excludes the `apps/workspace` subtree so Next.js does not merge conflicting public cache directives into the authenticated response. Matcher regressions preserve the existing policies of other service/dependency routes; real browser/API checks assert the final private/no-store header.

The client validates the complete nested shape, unique identities, application/service association, source-service relation direction and target-device IDs. Missing relation lists do not become zero. Unknown/unrecognized service states remain UNKNOWN, unsupported ports/protocols and invalid record dates remain unknown. Failed/malformed reads are unavailable; successful empty reads are zero. Abort/sequence guards ignore superseded requests, refresh closes old details, and failures preserve labelled previous results and their original reading time.

## State and relationship meaning

Applications have no independent runtime status in the schema. The displayed state derives only from assigned services' recorded statuses:

| Evidence | Derived label |
|---|---|
| No assigned service | Servis bağlı değil |
| Any FAILED | Başarısız servis var |
| Otherwise any DEGRADED | Sorunlu servis var |
| Otherwise any UNKNOWN/unrecognized state | Durum bilgisi eksik |
| All RUNNING | Servisler çalışıyor |
| All STOPPED | Servisler durmuş |
| Mixed RUNNING/STOPPED | Kısmen çalışıyor |

Known failures/degradation are retained even when another service is unknown; the service tally also exposes unknown counts. The attention summary includes failed, degraded, partial and stopped applications; missing-state/unassigned applications remain distinct and filterable. These are recorded states, not a live health test or an assertion that the application is operational. Record update time is not the last health check. Dates use Europe/Istanbul and TSİ labels; list-reading time is separate from application/service record times.

Each relationship is explicitly **source service → saved relationship type → target device**. The schema targets devices, not other applications/services; no incoming or transitive app graph is inferred. DEPENDS_ON, REQUIRES, PROVIDES, SUPPORTS, COMMUNICATES_WITH, DEPLOYED_ON, HOSTED_ON and CONNECTED_TO retain their distinct Turkish labels. Importance belongs to the relationship and does not infer target device health or application state. Relation count counts edges; target-device count deduplicates devices. Multiple services can legitimately reference the same target. Zero saved relations does not establish that the application has no dependencies.

## Interaction and verification

Search includes all application/vendor/version, service/display names, service type, hosting device and relation target names/IPs/descriptions, including entries abbreviated in compact cells. State, relation-presence and vendor filters run locally without repeated source reads. Vendor values use JSON encoding to avoid collisions with the missing-value option. Keyboard-accessible detail tabs separate services (recorded states, hosting devices, ports/protocols and update times) from every relationship (explicit direction and target identity). Servisler/Bağımlılıklar links lead to their existing workspaces; no inactive add/edit controls are shown.

`node scripts/check-applications-workspace.cjs` runs the real model, authorization policy/current-actor path and read route against isolated persistence. It verifies projection and repeatable-read options, active/read roles, unavailable/oversize results, association and direction validation, all derived states, unknown/empty/zero distinctions, complete Turkish search/filters, and absence of secret fields or writes. TypeScript and scoped ESLint also run.

`tests/incident-e2e/applications-workspace.spec.ts` exercises the actual page and read endpoint against a private PostgreSQL database. Real application/service/device/dependency fixtures cover projected secrets, assigned versus unassigned totals, all recorded-state combinations, repeated target devices, relationship direction/type, all-data filters/search and keyboard detail tabs. Error/mapping/calendar/duplicate and empty/slow-response cases use intercepted responses; the successful inventory path and current-account access checks use real local API/database reads. Device polling stays disabled and fixtures are removed after each case. No live installation database, appliance or notification recipient is used.

Record and snapshot times require explicit-zone, calendar-valid ISO timestamps with a valid clock time. Impossible dates and 24:00 rollover are rejected for provenance; invalid record timestamps stay unknown. Valid leap days and explicit timezone offsets are retained.
