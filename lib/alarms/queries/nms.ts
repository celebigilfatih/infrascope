/**
 * Alarm Query Layer — NMS (SNMP) Alarms
 *
 * Covers: NMS_PORT_DOWN, NMS_DEVICE_UNREACHABLE, NMS_BACKUP_FAILED
 *
 * NMS alarms do NOT use FortiAnalyzer logs or cached_events.
 * They query Prisma tables populated by the Python NMS service:
 *   - nmsInterface (SNMP interface state — admin/oper status, monitored flag)
 *   - nmsHealthMetric (CPU, memory, temperature time series)
 *
 * Each function implements the AlarmQueryFn interface and uses runAlarmQuery()
 * for cache-first + FA-fallback pattern. Since NMS data is never in FA,
 * the faQueryFn always returns [] — the real query happens in cacheQueryFn.
 */

import { prisma } from '@/lib/prisma';
import { runAlarmQuery, timeWindow } from './base';
import type { AlarmQueryContext, QueryResult } from './types';

// ─── NMS_PORT_DOWN ────────────────────────────────────────────────────────────

/**
 * NMS_PORT_DOWN — Interface admin=up, oper=down, monitored=true.
 *
 * Queries nmsInterface table for ports that:
 *   1. Are administratively UP but operationally DOWN
 *   2. Are marked as monitored
 *   3. Have been down for at least 5 minutes (false-positive prevention)
 *   4. Were previously seen UP (operUpSince != null)
 *
 * Returns one event per down interface with device + port details.
 */
export async function getNmsPortDownEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  return runAlarmQuery(
    ctx,
    'nmsInterface admin=up oper=down monitored=true down>5min',
    async () => {
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
      const downThresholdMs = 5 * 60 * 1000; // 5 minutes

      const interfaces = await (prisma as any).nmsInterface.findMany({
        where: {
          monitored: true,
          adminStatus: 'up',
          operStatus: 'down',
          operUpSince: { not: null },
          updatedAt: { gte: tenMinAgo },
        },
        include: { device: { select: { id: true, name: true, managementIp: true } } },
        take: 20,
      }) as Array<any>;

      // Filter: only alarm if port has been down for ≥ 5 minutes
      return interfaces
        .filter((iface: any) => {
          const downSince = iface.downSince ? new Date(iface.downSince).getTime() : Date.now();
          return Date.now() - downSince >= downThresholdMs;
        })
        .map((iface: any) => ({
          nms_device_id: iface.nmsDeviceId,
          interface_index: iface.interfaceIndex,
          interface_name: iface.interfaceName,
          description: iface.description,
          admin_status: iface.adminStatus,
          oper_status: iface.operStatus,
          device_name: iface.device?.name ?? `NMS Device ${iface.nmsDeviceId}`,
          management_ip: iface.device?.managementIp,
          down_since: iface.downSince?.toISOString?.() ?? null,
          source: 'nms',
        }));
    },
    async () => [], // No FA fallback — NMS data is not in FortiAnalyzer
    { softFallback: false }
  );
}

// ─── NMS_DEVICE_UNREACHABLE ───────────────────────────────────────────────────

/**
 * NMS_DEVICE_UNREACHABLE — Device not reporting health metrics for ≥ 3 poll cycles.
 *
 * Queries devices with pollingEnabled=true that have no recent nmsHealthMetric
 * entries within the expected window (device.pollingInterval × 3, min 30 min).
 *
 * Returns one event per unreachable device.
 */
export async function getNmsDeviceUnreachableEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  return runAlarmQuery(
    ctx,
    'nmsHealthMetric no-recent-metric pollingDevice=true',
    async () => {
      const silenceThresholdMs = 30 * 60 * 1000; // 30 minutes minimum

      const pollingDevices = await (prisma as any).device.findMany({
        where: {
          pollingEnabled: true,
          nmsDeviceId: { not: null },
        },
        select: {
          id: true,
          name: true,
          nmsDeviceId: true,
          managementIp: true,
          lastPolledAt: true,
          pollingInterval: true,
        },
      }) as Array<{
        id: string;
        name: string;
        nmsDeviceId: number | null;
        managementIp: string | null;
        lastPolledAt: Date | null;
        pollingInterval: number | null;
      }>;

      const unreachableEvents: Array<Record<string, unknown>> = [];

      for (const device of pollingDevices) {
        if (!device.nmsDeviceId) continue;
        if (!device.lastPolledAt) continue; // Never polled — newly added

        const intervalMs = (device.pollingInterval || 300) * 1000;
        const effectiveThreshold = Math.max(silenceThresholdMs, intervalMs * 3);
        const effectiveCutoff = new Date(Date.now() - effectiveThreshold);

        // Check for any health metric within the threshold window
        const recentMetric = await (prisma as any).nmsHealthMetric.findFirst({
          where: { nmsDeviceId: device.nmsDeviceId, collectedAt: { gte: effectiveCutoff } },
        });

        if (recentMetric) continue; // Device is reporting

        // Also skip if lastPolledAt is recent (NMS agent still trying)
        if (device.lastPolledAt && new Date(device.lastPolledAt).getTime() > effectiveCutoff.getTime()) {
          continue;
        }

        // Device is unreachable — find how long it's been silent
        const lastMetric = await (prisma as any).nmsHealthMetric.findFirst({
          where: { nmsDeviceId: device.nmsDeviceId },
          orderBy: { collectedAt: 'desc' },
          select: { collectedAt: true },
        });

        const silentSinceMs = lastMetric
          ? Date.now() - new Date(lastMetric.collectedAt).getTime()
          : Date.now() - new Date(device.lastPolledAt!).getTime();
        const silentMinutes = Math.round(silentSinceMs / 60000);

        unreachableEvents.push({
          nms_device_id: device.nmsDeviceId,
          device_name: device.name,
          management_ip: device.managementIp,
          last_polled_at: device.lastPolledAt?.toISOString?.() ?? null,
          last_metric_at: lastMetric?.collectedAt ? new Date(lastMetric.collectedAt).toISOString() : null,
          silent_minutes: silentMinutes,
          polling_interval_sec: device.pollingInterval || 300,
          source: 'nms',
        });
      }

      return unreachableEvents;
    },
    async () => [], // No FA fallback — NMS data is not in FortiAnalyzer
    { softFallback: false }
  );
}

// ─── NMS_BACKUP_FAILED ────────────────────────────────────────────────────────

/**
 * NMS_BACKUP_FAILED — NMS device config backup failed.
 *
 * STUB: Detection logic not yet implemented in the detection engine.
 * Returns empty events until backup failure tracking is implemented.
 *
 * Future: Query nms_backup_jobs or similar table for failed backup records.
 */
export async function getNmsBackupFailedEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  return runAlarmQuery(
    ctx,
    'nms_backup_jobs status=failed (stub)',
    async () => [], // TODO: Implement when backup failure tracking is added
    async () => [],
    { softFallback: false }
  );
}
