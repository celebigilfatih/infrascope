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
import type FortiAnalyzerService from '@/lib/integrations/fortianalyzer';
import type { AlarmQueryContext, QueryResult, QueryStats, CachedEventWhere } from './types';

// ─── Public Helpers ───────────────────────────────────────────────────────────

/** Build a time window object for Prisma eventTime filtering */
export function timeWindow(minutes: number): { gte: Date; lte: Date } {
  return {
    gte: new Date(Date.now() - minutes * 60 * 1000),
    lte: new Date(),
  };
}

// ─── Core Query Runner ────────────────────────────────────────────────────────

/**
 * Runs an alarm query with cache-first strategy and FortiAnalyzer fallback.
 *
 * Strategy:
 *  1. If cache is fresh AND not bypassed → run cacheQueryFn (fast Prisma WHERE query)
 *  2. If cache is stale/empty/bypassed  → run faQueryFn (live FortiAnalyzer API)
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
  } = {}
): Promise<QueryResult> {
  const start = Date.now();
  const useCache = !ctx.bypassCache && ctx.cacheIsFresh && ctx.eventCache != null;

  if (useCache) {
    try {
      const events = await cacheQueryFn();
      const durationMs = Date.now() - start;
      const stats: QueryStats = {
        alarmCode: ctx.alarmCode,
        source: 'cache',
        eventCount: events.length,
        durationMs,
        usedFallback: false,
        queryDescription,
      };
      console.log(
        `[AlarmQuery] ${ctx.alarmCode}: cache — ${events.length} events (${durationMs}ms) | ${queryDescription}`
      );

      // Optional soft fallback: if cache says 0 but this is a critical alarm,
      // do a quick FA verification. Only fires when softFallback=true.
      if (events.length === 0 && options.softFallback) {
        console.log(`[AlarmQuery] ${ctx.alarmCode}: cache empty — soft fallback to FA...`);
        const faStart = Date.now();
        try {
          const faEvents = await faQueryFn(ctx.faService);
          if (faEvents.length > 0) {
            console.log(`[AlarmQuery] ${ctx.alarmCode}: FA found ${faEvents.length} events cache missed`);
            return {
              events: faEvents,
              stats: {
                ...stats,
                source: 'fortianalyzer',
                eventCount: faEvents.length,
                durationMs: Date.now() - start,
                usedFallback: true,
              },
            };
          }
        } catch (faErr) {
          console.warn(`[AlarmQuery] ${ctx.alarmCode}: soft FA fallback failed:`, faErr);
        }
        return { events: [], stats: { ...stats, durationMs: Date.now() - start } };
      }

      return { events, stats };
    } catch (cacheErr) {
      console.warn(`[AlarmQuery] ${ctx.alarmCode}: cache query failed, falling back to FA:`, cacheErr);
    }
  }

  // Live FortiAnalyzer query
  const faStart = Date.now();
  try {
    const events = await faQueryFn(ctx.faService);
    const durationMs = Date.now() - start;
    const stats: QueryStats = {
      alarmCode: ctx.alarmCode,
      source: 'fortianalyzer',
      eventCount: events.length,
      durationMs,
      usedFallback: useCache === false && ctx.cacheIsFresh, // we had fresh cache but bypassed it
      queryDescription,
    };
    console.log(
      `[AlarmQuery] ${ctx.alarmCode}: FA direct — ${events.length} events (${durationMs}ms) | ${queryDescription}`
    );
    return { events, stats };
  } catch (faErr) {
    const durationMs = Date.now() - start;
    console.error(`[AlarmQuery] ${ctx.alarmCode}: FA query FAILED (${durationMs}ms):`, faErr);
    return {
      events: [],
      stats: {
        alarmCode: ctx.alarmCode,
        source: 'fortianalyzer',
        eventCount: 0,
        durationMs,
        usedFallback: true,
        queryDescription,
      },
    };
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
  limit = 500
): Promise<Array<Record<string, unknown>>> {
  const rows = await prisma.cachedEvent.findMany({
    where: where as any, // Prisma's JSON filter typing requires `as any` for path conditions
    orderBy: { eventTime: 'desc' },
    take: limit,
    select: { rawLog: true },
  });
  // Return rawLog objects — consistent with the rest of the alarm engine
  return rows.map((r: any) => r.rawLog as Record<string, unknown>);
}

// ─── FortiAnalyzer Direct Query ───────────────────────────────────────────────

/**
 * Run a live FortiAnalyzer log search and poll for results.
 *
 * Uses the FA async search pattern:
 *  1. startLogSearch() → returns TID (transaction ID)
 *  2. Poll fetchLogResults() until results arrive (max N attempts × interval)
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
  limit = 500
): Promise<Array<Record<string, unknown>>> {
  // Wrap startLogSearch with a 10s timeout — FA occasionally hangs under load
  const startLogSearchWithTimeout = () =>
    Promise.race([
      fa.startLogSearch(logtype, limit, filter),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 10_000)),
    ]);

  const tid = await startLogSearchWithTimeout();
  if (!tid) {
    console.warn(`[AlarmQuery] FA: no TID returned for ${logtype} filter="${filter.substring(0, 80)}"`);
    return [];
  }

  // Poll up to 4 times × 2s = 8s max wait (well under the 25s batch timeout)
  const POLL_ATTEMPTS = 4;
  const POLL_INTERVAL_MS = 2000;
  let logs: Array<Record<string, unknown>> | null = null;

  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    logs = await fa.fetchLogResults(tid, 0, limit);
    if (logs && logs.length > 0) {
      console.log(`[AlarmQuery] FA ${logtype}: ${logs.length} results after ${attempt + 1} poll(s)`);
      break;
    }
  }

  if (!logs || logs.length === 0) return [];

  // Filter by time window (FA may return older events beyond our window)
  const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);
  let filtered = logs.filter(log => {
    const t = parseLogTimestamp(log);
    return t ? t >= cutoff : true; // if unparseable, keep it (safe default)
  });

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

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function parseLogTimestamp(log: Record<string, unknown>): Date | null {
  const raw = log.eventtime ?? log.itime_t;
  if (!raw) return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (Number.isNaN(n)) return null;
  // eventtime is nanoseconds; itime_t is seconds
  return new Date(n > 1e12 ? n / 1e6 : n * 1000);
}
