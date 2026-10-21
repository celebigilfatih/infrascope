import type { Prisma } from '@prisma/client';
import { devicePortCatalog } from './device-links';
import { groupPositions, NETWORK_GROUP_KINDS } from './network-groups';
import { isBuildingPosition } from './building-layout';

type Db = Prisma.TransactionClient;
export class NetworkGroupError extends Error { constructor(public status: number, message: string) { super(message); } }
export const groupInclude = { members: { include: { building: { select: { id: true, name: true } } }, orderBy: { buildingId: 'asc' as const } }, sourceDevice: { select: { id: true, name: true, managementIp: true, buildingId: true, rack: { select: { room: { select: { floor: { select: { buildingId: true } } } } } } } } } satisfies Prisma.NetworkGroupInclude;
const effectiveBuilding = (d: { buildingId: string | null; rack: { room: { floor: { buildingId: string } } } | null }) => d.rack?.room.floor.buildingId || d.buildingId;
export async function listNetworkGroups(db: Db) {
  const groups = await db.networkGroup.findMany({ include: groupInclude, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
  const catalog = groups.length ? await devicePortCatalog(db, [...new Set(groups.map(g => g.sourceDeviceId))]) : {};
  const monitored = await db.nmsInterface.findMany({ where: { id: { in: groups.flatMap(g => g.sourcePortId?.startsWith('nms:') ? [g.sourcePortId.slice(4)] : []) } }, select: { id: true, operStatus: true, lastPolledAt: true } });
  return groups.map(g => {
    const port = catalog[g.sourceDeviceId]?.find(p => p.id === g.sourcePortId);
    const measurement = monitored.find(p => `nms:${p.id}` === g.sourcePortId);
    const fresh = measurement && Date.now() - measurement.lastPolledAt.getTime() >= -60000 && Date.now() - measurement.lastPolledAt.getTime() <= 15 * 60_000;
    return { id: g.id, name: g.name, kind: g.kind, organizationId: g.organizationId, sourceDeviceId: g.sourceDeviceId, sourcePortId: g.sourcePortId, version: g.version, positions: groupPositions(g.positions),
      sourceDevice: { id: g.sourceDevice.id, name: g.sourceDevice.name, managementIp: g.sourceDevice.managementIp, buildingId: effectiveBuilding(g.sourceDevice) },
      sourcePort: port ? { id: port.id, name: port.name } : null,
      lineStatus: { status: fresh ? measurement.operStatus.toUpperCase() : 'UNKNOWN', lastPolledAt: measurement?.lastPolledAt.toISOString() || null },
      members: g.members.map(m => ({ buildingId: m.buildingId, name: m.building.name })).sort((a,b) => a.name.localeCompare(b.name, 'tr')) };
  });
}
export async function groupOptions(db: Db, sourceDeviceId?: string | null) {
  if (sourceDeviceId) return { ports: (await devicePortCatalog(db, [sourceDeviceId]))[sourceDeviceId] || [] };
  const [organizations, devices, memberships] = await Promise.all([
    db.organization.findMany({ select: { id: true, name: true, buildings: { select: { id: true, name: true }, orderBy: { name: 'asc' } } }, orderBy: { name: 'asc' } }),
    db.device.findMany({ select: { id: true, name: true, managementIp: true, buildingId: true, rack: { select: { room: { select: { floor: { select: { buildingId: true } } } } } } }, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
    db.networkGroupMember.findMany({ select: { buildingId: true, groupId: true } }),
  ]);
  return { organizations, devices: devices.map(d => ({ id: d.id, name: d.name, managementIp: d.managementIp, buildingId: effectiveBuilding(d) })), memberships };
}
const id = (value: unknown): value is string => typeof value === 'string' && /^[\w-]{1,160}$/.test(value);
export async function validateGroup(db: Db, input: unknown, excludeId?: string) {
  if (!input || typeof input !== 'object') throw new NetworkGroupError(400, 'Grup bilgilerini belirtin.');
  const body = input as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 100 || !id(body.organizationId) || !id(body.sourceDeviceId) || !NETWORK_GROUP_KINDS.includes(body.kind as typeof NETWORK_GROUP_KINDS[number]) || !Array.isArray(body.memberBuildingIds) || !body.memberBuildingIds.length || body.memberBuildingIds.length > 500 || !body.memberBuildingIds.every(id)) throw new NetworkGroupError(400, 'Grup adı, organizasyon, ağ türü, merkez cihaz ve en fazla 500 konum seçin.');
  const memberBuildingIds = [...new Set(body.memberBuildingIds as string[])];
  if (body.sourcePortId != null && (typeof body.sourcePortId !== 'string' || !/^(nms|switch|interface):[\w-]{1,160}$/.test(body.sourcePortId))) throw new NetworkGroupError(400, 'Geçerli bir merkez arayüzü seçin.');
  const [organization, source, members, occupied, otherGroups] = await Promise.all([
    db.organization.findUnique({ where: { id: body.organizationId }, select: { id: true, buildings: { select: { id: true } } } }),
    db.device.findUnique({ where: { id: body.sourceDeviceId }, select: { id: true, buildingId: true, rack: { select: { room: { select: { floor: { select: { buildingId: true } } } } } } } }),
    db.building.findMany({ where: { id: { in: memberBuildingIds }, organizationId: body.organizationId }, select: { id: true } }),
    db.networkGroupMember.findFirst({ where: { buildingId: { in: memberBuildingIds }, ...(excludeId ? { groupId: { not: excludeId } } : {}) } }),
    db.networkGroup.findMany({ where: excludeId ? { id: { not: excludeId } } : {}, select: { sourceDevice: { select: { buildingId: true, rack: { select: { room: { select: { floor: { select: { buildingId: true } } } } } } } } } }),
  ]);
  if (!organization || !source) throw new NetworkGroupError(404, 'Organizasyon veya merkez cihaz bulunamadı.');
  const sourceBuildingId = effectiveBuilding(source);
  if (!sourceBuildingId || !organization.buildings.some(b => b.id === sourceBuildingId)) throw new NetworkGroupError(400, 'Merkez cihaz seçilen organizasyondaki bir konuma bağlı olmalı.');
  if (members.length !== memberBuildingIds.length) throw new NetworkGroupError(400, 'Tüm üye konumlar seçilen organizasyona ait olmalı.');
  if (memberBuildingIds.includes(sourceBuildingId)) throw new NetworkGroupError(400, 'Merkez cihazın konumu gruba üye olamaz.');
  if (occupied) throw new NetworkGroupError(409, 'Seçilen konumlardan biri başka bir ağ grubuna bağlı.');
  if (await db.networkGroupMember.findUnique({ where: { buildingId: sourceBuildingId } }) || otherGroups.some(g => memberBuildingIds.includes(effectiveBuilding(g.sourceDevice) || ''))) throw new NetworkGroupError(409, 'İç içe ağ grupları oluşturulamaz.');
  if (body.sourcePortId && !(await devicePortCatalog(db, [source.id]))[source.id]?.some(p => p.id === body.sourcePortId)) throw new NetworkGroupError(400, 'Seçilen arayüz merkez cihaza ait değil veya artık mevcut değil.');
  return { name, organizationId: body.organizationId, kind: body.kind as string, sourceDeviceId: source.id, sourcePortId: body.sourcePortId as string | null || null, memberBuildingIds };
}
export async function writeNetworkGroup(db: Db, input: unknown, userId: string, groupId?: string) {
  const body = input as Record<string, unknown> | null;
  const before = groupId ? await db.networkGroup.findUnique({ where: { id: groupId }, include: { members: true } }) : null;
  if (groupId && !before) throw new NetworkGroupError(404, 'Ağ grubu bulunamadı.');
  if (before && body?.version !== before.version) throw new NetworkGroupError(409, 'Grup başka bir işlemde değişti. Yenileyip tekrar deneyin.');
  let data: Prisma.NetworkGroupUncheckedUpdateInput;
  if (before && body && 'position' in body) {
    const p = body.position as Record<string, unknown>;
    if (!p || !['building','physical'].includes(String(p.view)) || !isBuildingPosition(p)) throw new NetworkGroupError(400, 'Geçerli bir harita konumu belirtin.');
    data = { positions: JSON.parse(JSON.stringify({ ...groupPositions(before.positions), [String(p.view)]: { x: p.x, y: p.y } })), version: { increment: 1 } };
  } else {
    const { memberBuildingIds, ...fields } = await validateGroup(db, input, groupId);
    if (before) {
      await db.networkGroupMember.deleteMany({ where: { groupId } });
      data = { ...fields, version: { increment: 1 } };
      await db.networkGroup.update({ where: { id: groupId }, data });
      await db.networkGroupMember.createMany({ data: memberBuildingIds.map(buildingId => ({ groupId: groupId!, buildingId })) });
    } else {
      const created = await db.networkGroup.create({ data: { ...fields, members: { create: memberBuildingIds.map(buildingId => ({ buildingId })) } } });
      groupId = created.id;
    }
    data = {};
  }
  if (Object.keys(data).length) await db.networkGroup.update({ where: { id: groupId }, data });
  const after = await db.networkGroup.findUniqueOrThrow({ where: { id: groupId }, include: { members: true } });
  await db.auditLog.create({ data: { entity: 'NetworkGroup', entityId: after.id, action: before ? 'UPDATE' : 'CREATE', userId, resource: 'devices', resourceId: after.id, details: { before: before ? JSON.parse(JSON.stringify(before)) : null, after: JSON.parse(JSON.stringify(after)) } } });
  return after.id;
}
