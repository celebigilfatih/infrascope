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
    // Fetch last 15 minutes to ensure we capture delayed events
    const startTime = new Date(Date.now() - 15 * 60 * 1000);

    console.log(`[EventCache] Starting sync: ${logtypes.length} logtypes, last 15 minutes...`);

    for (const logtype of logtypes) {
      try {
        await this.syncLogType(logtype, startTime, now);
      } catch (error) {
        console.error(`[EventCache] Failed to sync ${logtype}:`, error);
      }
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

    // Fetch results with pagination
    let offset = 0;
    const limit = 1000;
    let totalFetched = 0;

    while (totalFetched < 5000) { // Max 5000 events per logtype
      const logs = await this.faService.fetchLogResults(tid, offset, limit);
      
      if (!logs || logs.length === 0) {
        console.log(`[EventCache] ${logtype}: Fetched ${totalFetched} events`);
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
        console.log(`[EventCache] ${logtype}: Saved ${recentLogs.length} events (${totalFetched} total)`);
      }

      if (logs.length < limit) {
        break; // No more results
      }

      offset += limit;
    }
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
    if (!eventTime) return null;

    // FortiAnalyzer uses Unix timestamp (seconds or milliseconds)
    const timestamp = typeof eventTime === 'number' 
      ? eventTime > 1e12 ? eventTime : eventTime * 1000
      : new Date(eventTime as string).getTime();

    return new Date(timestamp);
  }

  /**
   * Query cached events (replacement for live API calls)
   */
  async queryCachedEvents(filters: CachedEventFilters): Promise<Array<Record<string, unknown>>> {
    const { logtype, filter, startTime, endTime, limit = 1000 } = filters;

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
        take: limit,
      });

      console.log(`[EventCache] Found ${events.length} cached events for ${logtype}`);

      // Apply client-side filter if provided
      if (filter) {
        return this.applyFilter(events, filter);
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
    // Simple filter parser (supports basic operators)
    // Example: "level=3 && action=logon"
    // Example: "qtype == TXT or qtype == NULL"
    
    return events.filter(event => {
      const rawLog = event.rawLog;
      
      // Parse filter conditions
      const conditions = filter.split(/&&|and/i).map(c => c.trim());
      
      return conditions.every(condition => {
        const orConditions = condition.split(/\bor\b/i).map(c => c.trim());
        return orConditions.some(cond => {
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
    });
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
