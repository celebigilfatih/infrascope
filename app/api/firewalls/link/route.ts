import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestActor } from '@/lib/auth/request-actor';
import { normalizeFirewallManagementHost } from '@/lib/firewall/onboarding';
import { normalizeFortiGateVdom } from '@/lib/firewall/target';
import { probeFirewallConnector } from '@/lib/firewall/probe';
import {
  protectIntegrationConfig,
  unprotectIntegrationConfig,
} from '@/lib/security/integration-credentials';
import type { FortiGateConfig } from '@/lib/integrations/fortigate';

type LinkBody = { configId?: string; deviceId?: string };

export async function POST(request: NextRequest) {
  try {
    const auth = await getRequestActor(request);
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }
    if (auth.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Admin role required' }, { status: 403 });
    }

    let body: LinkBody;
    try {
      body = await request.json() as LinkBody;
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }
    const configId = typeof body.configId === 'string' ? body.configId.trim() : '';
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : '';
    if (!configId || !deviceId) {
      return NextResponse.json(
        { success: false, error: 'configId and deviceId are required' },
        { status: 400 }
      );
    }

    const [integration, device] = await Promise.all([
      prisma.integrationConfig.findUnique({
        where: { id: configId },
        include: { firewallConnectors: { select: { id: true } } },
      }),
      prisma.device.findUnique({
        where: { id: deviceId },
        include: { firewallConnector: { select: { id: true } } },
      }),
    ]);
    if (!integration || integration.type !== 'FORTIGATE') {
      return NextResponse.json({ success: false, error: 'FortiGate integration not found' }, { status: 404 });
    }
    if (!device || device.type !== 'FIREWALL') {
      return NextResponse.json({ success: false, error: 'Firewall inventory device not found' }, { status: 404 });
    }
    if (integration.firewallConnectors.length > 0) {
      return NextResponse.json(
        { success: false, error: 'FortiGate integration is already linked', code: 'INTEGRATION_ALREADY_LINKED' },
        { status: 409 }
      );
    }
    if (device.firewallConnector) {
      return NextResponse.json(
        { success: false, error: 'Inventory device is already linked to a firewall connector', code: 'DEVICE_ALREADY_LINKED' },
        { status: 409 }
      );
    }

    const currentConfig = unprotectIntegrationConfig<FortiGateConfig>(integration.config, 'FORTIGATE');
    const managementHost = normalizeFirewallManagementHost(currentConfig.host);
    const vdom = normalizeFortiGateVdom(currentConfig.vdom);
    const protectedConfig = protectIntegrationConfig<Record<string, unknown>>({
      ...currentConfig,
      host: managementHost,
      vdom,
      deviceId,
    }, 'FORTIGATE') as Prisma.InputJsonValue;
    const currentMetadata = device.metadata && typeof device.metadata === 'object'
      ? device.metadata as Record<string, unknown>
      : {};

    const connector = await prisma.$transaction(async (tx) => {
      const created = await tx.firewallConnector.create({
        data: {
          deviceId,
          integrationConfigId: configId,
          managementHost,
          vdom,
          monitoringMode: 'UNAVAILABLE',
          identityStatus: 'PENDING',
          writeEnabled: false,
        },
      });
      await tx.integrationConfig.update({
        where: { id: configId },
        data: { config: protectedConfig, lastSyncStatus: 'pending-probe' },
      });
      await tx.device.update({
        where: { id: deviceId },
        data: {
          managementIp: managementHost,
          vendor: device.vendor || 'Fortinet',
          metadata: {
            ...currentMetadata,
            connectorState: 'PENDING_PROBE',
            integrationConfigId: configId,
            managementHost,
            vdom,
          },
        },
      });
      await tx.auditLog.create({
        data: {
          entity: 'FirewallConnector',
          entityId: created.id,
          action: 'firewall.connector.link',
          resource: 'firewall',
          resourceId: created.id,
          userId: auth.actor.id,
          details: { integrationConfigId: configId, deviceId, managementHost, vdom },
        },
      });
      return created;
    });

    const result = await probeFirewallConnector(connector.id, { trigger: 'link' });
    return NextResponse.json({
      success: true,
      data: {
        connector: result.connector,
        device: result.device,
        monitoring: result.monitoring,
        probe: {
          connected: result.status.connected,
          error: result.status.error,
          errorCode: result.status.errorCode,
          retryable: result.status.retryable,
        },
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Firewall integration link failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to link firewall integration' },
      { status: 500 }
    );
  }
}
