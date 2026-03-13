/**
 * FortiAnalyzer Integration API Routes
 * 
 * GET /api/integrations/fortianalyzer?type=status - Get system status
 * GET /api/integrations/fortianalyzer?type=adoms - Get ADOMs
 */

import { NextRequest, NextResponse } from 'next/server';
import FortiAnalyzerService from '@/lib/integrations/fortianalyzer';
import { FortiGateService } from '@/lib/integrations/fortigate';
import { prisma } from '@/lib/prisma';

// ─── In-memory cache for heavy FA queries ───────────────────────────────────
const FAZ_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached(key: string) {
  const store = (globalThis as any);
  if (!store.fazCache) store.fazCache = {};
  const entry = store.fazCache[key];
  if (entry && Date.now() - entry.timestamp < FAZ_CACHE_TTL) return entry.data;
  return null;
}
function setCache(key: string, data: unknown) {
  const store = (globalThis as any);
  if (!store.fazCache) store.fazCache = {};
  store.fazCache[key] = { data, timestamp: Date.now() };
}
// ────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, config: reqConfig } = body;

    if (action === 'test') {
      const { host, username, password } = reqConfig as { host: string; username: string; password: string };
      const service = new FortiAnalyzerService({ host, username, password });
      const loggedIn = await service.login();
      if (loggedIn) {
        return NextResponse.json({ success: true, connected: true });
      } else {
        return NextResponse.json({ success: false, connected: false, error: 'Login failed — check credentials or account lock status' });
      }
    }

    if (action === 'save-config') {
      const { host, username, password } = reqConfig as { host: string; username: string; password?: string };

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

    const service = new FortiAnalyzerService({
      host: faConfig.host,
      username: faConfig.username || 'infrascope',
      password: faConfig.password || 'Thor.7485-app',
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
      // Admin system logs from FortiAnalyzer (login/logout, config changes - exclude perf-stats and empty users)
      const tid = await service.startLogSearch('event', 1000, 'subtype == system and action != perf-stats and user != ""');
      if (tid) {
        await new Promise(resolve => setTimeout(resolve, 6000));
        data = await service.fetchLogResults(tid, 0, 500);
      } else {
        data = [];
      }
    } else if (dataType === 'traffic') {
      const tid = await service.startLogSearch('traffic', 10);
      if (tid) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        data = await service.fetchLogResults(tid, 0, 10);
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
        // Poll up to 4 × 4s = 16s (reduced from 6 × 5s = 30s)
        for (let i = 0; i < 4; i++) {
          await new Promise(resolve => setTimeout(resolve, 4000));
          const logs = await service.fetchLogResults(tid, 0, limit);
          if (logs && logs.length > 0) {
            setCache(cacheKey, logs);
            const res = NextResponse.json({ success: true, data: logs, type: dataType, count: logs.length });
            res.headers.set('X-Cache', 'MISS');
            return res;
          }
        }
        // Final attempt
        const logs = await service.fetchLogResults(tid, 0, limit);
        if (logs && logs.length > 0) setCache(cacheKey, logs);
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
        for (let i = 0; i < 4; i++) {
          await new Promise(resolve => setTimeout(resolve, 5000));
          const logs = await service.fetchLogResults(tid, 0, limit);
          if (logs && logs.length > 0) {
            return NextResponse.json({ success: true, data: logs, count: logs.length });
          }
        }
        const logs = await service.fetchLogResults(tid, 0, limit);
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
