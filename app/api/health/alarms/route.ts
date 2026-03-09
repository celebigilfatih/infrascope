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

// Thresholds for staleness (in minutes)
const SCHEDULER_STALE_THRESHOLD = 30;  // If no tick in 30 min → degraded
const CACHE_STALE_THRESHOLD = 10;       // If no sync in 10 min → degraded
const DETECTION_STALE_THRESHOLD = 40;   // If no check in 40 min → degraded (allows 20-min interval + slack)

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
      const heartbeat = await (prisma as any).systemConfig?.findUnique?.({
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
    let lastCheck: { checkTime: Date; status: string } | null = null;
    try {
      lastCheck = await prisma.alarmCheckLog.findFirst({
        orderBy: { checkTime: 'desc' },
        select: { checkTime: true, status: true },
      });
    } catch { /* ignore */ }

    const detectionAgoMins = minutesAgo(lastCheck?.checkTime);
    const detectionHealthy = detectionAgoMins !== null && detectionAgoMins < DETECTION_STALE_THRESHOLD && lastCheck?.status !== 'FAILED';

    // 4. Check email service
    const emailStats = getEmailStats();
    const emailHealthy = emailStats.emailsThisHour < emailStats.maxPerHour && emailStats.transporterActive;

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
    const allHealthy = schedulerHealthy && cacheHealthy && detectionHealthy && emailHealthy && circuitBreakerHealthy;

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
          ...(detectionAgoMins !== null && detectionAgoMins >= DETECTION_STALE_THRESHOLD ? { alert: 'STALE' } : {}),
          ...(lastCheck?.status === 'FAILED' ? { alert: 'FAILED' } : {}),
        },
        email: {
          healthy: emailHealthy,
          sentThisHour: emailStats.emailsThisHour,
          limitRemaining: emailStats.maxPerHour - emailStats.emailsThisHour,
          hourlyResetInMinutes: emailStats.hourlyResetIn,
          transporterActive: emailStats.transporterActive,
          cooldownCount: emailStats.activeCooldowns,
          ...(emailStats.emailsThisHour >= emailStats.maxPerHour ? { alert: 'RATE_LIMITED' } : {}),
          ...(!emailStats.transporterActive ? { alert: 'TRANSPORTER_DOWN' } : {}),
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
