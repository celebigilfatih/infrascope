import { prisma } from '@/lib/prisma';
import { getFortiGateConnector } from '@/lib/firewall/connector-factory';
import { persistFirewallProbeIdentity } from '@/lib/firewall/identity';
import { classifyFortiGateError } from '@/lib/firewall/errors';
import {
  decideFirewallRestProbe,
  type FirewallProbeTrigger,
} from '@/lib/firewall/probe-policy';
import type { FortiGateService } from '@/lib/integrations/fortigate';
import { createLogger } from '@/lib/logger';

const log = createLogger('firewall-probe');
const MANUAL_PROBE_MIN_INTERVAL_MS = 30_000;

export class FirewallProbeRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super('Firewall probe was requested too recently');
    this.name = 'FirewallProbeRateLimitError';
  }
}

async function performFirewallProbe(
  connectorId: string,
  trigger: FirewallProbeTrigger
) {
  const current = await prisma.firewallConnector.findUnique({
    where: { id: connectorId },
    include: { device: true },
  });
  if (!current) throw new Error('Firewall connector not found');
  if (trigger === 'manual' && current.lastProbeAt) {
    const elapsed = Date.now() - current.lastProbeAt.getTime();
    if (elapsed < MANUAL_PROBE_MIN_INTERVAL_MS) {
      throw new FirewallProbeRateLimitError(
        Math.max(1, Math.ceil((MANUAL_PROBE_MIN_INTERVAL_MS - elapsed) / 1000))
      );
    }
  }

  let status: Awaited<ReturnType<FortiGateService['getStatus']>>;
  const startedAt = Date.now();
  try {
    const { service } = await getFortiGateConnector({
      configId: current.integrationConfigId,
      vdom: current.vdom,
    });
    status = await service.getStatus();
  } catch (error) {
    const classified = classifyFortiGateError(error);
    log.warn({ connectorId, trigger, code: classified.code }, 'Firewall connector probe failed');
    status = {
      connected: false,
      error: classified.message,
      errorCode: classified.code,
      retryable: classified.retryable,
    };
  }

  const checkedAt = new Date();
  const decision = decideFirewallRestProbe({
    previousCapabilities: current.capabilities,
    status,
    checkedAt,
    latencyMs: Date.now() - startedAt,
    trigger,
  });
  const monitoring = decision.monitoring;
  const connector = await persistFirewallProbeIdentity({
    connectorId: current.id,
    serial: status.serial,
    monitoring,
    errorCode: status.errorCode,
    nextProbeAt: decision.nextProbeAt,
  });
  const currentMetadata = current.device.metadata && typeof current.device.metadata === 'object'
    ? current.device.metadata as Record<string, unknown>
    : {};
  const statusSnapshot = status.connected
    ? {
        data: JSON.parse(JSON.stringify(status)),
        collectedAt: new Date().toISOString(),
      }
    : currentMetadata.firewallStatusSnapshot;
  const device = await prisma.device.update({
    where: { id: current.deviceId },
    data: {
      status: status.connected ? 'ACTIVE' : current.device.status,
      // A conflicting probe candidate must never overwrite the verified inventory identity.
      serialNumber: connector.serialNumber || current.device.serialNumber || undefined,
      model: status.model || undefined,
      firmwareVersion: status.version || undefined,
      metadata: {
        ...currentMetadata,
        connectorState: 'PROBED',
        integrationConfigId: current.integrationConfigId,
        managementHost: current.managementHost,
        vdom: current.vdom,
        firewallMonitoring: JSON.parse(JSON.stringify(monitoring)),
        ...(statusSnapshot ? { firewallStatusSnapshot: statusSnapshot } : {}),
      },
    },
  });
  await prisma.integrationConfig.update({
    where: { id: current.integrationConfigId },
    data: {
      lastSyncAt: status.connected ? new Date() : undefined,
      lastSyncStatus: status.connected
        ? 'connected'
        : `unavailable:${status.errorCode || 'UNKNOWN'}`,
    },
  });

  log.info({
    connectorId,
    trigger,
    connected: status.connected,
    monitoringMode: monitoring.mode,
    consecutiveFailures: decision.consecutiveFailures,
    nextProbeAt: decision.nextProbeAt.toISOString(),
    latencyMs: Date.now() - startedAt,
  }, 'Firewall connector probe completed');

  return {
    connector,
    device,
    monitoring,
    status,
    consecutiveFailures: decision.consecutiveFailures,
    nextProbeAt: decision.nextProbeAt,
  };
}

type FirewallProbeResult = Awaited<ReturnType<typeof performFirewallProbe>>;

function inFlightProbes(): Map<string, Promise<FirewallProbeResult>> {
  const state = globalThis as typeof globalThis & {
    __infrascopeFirewallProbes?: Map<string, Promise<FirewallProbeResult>>;
  };
  if (!state.__infrascopeFirewallProbes) {
    state.__infrascopeFirewallProbes = new Map();
  }
  return state.__infrascopeFirewallProbes;
}

export async function probeFirewallConnector(
  connectorId: string,
  options: { trigger?: FirewallProbeTrigger } = {}
): Promise<FirewallProbeResult> {
  const registry = inFlightProbes();
  const existing = registry.get(connectorId);
  if (existing) return existing;

  const trigger = options.trigger || 'manual';
  const pending = performFirewallProbe(connectorId, trigger);
  registry.set(connectorId, pending);
  try {
    return await pending;
  } finally {
    if (registry.get(connectorId) === pending) registry.delete(connectorId);
  }
}
