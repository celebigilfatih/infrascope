import { NextRequest, NextResponse } from 'next/server';

const NMS_BACKEND_URL = process.env.NMS_BACKEND_URL || 'http://localhost:4001';

/**
 * GET /api/integrations/nms/alarms
 * Get active alarms from NMS backend
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'active';
    const deviceId = searchParams.get('device_id');

    const params = new URLSearchParams({ status });
    if (deviceId) params.set('device_id', deviceId);

    const res = await fetch(`${NMS_BACKEND_URL}/api/alarms?${params.toString()}`, {
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data.error || 'Alarms fetch failed' }, { status: res.status });
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[NMS Alarms] GET error:', error.message);
    return NextResponse.json({ error: 'NMS backend unreachable', details: error.message }, { status: 503 });
  }
}

/**
 * PATCH /api/integrations/nms/alarms
 * Acknowledge an alarm: body { id, action: 'acknowledge' | 'resolve' }
 */
export async function PATCH(req: NextRequest) {
  try {
    const { id, action } = await req.json();
    const endpoint = action === 'resolve'
      ? `${NMS_BACKEND_URL}/api/alarms/${id}/resolve`
      : `${NMS_BACKEND_URL}/api/alarms/${id}/acknowledge`;

    const res = await fetch(endpoint, {
      method: 'PUT',
      signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data.error || 'Action failed' }, { status: res.status });
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: 'NMS backend unreachable', details: error.message }, { status: 503 });
  }
}
