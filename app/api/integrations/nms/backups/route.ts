import { NextRequest, NextResponse } from 'next/server';

const NMS_BACKEND_URL = process.env.NMS_BACKEND_URL || 'http://localhost:4001';

/**
 * GET /api/integrations/nms/backups
 * List config backups (proxied from NMS backend)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const params = new URLSearchParams();
    if (searchParams.get('device_id')) params.set('device_id', searchParams.get('device_id')!);
    if (searchParams.get('backup_type')) params.set('backup_type', searchParams.get('backup_type')!);
    if (searchParams.get('search')) params.set('search', searchParams.get('search')!);

    const url = `${NMS_BACKEND_URL}/api/backups${params.toString() ? '?' + params.toString() : ''}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await res.json();

    if (!res.ok) return NextResponse.json({ error: data.error || 'Backups fetch failed' }, { status: res.status });
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[NMS Backups] GET error:', error.message);
    return NextResponse.json({ error: 'NMS backend unreachable', details: error.message }, { status: 503 });
  }
}

/**
 * POST /api/integrations/nms/backups
 * Create a new config backup
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetch(`${NMS_BACKEND_URL}/api/backups`, {
      method: 'POST',
      signal: AbortSignal.timeout(90000), // 90s — SSH connection to device can take up to 45s
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data.error || 'Backup creation failed' }, { status: res.status });
    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    console.error('[NMS Backups] POST error:', error.message);
    return NextResponse.json({ error: 'NMS backend unreachable', details: error.message }, { status: 503 });
  }
}
