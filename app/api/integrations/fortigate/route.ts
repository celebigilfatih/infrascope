/**
 * FortiGate Integration API Routes
 * 
 * POST /api/integrations/fortigate/sync - Trigger a sync with FortiGate
 * GET  /api/integrations/fortigate/status - Check connection status
 * POST /api/integrations/fortigate/test - Test connection
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  hasIntegrationCredential,
  protectIntegrationConfig,
  unprotectIntegrationConfig,
} from '@/lib/security/integration-credentials';
import {
  clearFortiGateConnectors,
  createEphemeralFortiGateConnector,
  FortiGateConnectorError,
  fortiGateTargetSelectorFromUrl,
  getFortiGateConnector,
  resolveFortiGateTarget,
} from '@/lib/firewall/connector-factory';
import { firewallErrorPayload, FirewallIntegrationError } from '@/lib/firewall/errors';
import {
  firewallMonitoringFromRestStatus,
} from '@/lib/firewall/capabilities';

type StoredFortiGateConfig = {
  host: string;
  username?: string;
  password?: string;
  accessToken?: string;
  vdom?: string;
  deviceId?: string;
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

function readFortiGateConfig(config: unknown): StoredFortiGateConfig {
  return unprotectIntegrationConfig<StoredFortiGateConfig>(config, 'FORTIGATE');
}

function fortiGateErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof FortiGateConnectorError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.status }
    );
  }
  if (error instanceof FirewallIntegrationError) {
    const payload = firewallErrorPayload(error);
    return NextResponse.json(
      { success: false, error: payload.error, code: payload.code, retryable: payload.retryable },
      { status: payload.status }
    );
  }
  return null;
}

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
    const selector = fortiGateTargetSelectorFromUrl(request.url);
    let resolved;
    try {
      resolved = await resolveFortiGateTarget(selector);
    } catch (error) {
      if (
        type === 'config' &&
        error instanceof FortiGateConnectorError &&
        error.code === 'NOT_CONFIGURED'
      ) {
        return NextResponse.json({ config: null });
      }
      const response = fortiGateErrorResponse(error);
      if (response) return response;
      throw error;
    }
    const { integration: config, config: fortiConfig, target } = resolved;
    const cacheKey = (suffix: string) => `${target.key}:${suffix}`;
    const connector = () => getFortiGateConnector(selector);

    // Return config if requested
    if (type === 'config') {
      return NextResponse.json({
        config: {
          configId: config.id,
          host: fortiConfig.host || '',
          username: fortiConfig.username || '',
          vdom: target.vdom,
          accessToken: '',
          passwordSet:
            hasIntegrationCredential(config.config, 'FORTIGATE', 'password') ||
            hasIntegrationCredential(config.config, 'FORTIGATE', 'accessToken'),
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
      try {
        const { service } = await connector();
        const status = await service.getStatus();
        return NextResponse.json({
          ...status,
          monitoring: firewallMonitoringFromRestStatus(status),
          target: { configId: target.configId, vdom: target.vdom },
        });
      } catch (error) {
        const response = fortiGateErrorResponse(error);
        if (response) return response;
        throw error;
      }
    }

    // Get sync status - real data from database
    if (type === 'sync-status') {
      const scopedCacheKey = cacheKey('sync-status');
      const cached = fgServeCached(request, scopedCacheKey, 60_000, 10 * 60_000);
      if (cached) return cached;
      
      // First try to get from database
      const deviceId = target.inventoryDeviceId;
      
      let policyCount = 0;
      let addressCount = 0;
      let interfaceCount = 0;
      let vlanCount = 0;
      const syncLog = await prisma.integrationSyncLog.findFirst({
        where: { configId: config.id },
        orderBy: { startedAt: 'desc' },
      });
      
      if (deviceId) {
        [policyCount, addressCount, interfaceCount, vlanCount] = await Promise.all([
          prisma.firewallPolicy.count({ where: { deviceId } }),
          prisma.firewallAddress.count({ where: { deviceId } }),
          prisma.networkInterface.count({ where: { deviceId } }),
          prisma.vlan.count(),
        ]);
      }
      
      // If database is empty, fetch directly from FortiGate
      if (policyCount === 0 && fortiConfig.host) {
        try {
          const { service } = await connector();
          
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
      fgStore(scopedCacheKey, payload);
      return NextResponse.json(payload);
    }

    // Fetch current firewall policies directly from FortiGate CMDB (for alarm enrichment)
    if (type === 'cmdb-policies') {
      try {
        const { service: svc } = await connector();
        const policies = await svc.fetchFirewallPolicies();
        return NextResponse.json({
          success: true,
          host: target.host,
          target: { configId: target.configId, vdom: target.vdom },
          policies,
          total: policies.length,
        });
      } catch (err) {
        const response = fortiGateErrorResponse(err);
        if (response) return response;
        throw err;
      }
    }

    // Fetch current firewall address objects directly from FortiGate CMDB (for alarm enrichment)
    if (type === 'cmdb-addresses') {
      try {
        const { service: svc } = await connector();
        const addresses = await svc.fetchAddressObjects();
        return NextResponse.json({
          success: true,
          host: target.host,
          target: { configId: target.configId, vdom: target.vdom },
          addresses,
          total: addresses.length,
        });
      } catch (err) {
        const response = fortiGateErrorResponse(err);
        if (response) return response;
        throw err;
      }
    }

    const { service } = await connector();

    // Return VPN data if requested
    if (vpn === 'ssl') {
      const scopedCacheKey = cacheKey('vpn-ssl');
      const cached = fgServeCached(request, scopedCacheKey, 45_000, 10 * 60_000);
      if (cached) return cached;
      const users = await service.getSSLVPNUsers();
      const payload = { success: true, data: users };
      fgStore(scopedCacheKey, payload);
      return NextResponse.json(payload);
    }

    if (vpn === 'ssl-summary') {
      const scopedCacheKey = cacheKey('vpn-ssl-summary');
      const cached = fgServeCached(request, scopedCacheKey, 45_000, 10 * 60_000);
      if (cached) return cached;
      const users = await service.getSSLVPNUsers();
      const summary = {
        total_users: users.length,
        active_sessions: users.length,
        total_in_bytes: users.reduce((sum, u) => sum + (u.in_bytes || 0), 0),
        total_out_bytes: users.reduce((sum, u) => sum + (u.out_bytes || 0), 0),
      };
      const payload = { success: true, data: summary };
      fgStore(scopedCacheKey, payload);
      return NextResponse.json(payload);
    }

    if (vpn === 'ipsec') {
      const scopedCacheKey = cacheKey('vpn-ipsec');
      const cached = fgServeCached(request, scopedCacheKey, 60_000, 10 * 60_000);
      if (cached) return cached;
      const tunnels = await service.getIPsecTunnels();
      const payload = { success: true, data: tunnels };
      fgStore(scopedCacheKey, payload);
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
    return NextResponse.json({
      ...status,
      monitoring: firewallMonitoringFromRestStatus(status),
    });
  } catch (error) {
    console.error('FortiGate status check failed:', error);
    const response = fortiGateErrorResponse(error);
    if (response) return response;
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
    const urlSelector = fortiGateTargetSelectorFromUrl(request.url);
    const selector = {
      configId: body.configId || urlSelector.configId,
      vdom: body.vdom || urlSelector.vdom,
    };

    if (action === 'test') {
      // Test connection without saving
      const fortiConfig = config as {
        host: string;
        username?: string;
        password?: string;
        accessToken: string;
        vdom?: string;
        snmp?: {
          community: string;
          version: '2c' | '3';
        };
      };

      // If credentials are blank, use the explicitly selected saved target.
      let password = fortiConfig.password;
      let accessToken = fortiConfig.accessToken;
      if (!password || !accessToken) {
        try {
          const existing = await resolveFortiGateTarget({ ...selector, includeDisabled: true });
          password ||= existing.config.password || '';
          accessToken ||= existing.config.accessToken || '';
        } catch (error) {
          if (!(error instanceof FortiGateConnectorError) || error.code !== 'NOT_CONFIGURED') {
            throw error;
          }
        }
      }

      const service = createEphemeralFortiGateConnector({
        host: fortiConfig.host,
        username: fortiConfig.username,
        password: password,
        accessToken: accessToken || '',
        snmp: fortiConfig.snmp,
        vdom: selector.vdom || fortiConfig.vdom,
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

      try {
        const status = await service.getStatus();
        return NextResponse.json({
          ...status,
          monitoring: firewallMonitoringFromRestStatus(status),
        });
      } finally {
        await service.dispose();
      }
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

      const { service, integration: fortiConfig, target } = await getFortiGateConnector(selector);

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

      return NextResponse.json({
        ...result,
        target: { configId: target.configId, vdom: target.vdom },
      });
    }

    if (action === 'save-config') {
      const newConfig = config as {
        host: string;
        username?: string;
        password?: string;
        accessToken: string;
        vdom?: string;
        deviceId?: string;
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

      const targetName = body.name || `FortiGate-${config.host}`;
      const existingRecord = selector.configId
        ? await prisma.integrationConfig.findUnique({ where: { id: selector.configId } })
        : await prisma.integrationConfig.findUnique({
            where: { type_name: { type: 'FORTIGATE', name: targetName } },
          });
      if (existingRecord && existingRecord.type !== 'FORTIGATE') {
        return NextResponse.json({ error: 'Selected integration is not a FortiGate target' }, { status: 400 });
      }
      const existingData = existingRecord
        ? readFortiGateConfig(existingRecord.config)
        : null;
      const finalPassword = newConfig.password || existingData?.password || '';
      const finalToken = newConfig.accessToken || existingData?.accessToken || '';
      const protectedConfig = protectIntegrationConfig<Record<string, unknown>>(
        {
          ...newConfig,
          vdom: selector.vdom || newConfig.vdom || existingData?.vdom || 'root',
          deviceId: newConfig.deviceId || existingData?.deviceId,
          password: finalPassword,
          accessToken: finalToken,
        },
        'FORTIGATE'
      );

      const saved = existingRecord
        ? await prisma.integrationConfig.update({
            where: { id: existingRecord.id },
            data: {
              name: targetName,
              enabled: true,
              config: protectedConfig as any,
              syncInterval: newConfig.pollingInterval,
            },
          })
        : await prisma.integrationConfig.create({
          data: {
          type: 'FORTIGATE',
          name: targetName,
          enabled: true,
          config: protectedConfig as any,
          syncInterval: newConfig.pollingInterval,
          },
        });
      await clearFortiGateConnectors();

      return NextResponse.json({ success: true, configId: saved.id });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('FortiGate API error:', error);
    const response = fortiGateErrorResponse(error);
    if (response) return response;
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
