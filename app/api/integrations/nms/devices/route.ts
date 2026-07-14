import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  NmsSnmpValidationError,
  normalizeSnmpV3AuthProtocol,
  normalizeSnmpV3PrivacyProtocol,
  normalizeSnmpV3SecurityLevel,
  normalizeSnmpV3Username,
  normalizeSnmpVersion,
  validateSnmpCommunity,
  validateSnmpV3Secret,
} from '@/lib/nms/snmp-config';
import { protectNmsCredential } from '@/lib/security/integration-credentials';

/**
 * GET /api/integrations/nms/devices
 * List all devices with SNMP polling configured (nmsDeviceId set).
 * 
 * POST /api/integrations/nms/devices
 * Enable SNMP polling on an existing inventory device.
 */

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
    const snmpVersion = normalizeSnmpVersion(body.snmpVersion || body.snmp_version);
    const snmpPort = Number(body.snmpPort || body.snmp_port || 161);
    const pollingInterval = Number(body.pollingInterval || body.polling_interval || 300);
    const pollingEnabled = Boolean(body.pollingEnabled ?? body.polling_enabled ?? true);
    const sshUsername = body.sshUsername || body.ssh_username || null;
    const sshPassword = body.sshPassword || body.ssh_password || null;
    const sshPort = body.sshPort || body.ssh_port ? Number(body.sshPort || body.ssh_port) : 22;

    if (!Number.isInteger(snmpPort) || snmpPort < 1 || snmpPort > 65535) {
      throw new NmsSnmpValidationError('SNMP port must be between 1 and 65535');
    }
    if (!Number.isInteger(pollingInterval) || pollingInterval < 10 || pollingInterval > 86400) {
      throw new NmsSnmpValidationError('Polling interval must be between 10 and 86400 seconds');
    }
    if (!Number.isInteger(sshPort) || sshPort < 1 || sshPort > 65535) {
      throw new NmsSnmpValidationError('SSH port must be between 1 and 65535');
    }

    const snmpData: Record<string, unknown> = { snmpVersion };
    if (snmpVersion === '3') {
      const securityLevel = normalizeSnmpV3SecurityLevel(
        body.snmpV3SecurityLevel ?? body.snmp_v3_security_level
      );
      const authPassword = validateSnmpV3Secret(
        body.snmpV3AuthPassword ?? body.snmp_v3_auth_password,
        'SNMPv3 authentication password'
      );
      snmpData.snmpCommunity = null;
      snmpData.snmpV3Username = normalizeSnmpV3Username(
        body.snmpV3Username ?? body.snmp_v3_username
      );
      snmpData.snmpV3SecurityLevel = securityLevel;
      snmpData.snmpV3AuthProtocol = normalizeSnmpV3AuthProtocol(
        body.snmpV3AuthProtocol ?? body.snmp_v3_auth_protocol
      );
      snmpData.snmpV3AuthPassword = protectNmsCredential(authPassword, 'snmpV3AuthPassword');

      if (securityLevel === 'authPriv') {
        const privacyPassword = validateSnmpV3Secret(
          body.snmpV3PrivacyPassword ?? body.snmp_v3_privacy_password,
          'SNMPv3 privacy password'
        );
        snmpData.snmpV3PrivacyProtocol = normalizeSnmpV3PrivacyProtocol(
          body.snmpV3PrivacyProtocol ?? body.snmp_v3_privacy_protocol
        );
        snmpData.snmpV3PrivacyPassword = protectNmsCredential(
          privacyPassword,
          'snmpV3PrivacyPassword'
        );
      } else {
        snmpData.snmpV3PrivacyProtocol = null;
        snmpData.snmpV3PrivacyPassword = null;
      }
    } else {
      const community = validateSnmpCommunity(body.snmpCommunity ?? body.snmp_community);
      snmpData.snmpCommunity = protectNmsCredential(community, 'snmpCommunity');
      snmpData.snmpV3Username = null;
      snmpData.snmpV3SecurityLevel = null;
      snmpData.snmpV3AuthProtocol = null;
      snmpData.snmpV3AuthPassword = null;
      snmpData.snmpV3PrivacyProtocol = null;
      snmpData.snmpV3PrivacyPassword = null;
    }

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
        ...snmpData,
        snmpPort,
        pollingEnabled,
        pollingInterval,
        sshUsername,
        sshPassword: sshPassword
          ? protectNmsCredential(String(sshPassword), 'sshPassword')
          : null,
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
        snmpV3Username: true,
        snmpV3SecurityLevel: true,
        snmpV3AuthProtocol: true,
        snmpV3PrivacyProtocol: true,
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
    if (error instanceof NmsSnmpValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Failed to enable NMS polling' }, { status: 500 });
  }
}
