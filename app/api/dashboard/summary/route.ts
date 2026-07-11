import {
  AlarmArchiveState,
  AlarmIncidentStatus,
  AlarmSeverity2,
  DeviceStatus,
  DeviceType,
  IntegrationType,
} from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const ACTIVE_INCIDENT_STATUSES = [AlarmIncidentStatus.OPEN, AlarmIncidentStatus.ACKNOWLEDGED];
const PRIORITY_SEVERITIES = [AlarmSeverity2.ALARM_CRITICAL, AlarmSeverity2.ALARM_HIGH];
const NETWORK_TYPES = [DeviceType.SWITCH, DeviceType.ROUTER, DeviceType.FIREWALL];
const TEN_MINUTES_MS = 10 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

type SourceState = 'healthy' | 'stale' | 'error' | 'unconfigured';

function hasConfiguredHost(config: unknown): boolean {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return false;
  const host = (config as Record<string, unknown>).host;
  return typeof host === 'string' && host.trim().length > 0;
}

function integrationState(input: {
  configured: boolean;
  enabled?: boolean;
  lastSyncAt: Date | null;
  lastSyncStatus?: string | null;
  staleAfterMs: number;
}): SourceState {
  if (!input.configured || input.enabled === false) return 'unconfigured';
  if (input.lastSyncStatus === 'failed') return 'error';
  if (!input.lastSyncAt || Date.now() - input.lastSyncAt.getTime() > input.staleAfterMs) return 'stale';
  return 'healthy';
}

export async function GET() {
  try {
    const activeIncidentWhere = {
      status: { in: ACTIVE_INCIDENT_STATUSES },
      archiveState: AlarmArchiveState.HOT,
    };
    const recentNmsThreshold = new Date(Date.now() - TEN_MINUTES_MS);
    const oldSnapshotThreshold = new Date(Date.now() - SEVEN_DAYS_MS);

    const [
      deviceTotal,
      activeDevices,
      hostsTotal,
      hostsOnline,
      vmsTotal,
      vmsRunning,
      nmsTotal,
      nmsOnline,
      clusters,
      datastoreCount,
      datastoreTotals,
      topDatastores,
      problemHosts,
      offlineDevices,
      oldSnapshots,
      incidentStats,
      incidentCandidates,
      integrationConfigs,
      latestNmsDevice,
      firewallPolicyCount,
    ] = await Promise.all([
      prisma.device.count(),
      prisma.device.count({ where: { status: DeviceStatus.ACTIVE } }),
      prisma.device.count({ where: { type: DeviceType.VIRTUAL_HOST } }),
      prisma.device.count({ where: { type: DeviceType.VIRTUAL_HOST, status: DeviceStatus.ACTIVE } }),
      prisma.device.count({ where: { type: DeviceType.VIRTUAL_MACHINE } }),
      prisma.device.count({ where: { type: DeviceType.VIRTUAL_MACHINE, status: DeviceStatus.ACTIVE } }),
      prisma.device.count({ where: { pollingEnabled: true } }),
      prisma.device.count({
        where: {
          pollingEnabled: true,
          status: DeviceStatus.ACTIVE,
          lastPolledAt: { gte: recentNmsThreshold },
        },
      }),
      prisma.vMwareCluster.count(),
      prisma.vMwareDatastore.count(),
      prisma.vMwareDatastore.aggregate({ _sum: { capacity: true, freeSpace: true } }),
      prisma.vMwareDatastore.findMany({
        select: { id: true, name: true, capacity: true, freeSpace: true },
        orderBy: { freeSpace: 'asc' },
        take: 6,
      }),
      prisma.device.findMany({
        where: { type: DeviceType.VIRTUAL_HOST, status: { not: DeviceStatus.ACTIVE } },
        select: { id: true, name: true, status: true, metadata: true },
        orderBy: { name: 'asc' },
        take: 5,
      }),
      prisma.device.findMany({
        where: {
          pollingEnabled: true,
          OR: [
            { status: { not: DeviceStatus.ACTIVE } },
            { lastPolledAt: null },
            { lastPolledAt: { lt: recentNmsThreshold } },
          ],
        },
        select: { id: true, name: true, status: true, managementIp: true, lastPolledAt: true },
        orderBy: [{ lastPolledAt: 'asc' }, { name: 'asc' }],
        take: 5,
      }),
      prisma.vmSnapshot.findMany({
        where: { createdAt: { lt: oldSnapshotThreshold } },
        select: { id: true, vmId: true, name: true, createdAt: true, size: true },
        orderBy: { createdAt: 'asc' },
        take: 5,
      }),
      prisma.alarmIncident.groupBy({
        by: ['severity'],
        where: activeIncidentWhere,
        _count: { id: true },
      }),
      prisma.alarmIncident.findMany({
        where: { ...activeIncidentWhere, severity: { in: PRIORITY_SEVERITIES } },
        include: { alarm: { select: { code: true, name: true } } },
        orderBy: { lastSeenAt: 'desc' },
        take: 20,
      }),
      prisma.integrationConfig.findMany({
        where: {
          type: {
            in: [
              IntegrationType.VMWARE_VCENTER,
              IntegrationType.FORTIGATE,
              IntegrationType.FORTIANALYZER,
            ],
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.device.findFirst({
        where: { pollingEnabled: true },
        select: { lastPolledAt: true },
        orderBy: { lastPolledAt: 'desc' },
      }),
      prisma.firewallPolicy.count(),
    ]);

    const vmIds = [...new Set(oldSnapshots.map((snapshot) => snapshot.vmId))];
    const snapshotDevices = vmIds.length > 0
      ? await prisma.device.findMany({ where: { id: { in: vmIds } }, select: { id: true, name: true } })
      : [];
    const vmNames = new Map(snapshotDevices.map((device) => [device.id, device.name]));

    const severityCounts = Object.fromEntries(incidentStats.map((item) => [item.severity, item._count.id]));
    const severityRank: Record<string, number> = {
      ALARM_CRITICAL: 0,
      ALARM_HIGH: 1,
      ALARM_MEDIUM: 2,
      ALARM_LOW: 3,
      ALARM_INFO: 4,
    };
    const priorityIncidents = incidentCandidates
      .sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
      .slice(0, 5)
      .map((incident) => ({
        id: incident.id,
        code: incident.alarm.code,
        title: incident.title,
        severity: incident.severity,
        status: incident.status,
        source: incident.source,
        entityType: incident.entityType,
        entityId: incident.entityId,
        lastSeenAt: incident.lastSeenAt,
        occurrenceCount: incident.occurrenceCount,
      }));

    const configsByType = new Map<IntegrationType, typeof integrationConfigs[number]>();
    for (const config of integrationConfigs) {
      if (!configsByType.has(config.type)) configsByType.set(config.type, config);
    }

    const integrationDefinitions = [
      { type: IntegrationType.VMWARE_VCENTER, name: 'VMware vCenter', href: '/integrations/vmware' },
      { type: IntegrationType.FORTIGATE, name: 'FortiGate', href: '/integrations/firewall' },
      { type: IntegrationType.FORTIANALYZER, name: 'FortiAnalyzer', href: '/integrations/fortianalyzer' },
    ] as const;
    const integrations: Array<{
      key: string;
      name: string;
      href: string;
      state: SourceState;
      lastSyncAt: Date | null;
      message: string | null;
    }> = integrationDefinitions.map((definition) => {
      const config = configsByType.get(definition.type);
      const staleAfterMs = Math.max((config?.syncInterval ?? 5) * 3 * 60 * 1000, 15 * 60 * 1000);
      return {
        key: definition.type,
        name: definition.name,
        href: definition.href,
        state: integrationState({
          configured: Boolean(config && hasConfiguredHost(config.config)),
          enabled: config?.enabled,
          lastSyncAt: config?.lastSyncAt ?? null,
          lastSyncStatus: config?.lastSyncStatus,
          staleAfterMs,
        }),
        lastSyncAt: config?.lastSyncAt ?? null,
        message: config?.lastSyncStatus === 'failed' ? 'Son senkronizasyon başarısız' : null,
      };
    });
    integrations.push({
      key: 'NMS',
      name: 'NMS / SNMP',
      href: '/integrations/nms/devices',
      state: integrationState({
        configured: nmsTotal > 0,
        lastSyncAt: latestNmsDevice?.lastPolledAt ?? null,
        staleAfterMs: TEN_MINUTES_MS,
      }),
      lastSyncAt: latestNmsDevice?.lastPolledAt ?? null,
      message: nmsTotal > 0 && !latestNmsDevice?.lastPolledAt ? 'Henüz polling verisi alınmadı' : null,
    });

    const capacityBytes = datastoreTotals._sum.capacity ? Number(datastoreTotals._sum.capacity) : 0;
    const freeBytes = datastoreTotals._sum.freeSpace ? Number(datastoreTotals._sum.freeSpace) : 0;
    const usedBytes = Math.max(0, capacityBytes - freeBytes);
    const staleSources = integrations.filter((item) => item.state === 'stale' || item.state === 'error').length;
    const criticalCount = severityCounts.ALARM_CRITICAL ?? 0;
    const highCount = severityCounts.ALARM_HIGH ?? 0;
    const overallStatus = criticalCount > 0
      ? 'critical'
      : highCount > 0 || integrations.some((item) => item.state === 'error')
        ? 'attention'
        : staleSources > 0
          ? 'stale'
          : 'healthy';

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      posture: {
        status: overallStatus,
        critical: criticalCount,
        high: highCount,
        staleSources,
      },
      incidents: {
        total: incidentStats.reduce((sum, item) => sum + item._count.id, 0),
        critical: criticalCount,
        high: highCount,
        items: priorityIncidents,
      },
      metrics: {
        devices: { total: deviceTotal, healthy: activeDevices, unavailable: deviceTotal - activeDevices },
        hosts: { total: hostsTotal, healthy: hostsOnline, unavailable: hostsTotal - hostsOnline },
        virtualMachines: { total: vmsTotal, healthy: vmsRunning, unavailable: vmsTotal - vmsRunning },
        storage: {
          total: datastoreCount,
          capacityTB: capacityBytes / 1e12,
          usedTB: usedBytes / 1e12,
          usedPercent: capacityBytes > 0 ? Math.round((usedBytes / capacityBytes) * 100) : null,
        },
        nms: { total: nmsTotal, healthy: nmsOnline, unavailable: nmsTotal - nmsOnline },
        firewallPolicies: firewallPolicyCount,
      },
      inventory: { clusters },
      integrations,
      operations: {
        infrastructure: {
          problemHosts: problemHosts.map((host) => ({
            id: host.id,
            name: host.name,
            status: host.status,
            cpuCores: Number((host.metadata as Record<string, unknown> | null)?.cpuCores ?? (host.metadata as Record<string, unknown> | null)?.numCpu ?? 0) || null,
            memoryGB: Number((host.metadata as Record<string, unknown> | null)?.memoryGB ?? 0) || null,
          })),
          criticalDatastores: topDatastores
            .map((datastore) => {
              const capacity = Number(datastore.capacity);
              const free = Number(datastore.freeSpace);
              return {
                id: datastore.id,
                name: datastore.name,
                usedPercent: capacity > 0 ? Math.round(((capacity - free) / capacity) * 100) : 0,
              };
            })
            .filter((datastore) => datastore.usedPercent >= 80)
            .sort((a, b) => b.usedPercent - a.usedPercent),
          oldSnapshots: oldSnapshots.map((snapshot) => ({
            id: snapshot.id,
            name: snapshot.name || 'İsimsiz snapshot',
            vmName: vmNames.get(snapshot.vmId) || 'Bilinmeyen VM',
            ageInDays: Math.floor((Date.now() - snapshot.createdAt.getTime()) / (24 * 60 * 60 * 1000)),
            sizeGB: snapshot.size ? Number(snapshot.size) / 1e9 : null,
          })),
        },
        network: {
          offlineDevices: offlineDevices.map((device) => ({
            id: device.id,
            name: device.name,
            status: device.status,
            managementIp: device.managementIp,
            lastPolledAt: device.lastPolledAt,
          })),
          networkDeviceTypes: NETWORK_TYPES,
        },
      },
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    console.error('[Dashboard] Summary endpoint failed:', error);
    return NextResponse.json({ error: 'Dashboard özeti alınamadı' }, { status: 500 });
  }
}
