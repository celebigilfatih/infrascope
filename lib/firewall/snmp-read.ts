import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  availableFirewallData,
  staleFirewallData,
  unavailableFirewallData,
  type FirewallDataEnvelope,
} from './capabilities';
import { persistFirewallCapability } from './capability-store';
import type { FirewallListQuery, FirewallListResult } from './read-query';
import { FirewallReadTargetError } from './read-service';

const MIN_FRESH_MS = 2 * 60 * 1000;
const MAX_FRESH_MS = 5 * 60 * 1000;
const STALE_WINDOW_MS = 15 * 60 * 1000;
const SNMP_CAPABILITIES = ['reachability', 'uptime', 'cpu', 'memory', 'temperature', 'interfaces'];

type SnmpTarget = {
  connectorId: string;
  deviceId: string;
  nmsDeviceId: number | null;
  vdom: string;
  monitoringMode: string;
};

export type FirewallSnmpHealth = {
  reachable: true;
  uptimeSeconds: number | null;
  cpuUsage: number | null;
  memoryUsage: number | null;
  temperature: number | null;
};

export type FirewallSnmpInterface = {
  index: number;
  name: string;
  description: string | null;
  adminStatus: string;
  operStatus: string;
  monitored: boolean;
  speed: string;
  inOctets: string;
  outOctets: string;
  inErrors: number;
  outErrors: number;
  mtu: number;
  lastPolledAt: string;
};

async function loadSnmpContext(connectorId: string) {
  const connector = await prisma.firewallConnector.findUnique({
    where: { id: connectorId },
    select: {
      id: true,
      deviceId: true,
      vdom: true,
      monitoringMode: true,
      device: {
        select: {
          nmsDeviceId: true,
          pollingEnabled: true,
          pollingInterval: true,
          snmpVersion: true,
          snmpCommunity: true,
          snmpV3Username: true,
          snmpV3SecurityLevel: true,
          snmpV3AuthPassword: true,
          snmpV3PrivacyPassword: true,
        },
      },
    },
  });
  if (!connector) throw new FirewallReadTargetError('Firewall connector not found', 404);
  return connector;
}

function targetFromContext(context: Awaited<ReturnType<typeof loadSnmpContext>>): SnmpTarget {
  return {
    connectorId: context.id,
    deviceId: context.deviceId,
    nmsDeviceId: context.device.nmsDeviceId,
    vdom: context.vdom,
    monitoringMode: context.monitoringMode,
  };
}

function freshWindowMs(pollingInterval: number | null): number {
  return Math.min(
    Math.max((pollingInterval || 30) * 3 * 1000, MIN_FRESH_MS),
    MAX_FRESH_MS
  );
}

function collectedStatus(collectedAt: Date, pollingInterval: number | null) {
  const ageMs = Date.now() - collectedAt.getTime();
  return ageMs <= freshWindowMs(pollingInterval)
    ? 'available' as const
    : ageMs <= STALE_WINDOW_MS
      ? 'stale' as const
      : 'unavailable' as const;
}

async function unavailableForConfiguration<T>(
  context: Awaited<ReturnType<typeof loadSnmpContext>>,
  reason: string,
  status: 'unconfigured' | 'unavailable'
): Promise<{ target: SnmpTarget; envelope: FirewallDataEnvelope<T> }> {
  await persistFirewallCapability({
    connectorId: context.id,
    source: 'snmp',
    status,
    capabilities: SNMP_CAPABILITIES,
    reason,
  });
  return {
    target: targetFromContext(context),
    envelope: unavailableFirewallData('snmp', reason, { retryable: status !== 'unconfigured' }),
  };
}

function validateSnmpConfiguration<T>(
  context: Awaited<ReturnType<typeof loadSnmpContext>>
): Promise<{ target: SnmpTarget; envelope: FirewallDataEnvelope<T> }> | null {
  if (!context.device.nmsDeviceId || !context.device.pollingEnabled) {
    return unavailableForConfiguration<T>(context, 'SNMP polling is not configured for this firewall', 'unconfigured');
  }
  const version = (context.device.snmpVersion || '2c').toLowerCase();
  if (['3', 'v3'].includes(version)) {
    if (!context.device.snmpV3Username || !context.device.snmpV3AuthPassword) {
      return unavailableForConfiguration<T>(context, 'SNMPv3 authentication is not configured', 'unconfigured');
    }
    if (
      context.device.snmpV3SecurityLevel === 'authPriv'
      && !context.device.snmpV3PrivacyPassword
    ) {
      return unavailableForConfiguration<T>(context, 'SNMPv3 privacy is not configured', 'unconfigured');
    }
    return null;
  }
  if (!['1', 'v1', '2c', 'v2c'].includes(version) || !context.device.snmpCommunity) {
    return unavailableForConfiguration<T>(context, 'SNMP community is not configured', 'unconfigured');
  }
  return null;
}

async function persistMetricStatus(params: {
  connectorId: string;
  status: 'available' | 'stale' | 'unavailable';
  collectedAt: Date;
  reason?: string;
}) {
  await persistFirewallCapability({
    connectorId: params.connectorId,
    source: 'snmp',
    status: params.status,
    capabilities: SNMP_CAPABILITIES,
    lastSuccessAt: params.status === 'unavailable' ? undefined : params.collectedAt.toISOString(),
    reason: params.reason,
  });
}

export async function readFirewallSnmpHealth(connectorId: string): Promise<{
  target: SnmpTarget;
  envelope: FirewallDataEnvelope<FirewallSnmpHealth>;
}> {
  const context = await loadSnmpContext(connectorId);
  const invalid = validateSnmpConfiguration<FirewallSnmpHealth>(context);
  if (invalid) return invalid;
  const latest = await prisma.nmsHealthMetric.findFirst({
    where: { nmsDeviceId: context.device.nmsDeviceId! },
    orderBy: { collectedAt: 'desc' },
  });
  if (!latest) {
    return unavailableForConfiguration(context, 'No SNMP health metric has been collected yet', 'unavailable');
  }
  const data: FirewallSnmpHealth = {
    reachable: true,
    uptimeSeconds: latest.uptimeSeconds,
    cpuUsage: latest.cpuUsage,
    memoryUsage: latest.memoryUsage,
    temperature: latest.temperature,
  };
  const status = collectedStatus(latest.collectedAt, context.device.pollingInterval);
  if (status === 'available') {
    await persistMetricStatus({ connectorId: context.id, status, collectedAt: latest.collectedAt });
    return {
      target: targetFromContext(context),
      envelope: availableFirewallData(data, 'snmp', latest.collectedAt.toISOString()),
    };
  }
  if (status === 'stale') {
    const reason = 'SNMP health data is older than the expected polling window';
    await persistMetricStatus({ connectorId: context.id, status, collectedAt: latest.collectedAt, reason });
    return {
      target: targetFromContext(context),
      envelope: staleFirewallData(data, 'snmp', latest.collectedAt.toISOString(), reason),
    };
  }
  await persistMetricStatus({
    connectorId: context.id,
    status,
    collectedAt: latest.collectedAt,
    reason: 'SNMP health data has expired',
  });
  return {
    target: targetFromContext(context),
    envelope: unavailableFirewallData('snmp', 'SNMP health data has expired', { retryable: true }),
  };
}

export async function readFirewallSnmpInterfaces(params: {
  connectorId: string;
  query: FirewallListQuery;
}): Promise<{
  target: SnmpTarget;
  envelope: FirewallDataEnvelope<FirewallListResult<FirewallSnmpInterface>>;
}> {
  const context = await loadSnmpContext(params.connectorId);
  const invalid = validateSnmpConfiguration<FirewallListResult<FirewallSnmpInterface>>(context);
  if (invalid) return invalid;
  const nmsDeviceId = context.device.nmsDeviceId!;
  const latest = await prisma.nmsInterface.aggregate({
    where: { nmsDeviceId },
    _max: { lastPolledAt: true },
  });
  const collectedAt = latest._max.lastPolledAt;
  if (!collectedAt) {
    return unavailableForConfiguration(context, 'No SNMP interface metric has been collected yet', 'unavailable');
  }
  const where: Prisma.NmsInterfaceWhereInput = {
    nmsDeviceId,
    ...(params.query.search ? {
      OR: [
        { interfaceName: { contains: params.query.search, mode: 'insensitive' as const } },
        { description: { contains: params.query.search, mode: 'insensitive' as const } },
      ],
    } : {}),
    ...(params.query.filters.link && ['up', 'down'].includes(params.query.filters.link)
      ? { operStatus: params.query.filters.link }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.nmsInterface.count({ where }),
    prisma.nmsInterface.findMany({
      where,
      orderBy: { interfaceIndex: 'asc' },
      skip: (params.query.page - 1) * params.query.limit,
      take: params.query.limit,
    }),
  ]);
  const data: FirewallListResult<FirewallSnmpInterface> = {
    items: rows.map((row) => ({
      index: row.interfaceIndex,
      name: row.interfaceName,
      description: row.description,
      adminStatus: row.adminStatus,
      operStatus: row.operStatus,
      monitored: row.monitored,
      speed: row.speed.toString(),
      inOctets: row.inOctets.toString(),
      outOctets: row.outOctets.toString(),
      inErrors: row.inErrors,
      outErrors: row.outErrors,
      mtu: row.mtu,
      lastPolledAt: row.lastPolledAt.toISOString(),
    })),
    pagination: {
      page: params.query.page,
      limit: params.query.limit,
      total,
      hasMore: params.query.page * params.query.limit < total,
    },
  };
  const status = collectedStatus(collectedAt, context.device.pollingInterval);
  if (status === 'available') {
    await persistMetricStatus({ connectorId: context.id, status, collectedAt });
    return {
      target: targetFromContext(context),
      envelope: availableFirewallData(data, 'snmp', collectedAt.toISOString()),
    };
  }
  if (status === 'stale') {
    const reason = 'SNMP interface data is older than the expected polling window';
    await persistMetricStatus({ connectorId: context.id, status, collectedAt, reason });
    return {
      target: targetFromContext(context),
      envelope: staleFirewallData(data, 'snmp', collectedAt.toISOString(), reason),
    };
  }
  await persistMetricStatus({
    connectorId: context.id,
    status,
    collectedAt,
    reason: 'SNMP interface data has expired',
  });
  return {
    target: targetFromContext(context),
    envelope: unavailableFirewallData('snmp', 'SNMP interface data has expired', { retryable: true }),
  };
}
