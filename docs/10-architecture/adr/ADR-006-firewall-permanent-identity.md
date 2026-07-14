# ADR-006: FortiGate Permanent Identity and Connector Persistence

**Status:** Accepted
**Date:** 2026-07-13
**Supersedes:** The temporary identity portion of ADR-005
**Superseded by:** None

## Context

ADR-005 intentionally used `IntegrationConfig.id + VDOM` as a safe temporary runtime target key. It does not survive connector replacement as a device identity and cannot detect that a FortiGate reached through a new management address is the same firewall. Storing capability state only in `Device.metadata` also prevents reliable indexing, conflict review, and probe scheduling.

## Decision

- `Device` remains the inventory entity shown across InfraScope.
- A new `FirewallConnector` model owns the relationship between one inventory device, one FortiGate integration configuration, and one VDOM.
- Runtime connector/session scope remains `IntegrationConfig.id + normalized VDOM` as defined by ADR-005.
- Permanent discovered identity is `normalized FortiGate serial + normalized VDOM`.
- `managementHost` is mutable connection data and is never a permanent identity.
- `analyzerDeviceId` stores the FortiAnalyzer `devid` when correlation is verified in P1.6.
- Identity begins as `PENDING`. A successful trusted REST probe with a serial sets it to `VERIFIED`.
- If the discovered identity already belongs to another connector, the new connector becomes `CONFLICT`; it does not overwrite, merge, or delete either inventory record automatically.
- Conflict resolution requires an explicit review action. Automatic destructive merge is forbidden.
- Capability snapshots, monitoring mode, probe timestamps, and write-enabled state are persisted on the connector. Write remains disabled by default.
- Existing FortiGate configurations are backfilled only when their JSON contains a valid `deviceId`. Backfill does not guess permanent identity from host or unverified metadata.
- Legacy configurations without an explicit device link remain visible as unlinked records. An ADMIN must select the intended firewall inventory device; the link is written transactionally and audited before probing begins.

## Consequences

- Management IP or hostname changes can update a connector without creating a new `Device`.
- Two VDOMs on one appliance remain isolated identities.
- Duplicate discoveries become visible and reviewable instead of silently mixing data.
- A migration and a startup-safe backfill are required.
- Existing callers using config ID remain compatible through the connector factory.
- P1.6 must verify FortiAnalyzer `devid` before storing it.

## Rejected Alternatives

- **Use management IP as identity:** rejected because IP and DNS names change.
- **Use only `Device.serialNumber`:** rejected because one appliance may expose multiple VDOM scopes.
- **Store everything in `Device.metadata`:** rejected because identity uniqueness and conflict queries need database constraints.
- **Automatically merge duplicate serials:** rejected because an incorrect merge can destroy inventory and audit context.

## Related

- `docs/00-product/CONSTITUTION.md`
- `docs/10-architecture/adr/ADR-005-fortigate-target-scoped-connectors.md`
- `docs/20-modules/firewall/FORTIGATE_MANAGEMENT_DESIGN.md`
- `docs/20-modules/firewall/FORTIGATE_ROADMAP.md`

## History

| Date | Change |
|---|---|
| 2026-07-13 | Initial accepted decision |
