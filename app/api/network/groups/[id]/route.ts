import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestActor } from '@/lib/auth/request-actor';
import { canAccessSync } from '@/lib/auth/permission-policy';
import { NetworkGroupError, writeNetworkGroup } from '@/lib/topology/network-group-service';
import { groupFailure, groupResult } from '@/lib/topology/network-group-response';
export const dynamic = 'force-dynamic';
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await getRequestActor(request);
    if (!auth?.actor.id) return groupResult({ success: false, error: 'Oturum açmanız gerekiyor.' }, 401);
    if (!canAccessSync(auth.role, 'devices', 'write')) return groupResult({ success: false, error: 'Ağ grubunu düzenleme yetkiniz yok.' }, 403);
    const body = await request.json().catch(() => null);
    const actorId = auth.actor.id;
    const id = await prisma.$transaction(tx => writeNetworkGroup(tx, body, actorId, params.id), { isolationLevel: 'Serializable' });
    return groupResult({ success: true, data: { id } });
  } catch (error) { return groupFailure(error); }
}
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await getRequestActor(request);
    if (!auth?.actor.id) return groupResult({ success: false, error: 'Oturum açmanız gerekiyor.' }, 401);
    if (!canAccessSync(auth.role, 'devices', 'write')) return groupResult({ success: false, error: 'Ağ grubunu silme yetkiniz yok.' }, 403);
    const body = await request.json().catch(() => null);
    await prisma.$transaction(async tx => {
      const group = await tx.networkGroup.findUnique({ where: { id: params.id }, include: { members: true } });
      if (!group) throw new NetworkGroupError(404, 'Ağ grubu bulunamadı.');
      if (body?.version !== group.version) throw new NetworkGroupError(409, 'Grup değişti. Yenileyip tekrar deneyin.');
      await tx.networkGroup.delete({ where: { id: params.id } });
      await tx.auditLog.create({ data: { entity: 'NetworkGroup', entityId: group.id, action: 'DELETE', userId: auth.actor.id, resource: 'devices', resourceId: group.id, details: { before: JSON.parse(JSON.stringify(group)) } } });
    }, { isolationLevel: 'Serializable' });
    return groupResult({ success: true, data: { id: params.id } });
  } catch (error) { return groupFailure(error); }
}
