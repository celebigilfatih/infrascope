# ADR-005: FortiGate Target-Scoped Shared Connectors

**Status:** Accepted
**Date:** 2026-07-13
**Supersedes:** None
**Superseded by:** None

## Context

FortiGate integrations were loaded with unconstrained `findFirst()` queries and instantiated directly in API routes and alarm services. Session and response caches were not scoped to a firewall or VDOM. This violates the singleton integration invariant and can mix credentials, sessions, or cached data when a second FortiGate is configured.

The current schema has no dedicated firewall connector table. A backward-compatible P0 correction must therefore work without a migration while leaving room for serial/devid identity and explicit connector models in read-only V1.

## Decision

- The operational target identity is `IntegrationConfig.id + normalized VDOM`.
- `root` is the default VDOM when no VDOM is configured or requested.
- All FortiGate services are created through `lib/firewall/connector-factory.ts`.
- Shared connector instances are stored in a process-global registry keyed by target identity. A configuration fingerprint replaces a stale instance after credentials or settings change.
- API callers may select a target with `configId` and `vdom`.
- Backward compatibility may select the only enabled FortiGate configuration. If multiple enabled configurations exist, an explicit `configId` is required; arbitrary `findFirst()` selection is forbidden.
- FortiGate REST requests include the selected VDOM as a query parameter.
- API response caches, alarm clients, sync operations, and inventory lookup use the same target key.
- `FortiGateService` uses the shared Prisma client from `lib/prisma.ts`.
- Unsaved connection tests use an ephemeral connector created by the factory. Ephemeral connectors are never entered into the shared registry.
- This P0 change does not claim that config ID is the permanent device identity. Read-only V1 will discover and persist FortiGate serial/devid and model VDOMs explicitly.

## Consequences

- Multiple FortiGate configurations no longer silently share sessions or cache entries.
- Existing single-FortiGate installations continue without URL changes.
- Multi-FortiGate callers must provide `configId`; UI target selection is a subsequent read-only V1 task.
- Process-local singleton state is not a distributed lock. Multiple application replicas still have independent sessions and require a future distributed coordination design if horizontal scaling is enabled.
- Rollback is possible by reverting the factory adoption; no schema rollback is required.

## Related

- `docs/00-product/CONSTITUTION.md` — principles 8-13 and invariants AI-2, AI-3, AI-7
- `docs/20-modules/firewall/FORTIGATE_MANAGEMENT_DESIGN.md`
- `docs/20-modules/firewall/FORTIGATE_ROADMAP.md`

## History

| Date | Change |
|---|---|
| 2026-07-13 | Initial accepted decision |
