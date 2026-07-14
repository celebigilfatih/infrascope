import FortiAnalyzerService, { initSharedFortiAnalyzerService } from '@/lib/integrations/fortianalyzer';
import { prisma } from '@/lib/prisma';
import { unprotectIntegrationConfig } from '@/lib/security/integration-credentials';
import type { IncidentActor } from '@/lib/alarms/incident-service';
import {
  decideFortiAnalyzerIdentity,
  type FortiAnalyzerManagedDevice,
} from './fortianalyzer-identity';

type StoredFortiAnalyzerConfig = {
  host?: string;
  username?: string;
  password?: string;
  apiKey?: string;
};

export class FirewallAnalyzerCorrelationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'FirewallAnalyzerCorrelationError';
  }
}

export async function resolveFirewallAnalyzerService(configId?: string): Promise<{
  configId: string;
  service: FortiAnalyzerService;
}> {
  const integrations = configId
    ? await prisma.integrationConfig.findMany({
        where: { id: configId, type: 'FORTIANALYZER', enabled: true },
        take: 1,
      })
    : await prisma.integrationConfig.findMany({
        where: { type: 'FORTIANALYZER', enabled: true },
        orderBy: { createdAt: 'asc' },
        take: 2,
      });
  if (integrations.length === 0) {
    throw new FirewallAnalyzerCorrelationError(
      'FortiAnalyzer integration is not configured',
      'FORTIANALYZER_NOT_CONFIGURED',
      409
    );
  }
  if (!configId && integrations.length > 1) {
    throw new FirewallAnalyzerCorrelationError(
      'Multiple FortiAnalyzer integrations exist; analyzerConfigId is required',
      'FORTIANALYZER_TARGET_REQUIRED',
      409
    );
  }
  const integration = integrations[0];
  const config = unprotectIntegrationConfig<StoredFortiAnalyzerConfig>(
    integration.config,
    'FORTIANALYZER'
  );
  if (!config.host || (!config.apiKey && (!config.username || !config.password))) {
    throw new FirewallAnalyzerCorrelationError(
      'FortiAnalyzer read credentials are incomplete',
      'FORTIANALYZER_INVALID_CONFIG',
      422
    );
  }
  return {
    configId: integration.id,
    service: initSharedFortiAnalyzerService({
      host: config.host,
      username: config.username,
      password: config.password,
      accessToken: config.apiKey,
    }),
  };
}

export async function correlateFirewallConnectorWithAnalyzer(params: {
  connectorId: string;
  analyzerConfigId?: string;
  actor: IncidentActor;
}) {
  const connector = await prisma.firewallConnector.findUnique({
    where: { id: params.connectorId },
    select: {
      id: true,
      deviceId: true,
      serialNumber: true,
      identityStatus: true,
      analyzerDeviceId: true,
      vdom: true,
    },
  });
  if (!connector) {
    throw new FirewallAnalyzerCorrelationError('Firewall connector not found', 'FIREWALL_NOT_FOUND', 404);
  }
  if (connector.identityStatus !== 'VERIFIED' || !connector.serialNumber) {
    throw new FirewallAnalyzerCorrelationError(
      'FortiGate REST identity must be verified before FortiAnalyzer correlation',
      'FIREWALL_IDENTITY_NOT_VERIFIED',
      409
    );
  }

  const analyzer = await resolveFirewallAnalyzerService(params.analyzerConfigId);
  if (!await analyzer.service.login()) {
    throw new FirewallAnalyzerCorrelationError(
      'FortiAnalyzer authentication failed',
      'FORTIANALYZER_AUTH_FAILED',
      503
    );
  }
  const devices = await analyzer.service.getDevices() as FortiAnalyzerManagedDevice[];
  const decision = decideFortiAnalyzerIdentity({
    serialNumber: connector.serialNumber,
    vdom: connector.vdom,
    devices,
  });
  if (decision.status !== 'VERIFIED') {
    throw new FirewallAnalyzerCorrelationError(
      decision.status === 'AMBIGUOUS'
        ? 'FortiAnalyzer returned an ambiguous device identity'
        : 'Verified FortiGate serial was not found in FortiAnalyzer',
      decision.status === 'AMBIGUOUS'
        ? 'FORTIANALYZER_IDENTITY_AMBIGUOUS'
        : 'FORTIANALYZER_IDENTITY_NOT_FOUND',
      409
    );
  }
  const owner = await prisma.firewallConnector.findFirst({
    where: {
      analyzerDeviceId: decision.analyzerDeviceId,
      vdom: decision.vdom,
      id: { not: connector.id },
    },
    select: { id: true },
  });
  if (owner) {
    throw new FirewallAnalyzerCorrelationError(
      'FortiAnalyzer device and VDOM are already linked to another firewall connector',
      'FORTIANALYZER_IDENTITY_CONFLICT',
      409
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.firewallConnector.update({
      where: { id: connector.id },
      data: { analyzerDeviceId: decision.analyzerDeviceId },
    });
    await tx.auditLog.create({
      data: {
        entity: 'FirewallConnector',
        entityId: connector.id,
        action: 'firewall.analyzer-identity.verify',
        resource: 'firewall',
        resourceId: connector.id,
        userId: params.actor.id,
        details: {
          analyzerConfigId: analyzer.configId,
          analyzerDeviceId: decision.analyzerDeviceId,
          serialNumber: connector.serialNumber,
          vdom: decision.vdom,
          previousAnalyzerDeviceId: connector.analyzerDeviceId,
          matchBasis: 'exact-verified-serial',
        },
      },
    });
    return result;
  });
  return {
    connector: updated,
    correlation: {
      status: 'VERIFIED' as const,
      analyzerConfigId: analyzer.configId,
      analyzerDeviceId: decision.analyzerDeviceId,
      vdom: decision.vdom,
      matchBasis: 'exact-verified-serial' as const,
    },
  };
}
