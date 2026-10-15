import { NextRequest, NextResponse } from 'next/server';
import { getRequestActor } from '@/lib/auth/request-actor';
import { nmsInternalFetch } from '@/lib/nms/internal-client';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  if (!await getRequestActor(req)) return NextResponse.json({ error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
  try {
    const response = await nmsInternalFetch('/health/ready', { timeoutMs: 3000 });
    return NextResponse.json({ available: response.ok }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ available: false }); }
}
