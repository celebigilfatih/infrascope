/**
 * Event Cache Service
 * Background job to sync FortiAnalyzer events to PostgreSQL
 * Alarm checks query this cache instead of making live API calls
 */

import { prisma } from '@/lib/prisma';
import type { CachedEvent, Prisma } from '@prisma/client';
import FortiAnalyzerService from '@/lib/integrations/fortianalyzer';
import { createLogger } from '@/lib/logger';
import { startFortiAnalyzerSearch, waitForFortiAnalyzerResults } from './queries/fortianalyzer-search';
import { FA_REVISION_FIELD, FA_TIME_VERSION_FIELD, fortiAnalyzerCacheFilter, nativeFortiAnalyzerLog } from '@/lib/integrations/fortianalyzer-revision';
import { FA_EVENT_TIME_VERSION, filterFortiAnalyzerTimeWindow, requireFortiAnalyzerEventTime } from './fortianalyzer-event-time';
import { SourceQueryError, withSourceDeadline } from '@/lib/integrations/source-query-error';

const log = createLogger('event-cache');
const SYNC_LOGTYPES = ['event', 'dns', 'traffic', 'webfilter', 'app-ctrl', 'attack', 'virus'];

export interface CachedEventFilters {
  logtype: string;
  filter?: string;
  startTime: Date;
  endTime: Date;
  limit?: number;
}

export class EventCacheService {
  private faService: FortiAnalyzerService;
  private readonly BASE_SYNC_INTERVAL_MS = 5 * 60 * 1000;  // Base interval: 5 minutes
  private readonly FRESH_THRESHOLD_MS = 8 * 60 * 1000; // Consider cache fresh for 8 min
  private readonly MAX_BACKOFF_MS = 60 * 60 * 1000;     // Max backoff: 60 minutes
  // FRESH_THRESHOLD > BASE_SYNC_INTERVAL gives a 3-min buffer so alarm checks never
  // see a stale cache just because both timers fired at the same moment.
  private lastSyncTime: Date | null = null;
  private readonly lastSyncByLogtype = new Map<string, Date>();
  private readonly failedLogtypes = new Set<string>();
  private syncInProgress = false;
  private consecutiveSyncFailures = 0;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly cancellation = new AbortController();
  private startPromise: Promise<number> | null = null;

  constructor(faService: FortiAnalyzerService, private readonly source: { revision?: string; beforeSync?: () => Promise<boolean> } = {}) {
    this.faService = faService;
  }

  assertActive(): void {
    if (this.stopped) throw new SourceQueryError('SOURCE_CONFIG_CHANGED', 'Event cache collector was retired');
  }

  getSourceFilter() { return fortiAnalyzerCacheFilter(this.source.revision); }
  getAbortSignal() { return this.cancellation.signal; }

  stop(): void {
    this.stopped = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.cancellation.abort();
    this.lastSyncTime = null;
    this.lastSyncByLogtype.clear();
  }

  /**
   * Compute next sync delay with exponential backoff on consecutive failures.
   * Failure 0 (success) → base interval (5 min)
   * Failure 1 → 10 min, Failure 2 → 20 min, Failure 3 → 40 min, Failure 4+ → 60 min
   */
  private nextSyncDelayMs(): number {
    if (this.consecutiveSyncFailures === 0) return this.BASE_SYNC_INTERVAL_MS;
    const backoff = this.BASE_SYNC_INTERVAL_MS * Math.pow(2, this.consecutiveSyncFailures);
    return Math.min(backoff, this.MAX_BACKOFF_MS);
  }

  /**
   * Start background sync job.
   * Uses dynamic setTimeout (not fixed setInterval) so the interval backs off
   * exponentially when FA is unreachable, preventing login-block hammering.
   * Returns a Promise that resolves with the initial sync success count so callers
   * can await the first sync before evaluating alarms against the cache.
   */
  async startBackgroundSync(): Promise<number> {
    if (this.stopped) return 0;
    return this.startPromise ??= this.start();
  }

  private async start(): Promise<number> {
    log.info('Starting background sync job (base interval: 5 minutes, with backoff)...');

    // Initial sync — await it so callers can wait for a warm cache
    let initialSuccessCount = 0;
    try {
      initialSuccessCount = await this.syncAllEventTypes();
      if (initialSuccessCount > 0) {
        this.lastSyncTime = new Date();
        this.consecutiveSyncFailures = this.getCacheStatus().isFresh ? 0 : this.consecutiveSyncFailures + 1;
        log.info({ successCount: initialSuccessCount, totalLogtypes: 7 }, 'Initial sync completed');
      } else {
        this.consecutiveSyncFailures++;
        log.error('Initial sync — all logtypes failed, cache NOT marked fresh');
      }
    } catch (err) {
      this.consecutiveSyncFailures++;
      log.error({ err }, 'Initial sync threw');
    }

    // Schedule recurring syncs in the background (non-blocking)
    this.scheduleNextSync();

    return initialSuccessCount;
  }

  /**
   * Schedule the next sync using exponential backoff.
   * Called recursively after each sync completes.
   */
  private scheduleNextSync() {
    if (this.stopped) return;
    const delayMs = this.nextSyncDelayMs();
    const delayMin = Math.round(delayMs / 60000);
    log.info({ delayMin, consecutiveFailures: this.consecutiveSyncFailures }, 'Next sync scheduled');

    this.timer = setTimeout(async () => {
      this.timer = undefined;
      if (this.stopped) return;
      if (this.syncInProgress) {
        log.warn('Previous sync still running, skipping this cycle');
        this.consecutiveSyncFailures++;
        this.scheduleNextSync();
        return;
      }

      try {
        const successCount = await this.syncAllEventTypes();
        if (successCount > 0) {
          this.lastSyncTime = new Date();
          this.consecutiveSyncFailures = this.getCacheStatus().isFresh ? 0 : this.consecutiveSyncFailures + 1;
          log.info({ successCount, failedLogtypes: [...this.failedLogtypes] }, 'Sync cycle completed');
        } else {
          // All logtypes failed — do NOT update lastSyncTime.
          // Failed logtypes are immediately unavailable, forcing live queries.
          this.consecutiveSyncFailures++;
          log.error({ consecutiveFailures: this.consecutiveSyncFailures }, 'All logtypes failed, backing off');
        }
      } catch (error) {
        this.consecutiveSyncFailures++;
        log.error({ err: error, consecutiveFailures: this.consecutiveSyncFailures }, 'Sync threw unexpectedly');
      }

      this.scheduleNextSync();
    }, delayMs);
  }

  /**
   * Sync all event types used by alarms.
   * Returns the number of logtypes that synced successfully.
   * Per-logtype coverage is established only after completed searches and writes;
   * targeted event failures invalidate event coverage even if the general scan succeeded.
   *
   * Pre-flight: attempts login ONCE before the loop. If login fails, aborts
   * immediately (avoids N separate login attempts, each resetting FA's block timer).
   */
  private async syncAllEventTypes(): Promise<number> {
    if (this.stopped) return 0;
    this.syncInProgress = true;
    const syncStart = Date.now();
    let successCount = 0;
    
    const logtypes = SYNC_LOGTYPES;
    
    // Targeted filters for high-priority alarm types that may get crowded out in general sync
    // NOTE: FA API ignores 'subtype == user' filter (returns 0 TID) — use 'action == auth-logon' directly
    // NOTE: FA API may also ignore 'action == ssl-login-fail' — 'subtype == vpn' ensures ALL vpn events
    //       are captured (including ssl-login-fail, ssl-exit-error, ssl-alert, tunnel-up/down, etc.)
    const targetedEventFilters = [
      'action == auth-logon',                           // SSL-VPN user logon events (subtype=user)
      'subtype == system',                              // Config changes: policy, address objects, interfaces, routing, etc.
      'action == login',                                // Admin login attempts (both success and failed) - will filter for failed in-memory
      'subtype == vpn',                                 // ALL SSL-VPN events incl. ssl-login-fail, ssl-exit-error, ssl-alert
    ];

    const now = new Date();
    // Fetch last 24 hours - covers all alarm time windows (most alarms check 30-120 min, longest is 24h)
    const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000);

    log.info({ logtypeCount: logtypes.length }, 'Starting sync: last 24 hours');

    try {
      if (this.source.beforeSync && !await this.source.beforeSync()) return 0;
      this.assertActive();
      // Pre-flight login check — one attempt before touching any logtype.
      // If FA is blocked/unreachable, abort the entire sync immediately instead of
      // making N separate login calls (each of which resets FA's block timer).
      log.info('Pre-flight login check');
      const canLogin = await withSourceDeadline(() => this.faService.login(), 60_000, this.cancellation.signal);
      this.assertActive();
      if (!canLogin) {
        logtypes.forEach(type => this.failedLogtypes.add(type));
        const elapsedS = Math.round((Date.now() - syncStart) / 1000);
        log.error({ elapsedS }, 'Pre-flight login failed — aborting sync. FA may be rate-limiting logins');
        return 0;
      }
      log.info('Pre-flight login OK — starting logtype sync');

      for (const logtype of logtypes) {
        this.assertActive();
        try {
          const logtypeStart = Date.now();
          await this.syncLogType(logtype, startTime, now);
          this.assertActive();
          this.lastSyncByLogtype.set(logtype, new Date());
          this.failedLogtypes.delete(logtype);
          log.info({ logtype, durationMs: Date.now() - logtypeStart }, 'Sync completed for logtype');
          successCount++;
        } catch (error) {
          this.failedLogtypes.add(logtype);
          log.error({ err: error, logtype }, 'Failed to sync logtype');
        }
      }

      // Sync targeted event filters for high-priority alarms (auth-logon, etc.)
      // These events may get crowded out by high-volume event types in the general sync
      for (const filter of targetedEventFilters) {
        this.assertActive();
        try {
          const filterStart = Date.now();
          await this.syncLogTypeWithFilter('event', filter, startTime, now);
          log.info({ logtype: 'event', filter, durationMs: Date.now() - filterStart }, 'Targeted sync completed');
        } catch (error) {
          this.failedLogtypes.add('event');
          log.error({ err: error, logtype: 'event', filter }, 'Failed to sync event with filter');
        }
      }

      // Cleanup: remove events older than 24 hours to keep DB size manageable
      try {
        this.assertActive();
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const deleted = await prisma.cachedEvent.deleteMany({
          where: { logtype: { in: SYNC_LOGTYPES }, eventTime: { lt: cutoff } },
        });
        if (deleted.count > 0) {
          log.info({ count: deleted.count }, 'Cleaned up expired events');
        }
      } catch (cleanupError) {
        log.warn({ err: cleanupError }, 'Cleanup failed');
      }

      log.info({ durationS: Math.round((Date.now() - syncStart) / 1000), successCount, totalLogtypes: logtypes.length }, 'Full sync completed');
      return successCount;
    } catch (error) {
      logtypes.forEach(type => this.failedLogtypes.add(type));
      throw error;
    } finally {
      // CRITICAL: always release the lock, even if an unexpected error escapes all inner catches.
      // Without finally, any uncaught exception leaves syncInProgress=true forever,
      // silently killing all future sync cycles.
      this.syncInProgress = false;
    }
  }


  /**
   * Sync a single log type
   */
  private async syncLogType(logtype: string, startTime: Date, endTime: Date) {
    this.assertActive();
    log.info({ logtype }, 'Syncing logtype');

    // Login to FortiAnalyzer
    const loggedIn = await withSourceDeadline(() => this.faService.login(), 60_000, this.cancellation.signal);
    this.assertActive();
    if (!loggedIn) {
      throw new Error('FortiAnalyzer login failed');
    }

    // Start log search (limit: 5000 events per logtype)
    const tid = await startFortiAnalyzerSearch(this.faService, logtype, 5000, '', this.cancellation.signal);
    const pollOptions = { attempts: 8, intervalMs: 5000, timeoutMs: 60_000, signal: this.cancellation.signal };
    const initialLogs = await waitForFortiAnalyzerResults(this.faService, tid, 1000, pollOptions);

    // Process first batch
    const recentLogsFirst = filterFortiAnalyzerTimeWindow(initialLogs, startTime, endTime);
    if (recentLogsFirst.length > 0) {
      await this.saveEvents(logtype, recentLogsFirst);
      log.info({ logtype, count: recentLogsFirst.length }, 'Saved events');
    }

    let totalFetched = recentLogsFirst.length;

    // Continue pagination if more results available
    if (initialLogs.length >= 1000) {
      let offset = 1000;
      const limit = 1000;

      while (offset < 5000) {
        const logs = await waitForFortiAnalyzerResults(this.faService, tid, limit, { ...pollOptions, offset });

        if (logs.length === 0) {
          break;
        }

        // Filter by time range and save to DB
        const recentLogs = filterFortiAnalyzerTimeWindow(logs, startTime, endTime);

        if (recentLogs.length > 0) {
          await this.saveEvents(logtype, recentLogs);
          totalFetched += recentLogs.length;
          log.info({ logtype, count: recentLogs.length, totalFetched }, 'Saved more events');
        }

        if (logs.length < limit) {
          break; // No more results
        }

        offset += limit;
      }
    }

    log.info({ logtype, totalFetched }, 'Sync complete');
  }

  /**
   * Sync a single log type with a specific filter (targeted sync for high-priority events)
   */
  private async syncLogTypeWithFilter(logtype: string, filter: string, startTime: Date, endTime: Date) {
    this.assertActive();
    log.info({ logtype, filter }, 'Syncing logtype with filter');

    // Login to FortiAnalyzer
    const loggedIn = await withSourceDeadline(() => this.faService.login(), 60_000, this.cancellation.signal);
    this.assertActive();
    if (!loggedIn) {
      throw new Error('FortiAnalyzer login failed');
    }

    // Start log search with filter (limit: 1000 events - FortiAnalyzer max)
    const tid = await startFortiAnalyzerSearch(this.faService, logtype, 1000, filter, this.cancellation.signal);
    const logs = await waitForFortiAnalyzerResults(this.faService, tid, 1000, {
      attempts: 6, intervalMs: 3000, timeoutMs: 40_000, signal: this.cancellation.signal,
    });

    // Filter by time range and save
    let recentLogs = filterFortiAnalyzerTimeWindow(logs, startTime, endTime);

    // For login events, also filter for failed attempts in-memory
    // (FortiAnalyzer filter syntax may not support msg ~ failed)
    if (filter === 'action == login') {
      recentLogs = recentLogs.filter(log => {
        const msg = String(log.msg || '').toLowerCase();
        return msg.includes('failed') || msg.includes('invalid');
      });
    }

    if (recentLogs.length > 0) {
      await this.saveEvents(logtype, recentLogs);
      log.info({ logtype, filter, count: recentLogs.length }, 'Saved targeted events');
    } else {
      log.info({ logtype, filter }, 'No events in time range');
    }
  }

  /**
   * Save events to database
   */
  private async saveEvents(logtype: string, logs: Array<Record<string, unknown>>) {
    this.assertActive();
    const eventsToSave = logs.map(log => ({
      logtype,
      // IMPORTANT: FortiGate uses static logid per event TYPE (e.g. all auth-logon = '0102043039')
      // We must combine logid + eventtime (nanosecond) to get a unique key per event instance
      logId: (this.source.revision ? this.source.revision + ':' : '') + String(log.logid || '') + '-' + String(log.eventtime ?? log.itime_t ?? JSON.stringify([log.itime, log.date, log.time, log.tz])),
      eventTime: requireFortiAnalyzerEventTime(log),
      srcIp: String(log.srcip || ''),
      dstIp: String(log.dstip || ''),
      srcPort: Number(log.srcport) || undefined,
      dstPort: Number(log.dstport) || undefined,
      proto: Number(log.proto) || undefined,
      user: String(log.user || ''),
      action: String(log.action || ''),
      level: String(log.level || ''),
      subtype: String(log.subtype || ''),
      devid: String(log.devid || '').trim().toUpperCase() || undefined,
      vdom: String(log.vdom || log.vd || 'root').trim().toLowerCase(),
      devname: String(log.devname || ''),
      policyid: Number(log.policyid) || undefined,
      service: String(log.service || ''),
      app: String(log.app || ''),
      appcat: String(log.appcat || ''),
      apprisk: String(log.apprisk || ''),
      srccountry: String(log.srccountry || ''),
      dstcountry: String(log.dstcountry || ''),
      msg: String(log.msg || '').includes('%') ? decodeURIComponent(String(log.msg || '')) : String(log.msg || ''),
      rawLog: { ...log, [FA_TIME_VERSION_FIELD]: FA_EVENT_TIME_VERSION,
          ...(this.source.revision ? { [FA_REVISION_FIELD]: this.source.revision } : {}) } as Prisma.InputJsonObject,
    }));

    // Bulk insert with upsert (avoid duplicates)
    for (const event of eventsToSave) {
      const persist = () => {
        this.assertActive();
        return prisma.cachedEvent.upsert({
          where: {
            logtype_logId: {
              logtype: event.logtype,
              logId: event.logId,
            },
          },
          update: event,
          create: event,
        });
      };
      try {
        await persist();
      } catch (error) {
        // A concurrent upsert may race on the unique key. Retry once so that
        // even this case proves persistence; all other write failures propagate.
        if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'P2002') throw error;
        await persist();
      }
    }
  }

  /**
   * Extract filter conditions from a FortiAnalyzer-style filter string that can be
   * pushed to the DB WHERE clause. Returns a Prisma-compatible where fragment.
   * Supports:
   *   - Equality:  action == auth-logon       → { action: 'auth-logon' }
   *   - LIKE:      msg like %attribute%       → { msg: { contains: 'attribute' } }
   *   - NOT LIKE:  msg not like %attribute%   → { msg: { not: { contains: 'attribute' } } }
   * Only fields mapped to DB columns are pushed; others are left for client-side filtering.
   */
  private extractDbFilters(filter: string): Record<string, unknown> {
    const COLUMN_FIELDS = new Set(['action', 'subtype', 'user', 'vdom', 'level', 'devname', 'msg', 'service', 'app', 'apprisk', 'srccountry', 'dstcountry']);
    const dbFilters: Record<string, unknown> = {};

    const conditions = filter.split(/&&|\band\b/i).map(c => c.trim());
    for (const cond of conditions) {
      // Try LIKE / NOT LIKE first
      const likeMatch = cond.match(/^(\w+)\s+(not\s+like|like)\s+["']?(%?[^"'\s%]+%?)["']?$/i);
      if (likeMatch) {
        const [, field, op, pattern] = likeMatch;
        const fieldName = field.toLowerCase();
        if (COLUMN_FIELDS.has(fieldName)) {
          // Strip % wildcards → Prisma contains
          const term = pattern.replace(/%/g, '');
          if (op.toLowerCase().includes('not')) {
            dbFilters[fieldName] = { not: { contains: term, mode: 'insensitive' } };
          } else {
            dbFilters[fieldName] = { contains: term, mode: 'insensitive' };
          }
        }
        continue;
      }

      // Equality: field == value
      const eqMatch = cond.match(/^(\w+)\s*==\s*["']?([^"'\s]+)["']?$/);
      if (eqMatch) {
        const [, field, value] = eqMatch;
        const fieldName = field.toLowerCase();
        if (COLUMN_FIELDS.has(fieldName)) {
          dbFilters[fieldName] = value;
        }
      }
    }

    return dbFilters;
  }

  /**
   * Query cached events (replacement for live API calls)
   */
  async queryCachedEvents(filters: CachedEventFilters): Promise<Array<Record<string, unknown>>> {
    this.assertActive();
    const { logtype, filter, startTime, endTime, limit = 1000 } = filters;
    // For cache queries, fetch up to 5000 events — the DB is fast enough to handle this.
    // The caller's limit was designed for live FA API calls (slow); for the local DB cache
    // (fast) we need all events in the window so the in-memory filter can find matches.
    const dbLimit = Math.max(limit, 5000);

    log.info({ logtype, startTime, endTime }, 'Querying cached events');

    try {
      // Extract DB-level column filters from the filter string.
      // This pushes simple equality conditions (e.g. action==auth-logon) into the DB WHERE
      // clause so we don't accidentally miss events when >1000 rows exist in the time window.
      const dbColumnFilters = filter ? this.extractDbFilters(filter) : {};

      const events = await prisma.cachedEvent.findMany({
        where: {
          logtype,
          eventTime: {
            gte: startTime,
            lte: endTime,
          },
          ...dbColumnFilters,
          AND: [this.getSourceFilter()],
        },
        orderBy: {
          eventTime: 'desc',
        },
        take: dbLimit,
      });

      this.assertActive();

      log.info({ logtype, count: events.length, dbFilters: Object.keys(dbColumnFilters).length ? dbColumnFilters : undefined }, 'Found cached events');

      // Apply remaining client-side filter conditions (complex conditions not handled by DB)
      if (filter) {
        const filtered = this.applyFilter(events, filter);
        log.info({ logtype, matched: filtered.length, total: events.length, filter: filter.substring(0, 60) }, 'Filter matched events');
        return filtered;
      }

      return events.map(e => nativeFortiAnalyzerLog(e.rawLog));
    } catch (error) {
      log.error({ err: error }, 'Query failed');
      throw error;
    }
  }

  /**
   * Apply FortiAnalyzer-style filter to cached events
   */
  private applyFilter(
    events: Array<Pick<CachedEvent, 'rawLog'>>,
    filter: string
  ): Array<Record<string, unknown>> {
    // Filter parser — supports: ==, =, !=, <>, <, <=, >, >=, like, not like
    // AND can be written as "&&" or "and", OR as "or"
    // LIKE wildcards: %value% (contains), value% (startsWith), %value (endsWith)
    // Example: "subtype == system and logdesc like %attribute%"
    // Example: "cfgpath like %firewall.policy% and action != delete"

    return events.filter(event => {
      const rawLog = event.rawLog as Prisma.JsonObject;

      // Split into AND-clauses
      const conditions = filter.split(/&&|\band\b/i).map(c => c.trim());

      return conditions.every(condition => {
        const orConditions = condition.split(/\bor\b/i).map(c => c.trim());
        return orConditions.some(cond => {
          // Try LIKE / NOT LIKE first (two-word operator)
          const likeMatch = cond.match(/(\w+)\s+(not\s+like|like)\s+["']?(%?[^"'\s%]+%?)["']?/i);
          if (likeMatch) {
            const [, field, op, pattern] = likeMatch;
            const eventValue = String(rawLog[field] ?? '').toLowerCase();
            // Strip % wildcards to get the raw search term
            const term = pattern.replace(/%/g, '').toLowerCase();
            const contains = eventValue.includes(term);
            return op.toLowerCase().includes('not') ? !contains : contains;
          }

          // Standard comparison operators
          const match = cond.match(/(\w+)\s*(==|=|!=|<>|<=|>=|<|>)\s*["']?([^"'\s]+)["']?/);
          if (!match) return false;

          const [, field, operator, value] = match;
          const eventValue = rawLog[field];

          switch (operator) {
            case '==':
            case '=':
              return String(eventValue) === value;
            case '!=':
            case '<>':
              return String(eventValue) !== value;
            case '<':
              return Number(eventValue) < Number(value);
            case '<=':
              return Number(eventValue) <= Number(value);
            case '>':
              return Number(eventValue) > Number(value);
            case '>=':
              return Number(eventValue) >= Number(value);
            default:
              return false;
          }
        });
      });
    // Return rawLog objects (not Prisma model objects) — consistent with the no-filter path
    }).map(e => nativeFortiAnalyzerLog(e.rawLog));
  }

  /**
   * Force an immediate sync if the cache is stale.
   * - If a sync is already running: wait for it to finish (max 3 min) then return.
   * - Otherwise: trigger a full sync now and await its bounded source requests.
   * Non-throwing: records failed coverage and logs warnings. Callers must inspect
   * freshness and use the live source when coverage is unavailable.
   */
  async forceSync(): Promise<void> {
    this.assertActive();
    if (this.syncInProgress) {
      log.info('forceSync: sync already in progress — waiting for completion (max 3 min)');
      const deadline = Date.now() + 3 * 60 * 1000;
      while (!this.stopped && this.syncInProgress && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      if (this.syncInProgress) {
        log.warn('forceSync: timed out waiting for running sync');
      } else {
        log.info('forceSync: running sync completed');
      }
      return;
    }

    log.info('forceSync: triggering immediate sync');
    try {
      const successCount = await this.syncAllEventTypes();
      if (successCount > 0) {
        this.lastSyncTime = new Date();
        this.consecutiveSyncFailures = this.getCacheStatus().isFresh ? 0 : this.consecutiveSyncFailures + 1;
        log.info({ successCount, totalLogtypes: 7 }, 'forceSync completed');
      } else {
        this.consecutiveSyncFailures++;
        log.warn('forceSync: all logtypes failed — cache remains stale');
      }
    } catch (err) {
      this.consecutiveSyncFailures++;
      log.warn({ err }, 'forceSync: threw unexpectedly');
    }
  }

  /**
   * Get cache status
   */
  getCacheStatus(logtype?: string) {
    const nextDelayMs = this.nextSyncDelayMs();
    const isTypeFresh = (type: string) => {
      const lastSync = this.lastSyncByLogtype.get(type);
      return Boolean(lastSync && !this.failedLogtypes.has(type) && Date.now() - lastSync.getTime() < this.FRESH_THRESHOLD_MS);
    };
    return {
      lastSyncTime: logtype ? this.lastSyncByLogtype.get(logtype) ?? null : this.lastSyncTime,
      isFresh: !this.stopped && (logtype ? isTypeFresh(logtype) : SYNC_LOGTYPES.every(isTypeFresh)),
      stopped: this.stopped,
      sourceRevision: this.source.revision ?? null,
      failedLogtypes: [...this.failedLogtypes],
      syncInProgress: this.syncInProgress,
      consecutiveSyncFailures: this.consecutiveSyncFailures,
      nextSyncDelayMin: Math.round(nextDelayMs / 60000),
    };
  }
}

export default EventCacheService;
