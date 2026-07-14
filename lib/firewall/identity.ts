import type { FirewallMonitoringState } from './capabilities';
import { prisma } from '@/lib/prisma';
import {
  buildFortiGateIdentityKey,
  decideFortiGateIdentity,
  normalizeFortiGateSerial,
} from './identity-state';

export { buildFortiGateIdentityKey, normalizeFortiGateSerial } from './identity-state';

export async function persistFirewallProbeIdentity(params: {
  connectorId: string;
  serial?: string;
  monitoring: FirewallMonitoringState;
  errorCode?: string;
  nextProbeAt?: Date;
}) {
  const connector = await prisma.firewallConnector.findUniqueOrThrow({
    where: { id: params.connectorId },
  });
  const now = new Date();
  const capabilities = JSON.parse(JSON.stringify(params.monitoring.sources));
  const commonData = {
    monitoringMode: params.monitoring.mode,
    capabilities,
    lastProbeAt: now,
    lastSuccessAt: params.monitoring.restAvailable ? now : connector.lastSuccessAt,
    nextProbeAt: params.nextProbeAt,
    lastErrorCode: params.errorCode || null,
  } as const;

  if (!params.serial) {
    return prisma.firewallConnector.update({
      where: { id: connector.id },
      data: commonData,
    });
  }

  const serialNumber = normalizeFortiGateSerial(params.serial);
  const candidateKey = buildFortiGateIdentityKey(serialNumber, connector.vdom);
  const owner = await prisma.firewallConnector.findUnique({
    where: { identityKey: candidateKey },
    select: { id: true },
  });
  const decision = decideFortiGateIdentity({
    connectorId: connector.id,
    currentIdentityKey: connector.identityKey,
    candidateKey,
    candidateOwnerId: owner?.id || null,
  });
  return prisma.firewallConnector.update({
    where: { id: connector.id },
    data: {
      ...commonData,
      serialNumber:
        decision.status === 'CONFLICT' && connector.identityKey
          ? connector.serialNumber
          : serialNumber,
      identityKey: decision.identityKey,
      identityCandidateKey: decision.identityCandidateKey,
      identityStatus: decision.status,
      identityConflictWithId: decision.identityConflictWithId,
    },
  });
}
