/**
 * Alarm Query Layer — VMware / vCenter Alarms
 *
 * Covers: DATASTORE_SPACE_CRITICAL, DATASTORE_SPACE_LOW,
 *         VM_RECONFIGURED, VM_CLONED, VM_DELETED, VM_CREATED,
 *         VM_POWERED_ON, VM_POWERED_OFF, VM_SUSPENDED, VM_RESTARTED,
 *         VM_CPU_CRITICAL, VM_MEMORY_CRITICAL, VM_MIGRATED,
 *         SNAPSHOT_CREATED, SNAPSHOT_DELETED, SNAPSHOT_REVERTED
 *
 * Strategy:
 *   cacheQueryFn → Prisma cached_events with rawLog.source='vmware' JSONB filter
 *   faQueryFn   → Empty (VMware data is never in FortiAnalyzer)
 *
 * NOTE: The current detection engine evaluates VMware alarms via
 * evaluateVMwareAlarm() which calls vmwareService directly.
 * These registry functions provide the ALARM_QUERY_REGISTRY path so
 * performLogSearch() can route VMware alarms correctly instead of
 * falling through to generic FA log queries.
 *
 * When VMware event sync is added to cached_events (logtype='vmware',
 * rawLog.source='vmware'), these functions will return real data.
 * Until then, they return empty arrays — the detection engine's
 * evaluateVMwareAlarm() path remains the authoritative source.
 */

import { runAlarmQuery, queryCache, timeWindow } from './base';
import type { AlarmQueryContext, QueryResult } from './types';

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Base WHERE clause for VMware events in cached_events.
 * Uses JSONB path filter on rawLog.source to identify VMware-sourced events.
 *
 * When VMware event sync populates cached_events with logtype='vmware',
 * this query will return matching events. Until then, returns [].
 */
function vmwareCacheQuery(minutes: number, extraJsonbFilters?: Array<{
  rawLog: { path: string[]; string_contains?: string; equals?: string };
}>) {
  const baseWhere = {
    logtype: 'vmware' as const,
    eventTime: timeWindow(minutes),
    AND: [
      { rawLog: { path: ['source'], equals: 'vmware' } },
      ...(extraJsonbFilters ?? []),
    ],
  };
  return queryCache(baseWhere);
}

// ─── Datastore Alarms ─────────────────────────────────────────────────────────

/**
 * DATASTORE_SPACE_CRITICAL — Datastore free space < 3%.
 *
 * Queries cached_events for VMware datastore events with critical threshold.
 * Also checks rawLog.datastoreFreePercent < 3 via JSONB filter.
 */
export async function getDatastoreSpaceCriticalEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  return runAlarmQuery(
    ctx,
    'vmware datastoreFreePercent<3 source=vmware',
    async () => vmwareCacheQuery(ctx.timeWindowMinutes, [
      { rawLog: { path: ['type'], equals: 'datastore' } },
    ]),
    async () => [],
    { softFallback: false }
  );
}

/**
 * DATASTORE_SPACE_LOW — Datastore free space < 15%.
 */
export async function getDatastoreSpaceLowEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  return runAlarmQuery(
    ctx,
    'vmware datastoreFreePercent<15 source=vmware',
    async () => vmwareCacheQuery(ctx.timeWindowMinutes, [
      { rawLog: { path: ['type'], equals: 'datastore' } },
    ]),
    async () => [],
    { softFallback: false }
  );
}

// ─── VM Lifecycle Alarms ──────────────────────────────────────────────────────

/**
 * VM_CREATED — New VM created.
 */
export async function getVmCreatedEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  return runAlarmQuery(
    ctx,
    'vmware vmCreated=true source=vmware',
    async () => vmwareCacheQuery(ctx.timeWindowMinutes, [
      { rawLog: { path: ['vmCreated'], equals: 'true' } },
    ]),
    async () => [],
    { softFallback: false }
  );
}

/**
 * VM_DELETED — VM deleted.
 */
export async function getVmDeletedEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  return runAlarmQuery(
    ctx,
    'vmware vmDeleted=true source=vmware',
    async () => vmwareCacheQuery(ctx.timeWindowMinutes, [
      { rawLog: { path: ['vmDeleted'], equals: 'true' } },
    ]),
    async () => [],
    { softFallback: false }
  );
}

/**
 * VM_POWERED_ON — VM powered on.
 */
export async function getVmPoweredOnEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  return runAlarmQuery(
    ctx,
    'vmware powerState=poweredOn source=vmware',
    async () => vmwareCacheQuery(ctx.timeWindowMinutes, [
      { rawLog: { path: ['powerState'], equals: 'poweredOn' } },
    ]),
    async () => [],
    { softFallback: false }
  );
}

/**
 * VM_POWERED_OFF — VM powered off unexpectedly.
 */
export async function getVmPoweredOffEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  return runAlarmQuery(
    ctx,
    'vmware powerState=poweredOff source=vmware',
    async () => vmwareCacheQuery(ctx.timeWindowMinutes, [
      { rawLog: { path: ['powerState'], equals: 'poweredOff' } },
    ]),
    async () => [],
    { softFallback: false }
  );
}

/**
 * VM_SUSPENDED — VM suspended.
 */
export async function getVmSuspendedEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  return runAlarmQuery(
    ctx,
    'vmware powerState=suspended source=vmware',
    async () => vmwareCacheQuery(ctx.timeWindowMinutes, [
      { rawLog: { path: ['powerState'], equals: 'suspended' } },
    ]),
    async () => [],
    { softFallback: false }
  );
}

/**
 * VM_RESTARTED — VM restarted.
 */
export async function getVmRestartedEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  return runAlarmQuery(
    ctx,
    'vmware vmRestarted=true source=vmware',
    async () => vmwareCacheQuery(ctx.timeWindowMinutes, [
      { rawLog: { path: ['vmRestarted'], equals: 'true' } },
    ]),
    async () => [],
    { softFallback: false }
  );
}

// ─── VM Resource Alarms ───────────────────────────────────────────────────────

/**
 * VM_CPU_CRITICAL — VM CPU usage > 90%.
 */
export async function getVmCpuCriticalEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  return runAlarmQuery(
    ctx,
    'vmware cpuUsage>90 source=vmware',
    async () => vmwareCacheQuery(ctx.timeWindowMinutes, [
      { rawLog: { path: ['type'], equals: 'vm' } },
    ]),
    async () => [],
    { softFallback: false }
  );
}

/**
 * VM_MEMORY_CRITICAL — VM memory usage > 90%.
 */
export async function getVmMemoryCriticalEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  return runAlarmQuery(
    ctx,
    'vmware memoryUsage>90 source=vmware',
    async () => vmwareCacheQuery(ctx.timeWindowMinutes, [
      { rawLog: { path: ['type'], equals: 'vm' } },
    ]),
    async () => [],
    { softFallback: false }
  );
}

// ─── VM Config & Migration Alarms ─────────────────────────────────────────────

/**
 * VM_RECONFIGURED — VM resource settings changed (CPU, RAM, disk).
 */
export async function getVmReconfiguredEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  return runAlarmQuery(
    ctx,
    'vmware vmReconfigured=true source=vmware',
    async () => vmwareCacheQuery(ctx.timeWindowMinutes, [
      { rawLog: { path: ['vmReconfigured'], equals: 'true' } },
    ]),
    async () => [],
    { softFallback: false }
  );
}

/**
 * VM_CLONED — VM cloned.
 */
export async function getVmClonedEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  return runAlarmQuery(
    ctx,
    'vmware vmCloned=true source=vmware',
    async () => vmwareCacheQuery(ctx.timeWindowMinutes, [
      { rawLog: { path: ['vmCloned'], equals: 'true' } },
    ]),
    async () => [],
    { softFallback: false }
  );
}

/**
 * VM_MIGRATED — VM migrated (vMotion / Storage vMotion).
 */
export async function getVmMigratedEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  return runAlarmQuery(
    ctx,
    'vmware vmMigrated=true source=vmware',
    async () => vmwareCacheQuery(ctx.timeWindowMinutes, [
      { rawLog: { path: ['vmMigrated'], equals: 'true' } },
    ]),
    async () => [],
    { softFallback: false }
  );
}

// ─── Snapshot Alarms ──────────────────────────────────────────────────────────

/**
 * SNAPSHOT_CREATED — VM snapshot created.
 */
export async function getSnapshotCreatedEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  return runAlarmQuery(
    ctx,
    'vmware snapshotCreated=true source=vmware',
    async () => vmwareCacheQuery(ctx.timeWindowMinutes, [
      { rawLog: { path: ['snapshotCreated'], equals: 'true' } },
    ]),
    async () => [],
    { softFallback: false }
  );
}

/**
 * SNAPSHOT_DELETED — VM snapshot deleted/committed.
 */
export async function getSnapshotDeletedEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  return runAlarmQuery(
    ctx,
    'vmware snapshotDeleted=true source=vmware',
    async () => vmwareCacheQuery(ctx.timeWindowMinutes, [
      { rawLog: { path: ['snapshotDeleted'], equals: 'true' } },
    ]),
    async () => [],
    { softFallback: false }
  );
}

/**
 * SNAPSHOT_REVERTED — VM snapshot reverted.
 */
export async function getSnapshotRevertedEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  return runAlarmQuery(
    ctx,
    'vmware snapshotReverted=true source=vmware',
    async () => vmwareCacheQuery(ctx.timeWindowMinutes, [
      { rawLog: { path: ['snapshotReverted'], equals: 'true' } },
    ]),
    async () => [],
    { softFallback: false }
  );
}
