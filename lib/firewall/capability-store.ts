import { prisma } from '@/lib/prisma';
import {
  evaluateFirewallMonitoringState,
  parseFirewallCapabilityStates,
  upsertFirewallCapabilityState,
  type FirewallCapabilityState,
  type FirewallCapabilityStatus,
  type FirewallDataSource,
} from './capabilities';

export async function persistFirewallCapability(params: {
  connectorId: string;
  source: FirewallDataSource;
  status: FirewallCapabilityStatus;
  capabilities: string[];
  checkedAt?: string;
  lastSuccessAt?: string | null;
  reason?: string;
}): Promise<void> {
  try {
    const connector = await prisma.firewallConnector.findUnique({
      where: { id: params.connectorId },
      select: { capabilities: true },
    });
    if (!connector) return;
    const checkedAt = params.checkedAt || new Date().toISOString();
    const previous = parseFirewallCapabilityStates(connector.capabilities);
    const previousSource = previous.find((item) => item.source === params.source);
    const next: FirewallCapabilityState = {
      source: params.source,
      status: params.status,
      checkedAt,
      lastSuccessAt: params.lastSuccessAt !== undefined
        ? params.lastSuccessAt
        : params.status === 'available'
          ? checkedAt
          : previousSource?.lastSuccessAt || null,
      capabilities: params.capabilities,
      reason: params.reason,
    };
    const sources = upsertFirewallCapabilityState(previous, next);
    const monitoring = evaluateFirewallMonitoringState(sources, checkedAt);
    await prisma.firewallConnector.update({
      where: { id: params.connectorId },
      data: {
        capabilities: JSON.parse(JSON.stringify(sources)),
        monitoringMode: monitoring.mode,
      },
    });
  } catch (error) {
    console.error('Firewall capability persistence failed:', error);
  }
}
