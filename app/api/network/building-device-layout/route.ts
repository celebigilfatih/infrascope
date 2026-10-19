import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestActor } from '@/lib/auth/request-actor';
import { canAccessSync } from '@/lib/auth/permission-policy';
import { buildingDeviceWhere, UNASSIGNED_DEVICE_BUILDING } from '@/lib/topology/building-devices';
import { defaultBuildingDevicePositions, deviceLayoutPrefix, isLayoutId, readDeviceLayout } from '@/lib/topology/building-device-layout';
import { loadBuildingDeviceGraph } from '@/lib/topology/building-device-graph';
import { isBuildingPosition } from '@/lib/topology/building-layout';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store, max-age=0' };
const result = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
async function buildingExists(id: string) {
  return id === UNASSIGNED_DEVICE_BUILDING || !!await prisma.building.findUnique({ where: { id }, select: { id: true } });
}
export async function GET(request: NextRequest) {
  try {
    const auth = await getRequestActor(request);
    if (!auth) return result({ success: false, error: 'Oturum açmanız gerekiyor.' }, 401);
    const buildingId = request.nextUrl.searchParams.get('buildingId');
    if (!isLayoutId(buildingId)) return result({ success: false, error: 'Geçerli bir bina seçin.' }, 400);
    if (!await buildingExists(buildingId)) return result({ success: false, error: 'Bina bulunamadı.' }, 404);
    const rows = await prisma.systemConfig.findMany({ where: { key: { startsWith: deviceLayoutPrefix(buildingId) } }, select: { key: true, value: true } });
    return result({ success: true, data: { positions: readDeviceLayout(buildingId, rows), canEdit: canAccessSync(auth.role, 'devices', 'write') } });
  } catch {
    return result({ success: false, error: 'Cihaz yerleşimi yüklenemedi.' }, 503);
  }
}
export async function PUT(request: NextRequest) {
  try {
    const auth = await getRequestActor(request);
    if (!auth) return result({ success: false, error: 'Oturum açmanız gerekiyor.' }, 401);
    if (!canAccessSync(auth.role, 'devices', 'write')) return result({ success: false, error: 'Yerleşimi değiştirme yetkiniz yok.' }, 403);
    const body = await request.json().catch(() => null);
    if (!isLayoutId(body?.buildingId) || !isLayoutId(body?.deviceId) || !isBuildingPosition(body?.position)) return result({ success: false, error: 'Geçerli bir bina, cihaz ve konum belirtin.' }, 400);
    if (!await buildingExists(body.buildingId)) return result({ success: false, error: 'Bina bulunamadı.' }, 404);
    const member = await prisma.device.findFirst({ where: { AND: [{ id: body.deviceId }, buildingDeviceWhere(body.buildingId)] }, select: { id: true } });
    if (!member) return result({ success: false, error: 'Cihaz bu binada bulunmuyor. Cihaz listesini yenileyin.' }, 409);
    const position = { x: body.position.x, y: body.position.y };
    const key = `${deviceLayoutPrefix(body.buildingId)}${body.deviceId}`;
    const value = JSON.stringify(position);
    await prisma.systemConfig.upsert({ where: { key }, create: { key, value }, update: { value } });
    return result({ success: true, data: { deviceId: body.deviceId, position } });
  } catch {
    return result({ success: false, error: 'Cihaz yerleşimi kaydedilemedi.' }, 503);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getRequestActor(request);
    if (!auth) return result({ success: false, error: 'Oturum açmanız gerekiyor.' }, 401);
    if (!canAccessSync(auth.role, 'devices', 'write')) return result({ success: false, error: 'Yerleşimi değiştirme yetkiniz yok.' }, 403);
    const body = await request.json().catch(() => null);
    if (body?.action !== 'reset' || !isLayoutId(body?.buildingId)) return result({ success: false, error: 'Geçerli bir bina ve yerleşim işlemi belirtin.' }, 400);
    if (!await buildingExists(body.buildingId)) return result({ success: false, error: 'Bina bulunamadı.' }, 404);
    const positions = await prisma.$transaction(async tx => {
      const graph = await loadBuildingDeviceGraph(tx, body.buildingId);
      const defaults = defaultBuildingDevicePositions(graph.devices.map(device => device.id), graph.connections);
      const prefix = deviceLayoutPrefix(body.buildingId);
      // Replace only this building, including devices hidden by the client's search.
      await tx.systemConfig.deleteMany({ where: { key: { startsWith: prefix } } });
      const rows = Object.entries(defaults).map(([id, position]) => ({ key: `${prefix}${id}`, value: JSON.stringify(position) }));
      if (rows.length) await tx.systemConfig.createMany({ data: rows });
      return defaults;
    });
    return result({ success: true, data: { positions } });
  } catch {
    return result({ success: false, error: 'Cihaz yerleşimi sıfırlanamadı. Mevcut düzen korunuyor.' }, 503);
  }
}
