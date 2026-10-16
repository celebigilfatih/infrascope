import { prisma } from '@/lib/prisma';
import { readFirewallSnmpInterfaceSnapshot } from '@/lib/firewall/snmp-read';
import { FirewallIntegrationError } from '@/lib/firewall/errors';
import type { FortiGateConfig, FortiGateInterface } from './fortigate';

function unavailable(message: string): never {
  throw new FirewallIntegrationError('UPSTREAM_UNAVAILABLE', message, true, 503);
}

/** Adapt existing NMS observations, not an HTTP/161 transport or an on-demand SNMP probe. */
export async function readFortiGateSnmpInterfaces(config: FortiGateConfig): Promise<FortiGateInterface[]> {
  try {
    return await readSnapshot(config);
  } catch (error) {
    if (error instanceof FirewallIntegrationError) throw error;
    throw new FirewallIntegrationError('UPSTREAM_UNAVAILABLE', 'NMS interface observations could not be read', true, 503,
      { cause: error });
  }
}

async function readSnapshot(config: FortiGateConfig): Promise<FortiGateInterface[]> {
  if ((config.vdom || 'root') !== 'root') {
    throw new FirewallIntegrationError('UNSUPPORTED_OPERATION',
      'VDOM-specific interface inventory is not available from device-wide NMS observations', false, 501);
  }
  if (!config.integrationConfigId || !config.deviceId) {
    return unavailable('A linked NMS firewall target is required for SNMP interface inventory');
  }
  const connector = await prisma.firewallConnector.findUnique({
    where: { integrationConfigId_vdom: { integrationConfigId: config.integrationConfigId, vdom: 'root' } },
    select: { id: true, deviceId: true },
  });
  if (!connector || connector.deviceId !== config.deviceId) {
    return unavailable('The selected firewall is not linked to its NMS inventory device');
  }
  const { envelope } = await readFirewallSnmpInterfaceSnapshot({
    connectorId: connector.id, deviceId: config.deviceId, host: config.host,
  });
  if (envelope.status !== 'available' || !envelope.data?.length) {
    return unavailable(envelope.unavailableReason || 'NMS interface observations are not available');
  }
  const indices = new Set<number>();
  const names = new Set<string>();
  return envelope.data.map(row => {
    if (!Number.isInteger(row.index) || row.index <= 0 || indices.has(row.index)
      || !row.name?.trim() || names.has(row.name) || !/^\d+$/.test(row.speed)
      || !/^\d+$/.test(row.inOctets) || !/^\d+$/.test(row.outOctets)
      || !Number.isInteger(row.mtu) || row.mtu < 0
      || !Number.isInteger(row.inErrors) || row.inErrors < 0 || !Number.isInteger(row.outErrors) || row.outErrors < 0) {
      throw new FirewallIntegrationError('INVALID_RESPONSE', 'NMS interface observation is invalid or ambiguous', false, 502);
    }
    indices.add(row.index); names.add(row.name);
    const speed = Number(row.speed);
    return {
      name: row.name, status: row.operStatus === 'up' ? 'up' : row.operStatus === 'down' ? 'down' : 'unknown',
      speed: Number.isSafeInteger(speed) ? speed : null, mtu: row.mtu,
      duplex: null, ip: null, mask: null, interface: null, type: null,
      source: 'nms', collectedAt: row.lastPolledAt, observation: row,
    };
  });
}
