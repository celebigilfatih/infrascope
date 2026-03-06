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
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private lastSyncTime: Date | null = null;
  private syncInProgress = false;

  constructor(faService: FortiAnalyzerService) {
    this.faService = faService;
  }

  /**
   * Start background sync job
   * Runs every 5 minutes to fetch fresh events
   */
  startBackgroundSync() {
    console.log('[EventCache] Starting background sync job (every 5 minutes)...');
    
    // Initial sync
    this.syncAllEventTypes().then(() => {
      console.log('[EventCache] ✅ Initial sync completed');
      this.lastSyncTime = new Date();
    });

    // Schedule recurring sync
    setInterval(async () => {
      if (this.syncInProgress) {
        console.warn('[EventCache] Previous sync still running, skipping...');
        return;
      }

      try {
        await this.syncAllEventTypes();
        this.lastSyncTime = new Date();
        console.log(`[EventCache] ✅ Sync completed at ${new Date().toISOString()}`);
      } catch (error) {
        console.error('[EventCache] ❌ Sync failed:', error);
      }
    }, this.CACHE_TTL_MS);
  }

  /**
   * Sync all event types used by alarms
   */
  private async syncAllEventTypes() {
    this.syncInProgress = true;
    
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

    for (const logtype of logtypes) {
      try {
        await this.syncLogType(logtype, startTime, now);
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

    this.syncInProgress = false;
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
      rawLog: log,
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
    return {
      lastSyncTime: this.lastSyncTime,
      isFresh: this.lastSyncTime 
        ? Date.now() - this.lastSyncTime.getTime() < this.CACHE_TTL_MS
        : false,
      syncInProgress: this.syncInProgress,
    };
  }
}

export default EventCacheService;
