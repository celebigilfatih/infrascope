/**
 * Alarm Query Layer — Security Threat Events
 *
 * Covers: IPS_HIGH_SEVERITY, MALWARE_DETECTED, APP_CONTROL_VIOLATION,
 *         WEB_FILTER_BLOCK, IOC_HIT
 *
 * Key design notes:
 *  - IPS events use logtype='attack' (not 'event')
 *  - Malware/virus events use logtype='virus'
 *  - App-ctrl events use logtype='app-ctrl'
 *  - Web filter events use logtype='webfilter'
 *  - `level` column is indexed and very effective for filtering high-severity events
 */

import { runAlarmQuery, queryCache, queryFortiAnalyzerDirect, timeWindow } from './base';
import type { AlarmQueryContext, QueryResult } from './types';

// ─── IPS — High Severity ──────────────────────────────────────────────────────

/**
 * IPS_HIGH_SEVERITY — IPS signature triggered with high or critical severity.
 *
 * DB filter:
 *   logtype = 'attack'            ← logtype is the primary partitioning key
 *   level IN ('high', 'critical') ← level column (indexed)
 *
 * NOTE: The `level` column is extracted during cache sync. For IPS/attack events,
 * FortiAnalyzer returns 'high', 'critical', 'medium', 'low' in the level field.
 * We only care about high+ for alarm triggering.
 *
 * We use two separate queries (OR logic) because Prisma doesn't support
 * column-level OR in a single findMany without explicit OR array.
 */
export async function getIpsHighSeverityEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  const description = 'logtype=attack level IN (high, critical)';

  return runAlarmQuery(
    ctx,
    description,
    async () => {
      // Fetch high and critical IPS events in one query using OR on level
      const rows = await Promise.all([
        queryCache({
          logtype: 'attack',
          level: 'high',
          eventTime: timeWindow(ctx.timeWindowMinutes),
        }),
        queryCache({
          logtype: 'attack',
          level: 'critical',
          eventTime: timeWindow(ctx.timeWindowMinutes),
        }),
      ]);
      // Flatten and deduplicate by eventtime
      const combined = [...rows[0], ...rows[1]];
      const seen = new Set<unknown>();
      return combined.filter(e => {
        const key = (e as any).eventtime;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
    fa =>
      queryFortiAnalyzerDirect(
        fa,
        'attack',
        'level == high or level == critical',
        ctx.timeWindowMinutes
      )
  );
}

/**
 * IPS_ALL_EVENTS — All IPS events regardless of severity.
 * Used by correlation alarms (IPS_THEN_OUTBOUND).
 */
export async function getIpsAllEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  const description = 'logtype=attack (all severities)';

  return runAlarmQuery(
    ctx,
    description,
    () =>
      queryCache({
        logtype: 'attack',
        eventTime: timeWindow(ctx.timeWindowMinutes),
      }),
    fa => queryFortiAnalyzerDirect(fa, 'attack', '', ctx.timeWindowMinutes)
  );
}

// ─── Malware / Virus ──────────────────────────────────────────────────────────

/**
 * MALWARE_DETECTED — Virus/malware detected by FortiGate AV engine.
 *
 * DB filter:
 *   logtype = 'virus'             ← dedicated logtype for AV events
 *
 * All virus logtype events are relevant — FortiGate only logs to 'virus'
 * when something is actually detected/blocked. No further filtering needed.
 *
 * softFallback=true: malware events are high-value security alerts —
 * if cache returns empty, verify via FA to avoid missing real detections.
 */
export async function getMalwareDetectedEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  const description = 'logtype=virus (all malware detections)';

  return runAlarmQuery(
    ctx,
    description,
    () =>
      queryCache({
        logtype: 'virus',
        eventTime: timeWindow(ctx.timeWindowMinutes),
      }),
    fa => queryFortiAnalyzerDirect(fa, 'virus', '', ctx.timeWindowMinutes),
    { softFallback: true }
  );
}

// ─── App-Ctrl Violation ───────────────────────────────────────────────────────

/**
 * APP_CONTROL_VIOLATION — Application blocked by policy.
 *
 * DB filter:
 *   logtype = 'app-ctrl'
 *   action  = 'blocked'           ← indexed column
 *
 * FortiGate sets action='blocked' when app-ctrl policy blocks traffic.
 * action='detected' means seen but allowed — not an alarm condition.
 */
export async function getAppCtrlViolationEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  const description = 'logtype=app-ctrl action=blocked';

  return runAlarmQuery(
    ctx,
    description,
    () =>
      queryCache({
        logtype: 'app-ctrl',
        action: 'blocked',
        eventTime: timeWindow(ctx.timeWindowMinutes),
      }),
    fa =>
      queryFortiAnalyzerDirect(
        fa,
        'app-ctrl',
        'action == blocked',
        ctx.timeWindowMinutes
      )
  );
}

/**
 * SHADOW_IT_DETECTED — Unapproved cloud/shadow-IT applications detected (not blocked).
 *
 * DB filter:
 *   logtype = 'app-ctrl', action = 'detected'
 *   rawLog.apprisk IN ('elevated', 'critical') ← JSONB filter for high-risk apps
 */
export async function getShadowItEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  const description = 'logtype=app-ctrl action=detected apprisk IN (elevated,critical)';

  return runAlarmQuery(
    ctx,
    description,
    async () => {
      const elevated = await queryCache({
        logtype: 'app-ctrl',
        action: 'detected',
        apprisk: 'elevated',
        eventTime: timeWindow(ctx.timeWindowMinutes),
      });
      const critical = await queryCache({
        logtype: 'app-ctrl',
        action: 'detected',
        apprisk: 'critical',
        eventTime: timeWindow(ctx.timeWindowMinutes),
      });
      return [...elevated, ...critical];
    },
    fa =>
      queryFortiAnalyzerDirect(
        fa,
        'app-ctrl',
        'action == detected and (apprisk == elevated or apprisk == critical)',
        ctx.timeWindowMinutes
      )
  );
}

// ─── Web Filter ───────────────────────────────────────────────────────────────

/**
 * WEB_FILTER_BLOCK — Web access blocked by URL filter.
 *
 * DB filter:
 *   logtype = 'webfilter', action = 'blocked'
 */
export async function getWebFilterBlockEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  const description = 'logtype=webfilter action=blocked';

  return runAlarmQuery(
    ctx,
    description,
    () =>
      queryCache({
        logtype: 'webfilter',
        action: 'blocked',
        eventTime: timeWindow(ctx.timeWindowMinutes),
      }),
    fa =>
      queryFortiAnalyzerDirect(
        fa,
        'webfilter',
        'action == blocked',
        ctx.timeWindowMinutes
      )
  );
}

// ─── IOC (Indicators of Compromise) ──────────────────────────────────────────

/**
 * IOC_HIT — Host matched a known indicator of compromise from FortiGuard.
 *
 * DB filter:
 *   logtype = 'attack'
 *   rawLog.attack LIKE '%ioc%' OR level = 'critical'
 *
 * IOC events are logged in the attack logtype with specific attack names.
 * We use softFallback here because IOC events are extremely high-value.
 */
export async function getIocHitEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  const description = 'logtype=attack level=critical (IOC/critical threats)';

  return runAlarmQuery(
    ctx,
    description,
    () =>
      queryCache({
        logtype: 'attack',
        level: 'critical',
        eventTime: timeWindow(ctx.timeWindowMinutes),
      }),
    fa =>
      queryFortiAnalyzerDirect(
        fa,
        'attack',
        'level == critical',
        ctx.timeWindowMinutes
      ),
    { softFallback: true }
  );
}

// ─── Traffic Anomaly ─────────────────────────────────────────────────────────

/**
 * HIGH_TRAFFIC_OUTBOUND — Unusually large data transfers outbound.
 * Used by correlation alarms (IPS_THEN_OUTBOUND, VPN_GEO_THEN_EXFIL).
 *
 * DB filter:
 *   logtype = 'traffic', action = 'accept'
 *   NOTE: Byte threshold filtering is NOT in DB — it's in rawLog.sentbyte.
 *   The detection engine applies the sentbyte/rcvdbyte threshold filter after this returns.
 */
export async function getHighOutboundTrafficEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  const description = 'logtype=traffic action=accept';

  return runAlarmQuery(
    ctx,
    description,
    () =>
      queryCache({
        logtype: 'traffic',
        action: 'accept',
        eventTime: timeWindow(ctx.timeWindowMinutes),
      }),
    fa =>
      queryFortiAnalyzerDirect(
        fa,
        'traffic',
        'action == accept',
        ctx.timeWindowMinutes
      )
  );
}
