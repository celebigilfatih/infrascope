import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestActor } from '@/lib/auth/request-actor';
import { canAccessSync } from '@/lib/auth/permission-policy';
import { BUILDING_LAYOUT_KEY_PREFIX, UNASSIGNED_BUILDING_NODE_ID, isBuildingNodeId, isBuildingPosition, readBuildingLayout } from '@/lib/topology/building-layout';
import { buildingGraphPositions } from '@/lib/topology/building-graph';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store, max-age=0' };

export async function GET(request: NextRequest) {
  try {
    const auth = await getRequestActor(request);
    if (!auth) return NextResponse.json({ success: false, error: 'Oturum açmanız gerekiyor.' }, { status: 401, headers });
    const rows = await prisma.systemConfig.findMany({ where: { key: { startsWith: BUILDING_LAYOUT_KEY_PREFIX } }, select: { key: true, value: true } });
    return NextResponse.json({ success: true, data: { positions: readBuildingLayout(rows), canEdit: canAccessSync(auth.role, 'devices', 'write') } }, { headers });
  } catch {
    return NextResponse.json({ success: false, error: 'Bina yerleşimi yüklenemedi.' }, { status: 503, headers });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await getRequestActor(request);
    if (!auth) return NextResponse.json({ success: false, error: 'Oturum açmanız gerekiyor.' }, { status: 401, headers });
    if (!canAccessSync(auth.role, 'devices', 'write')) return NextResponse.json({ success: false, error: 'Yerleşimi değiştirme yetkiniz yok.' }, { status: 403, headers });
    const body = await request.json().catch(() => null);
    if (!isBuildingNodeId(body?.nodeId) || !isBuildingPosition(body?.position)) return NextResponse.json({ success: false, error: 'Geçerli bir bina ve konum belirtin.' }, { status: 400, headers });
    if (body.nodeId !== UNASSIGNED_BUILDING_NODE_ID) {
      const building = await prisma.building.findUnique({ where: { id: body.nodeId.slice('building-'.length) }, select: { id: true } });
      if (!building) return NextResponse.json({ success: false, error: 'Bina bulunamadı.' }, { status: 404, headers });
    }
    const position = { x: body.position.x, y: body.position.y };
    const key = `${BUILDING_LAYOUT_KEY_PREFIX}${body.nodeId}`;
    const value = JSON.stringify(position);
    // Each node has its own row so moving one building cannot overwrite another.
    await prisma.systemConfig.upsert({ where: { key }, create: { key, value }, update: { value } });
    return NextResponse.json({ success: true, data: { nodeId: body.nodeId, position } }, { headers });
  } catch {
    return NextResponse.json({ success: false, error: 'Bina yerleşimi kaydedilemedi.' }, { status: 503, headers });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getRequestActor(request);
    if (!auth) return NextResponse.json({ success: false, error: 'Oturum açmanız gerekiyor.' }, { status: 401, headers });
    if (!canAccessSync(auth.role, 'devices', 'write')) return NextResponse.json({ success: false, error: 'Yerleşimi değiştirme yetkiniz yok.' }, { status: 403, headers });
    const body = await request.json().catch(() => null);
    if (body?.action !== 'reset') return NextResponse.json({ success: false, error: 'Geçerli bir yerleşim işlemi belirtin.' }, { status: 400, headers });
    const positions = await prisma.$transaction(async tx => {
      const buildings = await tx.building.findMany({ select: { id: true, name: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
      const connections = await tx.buildingConnection.findMany({ select: { sourceBuildingId: true, destBuildingId: true } });
      const center = buildings.find(building => building.name.trim().toLocaleLowerCase('tr') === 'sistem odası');
      const unassignedId = UNASSIGNED_BUILDING_NODE_ID.slice('building-'.length);
      const defaults = buildingGraphPositions([...buildings.map(building => building.id), unassignedId], connections, false, unassignedId, center?.id);
      const result = Object.fromEntries(Object.entries(defaults).map(([id, position]) => [`building-${id}`, position]));
      // Replace the complete layout atomically, including buildings hidden by filters.
      await tx.systemConfig.deleteMany({ where: { key: { startsWith: BUILDING_LAYOUT_KEY_PREFIX } } });
      await tx.systemConfig.createMany({ data: Object.entries(result).map(([nodeId, position]) => ({ key: `${BUILDING_LAYOUT_KEY_PREFIX}${nodeId}`, value: JSON.stringify(position) })) });
      return result;
    });
    return NextResponse.json({ success: true, data: { positions } }, { headers });
  } catch {
    return NextResponse.json({ success: false, error: 'Yerleşim sıfırlanamadı. Mevcut düzen korunuyor.' }, { status: 503, headers });
  }
}
