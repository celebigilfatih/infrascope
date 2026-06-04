/**
 * GET /api/health
 * Advanced Health check endpoint with per-datasource monitoring
 * Auto-restarts services if they've stopped
 */

import { NextRequest, NextResponse } from 'next/server';
import { startAlarmScheduler, getSchedulerStatus } from '@/lib/alarm-scheduler';
import { startAlarmMonitor, getAlarmMonitor } from '@/lib/alarms/alarm-monitor';
import { prisma } from '@/lib/prisma';
import { getSharedFortiAnalyzerService, getFortiAnalyzerLoginHealth } from '@/lib/integrations/fortianalyzer';
import { getEventCacheStatus } from '@/lib/alarms/detection-engine';
import { getDLQStats } from '@/lib/notifications/dlq-worker';

interface FAHealthResult {
  status: 'healthy' | 'unhealthy' | 'unknown';
  responseTimeMs: number;
  error?: string;
  consecutiveFailures?: number;
  isAccountLocked?: boolean;
  backoffRemainingSec?: number;
  session?: { active: boolean; lastLoginAt: string | null };
  eventCache?: { lastSyncAt: string | null; isFresh: boolean; syncInProgress: boolean; consecutiveSyncFailures: number; nextSyncDelayMin: number } | null;
}

interface VMwareHealthResult {
  status: 'healthy' | 'unhealthy' | 'unknown';
  responseTimeMs?: number;
  error?: string;
  version?: string;
  lastSyncAt?: string | null;
  lastSyncStatus?: string | null;
}

interface NmsHealthResult {
  status: 'healthy' | 'unhealthy' | 'unknown';
  error?: string;
  pollerAlive?: boolean;
  registeredDevices?: number;
  pollingDevices?: number;
  recentHealthMetrics?: number;
  pollingActive?: boolean;
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  version: string;
  services: {
    scheduler: boolean;
    schedulerHeartbeatStale: boolean;
    monitor: boolean;
  };
  datasources: {
    database: { status: 'healthy' | 'unhealthy'; responseTimeMs: number };
    fortianalyzer: FAHealthResult;
    vmware: VMwareHealthResult;
    nms: NmsHealthResult;
  };
  alarms: {
    totalDefinitions: number;
    enabledDefinitions: number;
    recentEvents: number;
    recentErrors: number;
  };
  notifications: {
    dlq: {
      pending: number;
      delivered: number;
      failedPermanent: number;
      oldestPendingAgeMin: number | null;
    };
  };
}

/**
 * Check database health
 */
async function checkDatabaseHealth(): Promise<{ status: 'healthy' | 'unhealthy'; responseTimeMs: number }> {
  const startTime = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'healthy', responseTimeMs: Date.now() - startTime };
  } catch (error) {
    return { status: 'unhealthy', responseTimeMs: Date.now() - startTime };
  }
}

/**
 * Check FortiAnalyzer health using shared singleton.
 * Caches the last result for 5 minutes to avoid hammering FA with login attempts
 * when it is rate-limiting/blocking logins (code=-22).  Continuous login attempts
 * keep the block active indefinitely, so we must back off.
 */
let _lastFAHealth: {
  result: { status: 'healthy' | 'unhealthy'; responseTimeMs: number; error?: string };
  time: number;
} | null = null;
const FA_HEALTH_CACHE_MS = 5 * 60 * 1000; // 5-minute cache for failed health checks

async function checkFortiAnalyzerHealth(): Promise<FAHealthResult> {
  const startTime = Date.now();

  // Build event cache info from detection engine singleton (no API call needed)
  const cacheStatus = getEventCacheStatus();
  const eventCacheInfo = cacheStatus ? {
    lastSyncAt: cacheStatus.lastSyncTime?.toISOString() ?? null,
    isFresh: cacheStatus.isFresh,
    syncInProgress: cacheStatus.syncInProgress,
    consecutiveSyncFailures: cacheStatus.consecutiveSyncFailures,
    nextSyncDelayMin: cacheStatus.nextSyncDelayMin,
  } : null;

  try {
    // Use shared singleton (if available) to avoid creating competing login sessions
    const service = getSharedFortiAnalyzerService();
    if (!service) {
      return { status: 'unknown' as 'unhealthy', responseTimeMs: 0, error: 'Not initialized', eventCache: eventCacheInfo };
    }

    // Return cached UNHEALTHY result if last check failed recently.
    // Without this backoff, each health check (every 30s) retries a login, which
    // keeps the FA account block (code=-22) alive indefinitely.
    if (
      _lastFAHealth &&
      _lastFAHealth.result.status === 'unhealthy' &&
      Date.now() - _lastFAHealth.time < FA_HEALTH_CACHE_MS
    ) {
      const loginHealth = getFortiAnalyzerLoginHealth();
      return {
        ..._lastFAHealth.result,
        ...loginHealth,
        session: { active: false, lastLoginAt: null },
        eventCache: eventCacheInfo,
      };
    }

    const loggedIn = await service.login();
    const loginHealth = getFortiAnalyzerLoginHealth();
    if (!loggedIn) {
      const result = {
        status: 'unhealthy' as const,
        responseTimeMs: Date.now() - startTime,
        error: loginHealth.isAccountLocked ? 'Account locked (code=-22) — unlock via FA GUI' : 'Login failed',
        ...loginHealth,
      };
      _lastFAHealth = { result, time: Date.now() };
      return { ...result, session: { active: false, lastLoginAt: null }, eventCache: eventCacheInfo };
    }

    // Success — clear the cache so next health check validates fresh
    _lastFAHealth = null;
    return {
      status: 'healthy',
      responseTimeMs: Date.now() - startTime,
      ...loginHealth,
      session: { active: true, lastLoginAt: null },
      eventCache: eventCacheInfo,
    };
  } catch (error) {
    const loginHealth = getFortiAnalyzerLoginHealth();
    const result = {
      status: 'unhealthy' as const,
      responseTimeMs: Date.now() - startTime,
      error: (error as Error).message,
      ...loginHealth,
    };
    _lastFAHealth = { result, time: Date.now() };
    return { ...result, session: { active: false, lastLoginAt: null }, eventCache: eventCacheInfo };
  }
}

/**
 * Check VMware health (if configured).
 * Uses VMwareService.getStatus() for connectivity + version check,
 * and queries IntegrationConfig for last sync time.
 */
async function checkVMwareHealth(): Promise<VMwareHealthResult> {
  const vmwareHost = process.env.VMWARE_HOST;
  if (!vmwareHost) {
    return { status: 'unknown', error: 'Not configured' };
  }

  const startTime = Date.now();

  // Fetch last sync info from DB in parallel with connectivity check
  const syncInfoPromise = prisma.integrationConfig.findFirst({
    where: { type: 'VMWARE_VCENTER' },
    select: { lastSyncAt: true, lastSyncStatus: true },
  }).catch(() => null);

  try {
    const { VMwareService } = await import('@/lib/integrations/vmware');
    const service = new VMwareService({
      host: vmwareHost,
      username: process.env.VMWARE_USERNAME || '',
      password: process.env.VMWARE_PASSWORD || '',
      pollingInterval: 5,
      enabledModules: { datacenters: false, clusters: false, hosts: false, vms: false, datastores: false },
    });

    const [vmStatus, syncInfo] = await Promise.all([
      service.getStatus(),
      syncInfoPromise,
    ]);

    return {
      status: vmStatus.connected ? 'healthy' : 'unhealthy',
      responseTimeMs: Date.now() - startTime,
      error: vmStatus.error,
      version: vmStatus.version,
      lastSyncAt: syncInfo?.lastSyncAt?.toISOString() ?? null,
      lastSyncStatus: syncInfo?.lastSyncStatus ?? null,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      responseTimeMs: Date.now() - startTime,
      error: (error as Error).message,
    };
  }
}

/**
 * Check NMS (Network Management System) health.
 * Queries the FastAPI /health endpoint for poller status and uses DB
 * metrics as a sign-of-life indicator when the service is unreachable.
 */
async function checkNmsHealth(): Promise<NmsHealthResult> {
  const nmsUrl = process.env.NMS_INTERNAL_URL || 'http://nms:8500';
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);

  // Query DB metrics in parallel with the FastAPI health check
  const [pollingDevices, recentMetrics] = await Promise.all([
    (prisma as any).device.count({
      where: { pollingEnabled: true, nmsDeviceId: { not: null } },
    }).catch(() => 0),
    (prisma as any).nmsHealthMetric.count({
      where: { collectedAt: { gte: tenMinAgo } },
    }).catch(() => 0),
  ]);

  // Try reaching the NMS FastAPI service
  let pollerAlive = false;
  let registeredDevices = 0;
  try {
    const res = await fetch(`${nmsUrl}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json() as Record<string, unknown>;
      pollerAlive = data.poller_alive === true;
      registeredDevices = typeof data.registered_devices === 'number' ? data.registered_devices : 0;
    }
  } catch {
    // NMS service not running (expected in development without Docker)
  }

  const pollingActive = recentMetrics > 0;

  // Determine status: healthy if poller is alive OR we see recent metrics
  if (pollerAlive || pollingActive) {
    return {
      status: 'healthy',
      pollerAlive,
      registeredDevices,
      pollingDevices,
      recentHealthMetrics: recentMetrics,
      pollingActive,
    };
  }

  // If we have polling-enabled devices but no activity, that's unhealthy
  if (pollingDevices > 0 && !pollingActive && !pollerAlive) {
    return {
      status: 'unhealthy',
      error: 'No recent polling activity',
      pollerAlive,
      registeredDevices,
      pollingDevices,
      recentHealthMetrics: recentMetrics,
      pollingActive,
    };
  }

  // No NMS devices configured — report unknown (not an error)
  return {
    status: 'unknown',
    pollerAlive,
    registeredDevices,
    pollingDevices,
    recentHealthMetrics: recentMetrics,
    pollingActive,
  };
}

/**
 * Get alarm statistics
 */
async function getAlarmStats(): Promise<{ totalDefinitions: number; enabledDefinitions: number; recentEvents: number; recentErrors: number }> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
  const [totalDefs, enabledDefs, recentEvents, recentErrors] = await Promise.all([
    prisma.alarmDefinition.count(),
    prisma.alarmDefinition.count({ where: { enabled: true } }),
    prisma.alarmEvent.count({ where: { createdAt: { gte: oneHourAgo } } }),
    prisma.alarmCheckLog.count({ where: { checkTime: { gte: oneHourAgo }, errorCount: { gt: 0 } } }),
  ]);
  
  return {
    totalDefinitions: totalDefs,
    enabledDefinitions: enabledDefs,
    recentEvents,
    recentErrors,
  };
}

/**
 * Ensure alarm services are running - starts them if stopped.
 * Also checks scheduler heartbeat to detect frozen schedulers.
 */
async function ensureAlarmServicesRunning() {
  const schedulerStatus = getSchedulerStatus();
  const monitorStatus = getAlarmMonitor().getStatus();

  let schedulerOk = schedulerStatus.running;
  let monitorOk = monitorStatus.running;
  let schedulerHeartbeatStale = false;

  // Start scheduler if not running
  if (!schedulerOk) {
    console.log('[Health] Scheduler not running, starting...');
    try {
      startAlarmScheduler();
      schedulerOk = true;
      console.log('[Health] Alarm scheduler (re)started');
    } catch (err) {
      console.error('[Health] Failed to start scheduler:', err);
    }
  }

  // Check heartbeat staleness — detect frozen scheduler even if interval is set
  if (schedulerOk) {
    try {
      const heartbeat = await (prisma as any).systemConfig?.findUnique?.({
        where: { key: 'scheduler_last_tick' },
      });
      if (heartbeat?.value) {
        const parsed = JSON.parse(heartbeat.value);
        const lastTickTime = parsed.ts ? new Date(parsed.ts).getTime() : 0;
        const ageMinutes = lastTickTime ? (Date.now() - lastTickTime) / 60000 : Infinity;
        const STALE_THRESHOLD_MINUTES = 20;

        if (ageMinutes > STALE_THRESHOLD_MINUTES) {
          schedulerHeartbeatStale = true;
          console.warn(
            `[Health] Scheduler heartbeat stale: last tick ${Math.round(ageMinutes)}m ago (threshold: ${STALE_THRESHOLD_MINUTES}m). Scheduler may be frozen.`
          );
          schedulerOk = false;
        }
      } else if (heartbeat === null || heartbeat === undefined) {
        // No heartbeat at all — scheduler may have never completed a tick
        // Only flag as stale if scheduler has been running for a while
        // (give it grace on fresh start)
      }
    } catch {
      // Heartbeat check failed (table may not exist yet) — don't affect status
    }
  }

  // Start monitor if not running
  if (!monitorOk) {
    console.log('[Health] Monitor not running, starting...');
    try {
      startAlarmMonitor(5);
      monitorOk = true;
      console.log('[Health] Alarm monitor (re)started');
    } catch (err) {
      console.error('[Health] Failed to start monitor:', err);
    }
  }

  return { schedulerOk, monitorOk, schedulerHeartbeatStale };
}

export async function GET(_request: NextRequest) {
  // Ensure alarm services are running (auto-restart if stopped)
  const { schedulerOk, monitorOk, schedulerHeartbeatStale } = await ensureAlarmServicesRunning();
  
  // Check all datasources + DLQ stats in parallel
  const [dbHealth, fazHealth, vmwareHealth, nmsHealth, alarmStats, dlqStats] = await Promise.all([
    checkDatabaseHealth(),
    checkFortiAnalyzerHealth(),
    checkVMwareHealth(),
    checkNmsHealth(),
    getAlarmStats(),
    getDLQStats(),
  ]);
  
  // Determine overall status
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  const unhealthyCount = [dbHealth, fazHealth, vmwareHealth, nmsHealth].filter(h => h.status === 'unhealthy').length;
  
  if (unhealthyCount >= 2 || !schedulerOk || !monitorOk) {
    overallStatus = 'unhealthy';
  } else if (unhealthyCount === 1 || alarmStats.recentErrors > 5 || dlqStats.failedPermanent > 0) {
    overallStatus = 'degraded';
  }
  
  const healthStatus: HealthStatus = {
    status: overallStatus,
    timestamp: new Date(),
    version: '1.0.0',
    services: {
      scheduler: schedulerOk,
      schedulerHeartbeatStale,
      monitor: monitorOk,
    },
    datasources: {
      database: dbHealth,
      fortianalyzer: fazHealth,
      vmware: vmwareHealth,
      nms: nmsHealth,
    },
    alarms: alarmStats,
    notifications: {
      dlq: {
        pending: dlqStats.pending,
        delivered: dlqStats.delivered,
        failedPermanent: dlqStats.failedPermanent,
        oldestPendingAgeMin: dlqStats.oldestPendingAge,
      },
    },
  };
  
  const httpStatus = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;
  
  return NextResponse.json(healthStatus, { status: httpStatus });
}
