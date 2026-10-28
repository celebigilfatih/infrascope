import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestActor } from '@/lib/auth/request-actor';
import { canAccessSync } from '@/lib/auth/permission-policy';
import { buildingDeviceWhere, UNASSIGNED_DEVICE_BUILDING } from '@/lib/topology/building-devices';
import { isLayoutId } from '@/lib/topology/building-device-layout';
import { DEVICE_LINK_SPEEDS, DEVICE_LINK_TYPES } from '@/lib/topology/device-link-options';
import { deviceLinkSelect, devicePortCatalog, normalizeDeviceLinks } from '@/lib/topology/device-links';
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store, max-age=0' };
const result = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
function validPair(body: { buildingId?: unknown; sourceDeviceId?: unknown; targetDeviceId?: unknown } | null) {
  return !!body && isLayoutId(body.buildingId) && isLayoutId(body.sourceDeviceId) && isLayoutId(body.targetDeviceId) && body.sourceDeviceId !== body.targetDeviceId;
}
const editableSelect = { ...deviceLinkSelect, buildingConnectionId: true, updatedAt: true, endpoints: { select: { side: true, portId: true, portKey: true, portName: true } } } satisfies Prisma.DeviceLinkSelect;
function validDetails(body: { type?: unknown; bandwidth?: unknown; sourcePortId?: unknown; targetPortId?: unknown } | null) {
  return !!body && DEVICE_LINK_TYPES.some(item => item.value === body.type) && DEVICE_LINK_SPEEDS.some(speed => speed === body.bandwidth) && [body.sourcePortId, body.targetPortId].every(id => typeof id === 'string' && id.length <= 160 && /^(switch|interface|nms):[a-zA-Z0-9_-]+$/.test(id));
}
function conflict(err: unknown) {
  return ['P2002', 'P2034', 'P2025'].includes((err as { code?: string }).code || '');
}
export async function GET(request: NextRequest) {
  try {
    const auth = await getRequestActor(request);
    if (!auth) return result({ success: false, error: 'Oturum açmanız gerekiyor.' }, 401);
    const body = Object.fromEntries(request.nextUrl.searchParams);
    if (!validPair(body)) return result({ success: false, error: 'Aynı binadan iki farklı cihaz seçin.' }, 400);
    const ids = [body.sourceDeviceId, body.targetDeviceId];
    const members = await prisma.device.count({ where: { AND: [{ id: { in: ids } }, buildingDeviceWhere(body.buildingId)] } });
    if (members !== 2) return result({ success: false, error: 'Cihazlardan biri bu binada bulunmuyor. Cihaz listesini yenileyin.' }, 409);
    if (body.connectionId && !isLayoutId(body.connectionId)) return result({ success: false, error: 'Geçerli bir bağlantı seçin.' }, 400);
    const link = body.connectionId ? await prisma.deviceLink.findUnique({ where: { id: body.connectionId }, select: editableSelect }) : null;
    if (body.connectionId && !link) return result({ success: false, error: 'Bağlantı artık mevcut değil.' }, 404);
    if (link?.buildingConnectionId) return result({ success: false, error: 'Bu bağlantıyı binalar arası haritadan düzenleyin.' }, 403);
    if (link && (link.sourceDeviceId !== body.sourceDeviceId || link.targetDeviceId !== body.targetDeviceId)) return result({ success: false, error: 'Bağlantı uçları bu cihazlarla eşleşmiyor.' }, 409);
    const ports = await devicePortCatalog(prisma, ids, link?.id);
    const selectedPort = (side: number, deviceId: string) => {
      const endpoint = link?.endpoints.find(port => port.side === side);
      return ports[deviceId]?.find(port => port.id === endpoint?.portId || port.key === endpoint?.portKey)?.id || endpoint?.portId || '';
    };
    return result({ success: true, data: { ports, ...(link ? { connection: { ...normalizeDeviceLinks([link])[0], updatedAt: link.updatedAt.toISOString(), sourcePortId: selectedPort(0, link.sourceDeviceId), targetPortId: selectedPort(1, link.targetDeviceId) }, canEdit: canAccessSync(auth.role, 'devices', 'write'), canDelete: canAccessSync(auth.role, 'devices', 'delete') } : {}) } });
  } catch { return result({ success: false, error: 'Cihaz portları yüklenemedi.' }, 503); }
}
export async function POST(request: NextRequest) {
  try {
    const auth = await getRequestActor(request);
    if (!auth) return result({ success: false, error: 'Oturum açmanız gerekiyor.' }, 401);
    if (!canAccessSync(auth.role, 'devices', 'write')) return result({ success: false, error: 'Bağlantı oluşturma yetkiniz yok.' }, 403);
    const body = await request.json().catch(() => null);
    if (!validPair(body) || !validDetails(body)) return result({ success: false, error: 'Cihazları, portları, bağlantı türünü ve hızını seçin.' }, 400);
    const outcome = await prisma.$transaction(async tx => {
      if (body.buildingId !== UNASSIGNED_DEVICE_BUILDING && !await tx.building.findUnique({ where: { id: body.buildingId }, select: { id: true } })) return { error: 'Bina bulunamadı.', status: 404 };
      const ids = [body.sourceDeviceId, body.targetDeviceId];
      const members = await tx.device.count({ where: { AND: [{ id: { in: ids } }, buildingDeviceWhere(body.buildingId)] } });
      if (members !== 2) return { error: 'Cihazlardan biri bu binada bulunmuyor. Cihaz listesini yenileyin.', status: 409 };
      const catalog = await devicePortCatalog(tx, ids);
      const source = catalog[body.sourceDeviceId]?.find(port => port.id === body.sourcePortId);
      const target = catalog[body.targetDeviceId]?.find(port => port.id === body.targetPortId);
      if (!source || !target) return { error: 'Seçilen portlardan biri bu cihaza ait değil veya artık mevcut değil.', status: 400 };
      const existing = await tx.deviceLink.findFirst({ where: { OR: [
        { sourceDeviceId: body.sourceDeviceId, targetDeviceId: body.targetDeviceId },
        { sourceDeviceId: body.targetDeviceId, targetDeviceId: body.sourceDeviceId },
      ], AND: [
        { endpoints: { some: { deviceId: body.sourceDeviceId, portId: body.sourcePortId } } },
        { endpoints: { some: { deviceId: body.targetDeviceId, portId: body.targetPortId } } },
      ] }, select: editableSelect });
      if (existing) {
        if (!existing.buildingConnectionId && existing.source !== 'DRAWIO' && existing.type === body.type && existing.bandwidth === body.bandwidth) return { connection: normalizeDeviceLinks([existing])[0], replayed: true };
        return { error: 'Bu portlar arasında farklı bir bağlantı zaten var.', status: 409 };
      }
      if (source.occupied || target.occupied) return { error: 'Seçilen portlardan biri başka bir bağlantıda kullanılıyor. Boş bir port seçin.', status: 409 };
      const link = await tx.deviceLink.create({ data: { sourceDeviceId: body.sourceDeviceId, targetDeviceId: body.targetDeviceId, type: body.type, bandwidth: body.bandwidth, status: 'UNKNOWN', endpoints: { create: [
        { deviceId: body.sourceDeviceId, portId: source.id, portKey: source.key, portName: source.name, side: 0 },
        { deviceId: body.targetDeviceId, portId: target.id, portKey: target.key, portName: target.name, side: 1 },
      ] } }, select: deviceLinkSelect });
      return { connection: normalizeDeviceLinks([link])[0] };
    }, { isolationLevel: 'Serializable' });
    if ('error' in outcome) return result({ success: false, error: outcome.error }, outcome.status);
    return result({ success: true, data: { connection: outcome.connection } }, 'replayed' in outcome ? 200 : 201);
  } catch (err) {
    if (conflict(err)) return result({ success: false, error: 'Portlardan biri az önce kullanıldı veya cihaz değişti. Portları yenileyip tekrar deneyin.' }, 409);
    return result({ success: false, error: 'Cihaz bağlantısı kaydedilemedi.' }, 503);
  }
}

async function scopedLink(tx: Prisma.TransactionClient, body: { connectionId: string; buildingId: string; updatedAt: string }) {
  const link = await tx.deviceLink.findUnique({ where: { id: body.connectionId }, select: editableSelect });
  if (!link) return { ok: false, error: 'Bağlantı artık mevcut değil.', status: 404 } as const;
  if (link.buildingConnectionId) return { ok: false, error: 'Bu bağlantıyı binalar arası haritadan düzenleyin.', status: 403 } as const;
  const count = await tx.device.count({ where: { AND: [{ id: { in: [link.sourceDeviceId, link.targetDeviceId] } }, buildingDeviceWhere(body.buildingId)] } });
  if (count !== 2) return { ok: false, error: 'Bağlantı bu binada bulunmuyor. Cihaz listesini yenileyin.', status: 409 } as const;
  if (body.updatedAt !== link.updatedAt.toISOString()) return { ok: false, error: 'Bağlantı başka bir oturumda değişti. Bağlantıyı yenileyip tekrar deneyin.', status: 409 } as const;
  return { ok: true, link } as const;
}
export async function PATCH(request: NextRequest) {
  try {
    const auth = await getRequestActor(request);
    if (!auth) return result({ success: false, error: 'Oturum açmanız gerekiyor.' }, 401);
    if (!canAccessSync(auth.role, 'devices', 'write')) return result({ success: false, error: 'Bağlantı düzenleme yetkiniz yok.' }, 403);
    const body = await request.json().catch(() => null);
    if (!isLayoutId(body?.connectionId) || !isLayoutId(body?.buildingId) || typeof body?.updatedAt !== 'string' || !validDetails(body)) return result({ success: false, error: 'Bağlantıyı, portları, türü ve hızı seçin.' }, 400);
    const outcome = await prisma.$transaction(async tx => {
      const scope = await scopedLink(tx, body);
      if (!scope.ok) return { error: scope.error, status: scope.status };
      const { link } = scope;
      const catalog = await devicePortCatalog(tx, [link.sourceDeviceId, link.targetDeviceId], link.id);
      const source = catalog[link.sourceDeviceId]?.find(port => port.id === body.sourcePortId);
      const target = catalog[link.targetDeviceId]?.find(port => port.id === body.targetPortId);
      if (!source || !target) return { error: 'Seçilen portlardan biri bu cihaza ait değil veya artık mevcut değil.', status: 400 };
      if (source.occupied || target.occupied) return { error: 'Seçilen portlardan biri başka bir bağlantıda kullanılıyor. Boş bir port seçin.', status: 409 };
      const changedPorts = link.endpoints.find(port => port.side === 0)?.portId !== source.id || link.endpoints.find(port => port.side === 1)?.portId !== target.id;
      const updatedAt = new Date(Math.max(Date.now(), link.updatedAt.getTime() + 1));
      const update = await tx.deviceLink.updateMany({ where: { id: link.id, updatedAt: link.updatedAt }, data: { type: body.type, bandwidth: body.bandwidth, updatedAt, ...(changedPorts ? { status: 'UNKNOWN' as const } : {}) } });
      if (update.count !== 1) return { error: 'Bağlantı değişti. Yenileyip tekrar deneyin.', status: 409 };
      // Release old reservations and acquire both new ones atomically.
      await tx.deviceLinkEndpoint.deleteMany({ where: { linkId: link.id } });
      await tx.deviceLinkEndpoint.createMany({ data: [
        { linkId: link.id, deviceId: link.sourceDeviceId, portId: source.id, portKey: source.key, portName: source.name, side: 0 },
        { linkId: link.id, deviceId: link.targetDeviceId, portId: target.id, portKey: target.key, portName: target.name, side: 1 },
      ] });
      const next = await tx.deviceLink.findUniqueOrThrow({ where: { id: link.id }, select: deviceLinkSelect });
      return { connection: normalizeDeviceLinks([next])[0] };
    }, { isolationLevel: 'Serializable' });
    if ('error' in outcome) return result({ success: false, error: outcome.error }, outcome.status);
    return result({ success: true, data: { connection: outcome.connection } });
  } catch (err) {
    if (conflict(err)) return result({ success: false, error: 'Bağlantı veya portlar değişti. Bağlantıyı yenileyip tekrar deneyin.' }, 409);
    return result({ success: false, error: 'Bağlantı güncellenemedi. Mevcut kayıt korundu.' }, 503);
  }
}
export async function DELETE(request: NextRequest) {
  try {
    const auth = await getRequestActor(request);
    if (!auth) return result({ success: false, error: 'Oturum açmanız gerekiyor.' }, 401);
    if (!canAccessSync(auth.role, 'devices', 'delete')) return result({ success: false, error: 'Bağlantı silme yetkiniz yok.' }, 403);
    const body = await request.json().catch(() => null);
    if (!isLayoutId(body?.connectionId) || !isLayoutId(body?.buildingId) || typeof body?.updatedAt !== 'string') return result({ success: false, error: 'Geçerli bir bağlantı seçin.' }, 400);
    const outcome = await prisma.$transaction(async tx => {
      const scope = await scopedLink(tx, body);
      if (!scope.ok) return { error: scope.error, status: scope.status };
      const deleted = await tx.deviceLink.deleteMany({ where: { id: scope.link.id, updatedAt: scope.link.updatedAt } });
      if (deleted.count !== 1) return { error: 'Bağlantı değişti. Yenileyip tekrar deneyin.', status: 409 };
      return { id: scope.link.id };
    }, { isolationLevel: 'Serializable' });
    if ('error' in outcome) return result({ success: false, error: outcome.error }, outcome.status);
    return result({ success: true, data: outcome });
  } catch (err) {
    if (conflict(err)) return result({ success: false, error: 'Bağlantı değişti. Yenileyip tekrar deneyin.' }, 409);
    return result({ success: false, error: 'Bağlantı silinemedi.' }, 503);
  }
}
