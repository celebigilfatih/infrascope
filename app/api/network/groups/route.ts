import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestActor } from '@/lib/auth/request-actor';
import { canAccessSync } from '@/lib/auth/permission-policy';
import { groupOptions, listNetworkGroups, writeNetworkGroup } from '@/lib/topology/network-group-service';
import { groupFailure, groupResult } from '@/lib/topology/network-group-response';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try {
    const auth = await getRequestActor(request);
    if (!auth?.actor.id) return groupResult({ success: false, error: 'Oturum açmanız gerekiyor.' }, 401);
    const canManage = canAccessSync(auth.role, 'devices', 'write');
    const params = request.nextUrl.searchParams;
    if (params.get('options') === '1') return groupResult({ success: true, data: { ...await groupOptions(prisma, params.get('sourceDeviceId')), canManage } });
    return groupResult({ success: true, data: { items: await listNetworkGroups(prisma), canManage } });
  } catch (error) { return groupFailure(error); }
}
export async function POST(request: NextRequest) {
  try {
    const auth = await getRequestActor(request);
    if (!auth?.actor.id) return groupResult({ success: false, error: 'Oturum açmanız gerekiyor.' }, 401);
    if (!canAccessSync(auth.role, 'devices', 'write')) return groupResult({ success: false, error: 'Ağ grubu oluşturma yetkiniz yok.' }, 403);
    const body = await request.json().catch(() => null);
    const actorId = auth.actor.id;
    const id = await prisma.$transaction(tx => writeNetworkGroup(tx, body, actorId), { isolationLevel: 'Serializable' });
    return groupResult({ success: true, data: { id } }, 201);
  } catch (error) { return groupFailure(error); }
}
