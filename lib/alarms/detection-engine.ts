import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import FortiAnalyzerService from '@/lib/integrations/fortianalyzer';
import { VMwareService } from '@/lib/integrations/vmware';
import { FortiGateService, FortiGateConfig } from '@/lib/integrations/fortigate';
import { sendAlarmEmail, getEmailStats } from '@/lib/notifications/email';
import type { AlarmDetectionLogic, CorrelationRule } from './alarm-definitions';
import { EventCacheService } from './event-cache';
import { ALARM_QUERY_REGISTRY, BYPASS_CACHE_ALARMS } from './queries';
import { createDefaultSuppressionEngine, SuppressionEvent } from './suppression-engine';
import { recordAlarmOccurrence, resolveIncidentsForEvents } from './incident-service';

const log = createLogger('detection-engine');

interface AlarmDef {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
  severity: string;
  enabled: boolean;
  detectionLogic: AlarmDetectionLogic;
  cooldownMinutes: number;
  notifyEmail: boolean;
  source?: string | null;
}

interface EvaluationResult {
  alarmCode: string;
  triggered: boolean;
  matchCount: number;
  events: Array<Record<string, unknown>>;
  error?: string;
}

/**
 * Module-level EventCache singleton — prevents duplicate background syncs
 * accumulating across concurrent check cycles and Next.js hot reloads.
 * A single EventCacheService is shared for the lifetime of the process.
 */
let _sharedEventCache: EventCacheService | null = null;
let _sharedCacheInitialized = false;

/**
 * Expose the shared event cache status for the /api/health endpoint.
 * Returns null if the cache hasn't been initialized yet.
 */
export function getEventCacheStatus() {
  if (!_sharedEventCache) return null;
  return _sharedEventCache.getCacheStatus();
}

/**
 * Alarm Detection Engine
 * Evaluates alarm rules against FortiAnalyzer logs and triggers notifications.
 */
export class AlarmDetectionEngine {
  private service: FortiAnalyzerService;
  private vmwareService: VMwareService | null = null;
  private vmwareInitialized: boolean = false;
  private fortiGateService: FortiGateService | null = null;
  private fortiGateInitialized: boolean = false;
  
  // VMware cache to avoid repeated API calls during same check run
  private vmwareCache: {
    vms: Array<any> | null;
    hosts: Array<any> | null;
    datastores: Array<any> | null;
    snapshots: Array<any> | null;
    timestamp: number;
    ttl: number;
  } = {
    vms: null,
    hosts: null,
    datastores: null,
    snapshots: null,
    timestamp: 0,
    ttl: 5 * 60 * 1000 // 5 minutes cache TTL
  };
  
  // Event cache for fast queries (avoids live FortiAnalyzer API calls)
  private eventCache: EventCacheService | null = null;
  private cacheInitialized: boolean = false;
  
  // Suppression engine for filtering noisy events
  private suppressionEngine = createDefaultSuppressionEngine();

  constructor(service: FortiAnalyzerService) {
    this.service = service;
  }

  /**
   * Get suppression engine for managing rules
   */
  getSuppressionEngine() {
    return this.suppressionEngine;
  }

  /**
   * Get suppression statistics
   */
  getSuppressionStats() {
    return this.suppressionEngine.getStats();
  }

  /**
   * Inject a pre-initialized FortiGate service (singleton from alarm-runner).
   * Skips the internal initializeFortiGate() call so the CMDB snapshot store persists.
   */
  injectFortiGateService(fgService: FortiGateService): void {
    this.fortiGateService = fgService;
    this.fortiGateInitialized = true;
    (globalThis as any).__detectionEngine = this;
  }

  private async initializeVMware() {
    try {
      log.info('Initializing VMware service');
      const vmwareConfig = await prisma.integrationConfig.findFirst({
        where: { type: 'VMWARE_VCENTER', enabled: true },
      });
      
      if (!vmwareConfig) {
        log.info('No enabled VMware integration found in database');
        return;
      }
      
      log.info({ configName: vmwareConfig.name }, 'Found VMware config');
      
      if (vmwareConfig && vmwareConfig.config) {
        const config = vmwareConfig.config as any;
        this.vmwareService = new VMwareService({
          host: config.host,
          username: config.username,
          password: config.password,
          pollingInterval: config.pollingInterval || 15,
          enabledModules: config.enabledModules || {
            datacenters: true,
            clusters: true,
            hosts: true,
            vms: true,
            datastores: true,
          },
        });
        
        // Authenticate
        const authenticated = await this.vmwareService.authenticate();
        if (!authenticated) {
          log.error('VMware authentication failed');
          this.vmwareService = null;
        } else {
          log.info('VMware service initialized and authenticated');
        }
      }
    } catch (error) {
      log.error({ err: error }, 'Error initializing VMware service');
      this.vmwareService = null;
    }
  }

  private async initializeFortiGate() {
    try {
      log.info('Initializing FortiGate service');
      const fgConfig = await prisma.integrationConfig.findFirst({
        where: { type: 'FORTIGATE', enabled: true },
      });
      
      if (!fgConfig) {
        log.info('No enabled FortiGate integration found in database');
        return;
      }
      
      log.info({ configName: fgConfig.name }, 'Found FortiGate config');
      
      if (fgConfig && fgConfig.config) {
        const config = fgConfig.config as any;
        this.fortiGateService = new FortiGateService({
          host: config.host,
          accessToken: config.accessToken,
          pollingInterval: config.pollingInterval || 5,
          syncMode: 'rest',
          enabledModules: {
            interfaces: true,
            vlans: true,
            policies: true,
            addresses: true,
            vips: true,
            sdwan: true,
          },
        });
        log.info('FortiGate service initialized');
      }
    } catch (error) {
      log.error({ err: error }, 'Error initializing FortiGate service');
      this.fortiGateService = null;
    }
  }

  /**
   * Get cached VMware data or fetch fresh if cache expired
   */
  private async getCachedVMwareData<T>(
    key: 'vms' | 'hosts' | 'datastores' | 'snapshots',
    fetchFn: () => Promise<T[]>
  ): Promise<T[]> {
    // Check cache first
    const isCacheValid = Date.now() - this.vmwareCache.timestamp < this.vmwareCache.ttl;
    
    if (isCacheValid && this.vmwareCache[key]) {
      log.info({ key, ageSeconds: Math.round((Date.now() - this.vmwareCache.timestamp) / 1000) }, 'Using cached VMware data');
      return this.vmwareCache[key] as T[];
    }
    
    // Fetch fresh data
    log.info({ key }, 'Fetching fresh data from vCenter');
    const data = await fetchFn();
    
    // Update cache
    this.vmwareCache[key] = data;
    this.vmwareCache.timestamp = Date.now();
    
    log.info({ key, count: data.length, ttlSeconds: this.vmwareCache.ttl / 1000 }, 'Cached VMware data');
    return data;
  }

  /**
   * Clear VMware cache (called at start of each check run)
   */
  private clearVMwareCache() {
    this.vmwareCache = {
      vms: null,
      hosts: null,
      datastores: null,
      snapshots: null,
      timestamp: Date.now(),
      ttl: 5 * 60 * 1000
    };
    log.info('VMware cache cleared for new check run');
  }

  private async initializeEventCache() {
    if (this.cacheInitialized) return;

    // Use module-level singleton to prevent multiple background syncs accumulating
    // across concurrent check cycles and hot reloads.
    if (_sharedCacheInitialized && _sharedEventCache) {
      this.eventCache = _sharedEventCache;
      this.cacheInitialized = true;
      log.info('Reusing shared Event Cache (already initialized)');
      return;
    }
    
    try {
      log.info('Initializing shared Event Cache service');
      _sharedEventCache = new EventCacheService(this.service);
      this.eventCache = _sharedEventCache;
      
      // startBackgroundSync() is async — it awaits the initial sync then schedules
      // recurring syncs in the background. We race it against a 3-minute timeout so
      // we don't block alarm evaluation forever if FA is very slow or unreachable.
      log.info('Waiting for initial event cache sync (timeout: 3 min)');
      const SYNC_TIMEOUT_MS = 3 * 60 * 1000;
      const syncCount = await Promise.race([
        _sharedEventCache.startBackgroundSync(),
        new Promise<number>((resolve) => setTimeout(() => resolve(-1), SYNC_TIMEOUT_MS)),
      ]);

      if (syncCount === -1) {
        log.warn('Initial event cache sync timed out after 3 min — proceeding (cache may be stale)');
      } else {
        log.info({ syncCount, total: 7 }, 'Initial event cache sync done');
      }
      
      _sharedCacheInitialized = true;
      this.cacheInitialized = true;
      log.info('Shared Event cache initialized');
    } catch (error) {
      log.error({ err: error }, 'Failed to initialize event cache');
      // Continue without cache (fallback to live API)
      this.eventCache = null;
      _sharedEventCache = null;
    }
  }

  /**
   * Main evaluation loop: check all enabled alarms
   * OPTIMIZED: Parallel logtype group evaluation with batched searches
   */
  async evaluateAllAlarms(): Promise<EvaluationResult[]> {
    const results: EvaluationResult[] = [];

    try {
      // Prune expired alarm cooldowns to keep the table small
      try {
        const pruned = await prisma.alarmCooldown.deleteMany({
          where: { cooldownUntil: { lt: new Date() } },
        });
        if (pruned.count > 0) {
          log.info({ count: pruned.count }, 'Pruned expired alarm cooldowns');
        }
      } catch {
        // Table may not exist yet (before migration)
      }

      // Log suppression engine status
      const suppressionStats = this.getSuppressionStats();
      log.info({ enabledRules: suppressionStats.enabledRules, totalRules: suppressionStats.totalRules }, 'Suppression engine status');

      // Initialize VMware service on first run
      if (!this.vmwareInitialized) {
        await this.initializeVMware();
        this.vmwareInitialized = true;
      }

      // Initialize FortiGate service on first run
      if (!this.fortiGateInitialized) {
        await this.initializeFortiGate();
        this.fortiGateInitialized = true;
        // Expose engine instance so FortiGate query functions can access fortiGateService
        (globalThis as any).__detectionEngine = this;
      }

      // Clear VMware cache at start of each check run for fresh data
      this.clearVMwareCache();

      // Clear FortiGate event log cache to get fresh data each cycle
      if (this.fortiGateService) {
        this.fortiGateService.clearEventLogCache();
        // NOTE: clearCmdbResponseCache() is called in alarm-runner.ts before evaluation starts
        // Calling it here would reset frozen snapshots AFTER some alarms have already run
      }

      // Initialize event cache on first run
      if (!this.cacheInitialized) {
        await this.initializeEventCache();
      }

      // Log email service state — makes rate-limit/cooldown/SMTP issues immediately visible
      const emailStats = getEmailStats();
      log.info({ emailsThisHour: emailStats.emailsThisHour, maxPerHour: emailStats.maxPerHour, activeCooldowns: emailStats.activeCooldowns, transporterActive: emailStats.transporterActive, hourlyResetIn: emailStats.hourlyResetIn }, 'Email state');

      // Log cache state
      if (this.eventCache) {
        const cacheStatus = this.eventCache.getCacheStatus();
        log.info({ lastSync: cacheStatus.lastSyncTime?.toISOString() ?? 'never', isFresh: cacheStatus.isFresh, syncInProgress: cacheStatus.syncInProgress }, 'Cache state');

        // ── Cache Freshness Guarantee ────────────────────────────────────────────
        // If cache is stale and no sync is running, force an immediate sync before
        // evaluation. This prevents alarm checks from silently running against old
        // data when the background scheduler has fallen behind (FA downtime, backoff).
        // We cap the wait at 2 minutes so the alarm check never hangs indefinitely.
        if (!cacheStatus.isFresh) {
          log.warn('Cache is stale — forcing sync before evaluation (max 2 min)');
          try {
            await Promise.race([
              this.eventCache.forceSync(),
              new Promise<void>(resolve => setTimeout(resolve, 2 * 60 * 1000)),
            ]);
            const refreshed = this.eventCache.getCacheStatus();
            if (refreshed.isFresh) {
              log.info('Cache freshened successfully — proceeding with fresh data');
            } else {
              log.warn('Cache still stale after force sync — proceeding with live FA fallback');
            }
          } catch (forceSyncErr) {
            log.warn({ err: forceSyncErr }, 'forceSync threw (non-fatal)');
          }
        }
      }

      // Get all enabled alarm definitions
      const alarms = await prisma.alarmDefinition.findMany({
        where: { enabled: true },
      });

      if (alarms.length === 0) {
        log.info('No enabled alarms found');
        return results;
      }

      // Sort alarms by priority (CRITICAL/HIGH first, then MEDIUM, then LOW/INFO)
      const priorityOrder: Record<string, number> = {
        'ALARM_CRITICAL': 0,
        'ALARM_HIGH': 1,
        'ALARM_MEDIUM': 2,
        'ALARM_LOW': 3,
        'ALARM_INFO': 4,
      };
      
      const sortedAlarms = alarms.sort((a, b) => {
        return (priorityOrder[a.severity] || 5) - (priorityOrder[b.severity] || 5);
      });

      log.info({ count: sortedAlarms.length }, 'Evaluating enabled alarms (sorted by priority)');

      // Separate correlation alarms and FortiGate source alarms from regular alarms
      const correlationAlarms: AlarmDef[] = [];
      const fortiGateSslvpnAlarms: AlarmDef[] = [];
      const regularAlarms = sortedAlarms;

      // Group regular alarms by logtype to batch searches
      const logTypeGroups = new Map<string, AlarmDef[]>();
      for (const alarm of regularAlarms) {
        const logic = alarm.detectionLogic as unknown as AlarmDetectionLogic;
        const logtype = logic.logtype || 'event';
        const alarmDef: AlarmDef = { ...alarm, detectionLogic: logic };

        // NMS rules are evaluated from PostgreSQL metrics by evaluateNmsAlarms().
        // They must never be sent through the FortiAnalyzer log query pipeline.
        if (alarm.source === 'nms' || alarm.code.startsWith('NMS_')) {
          continue;
        }

        if (logic.clientCheck === 'correlation') {
          correlationAlarms.push(alarmDef);
          continue;
        }

        // Handle FortiGate source alarms separately
        if (logic.source === 'fortigate-sslvpn') {
          fortiGateSslvpnAlarms.push(alarmDef);
          continue;
        }

        if (!logTypeGroups.has(logtype)) {
          logTypeGroups.set(logtype, []);
        }
        logTypeGroups.get(logtype)!.push(alarmDef);
      }

      log.info({ logTypeGroups: [...logTypeGroups.keys()], fortiGateSslvpnAlarmCount: fortiGateSslvpnAlarms.length }, 'LogTypeGroups summary');

      // NMS is an independent data source. Evaluate it before any FortiAnalyzer
      // login so a missing/unavailable FA integration cannot suppress SNMP alarms.
      try {
        const nmsResults = await this.evaluateNmsAlarms();
        results.push(...nmsResults);
      } catch (nmsErr) {
        log.error({ err: nmsErr }, 'NMS alarm evaluation error');
      }

      const needsFortiAnalyzer = logTypeGroups.size > 0 || correlationAlarms.length > 0;
      if (needsFortiAnalyzer) {
        const loggedIn = await this.service.login();
        if (!loggedIn) {
          log.error('Failed to login to FortiAnalyzer');
          throw new Error('FortiAnalyzer login failed — cannot evaluate FortiAnalyzer alarms');
        }
      }

      // Check overall cache freshness to decide how to run logtype groups:
      //  - Cache FRESH  → full parallel (all groups + all filter batches at once = fast DB reads, zero FA load)
      //  - Cache STALE  → run logtype groups SEQUENTIALLY; each group is still limited to
      //    5 concurrent filter batches (see evaluateLogTypeGroupOptimized).
      //    This keeps the global live-FA concurrency at ≤ 5 at any point in time,
      //    preventing the "40 simultaneous requests" cascade that caused 53 errors.
      const overallCacheStatus = this.eventCache?.getCacheStatus();
      const overallCacheFresh = overallCacheStatus?.isFresh ?? false;

      const groupEntries = Array.from(logTypeGroups.entries());
      const groupResults: Array<{ logtype: string; results: EvaluationResult[]; error: string | null }> = [];

      if (overallCacheFresh) {
        // FAST PATH: All logtype groups in full parallel — cache serves all queries
        const groupPromises = groupEntries.map(async ([logtype, groupAlarms]) => {
          log.info({ logtype, alarmCount: groupAlarms.length }, 'Starting parallel evaluation');
          try {
            const groupResult = await this.evaluateLogTypeGroupOptimized(logtype, groupAlarms);
            return { logtype, results: groupResult, error: null };
          } catch (error) {
            log.error({ err: error, logtype }, 'Error evaluating logtype group');
            const errorResults = groupAlarms.map(a => ({
              alarmCode: a.code, triggered: false, matchCount: 0, events: [],
              error: (error as Error).message,
            }));
            return { logtype, results: errorResults, error: (error as Error).message };
          }
        });
        groupResults.push(...await Promise.all(groupPromises));
      } else {
        // SAFE PATH: Run logtype groups one-at-a-time; each group caps itself at 5 concurrent
        // live FA calls via runWithConcurrency inside evaluateLogTypeGroupOptimized.
        // Global max live-FA concurrency = 5 (avoids overwhelming FortiAnalyzer).
        log.warn('Cache stale — running logtype groups sequentially to limit FA load');
        for (const [logtype, groupAlarms] of groupEntries) {
          log.info({ logtype, alarmCount: groupAlarms.length }, 'Starting sequential evaluation');
          try {
            const groupResult = await this.evaluateLogTypeGroupOptimized(logtype, groupAlarms);
            groupResults.push({ logtype, results: groupResult, error: null });
          } catch (error) {
            log.error({ err: error, logtype }, 'Error evaluating logtype group');
            const errorResults = groupAlarms.map(a => ({
              alarmCode: a.code, triggered: false, matchCount: 0, events: [],
              error: (error as Error).message,
            }));
            groupResults.push({ logtype, results: errorResults, error: (error as Error).message });
          }
        }
      }
      
      // Collect results from all groups
      for (const { logtype, results: groupResult, error } of groupResults) {
        if (error) {
          log.error({ logtype, error }, 'Group evaluation failed');
        }
        results.push(...groupResult);
      }

      // Evaluate FortiGate SSL-VPN alarms (uses FortiGate API, not FortiAnalyzer)
      if (fortiGateSslvpnAlarms.length > 0) {
        log.info({ count: fortiGateSslvpnAlarms.length }, 'Evaluating FortiGate SSL-VPN alarms');
        for (const alarm of fortiGateSslvpnAlarms) {
          try {
            const result = await this.evaluateFortiGateSslvpnAlarm(alarm);
            results.push(result);
          } catch (error) {
            log.error({ err: error, alarmCode: alarm.code }, 'FortiGate SSL-VPN evaluation error');
            results.push({ alarmCode: alarm.code, triggered: false, matchCount: 0, events: [], error: (error as Error).message });
          }
        }
      }

      // Evaluate correlation alarms (after regular alarms, so precursor events exist)
      if (correlationAlarms.length > 0) {
        log.info({ count: correlationAlarms.length }, 'Evaluating correlation alarms');
        // Correlation alarms are fast (DB queries only), evaluate sequentially
        for (const alarm of correlationAlarms) {
          try {
            const result = await this.evaluateCorrelationAlarm(alarm);
            results.push(result);
          } catch (error) {
            log.error({ err: error, alarmCode: alarm.code }, 'Correlation evaluation error');
            results.push({ alarmCode: alarm.code, triggered: false, matchCount: 0, events: [], error: (error as Error).message });
          }
        }
      }

      log.info({ triggered: results.filter(r => r.triggered).length, errors: results.filter(r => r.error && r.error !== 'cooldown-active' && r.error !== 'cache-empty').length, onCooldown: results.filter(r => r.error === 'cooldown-active').length, cacheEmpty: results.filter(r => r.error === 'cache-empty').length }, 'Evaluation complete');
      
      // Retry any failed notifications from previous cycles
      await this.retryFailedNotifications();
      
      return results;
    } catch (error) {
      const msg = (error as Error).message || '';
      // Login failures and other infrastructure errors should propagate to alarm-runner
      // (alarm-runner's catch block will log it as FAILED and write to DB correctly)
      if (msg.includes('login failed') || msg.includes('cannot evaluate')) {
        throw error;
      }
      log.error({ err: error }, 'Critical error in evaluateAllAlarms');
      // Return results collected so far for non-critical partial failures
      return results;
    }
  }

  /**
   * Retry sending email notifications for alarms that were created but failed to notify.
   * This handles cases where the process was interrupted (container restart, crash, etc.)
   * after creating the alarm_event but before sending/confirming the email.
   * 
   * Only retries alarms from the last 24 hours with notifyEmail=true and notifiedAt=NULL.
   */
  private async retryFailedNotifications(): Promise<void> {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const failedAlarms = await prisma.alarmEvent.findMany({
        where: {
          notifiedAt: null,
          createdAt: { gte: twentyFourHoursAgo },
          alarm: { notifyEmail: true },
          dlqEntries: { none: {} },
        },
        include: { alarm: true },
        take: 10, // Limit batch size to avoid overwhelming SMTP
      });
      
      if (failedAlarms.length === 0) {
        return; // No failed notifications to retry
      }
      
      log.info({ count: failedAlarms.length }, 'Retrying failed notifications');
      
      for (const event of failedAlarms) {
        try {
          // Bypass email cooldown for retries — these are legitimate notifications
          // that failed due to process interruption, not duplicates
                    const sent = await sendAlarmEmail({
            alarmCode: event.alarm.code,
            alarmName: event.alarm.name,
            severity: event.alarm.severity,
            category: event.alarm.category,
            title: event.title,
            message: event.message,
            sourceIp: event.sourceIp || undefined,
            destIp: event.destIp || undefined,
            deviceName: event.deviceName || undefined,
            timestamp: event.createdAt,
            alarmEventId: event.id,
          }, { bypassCooldown: true, skipDLQ: true }); // Skip DLQ for retries — they're already in retry logic
          
          if (sent) {
            await prisma.alarmEvent.update({
              where: { id: event.id },
              data: { notifiedAt: new Date(), notifyChannel: 'email' },
            });
            log.info({ alarmCode: event.alarm.code, eventId: event.id }, 'Retry successful for notification');
          }
        } catch (retryErr) {
          log.error({ err: retryErr, alarmCode: event.alarm.code }, 'Retry failed for notification');
        }
      }
    } catch (error) {
      log.error({ err: error }, 'Error in retryFailedNotifications');
      // Don't throw - this is a best-effort retry, shouldn't break the main flow
    }
  }

  /**
   * Evaluate a correlation alarm: cross-reference recent alarm events with new log data
   */
  private async evaluateCorrelationAlarm(alarm: AlarmDef): Promise<EvaluationResult> {
    const logic = alarm.detectionLogic;
    const rules = logic.correlationRules as CorrelationRule | undefined;
    if (!rules) {
      return { alarmCode: alarm.code, triggered: false, matchCount: 0, events: [], error: 'no-correlation-rules' };
    }

    // Check cooldown
    const cooldownThreshold = new Date(Date.now() - alarm.cooldownMinutes * 60 * 1000);
    const recentEvent = await prisma.alarmEvent.findFirst({
      where: { alarmId: alarm.id, createdAt: { gte: cooldownThreshold } },
      orderBy: { createdAt: 'desc' },
    });
    if (recentEvent) {
      return { alarmCode: alarm.code, triggered: false, matchCount: 0, events: [], error: 'cooldown-active' };
    }

    // Step 1: Query recent alarm events for precursor codes
    const lookback = new Date(Date.now() - rules.lookbackMinutes * 60 * 1000);
    const precursorEvents = await prisma.alarmEvent.findMany({
      where: {
        createdAt: { gte: lookback },
        alarm: { code: { in: rules.precursorCodes } },
      },
      include: { alarm: { select: { code: true } } },
      orderBy: { createdAt: 'desc' },
    });

    type PrecursorEvent = (typeof precursorEvents)[number];

    if (precursorEvents.length === 0) {
      return { alarmCode: alarm.code, triggered: false, matchCount: 0, events: [] };
    }

    // MULTI_VECTOR_ATTACK: check distinct alarm codes from same IP
    if (rules.minDistinctCodes) {
      const ipCodeMap = new Map<string, Set<string>>();
      for (const evt of precursorEvents) {
        const ip = evt.sourceIp || 'unknown';
        if (!ipCodeMap.has(ip)) ipCodeMap.set(ip, new Set());
        ipCodeMap.get(ip)!.add(evt.alarm.code);
      }

      const attackIps: string[] = [];
      for (const [ip, codes] of ipCodeMap) {
        if (codes.size >= rules.minDistinctCodes && ip !== 'unknown') {
          attackIps.push(ip);
        }
      }

      if (attackIps.length > 0) {
        const correlatedEvents = precursorEvents
          .filter((e: PrecursorEvent) => attackIps.includes(e.sourceIp || ''))
          .map((e: PrecursorEvent) => ({
            alarmCode: e.alarm.code,
            sourceIp: e.sourceIp,
            title: e.title,
            createdAt: e.createdAt.toISOString(),
          })) as unknown as Array<Record<string, unknown>>;

        await this.fireAlarm(alarm, correlatedEvents);
        return { alarmCode: alarm.code, triggered: true, matchCount: correlatedEvents.length, events: correlatedEvents.slice(0, 5) };
      }
      return { alarmCode: alarm.code, triggered: false, matchCount: 0, events: [] };
    }

    // Extract unique IPs from precursor events
    const precursorIps = new Set<string>();
    for (const evt of precursorEvents) {
      const ip = rules.matchField === 'destIp' ? evt.destIp : evt.sourceIp;
      if (ip) precursorIps.add(ip);
    }

    if (precursorIps.size === 0) {
      return { alarmCode: alarm.code, triggered: false, matchCount: 0, events: [] };
    }

    // Step 2: Secondary log search (if defined)
    if (rules.secondaryLogtype && rules.secondaryFilter) {
      log.info({ alarmCode: alarm.code, secondaryLogtype: rules.secondaryLogtype, secondaryFilter: rules.secondaryFilter }, 'Correlation secondary search');
      const limit = 50;
      const tid = await this.service.startLogSearch(rules.secondaryLogtype, limit, rules.secondaryFilter);
      if (!tid) {
        return { alarmCode: alarm.code, triggered: false, matchCount: 0, events: [], error: 'secondary-search-failed' };
      }

      let logs: Array<Record<string, unknown>> | null = null;
      for (let i = 0; i < 3; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        logs = await this.service.fetchLogResults(tid, 0, limit);
        if (logs && logs.length > 0) break;
      }

      if (!logs || logs.length === 0) {
        return { alarmCode: alarm.code, triggered: false, matchCount: 0, events: [] };
      }

      // Filter by time window
      const cutoff = new Date(Date.now() - logic.timeWindowMinutes * 60 * 1000);
      const recentLogs = logs.filter((log) => {
        const logTime = this.parseLogTime(log);
        return logTime && logTime >= cutoff;
      });

      // Match IPs between precursor alarms and secondary logs
      const matchField = rules.matchField === 'destIp' ? 'dstip' : 'srcip';
      const correlatedLogs = recentLogs.filter((log) => {
        const logIp = (log[matchField] as string) || (log.srcip as string) || '';
        return precursorIps.has(logIp);
      });

      if (correlatedLogs.length >= logic.threshold) {
        const enrichedLogs = correlatedLogs.map((log) => {
          const relatedPrecursors = precursorEvents
            .filter((e: PrecursorEvent) => {
              const ip = rules.matchField === 'destIp' ? e.destIp : e.sourceIp;
              return ip === ((log[matchField] as string) || (log.srcip as string));
            });

          const precCodes = relatedPrecursors.map((e: PrecursorEvent) => e.alarm.code).join(', ');
          const precDetails = relatedPrecursors
            .map((e: PrecursorEvent) => {
              const ip = e.sourceIp || e.destIp || 'unknown';
              const raw = (e as any).rawData as any;
              let country: string | undefined;
              let ts: string;

              if (Array.isArray(raw) && raw.length > 0) {
                const log0 = raw[0] as any;
                country =
                  (log0 &&
                    (log0.country ||
                      log0.src_country ||
                      log0.dst_country ||
                      log0.src_country_code ||
                      log0.dst_country_code)) || undefined;
                if (log0 && log0.date && log0.time) {
                  const tz = log0.tz ? ` ${log0.tz}` : '';
                  ts = `${log0.date} ${log0.time}${tz}`;
                } else if (log0 && log0.itime) {
                  ts = String(log0.itime);
                } else {
                  ts = e.createdAt.toISOString();
                }
              } else {
                ts = e.createdAt.toISOString();
              }

              const label = this.getAlarmCodeLabel(e.alarm.code);
              const parts = [label, ip];
              if (country) parts.push(country);
              parts.push(ts);

              return parts.join(' @ ');
            })
            .join(' | ');

          return {
            ...log,
            _correlation_precursors: precCodes,
            _correlation_precursor_details: precDetails,
          };
        });

        await this.fireAlarm(alarm, enrichedLogs as Array<Record<string, unknown>>);
        return { alarmCode: alarm.code, triggered: true, matchCount: correlatedLogs.length, events: correlatedLogs.slice(0, 5) };
      }
    } else {
      // No secondary search - just check precursor combination exists
      const correlatedEvents = precursorEvents.map((e: PrecursorEvent) => ({
        alarmCode: e.alarm.code,
        sourceIp: e.sourceIp,
        destIp: e.destIp,
        title: e.title,
        createdAt: e.createdAt.toISOString(),
      })) as unknown as Array<Record<string, unknown>>;

      if (correlatedEvents.length >= logic.threshold) {
        await this.fireAlarm(alarm, correlatedEvents);
        return { alarmCode: alarm.code, triggered: true, matchCount: correlatedEvents.length, events: correlatedEvents.slice(0, 5) };
      }
    }

    return { alarmCode: alarm.code, triggered: false, matchCount: 0, events: [] };
  }

  /**
   * Evaluate a group of alarms sharing the same logtype - OPTIMIZED VERSION
   * Uses BATCH log search to fetch all data at once, then evaluates alarms locally
   */
  private async evaluateLogTypeGroupOptimized(logtype: string, alarms: AlarmDef[]): Promise<EvaluationResult[]> {
    const results: EvaluationResult[] = [];
    log.info({ logtype, alarmCount: alarms.length }, 'Optimized evaluation starting');

    // Handle VMware alarms separately (already optimized)
    if (logtype === 'vmware') {
      for (const alarm of alarms) {
        try {
          const result = await this.evaluateVMwareAlarm(alarm);
          results.push(result);
        } catch (error) {
          log.error({ err: error, alarmCode: alarm.code }, 'Error evaluating VMware alarm');
          results.push({ alarmCode: alarm.code, triggered: false, matchCount: 0, events: [], error: (error as Error).message });
        }
      }
      return results;
    }

    // CRITICAL OPTIMIZATION: Batch all filters and fetch logs ONCE for entire group
    // Instead of N separate API calls, we make ONE call with combined filter
    
    // Step 1: Collect all unique filters
    const filterMap = new Map<string, AlarmDef[]>();
    for (const alarm of alarms) {
      const logic = alarm.detectionLogic;
      // Skip FortiView alarms (handled separately)
      if (logic.fortiviewQuery) {
        continue;
      }
      
      const filter = logic.filter || '';
      if (!filterMap.has(filter)) {
        filterMap.set(filter, []);
      }
      filterMap.get(filter)!.push(alarm);
    }

    log.info({ logtype, filterCount: filterMap.size }, 'Unique filters in group');

    // Determine concurrency limit:
    // - Cache fresh → all batches run in parallel (fast DB queries, no FA load)
    // - Cache stale → limit to 5 concurrent batches to avoid overwhelming FA
    //   with 30+ simultaneous live API calls (causes "Invalid filter" / timeout cascade)
    const cacheStatus = this.eventCache?.getCacheStatus();
    const isCacheFresh = cacheStatus?.isFresh ?? false;
    const concurrencyLimit = isCacheFresh ? Infinity : 5;
    if (!isCacheFresh && filterMap.size > 0) {
      log.warn({ logtype, concurrencyLimit }, 'Cache stale — using live FA fallback');
    }

    // Step 2: For each unique filter, fetch logs ONCE and evaluate all alarms
    // Tasks are LAZY (wrapped in a function) so concurrency can be controlled.
    const batchTasks = Array.from(filterMap.entries()).map(([filter, filterAlarms]) => async () => {
      try {
        // Fetch logs once for this filter
        const limit = Math.min(Math.max(...filterAlarms.map(a => a.detectionLogic.threshold * 2)), 1000);
        
        log.info({ logtype, limit, filter }, 'Batch fetching logs');
        
        // Single log search for entire batch.
        // Pick the first alarm that has a dedicated query in the registry — this
        // ensures the DB-level query path is used even when filterAlarms[0] is
        // not registered (non-deterministic Prisma findMany order).
        const representativeAlarm =
          filterAlarms.find(a => ALARM_QUERY_REGISTRY.has(a.code)) ?? filterAlarms[0];
        
        // CMDB-based alarms need more time (fetching 400+ items from FortiGate)
        const CMDB_ALARMS = new Set([
          'FW_POLICY_CHANGED', 'CORE_CONFIG_CHANGE', 'INTERFACE_CONFIG_CHANGED',
          'ADDRESS_OBJECT_CHANGED', 'IPSEC_TUNNEL_CHANGED',
        ]);
        const isCmdbAlarm = filterAlarms.some(a => CMDB_ALARMS.has(a.code));
        const timeoutMs = isCmdbAlarm ? 180000 : 25000; // 3 min for CMDB, 25s for others
        
        const searchResult = await Promise.race([
          this.performLogSearch(representativeAlarm, logtype, filter, limit),
          new Promise<{ tid: string | null; logs: Array<Record<string, unknown>> }>((resolve) =>
            setTimeout(() => resolve({ tid: null, logs: [] }), timeoutMs)
          ),
        ]);

        if (!searchResult.tid || searchResult.logs.length === 0) {
          // No logs found — determine whether this is a real failure or just no events
          const errorReason = (searchResult.tid === 'cache-empty' || searchResult.tid === 'dedicated-query-empty')
            ? undefined  // authoritative empty — cache or dedicated query confirmed no events
            : (searchResult.tid
                ? undefined  // FA queried OK but found 0 matching logs — alarm not triggered (normal)
                : 'search-timeout');  // FA returned no TID — real failure (session error, invalid filter, etc.)
          if (errorReason === 'search-timeout') {
            log.warn({ logtype, filter: filter.substring(0, 120), affectedAlarms: filterAlarms.length }, 'Batch search failed (no TID)');
          }
          return filterAlarms.map(alarm => ({
            alarmCode: alarm.code,
            triggered: false,
            matchCount: 0,
            events: [],
            error: errorReason
          }));
        }

        // Step 3: Evaluate each alarm against the fetched logs (each alarm isolated)
        const alarmResults = await Promise.all(filterAlarms.map(async alarm => {
          try {
            const logic = alarm.detectionLogic;
            
            // Check cooldown — skip if alarm fired recently (standard global cooldown)
            const cooldownThreshold = new Date(Date.now() - alarm.cooldownMinutes * 60 * 1000);
            const recentEvent = await prisma.alarmEvent.findFirst({
              where: { alarmId: alarm.id, createdAt: { gte: cooldownThreshold } },
              orderBy: { createdAt: 'desc' },
            });
            if (recentEvent) {
              log.info({ alarmCode: alarm.code, cooldownUntil: new Date(recentEvent.createdAt.getTime() + alarm.cooldownMinutes * 60 * 1000).toISOString() }, 'Alarm SKIPPED — cooldown active');
              return { alarmCode: alarm.code, triggered: false, matchCount: 0, events: [], error: 'cooldown-active' as string };
            }
        
        // Filter by time window
        const cutoff = new Date(Date.now() - logic.timeWindowMinutes * 60 * 1000);
        const recentLogs = searchResult.logs.filter((log) => {
          const logTime = this.parseLogTime(log);
          return logTime && logTime >= cutoff;
        });

        // Apply client-side checks
        let filteredLogs = recentLogs;
        if (logic.clientCheck === 'off-hours') {
          filteredLogs = this.filterOffHours(recentLogs);
        } else if (logic.clientCheck === 'business-hours') {
          filteredLogs = this.filterBusinessHours(recentLogs);
        } else if (logic.clientCheck === 'brute-force-group') {
          filteredLogs = this.filterBruteForce(recentLogs, logic.threshold);
        } else if (logic.clientCheck === 'geo-anomaly') {
          filteredLogs = this.filterGeoAnomaly(recentLogs);
        } else if (logic.clientCheck === 'per-user-dedup') {
          // Fire one alarm per user: use atomic AlarmCooldown to prevent race conditions.
          // The unique constraint on (alarmId, deviceName) ensures only one concurrent
          // check can claim the cooldown slot per user.
          const cooldownMs = alarm.cooldownMinutes * 60 * 1000;
          const cooldownUntil = new Date(Date.now() + cooldownMs);
          // Group logs by user and take the most recent event per user
          const userLatestLog = new Map<string, Record<string, unknown>>();
          for (const entry of recentLogs) {
            const u = (entry.user as string) || '';
            if (!u) continue;
            if (!userLatestLog.has(u)) userLatestLog.set(u, entry);
          }
          // Atomically claim cooldown slot per user
          const newUserLogs: Array<Record<string, unknown>> = [];
          for (const [username, entry] of userLatestLog.entries()) {
            try {
              // Check if an active cooldown exists
              const existing = await prisma.alarmCooldown.findUnique({
                where: { alarmId_deviceName: { alarmId: alarm.id, deviceName: username } },
              });
              if (existing && existing.cooldownUntil > new Date()) {
                log.info({ alarmCode: alarm.code, username }, 'Skipping user — already alerted (per-user cooldown)');
                continue;
              }
              // Atomically claim or extend the cooldown slot
              await prisma.alarmCooldown.upsert({
                where: { alarmId_deviceName: { alarmId: alarm.id, deviceName: username } },
                create: { alarmId: alarm.id, deviceName: username, cooldownUntil },
                update: { cooldownUntil },
              });
              newUserLogs.push(entry);
            } catch (err: any) {
              // P2002 = unique constraint violation → another check claimed it first
              if (err?.code === 'P2002') {
                log.info({ alarmCode: alarm.code, username }, 'Skipping user — cooldown claimed by concurrent check');
              } else {
                log.error({ err: err?.message, alarmCode: alarm.code, username }, 'Cooldown check failed');
                // On unexpected error, fall through — still fire alarm to avoid missing alerts
                newUserLogs.push(entry);
              }
            }
          }
          // Fire one alarm per new user
          for (const userLog of newUserLogs) {
            const u = userLog.user as string;
            log.info({ alarmCode: alarm.code, user: u }, 'New connection detected for user');
            await this.fireAlarm(alarm, [userLog]);
          }
          return {
            alarmCode: alarm.code,
            triggered: newUserLogs.length > 0,
            matchCount: newUserLogs.length,
            events: newUserLogs.slice(0, 5),
          };
        } else if (logic.clientCheck === 'off-hours-per-user') {
          // Off-hours filter THEN per-user dedup:
          // Only events outside business hours (18:00-08:00 + weekends), one alarm per user per cooldown
          const offHoursLogs = this.filterOffHours(recentLogs);
          const cooldownMs = alarm.cooldownMinutes * 60 * 1000;
          const cooldownUntil = new Date(Date.now() + cooldownMs);
          const userLatestLog = new Map<string, Record<string, unknown>>();
          for (const entry of offHoursLogs) {
            const u = (entry.user as string) || '';
            if (!u) continue;
            if (!userLatestLog.has(u)) userLatestLog.set(u, entry);
          }
          const newUserLogs: Array<Record<string, unknown>> = [];
          for (const [username, entry] of userLatestLog.entries()) {
            try {
              const existing = await prisma.alarmCooldown.findUnique({
                where: { alarmId_deviceName: { alarmId: alarm.id, deviceName: username } },
              });
              if (existing && existing.cooldownUntil > new Date()) {
                log.info({ alarmCode: alarm.code, username }, 'Skipping user — already alerted off-hours (per-user cooldown)');
                continue;
              }
              await prisma.alarmCooldown.upsert({
                where: { alarmId_deviceName: { alarmId: alarm.id, deviceName: username } },
                create: { alarmId: alarm.id, deviceName: username, cooldownUntil },
                update: { cooldownUntil },
              });
              newUserLogs.push(entry);
            } catch (err: any) {
              if (err?.code === 'P2002') {
                log.info({ alarmCode: alarm.code, username }, 'Skipping user — cooldown claimed by concurrent check');
              } else {
                log.error({ err: err?.message, alarmCode: alarm.code, username }, 'Cooldown check failed');
                newUserLogs.push(entry);
              }
            }
          }
          for (const userLog of newUserLogs) {
            const u = userLog.user as string;
            log.info({ alarmCode: alarm.code, user: u }, 'Off-hours login detected for user');
            await this.fireAlarm(alarm, [userLog]);
          }
          return {
            alarmCode: alarm.code,
            triggered: newUserLogs.length > 0,
            matchCount: newUserLogs.length,
            events: newUserLogs.slice(0, 5),
          };
        }

        // Alarm-specific exclusions (False Positive Filtering)
        if (alarm.code === 'ADMIN_NEW_GEO' || alarm.code === 'ADMIN_LOGIN_OFF_HOURS' || alarm.code === 'ADMIN_PRIVILEGE_CHANGE') {
          // Exclude service accounts and known system users
          const excludedUsers = ['siem', 'admin', 'system', 'root', 'backup', 'monitoring', 'nagios', 'zabbix'];
          filteredLogs = filteredLogs.filter((log) => {
            const user = (log.user as string || '').toLowerCase();
            return !excludedUsers.some(excluded => user.includes(excluded));
          });
        }
        
        if (alarm.code === 'SNAPSHOT_CREATED' || alarm.code === 'SNAPSHOT_DELETED') {
          // Exclude backup software snapshots
          filteredLogs = filteredLogs.filter((log) => {
            const userName = (log.userName as string || '').toLowerCase();
            const snapshotName = (log.snapshotName as string || '').toUpperCase();
            const excludedPatterns = ['VEEAM', 'BACKUP', 'COMMVAULT', 'VEM', 'NETBACKUP'];
            return !excludedPatterns.some(pattern => 
              userName.includes(pattern.toLowerCase()) || snapshotName.includes(pattern)
            );
          });
        }
        
        if (alarm.code === 'VPN_LOGIN_OFF_HOURS' || alarm.code === 'VPN_NEW_USER' || alarm.code === 'VPN_BRUTE_FORCE') {
          // Exclude known service accounts and internal systems
          const excludedUsers = ['service', 'backup', 'monitor', 'sync', 'replication'];
          filteredLogs = filteredLogs.filter((log) => {
            const user = (log.user as string || '').toLowerCase();
            return !excludedUsers.some(excluded => user.includes(excluded));
          });
        }
        
        if (alarm.code === 'FW_POLICY_CHANGED' || alarm.code === 'CORE_CONFIG_CHANGE' || alarm.code === 'ADMIN_CONFIG_CHANGE') {
          // Exclude changes made by automation tools
          const excludedUsers = ['ansible', 'puppet', 'chef', 'terraform', 'automation', 'script'];
          filteredLogs = filteredLogs.filter((log) => {
            const user = (log.user as string || '').toLowerCase();
            const msg = (log.msg as string || '').toLowerCase();
            return !excludedUsers.some(excluded => 
              user.includes(excluded) || msg.includes(excluded)
            );
          });
        }
        
        if (alarm.code === 'VM_POWERED_ON' || alarm.code === 'VM_CREATED' || alarm.code === 'VM_POWERED_ON_OFF_HOURS') {
          // Exclude automated provisioning and backup operations
          filteredLogs = filteredLogs.filter((log) => {
            const userName = (log.userName as string || '').toLowerCase();
            const vmName = (log.vmName as string || '').toLowerCase();
            const excludedUserPatterns = ['vcenter', 'vra', 'terraform', 'ansible', 'automation', 'veeam', 'system'];
            const excludedVmPatterns = ['veeam'];
            return (
              !excludedUserPatterns.some(pattern => userName.includes(pattern)) &&
              !excludedVmPatterns.some(pattern => vmName.includes(pattern))
            );
          });
        }

        const matchCount = filteredLogs.length;
        const triggered = matchCount >= logic.threshold;

        if (triggered) {
          await this.fireAlarm(alarm, filteredLogs);
        }

            return {
              alarmCode: alarm.code,
              triggered,
              matchCount,
              events: triggered ? filteredLogs.slice(0, 5) : [],
            };
          } catch (alarmErr) {
            log.error({ err: alarmErr, alarmCode: alarm.code }, 'Error evaluating alarm');
            return { alarmCode: alarm.code, triggered: false, matchCount: 0, events: [], error: (alarmErr as Error).message };
          }
        }));
        return alarmResults;
      } catch (batchErr) {
        log.error({ err: batchErr, filter, logtype }, 'Batch failed');
        return filterAlarms.map(alarm => ({
          alarmCode: alarm.code,
          triggered: false,
          matchCount: 0,
          events: [],
          error: `batch-error: ${(batchErr as Error).message}`,
        }));
      }
    });

    // Execute batch tasks with controlled concurrency.
    // Full parallel when cache is fresh; limited when falling back to live FA.
    const settled = await this.runWithConcurrency(batchTasks, concurrencyLimit);
    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        results.push(...outcome.value);
      } else {
        // This should never happen now that each batch has try/catch,
        // but just in case: mark all alarms in the group as errors
        log.error({ reason: outcome.reason, logtype }, 'Unexpected batch rejection');
      }
    }

    return results;
  }

  /**
   * Run async tasks with a maximum concurrency limit.
   * When limit is Infinity, all tasks run in parallel (equivalent to Promise.allSettled).
   * When limit is N, tasks run in groups of N sequentially.
   * Each task is a zero-arg async factory: () => Promise<T>
   */
  private async runWithConcurrency<T>(
    tasks: Array<() => Promise<T>>,
    maxConcurrent: number
  ): Promise<PromiseSettledResult<T>[]> {
    if (maxConcurrent === Infinity || tasks.length <= maxConcurrent) {
      // Full parallel — no chunking needed
      return Promise.allSettled(tasks.map(t => t()));
    }

    const results: PromiseSettledResult<T>[] = [];
    for (let i = 0; i < tasks.length; i += maxConcurrent) {
      const chunk = tasks.slice(i, i + maxConcurrent);
      const chunkResults = await Promise.allSettled(chunk.map(t => t()));
      results.push(...chunkResults);
    }
    return results;
  }

  /**
   * Evaluate a group of alarms sharing the same logtype - LEGACY VERSION
   * Kept for compatibility, but NOT used in optimized flow
   */
  private async evaluateLogTypeGroup(logtype: string, alarms: AlarmDef[]): Promise<EvaluationResult[]> {
    const results: EvaluationResult[] = [];
    log.info({ logtype, alarmCount: alarms.length }, 'Evaluating logtype group (legacy)');

    // Handle VMware alarms separately
    if (logtype === 'vmware') {
      for (const alarm of alarms) {
        try {
          const result = await this.evaluateVMwareAlarm(alarm);
          results.push(result);
        } catch (error) {
          log.error({ err: error, alarmCode: alarm.code }, 'Error evaluating VMware alarm');
          results.push({ alarmCode: alarm.code, triggered: false, matchCount: 0, events: [], error: (error as Error).message });
        }
      }
      return results;
    }

    // For alarms with specific filters, search individually
    for (const alarm of alarms) {
      try {
        const result = await this.evaluateSingleAlarm(alarm, logtype);
        results.push(result);
      } catch (error) {
        log.error({ err: error, alarmCode: alarm.code }, 'Error evaluating alarm');
        results.push({ alarmCode: alarm.code, triggered: false, matchCount: 0, events: [], error: (error as Error).message });
      }
    }

    return results;
  }

  /**
   * Evaluate a single alarm definition
   */
  private async evaluateSingleAlarm(alarm: AlarmDef, logtype: string): Promise<EvaluationResult> {
    const logic = alarm.detectionLogic;

    // Check cooldown - skip if alarm fired recently
    const cooldownThreshold = new Date(Date.now() - alarm.cooldownMinutes * 60 * 1000);
    const recentEvent = await prisma.alarmEvent.findFirst({
      where: {
        alarmId: alarm.id,
        createdAt: { gte: cooldownThreshold },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recentEvent) {
      return { alarmCode: alarm.code, triggered: false, matchCount: 0, events: [], error: 'cooldown-active' };
    }

    // FortiView-based alarms
    if (logic.fortiviewQuery) {
      // Add timeout for FortiView queries
      return Promise.race([
        this.evaluateFortiViewAlarm(alarm, logic),
        new Promise<EvaluationResult>((resolve) =>
          setTimeout(() => resolve({ alarmCode: alarm.code, triggered: false, matchCount: 0, events: [], error: 'fortiview-timeout' }), 45000)
        ),
      ]);
    }

    // LogView-based alarms
    const filter = logic.filter || '';
    // Cap limit at 1000 max (FortiAnalyzer API constraint)
    const limit = Math.min(Math.max(logic.threshold * 2, 50), 1000);

    log.info({ alarmCode: alarm.code, logtype, filter }, 'Searching alarm logs');
    
    // Add timeout for log search (CMDB alarms need more time)
    const CMDB_ALARMS = new Set([
      'FW_POLICY_CHANGED', 'CORE_CONFIG_CHANGE', 'INTERFACE_CONFIG_CHANGED',
      'ADDRESS_OBJECT_CHANGED', 'IPSEC_TUNNEL_CHANGED',
    ]);
    const timeoutMs = CMDB_ALARMS.has(alarm.code) ? 180000 : 30000;
    
    const searchResult = await Promise.race([
      this.performLogSearch(alarm, logtype, filter, limit),
      new Promise<{ tid: string | null; logs: Array<Record<string, unknown>> }>((resolve) =>
        setTimeout(() => resolve({ tid: null, logs: [] }), timeoutMs)
      ),
    ]);
    
    if (!searchResult.tid || searchResult.logs.length === 0) {
      const isCleanCache = searchResult.tid === 'cache-empty' || searchResult.tid === 'dedicated-query-empty';
      return { 
        alarmCode: alarm.code, 
        triggered: false, 
        matchCount: 0, 
        events: [], 
        error: isCleanCache ? undefined : (searchResult.tid ? undefined : 'search-timeout')
      };
    }

    // Filter by time window (client-side)
    const cutoff = new Date(Date.now() - logic.timeWindowMinutes * 60 * 1000);
    const recentLogs = searchResult.logs.filter((log) => {
      const logTime = this.parseLogTime(log);
      return logTime && logTime >= cutoff;
    });

    // Apply client-side checks
    let filteredLogs = recentLogs;
    if (logic.clientCheck === 'off-hours') {
      filteredLogs = this.filterOffHours(recentLogs);
    } else if (logic.clientCheck === 'business-hours') {
      filteredLogs = this.filterBusinessHours(recentLogs);
    } else if (logic.clientCheck === 'brute-force-group') {
      filteredLogs = this.filterBruteForce(recentLogs, logic.threshold);
    } else if (logic.clientCheck === 'geo-anomaly') {
      filteredLogs = this.filterGeoAnomaly(recentLogs);
    }

    // Alarm-specific exclusions (service accounts, etc.)
    if (alarm.code === 'ADMIN_NEW_GEO') {
      filteredLogs = filteredLogs.filter((log) => (log.user as string) !== 'siem');
    }
    if (alarm.code === 'ADMIN_LOGIN_OFF_HOURS') {
      filteredLogs = filteredLogs.filter((log) => (log.user as string) !== 'siem');
    }
    if (alarm.code === 'SNAPSHOT_CREATED') {
      filteredLogs = filteredLogs.filter((log) => {
        const userName = (log.userName as string || '').toLowerCase();
        const snapshotName = (log.snapshotName as string || '').toUpperCase();
        // Exclude Veeam backup snapshots (both Backup and Sure Backup test snapshots)
        return userName !== 'veeam' && 
               !snapshotName.includes('VEEAM BACKUP TEMPORARY SNAPSHOT') &&
               !snapshotName.includes('VEEAM_SUREBACKUP_SNAPSHOT');
      });
    }

    const matchCount = filteredLogs.length;
    const triggered = matchCount >= logic.threshold;

    if (triggered) {
      await this.fireAlarm(alarm, filteredLogs);
    }

    return {
      alarmCode: alarm.code,
      triggered,
      matchCount,
      events: filteredLogs.slice(0, 5), // Keep only first 5 for response
    };
  }

  /**
   * Helper method to perform log search - OPTIMIZED: Uses cache when available
   */
  private async performLogSearch(
    alarm: AlarmDef,
    logtype: string,
    filter: string,
    limit: number
  ): Promise<{ tid: string | null; logs: Array<Record<string, unknown>> }> {
    const logic = alarm.detectionLogic as unknown as AlarmDetectionLogic;
    const endTime = new Date();
    const startTime = new Date(Date.now() - logic.timeWindowMinutes * 60 * 1000);

    // ── Dedicated Query Layer ─────────────────────────────────────────────
    // If this alarm has a registered query function, use it instead of the
    // generic cache path. Dedicated queries use DB-level WHERE conditions
    // (including JSONB path filters) so they NEVER miss events due to
    // the "fetch N rows then filter in memory" problem.
    if (ALARM_QUERY_REGISTRY.has(alarm.code)) {
      const queryFn = ALARM_QUERY_REGISTRY.get(alarm.code)!;
      const cacheStatus = this.eventCache?.getCacheStatus() ?? null;
      try {
        const result = await queryFn({
          alarmCode: alarm.code,
          timeWindowMinutes: logic.timeWindowMinutes,
          eventCache: this.eventCache,
          cacheIsFresh: cacheStatus?.isFresh ?? false,
          faService: this.service,
          bypassCache: BYPASS_CACHE_ALARMS.has(alarm.code),
        });
        // Use sentinel TIDs that the caller understands
        const tid = result.events.length > 0 ? 'dedicated-query' : 'dedicated-query-empty';
        return { tid, logs: result.events };
      } catch (err) {
        log.error({ err, alarmCode: alarm.code }, 'Dedicated query failed, falling back to generic');
        // Fall through to generic path on error
      }
    }
    // ─────────────────────────────────────────────────────────────────────

    // Try cache first
    if (this.eventCache && this.cacheInitialized) {
      try {
        const cachedLogs = await this.eventCache.queryCachedEvents({
          logtype,
          filter,
          startTime,
          endTime,
          limit,
        });

        if (cachedLogs.length > 0) {
          log.info({ eventCount: cachedLogs.length, alarmCode: alarm.code }, 'Cache hit');
          return { tid: 'cache', logs: cachedLogs };
        }

        // Cache initialized and returned zero — check if cache itself has any events
        // for this logtype at all (guards against stale/empty cache after sync failure)
        const cacheStatus = this.eventCache.getCacheStatus();
        if (!cacheStatus.isFresh) {
          // Cache is stale (last sync >5min ago) — fall through to live FA as safety net
          log.warn({ lastSync: cacheStatus.lastSyncTime?.toISOString() ?? 'never', alarmCode: alarm.code }, 'Cache is stale — falling back to live FA');
        } else {
          // Cache is fresh and has zero matching events — authoritative empty result
          log.info({ alarmCode: alarm.code, logtype }, 'Cache clean — no events in window, skipping FA');
          return { tid: 'cache-empty', logs: [] };
        }
      } catch (cacheError) {
        log.warn({ err: cacheError }, 'Cache query failed, falling back to live API');
      }
    }

    // Fallback to live FortiAnalyzer API — used when cache is not initialized OR stale
    log.info({ alarmCode: alarm.code, logtype }, 'Live FA search');
    
    try {
      const tid = await this.service.startLogSearch(logtype, limit, filter || undefined);
      
      if (!tid) {
        log.warn({ logtype }, 'FortiAnalyzer search returned no TID');
        return { tid: null, logs: [] };
      }

      // Poll for results (max 30s for alarm checks)
      let logs: Array<Record<string, unknown>> | null = null;
      for (let i = 0; i < 6; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        logs = await this.service.fetchLogResults(tid, 0, limit);
        if (logs && logs.length > 0) break;
      }

      log.info({ eventCount: logs?.length || 0, logtype }, 'Live API returned events');
      return { tid: String(tid), logs: logs || [] };
    } catch (error) {
      log.error({ err: error, logtype }, 'FortiAnalyzer search failed');
      return { tid: null, logs: [] };
    }
  }

  /**
   * Evaluate a VMware alarm against current VMware state
   */
  private async evaluateVMwareAlarm(alarm: AlarmDef): Promise<EvaluationResult> {
    const logic = alarm.detectionLogic;

    // Check cooldown
    const cooldownThreshold = new Date(Date.now() - alarm.cooldownMinutes * 60 * 1000);
    const recentEvent = await prisma.alarmEvent.findFirst({
      where: {
        alarmId: alarm.id,
        createdAt: { gte: cooldownThreshold },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recentEvent) {
      return { alarmCode: alarm.code, triggered: false, matchCount: 0, events: [], error: 'cooldown-active' };
    }

    // Check if VMware service is available
    if (!this.vmwareService) {
      log.warn({ alarmCode: alarm.code }, 'VMware service not available');
      return { alarmCode: alarm.code, triggered: false, matchCount: 0, events: [], error: 'vmware-service-unavailable' };
    }

    try {
      log.info({ alarmCode: alarm.code, filter: logic.filter }, 'Evaluating VMware alarm');

      // Fetch VMware data based on alarm type
      let vmwareData: Array<Record<string, unknown>> = [];
      
      // Determine what data to fetch based on filter fields
      const filter = logic.filter || '';
      
      // VM Lifecycle Events (using Tasks API)
      if (alarm.code === 'VM_CREATED' || alarm.code === 'VM_DELETED' || 
          alarm.code === 'VM_RESTARTED') {
        const lifecycleEvents = await this.vmwareService.fetchVMLifecycleEvents(logic.timeWindowMinutes);
        
        // Filter by event type
        let targetEventType: 'created' | 'deleted' | 'restarted' | null = null;
        if (alarm.code === 'VM_CREATED') targetEventType = 'created';
        else if (alarm.code === 'VM_DELETED') targetEventType = 'deleted';
        else if (alarm.code === 'VM_RESTARTED') targetEventType = 'restarted';
        
        vmwareData = lifecycleEvents
          .filter(evt => evt.eventType === targetEventType)
          .map(evt => ({
            type: 'vm_lifecycle',
            eventType: evt.eventType,
            vmId: evt.vmId,
            vmName: evt.vmName,
            userName: evt.userName,
            eventTime: evt.eventTime,
            taskState: evt.taskState,
          }));
      }
      // Snapshot Events - SNAPSHOT_CREATED uses snapshot list, others use SOAP events
      else if (alarm.code === 'SNAPSHOT_CREATED') {
        // Use snapshot list to detect recently created snapshots (more reliable than SOAP events)
        log.info({ timeWindowMinutes: logic.timeWindowMinutes }, 'SNAPSHOT_CREATED: fetching recent snapshots');
        const recentSnapshots = await this.vmwareService.fetchRecentlyCreatedSnapshots(logic.timeWindowMinutes);
        log.info({ count: recentSnapshots.length }, 'SNAPSHOT_CREATED: found recent snapshots');
        vmwareData = recentSnapshots.map(snap => ({
          type: 'snapshot_created',
          snapshotCreated: true,  // Boolean for filter matching
          eventType: 'created',
          vmId: snap.vmId,
          vmName: snap.vmName,
          snapshotId: snap.snapshotId,
          snapshotName: snap.snapshotName,
          description: snap.description,
          createTime: snap.createTime,
          ageMinutes: snap.ageMinutes,
        }));
      }
      else if (alarm.code === 'SNAPSHOT_DELETED' || alarm.code === 'SNAPSHOT_REVERTED') {
        // For delete/revert, still use SOAP events as there's no other way to detect them
        const snapshotEvents = await this.vmwareService.fetchSnapshotEvents(logic.timeWindowMinutes);
        
        // Filter by event type
        let targetEventType: 'created' | 'deleted' | 'reverted' | null = null;
        if (alarm.code === 'SNAPSHOT_DELETED') targetEventType = 'deleted';
        else if (alarm.code === 'SNAPSHOT_REVERTED') targetEventType = 'reverted';
        
        vmwareData = snapshotEvents
          .filter(evt => evt.eventType === targetEventType)
          .map(evt => ({
            type: 'snapshot_event',
            eventType: evt.eventType,
            vmName: evt.vmName,
            snapshotName: evt.snapshotName,
            userName: evt.userName,
            eventTime: evt.eventTime,
            taskState: evt.taskState,
          }));
      }
      // VM Power State Events
      else if (filter.includes('powerState') || filter.includes('cpuUsage') || filter.includes('memoryUsage')) {
        // VM-related alarms
        
        // For off-hours power-on detection, use Events API to get recent power-on events
        if (alarm.code === 'VM_POWERED_ON' || alarm.code === 'VM_POWERED_ON_OFF_HOURS') {
          // Use Events API to get actual power-on events (not current VM state snapshot)
          const events = await this.vmwareService.fetchRecentPowerOnEvents(logic.timeWindowMinutes);
          vmwareData = events.map(evt => ({
            type: 'vm',
            vmId: evt.vmId,
            vmName: evt.vmName,
            powerState: 'poweredOn',
            userName: evt.userName,
            eventTime: evt.eventTime,
            eventDescription: evt.description,
          }));
        } else if (alarm.code === 'VM_POWERED_OFF') {
          // For unexpected power-off detection, use Events API to get recent power-off events
          const events = await this.vmwareService.fetchRecentPowerOffEvents(logic.timeWindowMinutes);
          vmwareData = events.map(evt => ({
            type: 'vm',
            vmId: evt.vmId,
            vmName: evt.vmName,
            powerState: 'poweredOff',
            userName: evt.userName,
            eventTime: evt.eventTime,
            eventDescription: evt.description,
            isGracefulShutdown: evt.isGracefulShutdown,
          }));
        } else {
          // Default: fetch current VM state
          const vms = await this.vmwareService.fetchVMs();
          vmwareData = vms.map(vm => ({
            type: 'vm',
            vmId: vm.vm.value,
            vmName: vm.name,
            powerState: vm.summary?.guestState === 'running' ? 'poweredOn' : 'poweredOff',
            cpuUsage: 0, // TODO: Requires performance stats API
            memoryUsage: 0, // TODO: Requires performance stats API
            numCpu: vm.summary?.numCpu || 0,
            memoryMB: vm.summary?.memorySizeMB || 0,
            guestOS: vm.summary?.guestFullName || '',
            ipAddress: vm.summary?.ipAddress || '',
            connectionState: vm.summary?.connectionState || 'unknown',
          }));
        }
      } else if (filter.includes('hostCpuUsage') || filter.includes('hostMemoryUsage') ||
                 filter.includes('connectionState')) {
        // Host-related alarms
        const hosts = await this.vmwareService.fetchHosts();
        vmwareData = hosts.map(host => ({
          type: 'host',
          hostId: host.host.value,
          hostName: host.name,
          connectionState: host.summary?.connectionState || 'unknown',
          hostCpuUsage: 0, // TODO: Requires performance stats API
          hostMemoryUsage: 0, // TODO: Requires performance stats API
          numCpuCores: host.summary?.numCpuCores || 0,
          memoryTotal: host.summary?.memoryTotal || 0,
          overallStatus: host.summary?.overallStatus || 'unknown',
        }));
      } else if (filter.includes('datastoreFreePercent') || filter.includes('datastore')) {
        // Datastore-related alarms
        const datastores = await this.vmwareService.fetchDatastores();
        vmwareData = datastores.map(ds => {
          const capacity = Number(ds.summary?.capacity || 0);
          const freeSpace = Number(ds.summary?.freeSpace || 0);
          const freePercent = capacity > 0 ? (freeSpace / capacity) * 100 : 100;
          
          return {
            type: 'datastore',
            datastoreId: ds.datastore.value,
            datastoreName: ds.name,
            datastoreType: ds.info?.type || 'unknown',
            datastoreCapacity: capacity,
            datastoreFreeSpace: freeSpace,
            datastoreFreePercent: freePercent,
            accessible: ds.summary?.accessible ?? true,
          };
        });
      } else if (filter.includes('snapshot')) {
        // Snapshot-related alarms
        const snapshots = await this.vmwareService.fetchAllSnapshots();
        vmwareData = snapshots.map(snap => {
          const createTime = new Date(snap.createTime);
          const ageHours = (Date.now() - createTime.getTime()) / (1000 * 60 * 60);
          const ageDays = ageHours / 24;
          
          return {
            type: 'snapshot',
            snapshotId: snap.id,
            snapshotName: snap.name,
            vmId: snap.vmId,
            vmName: snap.vmName,
            createTime: snap.createTime,
            snapshotAgeDays: ageDays,
            snapshotSize: snap.size || 0,
            description: snap.description || '',
          };
        });
      }
      // ── VM lifecycle events handled via SOAP ────────────────────────────────
      else if (alarm.code === 'VM_CLONED') {
        const events = await this.vmwareService.fetchEventsByTypes(logic.timeWindowMinutes, ['VmClonedEvent']);
        // Exclude automated operations — only fire for manual/admin actions
        const filtered = events.filter(evt => !this.isTrustedAutomation(evt));
        if (filtered.length < events.length) {
          log.info({ excluded: events.length - filtered.length, kept: filtered.length }, 'VM_CLONED: excluded automation events');
        }
        vmwareData = filtered.map(evt => ({
          type: 'vm_event',
          vmCloned: true,
          vmName: evt.vmName,
          vmId: evt.vmId,
          userName: evt.userName,
          eventTime: evt.eventTime,
          message: evt.message,
        }));
      }
      else if (alarm.code === 'VM_MIGRATED') {
        const events = await this.vmwareService.fetchEventsByTypes(logic.timeWindowMinutes, [
          'VmMigratedEvent', 'VmMigrationEvent', 'VmRelocatedEvent',
        ]);
        
        // Apply suppression engine filtering - track original indices
        const keptIndices: number[] = [];
        let suppressedCount = 0;
        
        for (let idx = 0; idx < events.length; idx++) {
          const evt = events[idx];
          const suppressionEvent: SuppressionEvent = {
            userName: evt.userName,
            vmName: evt.vmName,
            hostName: evt.hostName,
            eventType: evt.eventType,
            message: evt.message,
            source: 'vmware',
            alarmCode: 'VM_MIGRATED',
            timestamp: evt.eventTime,
          };
          
          const result = this.suppressionEngine.shouldSuppress(suppressionEvent);
          if (result.suppressed) {
            suppressedCount++;
          } else {
            keptIndices.push(idx);
          }
        }
        
        if (suppressedCount > 0) {
          log.info({ suppressedCount }, 'VM_MIGRATED: suppressed events via suppression engine');
        }
        if (keptIndices.length < events.length) {
          log.info({ kept: keptIndices.length, suppressed: suppressedCount }, 'VM_MIGRATED: suppression summary');
        }
        
        // Map back to original events using indices
        vmwareData = keptIndices.map(idx => {
          const evt = events[idx];
          return {
            type: 'vm_event',
            vmMigrated: true,
            vmName: evt.vmName,
            vmId: evt.vmId,
            userName: evt.userName,
            eventTime: evt.eventTime,
            message: evt.message,
          };
        });
      }
      else if (alarm.code === 'VM_RECONFIGURED') {
        const events = await this.vmwareService.fetchEventsByTypes(logic.timeWindowMinutes, ['VmReconfiguredEvent']);
        // Exclude automated operations — only fire for manual/admin actions
        const filtered = events.filter(evt => !this.isTrustedAutomation(evt));
        if (filtered.length < events.length) {
          log.info({ excluded: events.length - filtered.length, kept: filtered.length }, 'VM_RECONFIGURED: excluded automation events');
        }
        vmwareData = filtered.map(evt => ({
          type: 'vm_event',
          vmReconfigured: true,
          vmName: evt.vmName,
          vmId: evt.vmId,
          userName: evt.userName,
          eventTime: evt.eventTime,
          message: evt.message,
        }));
      }
      else if (alarm.code === 'VM_SUSPENDED') {
        const events = await this.vmwareService.fetchEventsByTypes(logic.timeWindowMinutes, ['VmSuspendedEvent']);
        vmwareData = events.map(evt => ({
          type: 'vm_event',
          powerState: 'suspended',
          vmName: evt.vmName,
          vmId: evt.vmId,
          userName: evt.userName,
          eventTime: evt.eventTime,
          message: evt.message,
        }));
      }
      else if (alarm.code === 'ESXI_MAINTENANCE_OUT_OF_HOURS') {
        // Detect hosts that entered maintenance mode within the time window
        const events = await this.vmwareService.fetchEventsByTypes(logic.timeWindowMinutes, [
          'EnteredMaintenanceModeEvent', 'EnteringMaintenanceModeEvent',
        ]);
        
        // Ignore list: trusted automation accounts and service accounts
        const IGNORED_USERS = ['veeam', 'vcenter', 'automation', 'backup', 'ansible', 'terraform'];
        const filtered = events.filter(evt => {
          const user = (evt.userName || '').toLowerCase();
          return !IGNORED_USERS.some(ignored => user.includes(ignored));
        });
        
        if (filtered.length < events.length) {
          log.info({ excluded: events.length - filtered.length }, 'ESXI_MAINTENANCE_OUT_OF_HOURS: excluded automation events');
        }
        
        vmwareData = filtered.map(evt => ({
          type: 'host_event',
          maintenanceMode: true,
          hostName: evt.vmName || evt.message, // ESXi events store host name in vmName field
          userName: evt.userName,
          eventTime: evt.eventTime,
          message: evt.message,
        }));
        // Apply off-hours filter (22:00–06:00)
        if (logic.clientCheck === 'off-hours') {
          vmwareData = this.filterOffHours(vmwareData);
        }
      }
      else if (alarm.code === 'CONFIG_CHANGE_AFTER_HOURS') {
        // Detect host/cluster config changes outside business hours
        const events = await this.vmwareService.fetchEventsByTypes(logic.timeWindowMinutes, [
          'HostConfigChangedEvent', 'ClusterConfigChangedEvent',
          'ClusterStatusChangedEvent', 'HostDasAgentFoundEvent',
          'VmConfigSpec', 'ReconfigVM',
        ]);
        vmwareData = events.map(evt => ({
          type: 'config_event',
          configChange: true,
          userName: evt.userName,
          eventTime: evt.eventTime,
          vmName: evt.vmName,
          message: evt.message,
        }));
        // Apply off-hours filter
        if (logic.clientCheck === 'off-hours') {
          vmwareData = this.filterOffHours(vmwareData);
        }
      }
      else if (alarm.code === 'MULTIPLE_SNAPSHOTS') {
        // Find VMs with more than 3 snapshots
        const snapshots = await this.vmwareService.fetchAllSnapshots();
        // Group snapshots by VM
        const vmSnapshotMap = new Map<string, { vmName: string; vmId: string; count: number; snapshots: string[] }>();
        for (const snap of snapshots) {
          if (!vmSnapshotMap.has(snap.vmId)) {
            vmSnapshotMap.set(snap.vmId, { vmName: snap.vmName, vmId: snap.vmId, count: 0, snapshots: [] });
          }
          const entry = vmSnapshotMap.get(snap.vmId)!;
          entry.count++;
          entry.snapshots.push(snap.name);
        }
        // Only VMs with >3 snapshots
        vmwareData = Array.from(vmSnapshotMap.values())
          .filter(v => v.count > 3)
          .map(v => ({
            type: 'snapshot',
            snapshotCount: v.count,
            vmName: v.vmName,
            vmId: v.vmId,
            snapshotNames: v.snapshots.join(', '),
          }));
      }
      else if (alarm.code === 'SNAPSHOT_DISK_GROWTH') {
        // Flag snapshots larger than 10 GB as a proxy for disk growth risk
        const snapshots = await this.vmwareService.fetchAllSnapshots();
        const LARGE_SNAPSHOT_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB
        vmwareData = snapshots
          .filter(s => (s.size || 0) > LARGE_SNAPSHOT_BYTES)
          .map(s => ({
            type: 'snapshot',
            snapshotGrowthPercent24h: 25, // Exceeds the 20% threshold in filter
            snapshotName: s.name,
            vmName: s.vmName,
            vmId: s.vmId,
            snapshotSizeGB: Math.round((s.size || 0) / (1024 * 1024 * 1024) * 10) / 10,
          }));
      }
      else if (alarm.code === 'DRS_IMBALANCE') {
        // Compute CPU imbalance across hosts in the cluster
        const hostStats = await this.vmwareService.fetchHostQuickStats();
        const connected = hostStats.filter(h => h.connectionState === 'connected' && !h.inMaintenanceMode && h.cpuTotalMHz > 0);
        if (connected.length >= 2) {
          const percentages = connected.map(h => (h.cpuUsedMHz / h.cpuTotalMHz) * 100);
          const maxPct = Math.max(...percentages);
          const minPct = Math.min(...percentages);
          const imbalance = maxPct - minPct;
          if (imbalance > 25) {
            vmwareData = [{
              type: 'cluster',
              drsImbalance: imbalance,
              hostCount: connected.length,
              maxCpuPct: Math.round(maxPct),
              minCpuPct: Math.round(minPct),
            }];
          }
        }
      }
      else if (alarm.code === 'CLUSTER_HA_RISK') {
        // Check if losing one host would exceed remaining cluster capacity
        const hostStats = await this.vmwareService.fetchHostQuickStats();
        const connected = hostStats.filter(h => h.connectionState === 'connected' && !h.inMaintenanceMode);
        
        if (connected.length === 0) {
          vmwareData = [{ 
            type: 'cluster', 
            haFailoverRisk: true, 
            reason: 'no-connected-hosts', 
            hostCount: 0,
            clusterName: 'Unknown',
            hostList: hostStats.map(h => ({
              hostName: h.name,
              connectionState: h.connectionState,
              inMaintenanceMode: h.inMaintenanceMode,
              cpuTotalMHz: h.cpuTotalMHz,
              cpuUsedMHz: h.cpuUsedMHz,
              memTotalMB: h.memTotalMB,
              memUsedMB: h.memUsedMB,
            })),
          }];
        } else if (connected.length === 1) {
          // Single host — HA failover impossible
          vmwareData = [{ 
            type: 'cluster', 
            haFailoverRisk: true, 
            reason: 'single-host', 
            hostCount: 1,
            clusterName: 'Unknown',
            hostList: hostStats.map(h => ({
              hostName: h.name,
              connectionState: h.connectionState,
              inMaintenanceMode: h.inMaintenanceMode,
              cpuTotalMHz: h.cpuTotalMHz,
              cpuUsedMHz: h.cpuUsedMHz,
              memTotalMB: h.memTotalMB,
              memUsedMB: h.memUsedMB,
            })),
          }];
        } else {
          // Check if total CPU/RAM minus the largest host still covers current load
          const totalCpuMHz = connected.reduce((s, h) => s + h.cpuTotalMHz, 0);
          const usedCpuMHz  = connected.reduce((s, h) => s + h.cpuUsedMHz,  0);
          const largestCpu  = Math.max(...connected.map(h => h.cpuTotalMHz));
          const remainingCpu = totalCpuMHz - largestCpu;
          const totalMemMB  = connected.reduce((s, h) => s + h.memTotalMB, 0);
          const usedMemMB   = connected.reduce((s, h) => s + h.memUsedMB,  0);
          const largestMem  = Math.max(...connected.map(h => h.memTotalMB));
          const remainingMem = totalMemMB - largestMem;
          const cpuOverload = remainingCpu > 0 && usedCpuMHz > remainingCpu * 0.9;
          const memOverload = remainingMem > 0 && usedMemMB  > remainingMem * 0.9;
          if (cpuOverload || memOverload) {
            vmwareData = [{
              type: 'cluster',
              haFailoverRisk: true,
              reason: cpuOverload ? 'cpu-insufficient' : 'mem-insufficient',
              hostCount: connected.length,
              cpuUsedPct: remainingCpu > 0 ? Math.round((usedCpuMHz / remainingCpu) * 100) : 999,
              memUsedPct: remainingMem > 0 ? Math.round((usedMemMB  / remainingMem) * 100) : 999,
              clusterName: 'Unknown',
              hostList: hostStats.map(h => ({
                hostName: h.name,
                connectionState: h.connectionState,
                inMaintenanceMode: h.inMaintenanceMode,
                cpuTotalMHz: h.cpuTotalMHz,
                cpuUsedMHz: h.cpuUsedMHz,
                memTotalMB: h.memTotalMB,
                memUsedMB: h.memUsedMB,
              })),
            }];
          }
        }
      }

      if (vmwareData.length === 0) {
        log.info({ alarmCode: alarm.code }, 'No VMware data found');
        return { alarmCode: alarm.code, triggered: false, matchCount: 0, events: [] };
      }

      // Apply off-hours filter for event-based alarms that require it
      if (logic.clientCheck === 'off-hours' &&
          (alarm.code === 'VM_POWERED_ON_OFF_HOURS' || alarm.code === 'SNAPSHOT_REVERTED_OFF_HOURS')) {
        vmwareData = this.filterOffHours(vmwareData);
        if (vmwareData.length === 0) {
          return { alarmCode: alarm.code, triggered: false, matchCount: 0, events: [] };
        }
      }

      // Apply filter to data
      let matchingData = this.applyVMwareFilter(vmwareData, logic.filter || '');

      // SNAPSHOT_CREATED: Filter out Veeam backup snapshots (both Backup and Sure Backup test snapshots)
      if (alarm.code === 'SNAPSHOT_CREATED') {
        matchingData = matchingData.filter((item) => {
          const snapshotName = (item.snapshotName as string || '').toUpperCase();
          return !snapshotName.includes('VEEAM BACKUP TEMPORARY SNAPSHOT') &&
                 !snapshotName.includes('VEEAM_SUREBACKUP_SNAPSHOT');
        });
      }

      const matchCount = matchingData.length;
      const triggered = matchCount >= logic.threshold;

      if (triggered) {
        log.info({ alarmCode: alarm.code, matchCount }, 'VMware alarm triggered');
        await this.fireAlarm(alarm, matchingData);
      }

      return {
        alarmCode: alarm.code,
        triggered,
        matchCount,
        events: matchingData.slice(0, 5),
      };
    } catch (error) {
      log.error({ err: error, alarmCode: alarm.code }, 'Error evaluating VMware alarm');
      return { alarmCode: alarm.code, triggered: false, matchCount: 0, events: [], error: (error as Error).message };
    }
  }

  /**
   * Apply VMware filter expression to data
   * Simple expression parser for filters like "cpuUsage > 90" or "powerState == poweredOff"
   */
  private applyVMwareFilter(data: Array<Record<string, unknown>>, filter: string): Array<Record<string, unknown>> {
    if (!filter) return data;

    return data.filter(item => {
      try {
        // Parse simple comparison expressions
        // Supported: field > value, field < value, field == value, field != value
        const comparison = filter.match(/(\w+)\s*(==|!=|>|<|>=|<=)\s*(\w+|\d+\.?\d*)/);        
        if (!comparison) {
          log.warn({ filter }, 'Could not parse VMware filter');
          return false;
        }

        const [, field, operator, valueStr] = comparison;
        const itemValue = item[field];
        
        // Convert value: boolean literals, numbers, or strings
        let value: unknown;
        if (valueStr === 'true') value = true;
        else if (valueStr === 'false') value = false;
        else if (!isNaN(Number(valueStr))) value = Number(valueStr);
        else value = valueStr;

        // Normalize itemValue booleans for comparison
        const normalizeForCompare = (v: unknown): unknown => {
          if (typeof v === 'boolean') return v;
          if (v === 'true') return true;
          if (v === 'false') return false;
          return v;
        };

        switch (operator) {
          case '==':
            return normalizeForCompare(itemValue) == normalizeForCompare(value);
          case '!=':
            return normalizeForCompare(itemValue) != normalizeForCompare(value);
          case '>':
            return Number(itemValue) > Number(value);
          case '<':
            return Number(itemValue) < Number(value);
          case '>=':
            return Number(itemValue) >= Number(value);
          case '<=':
            return Number(itemValue) <= Number(value);
          default:
            return false;
        }
      } catch (error) {
        log.error({ err: error, filter }, 'Error applying VMware filter');
        return false;
      }
    });
  }

  /**
   * Evaluate a FortiView-based alarm
   */
  private async evaluateFortiViewAlarm(alarm: AlarmDef, logic: AlarmDetectionLogic): Promise<EvaluationResult> {
    const result = await this.service.getFortiView(
      logic.fortiviewQuery!,
      50,
      { field: 'threatweight', order: 'desc' },
      undefined,
      logic.timeWindowMinutes
    );

    if (!result || !result.data || result.data.length === 0) {
      return { alarmCode: alarm.code, triggered: false, matchCount: 0, events: [] };
    }

    const matchCount = result.data.length;
    const triggered = matchCount >= logic.threshold;

    if (triggered) {
      await this.fireAlarm(alarm, result.data.slice(0, 10));
    }

    return { alarmCode: alarm.code, triggered, matchCount, events: result.data.slice(0, 5) };
  }

  /**
   * Evaluate a FortiGate SSL-VPN alarm using live FortiGate API
   * Checks currently connected SSL-VPN users for off-hours logins
   */
  private async evaluateFortiGateSslvpnAlarm(alarm: AlarmDef): Promise<EvaluationResult> {
    const logic = alarm.detectionLogic;

    // Determine alarm type first — SSLVPN_CONNECTION uses per-user cooldown (skip alarm-level cooldown)
    const isOffHoursAlarm2 = alarm.code === 'VPN_LOGIN_OFF_HOURS';
    const isBusinessHoursAlarm2 = alarm.code === 'SSLVPN_BUSINESS_HOURS';
    const isAllConnectionsAlarm2 = !isOffHoursAlarm2 && !isBusinessHoursAlarm2;

    // For non-all-connections alarms, apply standard alarm-level cooldown
    const cooldownThreshold = new Date(Date.now() - alarm.cooldownMinutes * 60 * 1000);
    // VPN_LOGIN_OFF_HOURS uses per-user dedup (like SSLVPN_CONNECTION), so skip alarm-level cooldown here
    if (!isAllConnectionsAlarm2 && alarm.code !== 'VPN_LOGIN_OFF_HOURS') {
      const recentEvent = await prisma.alarmEvent.findFirst({
        where: {
          alarmId: alarm.id,
          createdAt: { gte: cooldownThreshold },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (recentEvent) {
        return { alarmCode: alarm.code, triggered: false, matchCount: 0, events: [], error: 'cooldown-active' };
      }
    }

    // Check if FortiGate service is available
    if (!this.fortiGateService) {
      log.warn({ alarmCode: alarm.code }, 'FortiGate service not available');
      return { alarmCode: alarm.code, triggered: false, matchCount: 0, events: [], error: 'fortigate-service-unavailable' };
    }

    try {
      log.info({ alarmCode: alarm.code }, 'Evaluating FortiGate SSL-VPN alarm');

      // Get currently connected SSL-VPN users from FortiGate
      const sslvpnUsers = await this.fortiGateService.getSSLVPNUsers();

      if (!sslvpnUsers || sslvpnUsers.length === 0) {
        log.info('No active SSL-VPN users found');
        return { alarmCode: alarm.code, triggered: false, matchCount: 0, events: [] };
      }

      // Debug: print active users and their login timestamps
      const now2 = new Date();
      log.info({ alarmCode: alarm.code, userCount: sslvpnUsers.length }, 'Active SSL-VPN users');
      for (const u of sslvpnUsers) {
        const loginAge = Math.round((now2.getTime() - u.last_login_timestamp * 1000) / 60000);
        log.info({ userName: u.user_name, remoteHost: u.remote_host, loginAgeMinutes: loginAge, interface: u.interface }, 'SSL-VPN user detail');
      }

      // Check if this is off-hours or business-hours alarm
      const isOffHoursAlarm = alarm.code === 'VPN_LOGIN_OFF_HOURS';
      const isBusinessHoursAlarm = alarm.code === 'SSLVPN_BUSINESS_HOURS';
      const isAllConnectionsAlarm = !isOffHoursAlarm && !isBusinessHoursAlarm; // e.g. SSLVPN_CONNECTION

      // Filter users based on alarm type
      const matchedUsers: Array<Record<string, unknown>> = [];
      const now = new Date();

      // Only consider users who logged in recently (within timeWindow)
      // Prevents re-alarming for old sessions that started off-hours but are still active
      const timeWindowMs = (logic.timeWindowMinutes || 120) * 60 * 1000;

      for (const user of sslvpnUsers) {
        const loginTime = new Date(user.last_login_timestamp * 1000);
        const loginAgeMs = now.getTime() - loginTime.getTime();

        // Skip sessions older than the time window (already alerted for these)
        if (loginAgeMs > timeWindowMs) {
          continue;
        }

        // Convert login time to Turkey timezone for hour/day check
        const turkeyLoginTime = new Date(loginTime.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
        const loginHour = turkeyLoginTime.getHours();
        const loginDay = turkeyLoginTime.getDay(); // 0=Sunday, 6=Saturday

        // Off-hours: before 08:00, after 18:00, or weekend
        const isWeekend = loginDay === 0 || loginDay === 6;
        const isOffHours = loginHour < 8 || loginHour >= 18;
        const isBusinessHours = !isWeekend && !isOffHours;

        if (isOffHoursAlarm && (isWeekend || isOffHours)) {
          matchedUsers.push({
            user: user.user_name,
            remoteIp: user.remote_host,
            assignedIp: user.aip,
            loginTime: loginTime.toISOString(),
            duration: Math.round(user.duration / 60), // Convert to minutes
            inMB: Math.round(user.in_bytes / 1024 / 1024),
            outMB: Math.round(user.out_bytes / 1024 / 1024),
            isWeekend,
            isOffHours,
          });
        } else if (isBusinessHoursAlarm && isBusinessHours) {
          matchedUsers.push({
            user: user.user_name,
            remoteIp: user.remote_host,
            assignedIp: user.aip,
            loginTime: loginTime.toISOString(),
            duration: Math.round(user.duration / 60), // Convert to minutes
            inMB: Math.round(user.in_bytes / 1024 / 1024),
            outMB: Math.round(user.out_bytes / 1024 / 1024),
            isBusinessHours,
          });
        } else if (isAllConnectionsAlarm) {
          // SSLVPN_CONNECTION: match all users regardless of time-of-day
          matchedUsers.push({
            user: user.user_name,
            remoteIp: user.remote_host,
            assignedIp: user.aip,
            loginTime: loginTime.toISOString(),
            duration: Math.round(user.duration / 60),
            inMB: Math.round(user.in_bytes / 1024 / 1024),
            outMB: Math.round(user.out_bytes / 1024 / 1024),
            isBusinessHours,
            isOffHours,
            isWeekend,
          });
        }
      }

      // For all-connections alarm AND off-hours alarm: per-user cooldown + fire one alarm per new user
      if (isAllConnectionsAlarm || isOffHoursAlarm) {
        let firedCount = 0;
        for (const userData of matchedUsers) {
          const username = userData.user as string;
          // Check if this specific user already has a recent alarm
          const recentUserAlarm = await prisma.alarmEvent.findFirst({
            where: {
              alarmId: alarm.id,
              deviceName: username,
              createdAt: { gte: cooldownThreshold },
            },
          });
          if (!recentUserAlarm) {
            const logPrefix = isOffHoursAlarm ? 'VPN_OFF_HOURS' : 'SSLVPN_CONNECTION';
            log.info({ logPrefix, username, remoteIp: userData.remoteIp || 'unknown IP' }, 'New SSL-VPN connection');
            await this.fireAlarm(alarm, [userData]);
            firedCount++;
          } else {
            const logPrefix = isOffHoursAlarm ? 'VPN_OFF_HOURS' : 'SSLVPN_CONNECTION';
            log.info({ logPrefix, username }, 'Skipping SSL-VPN user — already alerted (cooldown active)');
          }
        }
        return {
          alarmCode: alarm.code,
          triggered: firedCount > 0,
          matchCount: firedCount,
          events: matchedUsers.slice(0, 5),
        };
      }

      const matchCount = matchedUsers.length;
      const triggered = matchCount >= logic.threshold;

      if (triggered) {
        if (isOffHoursAlarm) {
          log.info({ matchCount }, 'OFF-HOURS SSL-VPN detected');
        } else {
          log.info({ matchCount }, 'BUSINESS-HOURS SSL-VPN detected');
        }
        await this.fireAlarm(alarm, matchedUsers);
      }

      return {
        alarmCode: alarm.code,
        triggered,
        matchCount,
        events: matchedUsers.slice(0, 5),
      };
    } catch (error) {
      log.error({ err: error, alarmCode: alarm.code }, 'Error evaluating FortiGate SSL-VPN alarm');
      return {
        alarmCode: alarm.code,
        triggered: false,
        matchCount: 0,
        events: [],
        error: (error as Error).message,
      };
    }
  }

  /**
   * Fire an alarm: create DB record and send email notification
   */
  private async fireAlarm(alarm: AlarmDef, matchingLogs: Array<Record<string, unknown>>): Promise<void> {
    const firstLog = matchingLogs[0] || {};
    const title = this.buildAlarmTitle(alarm, matchingLogs);
    const message = this.buildAlarmMessage(alarm, matchingLogs);

    // Extract metadata based on log type
    let sourceIp: string | null = null;
    let destIp: string | null = null;
    let deviceName: string | null = null;

    // Special handling for FortiGate SSL-VPN alarms (source: fortigate-sslvpn)
    if (firstLog.remoteIp || (firstLog.user && (firstLog.loginTime || firstLog.assignedIp))) {
      sourceIp = (firstLog.remoteIp as string) || (firstLog.assignedIp as string) || (firstLog.user as string) || null;
      deviceName = (firstLog.user as string) || null;
    } else if (firstLog.type && ['vm', 'host', 'datastore', 'cluster', 'snapshot', 'snapshot_created', 'snapshot_event', 'vm_lifecycle'].includes(firstLog.type as string)) {
      // VMware alarm metadata
      if (firstLog.type === 'vm' || firstLog.type === 'vm_lifecycle') {
        deviceName = (firstLog.vmName as string) || null;
        sourceIp = (firstLog.ipAddress as string) || null;
      } else if (firstLog.type === 'host') {
        deviceName = (firstLog.hostName as string) || null;
      } else if (firstLog.type === 'datastore') {
        deviceName = (firstLog.datastoreName as string) || null;
      } else if (firstLog.type === 'snapshot' || firstLog.type === 'snapshot_created' || firstLog.type === 'snapshot_event') {
        deviceName = `${firstLog.vmName} - ${firstLog.snapshotName}` || null;
      }
    } else if (firstLog.action === 'auth-logon' && firstLog.user) {
      // FA SSL-VPN auth-logon events: store username as deviceName so per-user cooldown checks work
      sourceIp = (firstLog.srcip as string) || (firstLog.remip as string) || null;
      deviceName = (firstLog.user as string);
    } else if (firstLog.source === 'fortigate-cmdb-diff') {
      // CMDB diff alarms — extract admin user and source IP from the enriched fields
      sourceIp = (firstLog.admin_ui as string)?.match(/\(([^)]+)\)$/)?.[1] || null;
      deviceName = (firstLog.admin_user as string) || null;
      destIp = null;
    } else {
      // FortiAnalyzer log metadata
      sourceIp = (firstLog.srcip as string) || (firstLog.remip as string) || (firstLog.remote_host as string) || null;
      // Config-change events: extract admin source IP from ui field e.g. "GUI(10.7.7.16)" or "SSH(172.16.0.5)"
      if (!sourceIp && firstLog.ui) {
        const uiMatch = (firstLog.ui as string).match(/\(([^)]+)\)$/);
        if (uiMatch) sourceIp = uiMatch[1];
      }
      destIp = (firstLog.dstip as string) || null;
      deviceName = (firstLog.devname as string) || (firstLog.fortigate as string) || null;
    }

    // Check whitelist BEFORE creating alarm event — suppress false positives
    const rawDataForWhitelist: Record<string, unknown> = {
      sourceIp,
      destIp,
      user: firstLog.user,
      hostname: firstLog.hostname,
      ...firstLog,
    };
    if (await this.isWhitelisted(alarm.code, rawDataForWhitelist)) {
      log.info({ alarmCode: alarm.code, title }, 'WHITELISTED — alarm suppressed');
      return;  // Don't fire alarm, method returns void
    }

    const recorded = await recordAlarmOccurrence({
      alarm,
      title,
      message,
      rawData: matchingLogs.slice(0, 10) as any,
      sourceIp,
      destIp,
      deviceName,
      sourceOccurredAt: this.parseLogTime(firstLog),
    });
    const alarmEvent = recorded.event;

    if (!recorded.created) {
      log.info({ alarmCode: alarm.code, eventId: alarmEvent.id }, 'Duplicate source occurrence suppressed');
      return;
    }

    log.info({ alarmCode: alarm.code, title }, 'ALARM FIRED');

    // Send email notification
    if (alarm.notifyEmail) {
      try {
                const sent = await sendAlarmEmail({
          alarmCode: alarm.code,
          alarmName: alarm.name,
          severity: alarm.severity,
          category: alarm.category,
          title,
          message,
          sourceIp: alarmEvent.sourceIp || undefined,
          destIp: alarmEvent.destIp || undefined,
          deviceName: alarmEvent.deviceName || undefined,
          timestamp: alarmEvent.createdAt,
          alarmEventId: alarmEvent.id, // Enable DLQ retry on failure
          incidentId: recorded.incident.id,
        });

        if (sent) {
          await prisma.alarmEvent.update({
            where: { id: alarmEvent.id },
            data: { notifiedAt: new Date(), notifyChannel: 'email' },
          });
        }
      } catch (emailErr) {
        log.error({ err: emailErr, alarmCode: alarm.code }, 'Failed to send alarm email');
      }
    }
  }

  /**
   * Parse log timestamp from FortiAnalyzer log entry
   */
  private parseLogTime(log: Record<string, unknown>): Date | null {
    // itime_t is Unix timestamp (seconds)
    if (log.itime_t) {
      const ts = typeof log.itime_t === 'string' ? parseInt(log.itime_t, 10) : (log.itime_t as number);
      if (ts > 1e9) return new Date(ts * 1000);
    }
    // itime can be a date string "2026-02-11 08:42:02" or Unix timestamp
    if (log.itime) {
      const itimeStr = String(log.itime);
      if (itimeStr.includes('-')) {
        // Date string format
        const dt = new Date(itimeStr.replace(' ', 'T'));
        if (!isNaN(dt.getTime())) return dt;
      } else {
        const ts = parseInt(itimeStr, 10);
        if (ts > 1e9) return new Date(ts * 1000);
      }
    }
    // date + time fields
    if (log.date && log.time) {
      const dt = new Date(`${log.date}T${log.time}`);
      if (!isNaN(dt.getTime())) return dt;
    }
    // eventtime (nanoseconds from FortiAnalyzer)
    if (log.eventtime) {
      const et = typeof log.eventtime === 'string' ? parseInt(log.eventtime, 10) : (log.eventtime as number);
      if (et > 1e18) return new Date(et / 1e6); // nanoseconds
      if (et > 1e15) return new Date(et / 1000); // microseconds
      if (et > 1e12) return new Date(et); // milliseconds
      return new Date(et * 1000); // seconds
    }
    // eventTime (ISO 8601 string from VMware events)
    if (log.eventTime && typeof log.eventTime === 'string') {
      const dt = new Date(log.eventTime as string);
      if (!isNaN(dt.getTime())) return dt;
    }
    return null;
  }

  /**
   * Trusted-automation filter for VMware events.
   *
   * Returns true when an event was generated by a known backup/automation system
   * (Veeam, etc.) and should NOT trigger an operator alarm.
   *
   * Checks (all case-insensitive):
   *   • userName  – service account name contains a known automation keyword
   *   • message   – full formatted message contains a known automation keyword
   *
   * Add new keywords to AUTOMATION_KEYWORDS to extend coverage.
   */
  private isTrustedAutomation(event: {
    userName?: string;
    vmName?: string;
    message?: string;
    eventType?: string;
  }): boolean {
    // Keywords that identify automated / backup-system activity
    const AUTOMATION_KEYWORDS = [
      'veeam',
      'veeam backup',
      'veeam replica',
      'veeam agent',
      'vcenter',
      'vmware',
      'com.vmware.vim.eam',  // VMware ESX Agent Manager (automated migrations/operations)
      'pyvmomi',              // Python VMware SDK (automated provisioning scripts)
    ];

    const userName = (event.userName || '').toLowerCase();
    const message  = (event.message  || '').toLowerCase();

    return AUTOMATION_KEYWORDS.some(
      kw => userName.includes(kw) || message.includes(kw)
    );
  }

  /**
   * Check if an alarm event matches any active whitelist entry.
   * Whitelist entries suppress false positives for specific field values.
   */
  private async isWhitelisted(alarmCode: string, rawData: Record<string, unknown>): Promise<boolean> {
    try {
      // Fetch all active whitelist entries for this alarm code
      const whitelist = await prisma.alarmWhitelist.findMany({
        where: {
          alarmCode,
          enabled: true,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
      });

      if (whitelist.length === 0) return false;

      // Check if any whitelist entry matches the raw data
      return whitelist.some((entry) => {
        const fieldValue = rawData[entry.field];
        if (!fieldValue) return false;
        
        // Exact match or substring match (for IP addresses in messages)
        const valueStr = String(fieldValue).toLowerCase();
        const whitelistValue = entry.value.toLowerCase();
        
        return valueStr === whitelistValue || valueStr.includes(whitelistValue);
      });
    } catch (err) {
      log.error({ err }, 'Whitelist check failed');
      return false; // Fail open - don't suppress alarms on DB errors
    }
  }


  /**
   * Filter logs for off-hours check (outside 08:00-18:00 weekdays Turkey time)
   */
  private filterOffHours(logs: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    return logs.filter((log) => {
      const logTime = this.parseLogTime(log);
      if (!logTime) return false;

      // Convert to Turkey timezone
      const turkeyTime = new Date(logTime.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
      const hour = turkeyTime.getHours();
      const day = turkeyTime.getDay(); // 0=Sunday, 6=Saturday

      // Weekend
      if (day === 0 || day === 6) return true;
      // Before 08:00 or after 18:00
      if (hour < 8 || hour >= 18) return true;

      return false;
    });
  }

  /**
   * Filter logs for BUSINESS hours only (08:00-18:00 on weekdays)
   */
  private filterBusinessHours(logs: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    return logs.filter((log) => {
      const logTime = this.parseLogTime(log);
      if (!logTime) return false;

      // Convert to Turkey timezone
      const turkeyTime = new Date(logTime.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
      const hour = turkeyTime.getHours();
      const day = turkeyTime.getDay(); // 0=Sunday, 6=Saturday

      // Weekend - NOT business hours
      if (day === 0 || day === 6) return false;
      // Before 08:00 or after 18:00 - NOT business hours
      if (hour < 8 || hour >= 18) return false;

      return true;
    });
  }

  /**
   * Filter/group logs for brute force detection (multiple events from same source)
   */
  private filterBruteForce(logs: Array<Record<string, unknown>>, threshold: number): Array<Record<string, unknown>> {
    // Group by source IP
    const groups = new Map<string, Array<Record<string, unknown>>>();
    for (const log of logs) {
      const srcip = (log.srcip as string) || (log.remip as string) || (log.remote_host as string) || 'unknown';
      // Note: SSL-VPN ssl-login-fail events use 'remip' (not srcip) for source IP
      if (!groups.has(srcip)) groups.set(srcip, []);
      groups.get(srcip)!.push(log);
    }

    // Return logs from groups that exceed threshold
    const result: Array<Record<string, unknown>> = [];
    for (const [, groupLogs] of groups) {
      if (groupLogs.length >= threshold) {
        result.push(...groupLogs);
      }
    }

    return result;
  }

  /**
   * Geo-anomaly filter: ignore admin logins from internal/private networks
   */
  private filterGeoAnomaly(logs: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    return logs.filter((log) => {
      const srcip = (log.srcip as string) || (log.remip as string) || this.extractIpFromUi(log.ui as string) || '';
      if (!srcip) return false;
      // Skip private / internal ranges (local admin logins)
      if (this.isPrivateIp(srcip)) return false;
      return true;
    });
  }

  private isPrivateIp(ip: string): boolean {
    if (!ip) return false;
    if (ip.startsWith('10.')) return true;
    if (ip.startsWith('192.168.')) return true;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true;
    if (ip.startsWith('127.')) return true;
    return false;
  }

  private extractIpFromUi(ui: unknown): string | null {
    if (!ui) return null;
    const match = String(ui).match(/(\d{1,3}(?:\.\d{1,3}){3})/);
    return match ? match[1] : null;
  }

  /**
   * Decode URL-encoded FortiAnalyzer message text
   */
  private decodeMsg(text: unknown): string {
    if (!text) return '';
    try {
      return decodeURIComponent(String(text));
    } catch {
      return String(text).replace(/%20/g, ' ').replace(/%28/g, '(').replace(/%29/g, ')').replace(/%3A/g, ':').replace(/%2F/g, '/');
    }
  }

  /**
   * Map FortiGate config attribute name to Turkish label
   */
  private getAttrLabel(attr: string): string {
    const labels: Record<string, string> = {
      status: 'Durum',
      name: 'Isim',
      action: 'Aksiyon',
      srcintf: 'Kaynak Arayuzu',
      dstintf: 'Hedef Arayuzu',
      srcaddr: 'Kaynak Adresi',
      dstaddr: 'Hedef Adresi',
      service: 'Servis',
      schedule: 'Zamanlama',
      logtraffic: 'Log Trafigi',
      nat: 'NAT',
      comments: 'Aciklama',
      groups: 'Gruplar',
      password: 'Sifre',
      trusthost1: 'Guvenli Host 1',
      trusthost2: 'Guvenli Host 2',
      trusthost3: 'Guvenli Host 3',
      trusthost4: 'Guvenli Host 4',
      'ha-peerip': 'HA Es IP',
      mode: 'Mod',
      type: 'Tip',
      interface: 'Arayuz',
      ip: 'IP Adresi',
      allowaccess: 'Izin Verilen Erisim',
      mtu: 'MTU',
      vlanid: 'VLAN ID',
      member: 'Uye',
      dst: 'Hedef',
      src: 'Kaynak',
      protocol: 'Protokol',
      port: 'Port',
      policyid: 'Politika ID',
      internetfont: 'Internet Servisi',
      fsso: 'FSSO',
      diffserv_forward: 'Diffserv Ileri',
      diffserv_reverse: 'Diffserv Geri',
      tcp_mss_sender: 'TCP MSS Gonderen',
      tcp_mss_receiver: 'TCP MSS Alici',
      block_ip_enable: 'IP Bloklama',
      auto_asic_offload: 'ASIC Offload',
      deep_packet_inspection: 'Derin Paket Incelemesi',
      dsri: 'DSRI',
      webfilter_profile: 'Web Filtre Profili',
      av_profile: 'Antivirus Profili',
      ips_sensor: 'IPS Sensor',
      application_list: 'Uygulama Listesi',
      profile_protocol: 'Protokol Profili',
      ssl_ssh_profile: 'SSL/SSH Profili',
      scope: 'Kapsam',
      subnet: 'Alt Ag',
      fqdn: 'FQDN',
      wildcard: 'Wildcard',
      cache: 'Onbellek',
      primary: 'Birincil',
      secondary: 'Ikincil',
      server: 'Sunucu',
      cnid: 'CN ID',
      dn: 'DN',
      secondary_server: 'Ikincil Sunucu',
      tertiary_server: 'Ucuncul Sunucu',
      source_ip: 'Kaynak IP',
      radius_server: 'RADIUS Sunucu',
      auth_type: 'Kimlik Dogrulama Tipi',
      nas_ip: 'NAS IP',
      key: 'Anahtar',
      secret: 'Gizli Anahtar',
    };
    return labels[attr] || attr;
  }

  /**
   * Map common FortiGate config values to Turkish labels
   */
  private getValueLabel(value: string): string {
    const v = String(value).trim().toLowerCase();
    const labels: Record<string, string> = {
      enable: 'Aktif',
      disable: 'Pasif',
      accept: 'Izin Ver',
      deny: 'Reddet',
      drop: 'Birak',
      reset: 'Sifirla',
      add: 'Ekleme',
      delete: 'Silme',
      edit: 'Duzenleme',
      set: 'Guncelleme',
      logdisk: 'Log Disk',
      all: 'Tumu',
      utm: 'UTM',
      local: 'Yerel',
      any: 'Herhangi',
      none: 'Yok',
    };
    return labels[v] || String(value);
  }

  /**
   * Parse cfgattr field from FortiAnalyzer config change logs.
   * Formats handled:
   *   "status"                       → [{ attr: "status", oldVal: null, newVal: null }]
   *   "status:enable->disable"       → [{ attr: "status", oldVal: "enable", newVal: "disable" }]
   *   "status enable->disable"       → [{ attr: "status", oldVal: "enable", newVal: "disable" }]
   *   "status srcintf"               → [{ attr: "status", ... }, { attr: "srcintf", ... }]
   */
  private parseCfgAttr(cfgattr: string): Array<{ attr: string; oldVal: string | null; newVal: string | null }> {
    const decoded = this.decodeMsg(cfgattr);
    const results: Array<{ attr: string; oldVal: string | null; newVal: string | null }> = [];

    // Split by spaces but handle "attr:old->new" or "attr old->new" as one unit
    const parts = decoded.split(/\s+/);

    for (const part of parts) {
      if (!part) continue;
      // Try format: attr:old->new
      const colonArrow = part.match(/^(\w+):(.+?)->(.+)$/);
      if (colonArrow) {
        results.push({ attr: colonArrow[1], oldVal: colonArrow[2], newVal: colonArrow[3] });
        continue;
      }
      // Try format: attr old->new (when not already split as separate tokens)
      const spaceArrow = part.match(/^(\w+)(.+?)->(.+)$/);
      if (spaceArrow) {
        results.push({ attr: spaceArrow[1], oldVal: spaceArrow[2].trim(), newVal: spaceArrow[3] });
        continue;
      }
      // Simple attribute name
      results.push({ attr: part, oldVal: null, newVal: null });
    }

    return results;
  }

  /**
   * Extract new value from FortiAnalyzer msg field for a given attribute.
   * Msg formats: "set status disable in firewall.policy 42"
   *              "Object attribute configured"
   */
  private extractNewValueFromMsg(msg: string, attr: string): string | null {
    const decoded = this.decodeMsg(msg);
    // Try: "set <attr> <value> in ..."
    const setMatch = decoded.match(new RegExp(`(?:set|edit)\\s+${attr}\\s+(\\S+)`, 'i'));
    if (setMatch) return setMatch[1];
    return null;
  }

  /**
   * Map alarm code to human-readable (Turkish) label
   */
  private getAlarmCodeLabel(code: string): string {
    switch (code) {
      case 'ADMIN_NEW_GEO':
        return 'Yeni ülkeden admin girişi';
      case 'VPN_LOGIN_OFF_HOURS':
        return 'Mesai dışı VPN oturumu';
      case 'VPN_NEW_USER':
        return 'İlk kez VPN kullanan kullanıcı';
      case 'MULTI_SECURITY_EVENTS':
        return 'Aynı kaynaktan çoklu güvenlik olayı';
      case 'CONFIG_THEN_SPIKE':
        return 'Config değişikliği sonrası trafik artışı';
      case 'IPS_THEN_OUTBOUND':
        return 'IPS alarmı sonrası dışa bağlantı';
      default:
        return code;
    }
  }

  /**
   * Build alarm title from alarm definition and matching logs
   */
  private buildAlarmTitle(alarm: AlarmDef, logs: Array<Record<string, unknown>>): string {
    const count = logs.length;
    const firstLog = logs[0] || {};

    // Special handling for FortiGate VPN tunnel events (IPsec / SSL-VPN tunnel-up/down)
    if (firstLog.vpntunnel || firstLog.tunneltype) {
      const tunnelName = (firstLog.vpntunnel as string) || '';
      const devname = (firstLog.devname as string) || '';
      let title = alarm.name;
      if (count > 1) title += ` (${count} tunel)`;
      if (tunnelName) title += ` - ${tunnelName}`;
      if (devname) title += ` [${devname}]`;
      return title;
    }

    // Special handling for admin login fail alarms — show user + device + count
    if (alarm.code === 'UNAUTH_ADMIN_LOGIN' || alarm.code === 'ADMIN_LOGIN_FAILED') {
      const users = [...new Set(logs.map(l => (l.user as string) || '').filter(Boolean))];
      const devices = [...new Set(logs.map(l => (l.devname as string) || '').filter(Boolean))];
      let title = alarm.name;
      if (count > 1) title += ` (${count} deneme)`;
      if (users.length === 1) title += ` - ${users[0]}`;
      else if (users.length > 1) title += ` - ${users[0]} +${users.length - 1} kullanici`;
      if (devices.length === 1) title += ` [${devices[0]}]`;
      else if (devices.length > 1) title += ` [${devices.length} cihaz]`;
      return title;
    }

    // Special handling for config change alarms — show user + device
    if (
      alarm.code === 'CORE_CONFIG_CHANGE' ||
      alarm.code === 'FW_POLICY_CHANGED' ||
      alarm.code === 'INTERFACE_CONFIG_CHANGED' ||
      alarm.code === 'CONFIG_CHANGE_AFTER_HOURS' ||
      alarm.code === 'ADDRESS_OBJECT_CHANGED' ||
      alarm.code === 'NEW_ADDRESS_OBJECT' ||
      alarm.code === 'NEW_SERVICE_OBJECT' ||
      alarm.code === 'ADDRESS_GROUP_CHANGED' ||
      alarm.code === 'ROUTE_TABLE_CHANGED' ||
      alarm.code === 'HA_CONFIG_CHANGED' ||
      alarm.code === 'AUTH_SERVER_CHANGED' ||
      alarm.code === 'SD_WAN_CHANGED'
    ) {
      // Collect unique users
      const users = [...new Set(logs.map(l => (l.user as string) || '').filter(Boolean))];
      // Collect unique devices
      const devices = [...new Set(logs.map(l => (l.devname as string) || '').filter(Boolean))];
      let title = alarm.name;
      if (count > 1) title += ` (${count} islem)`;
      if (users.length === 1) title += ` - ${users[0]}`;
      else if (users.length > 1) title += ` - ${users[0]} +${users.length - 1}`;
      if (devices.length === 1) title += ` [${devices[0]}]`;
      else if (devices.length > 1) title += ` [${devices.length} cihaz]`;
      return title;
    }

    // Special handling for FortiGate SSL-VPN alarms
    if (firstLog.user || firstLog.remoteIp) {
      const user = (firstLog.user as string) || '';
      const remoteIp = (firstLog.remoteIp as string) || '';
      let title = alarm.name;
      if (count > 1) title += ` (${count} kullanicı)`;
      if (user) title += ` - ${user}`;
      if (remoteIp) title += ` [${remoteIp}]`;
      return title;
    }

    const srcip = (firstLog.srcip as string) || '';
    const devname = (firstLog.devname as string) || '';

    let title = alarm.name;
    if (count > 1) title += ` (${count} olay)`;
    if (srcip) title += ` - ${srcip}`;
    if (devname) title += ` [${devname}]`;

    return title;
  }

  /**
   * Build alarm message with key details (structured, decoded)
   */
  private buildAlarmMessage(alarm: AlarmDef, logs: Array<Record<string, unknown>>): string {
    const firstLog = logs[0] || {};
    const sections: string[] = [];

    // Description
    sections.push(alarm.description || alarm.name);
    sections.push(`Tespit edilen olay sayisi: ${logs.length}`);

    // Special handling for VMware alarms
    if (firstLog.type && ['vm', 'host', 'datastore', 'cluster', 'snapshot', 'vm_lifecycle', 'snapshot_event', 'snapshot_created'].includes(firstLog.type as string)) {
      const vmwareDetails: string[] = [];
            
      // VM Lifecycle Events
      if (firstLog.type === 'vm_lifecycle') {
        vmwareDetails.push(`VM Adi: ${firstLog.vmName || 'N/A'}`);  
        vmwareDetails.push(`Islem: ${firstLog.eventType || 'N/A'}`);  
        if (firstLog.userName) vmwareDetails.push(`Kullanici: ${firstLog.userName}`);
        if (firstLog.eventTime) vmwareDetails.push(`Olay Zamani: ${new Date(firstLog.eventTime as string).toLocaleString('tr-TR')}`);
      }
      // VM Clone Event (from Events API)
      else if (firstLog.type === 'vm_event' && firstLog.vmCloned) {
        vmwareDetails.push(`VM Adi: ${firstLog.vmName || 'N/A'}`);
        vmwareDetails.push(`Islem: Klonlama (Clone)`);
        if (firstLog.userName) vmwareDetails.push(`Kullanici: ${firstLog.userName}`);
        if (firstLog.eventTime) vmwareDetails.push(`Zaman: ${new Date(firstLog.eventTime as string).toLocaleString('tr-TR')}`);
      }
      // VM Migration Event (vMotion / Storage vMotion)
      else if (firstLog.type === 'vm_event' && firstLog.vmMigrated) {
        vmwareDetails.push(`VM Adi: ${firstLog.vmName || 'N/A'}`);
        vmwareDetails.push(`Islem: Tasima (vMotion/Storage vMotion)`);
        if (firstLog.userName) vmwareDetails.push(`Kullanici: ${firstLog.userName}`);
        if (firstLog.eventTime) vmwareDetails.push(`Zaman: ${new Date(firstLog.eventTime as string).toLocaleString('tr-TR')}`);
      }
      // VM Reconfigure Event
      else if (firstLog.type === 'vm_event' && firstLog.vmReconfigured) {
        vmwareDetails.push(`VM Adi: ${firstLog.vmName || 'N/A'}`);
        vmwareDetails.push(`Islem: Yapilandirma Degisikligi`);
        if (firstLog.userName) vmwareDetails.push(`Kullanici: ${firstLog.userName}`);
        if (firstLog.eventTime) vmwareDetails.push(`Zaman: ${new Date(firstLog.eventTime as string).toLocaleString('tr-TR')}`);
        // Show key settings changed from message
        if (firstLog.message) {
          const msg = firstLog.message as string;
          if (msg.includes('CPU') || msg.includes('Memory') || msg.includes('Disk')) {
            vmwareDetails.push(`Detay: ${msg.substring(0, 100)}${msg.length > 100 ? '...' : ''}`);
          }
        }
      }
      // Snapshot Created (from snapshot list - more reliable detection)
      else if (firstLog.type === 'snapshot_created') {
        vmwareDetails.push(`VM Adi: ${firstLog.vmName || 'N/A'}`);
        vmwareDetails.push(`Snapshot Adi: ${firstLog.snapshotName || 'N/A'}`);
        if (firstLog.description) vmwareDetails.push(`Aciklama: ${firstLog.description}`);
        if (firstLog.createTime) vmwareDetails.push(`Olusturulma Zamani: ${new Date(firstLog.createTime as string).toLocaleString('tr-TR')}`);
        if (firstLog.ageMinutes !== undefined) vmwareDetails.push(`Yas: ${firstLog.ageMinutes} dakika once`);
      }
      // Snapshot Events (from SOAP API)
      else if (firstLog.type === 'snapshot_event') {
        vmwareDetails.push(`VM Adi: ${firstLog.vmName || 'N/A'}`);
        vmwareDetails.push(`Snapshot Adi: ${firstLog.snapshotName || 'N/A'}`);
        vmwareDetails.push(`Islem: ${firstLog.eventType || 'N/A'}`);
        if (firstLog.userName) vmwareDetails.push(`Kullanici: ${firstLog.userName}`);
        if (firstLog.eventTime) vmwareDetails.push(`Olay Zamani: ${new Date(firstLog.eventTime as string).toLocaleString('tr-TR')}`);
      }
      // Regular VM state
      else if (firstLog.type === 'vm') {
        vmwareDetails.push(`VM Adi: ${firstLog.vmName || 'N/A'}`);
        vmwareDetails.push(`Guc Durumu: ${firstLog.powerState || 'N/A'}`);
        if (firstLog.userName) vmwareDetails.push(`Kullanici: ${firstLog.userName}`);
        if (firstLog.eventTime) vmwareDetails.push(`Olay Zamani: ${new Date(firstLog.eventTime as string).toLocaleString('tr-TR')}`);
        if (firstLog.cpuUsage) vmwareDetails.push(`CPU Kullanimi: ${firstLog.cpuUsage}%`);
        if (firstLog.memoryUsage) vmwareDetails.push(`Bellek Kullanimi: ${firstLog.memoryUsage}%`);
        if (firstLog.numCpu) vmwareDetails.push(`vCPU Sayisi: ${firstLog.numCpu}`);
        if (firstLog.memoryMB) vmwareDetails.push(`Bellek: ${Math.round(Number(firstLog.memoryMB) / 1024)}GB`);
        if (firstLog.guestOS) vmwareDetails.push(`Isletim Sistemi: ${firstLog.guestOS}`);
        if (firstLog.ipAddress) vmwareDetails.push(`IP Adresi: ${firstLog.ipAddress}`);
      } else if (firstLog.type === 'host') {
        vmwareDetails.push(`Host Adi: ${firstLog.hostName || 'N/A'}`);
        vmwareDetails.push(`Baglanti Durumu: ${firstLog.connectionState || 'N/A'}`);
        if (firstLog.hostCpuUsage) vmwareDetails.push(`CPU Kullanimi: ${firstLog.hostCpuUsage}%`);
        if (firstLog.hostMemoryUsage) vmwareDetails.push(`Bellek Kullanimi: ${firstLog.hostMemoryUsage}%`);
        if (firstLog.numCpuCores) vmwareDetails.push(`CPU Core: ${firstLog.numCpuCores}`);
        if (firstLog.overallStatus) vmwareDetails.push(`Genel Durum: ${firstLog.overallStatus}`);
      } else if (firstLog.type === 'host_event' && firstLog.maintenanceMode) {
        // ESXI_MAINTENANCE_OUT_OF_HOURS alarm details
        const host = (firstLog.hostName as string || '').replace(/.*Maintenance mode/, '').trim() || 'N/A';
        vmwareDetails.push(`Host: ${host}`);
        vmwareDetails.push(`Durum: Maintenance Mode`);
        if (firstLog.userName) vmwareDetails.push(`Kullanici: ${firstLog.userName}`);
        if (firstLog.eventTime) vmwareDetails.push(`Zaman: ${new Date(firstLog.eventTime as string).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`);
        
        // Parse event message for additional context
        if (firstLog.message) {
          const msg = firstLog.message as string;
          if (msg.includes('User')) {
            const userMatch = msg.match(/User\s+(\S+)/);
            if (userMatch && !vmwareDetails.some(d => d.includes('Kullanici'))) {
              vmwareDetails.push(`Islemi Yapan: ${userMatch[1]}`);
            }
          }
        }
      } else if (firstLog.type === 'datastore') {
        vmwareDetails.push(`Datastore Adi: ${firstLog.datastoreName || 'N/A'}`);
        vmwareDetails.push(`Tip: ${firstLog.datastoreType || 'N/A'}`);
        if (firstLog.datastoreFreePercent !== undefined) {
          vmwareDetails.push(`Bos Alan: ${Number(firstLog.datastoreFreePercent).toFixed(1)}%`);
        }
        if (firstLog.datastoreCapacity) {
          const capacityGB = Number(firstLog.datastoreCapacity) / (1024 * 1024 * 1024);
          const freeGB = Number(firstLog.datastoreFreeSpace || 0) / (1024 * 1024 * 1024);
          vmwareDetails.push(`Kapasite: ${capacityGB.toFixed(1)}GB (bos: ${freeGB.toFixed(1)}GB)`);
        }
      } else if (firstLog.type === 'cluster' && firstLog.haFailoverRisk) {
        // CLUSTER_HA_RISK alarm details
        const reason = firstLog.reason as string || 'unknown';
        const hostCount = firstLog.hostCount as number || 0;
        
        vmwareDetails.push(`Bagli Host Sayisi: ${hostCount}`);
        
        if (reason === 'no-connected-hosts') {
          vmwareDetails.push(`Durum: Cluster'da bagli host yok`);
          vmwareDetails.push(`Risk: Tum VM ler kapatildi veya baska cluster'a tasindi`);
        } else if (reason === 'single-host') {
          vmwareDetails.push(`Durum: Tek host calisiyor`);
          vmwareDetails.push(`Risk: HA failover mumkun degil - bu host kapanirsa tum VM ler etkilenecek`);
        } else if (reason === 'cpu-insufficient') {
          const cpuUsedPct = firstLog.cpuUsedPct as number || 0;
          vmwareDetails.push(`Durum: CPU kapasitesi yetersiz`);
          vmwareDetails.push(`En buyuk host kaybindan sonra CPU kullanimi: %${cpuUsedPct}`);
          vmwareDetails.push(`Risk: Bir host kapanirsa diger hostlar CPU yukunu karsilayamaz`);
        } else if (reason === 'mem-insufficient') {
          const memUsedPct = firstLog.memUsedPct as number || 0;
          vmwareDetails.push(`Durum: Bellek kapasitesi yetersiz`);
          vmwareDetails.push(`En buyuk host kaybindan sonra bellek kullanimi: %${memUsedPct}`);
          vmwareDetails.push(`Risk: Bir host kapanirsa diger hostlar bellek yukunu karsilayamaz`);
        }
        
        // Add cluster name and host list if available
        if (firstLog.clusterName) {
          vmwareDetails.push(`Cluster: ${firstLog.clusterName}`);
        }
        if (firstLog.hostList && Array.isArray(firstLog.hostList)) {
          vmwareDetails.push('');
          vmwareDetails.push('Host Detaylari:');
          (firstLog.hostList as any[]).forEach((host, idx) => {
            const status = host.inMaintenanceMode ? '[MAINTENANCE]' : host.connectionState === 'connected' ? '[CONNECTED]' : '[DISCONNECTED]';
            const cpuPct = host.cpuTotalMHz > 0 ? Math.round((host.cpuUsedMHz / host.cpuTotalMHz) * 100) : 0;
            const memPct = host.memTotalMB > 0 ? Math.round((host.memUsedMB / host.memTotalMB) * 100) : 0;
            vmwareDetails.push(`  ${idx + 1}. ${host.hostName || 'Unknown'} ${status} - CPU: %${cpuPct}, RAM: %${memPct}`);
          });
        }
        
        vmwareDetails.push('');
        vmwareDetails.push(`ACIL: ${hostCount === 0 ? 'Cluster hostlerini kontrol edin.' : hostCount === 1 ? 'Yeni host ekleyin veya VMleri tasiyin.' : 'Host sayisini artirin veya VM kaynaklarini optimize edin.'}`);
      } else if (firstLog.type === 'cluster' && firstLog.drsImbalance) {
        // DRS_IMBALANCE alarm details
        const drsImbalance = firstLog.drsImbalance as number || 0;
        const hostCount = firstLog.hostCount as number || 0;
        const maxCpuPct = firstLog.maxCpuPct as number || 0;
        const minCpuPct = firstLog.minCpuPct as number || 0;
        
        vmwareDetails.push(`Host Sayisi: ${hostCount}`);
        vmwareDetails.push(`Yuk Dengesizligi: %${Math.round(drsImbalance)}`);
        vmwareDetails.push(`En yuksek CPU: %${maxCpuPct}`);
        vmwareDetails.push(`En dusuk CPU: %${minCpuPct}`);
        vmwareDetails.push('');
        vmwareDetails.push(`Aciklama: Hostlar arasindaki CPU kullanim farki %25'i animsadir. DRS otomatik migration yapamiyor veya yetersiz kalmis.`);
        vmwareDetails.push(`Tavsiye: DRS ayarlarini kontrol edin, VMleri elle yeniden dagitin veya host kaynaklarini artirin.`);
      } else if (firstLog.type === 'snapshot') {
        vmwareDetails.push(`Snapshot Adi: ${firstLog.snapshotName || 'N/A'}`);
        vmwareDetails.push(`VM: ${firstLog.vmName || 'N/A'}`);
        if (firstLog.snapshotAgeDays !== undefined) {
          vmwareDetails.push(`Yas: ${Math.floor(Number(firstLog.snapshotAgeDays))} gun`);
        }
        if (firstLog.createTime) {
          vmwareDetails.push(`Olusturulma: ${new Date(firstLog.createTime as string).toLocaleString('tr-TR')}`);
        }
        if (firstLog.snapshotSize) {
          vmwareDetails.push(`Boyut: ${this.formatBytes(Number(firstLog.snapshotSize))}`);
        }
        // MULTIPLE_SNAPSHOTS: show count and list VMs with many snapshots
        if (firstLog.snapshotCount !== undefined) {
          vmwareDetails.push('');
          vmwareDetails.push(`Bu VM de: ${firstLog.snapshotCount} snapshot var`);
          if (firstLog.snapshotNames) {
            vmwareDetails.push(`Snapshotlar: ${(firstLog.snapshotNames as string).substring(0, 100)}${(firstLog.snapshotNames as string).length > 100 ? '...' : ''}`);
          }
        }
        // SNAPSHOT_DISK_GROWTH: show size info
        if (firstLog.snapshotSizeGB !== undefined) {
          vmwareDetails.push('');
          vmwareDetails.push(`Snapshot Boyutu: ${firstLog.snapshotSizeGB} GB`);
        }
      }

      sections.push(vmwareDetails.join('\n'));

      // List other affected resources
      if (logs.length > 1) {
        const otherResources = logs.slice(1, 6).map((l) => {
          if (l.type === 'vm_lifecycle') {
            const user = l.userName ? ` - ${l.userName}` : '';
            return `- VM: ${l.vmName} (${l.eventType}${user})`;
          }
          if (l.type === 'snapshot_created') {
            const time = l.createTime ? new Date(l.createTime as string).toLocaleString('tr-TR') : '';
            return `- ${l.vmName}: "${l.snapshotName}" (${time})`;
          }
          if (l.type === 'snapshot_event') {
            const user = l.userName ? ` - ${l.userName}` : '';
            return `- Snapshot: ${l.snapshotName} on ${l.vmName} (${l.eventType}${user})`;
          }
          if (l.type === 'vm') {
            const user = l.userName ? ` - ${l.userName}` : '';
            return `- VM: ${l.vmName} (${l.powerState}${user})`;
          }
          if (l.type === 'vm_event' && l.vmCloned) {
            const time = l.eventTime ? new Date(l.eventTime as string).toLocaleTimeString('tr-TR') : '';
            return `- ${l.vmName} (clone @ ${time})`;
          }
          if (l.type === 'vm_event' && l.vmMigrated) {
            const time = l.eventTime ? new Date(l.eventTime as string).toLocaleTimeString('tr-TR') : '';
            return `- ${l.vmName} (migrate @ ${time})`;
          }
          if (l.type === 'vm_event' && l.vmReconfigured) {
            const time = l.eventTime ? new Date(l.eventTime as string).toLocaleTimeString('tr-TR') : '';
            return `- ${l.vmName} (reconfig @ ${time})`;
          }
          if (l.type === 'host') return `- Host: ${l.hostName} (${l.connectionState})`;
          if (l.type === 'host_event' && l.maintenanceMode) {
            const host = (l.hostName as string || '').replace(/.*Maintenance mode/, '').trim();
            const time = l.eventTime ? new Date(l.eventTime as string).toLocaleTimeString('tr-TR') : '';
            return `- ${host} (maintenance @ ${time})`;
          }
          if (l.type === 'datastore') return `- Datastore: ${l.datastoreName} (${Number(l.datastoreFreePercent || 0).toFixed(1)}% bos)`;
          if (l.type === 'snapshot') return `- Snapshot: ${l.snapshotName} (${l.vmName}, ${Math.floor(Number(l.snapshotAgeDays || 0))} gun)`;
          return `- ${l.type || 'Unknown'}`;
        }).join('\n');
        sections.push(
          `Diger etkilenen kaynaklar:\n${otherResources}${
            logs.length > 6 ? `\n- ... ve ${logs.length - 6} daha` : ''
          }`
        );
      }

      sections.push(`Onerilen Aksiyon: ${alarm.detectionLogic.recommendedAction}`);
      return sections.join('\n\n');
    }

    // Correlation precursor info (for SOC correlation alarms)
    if (firstLog._correlation_precursors) {
      sections.push(`Onceki Alarmlar: ${firstLog._correlation_precursors}`);
    }
    if (firstLog._correlation_precursor_details) {
      sections.push(`Onceki Alarm Detaylari: ${firstLog._correlation_precursor_details}`);
    }

    // Special handling for FortiView top-sources data (DATA_EXFIL_SUSPECT)
    if (alarm.code === 'DATA_EXFIL_SUSPECT') {
      const toNumber = (val: unknown): number => {
        const n = parseInt(String(val ?? '0'), 10);
        return Number.isNaN(n) ? 0 : n;
      };

      const primary = firstLog;
      const srcip = (primary.srcip as string) || 'N/A';
      const srcintf = (primary.srcintf as string) || '';
      const fortigate = (primary.fortigate as string) || '';
      const devInfo = (primary.dev_src_agg as string) || (primary.mac_devtype_agg as string) || '';

      const sessions = toNumber(primary.sessions);
      const bandwidth = toNumber(primary.bandwidth);
      const outBytes = toNumber(primary.traffic_out);
      const inBytes = toNumber(primary.traffic_in);
      const weight = toNumber(primary.threatweight);
      const sessionBlock = toNumber(primary.session_block);
      const sessionPass = toNumber(primary.session_pass);

      const exfilDetails: string[] = [];
      exfilDetails.push(
        `Kaynak host: ${srcip}` +
          (srcintf ? ` (arayüz: ${srcintf})` : '') +
          (fortigate ? `, cihaz: ${fortigate}` : '')
      );
      if (devInfo) {
        exfilDetails.push(`Cihaz bilgisi: ${devInfo}`);
      }
      exfilDetails.push(
        `Oturum sayisi: ${sessions} (bloklanan: ${sessionBlock}, izin verilen: ${sessionPass})`
      );
      exfilDetails.push(
        `Trafik: giden ${this.formatBytes(outBytes)}, gelen ${this.formatBytes(inBytes)}, toplam ${this.formatBytes(bandwidth)}`
      );
      if (weight) {
        exfilDetails.push(`Tehdit skoru: ${weight}`);
      }

      sections.push(exfilDetails.join('\n'));

      if (logs.length > 1) {
        const otherSources = logs.slice(1, 6).map((l) => {
          const ip = (l.srcip as string) || 'N/A';
          const s = toNumber(l.sessions);
          const out = toNumber(l.traffic_out);
          const bw = toNumber(l.bandwidth);
          const parts: string[] = [ip];
          parts.push(`oturum: ${s}`);
          if (out) parts.push(`giden: ${this.formatBytes(out)}`);
          if (bw) parts.push(`toplam: ${this.formatBytes(bw)}`);
          return `- ${parts.join(', ')}`;
        }).join('\n');
        sections.push(
          `Diger kaynak hostlar:\n${otherSources}${
            logs.length > 6 ? `\n- ... ve ${logs.length - 6} daha` : ''
          }`
        );
      }

      sections.push(`Onerilen Aksiyon: ${alarm.detectionLogic.recommendedAction}`);
      return sections.join('\n\n');
    }

    // Special handling for FortiView top-countries data (UNUSUAL_COUNTRY_TRAFFIC)
    if (alarm.code === 'UNUSUAL_COUNTRY_TRAFFIC' && firstLog.country) {
      const countryDetails: string[] = [];
      const country = (firstLog.country as string) || 'N/A';
      const countryFullname = (firstLog.country_fullname as string) || country;
      const incidents = parseInt(String(firstLog.incidents ?? '0'), 10);
      const bandwidth = parseInt(String(firstLog.bandwidth ?? '0'), 10);
      const sessions = parseInt(String(firstLog.sessions ?? '0'), 10);
      const bytesOut = parseInt(String(firstLog.traffic_out ?? '0'), 10);
      const bytesIn = parseInt(String(firstLog.traffic_in ?? '0'), 10);

      countryDetails.push(`Ulke: ${countryFullname} (${country})`);
      if (incidents > 0) countryDetails.push(`Trafik olaylari: ${incidents}`);
      if (sessions > 0) countryDetails.push(`Oturum sayisi: ${sessions}`);
      if (bandwidth > 0) countryDetails.push(`Bant genisligi: ${this.formatBytes(bandwidth)}`);
      if (bytesOut > 0 || bytesIn > 0) {
        countryDetails.push(`Trafik: giden ${this.formatBytes(bytesOut)}, gelen ${this.formatBytes(bytesIn)}`);
      }

      if (countryDetails.length > 0) {
        sections.push(countryDetails.join('\n'));
      }

      // List other countries
      if (logs.length > 1) {
        const otherCountries = logs.slice(1, 6).map((l) => {
          const c = (l.country_fullname as string) || (l.country as string) || 'N/A';
          const inc = parseInt(String(l.incidents ?? '0'), 10);
          const bw = parseInt(String(l.bandwidth ?? '0'), 10);
          const parts: string[] = [c];
          if (inc > 0) parts.push(`olay: ${inc}`);
          if (bw > 0) parts.push(`bant: ${this.formatBytes(bw)}`);
          return `- ${parts.join(', ')}`;
        }).join('\n');
        sections.push(
          `Diger ulkeler:\n${otherCountries}${
            logs.length > 6 ? `\n- ... ve ${logs.length - 6} daha` : ''
          }`
        );
      }

      sections.push(`Onerilen Aksiyon: ${alarm.detectionLogic.recommendedAction}`);
      return sections.join('\n\n');
    }

    // Special handling for FortiView top-threats data (TOP_THREAT_WEIGHT)
    if (firstLog.threat && firstLog.threatweight) {
      const fortiDetails: string[] = [];
      const threat = (firstLog.threat as string) || 'N/A';
      const threatType = (firstLog.threattype as string) || 'N/A';
      const level = (firstLog.level_s as string) || (firstLog.threatlevel as string) || 'N/A';
      const weight = (firstLog.threatweight as string) || '0';
      const blockCount = (firstLog.threat_block as string) || '0';
      const passCount = (firstLog.threat_pass as string) || '0';
      const incidents = (firstLog.incidents as string) || '0';
      const incidentBlock = (firstLog.incident_block as string) || '0';
      const incidentPass = (firstLog.incident_pass as string) || '0';
      const fortigate = (firstLog.fortigate as string) || '';
      const obfUrl = (firstLog.obf_url as string) || '';

      fortiDetails.push(`En kritik tehdit: ${threat} (tip: ${threatType}, seviye: ${level})`);
      fortiDetails.push(`Tehdit skoru: ${weight} (bloklanan: ${blockCount}, izin verilen: ${passCount})`);
      fortiDetails.push(`Olay sayisi: ${incidents} (bloklanan: ${incidentBlock}, izin verilen: ${incidentPass})`);
      if (fortigate) {
        fortiDetails.push(`Cihaz(lar): ${fortigate}`);
      }
      if (obfUrl) {
        fortiDetails.push(`Hedef: ${obfUrl}`);
      }

      if (fortiDetails.length > 0) {
        sections.push(fortiDetails.join('\n'));
      }

      if (logs.length > 1) {
        const otherThreats = logs.slice(1, 5).map((l) => {
          const t = (l.threat as string) || 'N/A';
          const tt = (l.threattype as string) || '';
          const lvl = (l.level_s as string) || (l.threatlevel as string) || '';
          const score = (l.threatweight as string) || '';
          const cnt = (l.incidents as string) || '';
          const parts: string[] = [t];
          if (tt) parts.push(`tip: ${tt}`);
          if (lvl) parts.push(`seviye: ${lvl}`);
          if (score) parts.push(`skor: ${score}`);
          if (cnt) parts.push(`olay: ${cnt}`);
          return `- ${parts.join(', ')}`;
        }).join('\n');
        sections.push(
          `Diger tehditler:\n${otherThreats}${
            logs.length > 5 ? `\n- ... ve ${logs.length - 5} daha` : ''
          }`
        );
      }

      // Recommended action
      sections.push(`Onerilen Aksiyon: ${alarm.detectionLogic.recommendedAction}`);
      return sections.join('\n\n');
    }

    // Special handling for FortiGate VPN tunnel events (IPsec / SSL-VPN tunnel-up/down)
    if (firstLog.vpntunnel || (firstLog.tunneltype && firstLog.remip)) {
      const tunnelDetails: string[] = [];
      if (firstLog.vpntunnel)   tunnelDetails.push(`Tunel Adi: ${firstLog.vpntunnel}`);
      if (firstLog.tunneltype)  tunnelDetails.push(`Tunel Tipi: ${(firstLog.tunneltype as string).toUpperCase()}`);
      if (firstLog.action) {
        const actionLabel = firstLog.action === 'tunnel-up'
          ? 'Kuruldu (UP)'
          : firstLog.action === 'tunnel-down'
            ? 'Kapandi (DOWN)'
            : String(firstLog.action);
        tunnelDetails.push(`Durum: ${actionLabel}`);
      }
      if (firstLog.remip)   tunnelDetails.push(`Uzak Nokta (Remote): ${firstLog.remip}`);
      if (firstLog.locip)   tunnelDetails.push(`Yerel Nokta (Local): ${firstLog.locip}`);
      if (firstLog.devname) tunnelDetails.push(`Guvenlik Duvari: ${firstLog.devname}`);
      const durationSec = Number(firstLog.duration || 0);
      if (durationSec > 0) {
        const h = Math.floor(durationSec / 3600);
        const m = Math.floor((durationSec % 3600) / 60);
        const s = durationSec % 60;
        const durationStr = h > 0 ? `${h}s ${m}dk ${s}sn` : m > 0 ? `${m}dk ${s}sn` : `${s}sn`;
        tunnelDetails.push(`Sure: ${durationStr}`);
      }
      const sentBytes = Number(firstLog.sentbyte || 0);
      const rcvdBytes = Number(firstLog.rcvdbyte || 0);
      if (sentBytes > 0) tunnelDetails.push(`Gonderilen: ${this.formatBytes(sentBytes)}`);
      if (rcvdBytes > 0) tunnelDetails.push(`Alinan: ${this.formatBytes(rcvdBytes)}`);
      if (firstLog.date && firstLog.time) {
        tunnelDetails.push(`Olay Zamani: ${firstLog.date} ${firstLog.time}${firstLog.tz ? ` (${firstLog.tz})` : ''}`);
      }
      if (firstLog.logdesc) tunnelDetails.push(`Log: ${this.decodeMsg(firstLog.logdesc as string)}`);

      sections.push(tunnelDetails.join('\n'));

      // List other tunnels if multiple
      if (logs.length > 1) {
        const others = logs.slice(1, 6).map((l) => {
          const tname = (l.vpntunnel as string) || (l.remip as string) || 'N/A';
          const tstatus = l.action === 'tunnel-up' ? 'UP' : l.action === 'tunnel-down' ? 'DOWN' : String(l.action || '');
          return `- ${tname} [${tstatus}]`;
        }).join('\n');
        sections.push(`Diger tuneller:\n${others}${logs.length > 6 ? `\n- ... ve ${logs.length - 6} daha` : ''}`);
      }

      sections.push(`Onerilen Aksiyon: ${alarm.detectionLogic.recommendedAction}`);
      return sections.join('\n\n');
    }

    // Special handling for admin login fail alarms (UNAUTH_ADMIN_LOGIN, ADMIN_LOGIN_FAILED)
    if (alarm.code === 'UNAUTH_ADMIN_LOGIN' || alarm.code === 'ADMIN_LOGIN_FAILED') {
      const loginDetails: string[] = [];

      const user     = (firstLog.user    as string) || 'N/A';
      const srcip    = (firstLog.srcip   as string) || (firstLog.remip as string) || '';
      const devname  = (firstLog.devname as string) || '';
      const vd       = (firstLog.vd      as string) || '';
      const msg      = (firstLog.msg     as string) || '';
      const ui       = (firstLog.ui      as string) || '';

      // Parse "GUI(10.7.7.7)" → method=GUI, ip=10.7.7.7
      const uiMatch    = ui.match(/^([A-Za-z_]+)\((.+)\)$/);
      const accessMethod = uiMatch ? uiMatch[1].toUpperCase() : (ui || 'N/A');
      const accessIp     = uiMatch ? uiMatch[2] : srcip;

      loginDetails.push(`Kullanici: ${user}`);
      if (accessIp || srcip) loginDetails.push(`Kaynak IP: ${accessIp || srcip}`);
      loginDetails.push(`Erisim Yontemi: ${accessMethod}`);
      if (devname) loginDetails.push(`Cihaz: ${devname}`);
      if (vd && vd !== 'root') loginDetails.push(`VDOM: ${vd}`);
      if (firstLog.date && firstLog.time) {
        const tz = firstLog.tz ? ` (${firstLog.tz})` : '';
        loginDetails.push(`Zaman: ${firstLog.date} ${firstLog.time}${tz}`);
      }
      if (msg) loginDetails.push(`Hata: ${this.decodeMsg(msg)}`);

      sections.push(loginDetails.join('\n'));

      // List additional attempts
      if (logs.length > 1) {
        const attempts = logs.slice(1, 10).map((l) => {
          const lu    = (l.user   as string) || 'N/A';
          const lsrc  = (l.srcip  as string) || (l.remip  as string) || '';
          const lui   = (l.ui     as string) || '';
          const lm    = lui.match(/^([A-Za-z_]+)\((.+)\)$/);
          const lMethod = lm ? lm[1].toUpperCase() : (lui || '');
          const lIp     = lm ? lm[2] : lsrc;
          const lt      = (l.time as string) || '';
          const parts: string[] = [lu];
          if (lIp)     parts.push(lIp);
          if (lMethod) parts.push(lMethod);
          if (lt)      parts.push(lt);
          return `- ${parts.join(' @ ')}`;
        }).join('\n');
        sections.push(`Diger denemeler:\n${attempts}${logs.length > 10 ? `\n- ... ve ${logs.length - 10} daha` : ''}`);
      }

      sections.push(`Onerilen Aksiyon: ${alarm.detectionLogic.recommendedAction}`);
      return sections.join('\n\n');
    }

    // Special handling for FortiGate SSL-VPN alarms
    // NOTE: config change events also have a 'user' field — skip them here (handled below via cfgpath)
    const isConfigChangeAlarm = alarm.code === 'CORE_CONFIG_CHANGE' ||
      alarm.code === 'FW_POLICY_CHANGED' ||
      alarm.code === 'INTERFACE_CONFIG_CHANGED' ||
      alarm.code === 'CONFIG_CHANGE_AFTER_HOURS' ||
      alarm.code === 'ADDRESS_OBJECT_CHANGED' ||
      alarm.code === 'NEW_ADDRESS_OBJECT' ||
      alarm.code === 'NEW_SERVICE_OBJECT' ||
      alarm.code === 'ADDRESS_GROUP_CHANGED' ||
      alarm.code === 'ROUTE_TABLE_CHANGED' ||
      alarm.code === 'AUTH_SERVER_CHANGED' ||
      alarm.code === 'ADMIN_PRIVILEGE_CHANGE' ||
      alarm.code === 'ADMIN_PASSWORD_CHANGED' ||
      alarm.code === 'NEW_ADMIN_USER' ||
      alarm.code === 'SERVICE_GROUP_CHANGED' ||
      alarm.code === 'NAT_POLICY_CHANGED' ||
      alarm.code === 'SNAT_POOL_CHANGED' ||
      alarm.code === 'IPSEC_TUNNEL_CHANGED' ||
      alarm.code === 'SSL_VPN_SETTINGS_CHANGED' ||
      alarm.code === 'SCHEDULE_OBJECT_CHANGED';
    
    // SSL-VPN authentication failure alarm - show user + IP details
    if (alarm.code === 'SSLVPN_AUTH_FAILED') {
      const fgDetails: string[] = [];
      if (firstLog.user) fgDetails.push(`Kullanici: ${firstLog.user}`);
      if (firstLog.remip) fgDetails.push(`Kaynak IP: ${firstLog.remip}`);
      if (firstLog.devname) fgDetails.push(`Guvenlik Duvari: ${firstLog.devname}`);
      if (firstLog.tunneltype) fgDetails.push(`Tunel Tipi: ${(firstLog.tunneltype as string).toUpperCase().replace(/-/g, ' ')}`);
      if (firstLog.action) fgDetails.push(`Durum: ${(firstLog.action as string)}`);
      if (firstLog.reason) fgDetails.push(`Sebep: ${this.decodeMsg(firstLog.reason as string).replace(/_/g, ' ')}`);
      if (firstLog.date && firstLog.time) {
        const tz = firstLog.tz ? ` (${firstLog.tz})` : '';
        fgDetails.push(`Olay Zamani: ${firstLog.date} ${firstLog.time}${tz}`);
      }
      if (firstLog.group && firstLog.group !== 'N/A') fgDetails.push(`Grup: ${firstLog.group}`);
      
      sections.push(fgDetails.join('\n'));
      sections.push(`Onerilen Aksiyon: ${alarm.detectionLogic.recommendedAction}`);
      return sections.join('\n\n');
    }
    
    if ((firstLog.remoteIp || firstLog.user) && !isConfigChangeAlarm) {
      const fgDetails: string[] = [];
      if (firstLog.user) fgDetails.push(`Kullanici: ${firstLog.user}`);
      if (firstLog.remoteIp) fgDetails.push(`Uzak IP: ${firstLog.remoteIp}`);
      if (firstLog.assignedIp) fgDetails.push(`Atanan IP: ${firstLog.assignedIp}`);
      if (firstLog.loginTime) fgDetails.push(`Giris Zamani: ${new Date(firstLog.loginTime as string).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`);
      if (firstLog.duration) fgDetails.push(`Sure: ${firstLog.duration} dakika`);
      if (firstLog.inMB) fgDetails.push(`Gelen: ${firstLog.inMB} MB`);
      if (firstLog.outMB) fgDetails.push(`Giden: ${firstLog.outMB} MB`);
      // Time context
      if (firstLog.isWeekend) fgDetails.push(`Hafta sonu: EVET`);
      if (firstLog.isOffHours) fgDetails.push(`Mesai disi: EVET`);
      if (firstLog.isBusinessHours && !firstLog.isOffHours && !firstLog.isWeekend) fgDetails.push(`Mesai ici baglanti: EVET`);

      sections.push(fgDetails.join('\n'));

      // List other SSL-VPN users
      if (logs.length > 1) {
        const otherUsers = logs.slice(1, 6).map((l) => {
          const u = l.user || 'N/A';
          const ip = l.remoteIp || '';
          const time = l.loginTime ? new Date(l.loginTime as string).toLocaleTimeString('tr-TR') : '';
          return `- ${u}${ip ? ` (${ip})` : ''}${time ? ` - ${time}` : ''}`;
        }).join('\n');
        sections.push(
          `Diger kullanicilar:\n${otherUsers}${logs.length > 6 ? `\n- ... ve ${logs.length - 6} daha` : ''}`
        );
      }

      sections.push(`Onerilen Aksiyon: ${alarm.detectionLogic.recommendedAction}`);
      return sections.join('\n\n');
    }

    // Event details from first log (generic path)
    const details: string[] = [];

    // ── Config Change alarms: rich per-change breakdown ──────────────────────
    if (
      alarm.code === 'CORE_CONFIG_CHANGE' ||
      alarm.code === 'FW_POLICY_CHANGED' ||
      alarm.code === 'INTERFACE_CONFIG_CHANGED' ||
      alarm.code === 'CONFIG_CHANGE_AFTER_HOURS' ||
      alarm.code === 'ADDRESS_OBJECT_CHANGED' ||
      alarm.code === 'NEW_ADDRESS_OBJECT' ||
      alarm.code === 'NEW_SERVICE_OBJECT' ||
      alarm.code === 'ADDRESS_GROUP_CHANGED' ||
      alarm.code === 'ROUTE_TABLE_CHANGED' ||
      alarm.code === 'AUTH_SERVER_CHANGED' ||
      alarm.code === 'ADMIN_PRIVILEGE_CHANGE' ||
      alarm.code === 'ADMIN_PASSWORD_CHANGED' ||
      alarm.code === 'NEW_ADMIN_USER' ||
      alarm.code === 'SERVICE_GROUP_CHANGED' ||
      alarm.code === 'NAT_POLICY_CHANGED' ||
      alarm.code === 'SNAT_POOL_CHANGED' ||
      alarm.code === 'IPSEC_TUNNEL_CHANGED' ||
      alarm.code === 'SSL_VPN_SETTINGS_CHANGED' ||
      alarm.code === 'SCHEDULE_OBJECT_CHANGED'
    ) {
      // ── CMDB Diff alarms — unified handler with rich detail ─────────────
      if (firstLog.source === 'fortigate-cmdb-diff') {
        const endpointLabel = (ep: string): string => {
          const labels: Record<string, string> = {
            '/cmdb/firewall/policy':              'Guvenlik Duvari Politikasi',
            '/cmdb/system/admin':                 'Sistem Yoneticisi',
            '/cmdb/firewall/vip':                 'Virtual IP (VIP)',
            '/cmdb/router/static':                'Statik Rota',
            '/cmdb/vpn.ipsec/phase1-interface':   'IPsec Tunel',
            '/cmdb/vpn.ssl/settings':             'SSL-VPN Ayarlari',
            '/cmdb/system/interface':             'Arayuz Konfigurasyonu',
            '/cmdb/firewall/address':             'Adres Nesnesi',
            '/cmdb/firewall/addrgrp':             'Adres Grubu',
            '/cmdb/user/ldap':                    'Kimlik Dogrulama Sunucusu (LDAP)',
            '/cmdb/system/accprofile':            'Erisim Profili',
          };
          return labels[ep] || ep.replace('/cmdb/', '');
        };

        const endpoint     = firstLog.endpoint as string | undefined;
        const changedEps   = (firstLog.changedEndpoints as string[] | undefined) || [];
        const detectedAt   = firstLog.detectedAt as string | undefined;
        const itemCount    = firstLog.itemCount as number | undefined;
        const diffDetails  = (firstLog as any).diffDetails;
        // Admin user enrichment fields (set by fortigate-cmdb.ts resolveAdminUsers)
        const adminUsers   = (firstLog as any).admin_users as Array<{ user: string; ui: string; objects: string[] }> | undefined;
        const adminUser    = (firstLog.admin_user as string | null) || null;
        const adminUi      = (firstLog.admin_ui as string | null) || null;
        const detectedAtStr = detectedAt
          ? new Date(detectedAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
          : 'N/A';

        const cmdbSections: string[] = [];

        // ── Header with endpoint + item count ───────────────────────────
        const headerLines: string[] = [];
        if (endpoint) {
          headerLines.push(`Degisen Alan: ${endpointLabel(endpoint)}`);
        }
        if (changedEps.length > 0) {
          headerLines.push(`Degisen Alanlar: ${changedEps.map(ep => endpointLabel(ep)).join(', ')}`);
        }
        if (itemCount !== undefined) {
          headerLines.push(`Toplam Obje: ${itemCount}`);
        }
        headerLines.push(`Tespit Zamani: ${detectedAtStr}`);
        // ── Who made the change ──────────────────────────────────────────
        if (adminUser) {
          // Format: "fcelebigil (GUI - 10.7.7.7)" or "fcelebigil"
          const uiDisplay = adminUi
            ? adminUi.replace(/^(GUI|SSH|API)\(([^)]+)\)$/, '$1 - $2')
            : '';
          headerLines.push(`Degistiren Kullanici: ${adminUser}${uiDisplay ? ` (${uiDisplay})` : ''}`);
        } else if (adminUsers && adminUsers.length > 1) {
          // Multiple users (rare)
          headerLines.push(`Degistiren Kullanici: ${adminUsers.map(u => u.user).join(', ')}`);
        }
        cmdbSections.push(headerLines.join('\n'));

        // ── Detailed diff (added / removed / modified) ──────────────────
        if (diffDetails && (diffDetails.added?.length > 0 || diffDetails.removed?.length > 0 || diffDetails.modified?.length > 0)) {
          // Added items
          if (diffDetails.added.length > 0) {
            const addedList = diffDetails.added.slice(0, 10).map((item: any, idx: number) => {
              const name = item.name || item.key || '#N/A';
              return `${idx + 1}. ${name}`;
            }).join('\n');
            cmdbSections.push(`Yeni Eklenenler (${diffDetails.added.length}):\n${addedList}${
              diffDetails.added.length > 10 ? `\n   ... ve ${diffDetails.added.length - 10} tane daha` : ''
            }`);
          }

          // Removed items
          if (diffDetails.removed.length > 0) {
            const removedList = diffDetails.removed.slice(0, 10).map((item: any, idx: number) => {
              const name = item.name || item.key || '#N/A';
              return `${idx + 1}. ${name}`;
            }).join('\n');
            cmdbSections.push(`Silinenler (${diffDetails.removed.length}):\n${removedList}${
              diffDetails.removed.length > 10 ? `\n   ... ve ${diffDetails.removed.length - 10} tane daha` : ''
            }`);
          }

          // Modified items
          if (diffDetails.modified.length > 0) {
            const modifiedList = diffDetails.modified.slice(0, 5).map((item: any, idx: number) => {
              const name = item.name || item.key || '#N/A';
              const changes = (item.changes || []).slice(0, 3).map((c: any) => {
                const oldVal = typeof c.oldValue === 'object' ? JSON.stringify(c.oldValue) : String(c.oldValue ?? '-');
                const newVal = typeof c.newValue === 'object' ? JSON.stringify(c.newValue) : String(c.newValue ?? '-');
                return `   - ${c.field}: ${oldVal} -> ${newVal}`;
              }).join('\n');
              return `${idx + 1}. ${name} (${(item.changes || []).length} degisiklik)\n${changes}${
                (item.changes || []).length > 3 ? `\n   ... ve ${(item.changes || []).length - 3} degisiklik daha` : ''
              }`;
            }).join('\n\n');
            cmdbSections.push(`Degistirilenler (${diffDetails.modified.length}):\n${modifiedList}${
              diffDetails.modified.length > 5 ? `\n   ... ve ${diffDetails.modified.length - 5} tane daha` : ''
            }`);
          }

          sections.push(cmdbSections.join('\n\n'));
          sections.push(`Onerilen Aksiyon: ${alarm.detectionLogic.recommendedAction}`);
          return sections.join('\n\n');
        }

        // ── No per-item diff: endpoint-level change detected ────────────
        // (Content changed but item-by-item diff produced empty arrays)
        cmdbSections.push(`Durum: Endpoint iceriginde degisiklik algilandi ancak item-seviyesinde fark bulunamadi.\nOneri: FortiGate Config Revision ile onceki/sonraki durumu karsilastirin.`);

        sections.push(cmdbSections.join('\n\n'));
        sections.push(`Onerilen Aksiyon: ${alarm.detectionLogic.recommendedAction}`);
        return sections.join('\n\n');
      }

      // Fallback: Original log-based format (for FA log events)
      // Group logs by user for overview
      const userGroups = new Map<string, Array<Record<string, unknown>>>();
      for (const log of logs) {
        const u = (log.user as string) || 'N/A';
        if (!userGroups.has(u)) userGroups.set(u, []);
        userGroups.get(u)!.push(log);
      }

      const cfgSections: string[] = [];

      // Header: who, from where, on which device
      const ui = (firstLog.ui as string) || '';
      const uiMatch = ui.match(/^([A-Z]+)\((.+)\)$/);
      const accessMethod = uiMatch ? uiMatch[1] : ui;
      const accessIp = uiMatch ? uiMatch[2] : '';

      cfgSections.push([
        `Kullanici: ${firstLog.user || 'N/A'}`,
        `Cihaz: ${firstLog.devname || 'N/A'}`,
        `VDOM: ${firstLog.vd || 'root'}`,
        accessMethod ? `Erisim: ${accessMethod}${accessIp ? ` (${accessIp})` : ''}` : '',
      ].filter(Boolean).join('\n'));

      // List of changes (up to 10)
      // Action label mapping
      const actionLabel = (raw: string) => {
        switch ((raw || '').toLowerCase()) {
          case 'add':    return 'Ekleme (Add)';
          case 'delete': return 'Silme (Delete)';
          case 'edit':   return 'Duzenleme (Edit)';
          case 'set':    return 'Guncelleme (Set)';
          default:       return raw || 'Duzenleme';
        }
      };

      const changeList = logs.slice(0, 10).map((log, idx) => {
        const t = `${log.time || ''}`;
        const action = (log.action as string) || 'Edit';
        const path = (log.cfgpath as string) || '';
        const obj = (log.cfgobj as string) || '';
        const attr = (log.cfgattr as string) || '';
        const msg = (log.msg as string) || '';
        const logUser = (log.user as string) || '';
        const logDev = (log.devname as string) || '';

        let line = `${idx + 1}. [${t}] ${actionLabel(action)}`;
        // Per-alarm-type: show object name prominently
        if (alarm.code === 'FW_POLICY_CHANGED') {
          if (obj) line += ` — Politika #${obj}`;
        } else if (alarm.code === 'ADDRESS_OBJECT_CHANGED' || alarm.code === 'NEW_ADDRESS_OBJECT') {
          if (obj) line += ` — Adres Nesnesi: "${obj}"`;
          else if (path) line += ` ${path}`;
        } else if (alarm.code === 'ADDRESS_GROUP_CHANGED') {
          if (obj) line += ` — Adres Grubu: "${obj}"`;
        } else if (alarm.code === 'NEW_SERVICE_OBJECT' || alarm.code === 'SERVICE_GROUP_CHANGED') {
          if (obj) line += ` — Servis: "${obj}"`;
        } else if (alarm.code === 'ROUTE_TABLE_CHANGED') {
          if (obj) line += ` — Rota: "${obj}"`;
          else if (path) line += ` ${path}`;
        } else if (alarm.code === 'AUTH_SERVER_CHANGED' || alarm.code === 'ADMIN_PASSWORD_CHANGED' || alarm.code === 'NEW_ADMIN_USER' || alarm.code === 'ADMIN_PRIVILEGE_CHANGE') {
          if (obj) line += ` — Sunucu/Kullanici: "${obj}"`;
          else if (path) line += ` ${path}`;
        } else if (alarm.code === 'IPSEC_TUNNEL_CHANGED' || alarm.code === 'SSL_VPN_SETTINGS_CHANGED') {
          if (obj) line += ` — VPN: "${obj}"`;
          else if (path) line += ` ${path}`;
        } else if (alarm.code === 'SNAT_POOL_CHANGED' || alarm.code === 'NAT_POLICY_CHANGED') {
          if (obj) line += ` — NAT: "${obj}"`;
          else if (path) line += ` ${path}`;
        } else if (alarm.code === 'SCHEDULE_OBJECT_CHANGED') {
          if (obj) line += ` — Zamanlama: "${obj}"`;
          else if (path) line += ` ${path}`;
        } else {
          if (path) line += ` ${path}`;
          if (obj) line += ` #${obj}`;
        }
        if (logUser !== (firstLog.user as string)) line += ` (${logUser})`;
        if (logDev !== (firstLog.devname as string)) line += ` [${logDev}]`;

        // ── Rich attribute diff: parse cfgattr for before→after ──────
        if (attr) {
          const parsedAttrs = this.parseCfgAttr(attr);
          for (const pa of parsedAttrs) {
            const attrLabel = this.getAttrLabel(pa.attr);
            if (pa.oldVal !== null && pa.newVal !== null) {
              // Before→after found in cfgattr (e.g. "status:enable->disable")
              const oldDisplay = this.getValueLabel(pa.oldVal);
              const newDisplay = this.getValueLabel(pa.newVal);
              line += `\n   ${attrLabel} (${pa.attr}): ${oldDisplay} → ${newDisplay}`;
            } else {
              // Only attribute name — try extracting new value from msg
              const newValFromMsg = this.extractNewValueFromMsg(msg, pa.attr);
              if (newValFromMsg) {
                line += `\n   ${attrLabel} (${pa.attr}): → ${this.getValueLabel(newValFromMsg)}`;
              } else {
                line += `\n   ${attrLabel} (${pa.attr})`;
              }
            }
          }
          // Also show decoded msg if it contains additional detail beyond the attr
          if (msg) {
            const msgDecoded = this.decodeMsg(msg);
            const msgShort = msgDecoded.length > 120 ? msgDecoded.slice(0, 117) + '...' : msgDecoded;
            // Only add msg if it's not a generic message and doesn't repeat the attr info
            if (msgShort && !msgShort.startsWith('Object attribute') && msgShort !== attr) {
              line += `\n   Mesaj: ${msgShort}`;
            }
          }
        } else if (msg) {
          // No cfgattr — decode and show the msg field
          const msgDecoded = this.decodeMsg(msg);
          if (msgDecoded) line += `\n   ${msgDecoded}`;
        }
        return line;
      });
      cfgSections.push(`Yapilandirma Degisiklikleri (${logs.length} islem):\n${changeList.join('\n')}${
        logs.length > 10 ? `\n... ve ${logs.length - 10} islem daha` : ''
      }`);

      sections.push(cfgSections.join('\n\n'));
      sections.push(`Onerilen Aksiyon: ${alarm.detectionLogic.recommendedAction}`);
      return sections.join('\n\n');
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── WebFilter alarms: per-event URL + category breakdown ─────────────
    if (alarm.code === 'WEBFILTER_HIGH_RISK' || alarm.code === 'WEBFILTER_OVERRIDE') {
      const wfSections: string[] = [];

      // Overview header
      const srcGroup = (firstLog.srcuuid_name as string) || '';
      const profile = (firstLog.profile as string) || '';
      const devname = (firstLog.devname as string) || '';
      wfSections.push([
        `Kaynak IP: ${firstLog.srcip || 'N/A'}${srcGroup ? ` (${srcGroup})` : ''}`,
        `Kaynak Arayuz: ${firstLog.srcintf || 'N/A'}`,
        `Cihaz: ${devname}`,
        `Profil: ${profile}`,
      ].filter(Boolean).join('\n'));

      // Per-event details (up to 10)
      const eventList = logs.slice(0, 10).map((log, idx) => {
        const hostname = this.decodeMsg((log.hostname as string) || '');
        const catdesc = (log.catdesc as string) || '';
        const cat = (log.cat as string) || '';
        const action = (log.action as string) || '';
        const srcip = (log.srcip as string) || '';
        const dstCountry = this.decodeMsg((log.dstcountry as string) || '');
        const t = `${log.time || ''}`;
        const sent = log.sentbyte ? this.formatBytes(Number(log.sentbyte)) : '';
        const rcvd = log.rcvdbyte ? this.formatBytes(Number(log.rcvdbyte)) : '';
        const refUrl = this.decodeMsg((log.referralurl as string) || '');

        let line = `${idx + 1}. [${t}] ${hostname || 'N/A'}`;
        if (catdesc) line += `\n   Kategori: ${catdesc}${cat ? ` (ID: ${cat})` : ''}`;
        if (action) line += `\n   Aksiyon: ${action}`;
        if (srcip !== (firstLog.srcip as string)) line += `\n   Kaynak: ${srcip}`;
        if (dstCountry) line += `\n   Hedef Ulke: ${dstCountry}`;
        if (sent || rcvd) line += `\n   Trafik: ${sent ? `↑${sent}` : ''} ${rcvd ? `↓${rcvd}` : ''}`.trim();
        if (refUrl) line += `\n   Referans: ${refUrl.slice(0, 80)}${refUrl.length > 80 ? '...' : ''}`;
        return line;
      });
      wfSections.push(`Engellenen Erisimler (${logs.length} olay):\n${eventList.join('\n')}${
        logs.length > 10 ? `\n... ve ${logs.length - 10} olay daha` : ''
      }`);

      // Category summary
      const catCounts = new Map<string, number>();
      for (const log of logs) {
        const c = (log.catdesc as string) || 'Unknown';
        catCounts.set(c, (catCounts.get(c) || 0) + 1);
      }
      const catSummary = [...catCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([cat, cnt]) => `  - ${cat}: ${cnt} kez`)
        .join('\n');
      if (catSummary) wfSections.push(`Kategori Ozeti:\n${catSummary}`);

      sections.push(wfSections.join('\n\n'));
      sections.push(`Onerilen Aksiyon: ${alarm.detectionLogic.recommendedAction}`);
      return sections.join('\n\n');
    }
    // ─────────────────────────────────────────────────────────────────────────


    // ── POLICY_HIT_ANOMALY: rich traffic breakdown ────────────────────────────
    if (alarm.code === 'POLICY_HIT_ANOMALY' || alarm.code === 'EXCESSIVE_BANDWIDTH') {
      const topN = <K extends string | number>(
        map: Map<K, number>,
        n: number
      ): Array<[K, number]> =>
        [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

      // Aggregation maps
      const srcCounts    = new Map<string, number>();
      const dstCounts    = new Map<string, number>();
      const policyCounts = new Map<string, number>();
      const svcCounts    = new Map<string, number>();
      const actionCounts = new Map<string, number>();
      let totalSent = 0;
      let totalRcvd = 0;

      for (const log of logs) {
        const src    = (log.srcip    as string) || '';
        const dst    = (log.dstip    as string) || '';
        const pol    = (log.policyid as string) || '';
        const svc    = (log.service  as string) || (log.app as string) || '';
        const act    = (log.action   as string) || 'unknown';
        totalSent += Number(log.sentbyte  || 0);
        totalRcvd += Number(log.rcvdbyte  || 0);
        if (src) srcCounts.set(src,    (srcCounts.get(src)    || 0) + 1);
        if (dst) dstCounts.set(dst,    (dstCounts.get(dst)    || 0) + 1);
        if (pol) policyCounts.set(pol, (policyCounts.get(pol) || 0) + 1);
        if (svc) svcCounts.set(svc,    (svcCounts.get(svc)    || 0) + 1);
        actionCounts.set(act, (actionCounts.get(act) || 0) + 1);
      }

      const devname   = (firstLog.devname as string) || '';
      const srcIfaceF = (firstLog.srcintf as string) || '';
      const dstIfaceF = (firstLog.dstintf as string) || '';

      // Header
      const headerLines = [
        `Toplam Olay: ${logs.length}`,
        `Cihaz: ${devname}`,
      ];
      if (srcIfaceF || dstIfaceF) headerLines.push(`Arayuzler: ${srcIfaceF} → ${dstIfaceF}`);
      if (totalSent + totalRcvd > 0)
        headerLines.push(`Toplam Trafik: ↑${this.formatBytes(totalSent)} ↓${this.formatBytes(totalRcvd)}`);
      sections.push(headerLines.join('\n'));

      // Action breakdown
      const actionStr = topN(actionCounts, 6)
        .map(([a, c]) => `${a}: ${c}`)
        .join(' | ');
      sections.push(`Aksiyon Ozeti: ${actionStr}`);

      // Top 5 source IPs
      const topSrc = topN(srcCounts, 5);
      if (topSrc.length > 0) {
        sections.push(
          `En Fazla Kaynak IP:\n` +
          topSrc.map(([ip, c]) => `  - ${ip} (${c} istek)`).join('\n')
        );
      }

      // Top 5 destination IPs
      const topDst = topN(dstCounts, 5);
      if (topDst.length > 0) {
        sections.push(
          `En Fazla Hedef IP:\n` +
          topDst.map(([ip, c]) => `  - ${ip} (${c} istek)`).join('\n')
        );
      }

      // Top 3 policies
      const topPol = topN(policyCounts, 3);
      if (topPol.length > 0) {
        sections.push(
          `En Cok Vurulan Politikalar:\n` +
          topPol.map(([pol, c]) => `  - Politika #${pol} (${c} hit)`).join('\n')
        );
      }

      // Top 3 services
      const topSvc = topN(svcCounts, 3);
      if (topSvc.length > 0) {
        sections.push(
          `En Cok Kullanilan Servisler:\n` +
          topSvc.map(([svc, c]) => `  - ${svc} (${c} hit)`).join('\n')
        );
      }

      sections.push(`Onerilen Aksiyon: ${alarm.detectionLogic.recommendedAction}`);
      return sections.join('\n\n');
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── POLICY_HIT_ANOMALY: rich traffic breakdown ────────────────────────────
    if (alarm.code === 'POLICY_HIT_ANOMALY' || alarm.code === 'EXCESSIVE_BANDWIDTH') {
      const topN = <K extends string | number>(
        map: Map<K, number>,
        n: number
      ): Array<[K, number]> =>
        [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

      const srcCounts    = new Map<string, number>();
      const dstCounts    = new Map<string, number>();
      const policyCounts = new Map<string, number>();
      const svcCounts    = new Map<string, number>();
      const actionCounts = new Map<string, number>();
      let totalSent = 0;
      let totalRcvd = 0;

      for (const log of logs) {
        const src = (log.srcip    as string) || '';
        const dst = (log.dstip    as string) || '';
        const pol = (log.policyid as string) || '';
        const svc = (log.service  as string) || (log.app as string) || '';
        const act = (log.action   as string) || 'unknown';
        totalSent += Number(log.sentbyte || 0);
        totalRcvd += Number(log.rcvdbyte || 0);
        if (src) srcCounts.set(src,    (srcCounts.get(src)    || 0) + 1);
        if (dst) dstCounts.set(dst,    (dstCounts.get(dst)    || 0) + 1);
        if (pol) policyCounts.set(pol, (policyCounts.get(pol) || 0) + 1);
        if (svc) svcCounts.set(svc,    (svcCounts.get(svc)    || 0) + 1);
        actionCounts.set(act, (actionCounts.get(act) || 0) + 1);
      }

      const devname   = (firstLog.devname as string) || '';
      const srcIfaceF = (firstLog.srcintf as string) || '';
      const dstIfaceF = (firstLog.dstintf as string) || '';

      const headerLines = [
        `Toplam Olay: ${logs.length}`,
        `Cihaz: ${devname}`,
      ];
      if (srcIfaceF || dstIfaceF) headerLines.push(`Arayuzler: ${srcIfaceF} -> ${dstIfaceF}`);
      if (totalSent + totalRcvd > 0)
        headerLines.push(`Toplam Trafik: gonderilen ${this.formatBytes(totalSent)}, alinan ${this.formatBytes(totalRcvd)}`);
      sections.push(headerLines.join('\n'));

      const actionStr = topN(actionCounts, 6)
        .map(([a, c]) => `${a}: ${c}`)
        .join(' | ');
      sections.push(`Aksiyon Ozeti: ${actionStr}`);

      const topSrc = topN(srcCounts, 5);
      if (topSrc.length > 0)
        sections.push('En Fazla Kaynak IP:\n' + topSrc.map(([ip, c]) => `  - ${ip} (${c} istek)`).join('\n'));

      const topDst = topN(dstCounts, 5);
      if (topDst.length > 0)
        sections.push('En Fazla Hedef IP:\n' + topDst.map(([ip, c]) => `  - ${ip} (${c} istek)`).join('\n'));

      const topPol = topN(policyCounts, 3);
      if (topPol.length > 0)
        sections.push('En Cok Vurulan Politikalar:\n' + topPol.map(([pol, c]) => `  - Politika #${pol} (${c} hit)`).join('\n'));

      const topSvc = topN(svcCounts, 3);
      if (topSvc.length > 0)
        sections.push('En Cok Kullanilan Servisler:\n' + topSvc.map(([svc, c]) => `  - ${svc} (${c} hit)`).join('\n'));

      sections.push(`Onerilen Aksiyon: ${alarm.detectionLogic.recommendedAction}`);
      return sections.join('\n\n');
    }
    // ─────────────────────────────────────────────────────────────────────────

    if (firstLog.msg) details.push(`Mesaj: ${this.decodeMsg(firstLog.msg)}`);
    if (firstLog.action) details.push(`Aksiyon: ${firstLog.action}`);
    if (firstLog.user) details.push(`Kullanici: ${firstLog.user}`);
    if (firstLog.srcip) details.push(`Kaynak IP: ${firstLog.srcip}`);
    if (firstLog.dstip) details.push(`Hedef IP: ${firstLog.dstip}`);
    if (firstLog.sentbyte) details.push(`Gonderilen: ${this.formatBytes(Number(firstLog.sentbyte))}`);
    if (firstLog.rcvdbyte) details.push(`Alinan: ${this.formatBytes(Number(firstLog.rcvdbyte))}`);
    if (firstLog.cfgpath) details.push(`Config Yolu: ${firstLog.cfgpath}`);
    if (firstLog.cfgobj) details.push(`Nesne: ${firstLog.cfgobj}`);
    if (firstLog.cfgattr) {
      const parsedAttrs = this.parseCfgAttr(firstLog.cfgattr as string);
      if (parsedAttrs.length > 0) {
        for (const pa of parsedAttrs) {
          const attrLabel = this.getAttrLabel(pa.attr);
          if (pa.oldVal !== null && pa.newVal !== null) {
            details.push(`${attrLabel}: ${this.getValueLabel(pa.oldVal)} → ${this.getValueLabel(pa.newVal)}`);
          } else {
            const msgStr = (firstLog.msg as string) || '';
            const newValFromMsg = this.extractNewValueFromMsg(msgStr, pa.attr);
            if (newValFromMsg) {
              details.push(`${attrLabel}: → ${this.getValueLabel(newValFromMsg)}`);
            } else {
              details.push(`Degisen Ozellik: ${attrLabel} (${pa.attr})`);
            }
          }
        }
      }
    }
    if (firstLog.attack) details.push(`Saldiri: ${this.decodeMsg(firstLog.attack)}`);
    if (firstLog.devname) details.push(`Cihaz: ${firstLog.devname}`);
    if (firstLog.date && firstLog.time) details.push(`Olay Zamani: ${firstLog.date} ${firstLog.time}`);
    if (details.length > 0) sections.push(details.join('\n'));

    // Additional events summary
    if (logs.length > 1) {
      const otherMsgs = logs.slice(1, 4).map((l) => `- ${this.decodeMsg(l.msg) || l.action || 'N/A'}`).join('\n');
      sections.push(`Diger olaylar:\n${otherMsgs}${logs.length > 4 ? `\n- ... ve ${logs.length - 4} daha` : ''}`);
    }

    // Recommended action
    sections.push(`Onerilen Aksiyon: ${alarm.detectionLogic.recommendedAction}`);

    return sections.join('\n\n');
  }

  /**
   * Evaluate NMS (SNMP) alarms from nms_* tables.
   * 
   * Reads raw metrics written by the Python NMS service (nms_interfaces,
   * nms_health_metrics) and generates alarm events for:
   *   NMS_PORT_DOWN       — interface admin=up, oper=down
   *   NMS_CPU_HIGH        — cpu_usage >= threshold (from detectionLogic.threshold)
   *   NMS_MEMORY_HIGH     — memory_usage >= threshold
   *   NMS_TEMPERATURE_HIGH — temperature >= threshold
   *   NMS_DEVICE_UNREACHABLE — no health metric in last 3× poll intervals
   */
  private async evaluateNmsAlarms(): Promise<EvaluationResult[]> {
    const results: EvaluationResult[] = [];

    // Load enabled NMS alarm definitions
    const nmsAlarms = await prisma.alarmDefinition.findMany({
      where: { enabled: true, code: { startsWith: 'NMS_' } },
    });

    if (nmsAlarms.length === 0) return results;

    // ── NMS_PORT_DOWN ─────────────────────────────────────────────────────────
    // False-positive prevention: only alarm if port has been down for at least
    // 5 minutes. Brief link flaps (seconds) will not trigger alarms.
    const portDownAlarm = nmsAlarms.find(a => a.code === 'NMS_PORT_DOWN');
    if (portDownAlarm) {
      // ── Auto-resolve: acknowledge PORT_DOWN alarms whose port is now UP ──
      // Also auto-resolve alarms whose port is no longer monitored (monitored=false).
      try {
        const openPortDownAlarms = await prisma.alarmEvent.findMany({
          where: { alarmId: portDownAlarm.id, acknowledged: false },
          select: { id: true, rawData: true, deviceName: true },
          take: 200,
        });
        if (openPortDownAlarms.length > 0) {
          const toAckIds: string[] = [];
          for (const ev of openPortDownAlarms) {
            const raw = (ev.rawData || {}) as any;
            const idx = raw.interface_index as number | undefined;
            const nmsDevId = raw.nms_device_id as number | undefined;
            if (idx == null || nmsDevId == null) continue;
            const cur = await (prisma as any).nmsInterface.findFirst({
              where: { nmsDeviceId: nmsDevId, interfaceIndex: idx },
              select: { operStatus: true, monitored: true, operUpSince: true },
            });
            if (!cur) continue;
            // Resolve if port is no longer monitored (always)
            if (cur.monitored === false) {
              toAckIds.push(ev.id);
            } else if (cur.operStatus === 'up') {
              // Only resolve if port has been UP for at least 5 minutes
              // (prevents false resolves during flapping: DOWN→UP→DOWN)
              const AUTO_RESOLVE_MIN_UP_MS = 5 * 60 * 1000;
              const upSince = cur.operUpSince ? new Date(cur.operUpSince).getTime() : null;
              if (upSince && (Date.now() - upSince >= AUTO_RESOLVE_MIN_UP_MS)) {
                toAckIds.push(ev.id);
              }
            }
          }
          if (toAckIds.length > 0) {
            await resolveIncidentsForEvents(toAckIds, 'Port has remained up for 5 minutes or monitoring was disabled');
            log.info({ count: toAckIds.length }, 'NMS PORT_DOWN auto-resolved alarms (port UP >= 5min or unmonitored)');
          }
        }
      } catch (e) {
        log.warn({ err: (e as Error).message }, 'PORT_DOWN auto-resolve failed');
      }

      try {
        const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
        const downThresholdMs = 5 * 60 * 1000; // 5 minutes

        const downInterfaces = await (prisma as any).nmsInterface.findMany({
          where: {
            monitored: true,
            adminStatus: 'up',
            operStatus: 'down',
            operUpSince: { not: null },  // Only alarm if port was ever seen up
            updatedAt: { gte: tenMinAgo },
          },
          include: { device: { select: { id: true, name: true, managementIp: true } } },
          take: 20,
        }) as Array<any>;

        // Track created events in this evaluation to prevent duplicates
        const createdPortsThisEval = new Set<string>();

        for (const iface of downInterfaces) {
          const deviceName = iface.device?.name ?? `NMS Device ${iface.nmsDeviceId}`;
          const portKey = `${iface.nmsDeviceId}:${iface.interfaceIndex}`;

          // Skip if we already created an event for this port in this evaluation
          if (createdPortsThisEval.has(portKey)) {
            continue;
          }

          // Use interface_name when description is empty/null/"None"
          const desc = iface.description;
          const ifaceLabel = (desc && desc !== 'None' && desc.trim() !== '') ? desc : iface.interfaceName;

          // Check how long the port has been down
          const downSince = iface.downSince ? new Date(iface.downSince).getTime() : Date.now();
          const downDurationMs = Date.now() - downSince;

          // Skip if port has been down for less than 5 minutes (brief flap)
          if (downDurationMs < downThresholdMs) {
            continue;
          }

          const downMinutes = Math.round(downDurationMs / 60000);
          const title = `Port Down: ${ifaceLabel} on ${deviceName}`;
          const message = `Interface ${ifaceLabel} (index ${iface.interfaceIndex}) on ${deviceName} has been DOWN for ${downMinutes} minutes.`;
          // Atomic cooldown check using AlarmCooldown table.
          // The unique constraint on (alarmId, deviceName) prevents concurrent
          // checks from both firing for the same port.
          const cooldownMs = portDownAlarm.cooldownMinutes * 60 * 1000;
          const cooldownUntil = new Date(Date.now() + cooldownMs);
          const cooldownKey = `${portDownAlarm.id}:${portKey}`;
          try {
            // Check for active cooldown
            const existingCooldown = await prisma.alarmCooldown.findUnique({
              where: { alarmId_deviceName: { alarmId: portDownAlarm.id, deviceName: portKey } },
            });
            if (existingCooldown && existingCooldown.cooldownUntil > new Date()) {
              results.push({ alarmCode: 'NMS_PORT_DOWN', triggered: false, matchCount: 0, events: [], error: 'cooldown-active' });
              continue;
            }
            // Atomically claim or extend the cooldown slot
            await prisma.alarmCooldown.upsert({
              where: { alarmId_deviceName: { alarmId: portDownAlarm.id, deviceName: portKey } },
              create: { alarmId: portDownAlarm.id, deviceName: portKey, cooldownUntil },
              update: { cooldownUntil },
            });
          } catch (err: any) {
            // P2002 = unique constraint violation → another check claimed it first
            if (err?.code === 'P2002') {
              results.push({ alarmCode: 'NMS_PORT_DOWN', triggered: false, matchCount: 0, events: [], error: 'cooldown-active' });
              continue;
            }
            // On unexpected error, fall through to legacy check as safety net
            const existing = await prisma.alarmEvent.findFirst({
              where: {
                alarmId: portDownAlarm.id,
                deviceName,
                AND: [
                  { createdAt: { gte: new Date(Date.now() - cooldownMs) } },
                  { rawData: { path: ['interface_name'], equals: iface.interfaceName } },
                ],
              },
            });
            if (existing) {
              results.push({ alarmCode: 'NMS_PORT_DOWN', triggered: false, matchCount: 0, events: [], error: 'cooldown-active' });
              continue;
            }
          }

          const recorded = await recordAlarmOccurrence({
            alarm: { ...portDownAlarm, source: 'nms' },
            title,
            message,
            deviceName,
            entityType: 'nms-port',
            entityId: portKey,
            conditionKey: 'oper-status-down',
            sourceEventId: `${portKey}:${iface.downSince ? new Date(iface.downSince).toISOString() : 'unknown'}`,
            sourceOccurredAt: iface.downSince ? new Date(iface.downSince) : null,
            rawData: {
              nms_device_id: iface.nmsDeviceId,
              interface_index: iface.interfaceIndex,
              interface_name: iface.interfaceName,
              description: iface.description,
              admin_status: iface.adminStatus,
              oper_status: iface.operStatus,
              down_since: iface.downSince,
              down_duration_minutes: downMinutes,
              source: 'nms',
            } as any,
          });
          const event = recorded.event;
          if (!recorded.created) {
            results.push({ alarmCode: 'NMS_PORT_DOWN', triggered: false, matchCount: 0, events: [], error: 'duplicate-occurrence' });
            continue;
          }
          // Mark this port as created to prevent duplicate in same loop
          createdPortsThisEval.add(portKey);
          results.push({ alarmCode: 'NMS_PORT_DOWN', triggered: true, matchCount: 1, events: [{ id: event.id }] });
          log.info({ interface: ifaceLabel, deviceName, downMinutes }, 'NMS PORT_DOWN');
        }
      } catch (e) {
        results.push({ alarmCode: 'NMS_PORT_DOWN', triggered: false, matchCount: 0, events: [], error: (e as Error).message });
      }
    }

    // ── NMS_CPU_HIGH / NMS_MEMORY_HIGH / NMS_TEMPERATURE_HIGH ─────────────────
    const healthAlarmCodes = ['NMS_CPU_HIGH', 'NMS_MEMORY_HIGH', 'NMS_TEMPERATURE_HIGH'] as const;
    for (const code of healthAlarmCodes) {
      const alarmDef = nmsAlarms.find(a => a.code === code);
      if (!alarmDef) continue;

      const logic = alarmDef.detectionLogic as Record<string, unknown>;
      const threshold = typeof logic.threshold === 'number' ? logic.threshold : 80;

      try {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
        const latestMetrics = await (prisma as any).$queryRaw`
          SELECT DISTINCT ON (nms_device_id)
            id, nms_device_id, cpu_usage, memory_usage, temperature, uptime_seconds, collected_at
          FROM nms_health_metrics
          WHERE collected_at >= ${fiveMinAgo}
          ORDER BY nms_device_id, collected_at DESC
        ` as Array<{ id: string; nms_device_id: number; cpu_usage: number | null; memory_usage: number | null; temperature: number | null; uptime_seconds: number | null; collected_at: Date }>;

        for (const metric of latestMetrics) {
          const value =
            code === 'NMS_CPU_HIGH' ? metric.cpu_usage :
            code === 'NMS_MEMORY_HIGH' ? metric.memory_usage :
            metric.temperature;

          if (value === null || value === undefined || value < threshold) continue;

          // Resolve device name
          const device = await (prisma as any).device.findFirst({
            where: { nmsDeviceId: metric.nms_device_id },
            select: { id: true, name: true },
          }) as { id: string; name: string } | null;
          const deviceName = device?.name ?? `NMS Device ${metric.nms_device_id}`;
          const metricLabel = code === 'NMS_CPU_HIGH' ? 'CPU' : code === 'NMS_MEMORY_HIGH' ? 'Memory' : 'Temperature';
          const unit = code === 'NMS_TEMPERATURE_HIGH' ? '°C' : '%';
          const title = `${metricLabel} High on ${deviceName}: ${value.toFixed(1)}${unit}`;
          const message = `${metricLabel} usage on ${deviceName} is ${value.toFixed(1)}${unit}, exceeding threshold of ${threshold}${unit}.`;

          // Cooldown check
          const cooldownMs = alarmDef.cooldownMinutes * 60 * 1000;
          const existing = await prisma.alarmEvent.findFirst({
            where: {
              alarmId: alarmDef.id,
              deviceName,
              createdAt: { gte: new Date(Date.now() - cooldownMs) },
            },
          });
          if (existing) {
            results.push({ alarmCode: code, triggered: false, matchCount: 0, events: [], error: 'cooldown-active' });
            continue;
          }

          const metricOccurredAt = metric.collected_at ?? new Date();
          const recorded = await recordAlarmOccurrence({
            alarm: { ...alarmDef, source: 'nms' },
            title,
            message,
            deviceName,
            entityType: 'nms-device',
            entityId: String(metric.nms_device_id),
            conditionKey: code,
            sourceEventId: `${metric.nms_device_id}:${code}:${new Date(metricOccurredAt).toISOString()}`,
            sourceOccurredAt: new Date(metricOccurredAt),
            rawData: {
              nms_device_id: metric.nms_device_id,
              cpu_usage: metric.cpu_usage,
              memory_usage: metric.memory_usage,
              temperature: metric.temperature,
              uptime_seconds: metric.uptime_seconds,
              threshold,
              source: 'nms',
            } as any,
          });
          const event = recorded.event;
          if (!recorded.created) continue;
          results.push({ alarmCode: code, triggered: true, matchCount: 1, events: [{ id: event.id }] });
          log.info({ code, deviceName, value: value.toFixed(1), unit }, 'NMS health alarm triggered');
        }
      } catch (e) {
        results.push({ alarmCode: code, triggered: false, matchCount: 0, events: [], error: (e as Error).message });
      }
    }

    // ── NMS_DEVICE_UNREACHABLE ─────────────────────────────────────────────────
    // False-positive prevention: require NO health metrics for 3 consecutive
    // poll windows (~15 min) AND verify the device was previously reporting.
    const unreachableAlarm = nmsAlarms.find(a => a.code === 'NMS_DEVICE_UNREACHABLE');
    if (unreachableAlarm) {
      // ── Auto-resolve: acknowledge DEVICE_UNREACHABLE alarms whose device is
      // now reporting health metrics again (SNMP or SSH fallback). Devices may
      // recover silently (SSH poller comes back, SNMP comes back, network
      // path is restored) — we must not leave stale critical alarms open.
      try {
        const openUnreachableAlarms = await prisma.alarmEvent.findMany({
          where: { alarmId: unreachableAlarm.id, acknowledged: false },
          select: { id: true, rawData: true, deviceName: true },
          take: 200,
        });
        if (openUnreachableAlarms.length > 0) {
          // A device is considered recovered when it has produced at least
          // one health metric in the last 15 minutes (3× default poll cycle).
          const recoveryCutoff = new Date(Date.now() - 15 * 60 * 1000);
          const toAckIds: string[] = [];
          for (const ev of openUnreachableAlarms) {
            const raw = (ev.rawData || {}) as any;
            const nmsDevId = raw.nms_device_id as number | undefined;
            if (nmsDevId == null) continue;
            const recentMetric = await (prisma as any).nmsHealthMetric.findFirst({
              where: { nmsDeviceId: nmsDevId, collectedAt: { gte: recoveryCutoff } },
              select: { collectedAt: true },
            });
            if (recentMetric) toAckIds.push(ev.id);
          }
          if (toAckIds.length > 0) {
            await resolveIncidentsForEvents(toAckIds, 'Device has resumed reporting health metrics');
            log.info({ count: toAckIds.length }, 'NMS DEVICE_UNREACHABLE auto-resolved alarms (device reporting again)');
          }
        }
      } catch (e) {
        log.warn({ err: (e as Error).message }, 'DEVICE_UNREACHABLE auto-resolve failed');
      }

      try {
        // Require 30 minutes of silence (6× default 5-min poll interval)
        // Rationale: a single slow poll cycle can take up to ~120s (2 min).
        // Using 6× intervals gives enough margin to avoid false positives
        // when the NMS service is momentarily busy or restarting.
        const silenceThresholdMs = 30 * 60 * 1000;
        const silenceCutoff = new Date(Date.now() - silenceThresholdMs);

        const pollingDevices = await (prisma as any).device.findMany({
          where: {
            pollingEnabled: true,
            nmsDeviceId: { not: null },
          },
          select: { id: true, name: true, nmsDeviceId: true, managementIp: true, lastPolledAt: true, pollingInterval: true },
        }) as Array<{ id: string; name: string; nmsDeviceId: number | null; managementIp: string | null; lastPolledAt: Date | null; pollingInterval: number | null }>;

        for (const device of pollingDevices) {
          if (!device.nmsDeviceId) continue;

          // If never polled, skip — newly added device
          if (!device.lastPolledAt) continue;

          // Use device-specific interval if available (default 300s = 5 min)
          const intervalMs = (device.pollingInterval || 300) * 1000;
          // Require at least 3 missed intervals before alarming
          const effectiveThreshold = Math.max(silenceThresholdMs, intervalMs * 3);
          const effectiveCutoff = new Date(Date.now() - effectiveThreshold);

          // Check if we got any health metric within the threshold window
          const recentMetric = await (prisma as any).nmsHealthMetric.findFirst({
            where: {
              nmsDeviceId: device.nmsDeviceId,
              collectedAt: { gte: effectiveCutoff },
            },
          });

          if (recentMetric) continue; // Device is reporting fine

          // Additional check: lastPolledAt must also be older than threshold
          // (NMS agent updates lastPolledAt even on failed polls sometimes)
          if (device.lastPolledAt && device.lastPolledAt.getTime() > effectiveCutoff.getTime()) {
            continue; // NMS agent still polling recently — not truly unreachable
          }

          // Cooldown check
          const cooldownMs = unreachableAlarm.cooldownMinutes * 60 * 1000;
          const existing = await prisma.alarmEvent.findFirst({
            where: {
              alarmId: unreachableAlarm.id,
              deviceName: device.name,
              createdAt: { gte: new Date(Date.now() - cooldownMs) },
            },
          });
          if (existing) {
            results.push({ alarmCode: 'NMS_DEVICE_UNREACHABLE', triggered: false, matchCount: 0, events: [], error: 'cooldown-active' });
            continue;
          }

          // Calculate how long device has been silent
          const lastMetric = await (prisma as any).nmsHealthMetric.findFirst({
            where: { nmsDeviceId: device.nmsDeviceId },
            orderBy: { collectedAt: 'desc' },
            select: { collectedAt: true },
          });
          const silentSinceMs = lastMetric
            ? Date.now() - new Date(lastMetric.collectedAt).getTime()
            : Date.now() - new Date(device.lastPolledAt).getTime();
          const silentMinutes = Math.round(silentSinceMs / 60000);

          const title = `Device Unreachable: ${device.name}`;
          const message = [
            `Network device not responding to SNMP queries`,
            ``,
            `Cihaz: ${device.name}`,
            `IP: ${device.managementIp || 'N/A'}`,
            `Son basarili metrik: ${silentMinutes} dakika once`,
            `Son poll zamani: ${device.lastPolledAt ? new Date(device.lastPolledAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }) : 'N/A'}`,
            ``,
            `Onerilen Aksiyon: Cihaza SSH/konsol erisimi kontrol edin. SNMP servisinin calistigini dogrulayin. Agdaki erisimi (ping, traceroute) test edin.`,
          ].join('\n');

          const outageKey = lastMetric?.collectedAt
            ? new Date(lastMetric.collectedAt).toISOString()
            : device.lastPolledAt.toISOString();
          const recorded = await recordAlarmOccurrence({
            alarm: { ...unreachableAlarm, source: 'nms' },
            title,
            message,
            deviceName: device.name,
            sourceIp: device.managementIp,
            entityType: 'nms-device',
            entityId: String(device.nmsDeviceId),
            conditionKey: 'unreachable',
            sourceEventId: `${device.nmsDeviceId}:unreachable:${outageKey}`,
            sourceOccurredAt: new Date(outageKey),
            rawData: {
              nms_device_id: device.nmsDeviceId,
              management_ip: device.managementIp,
              last_polled_at: device.lastPolledAt?.toISOString(),
              last_metric_at: lastMetric?.collectedAt ? new Date(lastMetric.collectedAt).toISOString() : null,
              silent_minutes: silentMinutes,
              polling_interval_sec: device.pollingInterval || 300,
              source: 'nms',
            } as any,
          });
          const event = recorded.event;
          if (!recorded.created) continue;
          results.push({ alarmCode: 'NMS_DEVICE_UNREACHABLE', triggered: true, matchCount: 1, events: [{ id: event.id }] });
          log.info({ deviceName: device.name, silentMinutes }, 'NMS DEVICE_UNREACHABLE');
        }
      } catch (e) {
        results.push({ alarmCode: 'NMS_DEVICE_UNREACHABLE', triggered: false, matchCount: 0, events: [], error: (e as Error).message });
      }
    }

    return results;
  }

  private formatBytes(bytes: number): string {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${bytes} B`;
  }
}
