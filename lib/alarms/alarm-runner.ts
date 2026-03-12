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
import { initSharedFortiAnalyzerService } from '@/lib/integrations/fortianalyzer';
import { AlarmDetectionEngine } from '@/lib/alarms/detection-engine';
import { processDLQ, cleanupDLQ, getDLQStats } from '@/lib/notifications/dlq-worker';

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

// ── Core runner ──────────────────────────────────────────────────────────────
export async function runAlarmCheck(): Promise<AlarmCheckResult> {
  // Mutex: skip if already running (in-process guard)
  if (checkStartTime !== null) {
    const elapsed = Date.now() - checkStartTime;
    if (elapsed < MAX_LOCK_DURATION_MS) {
      console.log(
        `[AlarmRunner] ⚠️ Already running (${Math.round(elapsed / 1000)}s elapsed), skipping`
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
    console.warn(
      `[AlarmRunner] 🔄 Stale lock detected (${Math.round(elapsed / 1000)}s > ` +
        `${MAX_LOCK_DURATION_MS / 1000}s), force resetting`
    );
  }

  // DB-level guard: prevent concurrent runs from DIFFERENT module instances
  // (e.g. health-check chunk and scheduler chunk each have separate in-process mutexes)
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
      console.log(`[AlarmRunner] ⚠️ DB guard: another instance started ${ageS}s ago, skipping`);
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
    console.warn('[AlarmRunner] DB guard check failed (non-fatal):', dbGuardErr);
  }

  checkStartTime = Date.now();
  const startTime = checkStartTime;
  console.log(`[AlarmRunner] 🔒 Lock acquired at ${new Date().toISOString()}`);

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
    console.warn('[AlarmRunner] Could not insert RUNNING sentinel (non-fatal):', sentinelErr);
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

    const service = initSharedFortiAnalyzerService({
      host: faConfig.host,
      username: faConfig.username || 'fcelebigil',
      password: faConfig.password || 'Thor.7485-a',
    });

    const engine = new AlarmDetectionEngine(service);

    // ── Run evaluation with 10-minute timeout ──────────────────────────────
    // Normal runs complete in 85-120 s. 10 min = generous hard limit.
    const GLOBAL_TIMEOUT_MS = 10 * 60 * 1000;
    console.log(
      `[AlarmRunner] Starting evaluation (${GLOBAL_TIMEOUT_MS / 1000}s timeout)...`
    );

    const results = await Promise.race([
      engine.evaluateAllAlarms(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Alarm evaluation timeout (10 minutes)')),
          GLOBAL_TIMEOUT_MS
        )
      ),
    ]);

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
    console.log(
      `[AlarmRunner] ✅ Done in ${durationSec}s: ${triggered.length} triggered, ` +
        `${errors.length} errors, ${cooldowns.length} cooldowns`
    );
    console.log(`[AlarmRunner] Performance: ${alarmsPerSec} alarms/sec`);

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
    console.log(`[AlarmRunner] Logged to alarm_check_logs`);

    // ── DLQ processing ─────────────────────────────────────────────────────
    try {
      const dlqStats = await getDLQStats();
      if (dlqStats.pending > 0) {
        console.log(
          `[AlarmRunner] DLQ has ${dlqStats.pending} pending notifications, processing...`
        );
        const dlqResult = await processDLQ();
        console.log(
          `[AlarmRunner] DLQ: ${dlqResult.succeeded} delivered, ${dlqResult.failed} retrying, ` +
            `${dlqResult.permanentlyFailed} permanently failed`
        );
      }
      await cleanupDLQ();
    } catch (dlqErr) {
      console.error('[AlarmRunner] DLQ error (non-fatal):', dlqErr);
    }

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
    console.error(
      `[AlarmRunner] ❌ Error after ${Math.round(durationMs / 1000)}s:`,
      error
    );

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
      console.log(
        `[AlarmRunner] Logged FAILED check to alarm_check_logs (${durationMs}ms)`
      );
    } catch (logErr) {
      console.error('[AlarmRunner] Failed to write FAILED log:', logErr);
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
    console.log(`[AlarmRunner] 🔓 Lock released at ${new Date().toISOString()}`);
  }
}
