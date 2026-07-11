import { NextRequest, NextResponse } from 'next/server';
import { getRequestActor } from '@/lib/auth/request-actor';
import { getAlarmRetentionStats, runAlarmRetention } from '@/lib/alarms/retention-service';

export const dynamic = 'force-dynamic';

async function requireAdmin(request: NextRequest) {
  const auth = await getRequestActor(request);
  return auth?.role === 'ADMIN' ? auth : null;
}

export async function GET(request: NextRequest) {
  if (!await requireAdmin(request)) {
    return NextResponse.json({ success: false, error: 'Admin role required' }, { status: 403 });
  }
  return NextResponse.json({ success: true, data: await getAlarmRetentionStats() });
}

export async function POST(request: NextRequest) {
  if (!await requireAdmin(request)) {
    return NextResponse.json({ success: false, error: 'Admin role required' }, { status: 403 });
  }
  return NextResponse.json({ success: true, data: await runAlarmRetention() });
}
