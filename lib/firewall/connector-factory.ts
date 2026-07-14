import type { IntegrationConfig } from '@prisma/client';
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { FortiGateService, type FortiGateConfig } from '@/lib/integrations/fortigate';
import { unprotectIntegrationConfig } from '@/lib/security/integration-credentials';
import {
  fortiGateTargetSelectorFromUrl,
  normalizeFortiGateVdom as normalizeTargetVdom,
  type FortiGateTargetSelector,
} from './target';

export { fortiGateTargetSelectorFromUrl } from './target';
export type { FortiGateTargetSelector } from './target';

export type FortiGateTarget = {
  configId: string;
  vdom: string;
  key: string;
  host: string;
  inventoryDeviceId: string | null;
};

export type FortiGateConnector = {
  service: FortiGateService;
  integration: IntegrationConfig;
  config: FortiGateConfig;
  target: FortiGateTarget;
};

type RegistryEntry = {
  fingerprint: string;
  service: FortiGateService;
};

type PendingRegistryEntry = {
  fingerprint: string;
  service: Promise<FortiGateService>;
};

export class FortiGateConnectorError extends Error {
  constructor(
    public readonly code:
      | 'NOT_CONFIGURED'
      | 'TARGET_REQUIRED'
      | 'TARGET_NOT_FOUND'
      | 'TARGET_DISABLED'
      | 'INVALID_CONFIG'
      | 'INVALID_VDOM',
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'FortiGateConnectorError';
  }
}

function connectorRegistry(): Map<string, RegistryEntry> {
  const globalState = globalThis as typeof globalThis & {
    __fortiGateConnectors?: Map<string, RegistryEntry>;
  };
  if (!globalState.__fortiGateConnectors) {
    globalState.__fortiGateConnectors = new Map<string, RegistryEntry>();
  }
  return globalState.__fortiGateConnectors;
}

function pendingConnectorRegistry(): Map<string, PendingRegistryEntry> {
  const globalState = globalThis as typeof globalThis & {
    __fortiGatePendingConnectors?: Map<string, PendingRegistryEntry>;
  };
  if (!globalState.__fortiGatePendingConnectors) {
    globalState.__fortiGatePendingConnectors = new Map<string, PendingRegistryEntry>();
  }
  return globalState.__fortiGatePendingConnectors;
}

export function normalizeFortiGateVdom(value?: string): string {
  try {
    return normalizeTargetVdom(value);
  } catch {
    throw new FortiGateConnectorError('INVALID_VDOM', 'FortiGate VDOM is invalid', 400);
  }
}

async function loadIntegration(selector: FortiGateTargetSelector): Promise<IntegrationConfig> {
  if (selector.configId) {
    const integration = await prisma.integrationConfig.findUnique({
      where: { id: selector.configId },
    });
    if (!integration || integration.type !== 'FORTIGATE') {
      throw new FortiGateConnectorError('TARGET_NOT_FOUND', 'FortiGate target not found', 404);
    }
    if (!integration.enabled && !selector.includeDisabled) {
      throw new FortiGateConnectorError('TARGET_DISABLED', 'FortiGate target is disabled', 409);
    }
    return integration;
  }

  const integrations = await prisma.integrationConfig.findMany({
    where: {
      type: 'FORTIGATE',
      ...(selector.includeDisabled ? {} : { enabled: true }),
    },
    orderBy: { createdAt: 'asc' },
    take: 2,
  });
  if (integrations.length === 0) {
    throw new FortiGateConnectorError('NOT_CONFIGURED', 'FortiGate integration not configured', 404);
  }
  if (integrations.length > 1) {
    throw new FortiGateConnectorError(
      'TARGET_REQUIRED',
      'Multiple FortiGate targets are configured; configId is required',
      409
    );
  }
  return integrations[0];
}

export async function resolveFortiGateTarget(
  selector: FortiGateTargetSelector = {}
): Promise<Omit<FortiGateConnector, 'service'>> {
  const integration = await loadIntegration(selector);
  const storedConfig = unprotectIntegrationConfig<FortiGateConfig & { vdom?: string; deviceId?: string }>(
    integration.config,
    'FORTIGATE'
  );
  if (!storedConfig.host?.trim()) {
    throw new FortiGateConnectorError('INVALID_CONFIG', 'FortiGate host is not configured', 422);
  }

  const vdom = normalizeFortiGateVdom(selector.vdom || storedConfig.vdom);
  const targetKey = `${integration.id}:${vdom}`;
  const persistentConnector = await prisma.firewallConnector.findUnique({
    where: {
      integrationConfigId_vdom: {
        integrationConfigId: integration.id,
        vdom,
      },
    },
    select: { deviceId: true, managementHost: true },
  });
  const configuredDeviceId = persistentConnector?.deviceId || storedConfig.deviceId?.trim() || null;
  const inventoryDevice = configuredDeviceId
    ? await prisma.device.findUnique({ where: { id: configuredDeviceId }, select: { id: true } })
    : await prisma.device.findFirst({
        where: {
          OR: [
            { fortiDeviceId: targetKey },
            ...(vdom === 'root' ? [{ fortiDeviceId: storedConfig.host }] : []),
          ],
        },
        select: { id: true },
      });

  const config: FortiGateConfig = {
    ...storedConfig,
    host: (persistentConnector?.managementHost || storedConfig.host).trim(),
    accessToken: storedConfig.accessToken || '',
    pollingInterval: storedConfig.pollingInterval || integration.syncInterval || 5,
    syncMode: storedConfig.syncMode || 'rest',
    enabledModules: storedConfig.enabledModules || {
      interfaces: true,
      vlans: true,
      policies: true,
      addresses: true,
      vips: true,
      sdwan: true,
    },
    integrationConfigId: integration.id,
    deviceId: inventoryDevice?.id || configuredDeviceId || undefined,
    vdom,
    targetKey,
  };

  return {
    integration,
    config,
    target: {
      configId: integration.id,
      vdom,
      key: targetKey,
      host: config.host,
      inventoryDeviceId: inventoryDevice?.id || null,
    },
  };
}

export async function getFortiGateConnector(
  selector: FortiGateTargetSelector = {}
): Promise<FortiGateConnector> {
  const resolved = await resolveFortiGateTarget(selector);
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(resolved.config))
    .digest('hex');
  const registry = connectorRegistry();
  const existing = registry.get(resolved.target.key);
  if (existing?.fingerprint === fingerprint) {
    return { ...resolved, service: existing.service };
  }

  const pendingRegistry = pendingConnectorRegistry();
  const pending = pendingRegistry.get(resolved.target.key);
  if (pending?.fingerprint === fingerprint) {
    return { ...resolved, service: await pending.service };
  }

  const servicePromise = (async () => {
    if (pending) await pending.service;
    const stale = registry.get(resolved.target.key);
    if (stale && stale.fingerprint !== fingerprint) {
      await stale.service.dispose();
    }
    const service = new FortiGateService(resolved.config);
    registry.set(resolved.target.key, { fingerprint, service });
    return service;
  })();
  const pendingEntry = { fingerprint, service: servicePromise };
  pendingRegistry.set(resolved.target.key, pendingEntry);
  const service = await servicePromise.finally(() => {
    if (pendingRegistry.get(resolved.target.key) === pendingEntry) {
      pendingRegistry.delete(resolved.target.key);
    }
  });
  return { ...resolved, service };
}

export function createEphemeralFortiGateConnector(
  config: FortiGateConfig
): FortiGateService {
  const vdom = normalizeFortiGateVdom(config.vdom);
  return new FortiGateService({
    ...config,
    vdom,
    targetKey: `ephemeral:${config.host}:${vdom}`,
  });
}

export async function clearFortiGateConnectors(targetKey?: string): Promise<void> {
  const registry = connectorRegistry();
  const pendingRegistry = pendingConnectorRegistry();
  if (targetKey) {
    await pendingRegistry.get(targetKey)?.service.catch(() => undefined);
    const existing = registry.get(targetKey);
    if (existing) await existing.service.dispose();
    registry.delete(targetKey);
    return;
  }

  await Promise.allSettled([...pendingRegistry.values()].map((entry) => entry.service));
  await Promise.all([...registry.values()].map((entry) => entry.service.dispose()));
  registry.clear();
}
