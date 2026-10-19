import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestActor } from '@/lib/auth/request-actor';
import { canAccessSync } from '@/lib/auth/permission-policy';
import { buildingDeviceSelect, deviceBuildingId, UNASSIGNED_DEVICE_BUILDING } from '@/lib/topology/building-devices';
import { loadBuildingDeviceGraph } from '@/lib/topology/building-device-graph';
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store, max-age=0' };
const result = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
export async function GET(request: NextRequest) {
  try {
    const auth = await getRequestActor(request);
    if (!auth) return result({ success: false, error: 'Oturum açmanız gerekiyor.' }, 401);
    const params = request.nextUrl.searchParams;
    const buildingId = params.get('buildingId') || '';
    if (!buildingId) return result({ success: false, error: 'Bina seçin.' }, 400);
    if (buildingId !== UNASSIGNED_DEVICE_BUILDING && !await prisma.building.findUnique({ where: { id: buildingId }, select: { id: true } })) return result({ success: false, error: 'Bina bulunamadı.' }, 404);
    const canManage = canAccessSync(auth.role, 'devices', 'write');
    if (params.get('mode') === 'candidates') {
      const rawPage = Number(params.get('page'));
      const page = Number.isFinite(rawPage) ? Math.min(100_000, Math.max(1, Math.floor(rawPage || 1))) : 1;
      const search = (params.get('search') || '').trim().slice(0, 150);
      const where: Prisma.DeviceWhereInput = {
        rackId: null,
        ...(params.get('scope') === 'all' ? { OR: [{ buildingId: null }, { buildingId: { not: buildingId } }] } : { buildingId: null }),
        ...(search ? { AND: [{ OR: [{ name: { contains: search, mode: 'insensitive' } }, { managementIp: { contains: search, mode: 'insensitive' } }] }] } : {}),
      };
      const [items, total] = await Promise.all([prisma.device.findMany({ where, select: buildingDeviceSelect, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (page - 1) * 30, take: 30 }), prisma.device.count({ where })]);
      return result({ success: true, data: { items, total, page, pageSize: 30, canManage } });
    }
    const graph = await loadBuildingDeviceGraph(prisma, buildingId);
    return result({ success: true, data: { ...graph, canManage } });
  } catch {
    return result({ success: false, error: 'Bina cihazları ve bağlantıları yüklenemedi.' }, 503);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await getRequestActor(request);
    if (!auth) return result({ success: false, error: 'Oturum açmanız gerekiyor.' }, 401);
    if (!canAccessSync(auth.role, 'devices', 'write')) return result({ success: false, error: 'Cihaz atama yetkiniz yok.' }, 403);
    const body = await request.json().catch(() => null);
    if (!body || !['assign', 'unassign'].includes(body.action) || typeof body.buildingId !== 'string' || body.buildingId === UNASSIGNED_DEVICE_BUILDING || !Array.isArray(body.deviceIds) || !body.deviceIds.length || body.deviceIds.length > 200 || body.deviceIds.some((id: unknown) => typeof id !== 'string' || !id)) return result({ success: false, error: 'Bina ve en fazla 200 cihaz seçin.' }, 400);
    const deviceIds = Array.from(new Set<string>(body.deviceIds));
    const outcome = await prisma.$transaction(async tx => {
      if (!await tx.building.findUnique({ where: { id: body.buildingId }, select: { id: true } })) return { error: 'Bina bulunamadı.', status: 404 };
      const devices = await tx.device.findMany({ where: { id: { in: deviceIds } }, select: buildingDeviceSelect });
      if (devices.length !== deviceIds.length) return { error: 'Seçilen cihazlardan biri artık mevcut değil.', status: 404 };
      if (devices.some(device => device.rackId)) return { error: 'Kabinete bağlı cihazların binası kabinet konumundan belirlenir. Önce cihazın kabinet yerleşimini düzenleyin.', status: 409 };
      if (body.action === 'assign' && !body.allowReassign && devices.some(device => device.buildingId && device.buildingId !== body.buildingId)) return { error: 'Cihaz başka bir binaya atanmış. Diğer binalardaki cihazlar kapsamını seçip yeniden deneyin.', status: 409 };
      if (body.action === 'unassign' && devices.some(device => deviceBuildingId(device) !== body.buildingId)) return { error: 'Cihazın bina ataması değişmiş. Listeyi yenileyin.', status: 409 };
      let changedCount = 0;
      for (const device of devices) {
        const nextBuildingId = body.action === 'assign' ? body.buildingId : null;
        const changed = await tx.device.updateMany({ where: { id: device.id, rackId: null, buildingId: device.buildingId, floorId: device.floorId ?? null }, data: { buildingId: nextBuildingId, ...(device.buildingId !== nextBuildingId ? { floorId: null } : {}) } });
        changedCount += changed.count;
      }
      if (changedCount !== devices.length) throw new Error('ASSIGNMENT_CONFLICT');
      return { count: devices.length };
    });
    if ('error' in outcome) return result({ success: false, error: outcome.error }, outcome.status);
    return result({ success: true, data: outcome });
  } catch (error) {
    if (error instanceof Error && error.message === 'ASSIGNMENT_CONFLICT') return result({ success: false, error: 'Cihazların konumu değişmiş. Listeyi yenileyip tekrar deneyin.' }, 409);
    return result({ success: false, error: 'Cihaz ataması kaydedilemedi.' }, 503);
  }
}
