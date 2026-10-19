import type { Prisma } from '@prisma/client';
import { normalizeTopologyConnections, type TopologyConnection, type TopologyWireConnection } from './workspace';

export const UNASSIGNED_DEVICE_BUILDING = '__unassigned-devices__';
export interface BuildingDevice {
  id: string; name: string; type: string; status: string; criticality: string;
  managementIp?: string | null; vendor?: string | null; nmsDeviceId?: number | null;
  buildingId?: string | null; building?: { id: string; name: string } | null; rackId?: string | null;
  floorId?: string | null; floor?: { id: string; name: string; floorNumber: number; buildingId: string } | null;
  rack?: { id: string; name: string; room?: { name: string; floor?: { id?: string; name?: string; floorNumber?: number; building?: { id: string; name: string } | null } | null } | null } | null;
}
export function deviceFloor(device: Pick<BuildingDevice, 'rack' | 'floor'>) {
  const floor = device.rack?.room?.floor;
  return floor?.id && floor.name ? { id: floor.id, name: floor.name, floorNumber: floor.floorNumber ?? 0 } : !device.rack ? device.floor || undefined : undefined;
}
export interface BuildingDeviceConnection extends TopologyConnection { protocol?: string; lastSeenAt?: string; recordKind?: 'device-link' }
export function deviceBuildingId(device: Pick<BuildingDevice, 'rack' | 'buildingId'>) {
  return device.rack?.room?.floor?.building?.id || device.buildingId || undefined;
}
export function buildingDeviceWhere(buildingId: string): Prisma.DeviceWhereInput {
  return buildingId === UNASSIGNED_DEVICE_BUILDING
    ? { rackId: null, buildingId: null }
    : { OR: [{ rack: { room: { floor: { buildingId } } } }, { rackId: null, buildingId }] };
}
export const buildingDeviceSelect = {
  id: true, name: true, type: true, status: true, criticality: true, managementIp: true,
  vendor: true, nmsDeviceId: true, buildingId: true, rackId: true,
  building: { select: { id: true, name: true } },
  floorId: true, floor: { select: { id: true, name: true, floorNumber: true, buildingId: true } },
  rack: { select: { id: true, name: true, room: { select: { name: true, floor: { select: { id: true, name: true, floorNumber: true, building: { select: { id: true, name: true } } } } } } } },
} satisfies Prisma.DeviceSelect;

export function buildingInternalConnections(devices: BuildingDevice[], wires: TopologyWireConnection[], neighbors: { id: string; nmsDeviceId: number; localInterface: string; remoteDeviceName: string; remoteInterface: string; protocol: string; lastSeenAt: string | Date }[], inventory: Pick<BuildingDevice, 'id' | 'name'>[] = devices, recorded: BuildingDeviceConnection[] = []): BuildingDeviceConnection[] {
  const ids = new Set(devices.map(device => device.id));
  const links: BuildingDeviceConnection[] = [...normalizeTopologyConnections(wires), ...recorded].filter(link => ids.has(link.sourceDeviceId) && ids.has(link.targetDeviceId));
  const key = (link: TopologyConnection) => [`${link.sourceDeviceId}:${link.sourcePortName || ''}`, `${link.targetDeviceId}:${link.targetPortName || ''}`].sort().join('|');
  const seen = new Set(links.map(key));
  const normalize = (name: string) => name.trim().toLocaleLowerCase('en-US');
  const byName = new Map<string, Pick<BuildingDevice, 'id' | 'name'>[]>();
  for (const device of inventory) { const name = normalize(device.name); byName.set(name, [...(byName.get(name) || []), device]); }
  const byNmsId = new Map(devices.filter(device => typeof device.nmsDeviceId === 'number').map(device => [device.nmsDeviceId, device]));
  const portKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, '').replace(/^tengigabitethernet/, 'te').replace(/^gigabitethernet/, 'gi').replace(/^fastethernet/, 'fa').replace(/^ethernet/, 'eth');
  const drawingAlreadyCovers = (observed: TopologyConnection) => links.some(saved => {
    if (saved.recordingSource !== 'DRAWIO') return false;
    const forward = saved.sourceDeviceId === observed.sourceDeviceId && saved.targetDeviceId === observed.targetDeviceId;
    const reverse = saved.sourceDeviceId === observed.targetDeviceId && saved.targetDeviceId === observed.sourceDeviceId;
    if (!forward && !reverse) return false;
    const observedSource = forward ? observed.sourcePortName : observed.targetPortName;
    const observedTarget = forward ? observed.targetPortName : observed.sourcePortName;
    const known = [[saved.sourcePortName, observedSource], [saved.targetPortName, observedTarget]].filter(([name]) => !!name);
    return known.length > 0 && known.every(([name, peer]) => !!peer && portKey(name!) === portKey(peer));
  });
  for (const neighbor of neighbors) {
    const source = byNmsId.get(neighbor.nmsDeviceId);
    const targets = byName.get(normalize(neighbor.remoteDeviceName)) || [];
    if (!source || targets.length !== 1 || !ids.has(targets[0].id) || source.id === targets[0].id) continue;
    const link: BuildingDeviceConnection = {
      id: `nms-${neighbor.id}`, sourceDeviceId: source.id, targetDeviceId: targets[0].id,
      sourcePortName: neighbor.localInterface, targetPortName: neighbor.remoteInterface,
      status: 'UNKNOWN', protocol: neighbor.protocol.toUpperCase(), lastSeenAt: new Date(neighbor.lastSeenAt).toISOString(),
    };
    if (seen.has(key(link)) || drawingAlreadyCovers(link)) continue;
    seen.add(key(link)); links.push(link);
  }
  return links;
}
