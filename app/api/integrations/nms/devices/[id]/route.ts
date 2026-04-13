import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface Params { params: { id: string } }

/** Convert BigInt fields to strings for JSON serialization */
function serializeBigInt(obj: unknown): unknown {
  return JSON.parse(JSON.stringify(obj, (_key, val) =>
    typeof val === 'bigint' ? val.toString() : val
  ));
}

/**
 * GET /api/integrations/nms/devices/[id]
 * Get SNMP config and latest metrics for a device.
 * [id] = InfraScope device CUID
 * 
 * PUT /api/integrations/nms/devices/[id]
 * Update SNMP configuration or toggle polling.
 * 
 * DELETE /api/integrations/nms/devices/[id]
 * Disable NMS polling and clear SNMP config.
 */

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const device = await (prisma as any).device.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        name: true,
        type: true,
        vendor: true,
        nmsDeviceId: true,
        managementIp: true,
        snmpVersion: true,
        snmpPort: true,
        pollingEnabled: true,
        pollingInterval: true,
        lastPolledAt: true,
        // Don't return snmpCommunity — sensitive
      },
    });

    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    if (!device.nmsDeviceId) {
      return NextResponse.json({ error: 'Device has no NMS configuration' }, { status: 404 });
    }

    // Latest health metrics (last 24h)
    const healthMetrics = await (prisma as any).nmsHealthMetric.findMany({
      where: { nmsDeviceId: device.nmsDeviceId },
      orderBy: { collectedAt: 'desc' },
      take: 48, // ~24h at 30-min intervals
      select: { id: true, cpuUsage: true, memoryUsage: true, temperature: true, uptimeSeconds: true, collectedAt: true },
    });

    // Current interface state
    const interfaces = await (prisma as any).nmsInterface.findMany({
      where: { nmsDeviceId: device.nmsDeviceId },
      orderBy: [{ adminStatus: 'asc' }, { interfaceName: 'asc' }],
      select: {
        id: true,
        interfaceIndex: true,
        interfaceName: true,
        description: true,
        adminStatus: true,
        operStatus: true,
        speed: true,
        inOctets: true,
        outOctets: true,
        inErrors: true,
        outErrors: true,
        mtu: true,
        lastPolledAt: true,
      },
    });

    // Topology links
    const topologyLinks = await (prisma as any).nmsTopologyLink.findMany({
      where: { nmsDeviceId: device.nmsDeviceId },
      select: {
        id: true,
        localInterface: true,
        remoteDeviceName: true,
        remoteInterface: true,
        protocol: true,
        lastSeenAt: true,
      },
    });

    return NextResponse.json(serializeBigInt({ device, healthMetrics, interfaces, topologyLinks }));
  } catch (error) {
    console.error('[NMS Device] GET error:', error);
    return NextResponse.json({ error: 'Failed to get device NMS data' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const body = await req.json();
    const {
      managementIp,
      snmpCommunity,
      snmpVersion,
      snmpPort,
      pollingEnabled,
      pollingInterval,
    } = body;

    const updateData: Record<string, unknown> = {};
    if (managementIp !== undefined) updateData.managementIp = managementIp;
    if (snmpCommunity !== undefined) updateData.snmpCommunity = snmpCommunity;
    if (snmpVersion !== undefined) updateData.snmpVersion = snmpVersion;
    if (snmpPort !== undefined) updateData.snmpPort = snmpPort;
    if (pollingEnabled !== undefined) updateData.pollingEnabled = pollingEnabled;
    if (pollingInterval !== undefined) updateData.pollingInterval = pollingInterval;

    const updated = await (prisma as any).device.update({
      where: { id: params.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        nmsDeviceId: true,
        managementIp: true,
        snmpVersion: true,
        snmpPort: true,
        pollingEnabled: true,
        pollingInterval: true,
        lastPolledAt: true,
      },
    });

    return NextResponse.json({ device: updated });
  } catch (error) {
    console.error('[NMS Device] PUT error:', error);
    return NextResponse.json({ error: 'Failed to update device NMS config' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const updated = await (prisma as any).device.update({
      where: { id: params.id },
      data: {
        nmsDeviceId: null,
        managementIp: null,
        snmpCommunity: null,
        pollingEnabled: false,
        lastPolledAt: null,
      },
      select: { id: true, name: true },
    });

    return NextResponse.json({ success: true, device: updated });
  } catch (error) {
    console.error('[NMS Device] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to remove NMS config' }, { status: 500 });
  }
}
