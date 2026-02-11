import { prisma } from '@/lib/prisma';
import FortiAnalyzerService from '@/lib/integrations/fortianalyzer';
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

  constructor(service: FortiAnalyzerService) {
    this.service = service;
  }

  /**
   * Main evaluation loop: check all enabled alarms
   */
  async evaluateAllAlarms(): Promise<EvaluationResult[]> {
    const results: EvaluationResult[] = [];

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
          results.push({ alarmCode: alarm.code, triggered: false, matchCount: 0, events: [], error: (error as Error).message });
        }
      }
    }

    return results;
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
        const enrichedLogs = correlatedLogs.map((log) => ({
          ...log,
          _correlation_precursors: precursorEvents
            .filter((e: PrecursorEvent) => {
              const ip = rules.matchField === 'destIp' ? e.destIp : e.sourceIp;
              return ip === ((log[matchField] as string) || (log.srcip as string));
            })
            .map((e: PrecursorEvent) => e.alarm.code)
            .join(', '),
        }));

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

    // Find the widest time window needed
    const maxWindowMinutes = Math.max(...alarms.map((a) => a.detectionLogic.timeWindowMinutes));

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

    // Create alarm event in DB
    const alarmEvent = await prisma.alarmEvent.create({
      data: {
        alarmId: alarm.id,
        severity: alarm.severity as 'ALARM_CRITICAL' | 'ALARM_HIGH' | 'ALARM_MEDIUM' | 'ALARM_LOW' | 'ALARM_INFO',
        title,
        message,
        rawData: matchingLogs.slice(0, 10) as unknown as Record<string, unknown>,
        sourceIp: (firstLog.srcip as string) || (firstLog.remote_host as string) || null,
        destIp: (firstLog.dstip as string) || null,
        deviceName: (firstLog.devname as string) || (firstLog.fortigate as string) || null,
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

    // Event details from first log
    const details: string[] = [];
    if (firstLog.msg) details.push(`Mesaj: ${this.decodeMsg(firstLog.msg)}`);
    if (firstLog.action) details.push(`Aksiyon: ${firstLog.action}`);
    if (firstLog.user) details.push(`Kullanici: ${firstLog.user}`);
    if (firstLog.srcip) details.push(`Kaynak IP: ${firstLog.srcip}`);
    if (firstLog.dstip) details.push(`Hedef IP: ${firstLog.dstip}`);
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
}
