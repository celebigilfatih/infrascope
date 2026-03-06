/**
 * POST /api/alarms/check - Trigger alarm evaluation
 * GET  /api/alarms/check - Auto-check (cron-friendly, same logic)
 * Runs the detection engine against FortiAnalyzer logs.
 *
 * Mutex: Timestamp-based to prevent concurrent FA login race conditions.
 * Auto-expires after MAX_CHECK_DURATION_MS to prevent permanent lock if process crashes.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import FortiAnalyzerService, { initSharedFortiAnalyzerService } from '@/lib/integrations/fortianalyzer';
import { AlarmDetectionEngine } from '@/lib/alarms/detection-engine';

// Timestamp-based mutex: auto-expires after 20 minutes (prevents permanent lock on crash/SIGTERM)
const MAX_CHECK_DURATION_MS = 20 * 60 * 1000; // 20 minutes (allows 15 min global timeout + buffer)
let checkStartTime: number | null = null;
let lastCheckResult: {
  success: boolean;
  summary: { total: number; triggered: number; skippedCooldown: number; errors: number };
  metrics?: {
    durationMs: number;
    alarmsPerSecond: number;
    severityBreakdown: Record<string, { triggered: number; errors: number }>;
    categoryBreakdown: Record<string, { triggered: number; total: number }>;
  };
  triggered: Array<{ code: string; matchCount: number; sampleEvents: Array<Record<string, unknown>> }>;
  errors: Array<{ code: string; error: string | undefined }>;
} | null = null;

async function runAlarmCheck() {
  // Check for a running instance (with staleness protection)
  if (checkStartTime !== null) {
    const elapsed = Date.now() - checkStartTime;
    if (elapsed < MAX_CHECK_DURATION_MS) {
      console.log(`[AlarmCheck] ⚠️ Already running (${Math.round(elapsed / 1000)}s elapsed), returning cached result`);
      return lastCheckResult ?? {
        success: false,
        error: 'Check already in progress',
        summary: { total: 0, triggered: 0, skippedCooldown: 0, errors: 0 },
        triggered: [],
        errors: [],
      };
    }
    // Stale lock: previous check ran > 5 minutes — force reset
    console.warn(`[AlarmCheck] 🔄 Stale lock detected (${Math.round(elapsed / 1000)}s > ${MAX_CHECK_DURATION_MS / 1000}s), force resetting`);
  }

  checkStartTime = Date.now();
  console.log(`[AlarmCheck] 🔒 Lock acquired at ${new Date().toISOString()}`);
  try {
    const config = await prisma.integrationConfig.findFirst({
      where: { type: 'FORTIANALYZER', enabled: true },
    });

    if (!config) {
      return { success: false, error: 'FortiAnalyzer not configured' };
    }

    const faConfig = config.config as { host: string; username?: string; password?: string };
    // Use shared singleton to prevent concurrent login limit issues
    const service = initSharedFortiAnalyzerService({
      host: faConfig.host,
      username: faConfig.username || 'fcelebigil',
      password: faConfig.password || 'Thor.7485-a',
    });

    const engine = new AlarmDetectionEngine(service);

    // OPTIMIZED: Global 8-minute timeout (down from 15 min) - optimized engine should complete in <5 min
    const GLOBAL_TIMEOUT_MS = 8 * 60 * 1000;
    
    console.log(`[AlarmCheck] Starting alarm evaluation with ${GLOBAL_TIMEOUT_MS / 1000}s timeout...`);
    const startTime = Date.now();
    
    const results = await Promise.race([
      engine.evaluateAllAlarms(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Alarm check global timeout (8 minutes)')), GLOBAL_TIMEOUT_MS)
      ),
    ]);

    const triggered = results.filter((r) => r.triggered);
    const errors = results.filter((r) => r.error && r.error !== 'cooldown-active');
    const cooldowns = results.filter((r) => r.error === 'cooldown-active');
    const durationSec = Math.round((Date.now() - startTime) / 1000);
    const durationMs = Date.now() - startTime;

    // Calculate detailed metrics
    const severityStats: Record<string, { triggered: number; errors: number }> = {};
    const categoryStats: Record<string, { triggered: number; total: number }> = {};
    
    for (const result of results) {
      // Get alarm definition for severity/category
      const alarmDef = await prisma.alarmDefinition.findFirst({
        where: { code: result.alarmCode },
        select: { severity: true, category: true },
      });
      
      if (alarmDef) {
        // Severity stats
        if (!severityStats[alarmDef.severity]) {
          severityStats[alarmDef.severity] = { triggered: 0, errors: 0 };
        }
        if (result.triggered) severityStats[alarmDef.severity].triggered++;
        if (result.error && result.error !== 'cooldown-active') severityStats[alarmDef.severity].errors++;
        
        // Category stats
        if (!categoryStats[alarmDef.category]) {
          categoryStats[alarmDef.category] = { triggered: 0, total: 0 };
        }
        categoryStats[alarmDef.category].total++;
        if (result.triggered) categoryStats[alarmDef.category].triggered++;
      }
    }

    console.log(`[AlarmCheck] ✅ Completed in ${durationSec}s: ${triggered.length} triggered, ${errors.length} errors, ${cooldowns.length} cooldowns`);
    console.log(`[AlarmCheck] Performance: ${(results.length / (durationMs / 1000)).toFixed(1)} alarms/sec`);
    console.log(`[AlarmCheck] Severity Breakdown:`, JSON.stringify(severityStats));
    console.log(`[AlarmCheck] Category Breakdown:`, JSON.stringify(categoryStats));

    // Write to AlarmCheckLog for watchdog monitoring
    try {
      await prisma.alarmCheckLog.create({
        data: {
          checkTime: new Date(),
          totalAlarms: results.length,
          triggeredCount: triggered.length,
          errorCount: errors.length,
          durationMs: durationMs,
          status: errors.length > 0 ? (triggered.length > 0 ? 'PARTIAL' : 'PARTIAL') : 'SUCCESS',
        },
      });
      console.log(`[AlarmCheck] Logged to AlarmCheckLog`);
    } catch (logError) {
      console.error('[AlarmCheck] Failed to write AlarmCheckLog:', logError);
    }

    lastCheckResult = {
      success: true,
      summary: {
        total: results.length,
        triggered: triggered.length,
        skippedCooldown: cooldowns.length,
        errors: errors.length,
      },
      metrics: {
        durationMs,
        alarmsPerSecond: parseFloat((results.length / (durationMs / 1000)).toFixed(1)),
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

    return lastCheckResult;
  } catch (error) {
    console.error('[AlarmCheck] Critical error:', error);
    
    // Log failed checks to AlarmCheckLog (timeout, crash, etc.)
    const durationMs = checkStartTime ? Date.now() - checkStartTime : 0;
    try {
      await prisma.alarmCheckLog.create({
        data: {
          checkTime: new Date(),
          totalAlarms: 0,
          triggeredCount: 0,
          errorCount: 1,
          durationMs: durationMs,
          status: 'FAILED',
        },
      });
      console.log(`[AlarmCheck] Logged FAILED check to AlarmCheckLog (${durationMs}ms)`);
    } catch (logError) {
      console.error('[AlarmCheck] Failed to write AlarmCheckLog:', logError);
    }
    
    return {
      success: false,
      error: (error as Error).message,
      summary: { total: 0, triggered: 0, skippedCooldown: 0, errors: 1 },
      triggered: [],
      errors: [{ code: 'SYSTEM_ERROR', error: (error as Error).message }],
    };
  } finally {
    checkStartTime = null; // Always release lock
    console.log(`[AlarmCheck] 🔓 Lock released at ${new Date().toISOString()}`);
  }
}

export async function POST() {
  try {
    const result = await runAlarmCheck();
    if (!result) {
      return NextResponse.json({ success: false, error: 'Alarm check returned null' }, { status: 500 });
    }
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    console.error('[AlarmCheck] Error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const result = await runAlarmCheck();
    if (!result) {
      return NextResponse.json({ success: false, error: 'Alarm check returned null' }, { status: 500 });
    }
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    console.error('[AlarmCheck] Error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
