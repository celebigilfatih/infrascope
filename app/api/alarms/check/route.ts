/**
 * POST /api/alarms/check — Manual alarm evaluation trigger.
 * GET  /api/alarms/check — Same (cron-friendly).
 *
 * This route is now a thin wrapper around runAlarmCheck() from alarm-runner.ts.
 * The scheduler and watchdog call runAlarmCheck() directly (in-process) and no
 * longer use this HTTP route for their periodic triggers.
 *
 * Use this endpoint for:
 *  - Manual one-off checks from the UI or CLI
 *  - External cron-based triggers
 *  - Integration testing
 */

import { NextResponse } from 'next/server';
import { runAlarmCheck } from '@/lib/alarms/alarm-runner';

export async function POST() {
  try {
    const result = await runAlarmCheck();
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    console.error('[AlarmCheck] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function GET() {
  return POST();
}
