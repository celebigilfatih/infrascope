/**
 * POST /api/alarms/check — Manual alarm evaluation trigger.
 * GET  /api/alarms/check — Method not allowed; triggers require POST.
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

import { NextRequest, NextResponse } from 'next/server';
import { runAlarmCheck } from '@/lib/alarms/alarm-runner';
import { authorizeApiRequest } from '@/lib/auth/api-permission';

export async function POST(request: NextRequest) {
  const access = await authorizeApiRequest(request, 'alarms', 'write');
  if (!access.allowed) return access.response;
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
  return NextResponse.json({ success: false, error: 'Alarm kontrolü için POST kullanın.' }, { status: 405, headers: { Allow: 'POST' } });
}
