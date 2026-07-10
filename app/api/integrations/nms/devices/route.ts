import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/integrations/nms/devices
 * List all devices with SNMP polling configured (nmsDeviceId set).
 * 
 * POST /api/integrations/nms/devices
 * Enable SNMP polling on an existing inventory device.
 */

function normalizeSnmpVersion(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '2c';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'v2c') return '2c';
  if (normalized === 'v3') return '3';
  return normalized;
}

async function getNextNmsDeviceId(): Promise<number> {
  const maxResult = await (prisma as any).device.aggregate({
    _max: { nmsDeviceId: true },
  });
  return (maxResult._max.nmsDeviceId ?? 0) + 1;
}

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
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : '';
    const managementIp =
      typeof (body.managementIp || body.ip_address) === 'string'
        ? (body.managementIp || body.ip_address).trim()
        : '';
    const snmpCommunity = body.snmpCommunity || body.snmp_community || null;
    const snmpVersion = normalizeSnmpVersion(body.snmpVersion || body.snmp_version);
    const snmpPort = Number(body.snmpPort || body.snmp_port || 161);
    const pollingInterval = Number(body.pollingInterval || body.polling_interval || 300);
    const pollingEnabled = Boolean(body.pollingEnabled ?? body.polling_enabled ?? true);
    const sshUsername = body.sshUsername || body.ssh_username || null;
    const sshPassword = body.sshPassword || body.ssh_password || null;
    const sshPort = body.sshPort || body.ssh_port ? Number(body.sshPort || body.ssh_port) : 22;

    if (!deviceId) {
      return NextResponse.json(
        { error: 'deviceId is required. Create the device in inventory first, then enable NMS monitoring.' },
        { status: 400 }
      );
    }

    if (!managementIp) {
      return NextResponse.json(
        { error: 'managementIp or ip_address is required' },
        { status: 400 }
      );
    }

    const existing = await (prisma as any).device.findUnique({
      where: { id: deviceId },
      select: { id: true, name: true, nmsDeviceId: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Inventory device not found' },
        { status: 404 }
      );
    }

    if (existing.nmsDeviceId !== null) {
      return NextResponse.json(
        { error: `Device "${existing.name}" already has NMS monitoring configured`, deviceId, nmsDeviceId: existing.nmsDeviceId },
        { status: 409 }
      );
    }

    const duplicateIp = await (prisma as any).device.findFirst({
      where: {
        managementIp,
        nmsDeviceId: { not: null },
        NOT: { id: deviceId },
      },
      select: { id: true, name: true, nmsDeviceId: true },
    });

    if (duplicateIp) {
      return NextResponse.json(
        { error: `Management IP ${managementIp} is already used by "${duplicateIp.name}"`, deviceId: duplicateIp.id, nmsDeviceId: duplicateIp.nmsDeviceId },
        { status: 409 }
      );
    }

    const nextNmsId = await getNextNmsDeviceId();

    const updated = await (prisma as any).device.update({
      where: { id: deviceId },
      data: {
        nmsDeviceId: nextNmsId,
        managementIp,
        snmpCommunity,
        snmpVersion,
        snmpPort,
        pollingEnabled,
        pollingInterval,
        sshUsername,
        sshPassword,
        sshPort,
      },
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
        sshUsername: true,
        sshPort: true,
      },
    });

    return NextResponse.json({ device: updated }, { status: 201 });
  } catch (error) {
    console.error('[NMS Devices] POST error:', error);
    return NextResponse.json({ error: 'Failed to enable NMS polling' }, { status: 500 });
  }
}
