import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildingConnectionInclude } from '@/lib/topology/building-connection-endpoints';
import { getRequestActor } from '@/lib/auth/request-actor';
import { canAccessSync } from '@/lib/auth/permission-policy';
import { isLayoutId } from '@/lib/topology/building-device-layout';
import { BUILDING_CONNECTION_TYPES, isBuildingConnectionSpeed } from '@/lib/topology/building-connection-options';
import type { BuildingConnectionStatus, BuildingConnectionType } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const connections = await prisma.buildingConnection.findMany({
      include: buildingConnectionInclude,
    });

    return NextResponse.json({
      success: true,
      data: {
        items: connections,
        total: connections.length
      },
      timestamp: new Date()
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    console.error('Error fetching building connections:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch building connections',
      timestamp: new Date()
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
    const auth = await getRequestActor(request);
    if (!auth) return result({ success: false, error: 'Oturum açmanız gerekiyor.' }, 401);
    if (!canAccessSync(auth.role, 'devices', 'write')) return result({ success: false, error: 'Bağlantı oluşturma yetkiniz yok.' }, 403);
    const body = await request.json().catch(() => null);
    const textFields = ['name', 'fiberType', 'notes', 'cableSpecs', 'provider', 'circuitId'] as const;
    const statuses = ['UNKNOWN', 'ACTIVE', 'INACTIVE', 'MAINTENANCE', 'PLANNED', 'DECOMMISSIONED'];
    if (!body || !isLayoutId(body.sourceBuildingId) || !isLayoutId(body.destBuildingId) || body.sourceBuildingId === body.destBuildingId
      || !BUILDING_CONNECTION_TYPES.some(type => type.value === body.connectionType)
      || (body.status !== undefined && !statuses.includes(body.status))
      || !isBuildingConnectionSpeed(body.bandwidth ?? null)
      || textFields.some(key => body[key] != null && (typeof body[key] !== 'string' || body[key].length > (key === 'notes' ? 5000 : 500)))
      || (body.distance != null && body.distance !== '' && (!['string', 'number'].includes(typeof body.distance) || !Number.isFinite(Number(body.distance)) || Number(body.distance) < 0))) {
      return result({ success: false, error: 'İki farklı bina, geçerli bağlantı türü ve alan değerleri seçin.' }, 400);
    }
    const data = {
      sourceBuildingId: body.sourceBuildingId as string, destBuildingId: body.destBuildingId as string,
      connectionType: body.connectionType as BuildingConnectionType, status: (body.status ?? 'UNKNOWN') as BuildingConnectionStatus,
      bandwidth: body.bandwidth?.trim() || null, distance: body.distance == null || body.distance === '' ? null : Number(body.distance),
      ...Object.fromEntries(textFields.map(key => [key, body[key]?.trim() || null])) as Record<typeof textFields[number], string | null>,
      recordingMethod: 'MANUAL' as const,
    };
    const outcome = await prisma.$transaction(async tx => {
      if (await tx.building.count({ where: { id: { in: [data.sourceBuildingId, data.destBuildingId] } } }) !== 2) return { error: 'Binalardan biri artık mevcut değil.', status: 404 };
      const existing = await tx.buildingConnection.findFirst({ where: { connectionType: data.connectionType, OR: [
        { sourceBuildingId: data.sourceBuildingId, destBuildingId: data.destBuildingId },
        { sourceBuildingId: data.destBuildingId, destBuildingId: data.sourceBuildingId },
      ] } });
      if (existing) {
        const comparisonKeys = [...textFields, 'bandwidth', 'distance', 'status'] as const;
        const same = existing.recordingMethod === 'MANUAL' && comparisonKeys.every(key => (existing[key] ?? null) === data[key]);
        return same ? { connection: existing, status: 200 } : { error: 'Bu binalar arasında bu türde farklı bir bağlantı zaten var. Mevcut bağlantıyı inceleyin.', status: 409 };
      }
      return { connection: await tx.buildingConnection.create({ data }), status: 201 };
    }, { isolationLevel: 'Serializable' });
    if ('error' in outcome) return result({ success: false, error: outcome.error }, outcome.status);
    return result({ success: true, data: outcome.connection, timestamp: new Date() }, outcome.status);
  } catch (error) {
    const conflict = ['P2002', 'P2034'].includes((error as { code?: string })?.code || '');
    return NextResponse.json({ success: false, error: conflict ? 'Bağlantı başka bir oturumda değişti. Yenileyip tekrar deneyin.' : 'Bağlantı kaydedilemedi. Seçimleriniz korundu; yeniden deneyin.' }, { status: conflict ? 409 : 503 });
  }
}
