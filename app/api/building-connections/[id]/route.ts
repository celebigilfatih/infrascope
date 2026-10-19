import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestActor } from '@/lib/auth/request-actor';
import { canAccessSync } from '@/lib/auth/permission-policy';
import { BUILDING_CONNECTION_TYPES, isBuildingConnectionSpeed } from '@/lib/topology/building-connection-options';
import type { BuildingConnectionType, Prisma } from '@prisma/client';
import { buildingConnectionInclude, buildingEndpointDevices, buildingEndpointMembership, buildingDeviceLinkType, resolveBuildingEndpoints, validBuildingEndpoints } from '@/lib/topology/building-connection-endpoints';
import { devicePortCatalog } from '@/lib/topology/device-links';

export const dynamic = 'force-dynamic';
const result = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store, max-age=0' } });
const conflictMessage = 'Bağlantı başka bir oturumda değişti. Bağlantıyı yenileyip tekrar deneyin.';
function failure(error: unknown) {
  if (['P2002', 'P2034', 'P2025'].includes((error as { code?: string })?.code || '')) return result({ success: false, error: conflictMessage }, 409);
  return result({ success: false, error: 'Bina bağlantısı işlemi tamamlanamadı. Tekrar deneyin.' }, 503);
}
async function currentLink(tx: Prisma.TransactionClient, id: string, updatedAt: string) {
  const link = await tx.buildingConnection.findUnique({ where: { id }, include: buildingConnectionInclude });
  if (!link) return { ok: false, error: 'Bağlantı artık mevcut değil.', status: 404 } as const;
  if (link.recordingMethod !== 'MANUAL') return { ok: false, error: 'Otomatik keşfedilen bağlantılar salt okunurdur.', status: 403 } as const;
  if (link.updatedAt.toISOString() !== updatedAt) return { ok: false, error: conflictMessage, status: 409 } as const;
  return { ok: true, link } as const;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getRequestActor(request);
    if (!auth) return result({ success: false, error: 'Oturum açmanız gerekiyor.' }, 401);
    const { id } = params;
    const connection = await prisma.buildingConnection.findUnique({
      where: { id },
      include: buildingConnectionInclude,
    });

    if (!connection) {
      return result({
        success: false,
        error: 'Bağlantı artık mevcut değil.',
        timestamp: new Date()
      }, 404);
    }

    if (request.nextUrl.searchParams.get('mode') === 'ports') {
      const sourceDeviceId = request.nextUrl.searchParams.get('sourceDeviceId') || '';
      const targetDeviceId = request.nextUrl.searchParams.get('targetDeviceId') || '';
      if ([sourceDeviceId, targetDeviceId].some(value => value && !/^[a-zA-Z0-9_-]{1,160}$/.test(value))) return result({ success: false, error: 'Geçerli bir cihaz seçin.' }, 400);
      if (!await buildingEndpointMembership(prisma, connection.sourceBuildingId, connection.destBuildingId, sourceDeviceId, targetDeviceId)) return result({ success: false, error: 'Cihazlardan biri ilgili binada bulunmuyor. Bağlantıyı yenileyin.' }, 409);
      const ports = await devicePortCatalog(prisma, [sourceDeviceId, targetDeviceId].filter(Boolean), connection.deviceLink?.id);
      return result({ success: true, data: { ports } });
    }

    return result({
      success: true,
      data: connection,
      endpointOptions: await buildingEndpointDevices(prisma, connection.sourceBuildingId, connection.destBuildingId),
      canEdit: connection.recordingMethod === 'MANUAL' && canAccessSync(auth.role, 'devices', 'write'),
      canDelete: connection.recordingMethod === 'MANUAL' && canAccessSync(auth.role, 'devices', 'delete'),
      timestamp: new Date()
    });
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return updateConnection(request, params.id, true);
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  return updateConnection(request, params.id, false);
}

async function updateConnection(request: NextRequest, id: string, full: boolean) {
  try {
    const auth = await getRequestActor(request);
    if (!auth) return result({ success: false, error: 'Oturum açmanız gerekiyor.' }, 401);
    if (!canAccessSync(auth.role, 'devices', 'write')) return result({ success: false, error: 'Bağlantı düzenleme yetkiniz yok.' }, 403);
    const body = await request.json().catch(() => null);
    if (!body || typeof body.updatedAt !== 'string' || !Number.isFinite(Date.parse(body.updatedAt)) || !BUILDING_CONNECTION_TYPES.some(item => item.value === body.connectionType) || !isBuildingConnectionSpeed(body.bandwidth)) return result({ success: false, error: 'Geçerli bir bağlantı türü ve hız seçin. Bağlantıyı yenileyip tekrar deneyin.' }, 400);
    if (body.endpoints !== undefined && !validBuildingEndpoints(body.endpoints)) return result({ success: false, error: 'İki uçtaki cihazları ve portları birlikte seçin veya tüm atamaları kaldırın.' }, 400);
    const data: Prisma.BuildingConnectionUncheckedUpdateManyInput = { connectionType: body.connectionType as BuildingConnectionType, bandwidth: typeof body.bandwidth === 'string' ? body.bandwidth.trim() || null : null };
    if (full) {
      if (typeof body.sourceBuildingId !== 'string' || typeof body.destBuildingId !== 'string' || !body.sourceBuildingId || !body.destBuildingId || body.sourceBuildingId === body.destBuildingId || !['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'PLANNED', 'DECOMMISSIONED'].includes(body.status)) return result({ success: false, error: 'İki farklı bina ve geçerli bir durum seçin.' }, 400);
      data.sourceBuildingId = body.sourceBuildingId; data.destBuildingId = body.destBuildingId; data.status = body.status;
      if (body.distance !== undefined) {
        const distance = body.distance === '' || body.distance === null ? null : Number(body.distance);
        if (distance !== null && (!Number.isFinite(distance) || distance < 0)) return result({ success: false, error: 'Geçerli bir mesafe girin.' }, 400);
        data.distance = distance;
      }
      for (const key of ['name', 'fiberType', 'cableSpecs', 'provider', 'circuitId', 'notes'] as const) {
        if (body[key] !== undefined) {
          if (body[key] !== null && (typeof body[key] !== 'string' || body[key].length > 10000)) return result({ success: false, error: 'Bağlantı bilgilerini kontrol edin.' }, 400);
          data[key] = body[key];
        }
      }
    }
    const outcome = await prisma.$transaction(async tx => {
      const scope = await currentLink(tx, id, body.updatedAt);
      if (!scope.ok) return { error: scope.error, status: scope.status };
      const sourceBuildingId = full ? body.sourceBuildingId : scope.link.sourceBuildingId;
      const destBuildingId = full ? body.destBuildingId : scope.link.destBuildingId;
      if (full && await tx.building.count({ where: { id: { in: [sourceBuildingId, destBuildingId] } } }) !== 2) return { error: 'Binalardan biri artık mevcut değil.', status: 409 };
      const duplicate = await tx.buildingConnection.findFirst({ where: { id: { not: id }, connectionType: body.connectionType, OR: [{ sourceBuildingId, destBuildingId }, { sourceBuildingId: destBuildingId, destBuildingId: sourceBuildingId }] } });
      if (duplicate) return { error: 'Bu iki bina arasında seçilen türde başka bir bağlantı var.', status: 409 };
      const physical = scope.link.deviceLink;
      const selection = body.endpoints !== undefined ? body.endpoints : physical ? {
        sourceDeviceId: physical.sourceDeviceId, targetDeviceId: physical.targetDeviceId,
        sourcePortId: physical.endpoints.find(port => port.side === 0)?.portId || '',
        targetPortId: physical.endpoints.find(port => port.side === 1)?.portId || '',
      } : null;
      const resolved = selection ? await resolveBuildingEndpoints(tx, sourceBuildingId, destBuildingId, selection, physical?.id) : null;
      if (resolved && !resolved.ok) return { error: resolved.error, status: resolved.status };
      const updatedAt = new Date(Math.max(Date.now(), scope.link.updatedAt.getTime() + 1));
      const update = await tx.buildingConnection.updateMany({ where: { id, updatedAt: scope.link.updatedAt }, data: { ...data, updatedAt } });
      if (update.count !== 1) return { error: conflictMessage, status: 409 };
      if (!selection && physical) await tx.deviceLink.deleteMany({ where: { buildingConnectionId: id } });
      if (selection && resolved?.ok) {
        const endpoints = [
          { deviceId: selection.sourceDeviceId, portId: resolved.source.id, portKey: resolved.source.key, portName: resolved.source.name, side: 0 },
          { deviceId: selection.targetDeviceId, portId: resolved.target.id, portKey: resolved.target.key, portName: resolved.target.name, side: 1 },
        ];
        const details = { sourceDeviceId: selection.sourceDeviceId, targetDeviceId: selection.targetDeviceId, type: buildingDeviceLinkType(body.connectionType), bandwidth: typeof data.bandwidth === 'string' ? data.bandwidth : '' };
        if (physical) {
          const changedPorts = physical.endpoints.length !== 2 || physical.sourceDeviceId !== selection.sourceDeviceId || physical.targetDeviceId !== selection.targetDeviceId || physical.endpoints.some(port => port.portId !== endpoints[port.side]?.portId);
          await tx.deviceLink.update({ where: { id: physical.id }, data: { ...details, ...(changedPorts ? { status: 'UNKNOWN' as const } : {}) } });
          await tx.deviceLinkEndpoint.deleteMany({ where: { linkId: physical.id } });
          await tx.deviceLinkEndpoint.createMany({ data: endpoints.map(port => ({ ...port, linkId: physical.id })) });
        } else await tx.deviceLink.create({ data: { ...details, buildingConnectionId: id, status: 'UNKNOWN', endpoints: { create: endpoints } } });
      }
      return { connection: await tx.buildingConnection.findUnique({ where: { id }, include: buildingConnectionInclude }) };
    }, { isolationLevel: 'Serializable' });
    if ('error' in outcome) return result({ success: false, error: outcome.error }, outcome.status);
    return result({ success: true, data: outcome.connection });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getRequestActor(request);
    if (!auth) return result({ success: false, error: 'Oturum açmanız gerekiyor.' }, 401);
    if (!canAccessSync(auth.role, 'devices', 'delete')) return result({ success: false, error: 'Bağlantı silme yetkiniz yok.' }, 403);
    const body = await request.json().catch(() => null);
    const updatedAt = body?.updatedAt ?? request.nextUrl.searchParams.get('updatedAt');
    if (typeof updatedAt !== 'string' || !Number.isFinite(Date.parse(updatedAt))) return result({ success: false, error: 'Silmeden önce bağlantıyı yenileyin.' }, 400);
    const outcome = await prisma.$transaction(async tx => {
      const scope = await currentLink(tx, params.id, updatedAt);
      if (!scope.ok) return { error: scope.error, status: scope.status };
      const removed = await tx.buildingConnection.deleteMany({ where: { id: params.id, updatedAt: scope.link.updatedAt } });
      return removed.count === 1 ? { deleted: true } : { error: conflictMessage, status: 409 };
    }, { isolationLevel: 'Serializable' });
    if ('error' in outcome) return result({ success: false, error: outcome.error }, outcome.status);
    return result({ success: true, message: 'Bina bağlantısı silindi.' });
  } catch (error) {
    return failure(error);
  }
}
