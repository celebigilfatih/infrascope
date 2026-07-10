import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface Params { params: { scanId: string } }

/**
 * POST /api/integrations/nms/discovery/[scanId]/import
 * Import a discovered device into InfraScope.
 *
 * Body:
 *   discoveredDeviceId  - ID from nms_discovered_devices
 *   deviceId            - Existing InfraScope device ID to link
 *   snmpCommunity?      - Override SNMP community (defaults to discovered value)
 *   snmpVersion?        - SNMP version string (defaults to "2c")
 *   snmpPort?           - SNMP port (defaults to 161)
 *   pollingInterval?    - Poll interval in seconds (defaults to 30)
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const body = await req.json();
    const {
      discoveredDeviceId,
      deviceId,
      snmpCommunity,
      snmpVersion = '2c',
      snmpPort = 161,
      pollingInterval = 300,
    } = body;

    if (!discoveredDeviceId) {
      return NextResponse.json(
        { error: 'discoveredDeviceId is required' },
        { status: 400 }
      );
    }

    if (!deviceId) {
      return NextResponse.json(
        { error: 'deviceId is required. Create the device in inventory first, then link the discovered device.' },
        { status: 400 }
      );
    }

    // 1. Load the discovered device record
    const discovered = await (prisma as any).nmsDiscoveredDevice.findUnique({
      where: { id: discoveredDeviceId },
    }) as {
      id: string;
      scanId: string;
      ipAddress: string;
      hostname: string | null;
      vendor: string | null;
      snmpCommunity: string | null;
      sysDescr: string | null;
      snmpStatus: string | null;
      imported: boolean;
    } | null;

    if (!discovered) {
      return NextResponse.json(
        { error: `Discovered device ${discoveredDeviceId} not found` },
        { status: 404 }
      );
    }

    if (discovered.scanId !== params.scanId) {
      return NextResponse.json(
        { error: 'Discovered device does not belong to this scan' },
        { status: 400 }
      );
    }

    if (discovered.imported) {
      return NextResponse.json(
        { error: 'Device has already been imported' },
        { status: 409 }
      );
    }

    // 2. Resolve effective SNMP community
    const effectiveCommunity = snmpCommunity || discovered.snmpCommunity || 'public';

    // 3. Auto-assign next available nmsDeviceId
    const maxResult = await (prisma as any).$queryRaw`
      SELECT COALESCE(MAX(nms_device_id), 0) + 1 AS next_id FROM devices WHERE nms_device_id IS NOT NULL
    ` as Array<{ next_id: number }>;
    const nextNmsId = Number(maxResult[0]?.next_id ?? 1);

    const existing = await (prisma as any).device.findUnique({
      where: { id: deviceId },
      select: { id: true, name: true, nmsDeviceId: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: `Device ${deviceId} not found in InfraScope` },
        { status: 404 }
      );
    }

    if (existing.nmsDeviceId !== null) {
      return NextResponse.json(
        { error: `Device "${existing.name}" already has NMS polling configured (nmsDeviceId: ${existing.nmsDeviceId})` },
        { status: 409 }
      );
    }

    const duplicateIp = await (prisma as any).device.findFirst({
      where: {
        managementIp: discovered.ipAddress,
        nmsDeviceId: { not: null },
        NOT: { id: deviceId },
      },
      select: { id: true, name: true, nmsDeviceId: true },
    });

    if (duplicateIp) {
      return NextResponse.json(
        { error: `A monitored device already uses IP ${discovered.ipAddress} ("${duplicateIp.name}", nmsDeviceId: ${duplicateIp.nmsDeviceId})` },
        { status: 409 }
      );
    }

    const infraDevice = await (prisma as any).device.update({
      where: { id: deviceId },
      data: {
        nmsDeviceId: nextNmsId,
        managementIp: discovered.ipAddress,
        snmpCommunity: effectiveCommunity,
        snmpVersion,
        snmpPort,
        pollingEnabled: true,
        pollingInterval,
      },
      select: {
        id: true,
        name: true,
        type: true,
        nmsDeviceId: true,
        managementIp: true,
        snmpVersion: true,
        snmpPort: true,
        pollingEnabled: true,
        pollingInterval: true,
      },
    });

    // 5. Mark the discovered device as imported
    await (prisma as any).nmsDiscoveredDevice.update({
      where: { id: discoveredDeviceId },
      data: {
        imported: true,
        importedAt: new Date(),
      },
    });

    return NextResponse.json({
      device: infraDevice,
      nmsDeviceId: nextNmsId,
      importedFrom: {
        id: discovered.id,
        ipAddress: discovered.ipAddress,
        hostname: discovered.hostname,
        sysDescr: discovered.sysDescr,
      },
    }, { status: 201 });

  } catch (error) {
    console.error('[NMS Import] POST error:', error);
    return NextResponse.json({ error: 'Failed to import device' }, { status: 500 });
  }
}
