import type { FortiGateService } from '@/lib/integrations/fortigate';
import { prisma } from '@/lib/prisma';
import { getFortiGateConnector } from './connector-factory';
import {
  availableFirewallData,
  staleFirewallData,
  unavailableFirewallData,
  type FirewallDataEnvelope,
} from './capabilities';
import { classifyFortiGateError } from './errors';

export class FirewallReadTargetError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'FirewallReadTargetError';
  }
}

type FirewallReadContext = Awaited<ReturnType<typeof loadFirewallReadContext>>;
type StaleSnapshot<T> = { data: T; collectedAt: string } | null;

async function loadFirewallReadContext(connectorId: string) {
  const connector = await prisma.firewallConnector.findUnique({
    where: { id: connectorId },
    include: { device: true, integrationConfig: true },
  });
  if (!connector) throw new FirewallReadTargetError('Firewall connector not found', 404);
  return connector;
}

export async function executeFirewallRestRead<T>(params: {
  connectorId: string;
  read: (service: FortiGateService) => Promise<T>;
  stale?: (context: FirewallReadContext) => Promise<StaleSnapshot<T>>;
}): Promise<{
  target: {
    connectorId: string;
    deviceId: string;
    configId: string;
    vdom: string;
    monitoringMode: string;
  };
  envelope: FirewallDataEnvelope<T>;
}> {
  const context = await loadFirewallReadContext(params.connectorId);
  const target = {
    connectorId: context.id,
    deviceId: context.deviceId,
    configId: context.integrationConfigId,
    vdom: context.vdom,
    monitoringMode: context.monitoringMode,
  };

  try {
    const { service } = await getFortiGateConnector({
      configId: context.integrationConfigId,
      vdom: context.vdom,
    });
    const data = await params.read(service);
    return { target, envelope: availableFirewallData(data, 'fortigate-rest') };
  } catch (error) {
    const classified = classifyFortiGateError(error);
    if (params.stale) {
      try {
        const snapshot = await params.stale(context);
        if (snapshot) {
          return {
            target,
            envelope: staleFirewallData(
              snapshot.data,
              'database',
              snapshot.collectedAt,
              classified.message,
              classified.code
            ),
          };
        }
      } catch (snapshotError) {
        console.error('Firewall stale snapshot load failed:', snapshotError);
      }
    }
    return {
      target,
      envelope: unavailableFirewallData('fortigate-rest', classified.message, {
        errorCode: classified.code,
        retryable: classified.retryable,
      }),
    };
  }
}
