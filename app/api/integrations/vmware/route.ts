/**
 * VMware vCenter Integration API Routes
 * 
 * POST /api/integrations/vmware/sync - Trigger a sync with vCenter
 * GET  /api/integrations/vmware/status - Check connection status
 * POST /api/integrations/vmware/test - Test connection
 */

import { NextRequest, NextResponse } from 'next/server';
import { VMwareService } from '@/lib/integrations/vmware';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Get VMware configuration from database
    const config = await prisma.integrationConfig.findFirst({
      where: { type: 'VMWARE_VCENTER', enabled: true },
    });

    if (!config) {
      return NextResponse.json({
        connected: false,
        error: 'VMware vCenter integration not configured',
      });
    }

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

    const service = new VMwareService({
      host: vmwareConfig.host,
      username: vmwareConfig.username,
      password: vmwareConfig.password,
      thumbprint: vmwareConfig.thumbprint,
      pollingInterval: vmwareConfig.pollingInterval,
      enabledModules: vmwareConfig.enabledModules,
    });

    const status = await service.getStatus();
    
    return NextResponse.json(status);
  } catch (error) {
    console.error('VMware status check failed:', error);
    return NextResponse.json(
      { connected: false, error: (error as Error).message },
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

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('VMware API error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
