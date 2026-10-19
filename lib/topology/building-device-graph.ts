import type { Prisma } from '@prisma/client';
import { buildingDeviceSelect, buildingDeviceWhere, buildingInternalConnections } from './building-devices';
import { deviceLinkSelect, normalizeDeviceLinks } from './device-links';

// The workspace and reset must use the same membership, ordering and connections.
export async function loadBuildingDeviceGraph(db: Pick<Prisma.TransactionClient, 'device' | 'connection' | 'nmsTopologyLink' | 'deviceLink'>, buildingId: string) {
  const devices = await db.device.findMany({ where: buildingDeviceWhere(buildingId), select: buildingDeviceSelect, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
  const ids = devices.map(device => device.id);
  const nmsIds = devices.flatMap(device => typeof device.nmsDeviceId === 'number' ? [device.nmsDeviceId] : []);
  const [wires, neighbors, inventory, recorded] = await Promise.all([
    ids.length ? db.connection.findMany({ where: { OR: [{ sourcePort: { switchDeviceId: { in: ids } } }, { sourceInterface: { deviceId: { in: ids } } }, { sourcePort: { networkInterface: { deviceId: { in: ids } } } }] }, select: {
      id: true, name: true, type: true, status: true, sourcePort: { select: { name: true, switchDevice: { select: { id: true } }, networkInterface: { select: { id: true, name: true, device: { select: { id: true } } } } } }, sourceInterface: { select: { id: true, name: true, device: { select: { id: true } } } },
    } }) : [],
    nmsIds.length ? db.nmsTopologyLink.findMany({ where: { nmsDeviceId: { in: nmsIds } }, select: { id: true, nmsDeviceId: true, localInterface: true, remoteDeviceName: true, remoteInterface: true, protocol: true, lastSeenAt: true } }) : [],
    nmsIds.length ? db.device.findMany({ select: { id: true, name: true } }) : devices,
    ids.length ? db.deviceLink.findMany({ where: { sourceDeviceId: { in: ids }, targetDeviceId: { in: ids } }, select: deviceLinkSelect }) : [],
  ]);
  return { devices, connections: buildingInternalConnections(devices, wires, neighbors, inventory, normalizeDeviceLinks(recorded)) };
}
