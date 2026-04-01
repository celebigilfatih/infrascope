import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/integrations/nms/devices
 * List all devices with SNMP polling configured (nmsDeviceId set).
 * 
 * POST /api/integrations/nms/devices
 * Enable SNMP polling on a device — assigns nmsDeviceId + SNMP config.
 */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const enabledOnly = searchParams.get('enabled') === 'true';

    const devices = await (prisma as any).device.findMany({
      where: enabledOnly
        ? { pollingEnabled: true, nmsDeviceId: { not: null } }
        : { nmsDeviceId: { not: null } },
      select: {
        id: true,
        name: true,
        type: true,
        vendor: true,
        nmsDeviceId: true,
        managementIp: true,
        snmpCommunity: true,
        snmpVersion: true,
        snmpPort: true,
        pollingEnabled: true,
        pollingInterval: true,
        lastPolledAt: true,
      },
      orderBy: { name: 'asc' },
    });

    // Attach latest health metric snapshot
    const enriched = await Promise.all(
      devices.map(async (d: any) => {
        const latestHealth = await (prisma as any).nmsHealthMetric.findFirst({
          where: { nmsDeviceId: d.nmsDeviceId },
          orderBy: { collectedAt: 'desc' },
          select: { cpuUsage: true, memoryUsage: true, temperature: true, collectedAt: true },
        });

        const portDownCount = await (prisma as any).nmsInterface.count({
          where: { nmsDeviceId: d.nmsDeviceId, adminStatus: 'up', operStatus: 'down' },
        });

        return { ...d, latestHealth, portDownCount };
      })
    );

    return NextResponse.json({ devices: enriched, total: enriched.length });
  } catch (error) {
    console.error('[NMS Devices] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch NMS devices' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      deviceId,          // InfraScope CUID of the device to enable
      managementIp,      // SNMP target IP
      snmpCommunity,
      snmpVersion = '2c',
      snmpPort = 161,
      pollingInterval = 30,
    } = body;

    if (!deviceId || !managementIp || !snmpCommunity) {
      return NextResponse.json(
        { error: 'deviceId, managementIp, and snmpCommunity are required' },
        { status: 400 }
      );
    }

    // Auto-assign next available nmsDeviceId
    const maxResult = await (prisma as any).$queryRaw`
      SELECT COALESCE(MAX(nms_device_id), 0) + 1 AS next_id FROM devices WHERE nms_device_id IS NOT NULL
    ` as Array<{ next_id: number }>;
    const nextNmsId = maxResult[0]?.next_id ?? 1;

    const updated = await (prisma as any).device.update({
      where: { id: deviceId },
      data: {
        nmsDeviceId: nextNmsId,
        managementIp,
        snmpCommunity,
        snmpVersion,
        snmpPort,
        pollingEnabled: true,
        pollingInterval,
      },
      select: {
        id: true,
        name: true,
        nmsDeviceId: true,
        managementIp: true,
        snmpCommunity: true,
        snmpVersion: true,
        snmpPort: true,
        pollingEnabled: true,
        pollingInterval: true,
      },
    });

    return NextResponse.json({ device: updated });
  } catch (error) {
    console.error('[NMS Devices] POST error:', error);
    return NextResponse.json({ error: 'Failed to enable NMS polling' }, { status: 500 });
  }
}
