import { NextRequest, NextResponse } from 'next/server';

const NMS_BACKEND_URL = process.env.NMS_BACKEND_URL || 'http://localhost:4001';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');
    const endpoint = action === 'download'
      ? `${NMS_BACKEND_URL}/api/backups/${params.id}/download`
      : `${NMS_BACKEND_URL}/api/backups/${params.id}/config`;

    const res = await fetch(endpoint, { signal: AbortSignal.timeout(15000) });

    if (action === 'download') {
      const text = await res.text();
      return new NextResponse(text, {
        headers: {
          'Content-Type': 'text/plain',
          'Content-Disposition': `attachment; filename="backup-${params.id}.txt"`,
        },
      });
    }

    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data.error || 'Not found' }, { status: res.status });
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: 'NMS backend unreachable', details: error.message }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const res = await fetch(`${NMS_BACKEND_URL}/api/backups/${params.id}`, {
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
