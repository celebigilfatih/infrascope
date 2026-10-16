/**
 * POST /api/alarms/check-vmware - Trigger VMware-only alarm evaluation
 * Faster than full alarm check - only evaluates VMware snapshot/VM alarms
 */

import { NextRequest, NextResponse } from 'next/server';
import { runAlarmCheck } from '@/lib/alarms/alarm-runner';
import { authorizeApiRequest } from '@/lib/auth/api-permission';
import { checkLicense } from '@/lib/license/middleware';

export async function POST(request: NextRequest) {
  const access = await authorizeApiRequest(request, 'alarms', 'write');
  if (!access.allowed) return access.response;
  try {
    const licenseError = await checkLicense();
    if (licenseError) return licenseError;
    const result = await runAlarmCheck({ sources: ['vmware'], requireConfiguredSources: true });
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    console.error('[VMwareAlarmCheck] Error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ success: false, error: 'VMware alarm kontrolü için POST kullanın.' }, { status: 405, headers: { Allow: 'POST' } });
}
