import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestActor } from '@/lib/auth/request-actor';
import { checkDeviceLimit } from '@/lib/license/middleware';
import { probeFirewallConnector } from '@/lib/firewall/probe';
import { reserveNextNmsDeviceId } from '@/lib/nms/device-id';
import {
  FirewallOnboardingValidationError,
  normalizeFirewallOnboardingInput,
} from '@/lib/firewall/onboarding';
import {
  hasIntegrationCredential,
  protectIntegrationConfig,
  protectNmsCredential,
  unprotectIntegrationConfig,
} from '@/lib/security/integration-credentials';
import type { FortiGateConfig } from '@/lib/integrations/fortigate';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [connectors, unlinkedIntegrations] = await Promise.all([
      prisma.firewallConnector.findMany({
        include: {
          integrationConfig: true,
          device: {
            select: {
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
              pollingEnabled: true,
              pollingInterval: true,
              sshUsername: true,
              sshHostKeyFingerprint: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.integrationConfig.findMany({
        where: { type: 'FORTIGATE', firewallConnectors: { none: {} } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const linked = connectors.map((connector) => {
      const integration = connector.integrationConfig;
      return {
        id: connector.id,
        configId: integration.id,
        name: integration.name,
        host: connector.managementHost,
        vdom: connector.vdom,
        enabled: integration.enabled,
        credentialSet:
          hasIntegrationCredential(integration.config, 'FORTIGATE', 'password') ||
          hasIntegrationCredential(integration.config, 'FORTIGATE', 'accessToken'),
        identity: {
          status: connector.identityStatus,
          serialNumber: connector.serialNumber,
          analyzerDeviceId: connector.analyzerDeviceId,
          identityKey: connector.identityKey,
          candidateKey: connector.identityCandidateKey,
          conflictWithId: connector.identityConflictWithId,
        },
        monitoring: {
          mode: connector.monitoringMode,
          sources: connector.capabilities || [],
          lastProbeAt: connector.lastProbeAt,
          lastSuccessAt: connector.lastSuccessAt,
          nextProbeAt: connector.nextProbeAt,
          lastErrorCode: connector.lastErrorCode,
        },
        device: connector.device,
        lastSyncAt: integration.lastSyncAt,
        lastSyncStatus: integration.lastSyncStatus,
        requiresInventoryLink: false,
      };
    });
    const unlinked = unlinkedIntegrations.map((integration) => {
      const config = unprotectIntegrationConfig<FortiGateConfig>(integration.config, 'FORTIGATE');
      return {
        id: null,
        configId: integration.id,
        name: integration.name,
        host: config.host,
        vdom: config.vdom || 'root',
        enabled: integration.enabled,
        credentialSet:
          hasIntegrationCredential(integration.config, 'FORTIGATE', 'password') ||
          hasIntegrationCredential(integration.config, 'FORTIGATE', 'accessToken'),
        identity: null,
        monitoring: null,
        device: null,
        lastSyncAt: integration.lastSyncAt,
        lastSyncStatus: integration.lastSyncStatus,
        requiresInventoryLink: true,
      };
    });
    const data = [...linked, ...unlinked];
    return NextResponse.json({ success: true, data, total: data.length });
  } catch (error) {
    console.error('Firewall list failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to load firewalls' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = normalizeFirewallOnboardingInput(await request.json());
    const existing = await prisma.integrationConfig.findMany({
      where: { type: 'FORTIGATE' },
      select: { id: true, config: true },
    });
    const duplicate = existing.find((record) => {
      const config = unprotectIntegrationConfig<FortiGateConfig>(record.config, 'FORTIGATE');
      return config.host?.trim().toLowerCase() === input.host && (config.vdom || 'root') === input.vdom;
    });
    if (duplicate) {
      return NextResponse.json(
        { success: false, error: 'This FortiGate host and VDOM are already registered', code: 'FIREWALL_EXISTS', configId: duplicate.id },
        { status: 409 }
      );
    }

    const licenseError = await checkDeviceLimit(await prisma.device.count());
    if (licenseError) return licenseError;

    const created = await prisma.$transaction(async (tx) => {
      const nmsDeviceId = input.snmp || input.ssh
        ? await reserveNextNmsDeviceId(tx)
        : null;
      const snmpData = input.snmp
        ? input.snmp.version === '3'
          ? {
              snmpVersion: input.snmp.version,
              snmpCommunity: null,
              snmpV3Username: input.snmp.username,
              snmpV3SecurityLevel: input.snmp.securityLevel,
              snmpV3AuthProtocol: input.snmp.authProtocol,
              snmpV3AuthPassword: protectNmsCredential(input.snmp.authPassword, 'snmpV3AuthPassword'),
              snmpV3PrivacyProtocol: input.snmp.privacyProtocol,
              snmpV3PrivacyPassword: input.snmp.privacyPassword
                ? protectNmsCredential(input.snmp.privacyPassword, 'snmpV3PrivacyPassword')
                : null,
            }
          : {
              snmpVersion: input.snmp.version,
              snmpCommunity: protectNmsCredential(input.snmp.community, 'snmpCommunity'),
            }
        : {};
      const device = await tx.device.create({
        data: {
          name: input.name,
          type: 'FIREWALL',
          vendor: 'Fortinet',
          model: input.model || 'FortiGate',
          criticality: 'CRITICAL',
          status: 'UNKNOWN',
          managementIp: input.host,
          nmsDeviceId,
          ...snmpData,
          snmpPort: input.snmp?.port,
          pollingEnabled: Boolean(input.snmp),
          pollingInterval: input.snmp?.pollingInterval,
          sshUsername: input.ssh?.username,
          sshPassword: input.ssh
            ? protectNmsCredential(input.ssh.password, 'sshPassword')
            : undefined,
          sshPort: input.ssh?.port,
          metadata: {
            connectorState: 'PENDING_PROBE',
            managementHost: input.host,
            vdom: input.vdom,
          },
        },
      });
      const config = protectIntegrationConfig<Record<string, unknown>>({
        host: input.host,
        username: input.username,
        password: input.password || '',
        accessToken: input.accessToken || '',
        vdom: input.vdom,
        deviceId: device.id,
        snmp: input.snmp ? {
          configured: true,
          version: input.snmp.version,
          port: input.snmp.port,
        } : undefined,
        pollingInterval: 5,
        syncMode: input.snmp ? 'both' : 'rest',
        enabledModules: {
          interfaces: true,
          vlans: true,
          policies: true,
          addresses: true,
          vips: true,
          sdwan: true,
        },
      }, 'FORTIGATE');
      const integration = await tx.integrationConfig.create({
        data: {
          type: 'FORTIGATE',
          name: `FortiGate:${device.id}:${input.vdom}`,
          description: input.name,
          config: config as any,
          enabled: true,
          syncInterval: 5,
          lastSyncStatus: 'pending-probe',
        },
      });
      const checkedAt = new Date().toISOString();
      const fallbackCapabilities = [
        ...(input.snmp ? [{
          source: 'snmp',
          status: 'unavailable',
          checkedAt,
          lastSuccessAt: null,
          capabilities: ['reachability', 'uptime', 'cpu', 'memory', 'temperature', 'interfaces'],
          retryable: true,
          reason: 'SNMP polling is configured and waiting for the first metric',
        }] : []),
        ...(input.ssh ? [{
          source: 'ssh',
          status: 'unconfigured',
          checkedAt,
          lastSuccessAt: null,
          capabilities: ['identity', 'system-status', 'config-backup'],
          reason: 'SSH credentials are saved; approve the observed host key before use',
        }] : []),
      ];
      const connector = await tx.firewallConnector.create({
        data: {
          deviceId: device.id,
          integrationConfigId: integration.id,
          managementHost: input.host,
          vdom: input.vdom,
          monitoringMode: 'UNAVAILABLE',
          identityStatus: 'PENDING',
          capabilities: fallbackCapabilities as any,
          writeEnabled: false,
        },
      });
      return { device, integration, connector };
    });

    const { connector, device, monitoring, status } = await probeFirewallConnector(
      created.connector.id,
      { trigger: 'onboarding' }
    );

    return NextResponse.json({
      success: true,
      data: {
        configId: created.integration.id,
        connector,
        device,
        monitoring,
        probe: {
          connected: status.connected,
          error: status.error,
          errorCode: status.errorCode,
          retryable: status.retryable,
        },
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof FirewallOnboardingValidationError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error('Firewall onboarding failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to register firewall' }, { status: 500 });
  }
}

/** Removes a legacy, unlinked FortiGate integration without touching any FortiGate device. */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await getRequestActor(request);
    if (!auth) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    if (auth.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Admin role required' }, { status: 403 });
    }

    const configId = new URL(request.url).searchParams.get('configId')?.trim();
    if (!configId) {
      return NextResponse.json({ success: false, error: 'configId is required' }, { status: 400 });
    }
    const integration = await prisma.integrationConfig.findUnique({
      where: { id: configId },
      select: { id: true, name: true, type: true, firewallConnectors: { select: { id: true } } },
    });
    if (!integration || integration.type !== 'FORTIGATE') {
      return NextResponse.json({ success: false, error: 'FortiGate integration not found' }, { status: 404 });
    }
    if (integration.firewallConnectors.length > 0) {
      return NextResponse.json({ success: false, error: 'Linked firewall integrations must be removed from their detail row' }, { status: 409 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          entity: 'IntegrationConfig',
          entityId: integration.id,
          action: 'firewall.legacy-integration.remove',
          resource: 'firewall',
          resourceId: integration.id,
          userId: auth.actor.id,
          details: { integrationName: integration.name, inventoryPreserved: true },
        },
      });
      await tx.integrationConfig.delete({ where: { id: integration.id } });
    });

    return NextResponse.json({ success: true, data: { configId: integration.id, inventoryPreserved: true } });
  } catch (error) {
    console.error('Legacy FortiGate integration removal failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to remove FortiGate integration' }, { status: 500 });
  }
}
