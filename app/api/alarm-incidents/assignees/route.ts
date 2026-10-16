import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestActor } from '@/lib/auth/request-actor';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await getRequestActor(request);
    if (!auth) return NextResponse.json({ success: false, error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
    const users = await prisma.user.findMany({
      where: { status: 'ACTIVE', role: { in: ['ADMIN', 'EDITOR'] } },
      select: { id: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    const candidates = new Map(users.map(user => [user.id, user]));
    if (request.nextUrl.searchParams.get('scope') === 'filter') {
      // Keep past assignees discoverable even after their account is disabled or removed.
      const historical = await prisma.alarmIncident.groupBy({
        by: ['assignedToId', 'assignedTo'], where: { assignedToId: { not: null } },
        _max: { lastSeenAt: true }, orderBy: { _max: { lastSeenAt: 'desc' } },
      });
      for (const row of historical) if (row.assignedToId && !candidates.has(row.assignedToId)) {
        candidates.set(row.assignedToId, { id: row.assignedToId, name: row.assignedTo || 'Eski sorumlu' });
      }
    }
    const data = [...candidates.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr') || a.id.localeCompare(b.id));
    return NextResponse.json({ success: true, data, canManage: auth.role === 'ADMIN' || auth.role === 'EDITOR' },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch {
    return NextResponse.json({ success: false, error: 'Sorumlu listesi alınamadı.' }, { status: 503 });
  }
}
