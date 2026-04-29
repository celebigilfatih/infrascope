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

// ── Stale-while-revalidate cache for dashboard-facing FortiGate endpoints ──
// Absorbs FortiGate cold-start latency (first call ~25-30s) so subsequent
// dashboard loads never wait on upstream.
type FgCacheEntry = { data: any; timestamp: number };
function fgCache(): Record<string, FgCacheEntry> {
  const g = globalThis as any;
  if (!g.__fgCache) g.__fgCache = {};
  return g.__fgCache;
}
function fgRevalidating(): Set<string> {
  const g = globalThis as any;
  if (!g.__fgRevalidating) g.__fgRevalidating = new Set<string>();
  return g.__fgRevalidating;
}
function fgServeCached(
  req: NextRequest,
  key: string,
  ttlMs: number,
  staleWindowMs: number,
): NextResponse | null {
  const bypass = req.headers.get('x-cache-bypass') === '1';
  if (bypass) return null;
  const entry = fgCache()[key];
  if (!entry) return null;
  const age = Date.now() - entry.timestamp;
  if (age < ttlMs) {
    const res = NextResponse.json(entry.data);
    res.headers.set('X-Cache', 'HIT');
    res.headers.set('X-Cache-Age', String(Math.round(age / 1000)));
    return res;
  }
  if (age < ttlMs + staleWindowMs) {
    const revalidating = fgRevalidating();
    if (!revalidating.has(key)) {
      revalidating.add(key);
      const url = `${req.nextUrl.origin}${req.nextUrl.pathname}${req.nextUrl.search}`;
      setTimeout(() => {
        fetch(url, { headers: { 'x-cache-bypass': '1' } })
          .catch((e) => console.warn('[FortiGate API] bg revalidate failed:', e?.message))
          .finally(() => revalidating.delete(key));
      }, 0);
    }
    const res = NextResponse.json(entry.data);
    res.headers.set('X-Cache', 'STALE');
    res.headers.set('X-Cache-Age', String(Math.round(age / 1000)));
    return res;
  }
  return null;
}
function fgStore(key: string, data: any) {
  fgCache()[key] = { data, timestamp: Date.now() };
}

export async function GET(request: NextRequest) {
  try {
    // Get query params
    const { searchParams } = new URL(request.url);
    const vpn = searchParams.get('vpn');
    const type = searchParams.get('type');

    // Get FortiGate configuration from database
    const config = await prisma.integrationConfig.findFirst({
      where: { type: 'FORTIGATE', enabled: true },
    });

    // Return config if requested
    if (type === 'config') {
      if (!config) {
        return NextResponse.json({ config: null });
      }
      const fortiConfig = config.config as any;
      return NextResponse.json({
        config: {
          host: fortiConfig.host || '',
          username: fortiConfig.username || '',
          accessToken: '',
          passwordSet: !!fortiConfig.password,
          snmp: fortiConfig.snmp || { community: 'public', version: '2c' },
          pollingInterval: fortiConfig.pollingInterval || 15,
          syncMode: fortiConfig.syncMode || 'rest',
          enabledModules: fortiConfig.enabledModules || {
            interfaces: true,
            vlans: true,
            policies: true,
            addresses: true,
            vips: false,
            sdwan: false,
          },
          lastSyncAt: config.lastSyncAt,
          lastSyncStatus: config.lastSyncStatus,
        }
      });
    }

    // Check connection status
    if (type === 'status') {
      if (!config) {
        return NextResponse.json({ connected: false, error: 'FortiGate integration not configured' });
      }
      
      try {
        const fortiConfig = config.config as any;
        const service = new FortiGateService({
          host: fortiConfig.host,
          username: fortiConfig.username,
          password: fortiConfig.password,
          accessToken: fortiConfig.accessToken,
          snmp: fortiConfig.snmp,
          pollingInterval: fortiConfig.pollingInterval || 15,
          syncMode: fortiConfig.syncMode || 'rest',
          enabledModules: fortiConfig.enabledModules,
        });
        const status = await service.getStatus();
        return NextResponse.json({ connected: status.connected, version: status.version });
      } catch (error) {
        return NextResponse.json({ connected: false, error: (error as Error).message });
      }
    }

    // Get sync status - real data from database
    if (type === 'sync-status') {
      const cached = fgServeCached(request, 'sync-status', 60_000, 10 * 60_000);
      if (cached) return cached;
      const fortiConfig = config?.config as any;
      
      // First try to get from database
      const deviceId = config?.id;
      
      let policyCount = 0;
      let addressCount = 0;
      let interfaceCount = 0;
      let vlanCount = 0;
      let syncLog = null;
      
      if (deviceId) {
        [policyCount, addressCount, interfaceCount, vlanCount, syncLog] = await Promise.all([
          prisma.firewallPolicy.count({ where: { deviceId } }),
          prisma.firewallAddress.count({ where: { deviceId } }),
          prisma.networkInterface.count({ where: { deviceId } }),
          prisma.vlan.count(),
          prisma.integrationSyncLog.findFirst({
            where: { configId: deviceId },
            orderBy: { startedAt: 'desc' },
          }),
        ]);
      }
      
      // If database is empty, fetch directly from FortiGate
      if (policyCount === 0 && fortiConfig?.host) {
        try {
          const service = new FortiGateService({
            host: fortiConfig.host,
            username: fortiConfig.username,
            password: fortiConfig.password,
            accessToken: fortiConfig.accessToken,
            snmp: fortiConfig.snmp,
            pollingInterval: fortiConfig.pollingInterval || 15,
            syncMode: fortiConfig.syncMode || 'rest',
            enabledModules: fortiConfig.enabledModules,
          });
          
          // Fetch counts from FortiGate directly
          const [policies, addresses] = await Promise.all([
            service.fetchFirewallPolicies(),
            service.fetchAddressObjects(),
          ]);
          
          policyCount = policies.length;
          addressCount = addresses.length;
        } catch (e) {
          console.error('Failed to fetch from FortiGate:', e);
        }
      }

      const payload = {
        success: true,
        data: {
          interfacesProcessed: interfaceCount,
          vlansProcessed: vlanCount,
          policiesProcessed: policyCount,
          addressesProcessed: addressCount,
          errors: syncLog?.errorDetails || [],
          duration: syncLog?.completedAt && syncLog?.startedAt 
            ? new Date(syncLog.completedAt).getTime() - new Date(syncLog.startedAt).getTime()
            : 0,
          lastSync: syncLog?.startedAt || null,
          status: syncLog?.status || (policyCount > 0 ? 'success' : 'unknown'),
        }
      };
      fgStore('sync-status', payload);
      return NextResponse.json(payload);
    }

    // Fetch current firewall policies directly from FortiGate CMDB (for alarm enrichment)
    if (type === 'cmdb-policies') {
      if (!config) {
        return NextResponse.json({ success: false, error: 'FortiGate not configured' }, { status: 404 });
      }
      const fortiConf = config.config as any;
      try {
        const svc = new FortiGateService({
          host: fortiConf.host,
          username: fortiConf.username,
          password: fortiConf.password,
          accessToken: fortiConf.accessToken,
          snmp: fortiConf.snmp,
          pollingInterval: fortiConf.pollingInterval || 15,
          syncMode: fortiConf.syncMode || 'rest',
          enabledModules: { interfaces: true, vlans: true, policies: true, addresses: true, vips: true, sdwan: true },
        });
        const policies = await svc.fetchFirewallPolicies();
        return NextResponse.json({
          success: true,
          host: fortiConf.host,
          policies,
          total: policies.length,
        });
      } catch (err) {
        return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
      }
    }

    // Fetch current firewall address objects directly from FortiGate CMDB (for alarm enrichment)
    if (type === 'cmdb-addresses') {
      if (!config) {
        return NextResponse.json({ success: false, error: 'FortiGate not configured' }, { status: 404 });
      }
      const fortiConf = config.config as any;
      try {
        const svc = new FortiGateService({
          host: fortiConf.host,
          username: fortiConf.username,
          password: fortiConf.password,
          accessToken: fortiConf.accessToken,
          snmp: fortiConf.snmp,
          pollingInterval: fortiConf.pollingInterval || 15,
          syncMode: fortiConf.syncMode || 'rest',
          enabledModules: { interfaces: true, vlans: true, policies: true, addresses: true, vips: true, sdwan: true },
        });
        const addresses = await svc.fetchAddressObjects();
        return NextResponse.json({
          success: true,
          host: fortiConf.host,
          addresses,
          total: addresses.length,
        });
      } catch (err) {
        return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
      }
    }

    if (!config) {
      return NextResponse.json({
        connected: false,
        error: 'FortiGate integration not configured',
      });
    }

    const fortiConfig = config.config as {
      host: string;
      username?: string;
      password?: string;
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
      username: fortiConfig.username,
      password: fortiConfig.password,
      accessToken: fortiConfig.accessToken,
      snmp: fortiConfig.snmp,
      pollingInterval: fortiConfig.pollingInterval,
      syncMode: fortiConfig.syncMode,
      enabledModules: fortiConfig.enabledModules,
    });

    // Return VPN data if requested
    if (vpn === 'ssl') {
      const cached = fgServeCached(request, 'vpn-ssl', 45_000, 10 * 60_000);
      if (cached) return cached;
      const users = await service.getSSLVPNUsers();
      const payload = { success: true, data: users };
      fgStore('vpn-ssl', payload);
      return NextResponse.json(payload);
    }

    if (vpn === 'ssl-summary') {
      const cached = fgServeCached(request, 'vpn-ssl-summary', 45_000, 10 * 60_000);
      if (cached) return cached;
      const users = await service.getSSLVPNUsers();
      const summary = {
        total_users: users.length,
        active_sessions: users.length,
        total_in_bytes: users.reduce((sum, u) => sum + (u.in_bytes || 0), 0),
        total_out_bytes: users.reduce((sum, u) => sum + (u.out_bytes || 0), 0),
      };
      const payload = { success: true, data: summary };
      fgStore('vpn-ssl-summary', payload);
      return NextResponse.json(payload);
    }

    if (vpn === 'ipsec') {
      const cached = fgServeCached(request, 'vpn-ipsec', 60_000, 10 * 60_000);
      if (cached) return cached;
      const tunnels = await service.getIPsecTunnels();
      const payload = { success: true, data: tunnels };
      fgStore('vpn-ipsec', payload);
      return NextResponse.json(payload);
    }

    if (vpn === 'config') {
      const revisions = await service.getConfigRevisions();
      return NextResponse.json({ success: true, data: revisions });
    }

    if (vpn === 'interfaces') {
      const interfaces = await service.getInterfaceStats();
      return NextResponse.json({ success: true, data: interfaces });
    }

    if (vpn === 'vip') {
      const vips = await service.fetchVIPs();
      return NextResponse.json({ success: true, data: vips });
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
        username?: string;
        password?: string;
        accessToken: string;
        snmp?: {
          community: string;
          version: '2c' | '3';
        };
      };

      // If password is blank, use the saved password from DB
      let password = fortiConfig.password;
      if (!password) {
        const existing = await prisma.integrationConfig.findFirst({ where: { type: 'FORTIGATE' } });
        password = (existing?.config as any)?.password || '';
      }

      const service = new FortiGateService({
        host: fortiConfig.host,
        username: fortiConfig.username,
        password: password,
        accessToken: fortiConfig.accessToken || '',
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
        username?: string;
        password?: string;
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
        username: configData.username,
        password: configData.password,
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
        username?: string;
        password?: string;
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

      // Preserve existing password if none provided
      const existingRecord = await prisma.integrationConfig.findFirst({
        where: { type: 'FORTIGATE' },
      });
      const existingData = existingRecord?.config as any;
      const finalPassword = newConfig.password || existingData?.password || '';
      const finalToken = newConfig.accessToken || existingData?.accessToken || '';

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
          config: { ...newConfig, password: finalPassword, accessToken: finalToken },
          syncInterval: newConfig.pollingInterval,
        },
        update: {
          enabled: true,
          config: { ...newConfig, password: finalPassword, accessToken: finalToken },
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
