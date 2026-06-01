# ADR-001: Prefer Config Revision Events Over CMDB-Diff Alarms

**Status:** Accepted
**Date:** 2026-02-17
**Supersedes:** —

## Context

InfraScope originally used a **CMDB-diff** approach to detect configuration changes:
1. Periodically poll FortiGate for running-config via SSH
2. Hash the config and store as `cmdb_snapshot`
3. Compare consecutive snapshots to find added/changed/deleted lines
4. Fire alarms like `FW_POLICY_CHANGED`, `ADDRESS_OBJECT_CHANGED`, etc.

This had **three fundamental problems**:

1. **No user attribution.** CMDB diffs show _what_ changed but not _who_ changed it.
   An operator seeing "firewall policy modified" had to manually check FA logs to find the user.
2. **Redundant with FortiAnalyzer native data.** FA already provides `cached_events` with
   full admin attribution: `user`, `ui`, `action` (Edit/Add/Delete/Move/Clone), `cfgpath`,
   `cfgobj`, `cfgattr`, source IP, VDOM — all in real-time via log streaming.
3. **Expensive to poll.** SSH config fetch + hash + diff for every FortiGate every 5 minutes
   is heavier than reading FA's pre-indexed `event` logs from the DB cache.

13 CMDB-diff alarm types were registered:
`FW_POLICY_CHANGED`, `ADDRESS_OBJECT_CHANGED`, `CORE_CONFIG_CHANGE`, `NEW_VIP`,
`NEW_ADMIN_USER`, `ADMIN_PASSWORD_CHANGED`, `ADMIN_PRIVILEGE_CHANGE`, `ROUTE_TABLE_CHANGED`,
`IPSEC_TUNNEL_CHANGED`, `SSL_VPN_SETTINGS_CHANGED`, `AUTH_SERVER_CHANGED`,
`INTERFACE_CONFIG_CHANGED`, `ADDRESS_GROUP_CHANGED`.

## Decision

**Disable all 13 CMDB-diff alarms. Replace with `ADMIN_CONFIG_CHANGE` alarm sourced from
FA `cached_events`.**

The new `ADMIN_CONFIG_CHANGE` alarm:
- **Source:** `lib/alarms/queries/config-change.ts` → `getAdminConfigChangeEvents()`
- **Query:** `logtype=event, subtype=system, user!=siem|fgtinfra, action in (Edit,Add,Delete,Move,Clone)`
- **Severity:** CRITICAL
- **Cooldown:** 60 minutes
- **Data:** Per-event `rawLog` contains user, IP, device, VDOM, access method, cfgpath, cfgobj
- **UI:** Config Revisions page shows the same data with a richer diff view

CMDB snapshot polling is **retained** (not removed) — it is used for the **Config Backups**
feature (version history, rollback) which is orthogonal to change detection.

13 old CMDB-diff alarm definitions are disabled in the DB (`active = false`), not deleted,
so they can be re-enabled if needed.

## Consequences

### Easier
- Every config change alarm now includes **user attribution** (who, from where, via what method).
- No more "what changed?" → "check FA manually" workflow.
- Config Revisions page and alarm page show **the same underlying data** — no discrepancy.
- CMDB polling load reduced (only for backup, not for diff).

### Trade-offs
- CMDB-diff can detect changes even if FA log streaming is broken (e.g., someone edited
  FortiGate directly without FA logging). This edge case is now blind. Mitigation: Config
  Backups page still shows the diff if you manually compare snapshots.
- `ADMIN_CONFIG_CHANGE` is a single alarm type replacing 13 granular ones. If users want
  "firewall-only" alerts, they must filter on `cfgpath` in the UI. (Future: add granular
  alarms back if demand exists.)

### Rollback
Re-enable the 13 CMDB-diff alarm definitions in the DB (`active = true`) and remove
`ADMIN_CONFIG_CHANGE` from `ALARM_QUERY_REGISTRY`.

## Related

- `docs/00-product/CONSTITUTION.md` — İlke #4 (alarmlar sinyaldir, gürültü değildir)
- `lib/alarms/queries/config-change.ts` — `getAdminConfigChangeEvents()` implementation
- `lib/alarms/queries/index.ts` — `ALARM_QUERY_REGISTRY` (CMDB entries commented out)
- `app/network/config-revisions/page.tsx` — Config Revisions UI

## History

| Date | Change |
|---|---|
| 2026-02-17 | Initial — CMDB-diff disabled, ADMIN_CONFIG_CHANGE created from FA cached_events |
