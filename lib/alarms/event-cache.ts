/**
 * Event Cache Service
 * Background job to sync FortiAnalyzer events to PostgreSQL
 * Alarm checks query this cache instead of making live API calls
 */

import { prisma } from '@/lib/prisma';
import FortiAnalyzerService from '@/lib/integrations/fortianalyzer';
import { createLogger } from '@/lib/logger';

const log = createLogger('event-cache');

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
  private syncInProgress = false;
  private consecutiveSyncFailures = 0;

  constructor(faService: FortiAnalyzerService) {
    this.faService = faService;
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
    log.info('Starting background sync job (base interval: 5 minutes, with backoff)...');

    // Initial sync — await it so callers can wait for a warm cache
    let initialSuccessCount = 0;
    try {
      initialSuccessCount = await this.syncAllEventTypes();
      if (initialSuccessCount > 0) {
        this.lastSyncTime = new Date();
        this.consecutiveSyncFailures = 0;
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
    const delayMs = this.nextSyncDelayMs();
    const delayMin = Math.round(delayMs / 60000);
    log.info({ delayMin, consecutiveFailures: this.consecutiveSyncFailures }, 'Next sync scheduled');

    setTimeout(async () => {
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
          this.consecutiveSyncFailures = 0;
          log.info({ successCount, totalLogtypes: 7 }, 'Sync completed — failure counter reset');
        } else {
          // All logtypes failed — do NOT update lastSyncTime.
          // The cache will become stale after FRESH_THRESHOLD_MS, forcing alarm checks
          // to use live FA queries (which will correctly fail and be reported as FAILED).
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
   * Caller must only update lastSyncTime when successCount > 0,
   * otherwise the cache would appear fresh despite having stale/empty data.
   *
   * Pre-flight: attempts login ONCE before the loop. If login fails, aborts
   * immediately (avoids N separate login attempts, each resetting FA's block timer).
   */
  private async syncAllEventTypes(): Promise<number> {
    this.syncInProgress = true;
    const syncStart = Date.now();
    let successCount = 0;
    
    const logtypes = [
      'event',
      'dns',
      'traffic',
      'webfilter',
      'app-ctrl',
      'attack',
      'virus',
    ];
    
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
      // Pre-flight login check — one attempt before touching any logtype.
      // If FA is blocked/unreachable, abort the entire sync immediately instead of
      // making N separate login calls (each of which resets FA's block timer).
      log.info('Pre-flight login check');
      const canLogin = await this.faService.login();
      if (!canLogin) {
        const elapsedS = Math.round((Date.now() - syncStart) / 1000);
        log.error({ elapsedS }, 'Pre-flight login failed — aborting sync. FA may be rate-limiting logins');
        return 0;
      }
      log.info('Pre-flight login OK — starting logtype sync');

      for (const logtype of logtypes) {
        try {
          const logtypeStart = Date.now();
          await this.syncLogType(logtype, startTime, now);
          log.info({ logtype, durationMs: Date.now() - logtypeStart }, 'Sync completed for logtype');
          successCount++;
        } catch (error) {
          log.error({ err: error, logtype }, 'Failed to sync logtype');
        }
      }

      // Sync targeted event filters for high-priority alarms (auth-logon, etc.)
      // These events may get crowded out by high-volume event types in the general sync
      for (const filter of targetedEventFilters) {
        try {
          const filterStart = Date.now();
          await this.syncLogTypeWithFilter('event', filter, startTime, now);
          log.info({ logtype: 'event', filter, durationMs: Date.now() - filterStart }, 'Targeted sync completed');
        } catch (error) {
          log.error({ err: error, logtype: 'event', filter }, 'Failed to sync event with filter');
        }
      }

      // Cleanup: remove events older than 24 hours to keep DB size manageable
      try {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const deleted = await prisma.cachedEvent.deleteMany({
          where: { eventTime: { lt: cutoff } },
        });
        if (deleted.count > 0) {
          log.info({ count: deleted.count }, 'Cleaned up expired events');
        }
      } catch (cleanupError) {
        log.warn({ err: cleanupError }, 'Cleanup failed');
      }

      log.info({ durationS: Math.round((Date.now() - syncStart) / 1000), successCount, totalLogtypes: logtypes.length }, 'Full sync completed');
      return successCount;
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
    log.info({ logtype }, 'Syncing logtype');

    // Login to FortiAnalyzer
    const loggedIn = await this.faService.login();
    if (!loggedIn) {
      throw new Error('FortiAnalyzer login failed');
    }

    // Start log search (limit: 5000 events per logtype)
    const tid = await this.faService.startLogSearch(logtype, 5000, '');
    if (!tid) {
      log.warn({ logtype }, 'No results for logtype, skipping');
      return;
    }

    // CRITICAL: Poll for results - FortiAnalyzer processes searches asynchronously
    // Must wait for FA to finish indexing before fetching results
    let initialLogs: Array<Record<string, unknown>> | null = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // wait 5s between polls
      initialLogs = await this.faService.fetchLogResults(tid, 0, 1000);
      if (initialLogs && initialLogs.length > 0) {
        log.info({ logtype, polls: attempt + 1 }, 'Got results after polling');
        break;
      }
      log.info({ logtype, poll: attempt + 1, maxPolls: 8 }, 'Waiting for FA results');
    }

    if (!initialLogs || initialLogs.length === 0) {
      log.info({ logtype }, 'No results after polling, skipping');
      return;
    }

    // Process first batch
    const recentLogsFirst = initialLogs.filter(log => {
      const eventTime = this.parseEventTime(log);
      return eventTime && eventTime >= startTime && eventTime <= endTime;
    });
    if (recentLogsFirst.length > 0) {
      await this.saveEvents(logtype, recentLogsFirst);
      log.info({ logtype, count: recentLogsFirst.length }, 'Saved events');
    }

    let totalFetched = recentLogsFirst.length;

    // Continue pagination if more results available
    if (initialLogs.length >= 1000) {
      let offset = 1000;
      const limit = 1000;

      while (totalFetched < 5000) {
        const logs = await this.faService.fetchLogResults(tid, offset, limit);

        if (!logs || logs.length === 0) {
          break;
        }

        // Filter by time range and save to DB
        const recentLogs = logs.filter(log => {
          const eventTime = this.parseEventTime(log);
          return eventTime && eventTime >= startTime && eventTime <= endTime;
        });

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
    log.info({ logtype, filter }, 'Syncing logtype with filter');

    // Login to FortiAnalyzer
    const loggedIn = await this.faService.login();
    if (!loggedIn) {
      throw new Error('FortiAnalyzer login failed');
    }

    // Start log search with filter (limit: 1000 events - FortiAnalyzer max)
    const tid = await this.faService.startLogSearch(logtype, 1000, filter);
    if (!tid) {
      log.warn({ logtype, filter }, 'No results for logtype with filter, skipping');
      return;
    }

    // Poll for results
    let logs: Array<Record<string, unknown>> | null = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 3000)); // wait 3s between polls
      logs = await this.faService.fetchLogResults(tid, 0, 1000);
      if (logs && logs.length > 0) {
        log.info({ logtype, filter, resultCount: logs.length, polls: attempt + 1 }, 'Got results after polling');
        break;
      }
      log.info({ logtype, filter, poll: attempt + 1, maxPolls: 6 }, 'Waiting for FA results');
    }

    if (!logs || logs.length === 0) {
      log.info({ logtype, filter }, 'No results after polling, skipping');
      return;
    }

    // Filter by time range and save
    let recentLogs = logs.filter(log => {
      const eventTime = this.parseEventTime(log);
      return eventTime && eventTime >= startTime && eventTime <= endTime;
    });

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
    const eventsToSave = logs.map(log => ({
      logtype,
      // IMPORTANT: FortiGate uses static logid per event TYPE (e.g. all auth-logon = '0102043039')
      // We must combine logid + eventtime (nanosecond) to get a unique key per event instance
      logId: String(log.logid || '') + '-' + String(log.eventtime || log.itime_t || ''),
      eventTime: this.parseEventTime(log) || new Date(),
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
      rawLog: log as any,
    }));

    // Bulk insert with upsert (avoid duplicates)
    for (const event of eventsToSave) {
      await prisma.cachedEvent.upsert({
        where: {
          logtype_logId: {
            logtype: event.logtype,
            logId: event.logId,
          },
        },
        update: event,
        create: event,
      }).catch(() => {
        // Ignore duplicate errors (race conditions)
      });
    }
  }

  /**
   * Parse event time from log
   * Priority order: itime_t (seconds) → itime (string) → eventtime (nanoseconds)
   * itime_t is most reliable as Unix timestamp; eventtime needs TZ adjustment
   */
  private parseEventTime(log: Record<string, unknown>): Date | null {
    // FIRST: Try itime_t (Unix timestamp in seconds - most reliable)
    const itime_t = log.itime_t;
    if (itime_t) {
      const ts = typeof itime_t === 'number' ? itime_t : Number(itime_t);
      if (ts > 1e9) return new Date(ts * 1000); // Convert seconds to ms
    }

    // SECOND: Try itime field (ISO string "YYYY-MM-DD HH:MM:SS" or Unix timestamp)
    const itime = log.itime as string | number | undefined;
    if (itime) {
      if (typeof itime === 'number') {
        if (itime > 1e9) return new Date(itime * 1000);
      } else {
        // itime is typically "2026-04-07 10:31:45"
        // FortiAnalyzer returns local time, but we parse as UTC+3 from tz field if present
        const tzStr = log.tz as string | undefined;
        const dateStr = itime.replace(' ', 'T') + 'Z'; // Treat as UTC for now
        const dt = new Date(dateStr);
        if (!isNaN(dt.getTime())) return dt;
      }
    }

    // THIRD: Fallback to eventtime (nanoseconds from FortiAnalyzer)
    const eventTime = log.eventtime;
    if (!eventTime) return null;

    const raw = typeof eventTime === 'number' ? eventTime : Number(eventTime);
    let ms: number;

    if (raw > 1e15) {
      // Nanoseconds → milliseconds
      ms = raw / 1e6;
    } else if (raw > 1e12) {
      // Already milliseconds
      ms = raw;
    } else {
      // Seconds → milliseconds
      ms = raw * 1000;
    }

    return new Date(ms);
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
  private extractDbFilters(filter: string): Record<string, any> {
    const COLUMN_FIELDS = new Set(['action', 'subtype', 'user', 'vdom', 'level', 'devname', 'msg', 'service', 'app', 'apprisk', 'srccountry', 'dstcountry']);
    const dbFilters: Record<string, any> = {};

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
        },
        orderBy: {
          eventTime: 'desc',
        },
        take: dbLimit,
      });

      log.info({ logtype, count: events.length, dbFilters: Object.keys(dbColumnFilters).length ? dbColumnFilters : undefined }, 'Found cached events');

      // Apply remaining client-side filter conditions (complex conditions not handled by DB)
      if (filter) {
        const filtered = this.applyFilter(events, filter);
        log.info({ logtype, matched: filtered.length, total: events.length, filter: filter.substring(0, 60) }, 'Filter matched events');
        return filtered;
      }

      return events.map((e: any) => e.rawLog);
    } catch (error) {
      log.error({ err: error }, 'Query failed');
      return [];
    }
  }

  /**
   * Apply FortiAnalyzer-style filter to cached events
   */
  private applyFilter(
    events: Array<any>,
    filter: string
  ): Array<any> {
    // Filter parser — supports: ==, =, !=, <>, <, <=, >, >=, like, not like
    // AND can be written as "&&" or "and", OR as "or"
    // LIKE wildcards: %value% (contains), value% (startsWith), %value (endsWith)
    // Example: "subtype == system and logdesc like %attribute%"
    // Example: "cfgpath like %firewall.policy% and action != delete"

    return events.filter(event => {
      const rawLog = event.rawLog;

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
    }).map((e: any) => e.rawLog);
  }

  /**
   * Force an immediate sync if the cache is stale.
   * - If a sync is already running: wait for it to finish (max 3 min) then return.
   * - Otherwise: trigger a full sync now and await it (max 3 min timeout).
   * Non-throwing: logs warnings but never propagates errors to the caller.
   */
  async forceSync(): Promise<void> {
    if (this.syncInProgress) {
      log.info('forceSync: sync already in progress — waiting for completion (max 3 min)');
      const deadline = Date.now() + 3 * 60 * 1000;
      while (this.syncInProgress && Date.now() < deadline) {
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
        this.consecutiveSyncFailures = 0;
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
  getCacheStatus() {
    const nextDelayMs = this.nextSyncDelayMs();
    return {
      lastSyncTime: this.lastSyncTime,
      isFresh: this.lastSyncTime 
        ? Date.now() - this.lastSyncTime.getTime() < this.FRESH_THRESHOLD_MS
        : false,
      syncInProgress: this.syncInProgress,
      consecutiveSyncFailures: this.consecutiveSyncFailures,
      nextSyncDelayMin: Math.round(nextDelayMs / 60000),
    };
  }
}

export default EventCacheService;
