import { NextRequest, NextResponse } from 'next/server';
import { authorizeApiRequest } from '@/lib/auth/api-permission';

const NMS_BACKEND_URL = process.env.NMS_BACKEND_URL || 'http://localhost:4001';

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const access = await authorizeApiRequest(req, 'devices', 'read');
  if (!access.allowed) return access.response;
  try {
    const res = await fetch(`${NMS_BACKEND_URL}/api/devices/${params.id}`, {
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data.error || 'Not found' }, { status: res.status });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'NMS backend unreachable', details: (error as Error).message }, { status: 503 });
  }
}

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const access = await authorizeApiRequest(req, 'devices', 'write');
  if (!access.allowed) return access.response;
  try {
    const body = await req.json();
    const res = await fetch(`${NMS_BACKEND_URL}/api/devices/${params.id}`, {
      method: 'PUT',
      signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data.error || 'Update failed' }, { status: res.status });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'NMS backend unreachable', details: (error as Error).message }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const access = await authorizeApiRequest(req, 'devices', 'delete');
  if (!access.allowed) return access.response;
  try {
    const res = await fetch(`${NMS_BACKEND_URL}/api/devices/${params.id}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data.error || 'Delete failed' }, { status: res.status });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'NMS backend unreachable', details: (error as Error).message }, { status: 503 });
  }
}
