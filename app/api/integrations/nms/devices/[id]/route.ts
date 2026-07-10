import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface Params { params: { id: string } }

/** Convert BigInt fields to strings for JSON serialization */
function serializeBigInt(obj: unknown): unknown {
  return JSON.parse(JSON.stringify(obj, (_key, val) =>
    typeof val === 'bigint' ? val.toString() : val
  ));
}

function normalizeSnmpVersion(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '2c';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'v2c') return '2c';
  if (normalized === 'v3') return '3';
  return normalized;
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
 * Remove NMS monitoring from the device while keeping the inventory record.
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
        sshUsername: true,
        sshPassword: true,
        sshPort: true,
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
        downSince: true,
        operUpSince: true,
        lastPolledAt: true,
        monitored: true,
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

    const { sshPassword, ...safeDevice } = device;

    return NextResponse.json(serializeBigInt({
      device: {
        ...safeDevice,
        hasSshPassword: Boolean(sshPassword),
      },
      healthMetrics,
      interfaces,
      topologyLinks,
    }));
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
      sshUsername,
      sshPassword,
      sshPort,
    } = body;

    const existing = await (prisma as any).device.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, nmsDeviceId: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    if (!existing.nmsDeviceId) {
      return NextResponse.json({ error: 'Device has no NMS configuration' }, { status: 404 });
    }

    if (managementIp !== undefined) {
      const normalizedIp = typeof managementIp === 'string' ? managementIp.trim() : '';
      if (!normalizedIp) {
        return NextResponse.json({ error: 'Management IP is required' }, { status: 400 });
      }

      const duplicateIp = await (prisma as any).device.findFirst({
        where: {
          managementIp: normalizedIp,
          nmsDeviceId: { not: null },
          NOT: { id: params.id },
        },
        select: { id: true, name: true, nmsDeviceId: true },
      });

      if (duplicateIp) {
        return NextResponse.json(
          { error: `Management IP ${normalizedIp} is already used by "${duplicateIp.name}"`, deviceId: duplicateIp.id, nmsDeviceId: duplicateIp.nmsDeviceId },
          { status: 409 }
        );
      }
    }

    if (sshPort !== undefined) {
      const normalizedSshPort = Number(sshPort);
      if (!Number.isInteger(normalizedSshPort) || normalizedSshPort < 1 || normalizedSshPort > 65535) {
        return NextResponse.json({ error: 'SSH port must be between 1 and 65535' }, { status: 400 });
      }
    }

    const updateData: Record<string, unknown> = {};
    if (managementIp !== undefined) updateData.managementIp = managementIp.trim();
    if (snmpCommunity !== undefined) updateData.snmpCommunity = snmpCommunity;
    if (snmpVersion !== undefined) updateData.snmpVersion = normalizeSnmpVersion(snmpVersion);
    if (snmpPort !== undefined) updateData.snmpPort = snmpPort;
    if (pollingEnabled !== undefined) updateData.pollingEnabled = pollingEnabled;
    if (pollingInterval !== undefined) updateData.pollingInterval = pollingInterval;
    if (sshUsername !== undefined) {
      updateData.sshUsername = typeof sshUsername === 'string' && sshUsername.trim()
        ? sshUsername.trim()
        : null;
    }
    if (typeof sshPassword === 'string' && sshPassword.length > 0) {
      updateData.sshPassword = sshPassword;
    }
    if (sshPort !== undefined) updateData.sshPort = Number(sshPort);

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
        sshUsername: true,
        sshPort: true,
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
    const existing = await prisma.device.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        name: true,
        nmsDeviceId: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    if (!existing.nmsDeviceId) {
      return NextResponse.json({ error: 'Device has no NMS configuration' }, { status: 404 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await (tx as any).nmsInterface.deleteMany({ where: { nmsDeviceId: existing.nmsDeviceId } });
      await (tx as any).nmsHealthMetric.deleteMany({ where: { nmsDeviceId: existing.nmsDeviceId } });
      await (tx as any).nmsTopologyLink.deleteMany({ where: { nmsDeviceId: existing.nmsDeviceId } });
      await (tx as any).nmsDeviceMetric.deleteMany({ where: { nmsDeviceId: existing.nmsDeviceId } });
      await (tx as any).nmsInterfaceMetric.deleteMany({ where: { nmsDeviceId: existing.nmsDeviceId } });
      await (tx as any).nmsBackup.deleteMany({ where: { nmsDeviceId: existing.nmsDeviceId } });

      return tx.device.update({
        where: { id: params.id },
        data: {
          nmsDeviceId: null,
          managementIp: null,
          snmpCommunity: null,
          snmpVersion: null,
          snmpPort: null,
          pollingEnabled: false,
          pollingInterval: null,
          sshUsername: null,
          sshPassword: null,
          sshPort: null,
          lastPolledAt: null,
        },
        select: {
          id: true,
          name: true,
          nmsDeviceId: true,
          managementIp: true,
          pollingEnabled: true,
        },
      });
    });

    return NextResponse.json({
      success: true,
      device: updated,
      message: 'NMS monitoring removed; inventory device retained',
    });
  } catch (error) {
    console.error('[NMS Device] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to remove NMS monitoring' }, { status: 500 });
  }
}
