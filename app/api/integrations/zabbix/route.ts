/**
 * Zabbix Integration API Routes
 * 
 * POST /api/integrations/zabbix/sync - Trigger a sync with Zabbix
 * GET  /api/integrations/zabbix/status - Check connection status
 * POST /api/integrations/zabbix/test - Test connection
 */

import { NextRequest, NextResponse } from 'next/server';
import { authorizeApiRequest, forbiddenApiPermission } from '@/lib/auth/api-permission';
import { canAccessSync } from '@/lib/auth/permission-policy';
import { ZabbixService } from '@/lib/integrations/zabbix';
import { prisma } from '@/lib/prisma';
import { recordInventorySync } from '@/lib/integrations/sync-log';
import { InventorySyncBusyError, isInventorySyncInterval, withInventorySync } from '@/lib/integrations/sync-coordinator';
import { InventorySourceSelectionError, selectInventorySource } from '@/lib/integrations/inventory-source-selection';
import type { Prisma } from '@prisma/client';
import { protectIntegrationConfig, unprotectIntegrationConfig } from '@/lib/security/integration-credentials';
import type { ZabbixConfig } from '@/lib/integrations/zabbix';

export async function GET(request: NextRequest) {
  const access = await authorizeApiRequest(request, 'devices', 'read');
  if (!access.allowed) return access.response;
  try {
    // Get Zabbix configuration from database
    const config = await selectInventorySource('ZABBIX', request.nextUrl.searchParams.get('configId') ?? undefined);

    if (!config) {
      return NextResponse.json({
        connected: false,
        error: 'Zabbix integration not configured',
      });
    }

    const zabbixConfig = unprotectIntegrationConfig<ZabbixConfig>(config.config, 'ZABBIX');

    const service = new ZabbixService({
      url: zabbixConfig.url,
      authToken: zabbixConfig.authToken,
      pollingInterval: zabbixConfig.pollingInterval,
      enabledModules: zabbixConfig.enabledModules,
    });

    const status = await service.getStatus();
    
    return NextResponse.json(status);
  } catch (error) {
    if (error instanceof InventorySourceSelectionError) return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    console.error('Zabbix status check failed:', error);
    return NextResponse.json(
      { connected: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const access = await authorizeApiRequest(request, 'devices', 'write');
  if (!access.allowed) return access.response;
  try {
    const body = await request.json();
    const { action, config } = body;
    if (['test', 'save-config'].includes(action) && !canAccessSync(access.auth.role, 'settings', 'write')) {
      return forbiddenApiPermission('settings', 'write');
    }

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
      const zabbixConfig = await selectInventorySource('ZABBIX', body.configId);

      if (!zabbixConfig) {
        return NextResponse.json(
          { error: 'Zabbix integration not configured' },
          { status: 400 }
        );
      }

      return await withInventorySync('ZABBIX', zabbixConfig.id, async () => {
        const config = unprotectIntegrationConfig<ZabbixConfig>(zabbixConfig.config, 'ZABBIX');

        const service = new ZabbixService({
          integrationId: zabbixConfig.id,
          url: config.url,
          authToken: config.authToken,
          pollingInterval: zabbixConfig.syncInterval || 5,
          enabledModules: config.enabledModules,
        });

        // Perform sync and atomically record its outcome metadata.
        const startedAt = new Date();
        const result = await service.syncToInventory(organizationId);
        await recordInventorySync(zabbixConfig.id, result, startedAt);

        return NextResponse.json(result);
      });
    }

    if (action === 'save-config') {
      const name = body.name || 'Default Zabbix';
      const previous = await prisma.integrationConfig.findFirst({ where: { type: 'ZABBIX', name } });
      const previousPlain = previous ? unprotectIntegrationConfig<ZabbixConfig>(previous.config, 'ZABBIX') : null;
      // Only the supported token-auth profile may be persisted; ignore unknown credential aliases.
      const newConfig: ZabbixConfig = {
        url: config?.url,
        authToken: !config?.authToken || config.authToken === '********' ? previousPlain?.authToken || '' : config.authToken,
        pollingInterval: config?.pollingInterval === undefined ? 5 : config.pollingInterval,
        enabledModules: config?.enabledModules,
      };
      if (!isInventorySyncInterval(newConfig.pollingInterval)) {
        return NextResponse.json({ success: false, error: 'Senkronizasyon aralığı 1–1440 dakika olmalıdır.' }, { status: 400 });
      }
      if (typeof newConfig.authToken !== 'string' || !newConfig.authToken.trim()) {
        return NextResponse.json({ success: false, error: 'Zabbix API tokenı gerekli.' }, { status: 400 });
      }
      const protectedConfig = protectIntegrationConfig<Prisma.InputJsonObject>(newConfig, 'ZABBIX');

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
          config: protectedConfig,
          syncInterval: newConfig.pollingInterval,
        },
        update: {
          enabled: true,
          config: protectedConfig,
          syncInterval: newConfig.pollingInterval,
        },
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    if (error instanceof InventorySourceSelectionError) return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    if (error instanceof InventorySyncBusyError) {
      return NextResponse.json({ error: 'Bu kaynak için senkronizasyon zaten çalışıyor.', code: error.code }, { status: 409 });
    }
    console.error('Zabbix API error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
