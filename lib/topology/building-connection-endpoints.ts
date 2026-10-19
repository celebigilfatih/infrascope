import type { Prisma, ConnectionType } from '@prisma/client';
import { buildingDeviceWhere } from './building-devices';
import { devicePortCatalog } from './device-links';
import type { BuildingEndpointSelection } from './building-connection-options';

export const buildingConnectionInclude = {
  sourceBuilding: true, destBuilding: true,
  deviceLink: { select: { id: true, sourceDeviceId: true, targetDeviceId: true,
    sourceDevice: { select: { id: true, name: true } }, targetDevice: { select: { id: true, name: true } },
    endpoints: { select: { side: true, portId: true, portKey: true, portName: true } },
  } },
} satisfies Prisma.BuildingConnectionInclude;

export function validBuildingEndpoints(value: unknown): value is BuildingEndpointSelection | null {
  if (value === null) return true;
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return ['sourceDeviceId', 'targetDeviceId'].every(key => typeof item[key] === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(item[key] as string))
    && ['sourcePortId', 'targetPortId'].every(key => typeof item[key] === 'string' && /^(switch|interface|nms):[a-zA-Z0-9_-]{1,160}$/.test(item[key] as string)) && item.sourceDeviceId !== item.targetDeviceId;
}

export async function buildingEndpointDevices(db: Prisma.TransactionClient, sourceBuildingId: string, destBuildingId: string) {
  const select = { id: true, name: true, managementIp: true };
  const [sourceDevices, targetDevices] = await Promise.all([
    db.device.findMany({ where: buildingDeviceWhere(sourceBuildingId), select, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
    db.device.findMany({ where: buildingDeviceWhere(destBuildingId), select, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
  ]);
  return { sourceDevices, targetDevices };
}

export async function buildingEndpointMembership(db: Prisma.TransactionClient, sourceBuildingId: string, destBuildingId: string, sourceDeviceId: string, targetDeviceId: string) {
  const [source, target] = await Promise.all([
    sourceDeviceId ? db.device.count({ where: { AND: [{ id: sourceDeviceId }, buildingDeviceWhere(sourceBuildingId)] } }) : 1,
    targetDeviceId ? db.device.count({ where: { AND: [{ id: targetDeviceId }, buildingDeviceWhere(destBuildingId)] } }) : 1,
  ]);
  return source === 1 && target === 1;
}

export async function resolveBuildingEndpoints(db: Prisma.TransactionClient, sourceBuildingId: string, destBuildingId: string, selection: BuildingEndpointSelection, excludeLinkId?: string) {
  if (!await buildingEndpointMembership(db, sourceBuildingId, destBuildingId, selection.sourceDeviceId, selection.targetDeviceId)) return { ok: false, error: 'Kaynak cihaz kaynak binaya, hedef cihaz hedef binaya ait olmalı. Cihaz listesini yenileyin.', status: 409 } as const;
  const ports = await devicePortCatalog(db, [selection.sourceDeviceId, selection.targetDeviceId], excludeLinkId);
  const source = ports[selection.sourceDeviceId]?.find(port => port.id === selection.sourcePortId);
  const target = ports[selection.targetDeviceId]?.find(port => port.id === selection.targetPortId);
  if (!source || !target) return { ok: false, error: 'Seçilen portlardan biri bu cihaza ait değil veya artık mevcut değil.', status: 400 } as const;
  if (source.occupied || target.occupied) return { ok: false, error: 'Seçilen portlardan biri başka bir bağlantıda kullanılıyor. Boş bir port seçin.', status: 409 } as const;
  return { ok: true, source, target } as const;
}

export function buildingDeviceLinkType(type: string): ConnectionType {
  return type.startsWith('FIBER_') ? 'FIBER' : type.startsWith('CAT') ? 'ETHERNET' : 'WAN';
}
