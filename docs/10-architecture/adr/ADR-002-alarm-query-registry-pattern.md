# ADR-002: Alarm Query Registry Pattern

**Status:** Accepted
**Date:** 2026-02-17
**Supersedes:** —

## Context

The InfraScope alarm system queries multiple data sources:
- **FortiAnalyzer** cached_events (Prisma DB — fast)
- **FortiAnalyzer** live API (slow, rate-limited, needs session)
- **FortiGate** REST API (event logs, CMDB)
- **NMS** PostgreSQL tables (nms_health_metrics, nmsInterface)
- **VMware** vSphere API (VM events, datastore metrics)

Originally, the detection engine used a **generic** `performLogSearch()` function that:
1. Read the alarm's `detectionLogic.filter` from `alarm-definitions.ts`
2. Built a Prisma WHERE clause or FA query string
3. Executed the query
4. Optionally did in-memory post-filtering

This worked for simple alarms but **failed for complex cases**:
- `NMS_PORT_DOWN` — needs SQL JOIN on `nmsInterface` table, not event logs
- `VM_RECONFIGURED` — needs VMware event filtering + automation exclusion
- `ADMIN_CONFIG_CHANGE` — needs multi-field FA query (`action IN (Edit,Add,Delete) AND user NOT IN (...)`)
- `OFFHOURS_ADMIN_LOGIN` — needs time-of-day analysis on login events
- **Auto-resolve** — needs separate "is condition still true?" check after alarm fires

The generic pattern could not express these without becoming an unmanageable switch-case.

## Decision

**Introduce `ALARM_QUERY_REGISTRY`: a Map<string, AlarmQueryFn> that maps alarm codes to
dedicated query functions.**

### Pattern

```typescript
// lib/alarms/queries/index.ts
export const ALARM_QUERY_REGISTRY = new Map<string, AlarmQueryFn>([
  ['ADMIN_CONFIG_CHANGE', getAdminConfigChangeEvents],
  ['NMS_PORT_DOWN', getNmsPortDownEvents],
  ['VM_RECONFIGURED', getVmReconfiguredEvents],
  // ... more entries
]);
```

Each query function:
```typescript
interface AlarmQueryFn {
  (ctx: AlarmQueryContext): Promise<QueryResult>;
}

interface QueryResult {
  events: Array<Record<string, unknown>>;
  stats: QueryStats; // source, eventCount, durationMs, usedFallback
}
```

### Execution flow (in detection engine)

```
for each alarm in evaluation batch:
  if ALARM_QUERY_REGISTRY.has(alarm.code):
    fn = registry.get(alarm.code)
    result = await fn(ctx)          // dedicated logic
  else:
    result = await performLogSearch(ctx)  // generic fallback
```

### Query function structure

Each function uses `runAlarmQuery()` from `base.ts` which provides:
1. **Cache-first** — try Prisma on cached_events first
2. **FA fallback** — if cache stale or empty, query FortiAnalyzer live API
3. **Soft fallback** — critical alarms with 0 cache events get an extra FA verification
4. **Timing** — all durations logged for observability

```typescript
export async function getAdminConfigChangeEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  return runAlarmQuery(
    ctx,
    'logtype=event subtype=system user!=siem|fgtinfra action=Edit|Add|Delete|Move|Clone',
    // Cache query: Prisma on cached_events
    async () => prisma.cachedEvent.findMany({ /* WHERE clause */ }),
    // FA fallback: live API
    async (fa) => queryFortiAnalyzerDirect(fa, 'event', /* filter */, timeWindow),
    { softFallback: true }
  );
}
```

### Adding a new alarm

1. Define in `alarm-definitions.ts` (name, severity, cooldown, etc.)
2. Write query function in the appropriate file (`config-change.ts`, `nms.ts`, etc.)
3. Register in `ALARM_QUERY_REGISTRY` in `index.ts`
4. Detection engine picks it up automatically — no engine code change needed

## Consequences

### Easier
- Complex alarm logic lives in **isolated, testable functions** — not in a giant switch.
- Adding new alarms does **not** require modifying the detection engine.
- Each query function owns its **source, fallback, and post-filtering** — clean boundaries.
- `ALARM_QUERY_REGISTRY` is self-documenting: one Map shows all custom alarms.
- Generic `performLogSearch()` still works for simple alarms — no boilerplate needed.

### Harder / New responsibilities
- Query functions must follow the `AlarmQueryFn` contract (return `QueryResult`).
- Developers must remember to register in `ALARM_QUERY_REGISTRY` (not automatic).
- File organization matters: `config-change.ts` vs `auth-events.ts` vs `vpn-events.ts`
  must be intuitive. A misfiled function is hard to find.

### Rollback
Remove the registry Map and all query functions. All alarms fall back to
`performLogSearch()` — complex alarms will break (no fallback logic for NMS/VMware).

## Related

- `docs/00-product/CONSTITUTION.md` — AI-1 (alarm tanımı registry'de olmalı)
- `lib/alarms/queries/index.ts` — `ALARM_QUERY_REGISTRY` definition
- `lib/alarms/queries/base.ts` — `runAlarmQuery()` cache+fallback engine
- `lib/alarms/queries/types.ts` — `AlarmQueryFn`, `QueryResult`, `QueryStats` types
- `lib/alarms/detection-engine.ts` — `evaluateLogTypeGroupOptimized()` registry lookup

## History

| Date | Change |
|---|---|
| 2026-02-17 | Initial — registry pattern documented |
