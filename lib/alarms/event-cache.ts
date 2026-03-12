/**
 * Event Cache Service
 * Background job to sync FortiAnalyzer events to PostgreSQL
 * Alarm checks query this cache instead of making live API calls
 */

import { prisma } from '@/lib/prisma';
import FortiAnalyzerService from '@/lib/integrations/fortianalyzer';

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
    console.log('[EventCache] Starting background sync job (base interval: 5 minutes, with backoff)...');

    // Initial sync — await it so callers can wait for a warm cache
    let initialSuccessCount = 0;
    try {
      initialSuccessCount = await this.syncAllEventTypes();
      if (initialSuccessCount > 0) {
        this.lastSyncTime = new Date();
        this.consecutiveSyncFailures = 0;
        console.log(`[EventCache] ✅ Initial sync completed (${initialSuccessCount}/7 logtypes)`);
      } else {
        this.consecutiveSyncFailures++;
        console.error('[EventCache] ❌ Initial sync — all logtypes failed, cache NOT marked fresh');
      }
    } catch (err) {
      this.consecutiveSyncFailures++;
      console.error('[EventCache] ❌ Initial sync threw:', err);
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
    console.log(`[EventCache] Next sync in ${delayMin}m (consecutive failures: ${this.consecutiveSyncFailures})`);

    setTimeout(async () => {
      if (this.syncInProgress) {
        console.warn('[EventCache] Previous sync still running, skipping this cycle...');
        this.consecutiveSyncFailures++;
        this.scheduleNextSync();
        return;
      }

      try {
        const successCount = await this.syncAllEventTypes();
        if (successCount > 0) {
          this.lastSyncTime = new Date();
          this.consecutiveSyncFailures = 0;
          console.log(`[EventCache] ✅ Sync completed at ${new Date().toISOString()} (${successCount}/7 logtypes) — failure counter reset`);
        } else {
          // All logtypes failed — do NOT update lastSyncTime.
          // The cache will become stale after FRESH_THRESHOLD_MS, forcing alarm checks
          // to use live FA queries (which will correctly fail and be reported as FAILED).
          this.consecutiveSyncFailures++;
          console.error(`[EventCache] ❌ Sync at ${new Date().toISOString()} — all logtypes failed, backing off (failure #${this.consecutiveSyncFailures})`);
        }
      } catch (error) {
        this.consecutiveSyncFailures++;
        console.error('[EventCache] ❌ Sync threw unexpectedly (failure #' + this.consecutiveSyncFailures + '):', error);
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

    const now = new Date();
    // Fetch last 24 hours - covers all alarm time windows (most alarms check 30-120 min, longest is 24h)
    const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000);

    console.log(`[EventCache] Starting sync: ${logtypes.length} logtypes, last 24 hours...`);

    try {
      // Pre-flight login check — one attempt before touching any logtype.
      // If FA is blocked/unreachable, abort the entire sync immediately instead of
      // making N separate login calls (each of which resets FA's block timer).
      console.log('[EventCache] Pre-flight login check...');
      const canLogin = await this.faService.login();
      if (!canLogin) {
        const elapsedS = Math.round((Date.now() - syncStart) / 1000);
        console.error(`[EventCache] ❌ Pre-flight login failed — aborting sync (${elapsedS}s). FA may be rate-limiting logins.`);
        return 0;
      }
      console.log('[EventCache] ✅ Pre-flight login OK — starting logtype sync...');

      for (const logtype of logtypes) {
        try {
          const logtypeStart = Date.now();
          await this.syncLogType(logtype, startTime, now);
          console.log(`[EventCache] ${logtype}: Sync took ${Date.now() - logtypeStart}ms`);
          successCount++;
        } catch (error) {
          console.error(`[EventCache] Failed to sync ${logtype}:`, error);
        }
      }

      // Cleanup: remove events older than 24 hours to keep DB size manageable
      try {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const deleted = await prisma.cachedEvent.deleteMany({
          where: { eventTime: { lt: cutoff } },
        });
        if (deleted.count > 0) {
          console.log(`[EventCache] Cleaned up ${deleted.count} expired events`);
        }
      } catch (cleanupError) {
        console.warn('[EventCache] Cleanup failed:', cleanupError);
      }

      console.log(`[EventCache] Full sync completed in ${Math.round((Date.now() - syncStart) / 1000)}s — ${successCount}/${logtypes.length} logtypes succeeded`);
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
    console.log(`[EventCache] Syncing ${logtype}...`);

    // Login to FortiAnalyzer
    const loggedIn = await this.faService.login();
    if (!loggedIn) {
      throw new Error('FortiAnalyzer login failed');
    }

    // Start log search (limit: 5000 events per logtype)
    const tid = await this.faService.startLogSearch(logtype, 5000, '');
    if (!tid) {
      console.warn(`[EventCache] No results for ${logtype}, skipping...`);
      return;
    }

    // CRITICAL: Poll for results - FortiAnalyzer processes searches asynchronously
    // Must wait for FA to finish indexing before fetching results
    let initialLogs: Array<Record<string, unknown>> | null = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // wait 5s between polls
      initialLogs = await this.faService.fetchLogResults(tid, 0, 1000);
      if (initialLogs && initialLogs.length > 0) {
        console.log(`[EventCache] ${logtype}: Got results after ${attempt + 1} poll(s)`);
        break;
      }
      console.log(`[EventCache] ${logtype}: Poll ${attempt + 1}/8 - waiting for FA...`);
    }

    if (!initialLogs || initialLogs.length === 0) {
      console.log(`[EventCache] ${logtype}: No results after polling, skipping`);
      return;
    }

    // Process first batch
    const recentLogsFirst = initialLogs.filter(log => {
      const eventTime = this.parseEventTime(log);
      return eventTime && eventTime >= startTime && eventTime <= endTime;
    });
    if (recentLogsFirst.length > 0) {
      await this.saveEvents(logtype, recentLogsFirst);
      console.log(`[EventCache] ${logtype}: Saved ${recentLogsFirst.length} events`);
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
          console.log(`[EventCache] ${logtype}: Saved ${recentLogs.length} more events (${totalFetched} total)`);
        }

        if (logs.length < limit) {
          break; // No more results
        }

        offset += limit;
      }
    }

    console.log(`[EventCache] ${logtype}: Sync complete - ${totalFetched} events saved`);
  }

  /**
   * Save events to database
   */
  private async saveEvents(logtype: string, logs: Array<Record<string, unknown>>) {
    const eventsToSave = logs.map(log => ({
      logtype,
      logId: String(log.logid || ''),
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
      vdom: String(log.vdom || ''),
      devname: String(log.devname || ''),
      policyid: Number(log.policyid) || undefined,
      service: String(log.service || ''),
      app: String(log.app || ''),
      appcat: String(log.appcat || ''),
      apprisk: String(log.apprisk || ''),
      srccountry: String(log.srccountry || ''),
      dstcountry: String(log.dstcountry || ''),
      msg: String(log.msg || ''),
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
   */
  private parseEventTime(log: Record<string, unknown>): Date | null {
    const eventTime = log.eventtime;
    if (!eventTime) {
      // Fallback: try itime field (format: "YYYY-MM-DD HH:MM:SS")
      const itime = log.itime as string | undefined;
      if (itime) return new Date(itime.replace(' ', 'T') + 'Z');
      return null;
    }

    // FortiAnalyzer eventtime is in NANOSECONDS (19-digit number)
    // e.g. 1772619793970881411 → divide by 1e6 to get milliseconds
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
   * Query cached events (replacement for live API calls)
   */
  async queryCachedEvents(filters: CachedEventFilters): Promise<Array<Record<string, unknown>>> {
    const { logtype, filter, startTime, endTime, limit = 1000 } = filters;
    // For cache queries, always fetch up to 1000 events regardless of the caller's limit.
    // The caller's limit was designed for live FA API calls (slow); for the local DB cache
    // (fast) we need all events in the window so the in-memory filter can find matches.
    const dbLimit = Math.max(limit, 1000);

    console.log(`[EventCache] Query: ${logtype} from ${startTime.toISOString()} to ${endTime.toISOString()}`);

    try {
      const events = await prisma.cachedEvent.findMany({
        where: {
          logtype,
          eventTime: {
            gte: startTime,
            lte: endTime,
          },
        },
        orderBy: {
          eventTime: 'desc',
        },
        take: dbLimit,
      });

      console.log(`[EventCache] Found ${events.length} cached events for ${logtype}`);

      // Apply client-side filter if provided
      if (filter) {
        const filtered = this.applyFilter(events, filter);
        console.log(`[EventCache] Filter matched ${filtered.length}/${events.length} for ${logtype} | filter: ${filter.substring(0, 60)}`);
        return filtered;
      }

      return events.map((e: any) => e.rawLog);
    } catch (error) {
      console.error('[EventCache] Query failed:', error);
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
