/**
 * Alarm Query Layer — Shared Types
 *
 * Each alarm has a dedicated query function that:
 *  - Filters at the DB level (WHERE, not in-memory)
 *  - Uses JSONB path filters for fields not mapped to columns
 *  - Falls back to live FortiAnalyzer when cache is stale/empty
 *  - Returns observable stats (source, count, duration)
 */

import type { EventCacheService } from '../event-cache';
import type FortiAnalyzerService from '@/lib/integrations/fortianalyzer';

// ─── Context ─────────────────────────────────────────────────────────────────

/**
 * Everything a query function needs to execute.
 * Passed by the detection engine on each invocation.
 */
export interface AlarmQueryContext {
  /** Alarm code — used in log messages */
  alarmCode: string;

  /** How far back to query (minutes). Comes from alarm.detectionLogic.timeWindowMinutes */
  timeWindowMinutes: number;

  /** Shared event cache singleton. May be null if cache failed to initialize. */
  eventCache: EventCacheService | null;

  /** Whether the cache is considered fresh (last sync < 8 minutes ago) */
  cacheIsFresh: boolean;

  /** Live FortiAnalyzer service for fallback queries */
  faService: FortiAnalyzerService;

  /**
   * Force a live FortiAnalyzer query even if cache is fresh.
   * Use for ALARM_CRITICAL alarms that demand real-time accuracy.
   */
  bypassCache?: boolean;
}

// ─── Result ───────────────────────────────────────────────────────────────────

/**
 * Observable per-query stats logged to console after every evaluation.
 * Format: { alarmType, source, eventCount, durationMs, usedFallback }
 */
export interface QueryStats {
  alarmCode: string;
  /** Where the data came from */
  source: 'cache' | 'fortianalyzer';
  eventCount: number;
  durationMs: number;
  /** true when cache was stale/empty and we fell back to live FA */
  usedFallback: boolean;
  /** Prisma WHERE clause summary for debugging */
  queryDescription?: string;
}

/** Return type for every alarm query function */
export interface QueryResult {
  events: Array<Record<string, unknown>>;
  stats: QueryStats;
}

// ─── Function signature ───────────────────────────────────────────────────────

/**
 * Every alarm query function implements this signature.
 * Register in ALARM_QUERY_REGISTRY (index.ts) to activate.
 */
export type AlarmQueryFn = (ctx: AlarmQueryContext) => Promise<QueryResult>;

// ─── Prisma cache query shape ─────────────────────────────────────────────────

/**
 * Strongly-typed Prisma WHERE fragment for cached_events.
 * All fields map directly to CachedEvent model columns.
 * Use AND: [] for JSONB path filters (rawLog).
 */
export interface CachedEventWhere {
  logtype: string;
  eventTime: { gte: Date; lte: Date };
  action?: string;
  subtype?: string;
  user?: string;
  level?: string;
  srcIp?: string;
  dstIp?: string;
  devname?: string;
  apprisk?: string;
  AND?: Array<{
    rawLog?: {
      path: string[];
      string_contains?: string;
      equals?: string;
    };
  }>;
  NOT?: Array<{
    rawLog?: {
      path: string[];
      string_contains?: string;
      equals?: string;
    };
  }>;
  OR?: Array<{
    rawLog?: {
      path: string[];
      string_contains?: string;
    };
  }>;
}
