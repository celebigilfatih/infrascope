import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getRequestActor } from '@/lib/auth/request-actor';
import { clearFortiGateConnectors } from '@/lib/firewall/connector-factory';
import { probeFirewallConnector } from '@/lib/firewall/probe';
import {
  FirewallOnboardingValidationError,
  normalizeFirewallManagementHost,
} from '@/lib/firewall/onboarding';
import {
  protectIntegrationConfig,
  unprotectIntegrationConfig,
} from '@/lib/security/integration-credentials';
import type { FortiGateConfig } from '@/lib/integrations/fortigate';
import { inspectTrustedCaBundle } from '@/lib/firewall/tls-ca';

type RouteContext = { params: { id: string } };

async function requireAdmin(request: NextRequest) {
  const auth = await getRequestActor(request);
  if (!auth) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  if (auth.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'Admin role required' }, { status: 403 });
  }
  return auth.actor;
}

const safeDeviceSelect = {
  id: true,
  name: true,
  type: true,
  vendor: true,
  model: true,
  serialNumber: true,
  firmwareVersion: true,
  status: true,
  criticality: true,
  managementIp: true,
  nmsDeviceId: true,
  snmpVersion: true,
  snmpPort: true,
  pollingEnabled: true,
  pollingInterval: true,
  sshUsername: true,
  sshPort: true,
  sshHostKeyAlgorithm: true,
  sshHostKeyFingerprint: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const connector = await prisma.firewallConnector.findUnique({
    where: { id: params.id },
    include: {
      device: { select: safeDeviceSelect },
      integrationConfig: { select: { id: true, name: true, enabled: true, lastSyncAt: true, lastSyncStatus: true, config: true } },
    },
  });
  if (!connector) {
    return NextResponse.json({ success: false, error: 'Firewall connector not found' }, { status: 404 });
  }
  const conflict = connector.identityConflictWithId
    ? await prisma.firewallConnector.findUnique({
        where: { id: connector.identityConflictWithId },
        select: { id: true, deviceId: true, managementHost: true, serialNumber: true, vdom: true },
      })
    : null;
  const config = unprotectIntegrationConfig<FortiGateConfig>(connector.integrationConfig.config, 'FORTIGATE');
  const { config: _config, ...safeIntegrationConfig } = connector.integrationConfig;
  let tls = { configured: false, updatedAt: null as string | null, summary: null as ReturnType<typeof inspectTrustedCaBundle> | null };
  if (config.tlsCaPem) {
    try {
      tls = { configured: true, updatedAt: config.tlsCaUpdatedAt || null, summary: inspectTrustedCaBundle(config.tlsCaPem) };
    } catch {
      tls = { configured: true, updatedAt: config.tlsCaUpdatedAt || null, summary: null };
    }
  }
  return NextResponse.json({ success: true, data: { ...connector, integrationConfig: safeIntegrationConfig, tls, conflict } });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const managementHost = normalizeFirewallManagementHost(body.host);
    const connector = await prisma.firewallConnector.findUnique({
      where: { id: params.id },
      include: { integrationConfig: true, device: { select: safeDeviceSelect } },
    });
    if (!connector) {
      return NextResponse.json({ success: false, error: 'Firewall connector not found' }, { status: 404 });
    }
    const current = unprotectIntegrationConfig<FortiGateConfig>(connector.integrationConfig.config, 'FORTIGATE');
    const username = typeof body.username === 'string' && body.username.trim()
      ? body.username.trim()
      : current.username;
    const password = typeof body.password === 'string' && body.password
      ? body.password
      : current.password;
    const accessToken = typeof body.accessToken === 'string' && body.accessToken
      ? body.accessToken
      : current.accessToken;
    const protectedConfig = protectIntegrationConfig<Record<string, unknown>>({
      ...current,
      host: managementHost,
      username,
      password: password || '',
      accessToken: accessToken || '',
      deviceId: connector.deviceId,
      vdom: connector.vdom,
    }, 'FORTIGATE');
    const currentMetadata = connector.device.metadata && typeof connector.device.metadata === 'object'
      ? connector.device.metadata as Record<string, unknown>
      : {};
    await prisma.$transaction([
      prisma.integrationConfig.update({
        where: { id: connector.integrationConfigId },
        data: { config: protectedConfig as any, lastSyncStatus: 'pending-probe' },
      }),
      prisma.firewallConnector.update({
        where: { id: connector.id },
        data: { managementHost, lastErrorCode: null },
      }),
      prisma.device.update({
        where: { id: connector.deviceId },
        data: {
          managementIp: managementHost,
          metadata: {
            ...currentMetadata,
            managementHost,
            vdom: connector.vdom,
            integrationConfigId: connector.integrationConfigId,
          },
        },
      }),
    ]);

    const { connector: identity, device, monitoring, status } = await probeFirewallConnector(
      connector.id,
      { trigger: 'configuration' }
    );
    return NextResponse.json({
      success: true,
      data: { connector: identity, device, monitoring, probe: status },
    });
  } catch (error) {
    if (error instanceof FirewallOnboardingValidationError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
    }
    console.error('Firewall connector update failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to update firewall connector' }, { status: 500 });
  }
}

/** Removes only InfraScope's connection configuration; the inventory device remains intact. */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const actor = await requireAdmin(request);
    if (actor instanceof NextResponse) return actor;

    const connector = await prisma.firewallConnector.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        deviceId: true,
        integrationConfigId: true,
        managementHost: true,
        vdom: true,
        device: { select: { metadata: true } },
      },
    });
    if (!connector) {
      return NextResponse.json({ success: false, error: 'Firewall connector not found' }, { status: 404 });
    }

    const metadata = connector.device.metadata && typeof connector.device.metadata === 'object'
      ? { ...connector.device.metadata as Record<string, unknown> }
      : {};
    delete metadata.connectorState;
    delete metadata.integrationConfigId;
    delete metadata.managementHost;
    delete metadata.vdom;
    delete metadata.firewallMonitoring;
    delete metadata.firewallStatusSnapshot;

    await prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          entity: 'FirewallConnector',
          entityId: connector.id,
          action: 'firewall.connector.remove',
          resource: 'firewall',
          resourceId: connector.id,
          userId: actor.id,
          details: {
            integrationConfigId: connector.integrationConfigId,
            deviceId: connector.deviceId,
            managementHost: connector.managementHost,
            vdom: connector.vdom,
            inventoryPreserved: true,
          },
        },
      });
      await tx.device.update({
        where: { id: connector.deviceId },
        data: { metadata: metadata as Prisma.InputJsonValue },
      });
      await tx.integrationConfig.delete({ where: { id: connector.integrationConfigId } });
    });

    await clearFortiGateConnectors(`${connector.integrationConfigId}:${connector.vdom}`);
    return NextResponse.json({
      success: true,
      data: { deviceId: connector.deviceId, inventoryPreserved: true },
    });
  } catch (error) {
    console.error('Firewall connector removal failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to remove firewall connector' }, { status: 500 });
  }
}
