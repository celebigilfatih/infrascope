/**
 * VMware vCenter Integration API Routes
 * 
 * GET  /api/integrations/vmware - Check connection status
 * GET  /api/integrations/vmware?type=dashboard - Get dashboard summary
 * GET  /api/integrations/vmware?type=vms - Get all VMs from vCenter
 * GET  /api/integrations/vmware?type=hosts - Get all ESXi hosts
 * GET  /api/integrations/vmware?type=clusters - Get all clusters
 * GET  /api/integrations/vmware?type=datastores - Get all datastores
 * GET  /api/integrations/vmware?type=snapshots&vmId=xxx - Get VM snapshots
 * POST /api/integrations/vmware/sync - Trigger a sync with vCenter
 * POST /api/integrations/vmware/test - Test connection
 * POST /api/integrations/vmware { action: 'vm-power', vmId, operation } - VM power control
 * POST /api/integrations/vmware { action: 'snapshot-create|delete|revert' } - Snapshot management
 */

import { NextRequest, NextResponse } from 'next/server';
import { VMwareService } from '@/lib/integrations/vmware';
import { prisma } from '@/lib/prisma';

// Helper to get VMware service instance
async function getVMwareService(): Promise<VMwareService | null> {
  const config = await prisma.integrationConfig.findFirst({
    where: { type: 'VMWARE_VCENTER', enabled: true },
  });

  if (!config) return null;

  const vmwareConfig = config.config as {
    host: string;
    username: string;
    password: string;
    thumbprint?: string;
    pollingInterval: number;
    enabledModules: {
      datacenters: boolean;
      clusters: boolean;
      hosts: boolean;
      vms: boolean;
      datastores: boolean;
    };
  };

  return new VMwareService({
    host: vmwareConfig.host,
    username: vmwareConfig.username,
    password: vmwareConfig.password,
    thumbprint: vmwareConfig.thumbprint,
    pollingInterval: vmwareConfig.pollingInterval,
    enabledModules: vmwareConfig.enabledModules,
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const vmId = searchParams.get('vmId');

    const service = await getVMwareService();
    if (!service) {
      return NextResponse.json({
        connected: false,
        error: 'VMware vCenter integration not configured',
      });
    }

    // Authenticate first
    const authenticated = await service.authenticate();
    if (!authenticated) {
      return NextResponse.json({ error: 'vCenter authentication failed' }, { status: 401 });
    }

    // Dashboard summary
    if (type === 'dashboard') {
      const [vms, hosts, clusters, datastores] = await Promise.all([
        service.fetchVMs(),
        service.fetchHosts(),
        service.fetchClusters(),
        service.fetchDatastores(),
      ]);

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

      return NextResponse.json({
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
          status: h.summary?.connectionState || 'unknown',
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
      });
    }

    // Get all VMs
    if (type === 'vms') {
      const [vms, hosts] = await Promise.all([
        service.fetchVMs(),
        service.fetchHosts(),
      ]);

      // Map hosts by moref for quick lookup
      const hostMap = new Map(hosts.map(h => [h.host.value, h.name]));

      return NextResponse.json({
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
      });
    }

    // Get all hosts
    if (type === 'hosts') {
      const [hosts, clusters] = await Promise.all([
        service.fetchHosts(),
        service.fetchClusters(),
      ]);

      // Map clusters by moref
      const clusterMap = new Map(clusters.map(c => [c.cluster.value, c.name]));

      return NextResponse.json({
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
          status: h.summary?.connectionState || 'unknown',
          overallStatus: h.summary?.overallStatus || 'unknown',
        })),
      });
    }

    // Get all clusters
    if (type === 'clusters') {
      const clusters = await service.fetchClusters();

      return NextResponse.json({
        clusters: clusters.map(c => ({
          id: c.cluster.value,
          name: c.name,
          hostCount: c.summary?.numHosts || 0,
          effectiveHosts: c.summary?.numEffectiveHosts || 0,
          totalCpu: c.summary?.totalCpu || 0,
          cpuCores: c.summary?.numCpuCores || 0,
          totalMemoryGB: Math.round((c.summary?.totalMemory || 0) / 1073741824),
        })),
      });
    }

    // Get all datastores
    if (type === 'datastores') {
      const datastores = await service.fetchDatastores();

      return NextResponse.json({
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
      });
    }

    // Get snapshots for a VM or all snapshots
    if (type === 'snapshots') {
      if (vmId) {
        // Get snapshots for a specific VM
        const snapshots = await service.getSnapshots(vmId);
        return NextResponse.json({ snapshots });
      } else {
        // Get all snapshots from all VMs (batch operation)
        const snapshots = await service.fetchAllSnapshots();
        return NextResponse.json({ snapshots });
      }
    }

    // Default: return status
    const status = await service.getStatus();
    return NextResponse.json(status);
  } catch (error) {
    console.error('VMware API error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, config } = body;

    if (action === 'test') {
      // Test connection without saving
      const vmwareConfig = config as {
        host: string;
        username: string;
        password: string;
        thumbprint?: string;
      };

      const service = new VMwareService({
        host: vmwareConfig.host,
        username: vmwareConfig.username,
        password: vmwareConfig.password,
        thumbprint: vmwareConfig.thumbprint,
        pollingInterval: 10,
        enabledModules: {
          datacenters: true,
          clusters: true,
          hosts: true,
          vms: true,
          datastores: true,
        },
      });

      const status = await service.getStatus();
      return NextResponse.json(status);
    }

    if (action === 'sync') {
      // Get the organization from request or use first one
      const organizationId = body.organizationId || 
        (await prisma.organization.findFirst())?.id;

      if (!organizationId) {
        return NextResponse.json(
          { error: 'No organization found' },
          { status: 400 }
        );
      }

      // Get VMware configuration
      const vmwareConfig = await prisma.integrationConfig.findFirst({
        where: { type: 'VMWARE_VCENTER', enabled: true },
      });

      if (!vmwareConfig) {
        return NextResponse.json(
          { error: 'VMware integration not configured' },
          { status: 400 }
        );
      }

      const configData = vmwareConfig.config as {
        host: string;
        username: string;
        password: string;
        thumbprint?: string;
        pollingInterval: number;
        enabledModules: {
          datacenters: boolean;
          clusters: boolean;
          hosts: boolean;
          vms: boolean;
          datastores: boolean;
        };
      };

      const service = new VMwareService({
        host: configData.host,
        username: configData.username,
        password: configData.password,
        thumbprint: configData.thumbprint,
        pollingInterval: configData.pollingInterval,
        enabledModules: configData.enabledModules,
      });

      // Perform sync
      const result = await service.syncToInventory(organizationId);

      // Log the sync
      await prisma.integrationSyncLog.create({
        data: {
          configId: vmwareConfig.id,
          status: result.success ? 'success' : 'failed',
          message: result.errors.length > 0 ? result.errors.join('; ') : null,
          itemsProcessed: result.hostsCreated + result.hostsUpdated + result.vmsCreated + result.vmsUpdated,
          itemsCreated: result.hostsCreated + result.vmsCreated + result.clustersCreated,
          itemsUpdated: result.hostsUpdated + result.vmsUpdated + result.clustersUpdated,
          completedAt: new Date(),
        },
      });

      // Update last sync time
      await prisma.integrationConfig.update({
        where: { id: vmwareConfig.id },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: result.success ? 'success' : 'partial',
        },
      });

      return NextResponse.json(result);
    }

    if (action === 'save-config') {
      const newConfig = config as {
        host: string;
        username: string;
        password: string;
        thumbprint?: string;
        pollingInterval: number;
        enabledModules: {
          datacenters: boolean;
          clusters: boolean;
          hosts: boolean;
          vms: boolean;
          datastores: boolean;
        };
      };

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
          config: newConfig,
          syncInterval: newConfig.pollingInterval,
        },
        update: {
          enabled: true,
          config: newConfig,
          syncInterval: newConfig.pollingInterval,
        },
      });

      return NextResponse.json({ success: true });
    }

    // VM Power Control
    if (action === 'vm-power') {
      const { vmId, operation } = body;
      if (!vmId || !operation) {
        return NextResponse.json({ error: 'vmId and operation required' }, { status: 400 });
      }

      const service = await getVMwareService();
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

      const service = await getVMwareService();
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

      const service = await getVMwareService();
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

      const service = await getVMwareService();
      if (!service) {
        return NextResponse.json({ error: 'VMware not configured' }, { status: 400 });
      }

      await service.authenticate();
      const result = await service.revertSnapshot(vmId, snapshotId);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('VMware API error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
