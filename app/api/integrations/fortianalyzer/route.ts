/**
 * FortiAnalyzer Integration API Routes
 * 
 * GET /api/integrations/fortianalyzer?type=status - Get system status
 * GET /api/integrations/fortianalyzer?type=adoms - Get ADOMs
 */

import { NextRequest, NextResponse } from 'next/server';
import { authorizeApiRequest } from '@/lib/auth/api-permission';
import FortiAnalyzerService, { initSharedFortiAnalyzerService, resetFortiAnalyzerLoginBackoff } from '@/lib/integrations/fortianalyzer';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { mergeFortiAnalyzerProfile, type FortiAnalyzerProfileInput } from '@/lib/integrations/fortianalyzer-profile';
import { readFortiAnalyzerProfile } from '@/lib/integrations/fortianalyzer-source';
import { SourceQueryError } from '@/lib/integrations/source-query-error';
import { validateBody } from '@/lib/validators';
import { fortianalyzerConfigSchema } from '@/lib/validators/integrations';
import { fortiAnalyzerRevision, fortiAnalyzerCacheFilter } from '@/lib/integrations/fortianalyzer-revision';
import { refreshFortiAnalyzerEventCache } from '@/lib/alarms/fortianalyzer-cache-runtime';
import {
  hasIntegrationCredential,
  protectIntegrationConfig,
  unprotectIntegrationConfig,
} from '@/lib/security/integration-credentials';

// ─── In-memory cache for heavy FA queries ───────────────────────────────────
const FAZ_CACHE_TTL = 5 * 60 * 1000; // 5 minutes default
type LogRow = Record<string, unknown>;
type ViewResult = NonNullable<Awaited<ReturnType<FortiAnalyzerService['getFortiView']>>>;
type CacheEntry<T> = { data: T; timestamp: number };
type FazGlobal = typeof globalThis & { fazCache?: Record<string, CacheEntry<LogRow[]>> };
type ViewGlobal<T> = typeof globalThis & { fortiviewCache?: Record<string, CacheEntry<T>> };

function getCached(key: string, ttlMs?: number) {
  const store = globalThis as FazGlobal;
  if (!store.fazCache) store.fazCache = {};
  const entry = store.fazCache[key];
  if (entry && Date.now() - entry.timestamp < (ttlMs ?? FAZ_CACHE_TTL)) return entry.data;
  return null;
}
function setCache(key: string, data: LogRow[]) {
  const store = globalThis as FazGlobal;
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
): Promise<LogRow[] | null> {
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
  const access = await authorizeApiRequest(request, 'settings', 'write');
  if (!access.allowed) return access.response;
  try {
    const body = await request.json();
    const { action, config: reqConfig } = body;

    if (action === 'test') {
      const parsed = validateBody(reqConfig || {}, fortianalyzerConfigSchema);
      if (!parsed.success) {
        return NextResponse.json({ success: false, connected: false, error: parsed.error });
      }
      const input = parsed.data;
      const mode = input.authMode ?? (input.apiKey || input.accessToken ? 'api-key' : 'session');
      const secret = mode === 'api-key' ? input.apiKey || input.accessToken : input.password;
      let saved: FortiAnalyzerProfileInput | undefined;
      if (!secret || secret === '********') {
        const existing = await prisma.integrationConfig.findFirst({ where: { type: 'FORTIANALYZER' } });
        if (existing) saved = unprotectIntegrationConfig<FortiAnalyzerProfileInput>(existing.config, 'FORTIANALYZER');
      }
      const profile = mergeFortiAnalyzerProfile(input, saved);
      const loggedIn = await FortiAnalyzerService.testConnection(profile);
      if (loggedIn) {
        return NextResponse.json({ success: true, connected: true });
      } else {
        return NextResponse.json({ success: false, connected: false, error: 'Bağlantı doğrulanamadı. Bilgileri ve hesap kilidini kontrol edin; bekleme süresi etkinse dolmasını bekleyin.' });
      }
    }

    if (action === 'save-config') {
      const parsed = validateBody(reqConfig || {}, fortianalyzerConfigSchema);
      if (!parsed.success) {
        return NextResponse.json({ success: false, error: parsed.error });
      }
      const existing = await prisma.integrationConfig.findFirst({ where: { type: 'FORTIANALYZER' } });
      const existingConfig = existing
        ? unprotectIntegrationConfig<FortiAnalyzerProfileInput>(existing.config, 'FORTIANALYZER') : undefined;
      const profile = mergeFortiAnalyzerProfile(parsed.data, existingConfig);
      const { accessToken, ...plainProfile } = profile;
      const newConfig: Record<string, unknown> = { ...plainProfile };
      if (profile.authMode === 'api-key') newConfig.apiKey = accessToken;
      const protectedConfig = protectIntegrationConfig<Record<string, unknown>>(
        newConfig,
        'FORTIANALYZER'
      );

      const saved = await prisma.integrationConfig.upsert({
        where: { type_name: { type: 'FORTIANALYZER', name: 'FortiAnalyzer' } },
        create: { type: 'FORTIANALYZER', name: 'FortiAnalyzer', enabled: true, config: protectedConfig as Prisma.InputJsonObject },
        update: { enabled: true, config: protectedConfig as Prisma.InputJsonObject },
      });

      // Explicit configuration recovery resets only this account's throttle.
      resetFortiAnalyzerLoginBackoff(profile);
      refreshFortiAnalyzerEventCache(fortiAnalyzerRevision(saved));
      (globalThis as typeof globalThis & { fazCache?: Record<string, unknown> }).fazCache = {};

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('FortiAnalyzer POST error:', error);
    return NextResponse.json({ success: false, connected: false, error: (error as Error).message },
      { status: error instanceof SourceQueryError && error.code === 'SOURCE_INVALID_CONFIG' ? 400 : 500 });
  }
}

export async function GET(request: NextRequest) {
  const access = await authorizeApiRequest(request, 'settings', 'read');
  if (!access.allowed) return access.response;
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
      const cfg = config.config as FortiAnalyzerProfileInput;
      return NextResponse.json({
        config: {
          host: cfg.host || '',
          username: cfg.username || '',
          adom: cfg.adom ?? 'root',
          authMode: cfg.authMode ?? (hasIntegrationCredential(config.config, 'FORTIANALYZER', 'apiKey') || hasIntegrationCredential(config.config, 'FORTIANALYZER', 'accessToken') ? 'api-key' : 'session'),
          passwordSet: hasIntegrationCredential(config.config, 'FORTIANALYZER', 'password'),
          apiKeySet: hasIntegrationCredential(config.config, 'FORTIANALYZER', 'apiKey') || hasIntegrationCredential(config.config, 'FORTIANALYZER', 'accessToken'),
        }
      });
    }

    if (!config) {
      return NextResponse.json({
        success: false,
        error: 'FortiAnalyzer integration not configured',
      });
    }

    const faConfig = readFortiAnalyzerProfile(config.config);
    const revision = fortiAnalyzerRevision(config);
    const service = initSharedFortiAnalyzerService(faConfig);

    // Login first
    const loggedIn = await service.login();
    if (!loggedIn) {
      return NextResponse.json({
        success: false,
        error: 'Failed to login to FortiAnalyzer',
      });
    }

    // Return data based on type
    let data: Awaited<ReturnType<typeof service.getStatus>> | LogRow[] | null = null;

    if (dataType === 'status') {
      data = await service.getStatus();
    } else if (dataType === 'adoms') {
      data = await service.getAdoms();
    } else if (dataType === 'events') {
      data = await service.getEventLogs(50);
      console.log('FortiAnalyzer event logs data:', JSON.stringify(data, null, 2));
    } else if (dataType === 'config-revisions') {
      // Admin system logs — 2-min server-side cache (data changes infrequently)
      const cacheKey = revision + ':config_revisions_500';
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
              AND: [fortiAnalyzerCacheFilter(revision)],
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
            user: (event.rawLog as Prisma.JsonObject)?.user || '',
            action: event.action || (event.rawLog as Prisma.JsonObject)?.action || '',
            msg: (event.rawLog as Prisma.JsonObject)?.msg || '',
            logdesc: (event.rawLog as Prisma.JsonObject)?.logdesc || '',
            srcip: (event.rawLog as Prisma.JsonObject)?.srcip || '',
            dstip: (event.rawLog as Prisma.JsonObject)?.dstip || '',
            status: (event.rawLog as Prisma.JsonObject)?.status || '',
            level: event.level || (event.rawLog as Prisma.JsonObject)?.level || '',
            ui: (event.rawLog as Prisma.JsonObject)?.ui || '',
            profile: (event.rawLog as Prisma.JsonObject)?.profile || '',
            devname: (event.rawLog as Prisma.JsonObject)?.devname || (event.rawLog as Prisma.JsonObject)?.dev_name || '',
            devid: (event.rawLog as Prisma.JsonObject)?.devid || '',
            cfgpath: (event.rawLog as Prisma.JsonObject)?.cfgpath || '',
            cfgattr: (event.rawLog as Prisma.JsonObject)?.cfgattr || '',
            cfgobj: (event.rawLog as Prisma.JsonObject)?.cfgobj || '',
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
      const cacheKey = `${revision}:ips_critical_${limit}`;

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
      const cacheKey = `${revision}:fortiview_single_${viewName}_${limit}_${sortField}_${rangeMinutes}`;
      const globalCache = globalThis as ViewGlobal<ViewResult>;
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
      throw new Error('FortiAnalyzer FortiView read failed');
    } else if (dataType === 'fortiview-batch') {
      // Batch FortiView: single login, multiple views sequentially
      const viewsParam = searchParams.get('views') || 'top-websites,top-browsing-users,policy-hits';
      const views = viewsParam.split(',');
      const limit = parseInt(searchParams.get('limit') || '50', 10);
      const sortField = searchParams.get('sort') || 'bandwidth';
      const rangeMinutes = parseInt(searchParams.get('range') || '240', 10);

      // Generate cache key from parameters
      const cacheKey = `${revision}:fortiview_batch_${viewsParam}_${limit}_${sortField}_${rangeMinutes}`;
      const globalCache = globalThis as ViewGlobal<Record<string, ViewResult>>;
      if (!globalCache.fortiviewCache) globalCache.fortiviewCache = {};
      
      // Check cache (5 minute TTL)
      const now = Date.now();
      const cached = globalCache.fortiviewCache[cacheKey];
      if (cached && (now - cached.timestamp) < 300000) {
        return NextResponse.json({ success: true, results: cached.data, type: dataType, cached: true });
      }

      const results: Record<string, { data: Array<Record<string, unknown>>; totalCount?: number }> = {};
      for (const viewName of views) {
        const result = await service.getFortiView(viewName.trim(), limit, { field: sortField, order: 'desc' }, undefined, rangeMinutes);
        if (!result) throw new Error('FortiAnalyzer FortiView batch read failed');
        results[viewName.trim()] = result;
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

    if (data === null || data === undefined) throw new Error('FortiAnalyzer read failed');
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
