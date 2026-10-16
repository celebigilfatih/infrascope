import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestActor } from '@/lib/auth/request-actor';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  if (!await getRequestActor(request)) return NextResponse.json({ error: 'Oturum gerekli.' }, { status: 401 });
  const q = (request.nextUrl.searchParams.get('q') || '').trim();
  if (q.length < 2 || q.length > 100) return NextResponse.json({ error: 'Arama 2–100 karakter olmalı.' }, { status: 400 });
  try {
    const [devices, incidents] = await Promise.all([
      prisma.device.findMany({ where: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { managementIp: { contains: q } }] }, select: { id: true, name: true, managementIp: true, nmsDeviceId: true }, orderBy: { name: 'asc' }, take: 6 }),
      prisma.alarmIncident.findMany({ where: { archiveState: 'HOT', status: { in: ['OPEN', 'ACKNOWLEDGED'] }, OR: [{ title: { contains: q, mode: 'insensitive' } }, { alarm: { code: { contains: q, mode: 'insensitive' } } }] }, select: { id: true, title: true, alarm: { select: { code: true } } }, orderBy: { lastSeenAt: 'desc' }, take: 4 }),
    ]);
    return NextResponse.json({ devices, incidents }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Arama şu anda kullanılamıyor.' }, { status: 503 });
  }
}
