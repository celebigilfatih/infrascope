/**
 * Zabbix Integration API Routes
 * 
 * POST /api/integrations/zabbix/sync - Trigger a sync with Zabbix
 * GET  /api/integrations/zabbix/status - Check connection status
 * POST /api/integrations/zabbix/test - Test connection
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZabbixService } from '@/lib/integrations/zabbix';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Get Zabbix configuration from database
    const config = await prisma.integrationConfig.findFirst({
      where: { type: 'ZABBIX', enabled: true },
    });

    if (!config) {
      return NextResponse.json({
        connected: false,
        error: 'Zabbix integration not configured',
      });
    }

    const zabbixConfig = config.config as {
      url: string;
      authToken: string;
      pollingInterval: number;
      enabledModules: {
        hosts: boolean;
        interfaces: boolean;
        triggers: boolean;
        items: boolean;
      };
    };

    const service = new ZabbixService({
      url: zabbixConfig.url,
      authToken: zabbixConfig.authToken,
      pollingInterval: zabbixConfig.pollingInterval,
      enabledModules: zabbixConfig.enabledModules,
    });

    const status = await service.getStatus();
    
    return NextResponse.json(status);
  } catch (error) {
    console.error('Zabbix status check failed:', error);
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
      const zabbixConfig = config as {
        url: string;
        authToken: string;
      };

      const service = new ZabbixService({
        url: zabbixConfig.url,
        authToken: zabbixConfig.authToken,
        pollingInterval: 5,
        enabledModules: {
          hosts: true,
          interfaces: true,
          triggers: true,
          items: true,
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

      // Get Zabbix configuration
      const zabbixConfig = await prisma.integrationConfig.findFirst({
        where: { type: 'ZABBIX', enabled: true },
      });

      if (!zabbixConfig) {
        return NextResponse.json(
          { error: 'Zabbix integration not configured' },
          { status: 400 }
        );
      }

      const config = zabbixConfig.config as {
        url: string;
        authToken: string;
        pollingInterval: number;
        enabledModules: {
          hosts: boolean;
          interfaces: boolean;
          triggers: boolean;
          items: boolean;
        };
      };

      const service = new ZabbixService({
        url: config.url,
        authToken: config.authToken,
        pollingInterval: config.pollingInterval,
        enabledModules: config.enabledModules,
      });

      // Perform sync
      const result = await service.syncToInventory(organizationId);

      // Log the sync
      await prisma.integrationSyncLog.create({
        data: {
          configId: zabbixConfig.id,
          status: result.success ? 'success' : 'failed',
          message: result.errors.length > 0 ? result.errors.join('; ') : null,
          itemsProcessed: result.hostsCreated + result.hostsUpdated,
          itemsCreated: result.hostsCreated,
          itemsUpdated: result.hostsUpdated,
          completedAt: new Date(),
        },
      });

      // Update last sync time
      await prisma.integrationConfig.update({
        where: { id: zabbixConfig.id },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: result.success ? 'success' : 'partial',
        },
      });

      return NextResponse.json(result);
    }

    if (action === 'save-config') {
      const newConfig = config as {
        url: string;
        authToken: string;
        pollingInterval: number;
        enabledModules: {
          hosts: boolean;
          interfaces: boolean;
          triggers: boolean;
          items: boolean;
        };
      };

      await prisma.integrationConfig.upsert({
        where: {
          type_name: {
            type: 'ZABBIX',
            name: body.name || 'Default Zabbix',
          },
        },
        create: {
          type: 'ZABBIX',
          name: body.name || 'Default Zabbix',
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
    console.error('Zabbix API error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
