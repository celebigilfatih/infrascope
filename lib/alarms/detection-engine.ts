import { prisma } from '@/lib/prisma';
import FortiAnalyzerService from '@/lib/integrations/fortianalyzer';
import { VMwareService } from '@/lib/integrations/vmware';
import { sendAlarmEmail } from '@/lib/notifications/email';
import type { AlarmDetectionLogic, CorrelationRule } from './alarm-definitions';

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
}

interface EvaluationResult {
  alarmCode: string;
  triggered: boolean;
  matchCount: number;
  events: Array<Record<string, unknown>>;
  error?: string;
}

/**
 * Alarm Detection Engine
 * Evaluates alarm rules against FortiAnalyzer logs and triggers notifications.
 */
export class AlarmDetectionEngine {
  private service: FortiAnalyzerService;
  private vmwareService: VMwareService | null = null;
  private vmwareInitialized: boolean = false;

  constructor(service: FortiAnalyzerService) {
    this.service = service;
  }

  private async initializeVMware() {
    try {
      console.log('[AlarmEngine] Initializing VMware service...');
      const vmwareConfig = await prisma.integrationConfig.findFirst({
        where: { type: 'VMWARE_VCENTER', enabled: true },
      });
      
      if (!vmwareConfig) {
        console.log('[AlarmEngine] No enabled VMware integration found in database');
        return;
      }
      
      console.log(`[AlarmEngine] Found VMware config: ${vmwareConfig.name}`);
      
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
          console.error('[AlarmEngine] VMware authentication failed');
          this.vmwareService = null;
        } else {
          console.log('[AlarmEngine] VMware service initialized and authenticated');
        }
      }
    } catch (error) {
      console.error('[AlarmEngine] Error initializing VMware service:', error);
      this.vmwareService = null;
    }
  }

  /**
   * Main evaluation loop: check all enabled alarms
   */
  async evaluateAllAlarms(): Promise<EvaluationResult[]> {
    const results: EvaluationResult[] = [];

    try {
      // Initialize VMware service on first run
      if (!this.vmwareInitialized) {
        await this.initializeVMware();
        this.vmwareInitialized = true;
      }

      // Get all enabled alarm definitions
      const alarms = await prisma.alarmDefinition.findMany({
        where: { enabled: true },
      });

      if (alarms.length === 0) {
        console.log('[AlarmEngine] No enabled alarms found');
        return results;
      }

      console.log(`[AlarmEngine] Evaluating ${alarms.length} enabled alarms...`);

      // Login once for all evaluations
      const loggedIn = await this.service.login();
      if (!loggedIn) {
        console.error('[AlarmEngine] Failed to login to FortiAnalyzer');
        return results;
      }

      // Separate correlation alarms from regular alarms
      const correlationAlarms: AlarmDef[] = [];
      const regularAlarms = alarms;

      // Group regular alarms by logtype to batch searches
      const logTypeGroups = new Map<string, AlarmDef[]>();
      for (const alarm of regularAlarms) {
        const logic = alarm.detectionLogic as unknown as AlarmDetectionLogic;
        const logtype = logic.logtype || 'event';
        const alarmDef: AlarmDef = { ...alarm, detectionLogic: logic };

        if (logic.clientCheck === 'correlation') {
          correlationAlarms.push(alarmDef);
          continue;
        }

        if (!logTypeGroups.has(logtype)) {
          logTypeGroups.set(logtype, []);
        }
        logTypeGroups.get(logtype)!.push(alarmDef);
      }

      // Evaluate each logtype group
      for (const [logtype, groupAlarms] of logTypeGroups) {
        try {
          const groupResults = await this.evaluateLogTypeGroup(logtype, groupAlarms);
          results.push(...groupResults);
        } catch (error) {
          console.error(`[AlarmEngine] Error evaluating ${logtype} group:`, error);
          // Continue with other groups instead of stopping entirely
          for (const a of groupAlarms) {
            results.push({ alarmCode: a.code, triggered: false, matchCount: 0, events: [], error: (error as Error).message });
          }
        }
      }

      // Evaluate correlation alarms (after regular alarms, so precursor events exist)
      if (correlationAlarms.length > 0) {
        console.log(`[AlarmEngine] Evaluating ${correlationAlarms.length} correlation alarms...`);
        for (const alarm of correlationAlarms) {
          try {
            const result = await this.evaluateCorrelationAlarm(alarm);
            results.push(result);
          } catch (error) {
            console.error(`[AlarmEngine] Correlation error ${alarm.code}:`, error);
            // Continue with next correlation alarm instead of stopping
            results.push({ alarmCode: alarm.code, triggered: false, matchCount: 0, events: [], error: (error as Error).message });
          }
        }
      }

      console.log(`[AlarmEngine] Evaluation complete: ${results.filter(r => r.triggered).length} triggered, ${results.filter(r => r.error).length} errors`);
      return results;
    } catch (error) {
      console.error('[AlarmEngine] Critical error in evaluateAllAlarms:', error);
      // Return results so far instead of crashing
      return results;
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
      console.log(`[AlarmEngine] Correlation ${alarm.code}: secondary search logtype=${rules.secondaryLogtype} filter="${rules.secondaryFilter}"`);
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
   * Evaluate a group of alarms sharing the same logtype
   */
  private async evaluateLogTypeGroup(logtype: string, alarms: AlarmDef[]): Promise<EvaluationResult[]> {
    const results: EvaluationResult[] = [];

    // Handle VMware alarms separately
    if (logtype === 'vmware') {
      for (const alarm of alarms) {
        try {
          const result = await this.evaluateVMwareAlarm(alarm);
          results.push(result);
        } catch (error) {
          console.error(`[AlarmEngine] Error evaluating VMware alarm ${alarm.code}:`, error);
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
        console.error(`[AlarmEngine] Error evaluating ${alarm.code}:`, error);
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
      return this.evaluateFortiViewAlarm(alarm, logic);
    }

    // LogView-based alarms
    const filter = logic.filter || '';
    const limit = Math.max(logic.threshold * 2, 50);

    console.log(`[AlarmEngine] Searching ${alarm.code}: logtype=${logtype} filter="${filter}"`);
    const tid = await this.service.startLogSearch(logtype, limit, filter || undefined);
    if (!tid) {
      console.warn(`[AlarmEngine] Search failed for ${alarm.code} (logtype=${logtype}, filter="${filter}")`);
      return { alarmCode: alarm.code, triggered: false, matchCount: 0, events: [], error: 'search-failed' };
    }

    // Poll for results (max 15s for alarm checks)
    let logs: Array<Record<string, unknown>> | null = null;
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      logs = await this.service.fetchLogResults(tid, 0, limit);
      if (logs && logs.length > 0) break;
    }

    if (!logs || logs.length === 0) {
      return { alarmCode: alarm.code, triggered: false, matchCount: 0, events: [] };
    }

    // Filter by time window (client-side)
    const cutoff = new Date(Date.now() - logic.timeWindowMinutes * 60 * 1000);
    const recentLogs = logs.filter((log) => {
      const logTime = this.parseLogTime(log);
      return logTime && logTime >= cutoff;
    });

    // Apply client-side checks
    let filteredLogs = recentLogs;
    if (logic.clientCheck === 'off-hours') {
      filteredLogs = this.filterOffHours(recentLogs);
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
        // Exclude Veeam backup snapshots
        return userName !== 'veeam' && !snapshotName.includes('VEEAM BACKUP TEMPORARY SNAPSHOT');
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
      console.warn(`[AlarmEngine] VMware service not available for alarm ${alarm.code}`);
      return { alarmCode: alarm.code, triggered: false, matchCount: 0, events: [], error: 'vmware-service-unavailable' };
    }

    try {
      console.log(`[AlarmEngine] Evaluating VMware alarm ${alarm.code}: filter="${logic.filter}"`);

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
        const recentSnapshots = await this.vmwareService.fetchRecentlyCreatedSnapshots(logic.timeWindowMinutes);
        vmwareData = recentSnapshots.map(snap => ({
          type: 'snapshot_created',
          snapshotCreated: 'true',  // String for filter matching (filter uses string comparison)
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
        if (alarm.code === 'VM_POWERED_ON_OFF_HOURS') {
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

      if (vmwareData.length === 0) {
        console.log(`[AlarmEngine] No VMware data found for ${alarm.code}`);
        return { alarmCode: alarm.code, triggered: false, matchCount: 0, events: [] };
      }

      // Apply filter to data
      const matchingData = this.applyVMwareFilter(vmwareData, logic.filter || '');

      const matchCount = matchingData.length;
      const triggered = matchCount >= logic.threshold;

      if (triggered) {
        console.log(`[AlarmEngine] VMware alarm ${alarm.code} triggered: ${matchCount} matches`);
        await this.fireAlarm(alarm, matchingData);
      }

      return {
        alarmCode: alarm.code,
        triggered,
        matchCount,
        events: matchingData.slice(0, 5),
      };
    } catch (error) {
      console.error(`[AlarmEngine] Error evaluating VMware alarm ${alarm.code}:`, error);
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
          console.warn(`[AlarmEngine] Could not parse VMware filter: ${filter}`);
          return false;
        }

        const [, field, operator, valueStr] = comparison;
        const itemValue = item[field];
        
        // Convert value to number if it's numeric
        const value = isNaN(Number(valueStr)) ? valueStr : Number(valueStr);

        switch (operator) {
          case '==':
            return itemValue == value;
          case '!=':
            return itemValue != value;
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
        console.error(`[AlarmEngine] Error applying VMware filter "${filter}":`, error);
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

    if (firstLog.type && ['vm', 'host', 'datastore', 'snapshot', 'snapshot_created', 'snapshot_event', 'vm_lifecycle'].includes(firstLog.type as string)) {
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
    } else {
      // FortiAnalyzer log metadata
      sourceIp = (firstLog.srcip as string) || (firstLog.remote_host as string) || null;
      destIp = (firstLog.dstip as string) || null;
      deviceName = (firstLog.devname as string) || (firstLog.fortigate as string) || null;
    }

    // Create alarm event in DB
    const alarmEvent = await prisma.alarmEvent.create({
      data: {
        alarmId: alarm.id,
        severity: alarm.severity as 'ALARM_CRITICAL' | 'ALARM_HIGH' | 'ALARM_MEDIUM' | 'ALARM_LOW' | 'ALARM_INFO',
        title,
        message,
        rawData: matchingLogs.slice(0, 10) as unknown as Record<string, unknown>,
        sourceIp,
        destIp,
        deviceName,
      },
    });

    console.log(`[AlarmEngine] ALARM FIRED: ${alarm.code} - ${title}`);

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
        });

        if (sent) {
          await prisma.alarmEvent.update({
            where: { id: alarmEvent.id },
            data: { notifiedAt: new Date(), notifyChannel: 'email' },
          });
        }
      } catch (emailErr) {
        console.error(`[AlarmEngine] Failed to send email for ${alarm.code}:`, emailErr);
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
    return null;
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
   * Filter/group logs for brute force detection (multiple events from same source)
   */
  private filterBruteForce(logs: Array<Record<string, unknown>>, threshold: number): Array<Record<string, unknown>> {
    // Group by source IP
    const groups = new Map<string, Array<Record<string, unknown>>>();
    for (const log of logs) {
      const srcip = (log.srcip as string) || (log.remote_host as string) || 'unknown';
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
    if (firstLog.type && ['vm', 'host', 'datastore', 'snapshot', 'vm_lifecycle', 'snapshot_event', 'snapshot_created'].includes(firstLog.type as string)) {
      const vmwareDetails: string[] = [];
      
      // VM Lifecycle Events
      if (firstLog.type === 'vm_lifecycle') {
        vmwareDetails.push(`VM Adi: ${firstLog.vmName || 'N/A'}`);  
        vmwareDetails.push(`Islem: ${firstLog.eventType || 'N/A'}`);  
        if (firstLog.userName) vmwareDetails.push(`Kullanici: ${firstLog.userName}`);
        if (firstLog.eventTime) vmwareDetails.push(`Olay Zamani: ${new Date(firstLog.eventTime as string).toLocaleString('tr-TR')}`);
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
          if (l.type === 'host') return `- Host: ${l.hostName} (${l.connectionState})`;
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

    // Event details from first log (generic path)
    const details: string[] = [];
    if (firstLog.msg) details.push(`Mesaj: ${this.decodeMsg(firstLog.msg)}`);
    if (firstLog.action) details.push(`Aksiyon: ${firstLog.action}`);
    if (firstLog.user) details.push(`Kullanici: ${firstLog.user}`);
    if (firstLog.srcip) details.push(`Kaynak IP: ${firstLog.srcip}`);
    if (firstLog.dstip) details.push(`Hedef IP: ${firstLog.dstip}`);
    if (firstLog.sentbyte) details.push(`Gonderilen: ${this.formatBytes(Number(firstLog.sentbyte))}`);
    if (firstLog.rcvdbyte) details.push(`Alinan: ${this.formatBytes(Number(firstLog.rcvdbyte))}`);
    if (firstLog.cfgpath) details.push(`Config Yolu: ${firstLog.cfgpath}`);
    if (firstLog.cfgobj) details.push(`Nesne: ${firstLog.cfgobj}`);
    if (firstLog.cfgattr) details.push(`Degisiklik: ${this.decodeMsg(firstLog.cfgattr)}`);
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

  private formatBytes(bytes: number): string {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${bytes} B`;
  }
}
