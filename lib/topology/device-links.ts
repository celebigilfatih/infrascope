import type { Prisma } from '@prisma/client';
import type { BuildingDeviceConnection } from './building-devices';
import { portNameKey, type DeviceLinkPort } from './device-link-options';

function nmsPortLabel(name: string, description: string | null) {
  if (!/^if\d+$/i.test(name)) return name;
  return description?.match(/^(\d+)\s+Gigabit\s*-\s*Level$/i)?.[1]
    || (/^(?:[a-z]+)?\d+(?:\/\d+)*$/i.test(description || '') ? description! : name);
}

export const deviceLinkSelect = { id: true, sourceDeviceId: true, targetDeviceId: true, type: true, bandwidth: true, status: true, source: true, sourceRef: true, endpoints: { select: { side: true, portName: true } } } satisfies Prisma.DeviceLinkSelect;
export function normalizeDeviceLinks(rows: Prisma.DeviceLinkGetPayload<{ select: typeof deviceLinkSelect }>[]): BuildingDeviceConnection[] {
  return rows.flatMap(row => {
    const source = row.endpoints.find(port => port.side === 0), target = row.endpoints.find(port => port.side === 1);
    const drawing = row.source === 'DRAWIO' && !!row.sourceRef;
    return source && target || drawing ? [{ id: row.id, sourceDeviceId: row.sourceDeviceId, targetDeviceId: row.targetDeviceId, sourcePortName: source?.portName, targetPortName: target?.portName, type: row.type, bandwidth: row.bandwidth, status: row.status, recordKind: 'device-link', ...(drawing ? { recordingSource: 'DRAWIO' as const } : {}) }] : [];
  });
}

export async function devicePortCatalog(db: Pick<Prisma.TransactionClient, 'device' | 'deviceLinkEndpoint' | 'connection'>, deviceIds: string[], excludeLinkId?: string): Promise<Record<string, DeviceLinkPort[]>> {
  const devices = await db.device.findMany({ where: { id: { in: deviceIds } }, select: { id: true, nmsDeviceId: true,
    switchPorts: { select: { id: true, name: true, speed: true, connectedToId: true } }, networkInterfaces: { select: { id: true, name: true, switchPorts: { select: { id: true }, take: 1 } } }, nmsInterfaces: { select: { id: true, interfaceName: true, description: true, speed: true } },
  } });
  const [recorded, legacy] = await Promise.all([
    db.deviceLinkEndpoint.findMany({ where: { deviceId: { in: deviceIds }, ...(excludeLinkId ? { linkId: { not: excludeLinkId } } : {}) }, select: { deviceId: true, portKey: true } }),
    db.connection.findMany({ where: { OR: [{ sourcePort: { switchDeviceId: { in: deviceIds } } }, { sourceInterface: { deviceId: { in: deviceIds } } }, { sourcePort: { networkInterface: { deviceId: { in: deviceIds } } } }] }, select: { sourcePort: { select: { switchDeviceId: true, name: true, networkInterface: { select: { deviceId: true, name: true } } } }, sourceInterface: { select: { deviceId: true, name: true } } } }),
  ]);
  const occupied = new Set(recorded.map(port => `${port.deviceId}:${port.portKey}`));
  for (const wire of legacy) {
    occupied.add(`${wire.sourcePort.switchDeviceId}:${portNameKey(wire.sourcePort.name)}`);
    const peer = wire.sourceInterface || wire.sourcePort.networkInterface;
    if (peer) occupied.add(`${peer.deviceId}:${portNameKey(peer.name)}`);
  }
  return Object.fromEntries(devices.map(device => {
    const ports = new Map<string, DeviceLinkPort>();
    const add = (id: string, name: string, kind: string, speed?: string, connected = false, identityName = name) => {
      const key = portNameKey(identityName);
      if (key && !ports.has(key)) ports.set(key, { id, name, key, kind, speed, occupied: connected || occupied.has(`${device.id}:${key}`) });
    };
    device.switchPorts.forEach(port => add(`switch:${port.id}`, port.name, 'Switch portu', port.speed || undefined, !!port.connectedToId));
    device.networkInterfaces.forEach(port => add(`interface:${port.id}`, port.name, 'Ağ arayüzü', undefined, !!port.switchPorts?.length));
    device.nmsInterfaces.forEach(port => add(`nms:${port.id}`, nmsPortLabel(port.interfaceName, port.description), 'NMS portu', port.speed > BigInt(0) ? `${port.speed.toString()} bps` : undefined, false, port.interfaceName));
    return [device.id, [...ports.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr', { numeric: true }))];
  }));
}
