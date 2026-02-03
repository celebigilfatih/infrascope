/**
 * FortiGate Integration API Routes
 * 
 * POST /api/integrations/fortigate/sync - Trigger a sync with FortiGate
 * GET  /api/integrations/fortigate/status - Check connection status
 * POST /api/integrations/fortigate/test - Test connection
 */

import { NextRequest, NextResponse } from 'next/server';
import { FortiGateService } from '@/lib/integrations/fortigate';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    // Get query params
    const { searchParams } = new URL(request.url);
    const vpn = searchParams.get('vpn');

    // Get FortiGate configuration from database
    const config = await prisma.integrationConfig.findFirst({
      where: { type: 'FORTIGATE', enabled: true },
    });

    if (!config) {
      return NextResponse.json({
        connected: false,
        error: 'FortiGate integration not configured',
      });
    }

    const fortiConfig = config.config as {
      host: string;
      accessToken: string;
      snmp?: {
        community: string;
        version: '2c' | '3';
      };
      pollingInterval: number;
      syncMode: 'snmp' | 'rest' | 'both';
      enabledModules: {
        interfaces: boolean;
        vlans: boolean;
        policies: boolean;
        addresses: boolean;
        vips: boolean;
        sdwan: boolean;
      };
    };

    const service = new FortiGateService({
      host: fortiConfig.host,
      accessToken: fortiConfig.accessToken,
      snmp: fortiConfig.snmp,
      pollingInterval: fortiConfig.pollingInterval,
      syncMode: fortiConfig.syncMode,
      enabledModules: fortiConfig.enabledModules,
    });

    // Return VPN data if requested
    if (vpn === 'ssl') {
      const users = await service.getSSLVPNUsers();
      return NextResponse.json({ success: true, data: users });
    }

    if (vpn === 'ipsec') {
      const tunnels = await service.getIPsecTunnels();
      return NextResponse.json({ success: true, data: tunnels });
    }

    if (vpn === 'config') {
      const revisions = await service.getConfigRevisions();
      return NextResponse.json({ success: true, data: revisions });
    }

    if (vpn === 'interfaces') {
      const interfaces = await service.getInterfaceStats();
      return NextResponse.json({ success: true, data: interfaces });
    }

    // Return system status
    const status = await service.getStatus();
    return NextResponse.json(status);
  } catch (error) {
    console.error('FortiGate status check failed:', error);
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
      const fortiConfig = config as {
        host: string;
        accessToken: string;
        snmp?: {
          community: string;
          version: '2c' | '3';
        };
      };

      const service = new FortiGateService({
        host: fortiConfig.host,
        accessToken: fortiConfig.accessToken,
        snmp: fortiConfig.snmp,
        pollingInterval: 15,
        syncMode: 'rest',
        enabledModules: {
          interfaces: true,
          vlans: true,
          policies: true,
          addresses: true,
          vips: true,
          sdwan: false,
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

      // Get FortiGate configuration
      const fortiConfig = await prisma.integrationConfig.findFirst({
        where: { type: 'FORTIGATE', enabled: true },
      });

      if (!fortiConfig) {
        return NextResponse.json(
          { error: 'FortiGate integration not configured' },
          { status: 400 }
        );
      }

      const configData = fortiConfig.config as {
        host: string;
        accessToken: string;
        snmp?: {
          community: string;
          version: '2c' | '3';
        };
        pollingInterval: number;
        syncMode: 'snmp' | 'rest' | 'both';
        enabledModules: {
          interfaces: boolean;
          vlans: boolean;
          policies: boolean;
          addresses: boolean;
          vips: boolean;
          sdwan: boolean;
        };
      };

      const service = new FortiGateService({
        host: configData.host,
        accessToken: configData.accessToken,
        snmp: configData.snmp,
        pollingInterval: configData.pollingInterval,
        syncMode: configData.syncMode,
        enabledModules: configData.enabledModules,
      });

      // Perform sync
      const result = await service.syncToInventory(organizationId);

      // Log the sync
      await prisma.integrationSyncLog.create({
        data: {
          configId: fortiConfig.id,
          status: result.success ? 'success' : 'failed',
          message: result.errors.length > 0 ? result.errors.join('; ') : null,
          itemsProcessed: result.interfacesProcessed + result.vlansProcessed + 
                          result.policiesProcessed + result.addressesProcessed,
          itemsCreated: result.interfacesProcessed,
          itemsUpdated: 0,
          completedAt: new Date(),
        },
      });

      // Update last sync time
      await prisma.integrationConfig.update({
        where: { id: fortiConfig.id },
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
        accessToken: string;
        snmp?: {
          community: string;
          version: '2c' | '3';
        };
        pollingInterval: number;
        syncMode: 'snmp' | 'rest' | 'both';
        enabledModules: {
          interfaces: boolean;
          vlans: boolean;
          policies: boolean;
          addresses: boolean;
          vips: boolean;
          sdwan: boolean;
        };
      };

      await prisma.integrationConfig.upsert({
        where: {
          type_name: {
            type: 'FORTIGATE',
            name: body.name || `FortiGate-${config.host}`,
          },
        },
        create: {
          type: 'FORTIGATE',
          name: body.name || `FortiGate-${config.host}`,
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
    console.error('FortiGate API error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
