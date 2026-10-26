import { NextRequest, NextResponse } from 'next/server';
import { authorizeApiRequest } from '@/lib/auth/api-permission';
import { prisma } from '@/lib/prisma';
import { reserveNextNmsDeviceId } from '@/lib/nms/device-id';
import {
  NmsSnmpValidationError,
  normalizeSnmpVersion,
  validateSnmpCommunity,
} from '@/lib/nms/snmp-config';
import { protectNmsCredential } from '@/lib/security/integration-credentials';

interface Params { params: Promise<{ scanId: string }> }

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
export async function POST(req: NextRequest, props: Params) {
  const params = await props.params;
  const access = await authorizeApiRequest(req, 'devices', 'write');
  if (!access.allowed) return access.response;
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

    return await prisma.$transaction(async (tx) => {
      const nextNmsId = await reserveNextNmsDeviceId(tx);
      // Read eligibility only after the shared allocation lock has been acquired.
      const discovered = await tx.nmsDiscoveredDevice.findUnique({
        where: { id: discoveredDeviceId },
      });

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

      // Discovery currently probes community-based SNMP only. SNMPv3 is configured
      // through the NMS monitoring form so USM secrets never transit discovery records.
      const normalizedVersion = normalizeSnmpVersion(snmpVersion);
      if (normalizedVersion === '3') {
        return NextResponse.json(
          { error: 'SNMPv3 devices must be configured from the NMS monitoring form.' },
          { status: 400 }
        );
      }
      const effectiveCommunity = validateSnmpCommunity(
        snmpCommunity || discovered.snmpCommunity || null
      );

      const existing = await tx.device.findUnique({
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

      const duplicateIp = await tx.device.findFirst({
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

      const infraDevice = await tx.device.update({
        where: { id: deviceId },
        data: {
          nmsDeviceId: nextNmsId,
          managementIp: discovered.ipAddress,
          snmpCommunity: protectNmsCredential(effectiveCommunity, 'snmpCommunity'),
          snmpVersion: normalizedVersion,
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
      await tx.nmsDiscoveredDevice.update({
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
    }, { isolationLevel: 'ReadCommitted' });

  } catch (error) {
    console.error('[NMS Import] POST error:', error);
    if (error instanceof NmsSnmpValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Failed to import device' }, { status: 500 });
  }
}
