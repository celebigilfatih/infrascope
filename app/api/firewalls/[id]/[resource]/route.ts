import { NextRequest, NextResponse } from 'next/server';
import { FirewallIntegrationError } from '@/lib/firewall/errors';
import {
  executeFirewallRestRead,
  FirewallReadTargetError,
} from '@/lib/firewall/read-service';
import {
  firewallListQueryFromUrl,
  paginateFirewallItems,
  type FirewallListQuery,
} from '@/lib/firewall/read-query';
import { prisma } from '@/lib/prisma';

type RouteContext = { params: { id: string; resource: string } };
type FirewallPolicyReadModel = {
  policyId: number;
  name: string;
  action: string;
  sourceInterfaces: string[];
  destinationInterfaces: string[];
  sourceAddresses: string[];
  destinationAddresses: string[];
  services: string[];
  schedule: string;
  hitCount: string;
  lastUsedAt: string | null;
  enabled: boolean | null;
};

function jsonNames(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => typeof item === 'string'
        ? [item]
        : item && typeof item === 'object' && typeof (item as Record<string, unknown>).name === 'string'
          ? [(item as Record<string, unknown>).name as string]
          : [])
    : [];
}

function commaNames(value: string | null): string[] {
  return value?.split(',').map((item) => item.trim()).filter(Boolean) || [];
}

function latestTimestamp(
  values: Array<{ updatedAt: Date }>,
  fallback: Date | null
): string | null {
  const latest = values.reduce<Date | null>(
    (current, item) => !current || item.updatedAt > current ? item.updatedAt : current,
    fallback
  );
  return latest?.toISOString() || null;
}

function statusSnapshot(metadata: unknown, field?: 'ha') {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const snapshot = (metadata as Record<string, unknown>).firewallStatusSnapshot;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const record = snapshot as Record<string, unknown>;
  if (typeof record.collectedAt !== 'string' || !record.data || typeof record.data !== 'object') return null;
  const data = field ? (record.data as Record<string, unknown>)[field] : record.data;
  return data == null ? null : { data, collectedAt: record.collectedAt };
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const allowedFilters = params.resource === 'policies'
      ? ['action', 'enabled']
      : params.resource === 'addresses'
        ? ['type']
        : params.resource === 'interfaces'
          ? ['link']
          : params.resource === 'vips'
            ? ['status']
            : [];
    const query = firewallListQueryFromUrl(request.url, allowedFilters);
    const result = await readResource(params.id, params.resource, query);
    return NextResponse.json({ success: true, target: result.target, ...result.envelope });
  } catch (error) {
    if (error instanceof FirewallReadTargetError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Firewall resource read failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to read firewall resource' }, { status: 500 });
  }
}

function readResource(connectorId: string, resource: string, query: FirewallListQuery) {
  if (resource === 'status') {
    return executeFirewallRestRead({
      connectorId,
      read: async (service) => {
        const status = await service.getStatus();
        if (!status.connected) {
          throw new FirewallIntegrationError(
            status.errorCode || 'UNKNOWN',
            status.error || 'FortiGate status is unavailable',
            status.retryable || false,
            503
          );
        }
        return status;
      },
      stale: async (context) => statusSnapshot(context.device.metadata),
    });
  }
  if (resource === 'interfaces') {
    return executeFirewallRestRead({
      connectorId,
      read: async (service) => paginateFirewallItems({
        items: (await service.getInterfaceStats()).map((item) => ({
        id: item.id,
        name: item.name,
        alias: item.alias,
        macAddress: item.mac,
        ipAddress: item.ip,
        linkUp: item.link,
        speed: item.speed,
        txPackets: item.tx_packets,
        rxPackets: item.rx_packets,
        txBytes: item.tx_bytes,
        rxBytes: item.rx_bytes,
        txErrors: item.tx_errors,
        rxErrors: item.rx_errors,
        })),
        query,
        searchText: (item) => `${item.name} ${item.alias} ${item.macAddress} ${item.ipAddress}`,
        filter: (item, filters) =>
          !filters.link ||
          !['up', 'down'].includes(filters.link) ||
          (filters.link === 'up') === item.linkUp,
      }),
      stale: async (context) => {
        const rows = await prisma.networkInterface.findMany({
          where: { deviceId: context.deviceId },
          orderBy: { name: 'asc' },
        });
        const collectedAt = latestTimestamp(rows, context.integrationConfig.lastSyncAt);
        const data = rows.map((item) => ({
          id: item.id,
          name: item.name,
          alias: '',
          macAddress: item.macAddress || '',
          ipAddress: item.ipv4 || item.ipv6 || '',
          linkUp: item.status === 'UP',
          speed: 0,
          txPackets: 0,
          rxPackets: 0,
          txBytes: 0,
          rxBytes: 0,
          txErrors: 0,
          rxErrors: 0,
        }));
        return collectedAt ? {
          data: paginateFirewallItems({
            items: data,
            query,
            searchText: (item) => `${item.name} ${item.alias} ${item.macAddress} ${item.ipAddress}`,
            filter: (item, filters) =>
              !filters.link ||
              !['up', 'down'].includes(filters.link) ||
              (filters.link === 'up') === item.linkUp,
          }),
          collectedAt,
        } : null;
      },
    });
  }
  if (resource === 'policies') {
    return executeFirewallRestRead<ReturnType<typeof paginateFirewallItems<FirewallPolicyReadModel>>>({
      connectorId,
      read: async (service) => paginateFirewallItems({
        items: (await service.fetchFirewallPolicies()).map((item) => ({
          policyId: item.policyid,
          name: item.name,
          action: item.action,
          sourceInterfaces: item.srcintf.map((value) => value.name),
          destinationInterfaces: item.dstintf.map((value) => value.name),
          sourceAddresses: item.srcaddr.map((value) => value.name),
          destinationAddresses: item.dstaddr.map((value) => value.name),
          services: item.service.map((value) => value.name),
          schedule: item.schedule,
          hitCount: String(item.hit_count || 0),
          lastUsedAt: item.last_used || null,
          enabled: item.status === 'enable',
        })),
        query,
        searchText: (item) => [
          item.policyId,
          item.name,
          item.action,
          ...item.sourceInterfaces,
          ...item.destinationInterfaces,
          ...item.sourceAddresses,
          ...item.destinationAddresses,
          ...item.services,
        ].join(' '),
        filter: (item, filters) =>
          (!filters.action || item.action.toLowerCase() === filters.action) &&
          (!filters.enabled ||
            !['true', 'false'].includes(filters.enabled) ||
            item.enabled === (filters.enabled === 'true')),
      }),
      stale: async (context) => {
        const rows = await prisma.firewallPolicy.findMany({
          where: { deviceId: context.deviceId },
          orderBy: { policyId: 'asc' },
        });
        const collectedAt = latestTimestamp(rows, context.integrationConfig.lastSyncAt);
        const data = rows.map((row) => ({
          policyId: row.policyId,
          name: row.name || `Policy ${row.policyId}`,
          action: row.action,
          sourceInterfaces: commaNames(row.srcInterface),
          destinationInterfaces: commaNames(row.dstInterface),
          sourceAddresses: jsonNames(row.srcAddresses),
          destinationAddresses: jsonNames(row.dstAddresses),
          services: jsonNames(row.services),
          schedule: row.schedule || '',
          hitCount: row.hitCount.toString(),
          lastUsedAt: row.lastHit?.toISOString() || null,
          enabled: null,
        }));
        return collectedAt ? {
          data: paginateFirewallItems({
            items: data,
            query,
            searchText: (item) => [
              item.policyId,
              item.name,
              item.action,
              ...item.sourceInterfaces,
              ...item.destinationInterfaces,
              ...item.sourceAddresses,
              ...item.destinationAddresses,
              ...item.services,
            ].join(' '),
            filter: (item, filters) =>
              (!filters.action || item.action.toLowerCase() === filters.action) &&
              (!filters.enabled ||
                !['true', 'false'].includes(filters.enabled) ||
                (item.enabled !== null && item.enabled === (filters.enabled === 'true'))),
          }),
          collectedAt,
        } : null;
      },
    });
  }
  if (resource === 'addresses') {
    return executeFirewallRestRead({
      connectorId,
      read: async (service) => paginateFirewallItems({
        items: (await service.fetchAddressObjects()).map((item) => ({
          name: item.name,
          type: item.type,
          value: item.subnet || item.fqdn || item.country || '',
          associatedInterface: item.interface || null,
        })),
        query,
        searchText: (item) => `${item.name} ${item.type} ${item.value} ${item.associatedInterface || ''}`,
        filter: (item, filters) => !filters.type || item.type.toLowerCase() === filters.type,
      }),
      stale: async (context) => {
        const rows = await prisma.firewallAddress.findMany({
          where: { deviceId: context.deviceId },
          orderBy: { name: 'asc' },
        });
        const collectedAt = latestTimestamp(rows, context.integrationConfig.lastSyncAt);
        const data = rows.map((item) => ({
          name: item.name,
          type: item.type,
          value: item.value,
          associatedInterface: item.associatedInterface,
        }));
        return collectedAt ? {
          data: paginateFirewallItems({
            items: data,
            query,
            searchText: (item) => `${item.name} ${item.type} ${item.value} ${item.associatedInterface || ''}`,
            filter: (item, filters) => !filters.type || item.type.toLowerCase() === filters.type,
          }),
          collectedAt,
        } : null;
      },
    });
  }
  if (resource === 'vips') {
    return executeFirewallRestRead({
      connectorId,
      read: async (service) => paginateFirewallItems({
        items: await service.fetchVIPs(),
        query,
        searchText: (item) => `${item.name} ${item.comment} ${item.extip} ${item.mappedip.map((value) => value.range).join(' ')}`,
        filter: (item, filters) => !filters.status || item.status.toLowerCase() === filters.status,
      }),
    });
  }
  if (resource === 'ha') {
    return executeFirewallRestRead({
      connectorId,
      read: async (service) => {
        const result = await service.fetchHAStatus();
        if (!result) return null;
        const { password: _password, ...safeResult } = result;
        return safeResult;
      },
      stale: async (context) => statusSnapshot(context.device.metadata, 'ha'),
    });
  }
  throw new FirewallReadTargetError('Firewall resource not found', 404);
}
