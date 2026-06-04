/**
 * FortiAnalyzer Integration API Routes
 * 
 * GET /api/integrations/fortianalyzer?type=status - Get system status
 * GET /api/integrations/fortianalyzer?type=adoms - Get ADOMs
 */

import { NextRequest, NextResponse } from 'next/server';
import FortiAnalyzerService, { initSharedFortiAnalyzerService } from '@/lib/integrations/fortianalyzer';
import { FortiGateService } from '@/lib/integrations/fortigate';
import { prisma } from '@/lib/prisma';
import { validateBody } from '@/lib/validators';
import { fortianalyzerConfigSchema } from '@/lib/validators/integrations';

// ─── In-memory cache for heavy FA queries ───────────────────────────────────
const FAZ_CACHE_TTL = 5 * 60 * 1000; // 5 minutes default

function getCached(key: string, ttlMs?: number) {
  const store = (globalThis as any);
  if (!store.fazCache) store.fazCache = {};
  const entry = store.fazCache[key];
  if (entry && Date.now() - entry.timestamp < (ttlMs ?? FAZ_CACHE_TTL)) return entry.data;
  return null;
}
function setCache(key: string, data: unknown) {
  const store = (globalThis as any);
  if (!store.fazCache) store.fazCache = {};
  store.fazCache[key] = { data, timestamp: Date.now() };
}

/**
 * Poll FortiAnalyzer log search results with exponential backoff.
 * Starts at startIntervalMs, doubles each attempt, returns as soon as data arrives.
 * Total timeout budget: startIntervalMs * (2^maxAttempts - 1)
 */
async function pollForResult(
  service: InstanceType<typeof FortiAnalyzerService>,
  tid: number,
  limit: number,
  maxAttempts: number = 5,
  startIntervalMs: number = 1000,
): Promise<any[] | null> {
  let interval = startIntervalMs;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, interval));
    const logs = await service.fetchLogResults(tid, 0, limit);
    if (logs && logs.length > 0) return logs;
    interval = Math.min(interval * 2, 8000); // cap at 8s
  }
  // Final attempt
  return service.fetchLogResults(tid, 0, limit);
}
// ────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, config: reqConfig } = body;

    if (action === 'test') {
      const parsed = validateBody(reqConfig || {}, fortianalyzerConfigSchema);
      if (!parsed.success) {
        return NextResponse.json({ success: false, connected: false, error: parsed.error });
      }
      const { host, username, password: rawPassword } = parsed.data;

      // If password is blank, use the saved password from DB
      let password = rawPassword;
      if (!password) {
        const existing = await prisma.integrationConfig.findFirst({ where: { type: 'FORTIANALYZER' } });
        password = (existing?.config as any)?.password || '';
      }

      if (!password) {
        return NextResponse.json({ success: false, connected: false, error: 'Password is required.' });
      }

      // Intentionally NOT using initSharedFortiAnalyzerService() here:
      // test action uses user-supplied credentials which may differ from the
      // saved singleton config. A temporary instance validates the new creds
      // without polluting the shared session state.
      const service = new FortiAnalyzerService({ host, username, password });
      const loggedIn = await service.login();
      if (loggedIn) {
        return NextResponse.json({ success: true, connected: true });
      } else {
        return NextResponse.json({ success: false, connected: false, error: 'Login failed — check credentials or account lock status' });
      }
    }

    if (action === 'save-config') {
      const parsed = validateBody(reqConfig || {}, fortianalyzerConfigSchema);
      if (!parsed.success) {
        return NextResponse.json({ success: false, error: parsed.error });
      }
      const { host, username, password } = parsed.data;

      // Fetch existing config to preserve password if not provided
      const existing = await prisma.integrationConfig.findFirst({
        where: { type: 'FORTIANALYZER' },
      });
      const existingConfig = (existing?.config as any) || {};

      const newConfig = {
        ...existingConfig,
        host,
        username,
        password: password && password.length > 0 ? password : existingConfig.password,
      };

      await prisma.integrationConfig.upsert({
        where: { type_name: { type: 'FORTIANALYZER', name: 'FortiAnalyzer' } },
        create: { type: 'FORTIANALYZER', name: 'FortiAnalyzer', enabled: true, config: newConfig },
        update: { enabled: true, config: newConfig },
      });

      // Reset global login backoff so the new creds are tried immediately
      const g = globalThis as any;
      if (g._fazGlobalState && g._fazGlobalState[host]) {
        g._fazGlobalState[host].consecutiveFailures = 0;
        g._fazGlobalState[host].backoffUntil = 0;
        g._fazGlobalState[host].session = null;
        g._fazGlobalState[host].lastLoginTime = 0;
        console.log('[FortiAnalyzer] 🔄 Credentials updated via UI — backoff reset for', host);
      }
      // Also clear state for old host if host changed
      if (g._fazGlobalState) {
        Object.keys(g._fazGlobalState).forEach(h => {
          if (h !== host) {
            g._fazGlobalState[h].session = null;
            g._fazGlobalState[h].consecutiveFailures = 0;
            g._fazGlobalState[h].backoffUntil = 0;
          }
        });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('FortiAnalyzer POST error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get query params
    const { searchParams } = new URL(request.url);
    const dataType = searchParams.get('type') || 'status';

    // Get FortiAnalyzer configuration from database
    const config = await prisma.integrationConfig.findFirst({
      where: { type: 'FORTIANALYZER', enabled: true },
    });

    // Return config (without password) — no login needed
    if (dataType === 'config') {
      if (!config) return NextResponse.json({ config: null });
      const cfg = config.config as { host?: string; username?: string };
      return NextResponse.json({
        config: {
          host: cfg.host || '',
          username: cfg.username || '',
        }
      });
    }

    if (!config) {
      return NextResponse.json({
        success: false,
        error: 'FortiAnalyzer integration not configured',
      });
    }

    const faConfig = config.config as {
      host: string;
      username?: string;
      password?: string;
    };

    if (!faConfig.password) {
      return NextResponse.json({
        success: false,
        error: 'FortiAnalyzer password not configured',
      }, { status: 400 });
    }

    const service = initSharedFortiAnalyzerService({
      host: faConfig.host,
      username: faConfig.username,
      password: faConfig.password,
    });

    // Login first
    const loggedIn = await service.login();
    if (!loggedIn) {
      return NextResponse.json({
        success: false,
        error: 'Failed to login to FortiAnalyzer',
      });
    }

    // Return data based on type
    let data = null;

    if (dataType === 'status') {
      data = await service.getStatus();
    } else if (dataType === 'adoms') {
      data = await service.getAdoms();
    } else if (dataType === 'events') {
      data = await service.getEventLogs(50);
      console.log('FortiAnalyzer event logs data:', JSON.stringify(data, null, 2));
    } else if (dataType === 'config-revisions') {
      // Admin system logs — 2-min server-side cache (data changes infrequently)
      const cacheKey = 'config_revisions_500';
      const cached = getCached(cacheKey, 2 * 60 * 1000);
      if (cached) {
        data = cached;
      } else {
        // FortiAnalyzer log search with exponential backoff
        const tid = await service.startLogSearch('event', 1000, 'subtype == system and action != perf-stats and user != "" and user != "fgtinfra" and user != "siem"');
        if (tid) {
          data = await pollForResult(service, tid, 500, 5, 1000);
        } else {
          data = [];
        }
        
        // If FortiAnalyzer returned empty, try NMS EventCache (PostgreSQL)
        if (!data || data.length === 0) {
        console.log('[ConfigRevisions] FortiAnalyzer returned empty, trying NMS EventCache...');
        try {
          // Query NMS database for recent event logs
          const recentEvents = await prisma.cachedEvent.findMany({
            where: {
              logtype: 'event',
              subtype: 'system',
              user: {
                notIn: ['siem', 'fgtinfra', ''],
              },
              eventTime: {
                gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
              },
            },
            orderBy: {
              eventTime: 'desc',
            },
            take: 500,
          });
          
          // Convert to the format expected by the frontend
          data = recentEvents.map(event => ({
            id: event.id,
            date: event.eventTime?.toISOString().split('T')[0],
            time: event.eventTime?.toISOString().split('T')[1]?.split('.')[0],
            user: (event.rawLog as any)?.user || '',
            action: event.action || (event.rawLog as any)?.action || '',
            msg: (event.rawLog as any)?.msg || '',
            logdesc: (event.rawLog as any)?.logdesc || '',
            srcip: (event.rawLog as any)?.srcip || '',
            dstip: (event.rawLog as any)?.dstip || '',
            status: (event.rawLog as any)?.status || '',
            level: event.level || (event.rawLog as any)?.level || '',
            ui: (event.rawLog as any)?.ui || '',
            profile: (event.rawLog as any)?.profile || '',
            devname: (event.rawLog as any)?.devname || (event.rawLog as any)?.dev_name || '',
            devid: (event.rawLog as any)?.devid || '',
            cfgpath: (event.rawLog as any)?.cfgpath || '',
            cfgattr: (event.rawLog as any)?.cfgattr || '',
            cfgobj: (event.rawLog as any)?.cfgobj || '',
          }));
          
          console.log(`[ConfigRevisions] NMS EventCache returned ${data.length} events`);
        } catch (nmsError) {
          console.error('[ConfigRevisions] NMS EventCache error:', nmsError);
        }
      }
      // Cache config-revisions result (2-min TTL for admin event data)
      if (data && Array.isArray(data) && data.length > 0) {
        setCache(cacheKey, data);
      }
      } // end else (non-cached config-revisions branch)
    } else if (dataType === 'traffic') {
      const tid = await service.startLogSearch('traffic', 10);
      if (tid) {
        data = await pollForResult(service, tid, 10, 2, 500);
      }
    } else if (dataType === 'ips-critical') {
      // IPS attack logs — critical severity, with 5-min server-side cache
      const limit = parseInt(searchParams.get('limit') || '500', 10);
      const cacheKey = `ips_critical_${limit}`;

      // Serve from cache if fresh
      const cached = getCached(cacheKey);
      if (cached) {
        const res = NextResponse.json({ success: true, data: cached, type: dataType, count: (cached as unknown[]).length });
        res.headers.set('X-Cache', 'HIT');
        return res;
      }

      const tid = await service.startLogSearch('attack', limit, 'severity == critical');
      if (tid) {
        const logs = await pollForResult(service, tid, limit, 5, 1000);
        if (logs && logs.length > 0) {
          setCache(cacheKey, logs);
          const res = NextResponse.json({ success: true, data: logs, type: dataType, count: logs.length });
          res.headers.set('X-Cache', 'MISS');
          return res;
        }
        return NextResponse.json({ success: true, data: logs || [], type: dataType, count: (logs || []).length });
      }
      return NextResponse.json({ success: true, data: [], type: dataType, count: 0 });
    } else if (dataType === 'log-search') {
      // Generic log search for debugging
      const logtype = searchParams.get('logtype') || 'event';
      const filter = searchParams.get('filter') || '';
      const limit = parseInt(searchParams.get('limit') || '50', 10);
      const tid = await service.startLogSearch(logtype, limit, filter || undefined);
      if (tid) {
        const logs = await pollForResult(service, tid, limit, 5, 1000);
        return NextResponse.json({ success: true, data: logs || [], count: (logs || []).length });
      }
      return NextResponse.json({ success: true, data: [], count: 0 });
    } else if (dataType === 'fortiview') {
      // Single FortiView query
      const viewName = searchParams.get('view') || 'top-websites';
      const limit = parseInt(searchParams.get('limit') || '50', 10);
      const sortField = searchParams.get('sort') || 'bandwidth';
      const rangeMinutes = parseInt(searchParams.get('range') || '240', 10);
      
      // Generate cache key
      const cacheKey = `fortiview_single_${viewName}_${limit}_${sortField}_${rangeMinutes}`;
      const globalCache = globalThis as any;
      if (!globalCache.fortiviewCache) globalCache.fortiviewCache = {};
      
      // Check cache (5 minute TTL)
      const now = Date.now();
      const cached = globalCache.fortiviewCache[cacheKey];
      if (cached && (now - cached.timestamp) < 300000) {
        return NextResponse.json({
          success: true,
          data: cached.data.data,
          totalCount: cached.data.totalCount,
          type: dataType,
          view: viewName,
          cached: true
        });
      }
      
      const result = await service.getFortiView(viewName, limit, { field: sortField, order: 'desc' }, undefined, rangeMinutes);
      if (result) {
        // Cache the result
        globalCache.fortiviewCache[cacheKey] = {
          data: result,
          timestamp: now
        };
        
        return NextResponse.json({
          success: true,
          data: result.data,
          totalCount: result.totalCount,
          type: dataType,
          view: viewName,
          cached: false
        });
      }
      return NextResponse.json({ success: true, data: [], type: dataType, view: viewName });
    } else if (dataType === 'fortiview-batch') {
      // Batch FortiView: single login, multiple views sequentially
      const viewsParam = searchParams.get('views') || 'top-websites,top-browsing-users,policy-hits';
      const views = viewsParam.split(',');
      const limit = parseInt(searchParams.get('limit') || '50', 10);
      const sortField = searchParams.get('sort') || 'bandwidth';
      const rangeMinutes = parseInt(searchParams.get('range') || '240', 10);

      // Generate cache key from parameters
      const cacheKey = `fortiview_batch_${viewsParam}_${limit}_${sortField}_${rangeMinutes}`;
      const globalCache = globalThis as any;
      if (!globalCache.fortiviewCache) globalCache.fortiviewCache = {};
      
      // Check cache (5 minute TTL)
      const now = Date.now();
      const cached = globalCache.fortiviewCache[cacheKey];
      if (cached && (now - cached.timestamp) < 300000) {
        return NextResponse.json({ success: true, results: cached.data, type: dataType, cached: true });
      }

      const results: Record<string, { data: Array<Record<string, unknown>>; totalCount?: number }> = {};
      for (const viewName of views) {
        try {
          const result = await service.getFortiView(viewName.trim(), limit, { field: sortField, order: 'desc' }, undefined, rangeMinutes);
          results[viewName.trim()] = result || { data: [] };
        } catch (err) {
          console.error(`FortiView batch error for ${viewName}:`, err);
          results[viewName.trim()] = { data: [] };
        }
      }
      
      // Cache the results
      globalCache.fortiviewCache[cacheKey] = {
        data: results,
        timestamp: now
      };
      
      return NextResponse.json({ success: true, results, type: dataType, cached: false });
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid data type' },
        { status: 400 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      data,
      type: dataType,
    });
  } catch (error) {
    console.error('FortiAnalyzer API error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: (error as Error).message 
      },
      { status: 500 }
    );
  }
}
