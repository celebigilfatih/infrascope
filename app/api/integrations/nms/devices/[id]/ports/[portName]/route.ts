import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface Params { params: { id: string; portName: string } }

function serializeBigInt(obj: unknown): unknown {
  return JSON.parse(JSON.stringify(obj, (_key, val) =>
    typeof val === 'bigint' ? val.toString() : val
  ));
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const deviceId = params.id;
    const portName = decodeURIComponent(params.portName);

    // Get device
    const device = await (prisma as any).device.findFirst({
      where: { id: deviceId },
      select: {
        id: true, name: true, type: true, vendor: true,
        managementIp: true, nmsDeviceId: true,
      },
    });
    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    // Get interface — search by name OR description (NMS stores real port names in description)
    const iface = await (prisma as any).nmsInterface.findFirst({
      where: {
        nmsDeviceId: device.nmsDeviceId,
        OR: [
          { interfaceName: portName },
          { description: portName },
        ],
      },
      select: {
        id: true,
        interfaceIndex: true,
        interfaceName: true,
        description: true,
        adminStatus: true,
        operStatus: true,
        downSince: true,
        speed: true,
        inOctets: true,
        outOctets: true,
        inErrors: true,
        outErrors: true,
        mtu: true,
        lastPolledAt: true,
      },
    });
    if (!iface) {
      return NextResponse.json({ error: 'Port not found in NMS' }, { status: 404 });
    }

    // Get topology neighbors for this port
    const neighbors = await (prisma as any).nmsTopologyLink.findMany({
      where: {
        nmsDeviceId: device.nmsDeviceId,
        localInterface: portName,
      },
      select: {
        remoteDeviceName: true,
        remoteInterface: true,
        protocol: true,
        lastSeenAt: true,
      },
      orderBy: { lastSeenAt: 'desc' },
    });

    return NextResponse.json(serializeBigInt({
      device: {
        name: device.name,
        vendor: device.vendor,
        type: device.type,
        managementIp: device.managementIp,
      },
      port: iface,
      neighbors,
    }));
  } catch (error) {
    console.error('[NMS Port] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch port details' }, { status: 500 });
  }
}
