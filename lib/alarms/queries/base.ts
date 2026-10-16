/**
 * Alarm Query Layer — Core Infrastructure
 *
 * Provides:
 *  - runAlarmQuery(): cache-first with FA fallback, stats logging
 *  - queryCache(): Prisma query with DB-level WHERE + JSONB path filters
 *  - queryFortiAnalyzerDirect(): live FA query with polling
 *  - timeWindow(): builds { gte, lte } for Prisma eventTime filter
 */

import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import type FortiAnalyzerService from '@/lib/integrations/fortianalyzer';
import type { AlarmQueryContext, QueryResult, QueryStats, CachedEventWhere } from './types';
import { createLogger } from '@/lib/logger';
import { startFortiAnalyzerSearch, waitForFortiAnalyzerResults } from './fortianalyzer-search';
import { fortiAnalyzerCacheFilter, nativeFortiAnalyzerLog } from '@/lib/integrations/fortianalyzer-revision';
import { filterFortiAnalyzerTimeWindow } from '../fortianalyzer-event-time';

const log = createLogger('alarm-queries');

// ─── Public Helpers ───────────────────────────────────────────────────────────

/** Build a time window object for Prisma eventTime filtering */
export function timeWindow(minutes: number): { gte: Date; lte: Date } {
  const now = Date.now();
  return {
    gte: new Date(now - minutes * 60 * 1000),
    lte: new Date(now),
  };
}

// ─── Core Query Runner ────────────────────────────────────────────────────────

/**
 * Runs an alarm query with cache-first strategy and FortiAnalyzer fallback.
 *
 * Strategy:
 *  1. If cache is fresh AND not bypassed → run cacheQueryFn (fast Prisma WHERE query)
 *  2. If cache is stale/bypassed or its read fails → run faQueryFn (live FortiAnalyzer API)
 *  3. If cache query returns 0 events   → optionally fall back to FA (soft fallback)
 *
 * All outcomes are logged with source, count, and duration.
 */
export async function runAlarmQuery(
  ctx: AlarmQueryContext,
  queryDescription: string,
  cacheQueryFn: () => Promise<Array<Record<string, unknown>>>,
  faQueryFn: (fa: FortiAnalyzerService) => Promise<Array<Record<string, unknown>>>,
  options: {
    /** If cache returns 0 events AND this is true, also try FA as a safety net */
    softFallback?: boolean;
    /** Authoritative integration database; independent of FortiAnalyzer cache health. */
    databaseOnly?: boolean;
  } = {}
): Promise<QueryResult> {
  const start = Date.now();
  if (!options.databaseOnly) ctx.eventCache?.assertActive?.();
  const useCache = options.databaseOnly || (!ctx.bypassCache && ctx.cacheIsFresh && ctx.eventCache != null);

  let cachedEvents: Array<Record<string, unknown>> | undefined;
  if (useCache) {
    try {
      cachedEvents = await cacheQueryFn();
      if (!options.databaseOnly) ctx.eventCache?.assertActive?.();
    } catch (cacheErr) {
      if (options.databaseOnly) throw cacheErr;
      ctx.eventCache?.assertActive?.();
      log.warn({ alarmCode: ctx.alarmCode, err: cacheErr }, 'Cache query failed, falling back to FA');
    }
  }

  if (cachedEvents && (cachedEvents.length > 0 || !options.softFallback || options.databaseOnly)) {
    const stats: QueryStats = {
      alarmCode: ctx.alarmCode, source: 'cache', eventCount: cachedEvents.length,
      durationMs: Date.now() - start, usedFallback: false, queryDescription,
    };
    log.info(stats, 'Cache query completed');
    return { events: cachedEvents, stats };
  }

  // Cache-read fallback and optional empty-cache verification run exactly once.
  // A failed verification cannot establish a successful empty result.
  // Live FortiAnalyzer query
  try {
    const events = await faQueryFn(ctx.faService);
    if (!options.databaseOnly) ctx.eventCache?.assertActive?.();
    const durationMs = Date.now() - start;
    const stats: QueryStats = {
      alarmCode: ctx.alarmCode,
      source: 'fortianalyzer',
      eventCount: events.length,
      durationMs,
      usedFallback: Boolean(useCache || ctx.eventCache || ctx.cacheIsFresh),
      queryDescription,
    };
    log.info(
      { alarmCode: ctx.alarmCode, eventCount: events.length, durationMs, queryDescription },
      'FA direct query completed'
    );
    return { events, stats };
  } catch (faErr) {
    const durationMs = Date.now() - start;
    log.error({ alarmCode: ctx.alarmCode, durationMs, err: faErr }, 'FA query FAILED');
    throw faErr;
  }
}

// ─── Cache Query ──────────────────────────────────────────────────────────────

/**
 * Query the cached_events table with DB-level WHERE conditions.
 *
 * DESIGN PRINCIPLE:
 *  - All equality conditions on indexed columns → Prisma WHERE (uses index)
 *  - Substring/contains on JSONB fields (logdesc, cfgpath) → Prisma rawLog path filter
 *  - NEVER fetches a large batch then filters in Node.js
 *
 * @param where    Typed WHERE clause (columns + JSONB path conditions)
 * @param limit    Max rows to return (default 500 — enough for any alarm threshold)
 */
export async function queryCache(
  where: CachedEventWhere,
  limit = 500,
  ctx?: AlarmQueryContext,
): Promise<Array<Record<string, unknown>>> {
  const rows = await prisma.cachedEvent.findMany({
    where: { AND: [where as Prisma.CachedEventWhereInput, ctx?.eventCache?.getSourceFilter() ?? fortiAnalyzerCacheFilter()] },
    orderBy: { eventTime: 'desc' },
    take: limit,
    select: { rawLog: true },
  });
  // Return rawLog objects — consistent with the rest of the alarm engine
  ctx?.eventCache?.assertActive();
  return rows.map(r => nativeFortiAnalyzerLog(r.rawLog));
}

// ─── FortiAnalyzer Direct Query ───────────────────────────────────────────────

/**
 * Run a live FortiAnalyzer log search and poll for results.
 *
 * Uses the FA async search pattern:
 *  1. startLogSearch() → returns TID (transaction ID)
 *  2. Poll fetchLogResults() until the search completes (bounded attempts/deadline)
 *  3. Filter results by time window (FA doesn't always respect start_time)
 *
 * @param fa            FortiAnalyzer service instance
 * @param logtype       FA log type: event, dns, traffic, attack, virus, app-ctrl
 * @param filter        FA LogView filter expression
 * @param windowMinutes Time window to filter results (events older than this are discarded)
 * @param limit         Max events to request from FA
 */
export async function queryFortiAnalyzerDirect(
  fa: FortiAnalyzerService,
  logtype: string,
  filter: string,
  windowMinutes: number,
  limit = 500,
  ctx?: AlarmQueryContext,
): Promise<Array<Record<string, unknown>>> {
  const signal = ctx?.eventCache?.getAbortSignal?.();
  const window = timeWindow(windowMinutes);
  const tid = await startFortiAnalyzerSearch(fa, logtype, limit, filter, signal);
  const logs = await waitForFortiAnalyzerResults(fa, tid, limit, { signal });

  // Filter by time window (FA may return older events beyond our window)
  let filtered = filterFortiAnalyzerTimeWindow(logs, window.gte, window.lte);

  // For login events, also filter for failed attempts in-memory
  // (FortiAnalyzer filter syntax may not support msg ~ failed)
  if (filter.includes('action == login')) {
    filtered = filtered.filter(log => {
      const msg = String(log.msg || '').toLowerCase();
      return msg.includes('failed') || msg.includes('invalid');
    });
  }

  return filtered;
}
