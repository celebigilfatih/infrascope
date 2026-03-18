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
import { getDLQStats } from '@/lib/notifications/dlq-worker';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  version: string;
  services: {
    scheduler: boolean;
    monitor: boolean;
  };
  datasources: {
    database: { status: 'healthy' | 'unhealthy'; responseTimeMs: number };
    fortianalyzer: { status: 'healthy' | 'unhealthy' | 'unknown'; responseTimeMs?: number; error?: string; consecutiveFailures?: number; isAccountLocked?: boolean; backoffRemainingSec?: number };
    vmware: { status: 'healthy' | 'unhealthy' | 'unknown'; responseTimeMs?: number; error?: string };
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

async function checkFortiAnalyzerHealth(): Promise<{ status: 'healthy' | 'unhealthy'; responseTimeMs: number; error?: string; consecutiveFailures?: number; isAccountLocked?: boolean; backoffRemainingSec?: number }> {
  const startTime = Date.now();
  try {
    // Use shared singleton (if available) to avoid creating competing login sessions
    const service = getSharedFortiAnalyzerService();
    if (!service) {
      return { status: 'unknown' as 'unhealthy', responseTimeMs: 0, error: 'Not initialized' };
    }

    // Return cached UNHEALTHY result if last check failed recently.
    // Without this backoff, each health check (every 30s) retries a login, which
    // keeps the FA account block (code=-22) alive indefinitely.
    if (
      _lastFAHealth &&
      _lastFAHealth.result.status === 'unhealthy' &&
      Date.now() - _lastFAHealth.time < FA_HEALTH_CACHE_MS
    ) {
      // Enrich cached result with current login health state
      const loginHealth = getFortiAnalyzerLoginHealth();
      return { ..._lastFAHealth.result, ...loginHealth };
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
      return result;
    }
    
    // Success — clear the cache so next health check validates fresh
    _lastFAHealth = null;
    return { status: 'healthy', responseTimeMs: Date.now() - startTime, ...loginHealth };
  } catch (error) {
    const loginHealth = getFortiAnalyzerLoginHealth();
    const result = {
      status: 'unhealthy' as const,
      responseTimeMs: Date.now() - startTime,
      error: (error as Error).message,
      ...loginHealth,
    };
    _lastFAHealth = { result, time: Date.now() };
    return result;
  }
}

/**
 * Check VMware health (if configured)
 */
async function checkVMwareHealth(): Promise<{ status: 'healthy' | 'unhealthy' | 'unknown'; responseTimeMs?: number; error?: string }> {
  const vmwareHost = process.env.VMWARE_HOST;
  if (!vmwareHost) {
    return { status: 'unknown', error: 'Not configured' };
  }
  
  const startTime = Date.now();
  try {
    const { VMwareService } = await import('@/lib/integrations/vmware');
    const service = new VMwareService({
      host: vmwareHost,
      username: process.env.VMWARE_USERNAME || '',
      password: process.env.VMWARE_PASSWORD || '',
    });
    
    await service.connect();
    return { status: 'healthy', responseTimeMs: Date.now() - startTime };
  } catch (error) {
    return { status: 'unhealthy', responseTimeMs: Date.now() - startTime, error: (error as Error).message };
  }
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
 * Ensure alarm services are running - starts them if stopped
 */
function ensureAlarmServicesRunning() {
  const schedulerStatus = getSchedulerStatus();
  const monitorStatus = getAlarmMonitor().getStatus();
  
  let schedulerOk = schedulerStatus.running;
  let monitorOk = monitorStatus.running;
  
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
  
  return { schedulerOk, monitorOk };
}

export async function GET(_request: NextRequest) {
  // Ensure alarm services are running (auto-restart if stopped)
  const { schedulerOk, monitorOk } = ensureAlarmServicesRunning();
  
  // Check all datasources + DLQ stats in parallel
  const [dbHealth, fazHealth, vmwareHealth, alarmStats, dlqStats] = await Promise.all([
    checkDatabaseHealth(),
    checkFortiAnalyzerHealth(),
    checkVMwareHealth(),
    getAlarmStats(),
    getDLQStats(),
  ]);
  
  // Determine overall status
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  const unhealthyCount = [dbHealth, fazHealth, vmwareHealth].filter(h => h.status === 'unhealthy').length;
  
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
      monitor: monitorOk,
    },
    datasources: {
      database: dbHealth,
      fortianalyzer: fazHealth,
      vmware: vmwareHealth,
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
