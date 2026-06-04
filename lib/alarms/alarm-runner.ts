/**
 * Alarm Runner — shared in-process detection executor.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Previously both the scheduler and the watchdog triggered alarm checks via
 * HTTP POST to `/api/alarms/check` (the same process). This created two
 * critical failure modes:
 *
 *   1. HTTP connection drops: When Node/Next.js drops the incoming HTTP
 *      connection mid-execution (e.g. timeout, process pressure), the route
 *      handler's finally block may not run → mutex stays locked forever,
 *      DB write never happens → 4-hour detection blackouts.
 *
 *   2. Cascade lock starvation: The 9-minute mutex auto-expiry could release
 *      the lock while the original check was STILL RUNNING, starting a second
 *      concurrent check that conflicts with the first FA session.
 *
 * SOLUTION
 * ────────
 * Call the detection engine directly from the scheduler and watchdog
 * (in-process, no HTTP). Because these are regular async functions invoked
 * from setInterval callbacks, the Node.js event loop GUARANTEES the finally
 * block runs even on error or timeout — there is no HTTP connection that can
 * be dropped.
 *
 * The HTTP route (/api/alarms/check) still exists for manual triggers and
 * simply delegates here.
 */

import { prisma } from '@/lib/prisma';
import { initSharedFortiAnalyzerService, getFortiAnalyzerLoginHealth } from '@/lib/integrations/fortianalyzer';
import { AlarmDetectionEngine } from '@/lib/alarms/detection-engine';
import { FortiGateService } from '@/lib/integrations/fortigate';
import { processDLQ, cleanupDLQ, getDLQStats } from '@/lib/notifications/dlq-worker';
import { sendAlarmEmail } from '@/lib/notifications/email';
import { createLogger } from '@/lib/logger';

const log = createLogger('alarm-runner');

// ── FortiGate singleton ───────────────────────────────────────────────────────
// Must persist between alarm check runs so CMDB snapshot store survives.
// Re-created only when the integration config changes in the database.
let _sharedFortiGateService: FortiGateService | null = null;
let _sharedFortiGateConfigHash: string | null = null;

async function getOrInitFortiGateService(): Promise<FortiGateService | null> {
  try {
    const fgConfig = await prisma.integrationConfig.findFirst({
      where: { type: 'FORTIGATE', enabled: true },
    });
    if (!fgConfig) return null;

    // Re-create if config changed
    const configHash = JSON.stringify(fgConfig.config);
    if (_sharedFortiGateService && _sharedFortiGateConfigHash === configHash) {
      return _sharedFortiGateService;
    }

    const cfg = fgConfig.config as any;
    _sharedFortiGateService = new FortiGateService({
      host: cfg.host,
      username: cfg.username,
      password: cfg.password,
      accessToken: cfg.accessToken,
      pollingInterval: cfg.pollingInterval || 5,
      syncMode: 'rest',
      enabledModules: {
        interfaces: true, vlans: true, policies: true,
        addresses: true, vips: true, sdwan: true,
      },
    });
    _sharedFortiGateConfigHash = configHash;
    log.info('FortiGate singleton (re)initialized');
    return _sharedFortiGateService;
  } catch (err) {
    log.error({ err }, 'FortiGate init error');
    return null;
  }
}

// ── FA health alert throttle ───────────────────────────────────────────────
const FA_ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour between FA health alerts
let lastFAAlertTime = 0;

async function maybeSendFAHealthAlert(): Promise<void> {
  const health = getFortiAnalyzerLoginHealth();
  if (health.consecutiveFailures < 3) return; // Not yet concerning
  if (Date.now() - lastFAAlertTime < FA_ALERT_COOLDOWN_MS) return; // Already alerted recently

  lastFAAlertTime = Date.now();
  const subject = health.isAccountLocked
    ? `[🔒 FA LOCKED] FortiAnalyzer account locked — action required`
    : `[⚠️ FA DOWN] FortiAnalyzer unreachable — alarm detection impaired`;

  const bodyLines = [
    `FortiAnalyzer login has failed ${health.consecutiveFailures} consecutive time(s).`,
    health.isAccountLocked
      ? `The infrascope account is LOCKED (code=-22). Unlock via: FortiAnalyzer GUI → System → Administrators → infrascope → Unlock.`
      : `FA may be unreachable or credentials may have changed.`,
    `Backoff remaining: ${health.backoffRemainingSec}s`,
    health.lastFailureAt ? `Last failure: ${health.lastFailureAt.toISOString()}` : '',
    `\nImpact: Alarm detection is running on stale/cached data. New security events may not be detected until FA connection is restored.`,
  ].filter(Boolean).join('\n');

  try {
    await sendAlarmEmail({
      alarmCode: 'SYSTEM_HEALTH',
      alarmName: health.isAccountLocked ? 'FortiAnalyzer Account Locked' : 'FortiAnalyzer Unreachable',
      severity: health.isAccountLocked ? 'ALARM_CRITICAL' : 'ALARM_HIGH',
      category: 'SYSTEM',
      title: subject,
      message: bodyLines,
      timestamp: new Date(),
    }, { bypassCooldown: true });
    log.warn({ consecutiveFailures: health.consecutiveFailures }, 'FA health alert sent');
  } catch (err) {
    log.error({ err }, 'Failed to send FA health alert');
  }
}

// ── Mutex ────────────────────────────────────────────────────────────────────
// Timestamp-based: allows auto-recovery after 12 min if the runner somehow
// crashes without releasing (should never happen with direct calls, but kept
// as a safety net).
// 12 min > normal run (85-120 s) + generous buffer.
const MAX_LOCK_DURATION_MS = 12 * 60 * 1000;
let checkStartTime: number | null = null;

// ── Result cache ─────────────────────────────────────────────────────────────
export interface AlarmCheckResult {
  success: boolean;
  error?: string;
  summary: {
    total: number;
    triggered: number;
    skippedCooldown: number;
    errors: number;
  };
  metrics?: {
    durationMs: number;
    alarmsPerSecond: number;
    severityBreakdown: Record<string, { triggered: number; errors: number }>;
    categoryBreakdown: Record<string, { triggered: number; total: number }>;
  };
  triggered: Array<{
    code: string;
    matchCount: number;
    sampleEvents: Array<Record<string, unknown>>;
  }>;
  errors: Array<{ code: string; error: string | undefined }>;
}

let lastResult: AlarmCheckResult | null = null;

export function getLastAlarmCheckResult(): AlarmCheckResult | null {
  return lastResult;
}

// ── Startup Initialization ────────────────────────────────────────────────────
// Called once when the alarm system starts. Cleans up RUNNING records left
// behind by a previous process (container restart, crash, forced stop).
// Without this, a new process would be blocked by the DB guard for up to
// MAX_LOCK_DURATION_MS (12 min) on every container restart.
export async function initializeAlarmRunner(): Promise<void> {
  try {
    const orphaned = await prisma.alarmCheckLog.updateMany({
      where: { status: 'RUNNING' },
      data: { status: 'ORPHANED' },
    });
    if (orphaned.count > 0) {
      log.warn(
        { count: orphaned.count },
        'Cleaned up orphan RUNNING lock(s) from previous process'
      );
    } else {
      log.info('No orphan locks found');
    }
  } catch (err) {
    log.warn({ err }, 'Could not clean up orphan locks (non-fatal)');
  }
}

// ── Core runner ──────────────────────────────────────────────────────────────
export async function runAlarmCheck(): Promise<AlarmCheckResult> {
  // Mutex: skip if already running (in-process guard)
  if (checkStartTime !== null) {
    const elapsed = Date.now() - checkStartTime;
    if (elapsed < MAX_LOCK_DURATION_MS) {
      log.info(
        { elapsedSec: Math.round(elapsed / 1000) },
        'Already running, skipping'
      );
      return (
        lastResult ?? {
          success: false,
          error: 'Check already in progress',
          summary: { total: 0, triggered: 0, skippedCooldown: 0, errors: 0 },
          triggered: [],
          errors: [],
        }
      );
    }
    log.warn(
      { elapsedSec: Math.round(elapsed / 1000), maxLockSec: MAX_LOCK_DURATION_MS / 1000 },
      'Stale lock detected, force resetting'
    );
  }

  // DB-level guard: prevent concurrent runs from DIFFERENT module instances
  // (e.g. health-check chunk and scheduler chunk each have separate in-process mutexes).
  // Only check recent RUNNING locks — stale ones are cleaned up by AlarmScheduler before each tick.
  try {
    const recentRunning = await prisma.alarmCheckLog.findFirst({
      where: {
        status: 'RUNNING',
        checkTime: { gte: new Date(Date.now() - MAX_LOCK_DURATION_MS) },
      },
      orderBy: { checkTime: 'desc' },
    });
    if (recentRunning) {
      const ageS = Math.round((Date.now() - recentRunning.checkTime.getTime()) / 1000);
      log.info({ ageSec: ageS }, 'DB guard: another instance recently started, skipping');
      return (
        lastResult ?? {
          success: false,
          error: 'Check already in progress (DB guard)',
          summary: { total: 0, triggered: 0, skippedCooldown: 0, errors: 0 },
          triggered: [],
          errors: [],
        }
      );
    }
  } catch (dbGuardErr) {
    // Non-fatal: if DB guard check fails, proceed with in-process mutex only
    log.warn({ err: dbGuardErr }, 'DB guard check failed (non-fatal)');
  }

  checkStartTime = Date.now();
  const startTime = checkStartTime;
  log.info('Lock acquired');

  // Insert RUNNING sentinel row — lets other instances detect us via DB guard above
  let runLogId: string | null = null;
  try {
    const runLog = await prisma.alarmCheckLog.create({
      data: {
        checkTime: new Date(),
        totalAlarms: 0,
        triggeredCount: 0,
        errorCount: 0,
        durationMs: 0,
        status: 'RUNNING',
      },
    });
    runLogId = runLog.id;
  } catch (sentinelErr) {
    log.warn({ err: sentinelErr }, 'Could not insert RUNNING sentinel (non-fatal)');
  }

  try {
    // ── Load FortiAnalyzer config ──────────────────────────────────────────
    const config = await prisma.integrationConfig.findFirst({
      where: { type: 'FORTIANALYZER', enabled: true },
    });

    if (!config) {
      return {
        success: false,
        error: 'FortiAnalyzer not configured',
        summary: { total: 0, triggered: 0, skippedCooldown: 0, errors: 0 },
        triggered: [],
        errors: [],
      };
    }

    const faConfig = config.config as {
      host: string;
      username?: string;
      password?: string;
    };

    if (!faConfig.password) {
      log.error('FortiAnalyzer password not configured — skipping alarm evaluation');
      return { success: false, error: 'FortiAnalyzer password not configured', triggered: [], errors: [{ code: 'ALL', error: 'FA password missing' }], summary: { total: 0, triggered: 0, skippedCooldown: 0, errors: 1 } };
    }

    const service = initSharedFortiAnalyzerService({
      host: faConfig.host,
      username: faConfig.username,
      password: faConfig.password,
    });

    const engine = new AlarmDetectionEngine(service);

    // Inject FortiGate singleton so CMDB snapshot store persists between runs
    const fgService = await getOrInitFortiGateService();
    if (fgService) {
      engine.injectFortiGateService(fgService);
      // Clear CMDB response cache for fresh data this cycle
      fgService.clearCmdbResponseCache();
    }

    // ── Run evaluation with 10-minute timeout ──────────────────────────────
    // Normal runs complete in 85-120 s. 10 min = generous hard limit.
    const GLOBAL_TIMEOUT_MS = 10 * 60 * 1000;
    log.info({ timeoutSec: GLOBAL_TIMEOUT_MS / 1000 }, 'Starting evaluation');

    const results = await Promise.race([
      engine.evaluateAllAlarms(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Alarm evaluation timeout (10 minutes)')),
          GLOBAL_TIMEOUT_MS
        )
      ),
    ]).catch((err) => {
      // Log timeout or any other error immediately
      log.error({ err }, 'Evaluation failed');
      throw err;
    });

    const triggered = results.filter((r) => r.triggered);
    const errors = results.filter((r) => r.error && r.error !== 'cooldown-active');
    const cooldowns = results.filter((r) => r.error === 'cooldown-active');
    const durationMs = Date.now() - startTime;

    // ── Build metrics ──────────────────────────────────────────────────────
    const severityStats: Record<string, { triggered: number; errors: number }> = {};
    const categoryStats: Record<string, { triggered: number; total: number }> = {};

    for (const result of results) {
      const alarmDef = await prisma.alarmDefinition.findFirst({
        where: { code: result.alarmCode },
        select: { severity: true, category: true },
      });
      if (alarmDef) {
        if (!severityStats[alarmDef.severity])
          severityStats[alarmDef.severity] = { triggered: 0, errors: 0 };
        if (result.triggered) severityStats[alarmDef.severity].triggered++;
        if (result.error && result.error !== 'cooldown-active')
          severityStats[alarmDef.severity].errors++;

        if (!categoryStats[alarmDef.category])
          categoryStats[alarmDef.category] = { triggered: 0, total: 0 };
        categoryStats[alarmDef.category].total++;
        if (result.triggered) categoryStats[alarmDef.category].triggered++;
      }
    }

    const durationSec = Math.round(durationMs / 1000);
    const alarmsPerSec = parseFloat((results.length / (durationMs / 1000)).toFixed(1));
    log.info(
      { durationSec, triggered: triggered.length, errors: errors.length, cooldowns: cooldowns.length },
      'Evaluation complete'
    );
    log.info({ alarmsPerSec }, 'Performance metric');

    // ── Write to DB (update RUNNING → final status) ────────────────────────
    const finalLogData = {
      totalAlarms: results.length,
      triggeredCount: triggered.length,
      errorCount: errors.length,
      durationMs,
      status: errors.length > 0 ? 'PARTIAL' : 'SUCCESS',
    };
    if (runLogId) {
      await prisma.alarmCheckLog.update({ where: { id: runLogId }, data: finalLogData });
    } else {
      await prisma.alarmCheckLog.create({ data: { checkTime: new Date(), ...finalLogData } });
    }
    log.info('Logged to alarm_check_logs');

    // ── DLQ processing ─────────────────────────────────────────────────────
    try {
      const dlqStats = await getDLQStats();
      if (dlqStats.pending > 0) {
        log.info({ pending: dlqStats.pending }, 'DLQ has pending notifications, processing');
        const dlqResult = await processDLQ();
        log.info(
          { succeeded: dlqResult.succeeded, failed: dlqResult.failed, permanentlyFailed: dlqResult.permanentlyFailed },
          'DLQ processing complete'
        );
      }
      await cleanupDLQ();
    } catch (dlqErr) {
      log.error({ err: dlqErr }, 'DLQ error (non-fatal)');
    }

    // ── FA health alert ─────────────────────────────────────────
    // After every check, if FA has been failing, notify ops team once per hour.
    maybeSendFAHealthAlert().catch((err) =>
      log.error({ err }, 'maybeSendFAHealthAlert failed (non-fatal)')
    );

    lastResult = {
      success: true,
      summary: {
        total: results.length,
        triggered: triggered.length,
        skippedCooldown: cooldowns.length,
        errors: errors.length,
      },
      metrics: {
        durationMs,
        alarmsPerSecond: alarmsPerSec,
        severityBreakdown: severityStats,
        categoryBreakdown: categoryStats,
      },
      triggered: triggered.map((r) => ({
        code: r.alarmCode,
        matchCount: r.matchCount,
        sampleEvents: r.events.slice(0, 2),
      })),
      errors: errors.map((r) => ({ code: r.alarmCode, error: r.error })),
    };

    return lastResult;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    log.error(
      { err: error, durationSec: Math.round(durationMs / 1000) },
      'Error during alarm check'
    );

    // Timeout detection - force cleanup if stuck
    const isTimeout = (error as Error).message.includes('timeout');
    if (isTimeout) {
      log.warn('Timeout detected - forcing lock cleanup');
      checkStartTime = null; // Force reset the in-process lock
    }

    // ── Write FAILED log (update RUNNING → FAILED) ────────────────────────
    // This is a plain async call — guaranteed to run because we're NOT inside
    // an HTTP handler that could be dropped by the connection layer.
    try {
      const failedLogData = {
        totalAlarms: 0,
        triggeredCount: 0,
        errorCount: 1,
        durationMs,
        status: 'FAILED',
      };
      if (runLogId) {
        await prisma.alarmCheckLog.update({ where: { id: runLogId }, data: failedLogData });
      } else {
        await prisma.alarmCheckLog.create({ data: { checkTime: new Date(), ...failedLogData } });
      }
      log.info({ durationMs }, 'Logged FAILED check to alarm_check_logs');
    } catch (logErr) {
      log.error({ err: logErr }, 'Failed to write FAILED log');
    }

    return {
      success: false,
      error: (error as Error).message,
      summary: { total: 0, triggered: 0, skippedCooldown: 0, errors: 1 },
      triggered: [],
      errors: [{ code: 'SYSTEM_ERROR', error: (error as Error).message }],
    };
  } finally {
    // ── Always release lock ────────────────────────────────────────────────
    checkStartTime = null;
    log.info('Lock released');
  }
}
