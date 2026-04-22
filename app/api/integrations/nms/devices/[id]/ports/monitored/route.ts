import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type Params = { params: { id: string } };

function serializeBigInt(obj: any): any {
  return JSON.parse(
    JSON.stringify(obj, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    )
  );
}

/**
 * GET /api/integrations/nms/devices/[id]/ports/monitored
 * Returns all interfaces for a device with their monitored status
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const device = await (prisma as any).device.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, nmsDeviceId: true },
    });

    if (!device?.nmsDeviceId) {
      return NextResponse.json(
        { error: 'Device not found or has no NMS configuration' },
        { status: 404 }
      );
    }

    const interfaces = await (prisma as any).nmsInterface.findMany({
      where: { nmsDeviceId: device.nmsDeviceId },
      select: {
        id: true,
        interfaceIndex: true,
        interfaceName: true,
        description: true,
        adminStatus: true,
        operStatus: true,
        speed: true,
        monitored: true,
      },
      orderBy: [{ monitored: 'desc' }, { interfaceIndex: 'asc' }],
    });

    const monitoredCount = interfaces.filter((i: any) => i.monitored).length;

    return NextResponse.json(
      serializeBigInt({
        deviceId: device.id,
        deviceName: device.name,
        total: interfaces.length,
        monitoredCount,
        interfaces,
      })
    );
  } catch (error) {
    console.error('[NMS Monitored Ports] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch interfaces' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/integrations/nms/devices/[id]/ports/monitored
 * Bulk toggle monitored status for specific interfaces
 *
 * Body:
 *   { interfaceIds: ["id1", "id2"], monitored: true }
 *   OR
 *   { all: true, monitored: true }  -- toggle ALL interfaces for this device
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const device = await (prisma as any).device.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, nmsDeviceId: true },
    });

    if (!device?.nmsDeviceId) {
      return NextResponse.json(
        { error: 'Device not found or has no NMS configuration' },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { interfaceIds, monitored, all } = body;

    if (typeof monitored !== 'boolean') {
      return NextResponse.json(
        { error: 'Missing required field: monitored (boolean)' },
        { status: 400 }
      );
    }

    if (!all && (!Array.isArray(interfaceIds) || interfaceIds.length === 0)) {
      return NextResponse.json(
        { error: 'Provide interfaceIds array or set all: true' },
        { status: 400 }
      );
    }

    let updated: number;

    if (all) {
      // Toggle all interfaces for this device
      const result = await (prisma as any).nmsInterface.updateMany({
        where: { nmsDeviceId: device.nmsDeviceId },
        data: { monitored },
      });
      updated = result.count;
    } else {
      // Toggle specific interfaces (verify they belong to this device)
      const result = await (prisma as any).nmsInterface.updateMany({
        where: {
          id: { in: interfaceIds },
          nmsDeviceId: device.nmsDeviceId,
        },
        data: { monitored },
      });
      updated = result.count;
    }

    console.log(
      `[NMS Monitored Ports] ${device.name}: set ${updated} port(s) monitored=${monitored}`
    );

    return NextResponse.json({
      success: true,
      deviceName: device.name,
      updated,
      monitored,
    });
  } catch (error) {
    console.error('[NMS Monitored Ports] PATCH error:', error);
    return NextResponse.json(
      { error: 'Failed to update monitored status' },
      { status: 500 }
    );
  }
}
