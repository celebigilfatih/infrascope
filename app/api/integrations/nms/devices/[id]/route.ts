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
        snmpCommunity: true,
        snmpV3Username: true,
        snmpV3SecurityLevel: true,
        snmpV3AuthProtocol: true,
        snmpV3AuthPassword: true,
        snmpV3PrivacyProtocol: true,
        snmpV3PrivacyPassword: true,
        pollingEnabled: true,
        pollingInterval: true,
        lastPolledAt: true,
        sshUsername: true,
        sshPassword: true,
        sshPort: true,
        sshHostKeyAlgorithm: true,
        sshHostKeyFingerprint: true,
        // Secret fields are reduced to booleans below.
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

    const {
      snmpCommunity,
      snmpV3AuthPassword,
      snmpV3PrivacyPassword,
      sshPassword,
      ...safeDevice
    } = device;

    return NextResponse.json(serializeBigInt({
      device: {
        ...safeDevice,
        hasSnmpCommunity: Boolean(snmpCommunity),
        hasSnmpV3AuthPassword: Boolean(snmpV3AuthPassword),
        hasSnmpV3PrivacyPassword: Boolean(snmpV3PrivacyPassword),
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
      snmpV3Username,
      snmpV3SecurityLevel,
      snmpV3AuthProtocol,
      snmpV3AuthPassword,
      snmpV3PrivacyProtocol,
      snmpV3PrivacyPassword,
      pollingEnabled,
      pollingInterval,
      sshUsername,
      sshPassword,
      sshPort,
    } = body;

    const existing = await (prisma as any).device.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        name: true,
        nmsDeviceId: true,
        snmpVersion: true,
        snmpCommunity: true,
        snmpV3Username: true,
        snmpV3SecurityLevel: true,
        snmpV3AuthProtocol: true,
        snmpV3AuthPassword: true,
        snmpV3PrivacyProtocol: true,
        snmpV3PrivacyPassword: true,
      },
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

    if (snmpPort !== undefined) {
      const normalizedSnmpPort = Number(snmpPort);
      if (!Number.isInteger(normalizedSnmpPort) || normalizedSnmpPort < 1 || normalizedSnmpPort > 65535) {
        throw new NmsSnmpValidationError('SNMP port must be between 1 and 65535');
      }
    }
    if (pollingInterval !== undefined) {
      const normalizedInterval = Number(pollingInterval);
      if (!Number.isInteger(normalizedInterval) || normalizedInterval < 10 || normalizedInterval > 86400) {
        throw new NmsSnmpValidationError('Polling interval must be between 10 and 86400 seconds');
      }
    }

    const updateData: Record<string, unknown> = {};
    if (managementIp !== undefined) updateData.managementIp = managementIp.trim();
    const snmpConfigTouched = [
      snmpCommunity,
      snmpVersion,
      snmpV3Username,
      snmpV3SecurityLevel,
      snmpV3AuthProtocol,
      snmpV3AuthPassword,
      snmpV3PrivacyProtocol,
      snmpV3PrivacyPassword,
    ].some((value) => value !== undefined);

    if (snmpConfigTouched) {
      const version = normalizeSnmpVersion(snmpVersion, normalizeSnmpVersion(existing.snmpVersion));
      updateData.snmpVersion = version;
      if (version === '3') {
        const securityLevel = normalizeSnmpV3SecurityLevel(
          snmpV3SecurityLevel ?? existing.snmpV3SecurityLevel
        );
        const authSecret = typeof snmpV3AuthPassword === 'string' && snmpV3AuthPassword.length > 0
          ? validateSnmpV3Secret(snmpV3AuthPassword, 'SNMPv3 authentication password')
          : existing.snmpV3AuthPassword;
        if (!authSecret) {
          throw new NmsSnmpValidationError('SNMPv3 authentication password is required');
        }

        updateData.snmpCommunity = null;
        updateData.snmpV3Username = normalizeSnmpV3Username(
          snmpV3Username ?? existing.snmpV3Username
        );
        updateData.snmpV3SecurityLevel = securityLevel;
        updateData.snmpV3AuthProtocol = normalizeSnmpV3AuthProtocol(
          snmpV3AuthProtocol ?? existing.snmpV3AuthProtocol
        );
        if (typeof snmpV3AuthPassword === 'string' && snmpV3AuthPassword.length > 0) {
          updateData.snmpV3AuthPassword = protectNmsCredential(
            snmpV3AuthPassword,
            'snmpV3AuthPassword'
          );
        }

        if (securityLevel === 'authPriv') {
          const privacySecret = typeof snmpV3PrivacyPassword === 'string' && snmpV3PrivacyPassword.length > 0
            ? validateSnmpV3Secret(snmpV3PrivacyPassword, 'SNMPv3 privacy password')
            : existing.snmpV3PrivacyPassword;
          if (!privacySecret) {
            throw new NmsSnmpValidationError('SNMPv3 privacy password is required for authPriv');
          }
          updateData.snmpV3PrivacyProtocol = normalizeSnmpV3PrivacyProtocol(
            snmpV3PrivacyProtocol ?? existing.snmpV3PrivacyProtocol
          );
          if (typeof snmpV3PrivacyPassword === 'string' && snmpV3PrivacyPassword.length > 0) {
            updateData.snmpV3PrivacyPassword = protectNmsCredential(
              snmpV3PrivacyPassword,
              'snmpV3PrivacyPassword'
            );
          }
        } else {
          updateData.snmpV3PrivacyProtocol = null;
          updateData.snmpV3PrivacyPassword = null;
        }
      } else {
        const community = typeof snmpCommunity === 'string' && snmpCommunity.length > 0
          ? validateSnmpCommunity(snmpCommunity)
          : existing.snmpCommunity;
        if (!community) throw new NmsSnmpValidationError('SNMP community is required');
        if (typeof snmpCommunity === 'string' && snmpCommunity.length > 0) {
          updateData.snmpCommunity = protectNmsCredential(snmpCommunity, 'snmpCommunity');
        }
        updateData.snmpV3Username = null;
        updateData.snmpV3SecurityLevel = null;
        updateData.snmpV3AuthProtocol = null;
        updateData.snmpV3AuthPassword = null;
        updateData.snmpV3PrivacyProtocol = null;
        updateData.snmpV3PrivacyPassword = null;
      }
    }
    if (snmpPort !== undefined) updateData.snmpPort = Number(snmpPort);
    if (pollingEnabled !== undefined) updateData.pollingEnabled = pollingEnabled;
    if (pollingInterval !== undefined) updateData.pollingInterval = pollingInterval;
    if (sshUsername !== undefined) {
      updateData.sshUsername = typeof sshUsername === 'string' && sshUsername.trim()
        ? sshUsername.trim()
        : null;
    }
    if (typeof sshPassword === 'string' && sshPassword.length > 0) {
      updateData.sshPassword = protectNmsCredential(sshPassword, 'sshPassword');
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
        snmpV3Username: true,
        snmpV3SecurityLevel: true,
        snmpV3AuthProtocol: true,
        snmpV3PrivacyProtocol: true,
        snmpPort: true,
        pollingEnabled: true,
        pollingInterval: true,
        lastPolledAt: true,
        sshUsername: true,
        sshPort: true,
        sshHostKeyAlgorithm: true,
        sshHostKeyFingerprint: true,
      },
    });

    return NextResponse.json({ device: updated });
  } catch (error) {
    console.error('[NMS Device] PUT error:', error);
    if (error instanceof NmsSnmpValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
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
          snmpV3Username: null,
          snmpV3SecurityLevel: null,
          snmpV3AuthProtocol: null,
          snmpV3AuthPassword: null,
          snmpV3PrivacyProtocol: null,
          snmpV3PrivacyPassword: null,
          snmpVersion: null,
          snmpPort: null,
          pollingEnabled: false,
          pollingInterval: null,
          sshUsername: null,
          sshPassword: null,
          sshPort: null,
          sshHostKeyAlgorithm: null,
          sshHostKeyFingerprint: null,
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
