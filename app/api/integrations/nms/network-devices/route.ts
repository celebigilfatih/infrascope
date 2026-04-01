import { NextRequest, NextResponse } from 'next/server';

const NMS_BACKEND_URL = process.env.NMS_BACKEND_URL || 'http://localhost:4001';

/**
 * GET /api/integrations/nms/network-devices
 * List all NMS-monitored devices (proxied from NMS backend)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const vendor = searchParams.get('vendor');
    const status = searchParams.get('status');

    let url = `${NMS_BACKEND_URL}/api/devices`;
    const params = new URLSearchParams();
    if (vendor) params.set('vendor', vendor);
    if (status) params.set('status', status);
    if (params.toString()) url += `?${params.toString()}`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: data.error || 'NMS backend error' }, { status: res.status });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[NMS Devices] GET error:', error.message);
    return NextResponse.json(
      { error: 'NMS backend unreachable', details: error.message },
      { status: 503 }
    );
  }
}

/**
 * POST /api/integrations/nms/network-devices
 * Add a new device to NMS monitoring
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const res = await fetch(`${NMS_BACKEND_URL}/api/devices`, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: data.error || 'Failed to create device' }, { status: res.status });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    console.error('[NMS Devices] POST error:', error.message);
    return NextResponse.json(
      { error: 'NMS backend unreachable', details: error.message },
      { status: 503 }
    );
  }
}
