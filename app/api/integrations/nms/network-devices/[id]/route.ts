import { NextRequest, NextResponse } from 'next/server';

const NMS_BACKEND_URL = process.env.NMS_BACKEND_URL || 'http://localhost:4001';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const res = await fetch(`${NMS_BACKEND_URL}/api/devices/${params.id}`, {
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data.error || 'Not found' }, { status: res.status });
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: 'NMS backend unreachable', details: error.message }, { status: 503 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
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
  } catch (error: any) {
    return NextResponse.json({ error: 'NMS backend unreachable', details: error.message }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const res = await fetch(`${NMS_BACKEND_URL}/api/devices/${params.id}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data.error || 'Delete failed' }, { status: res.status });
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: 'NMS backend unreachable', details: error.message }, { status: 503 });
  }
}
