import type { Prisma } from '@prisma/client';
/**
 * VMware vCenter Integration API Routes
 * 
 * GET  /api/integrations/vmware - Check connection status
 * GET  /api/integrations/vmware?type=dashboard - Get dashboard summary
 * GET  /api/integrations/vmware?type=vms - Get all VMs from vCenter
 * GET  /api/integrations/vmware?type=hosts - Get all ESXi hosts
 * GET  /api/integrations/vmware?type=clusters - Get all clusters
 * GET  /api/integrations/vmware?type=cluster-workspace - Cluster membership, health and resources
 * GET  /api/integrations/vmware?type=host-workspace - ESXi health, membership and usage
 * GET  /api/integrations/vmware?type=vm-workspace - VM power, runtime host and usage
 * GET  /api/integrations/vmware?type=datastores - Get all datastores
 * GET  /api/integrations/vmware?type=datastore-workspace - Datastore capacity and ESXi mounts
 * GET  /api/integrations/vmware?type=snapshots&vmId=xxx - Get VM snapshots
 * GET  /api/integrations/vmware?type=snapshot-workspace - Snapshot dates and associated files
 * POST /api/integrations/vmware/sync - Trigger a sync with vCenter
 * POST /api/integrations/vmware/test - Test connection
 * POST /api/integrations/vmware { action: 'vm-power', vmId, operation } - VM power control
 * POST /api/integrations/vmware { action: 'snapshot-create|delete|revert' } - Snapshot management
 */

import { NextRequest, NextResponse } from 'next/server';
import { authorizeApiRequest, forbiddenApiPermission } from '@/lib/auth/api-permission';
import { canAccessSync } from '@/lib/auth/permission-policy';
import { VMwareService, type VMwareHost } from '@/lib/integrations/vmware';
import { createSavedVMwareSource } from '@/lib/integrations/vmware-source';
import { getVMwareCacheScope, invalidateVMwareCache, loadVMwareCachedValue, vmwareResourceKey } from '@/lib/integrations/vmware-cache';
import { prisma } from '@/lib/prisma';
import { recordInventorySync } from '@/lib/integrations/sync-log';
import { InventorySyncBusyError, withInventorySync } from '@/lib/integrations/sync-coordinator';
import { InventorySourceSelectionError, selectInventorySource } from '@/lib/integrations/inventory-source-selection';
import { protectIntegrationConfig, unprotectIntegrationConfig } from '@/lib/security/integration-credentials';
import { isVMwarePythonError, vmwareCollectionErrorMessage } from '@/lib/integrations/vmware-python';
import { validateBody } from '@/lib/validators';
import { vmwareTestSchema, vmwareSaveConfigSchema } from '@/lib/validators/integrations';

// Helper: Get capacity trends from time series data
async function getCapacityTrends(days: number, sourceScope: string) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const metrics = await prisma.capacityMetric.findMany({
    where: { sourceScope, timestamp: { gte: since } },
    orderBy: { timestamp: 'asc' },
  });

  // Group by resource and calculate trend
  const grouped = new Map<string, Array<{ timestamp: Date; value: number }>>;
  for (const m of metrics) {
    const key = `${m.resourceType}:${m.resourceId}:${m.metricType}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push({ timestamp: m.timestamp, value: m.value });
  }

  const trends = [];
  for (const [key, data] of grouped) {
    const [resourceType, resourceId, metricType] = key.split(':');
    const resourceName = data.length > 0 ? metrics.find(m => m.resourceId === resourceId)?.resourceName || '' : '';

    if (data.length < 2) continue;

    const recent = data.slice(-Math.floor(data.length / 2));
    const older = data.slice(0, Math.floor(data.length / 2));

    const recentAvg = recent.reduce((sum, d) => sum + d.value, 0) / recent.length;
    const olderAvg = older.reduce((sum, d) => sum + d.value, 0) / older.length;
    const trendPercent = recentAvg - olderAvg;

    const status = recentAvg >= 85 ? 'critical' : recentAvg >= 70 ? 'warning' : 'normal';

    trends.push({
      resourceType,
      resourceId,
      resourceName,
      metricType,
      currentValue: recentAvg.toFixed(2),
      trendPercent: trendPercent.toFixed(2),
      status,
      dataPoints: data.map(d => ({
        timestamp: d.timestamp.toISOString(),
        value: d.value.toFixed(2),
      })),
    });
  }

  return trends;
}

// Helper: Growth forecast with linear regression
async function getGrowthForecast(sourceScope: string) {
  const days = 30;
  const since = new Date();
  since.setDate(since.getDate() - days);

  const metrics = await prisma.capacityMetric.findMany({
    where: { sourceScope, timestamp: { gte: since } },
    orderBy: { timestamp: 'asc' },
  });

  const grouped = new Map<string, Array<{ timestamp: Date; value: number; total?: number }>>();
  for (const m of metrics) {
    const key = `${m.resourceType}:${m.resourceId}:${m.metricType}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push({ timestamp: m.timestamp, value: m.value, total: m.total || undefined });
  }

  const forecasts = [];
  for (const [key, data] of grouped) {
    const [resourceType, resourceId, metricType] = key.split(':');
    const resourceName = data.length > 0 ? metrics.find(m => m.resourceId === resourceId)?.resourceName || '' : '';

    if (data.length < 3) continue;

    // Linear regression: y = a*x + b
    const n = data.length;
    const timestamps = data.map((d, i) => i); // 0, 1, 2, ...
    const values = data.map(d => d.value);

    const sumX = timestamps.reduce((sum, x) => sum + x, 0);
    const sumY = values.reduce((sum, y) => sum + y, 0);
    const sumXY = timestamps.reduce((sum, x, i) => sum + x * values[i], 0);
    const sumX2 = timestamps.reduce((sum, x) => sum + x * x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Current value
    const current = values[values.length - 1];

    // Predict 30/60/90 days ahead
    const predict30 = slope * (n + 30) + intercept;
    const predict60 = slope * (n + 60) + intercept;
    const predict90 = slope * (n + 90) + intercept;

    // Days until 100% (if disk)
    let daysUntilFull = null;
    if (metricType === 'disk' && slope > 0.01) { // Min 0.01% daily growth
      const daysToFull = Math.ceil((100 - current) / slope);
      // Cap at reasonable limit (5 years = ~1800 days)
      if (daysToFull > 0 && daysToFull < 1800) {
        daysUntilFull = daysToFull;
      }
    }

    const status = predict30 >= 85 ? 'critical' : predict30 >= 70 ? 'warning' : 'normal';

    forecasts.push({
      resourceType,
      resourceId,
      resourceName,
      metricType,
      current: current.toFixed(2),
      predict30: Math.min(predict30, 100).toFixed(2),
      predict60: Math.min(predict60, 100).toFixed(2),
      predict90: Math.min(predict90, 100).toFixed(2),
      growthRate: (slope * 30).toFixed(2),
      daysUntilFull,
      status,
    });
  }

  return forecasts.sort((a, b) => {
    if (a.status === 'critical' && b.status !== 'critical') return -1;
    if (a.status === 'warning' && b.status === 'normal') return -1;
    return 0;
  });
}

// Helper to get VMware service instance
async function getVMwareSource(configId?: unknown) {
  const integration = await selectInventorySource('VMWARE_VCENTER', configId);
  return integration ? createSavedVMwareSource(integration) : null;
}

async function getVMwareService(configId?: unknown): Promise<VMwareService | null> {
  return (await getVMwareSource(configId))?.service ?? null;
}

class VMwareSourceResponse extends Error {
  readonly code = 'VMWARE_SOURCE_RESPONSE';
  constructor(readonly response: NextResponse) { super('VMware source request failed'); }
}

function isVMwareSourceResponse(error: unknown): error is VMwareSourceResponse {
  return typeof error === 'object' && error !== null && 'code' in error &&
    error.code === 'VMWARE_SOURCE_RESPONSE' && 'response' in error && error.response instanceof NextResponse;
}

async function readVMwareData(request: NextRequest, service: VMwareService, scope: string, authenticated = false, hosts?: VMwareHost[], isCurrent = () => true): Promise<unknown> {
  const response = await loadVMwareData(request, service, scope, authenticated, hosts, isCurrent);
  if (!response.ok) throw new VMwareSourceResponse(response);
  return response.json();
}


export async function GET(request: NextRequest) {
  const access = await authorizeApiRequest(request, 'devices', 'read');
  if (!access.allowed) return access.response;
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    if (['collect-metrics', 'test-events-api', 'test-soap-events'].includes(type || '')) {
      return NextResponse.json({ success: false, error: 'Bu işlem POST isteği gerektiriyor.' }, { status: 405, headers: { Allow: 'POST' } });
    }
    const vmId = searchParams.get('vmId');

    // ── DB-only routes (no vCenter auth needed) ──────────────────────────────
    // Get configuration — reads from DB only, never touches vCenter
    if (type === 'config') {
      const vmwareConfig = await prisma.integrationConfig.findFirst({
        where: { type: 'VMWARE_VCENTER' },
      });

      if (vmwareConfig) {
        const configData = vmwareConfig.config as Prisma.JsonObject;
        return NextResponse.json({
          config: {
            host: configData.host || '',
            username: configData.username || '',
            password: configData.password ? '********' : '',  // masked — non-empty means password is stored
            thumbprint: configData.thumbprint || '',
            pollingInterval: vmwareConfig.syncInterval || 10,
            enabledModules: configData.enabledModules || {
              datacenters: true,
              clusters: true,
              hosts: true,
              vms: true,
              datastores: true,
            },
            lastSyncAt: vmwareConfig.lastSyncAt,
            lastSyncStatus: vmwareConfig.lastSyncStatus,
          },
        });
      }

      return NextResponse.json({ config: null });
    }

    // Resolve the active profile before any cache read. Application authorization remains above.
    const source = await getVMwareSource(request.nextUrl.searchParams.get('configId') ?? undefined);
    if (!source) {
      return NextResponse.json({ connected: false, error: 'VMware vCenter integration not configured' });
    }
    const cacheable = ['dashboard', 'summary', 'vms', 'vm-workspace', 'hosts', 'host-workspace', 'clusters', 'cluster-workspace', 'datastores', 'datastore-workspace', 'snapshots', 'snapshot-workspace'].includes(type || '');
    if (!cacheable) return await loadVMwareData(request, source.service, source.scope);

    const ttl = type === 'snapshots' || type === 'snapshot-workspace' ? 120_000 : 300_000;
    const result = await loadVMwareCachedValue(
      source.scope, vmwareResourceKey(type, vmId), ttl,
      isCurrent => readVMwareData(request, source.service, source.scope, false, undefined, isCurrent),
      request.headers.get('x-cache-bypass') === '1',
    );
    const write = (type === 'snapshot-workspace' || type === 'vm-workspace') && canAccessSync(access.auth.role, 'devices', 'write');
    const data = type === 'snapshot-workspace' ? { ...(result.data as Record<string, unknown>), capabilities: {
      create: write, revert: write, delete: write && canAccessSync(access.auth.role, 'devices', 'delete'),
    } } : type === 'vm-workspace' ? { ...(result.data as Record<string, unknown>), canPower: write } : result.data;
    return NextResponse.json(data, { headers: {
      'X-Cache': result.cache, 'X-Cache-Age': String(Math.round(result.age / 1000)),
    } });
  } catch (error) {
    if (error instanceof InventorySourceSelectionError) return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    if (isVMwareSourceResponse(error)) return error.response.clone();
    if (isVMwarePythonError(error)) {
      return NextResponse.json({ error: vmwareCollectionErrorMessage(error), code: error.code },
        { status: error.code === 'VMWARE_HELPER_SOURCE_TIMEOUT' ? 504 : 503 });
    }
    console.error('VMware API error:', error);
    return NextResponse.json({ error: 'VMware verileri alınamadı.' }, { status: 500 });
  }
}

async function loadVMwareData(request: NextRequest, service: VMwareService, scope: string, authenticated = false, prefetchedHosts?: VMwareHost[], isCurrent = () => true) {
    const type = request.nextUrl.searchParams.get('type');
    const vmId = request.nextUrl.searchParams.get('vmId');
    if (!authenticated && !await service.authenticate()) {
      return NextResponse.json({ error: 'vCenter kimlik doğrulaması başarısız.' }, { status: 401 });
    }

    // Lightweight summary — only VMs + Hosts, no clusters/datastores/snapshots
    // Designed for dashboard widget: returns only summary counts, ~2-3s vs 9.6s
    if (type === 'summary') {
      const [vms, hosts] = await Promise.all([
        service.fetchVMs(),
        service.fetchHosts(),
      ]);

      const vmRunning = vms.filter(v => v.summary?.guestState === 'running').length;
      const hostsOnline = hosts.filter(h => h.summary?.connectionState === 'connected').length;

      const summaryData = {
        summary: {
          vms: vms.length,
          vmRunning,
          vmStopped: vms.filter(v => v.summary?.guestState === 'notRunning').length,
          vmSuspended: vms.filter(v => v.summary?.guestState === 'suspended').length,
          hosts: hosts.length,
          hostsOnline,
          hostsOffline: hosts.filter(h => h.summary?.connectionState !== 'connected').length,
        },
      };


      return NextResponse.json(summaryData);
    }

    // Dashboard summary
    if (type === 'dashboard') {
      const [vms, hosts, clusters, datastores] = await Promise.all([
        service.fetchVMs(),
        service.fetchHosts(),
        service.fetchClusters(),
        service.fetchDatastores(),
      ]);

      // Snapshot failure invalidates this aggregate instead of claiming there are no snapshots.
      const snapshotsRaw = await service.fetchAllSnapshots({ bypassCache: true });

      // Calculate VM status counts
      const vmRunning = vms.filter(v => v.summary?.guestState === 'running').length;
      const vmStopped = vms.filter(v => v.summary?.guestState === 'notRunning').length;
      const vmSuspended = vms.filter(v => v.summary?.guestState === 'suspended').length;

      // Calculate host status counts
      const hostsOnline = hosts.filter(h => h.summary?.connectionState === 'connected').length;
      const hostsOffline = hosts.filter(h => h.summary?.connectionState !== 'connected').length;

      // Calculate total resources
      const totalCpuCores = hosts.reduce((sum, h) => sum + (h.summary?.numCpuCores || 0), 0);
      const totalMemoryGB = hosts.reduce((sum, h) => sum + ((h.summary?.memoryTotal || 0) / 1073741824), 0);
      const totalStorageTB = datastores.reduce((sum, d) => sum + ((d.summary?.capacity || 0) / 1099511627776), 0);
      const usedStorageTB = datastores.reduce((sum, d) => {
        const capacity = d.summary?.capacity || 0;
        const free = d.summary?.freeSpace || 0;
        return sum + ((capacity - free) / 1099511627776);
      }, 0);

      // Host resource utilization (average)
      const avgCpuUsage = 0; // Would need performance API
      const avgMemoryUsage = 0; // Would need performance API

      // Calculate old snapshots (> 7 days)
      const now = Date.now();
      const oldSnapshots = (snapshotsRaw || [])
        .filter((s) => {
          const ageMs = now - new Date(s.createTime).getTime();
          const ageDays = ageMs / (1000 * 60 * 60 * 24);
          return ageDays > 7;
        })
        .sort((a, b) => {
          const ageA = now - new Date(a.createTime).getTime();
          const ageB = now - new Date(b.createTime).getTime();
          return ageB - ageA; // Oldest first
        })
        .map((s) => {
          const ageMs = now - new Date(s.createTime).getTime();
          const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
          return {
            vmName: s.vmName || 'Unknown',
            name: s.name,
            ageInDays: ageDays,
            sizeGB: (s.size || 0) / 1073741824,
          };
        });

      const dashboardData = {
        summary: {
          clusters: clusters.length,
          hosts: hosts.length,
          hostsOnline,
          hostsOffline,
          vms: vms.length,
          vmRunning,
          vmStopped,
          vmSuspended,
          datastores: datastores.length,
          totalCpuCores,
          totalMemoryGB: Math.round(totalMemoryGB),
          totalStorageTB: Math.round(totalStorageTB * 10) / 10,
          usedStorageTB: Math.round(usedStorageTB * 10) / 10,
          avgCpuUsage,
          avgMemoryUsage,
        },
        hosts: hosts.map(h => ({
          id: h.host.value,
          name: h.name,
          cpuCores: h.summary?.numCpuCores || 0,
          memoryGB: Math.round((h.summary?.memoryTotal || 0) / 1073741824),
          status: (h.summary?.connectionState || 'unknown').toLowerCase(),
        })),
        datastores: datastores.map(d => ({
          id: d.datastore.value,
          name: d.name,
          capacityGB: Math.round((d.summary?.capacity || 0) / 1073741824),
          freeGB: Math.round((d.summary?.freeSpace || 0) / 1073741824),
          usedPercent: d.summary?.capacity 
            ? Math.round(((d.summary.capacity - (d.summary.freeSpace || 0)) / d.summary.capacity) * 100) 
            : 0,
          accessible: d.summary?.accessible ?? true,
        })),
        vmsByCluster: clusters.map(c => ({
          name: c.name,
          vmCount: c.host?.length || 0,
        })),
        oldSnapshots,
      };


      return NextResponse.json(dashboardData);
    }

    // Get all VMs
    if (type === 'vms') {
      const [vms, hosts] = await Promise.all([
        service.fetchVMs(),
        service.fetchHosts(),
      ]);

      // Map hosts by moref for quick lookup
      const hostMap = new Map(hosts.map(h => [h.host.value, h.name]));

      const vmsData = {
        vms: vms.map(v => ({
          id: v.vm.value,
          name: v.name,
          host: v.parent ? hostMap.get(v.parent.value) || 'Unknown' : 'Unknown',
          ip: v.summary?.ipAddress || '-',
          cpuCores: v.summary?.numCpu || 0,
          ramMB: v.summary?.memorySizeMB || 0,
          os: v.summary?.guestFullName || 'Unknown',
          status: v.summary?.guestState || 'unknown',
          powerState: v.summary?.connectionState === 'connected' 
            ? (v.summary?.guestState === 'running' ? 'poweredOn' : 'poweredOff')
            : 'unknown',
          overallStatus: v.summary?.overallStatus || 'unknown',
        })),
      };

      // Warm the same scoped loaders with the authenticated client. Hosts retain full cluster enrichment.
      for (const warmType of ['hosts', 'clusters', 'datastores']) {
        if (!isCurrent()) break;
        const url = new URL(request.url);
        url.search = '';
        url.searchParams.set('type', warmType);
        void loadVMwareCachedValue(
          scope, vmwareResourceKey(warmType), 300_000,
          () => readVMwareData(new NextRequest(url), service, scope, true, hosts),
        ).catch(() => console.warn('[VMware Cache] Background warm failed'));
      }

      return NextResponse.json(vmsData);
    }

    // Get all hosts
    if (type === 'hosts') {
      const [hosts, clusters] = await Promise.all([
        prefetchedHosts ? Promise.resolve(prefetchedHosts) : service.fetchHosts(),
        service.fetchClusters(),
      ]);

      // Map clusters by moref
      const clusterMap = new Map(clusters.map(c => [c.cluster.value, c.name]));

      const hostsData = {
        hosts: hosts.map(h => ({
          id: h.host.value,
          name: h.name,
          cluster: h.parent ? clusterMap.get(h.parent.value) || 'Standalone' : 'Standalone',
          vendor: h.summary?.vendor || 'Unknown',
          model: h.summary?.model || 'Unknown',
          cpuCores: h.summary?.numCpuCores || 0,
          memoryGB: Math.round((h.summary?.memoryTotal || 0) / 1073741824),
          version: h.config?.product?.version || 'Unknown',
          build: h.config?.product?.build || '',
          status: (h.summary?.connectionState || 'unknown').toLowerCase(),
          overallStatus: (h.summary?.overallStatus || 'unknown').toLowerCase(),
        })),
      };


      return NextResponse.json(hostsData);
    }

    if (type === 'vm-workspace') {
      const vms = await service.fetchVMWorkspace();
      return NextResponse.json({ vms, collectedAt: new Date().toISOString() });
    }

    if (type === 'host-workspace') {
      const hosts = await service.fetchHostWorkspace();
      return NextResponse.json({ hosts, collectedAt: new Date().toISOString() });
    }

    // Read-only cluster workspace; existing lightweight cluster consumers keep their contract.
    if (type === 'cluster-workspace') {
      const clusters = await service.fetchClusterWorkspace();
      return NextResponse.json({ clusters, collectedAt: new Date().toISOString() });
    }

    // Get all clusters
    if (type === 'clusters') {
      const clusters = await service.fetchClusters();

      const clustersData = {
        clusters: clusters.map(c => ({
          id: c.cluster.value,
          name: c.name,
          hostCount: c.summary?.numHosts || 0,
          effectiveHosts: c.summary?.numEffectiveHosts || 0,
          totalCpu: c.summary?.totalCpu || 0,
          cpuCores: c.summary?.numCpuCores || 0,
          totalMemoryGB: Math.round((c.summary?.totalMemory || 0) / 1073741824),
        })),
      };


      return NextResponse.json(clustersData);
    }

    if (type === 'datastore-workspace') {
      const datastores = await service.fetchDatastoreWorkspace();
      return NextResponse.json({ datastores, collectedAt: new Date().toISOString() });
    }

    // Get all datastores
    if (type === 'datastores') {
      const datastores = await service.fetchDatastores();

      const datastoresData = {
        datastores: datastores.map(d => ({
          id: d.datastore.value,
          name: d.name,
          type: d.info?.type || 'Unknown',
          capacityGB: Math.round((d.summary?.capacity || 0) / 1073741824),
          freeGB: Math.round((d.summary?.freeSpace || 0) / 1073741824),
          usedGB: Math.round(((d.summary?.capacity || 0) - (d.summary?.freeSpace || 0)) / 1073741824),
          usedPercent: d.summary?.capacity 
            ? Math.round(((d.summary.capacity - (d.summary.freeSpace || 0)) / d.summary.capacity) * 100) 
            : 0,
          accessible: d.summary?.accessible ?? true,
        })),
      };


      return NextResponse.json(datastoresData);
    }

    if (type === 'snapshot-workspace') {
      const vms = await service.fetchSnapshotWorkspace();
      return NextResponse.json({ vms, collectedAt: new Date().toISOString() });
    }

    // Get snapshots for a VM or all snapshots
    if (type === 'snapshots') {
      if (vmId) {
        // Get snapshots for a specific VM
        const snapshots = await service.getSnapshots(vmId, { bypassCache: true });
        return NextResponse.json({ snapshots });
      } else {
        // Get all snapshots from all VMs (batch operation) - SLOW, needs caching
        const snapshots = await service.fetchAllSnapshots({ bypassCache: true });
        
        
        return NextResponse.json({ snapshots });
      }
    }

    // Get configuration
    if (type === 'config') {
      const vmwareConfig = await prisma.integrationConfig.findFirst({
        where: { type: 'VMWARE_VCENTER', enabled: true },
      });
      
      if (vmwareConfig) {
        const configData = vmwareConfig.config as Prisma.JsonObject;
        return NextResponse.json({
          config: {
            host: configData.host || '',
            username: configData.username || '',
            thumbprint: configData.thumbprint || '',
            pollingInterval: vmwareConfig.syncInterval || 10,
            enabledModules: configData.enabledModules || {
              datacenters: true,
              clusters: true,
              hosts: true,
              vms: true,
              datastores: true,
            },
            lastSyncAt: vmwareConfig.lastSyncAt,
            lastSyncStatus: vmwareConfig.lastSyncStatus,
          }
        });
      }
      
      return NextResponse.json({ config: null });
    }

    // Check connection status
    if (type === 'status') {
      const vmwareConfig = await prisma.integrationConfig.findFirst({
        where: { type: 'VMWARE_VCENTER', enabled: true },
      });
      
      if (!vmwareConfig) {
        return NextResponse.json({ connected: false, error: 'VMware integration not configured' });
      }
      
      try {
        const authenticated = await service.authenticate();
        if (authenticated) {
          return NextResponse.json({ connected: true });
        } else {
          return NextResponse.json({ connected: false, error: 'Authentication failed' });
        }
      } catch (error) {
        return NextResponse.json({ connected: false, error: (error as Error).message });
      }
    }

    // Get VM sprawl analysis
    if (type === 'sprawl') {
      const sprawlResults = await service.detectVMSprawl();
      return NextResponse.json({ sprawl: sprawlResults });
    }


    // Get capacity trends
    if (type === 'capacity-trends') {
      const days = parseInt(request.nextUrl.searchParams.get('days') || '30');
      const trends = await getCapacityTrends(days, service.getInventoryScope());
      return NextResponse.json({ trends });
    }

    // Get growth forecast
    if (type === 'growth-forecast') {
      const forecast = await getGrowthForecast(service.getInventoryScope());
      return NextResponse.json({ forecast });
    }


    // Default: return status
    const status = await service.getStatus();
    return NextResponse.json(status);
}

export async function POST(request: NextRequest) {
  const access = await authorizeApiRequest(request, 'devices', 'write');
  if (!access.allowed) return access.response;
  try {
    const body = await request.json();
    const { action, config } = body;
    const resource = ['test', 'save-config', 'test-events-api', 'test-soap-events'].includes(action) ? 'settings' : 'devices';
    const operation = action === 'snapshot-delete' ? 'delete' : 'write';
    if (!canAccessSync(access.auth.role, resource, operation)) return forbiddenApiPermission(resource, operation);
    if (['collect-metrics', 'test-events-api', 'test-soap-events'].includes(action)) {
      const service = await getVMwareService(body.configId);
      if (!service) return NextResponse.json({ error: 'VMware yapılandırılmamış.' }, { status: 400 });
      if (!await service.authenticate()) {
        return NextResponse.json({ error: 'vCenter kimlik doğrulaması başarısız.' }, { status: 401 });
      }
      if (action === 'collect-metrics') return NextResponse.json(await service.collectCapacityMetrics());
      // Test Events API availability
      if (action === 'test-events-api') {
        const result = await service.testEventsAPI();
        return NextResponse.json(result);
      }

      // Test SOAP Events
      if (action === 'test-soap-events') {
        const soapAuth = await service.authenticateSOAP();
        if (!soapAuth) {
          return NextResponse.json({ error: 'SOAP authentication failed' }, { status: 401 });
        }

        // Preserve the diagnostic time window in the POST body (default: 120 minutes).
        const timeWindow = parseInt(String(body.minutes ?? 120), 10);

        // Query all events to see what's available
        const allEvents = await service.queryEventsSOAP(timeWindow);

        // Count by event type
        const eventTypeCounts: Record<string, number> = {};
        for (const evt of allEvents) {
          eventTypeCounts[evt.eventType] = (eventTypeCounts[evt.eventType] || 0) + 1;
        }

        // Query lifecycle events
        const lifecycleEvents = await service.fetchVMLifecycleEvents(timeWindow);

        // Query snapshot events
        const snapshotEvents = await service.fetchSnapshotEvents(timeWindow);

        return NextResponse.json({
          success: true,
          timeWindowMinutes: timeWindow,
          totalEvents: allEvents.length,
          eventTypes: eventTypeCounts,
          lifecycleEvents: {
            count: lifecycleEvents.length,
            events: lifecycleEvents.slice(0, 10)
          },
          snapshotEvents: {
            count: snapshotEvents.length,
            events: snapshotEvents.slice(0, 10)
          }
        });
      }

    }

    if (action === 'test') {
      // Test connection without saving
      const parsed = validateBody(config || {}, vmwareTestSchema);
      if (!parsed.success) {
        return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
      }
      const { host, username, password, thumbprint } = {
        ...parsed.data,
        thumbprint: (config as { thumbprint?: string })?.thumbprint,
      };

      const service = new VMwareService({
        host: host.replace(/^https?:\/\//i, '').replace(/\/+$/, ''),
        username,
        password,
        thumbprint,
        pollingInterval: 10,
        enabledModules: {
          datacenters: true,
          clusters: true,
          hosts: true,
          vms: true,
          datastores: true,
        },
      });

      const status = await service.testConnection();
      return NextResponse.json(status);
    }

    if (action === 'sync') {
      const vmwareConfig = await selectInventorySource('VMWARE_VCENTER', body.configId);
      if (!vmwareConfig) return NextResponse.json({ error: 'VMware integration not configured' }, { status: 400 });
      // Get the organization from request or use first one
      // Auto-create a default org if the database has none yet
      let organizationId: string | undefined = body.organizationId || 
        (await prisma.organization.findFirst())?.id;

      if (!organizationId) {
        const defaultOrg = await prisma.organization.create({
          data: {
            name: 'Default Organization',
            code: 'DEFAULT',
            description: 'Auto-created for VMware integration',
          },
        });
        organizationId = defaultOrg.id;
      }

      return await withInventorySync('VMWARE_VCENTER', vmwareConfig.id, async () => {
        const { service } = createSavedVMwareSource(vmwareConfig);

        // Perform sync and atomically record its outcome metadata.
        const startedAt = new Date();
        const result = await service.syncToInventory(organizationId);
        await recordInventorySync(vmwareConfig.id, result, startedAt);

        return NextResponse.json(result);
      });
    }

    if (action === 'save-config') {
      // Validate config with Zod
      const parsed = validateBody(config || {}, vmwareSaveConfigSchema);
      if (!parsed.success) {
        return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
      }
      // Sanitize host: strip protocol prefix and trailing slashes before saving
      const newConfig = {
        ...parsed.data,
        host: parsed.data.host.replace(/^https?:\/\//i, '').replace(/\/+$/, ''),
      };

      const previous = await prisma.integrationConfig.findFirst({
        where: { type: 'VMWARE_VCENTER', name: body.name || 'Default vCenter' },
      });
      const previousPlain = previous
        ? unprotectIntegrationConfig<typeof newConfig>(previous.config, 'VMWARE_VCENTER') : null;
      if (!newConfig.password || newConfig.password === '********') {
        newConfig.password = previousPlain?.password;
      }
      if (!newConfig.password) {
        return NextResponse.json({ success: false, error: 'VMware parolası gerekli.' }, { status: 400 });
      }
      const protectedConfig = protectIntegrationConfig<typeof newConfig>(newConfig, 'VMWARE_VCENTER');
      await prisma.integrationConfig.upsert({
        where: {
          type_name: {
            type: 'VMWARE_VCENTER',
            name: body.name || 'Default vCenter',
          },
        },
        create: {
          type: 'VMWARE_VCENTER',
          name: body.name || 'Default vCenter',
          enabled: true,
          config: protectedConfig,
          syncInterval: newConfig.pollingInterval,
        },
        update: {
          enabled: true,
          config: protectedConfig,
          syncInterval: newConfig.pollingInterval,
        },
      });

      if (previousPlain) invalidateVMwareCache(getVMwareCacheScope({ ...previousPlain, pollingInterval: previous?.syncInterval || 10 }));
      invalidateVMwareCache(getVMwareCacheScope(newConfig));
      return NextResponse.json({ success: true });
    }

    // VM Power Control
    if (action === 'vm-power') {
      const { vmId, operation } = body;
      if (!vmId || !operation) {
        return NextResponse.json({ error: 'vmId and operation required' }, { status: 400 });
      }

      const service = await getVMwareService(body.configId);
      if (!service) {
        return NextResponse.json({ error: 'VMware not configured' }, { status: 400 });
      }

      await service.authenticate();

      let result;
      switch (operation) {
        case 'on':
          result = await service.powerOnVM(vmId);
          break;
        case 'off':
          result = await service.powerOffVM(vmId);
          break;
        case 'force-off':
          result = await service.forceStopVM(vmId);
          break;
        case 'suspend':
          result = await service.suspendVM(vmId);
          break;
        case 'reset':
          result = await service.resetVM(vmId);
          break;
        default:
          return NextResponse.json({ error: 'Invalid operation' }, { status: 400 });
      }

      return NextResponse.json(result);
    }

    // Snapshot Management
    if (action === 'snapshot-create') {
      const { vmId, name, description, memory } = body;
      if (!vmId || !name) {
        return NextResponse.json({ error: 'vmId and name required' }, { status: 400 });
      }

      const service = await getVMwareService(body.configId);
      if (!service) {
        return NextResponse.json({ error: 'VMware not configured' }, { status: 400 });
      }

      await service.authenticate();
      const result = await service.createSnapshot(vmId, name, description, memory);
      return NextResponse.json(result);
    }

    if (action === 'snapshot-delete') {
      const { vmId, snapshotId } = body;
      if (!vmId || !snapshotId) {
        return NextResponse.json({ error: 'vmId and snapshotId required' }, { status: 400 });
      }

      const service = await getVMwareService(body.configId);
      if (!service) {
        return NextResponse.json({ error: 'VMware not configured' }, { status: 400 });
      }

      await service.authenticate();
      const result = await service.deleteSnapshot(vmId, snapshotId);
      return NextResponse.json(result);
    }

    if (action === 'snapshot-revert') {
      const { vmId, snapshotId } = body;
      if (!vmId || !snapshotId) {
        return NextResponse.json({ error: 'vmId and snapshotId required' }, { status: 400 });
      }

      const service = await getVMwareService(body.configId);
      if (!service) {
        return NextResponse.json({ error: 'VMware not configured' }, { status: 400 });
      }

      await service.authenticate();
      const result = await service.revertSnapshot(vmId, snapshotId);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    if (error instanceof InventorySourceSelectionError) return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    if (error instanceof InventorySyncBusyError) {
      return NextResponse.json({ error: 'Bu kaynak için senkronizasyon zaten çalışıyor.', code: error.code }, { status: 409 });
    }
    console.error('VMware API error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
