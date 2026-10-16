/**
 * GET /api/health/alarms - Alarm system health check
 *
 * Returns the liveness status of all alarm pipeline components.
 * Designed for external watchdog (Zabbix, Uptime Kuma, cron-based monitor).
 *
 * HTTP 200 = healthy
 * HTTP 503 = degraded (one or more components stale)
 *
 * Example healthy response:
 * {
 *   "status": "healthy",
 *   "components": {
 *     "scheduler": { "healthy": true, "lastTickAgo": "3m" },
 *     "eventCache": { "healthy": true, "lastSyncAgo": "2m", "eventCount": 4521 },
 *     "detection": { "healthy": true, "lastCheckAgo": "5m", "status": "SUCCESS" },
 *     "email": { "healthy": true, "sentThisHour": 3, "limitRemaining": 47 }
 *   }
 * }
 *
 * Example degraded response (HTTP 503):
 * {
 *   "status": "degraded",
 *   "components": {
 *     "scheduler": { "healthy": false, "lastTickAgo": "45m", "alert": "STALE" },
 *     ...
 *   }
 * }
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getEmailStats } from '@/lib/notifications/email';
import { getSchedulerStatus } from '@/lib/alarm-scheduler';
import { getCircuitBreakerStatus } from '@/lib/integrations/fa-circuit-breaker';
import { getDLQStats } from '@/lib/notifications/dlq-worker';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Thresholds for staleness (in minutes)
const SCHEDULER_STALE_THRESHOLD = 30;  // If no tick in 30 min → degraded
const CACHE_STALE_THRESHOLD = 10;       // If no sync in 10 min → degraded
const DETECTION_STALE_THRESHOLD = 40;   // If no check in 40 min → degraded (allows 20-min interval + slack)
const RUNNING_STALE_THRESHOLD = 12;
const NMS_FRESHNESS_MINUTES = 10;

type NmsPipelineState = 'healthy' | 'degraded' | 'not_configured';

interface NmsPipelineHealth {
  state: NmsPipelineState;
  pollingDevices: number;
  registeredDevices: number;
  monitoredPorts: number;
  freshInterfaces: number;
  freshHealthMetrics: number;
  lastSuccessfulPollAt: string | null;
  lastAlarmCheckAt: string | null;
  blockingReasons: string[];
}

async function getNmsPipelineHealth(lastAlarmCheckAt: Date | null): Promise<NmsPipelineHealth> {
  const freshSince = new Date(Date.now() - NMS_FRESHNESS_MINUTES * 60 * 1000);
  const [pollingDevices, monitoredPorts, freshInterfaces, freshHealthMetrics, latestPoll] = await Promise.all([
    prisma.device.count({ where: { pollingEnabled: true, nmsDeviceId: { not: null } } }),
    prisma.nmsInterface.count({ where: { monitored: true } }),
    prisma.nmsInterface.count({ where: { lastPolledAt: { gte: freshSince } } }),
    prisma.nmsHealthMetric.count({ where: { collectedAt: { gte: freshSince } } }),
    prisma.device.findFirst({
      where: { pollingEnabled: true, nmsDeviceId: { not: null }, lastPolledAt: { not: null } },
      orderBy: { lastPolledAt: 'desc' },
      select: { lastPolledAt: true },
    }),
  ]);

  let pollerAlive = false;
  let registeredDevices = 0;
  try {
    const nmsUrl = (process.env.NMS_BACKEND_URL || process.env.NMS_INTERNAL_URL || 'http://nms:8500').replace(/\/$/, '');
    const response = await fetch(`${nmsUrl}/health`, { signal: AbortSignal.timeout(3000) });
    if (response.ok) {
      const data = await response.json() as { poller_alive?: boolean; registered_devices?: number };
      pollerAlive = data.poller_alive === true;
      registeredDevices = typeof data.registered_devices === 'number' ? data.registered_devices : 0;
    }
  } catch {
    // The blocking reason below carries the safe operational state.
  }

  const blockingReasons: string[] = [];
  let state: NmsPipelineState = 'healthy';

  if (pollingDevices === 0) {
    state = 'not_configured';
    blockingReasons.push('İzlemeye alınmış NMS cihazı yok.');
  } else {
    if (!pollerAlive) blockingReasons.push('NMS poller servisine erişilemiyor.');
    if (registeredDevices < pollingDevices) {
      blockingReasons.push(`${pollingDevices - registeredDevices} cihaz poller tarafından kaydedilmemiş.`);
    }
    if (freshInterfaces === 0 && freshHealthMetrics === 0) {
      blockingReasons.push('Son 10 dakikada switch verisi alınmadı.');
    }
    if (monitoredPorts === 0) {
      blockingReasons.push('Port down alarmı için izlemeye alınmış port yok.');
    }
    if (blockingReasons.length > 0) state = 'degraded';
  }

  return {
    state,
    pollingDevices,
    registeredDevices,
    monitoredPorts,
    freshInterfaces,
    freshHealthMetrics,
    lastSuccessfulPollAt: latestPoll?.lastPolledAt?.toISOString() ?? null,
    lastAlarmCheckAt: lastAlarmCheckAt?.toISOString() ?? null,
    blockingReasons,
  };
}

function minutesAgo(date: Date | null | undefined): number | null {
  if (!date) return null;
  return Math.round((Date.now() - new Date(date).getTime()) / 60000);
}

function formatMinutes(mins: number | null): string {
  if (mins === null) return 'never';
  if (mins < 1) return '<1m';
  return `${mins}m`;
}

export async function GET() {
  try {
    // 1. Check scheduler heartbeat
    let schedulerLastTick: Date | null = null;
    let schedulerOk = false;
    try {
      const heartbeat = await prisma.systemConfig?.findUnique?.({
        where: { key: 'scheduler_last_tick' },
      });
      if (heartbeat?.value) {
        const parsed = JSON.parse(heartbeat.value);
        schedulerLastTick = parsed.ts ? new Date(parsed.ts) : null;
        schedulerOk = parsed.ok === true;
      }
    } catch { /* ignore if table doesn't exist */ }

    const schedulerAgoMins = minutesAgo(schedulerLastTick);
    const schedulerHealthy = schedulerAgoMins !== null && schedulerAgoMins < SCHEDULER_STALE_THRESHOLD && schedulerOk;

    // 2. Check event cache last sync
    let cacheLastSync: Date | null = null;
    let cacheEventCount = 0;
    try {
      const latestEvent = await prisma.cachedEvent.findFirst({
        orderBy: { eventTime: 'desc' },
        select: { eventTime: true },
      });
      cacheLastSync = latestEvent?.eventTime ?? null;
      cacheEventCount = await prisma.cachedEvent.count();
    } catch { /* ignore */ }

    const cacheAgoMins = minutesAgo(cacheLastSync);
    const cacheHealthy = cacheAgoMins !== null && cacheAgoMins < CACHE_STALE_THRESHOLD && cacheEventCount > 0;

    // 3. Check last detection cycle
    // A check that ran (even if FAILED) is NOT stale — it means the engine is
    // alive but having evaluation errors. STALE means no check ran at all.
    let lastCheck: { checkTime: Date; status: string } | null = null;
    let lastCompletedCheck: { checkTime: Date; status: string } | null = null;
    try {
      [lastCheck, lastCompletedCheck] = await Promise.all([
        prisma.alarmCheckLog.findFirst({
          orderBy: { checkTime: 'desc' },
          select: { checkTime: true, status: true },
        }),
        prisma.alarmCheckLog.findFirst({
          where: { status: { in: ['SUCCESS', 'PARTIAL', 'FAILED', 'ORPHANED'] } },
          orderBy: { checkTime: 'desc' },
          select: { checkTime: true, status: true },
        }),
      ]);
    } catch { /* ignore */ }

    const latestCheckAgoMins = minutesAgo(lastCheck?.checkTime);
    const detectionAgoMins = minutesAgo(lastCompletedCheck?.checkTime);
    const staleRunning = lastCheck?.status === 'RUNNING'
      && latestCheckAgoMins !== null
      && latestCheckAgoMins >= RUNNING_STALE_THRESHOLD;
    const detectionHealthy = !staleRunning
      && detectionAgoMins !== null
      && detectionAgoMins < DETECTION_STALE_THRESHOLD
      && ['SUCCESS', 'PARTIAL'].includes(lastCompletedCheck?.status ?? '');

    // 4. Check email service
    const emailStats = getEmailStats();
    const emailConfig = await prisma.notificationConfig.findUnique({ where: { channel: 'email' } }).catch(() => null);
    const emailConfigured = emailConfig?.enabled === true;
    const emailHealthy = !emailConfigured
      || (emailStats.emailsThisHour < emailStats.maxPerHour && emailStats.transporterActive);

    // 5. Check FortiAnalyzer circuit breaker
    const cbStatus = getCircuitBreakerStatus();
    const circuitBreakerHealthy = cbStatus.state === 'CLOSED' || cbStatus.state === 'HALF_OPEN';

    // 6. Check DLQ status
    let dlqStats = { pending: 0, delivered: 0, failedPermanent: 0, oldestPendingAge: null as number | null };
    try {
      dlqStats = await getDLQStats();
    } catch { /* DLQ table may not exist yet */ }
    const dlqHealthy = dlqStats.failedPermanent < 10; // Alert if too many permanent failures

    // 7. Aggregate health status
    const fortiAnalyzerConfigured = await prisma.integrationConfig.count({
      where: { type: 'FORTIANALYZER', enabled: true },
    }).then((count) => count > 0).catch(() => false);
    const nmsPipeline = await getNmsPipelineHealth(lastCompletedCheck?.checkTime ?? null);
    const allHealthy = schedulerHealthy
      && detectionHealthy
      && emailHealthy
      && (!fortiAnalyzerConfigured || (cacheHealthy && circuitBreakerHealthy))
      && nmsPipeline.state !== 'degraded';

    const response = {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      thresholds: {
        schedulerStaleMinutes: SCHEDULER_STALE_THRESHOLD,
        cacheStaleMinutes: CACHE_STALE_THRESHOLD,
        detectionStaleMinutes: DETECTION_STALE_THRESHOLD,
      },
      components: {
        scheduler: {
          healthy: schedulerHealthy,
          running: getSchedulerStatus().running,
          lastTickAgo: formatMinutes(schedulerAgoMins),
          lastTickOk: schedulerOk,
          ...(schedulerAgoMins !== null && schedulerAgoMins >= SCHEDULER_STALE_THRESHOLD ? { alert: 'STALE' } : {}),
        },
        eventCache: {
          healthy: cacheHealthy,
          lastSyncAgo: formatMinutes(cacheAgoMins),
          eventCount: cacheEventCount,
          ...(cacheAgoMins !== null && cacheAgoMins >= CACHE_STALE_THRESHOLD ? { alert: 'STALE' } : {}),
          ...(cacheEventCount === 0 ? { alert: 'EMPTY' } : {}),
        },
        detection: {
          healthy: detectionHealthy,
          lastCheckAgo: formatMinutes(detectionAgoMins),
          lastStatus: lastCheck?.status ?? 'UNKNOWN',
          lastCompletedStatus: lastCompletedCheck?.status ?? 'UNKNOWN',
          ...(detectionAgoMins !== null && detectionAgoMins >= DETECTION_STALE_THRESHOLD ? { alert: 'STALE' } : {}),
          ...(staleRunning ? { alert: 'STALE_RUNNING' } : {}),
          ...(lastCompletedCheck?.status === 'FAILED' ? { alert: 'ERROR' } : {}),
        },
        email: {
          healthy: emailHealthy,
          configured: emailConfigured,
          sentThisHour: emailStats.emailsThisHour,
          limitRemaining: emailStats.maxPerHour - emailStats.emailsThisHour,
          hourlyResetInMinutes: emailStats.hourlyResetIn,
          transporterActive: emailStats.transporterActive,
          cooldownCount: emailStats.activeCooldowns,
          ...(emailStats.emailsThisHour >= emailStats.maxPerHour ? { alert: 'RATE_LIMITED' } : {}),
          ...(emailConfigured && !emailStats.transporterActive ? { alert: 'TRANSPORTER_DOWN' } : {}),
        },
        fortiAnalyzer: {
          healthy: circuitBreakerHealthy,
          circuitState: cbStatus.state,
          failureCount: cbStatus.failureCount,
          lastError: cbStatus.lastError,
          ...(cbStatus.state === 'OPEN' ? { 
            alert: 'CIRCUIT_OPEN',
            reopensAt: cbStatus.openUntil?.toISOString() 
          } : {}),
        },
        notificationDLQ: {
          healthy: dlqHealthy,
          pending: dlqStats.pending,
          delivered: dlqStats.delivered,
          failedPermanent: dlqStats.failedPermanent,
          oldestPendingAgeMinutes: dlqStats.oldestPendingAge,
          ...(dlqStats.failedPermanent >= 10 ? { alert: 'TOO_MANY_FAILURES' } : {}),
          ...(dlqStats.pending > 20 ? { alert: 'QUEUE_BACKLOG' } : {}),
        },
        nmsPipeline,
      },
    };

    return NextResponse.json(response, { status: allHealthy ? 200 : 503 });
  } catch (error) {
    console.error('[HealthCheck] Error:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
