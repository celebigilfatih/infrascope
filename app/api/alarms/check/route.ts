/**
 * POST /api/alarms/check - Trigger alarm evaluation
 * GET  /api/alarms/check - Auto-check (cron-friendly, same logic)
 * Runs the detection engine against FortiAnalyzer logs
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import FortiAnalyzerService from '@/lib/integrations/fortianalyzer';
import { AlarmDetectionEngine } from '@/lib/alarms/detection-engine';

async function runAlarmCheck() {
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
    const results = await engine.evaluateAllAlarms();

    const triggered = results.filter((r) => r.triggered);
    const errors = results.filter((r) => r.error && r.error !== 'cooldown-active');
    const cooldowns = results.filter((r) => r.error === 'cooldown-active');

    return {
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
  } catch (error) {
    console.error('[runAlarmCheck] Critical error:', error);
    // Return error info instead of throwing - keeps API responsive
    return {
      success: false,
      error: (error as Error).message,
      summary: { total: 0, triggered: 0, skippedCooldown: 0, errors: 1 },
      triggered: [],
      errors: [{ code: 'SYSTEM_ERROR', error: (error as Error).message }],
    };
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
