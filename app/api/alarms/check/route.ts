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
import FortiAnalyzerService from '@/lib/integrations/fortianalyzer';
import { AlarmDetectionEngine } from '@/lib/alarms/detection-engine';

// Timestamp-based mutex: auto-expires after 5 minutes (prevents permanent lock on crash/SIGTERM)
const MAX_CHECK_DURATION_MS = 5 * 60 * 1000; // 5 minutes
let checkStartTime: number | null = null;
let lastCheckResult: {
  success: boolean;
  summary: { total: number; triggered: number; skippedCooldown: number; errors: number };
  triggered: Array<{ code: string; matchCount: number; sampleEvents: Array<Record<string, unknown>> }>;
  errors: Array<{ code: string; error: string | undefined }>;
} | null = null;

async function runAlarmCheck() {
  // Check for a running instance (with staleness protection)
  if (checkStartTime !== null) {
    const elapsed = Date.now() - checkStartTime;
    if (elapsed < MAX_CHECK_DURATION_MS) {
      console.log(`[AlarmCheck] Already running (${Math.round(elapsed / 1000)}s elapsed), returning cached result`);
      return lastCheckResult ?? {
        success: false,
        error: 'Check already in progress',
        summary: { total: 0, triggered: 0, skippedCooldown: 0, errors: 0 },
        triggered: [],
        errors: [],
      };
    }
    // Stale lock: previous check ran > 5 minutes — force reset
    console.warn(`[AlarmCheck] Stale lock detected (${Math.round(elapsed / 1000)}s > ${MAX_CHECK_DURATION_MS / 1000}s), force resetting`);
  }

  checkStartTime = Date.now();
  try {
    const config = await prisma.integrationConfig.findFirst({
      where: { type: 'FORTIANALYZER', enabled: true },
    });

    if (!config) {
      return { success: false, error: 'FortiAnalyzer not configured' };
    }

    const faConfig = config.config as { host: string; username?: string; password?: string };
    const service = new FortiAnalyzerService({
      host: faConfig.host,
      username: faConfig.username || 'fcelebigil',
      password: faConfig.password || 'Thor.7485-a',
    });

    const engine = new AlarmDetectionEngine(service);

    // Global 4-minute timeout for the entire evaluation
    const GLOBAL_TIMEOUT_MS = 4 * 60 * 1000;
    const results = await Promise.race([
      engine.evaluateAllAlarms(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Alarm check global timeout (4 minutes)')), GLOBAL_TIMEOUT_MS)
      ),
    ]);

    const triggered = results.filter((r) => r.triggered);
    const errors = results.filter((r) => r.error && r.error !== 'cooldown-active');
    const cooldowns = results.filter((r) => r.error === 'cooldown-active');
    const durationSec = Math.round((Date.now() - checkStartTime) / 1000);

    console.log(`[AlarmCheck] Completed in ${durationSec}s: ${triggered.length} triggered, ${errors.length} errors, ${cooldowns.length} cooldowns`);

    lastCheckResult = {
      success: true,
      summary: {
        total: results.length,
        triggered: triggered.length,
        skippedCooldown: cooldowns.length,
        errors: errors.length,
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
    return {
      success: false,
      error: (error as Error).message,
      summary: { total: 0, triggered: 0, skippedCooldown: 0, errors: 1 },
      triggered: [],
      errors: [{ code: 'SYSTEM_ERROR', error: (error as Error).message }],
    };
  } finally {
    checkStartTime = null; // Always release lock
  }
}

export async function POST() {
  try {
    const result = await runAlarmCheck();
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    console.error('[AlarmCheck] Error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const result = await runAlarmCheck();
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    console.error('[AlarmCheck] Error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
