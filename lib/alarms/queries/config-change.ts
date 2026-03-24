/**
 * Alarm Query Layer — Configuration Change Events
 *
 * Covers: FW_POLICY_CHANGED, CORE_CONFIG_CHANGE, FIRMWARE_CHANGE,
 *         AUTH_SERVER_CHANGED, ROUTE_TABLE_CHANGED, ADMIN_PASSWORD_CHANGED,
 *         ADDRESS_OBJECT_CHANGED, SD_WAN_CHANGED, HA_CONFIG_CHANGED
 *
 * All queries filter on logtype='event', subtype='system' (indexed column)
 * and refine further with JSONB path conditions on rawLog fields:
 *   logdesc  — human-readable event description (e.g. "Object attribute configured")
 *   cfgpath  — config path changed (e.g. "firewall.policy")
 *   cfgobj   — specific object name
 *   action   — "edit", "add", "delete", "login", etc.
 */

import { runAlarmQuery, queryCache, queryFortiAnalyzerDirect, timeWindow } from './base';
import type { AlarmQueryContext, QueryResult } from './types';

// ─── Helper ───────────────────────────────────────────────────────────────────

/** All config-change events share logtype=event, subtype=system.
 *  HA-daemon events (ui=ha_daemon) are excluded — they are HA-sync
 *  duplicates of primary-unit events and should not count as admin changes. */
function baseConfigWhere(minutes: number) {
  return {
    logtype: 'event' as const,
    subtype: 'system',
    eventTime: timeWindow(minutes),
    NOT: [{ rawLog: { path: ['ui'], equals: 'ha_daemon' } }],
  };
}

// ─── Firewall Policy Changes ──────────────────────────────────────────────────

/**
 * FW_POLICY_CHANGED — Firewall policy add/edit/delete.
 *
 * DB filter:
 *   logtype = 'event'
 *   subtype = 'system'                              ← indexed column
 *   rawLog.logdesc LIKE '%attribute%'               ← JSONB path filter
 *   rawLog.cfgpath LIKE '%firewall.policy%'         ← JSONB path filter
 *
 * FA filter: subtype == system and logdesc like %attribute% and cfgpath like %firewall.policy%
 */
export async function getFirewallPolicyChangeEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  const description = 'logtype=event subtype=system cfgpath~firewall.policy logdesc~attribute';

  return runAlarmQuery(
    ctx,
    description,
    () =>
      queryCache({
        ...baseConfigWhere(ctx.timeWindowMinutes),
        AND: [
          { rawLog: { path: ['logdesc'], string_contains: 'attribute' } },
          { rawLog: { path: ['cfgpath'], string_contains: 'firewall.policy' } },
        ],
      }),
    fa =>
      queryFortiAnalyzerDirect(
        fa,
        'event',
        'subtype == system and logdesc like %attribute% and cfgpath like %firewall.policy% and ui != ha_daemon',
        ctx.timeWindowMinutes
      ),
    { softFallback: false }
  );
}

// ─── Core Config Changes ──────────────────────────────────────────────────────

/**
 * CORE_CONFIG_CHANGE — Interface, routing, HA, system-level changes.
 *
 * DB filter:
 *   logtype = 'event', subtype = 'system'           ← indexed
 *   rawLog.logdesc LIKE '%attribute%' OR '%changed%' ← OR condition
 *
 * Matches both "Object attribute configured" and "Configuration changed" log types.
 */
export async function getCoreConfigChangeEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  const description = 'logtype=event subtype=system logdesc~(attribute|changed)';

  return runAlarmQuery(
    ctx,
    description,
    () =>
      queryCache({
        ...baseConfigWhere(ctx.timeWindowMinutes),
        OR: [
          { rawLog: { path: ['logdesc'], string_contains: 'attribute' } },
          { rawLog: { path: ['logdesc'], string_contains: 'changed' } },
        ],
      }),
    fa =>
      queryFortiAnalyzerDirect(
        fa,
        'event',
        'subtype == system and (logdesc like %attribute% or logdesc like %changed%) and ui != ha_daemon',
        ctx.timeWindowMinutes
      )
  );
}

// ─── Firmware Changes ─────────────────────────────────────────────────────────

/**
 * FIRMWARE_CHANGE — FortiGate firmware upgrade or downgrade.
 *
 * DB filter:
 *   subtype = 'system', rawLog.logdesc LIKE '%firmware%'
 */
export async function getFirmwareChangeEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  const description = 'logtype=event subtype=system logdesc~firmware';

  return runAlarmQuery(
    ctx,
    description,
    () =>
      queryCache({
        ...baseConfigWhere(ctx.timeWindowMinutes),
        AND: [{ rawLog: { path: ['logdesc'], string_contains: 'firmware' } }],
      }),
    fa =>
      queryFortiAnalyzerDirect(
        fa,
        'event',
        'subtype == system and logdesc like %firmware% and ui != ha_daemon',
        ctx.timeWindowMinutes
      )
  );
}

// ─── Auth Server Changes ──────────────────────────────────────────────────────

/**
 * AUTH_SERVER_CHANGED — Changes to authentication servers (RADIUS, LDAP, FortiAuthenticator).
 *
 * DB filter:
 *   subtype = 'system', logdesc~attribute
 *   cfgpath LIKE '%user.radius%' OR '%user.ldap%' OR '%user.tacacs%' OR '%user.fortitoken%'
 */
export async function getAuthServerChangeEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  const description = 'logtype=event subtype=system cfgpath~(user.radius|user.ldap|user.tacacs)';

  return runAlarmQuery(
    ctx,
    description,
    () =>
      queryCache({
        ...baseConfigWhere(ctx.timeWindowMinutes),
        AND: [{ rawLog: { path: ['logdesc'], string_contains: 'attribute' } }],
        OR: [
          { rawLog: { path: ['cfgpath'], string_contains: 'user.radius' } },
          { rawLog: { path: ['cfgpath'], string_contains: 'user.ldap' } },
          { rawLog: { path: ['cfgpath'], string_contains: 'user.tacacs' } },
          { rawLog: { path: ['cfgpath'], string_contains: 'user.fortitoken' } },
        ],
      }),
    fa =>
      queryFortiAnalyzerDirect(
        fa,
        'event',
        'subtype == system and logdesc like %attribute% and (cfgpath like %user.radius% or cfgpath like %user.ldap% or cfgpath like %user.tacacs%) and ui != ha_daemon',
        ctx.timeWindowMinutes
      )
  );
}

// ─── Route Table Changes ──────────────────────────────────────────────────────

/**
 * ROUTE_TABLE_CHANGED — Static routes, policy routes, BGP, OSPF changes.
 *
 * DB filter:
 *   subtype = 'system', logdesc~attribute
 *   cfgpath LIKE '%router.static%' OR '%router.policy%' OR '%router.bgp%'
 */
export async function getRouteTableChangeEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  const description = 'logtype=event subtype=system cfgpath~router.*';

  return runAlarmQuery(
    ctx,
    description,
    () =>
      queryCache({
        ...baseConfigWhere(ctx.timeWindowMinutes),
        AND: [{ rawLog: { path: ['logdesc'], string_contains: 'attribute' } }],
        OR: [
          { rawLog: { path: ['cfgpath'], string_contains: 'router.static' } },
          { rawLog: { path: ['cfgpath'], string_contains: 'router.policy' } },
          { rawLog: { path: ['cfgpath'], string_contains: 'router.bgp' } },
          { rawLog: { path: ['cfgpath'], string_contains: 'router.ospf' } },
        ],
      }),
    fa =>
      queryFortiAnalyzerDirect(
        fa,
        'event',
        'subtype == system and logdesc like %attribute% and (cfgpath like %router.static% or cfgpath like %router.policy%) and ui != ha_daemon',
        ctx.timeWindowMinutes
      )
  );
}

// ─── Admin Password Changes ───────────────────────────────────────────────────

/**
 * ADMIN_PASSWORD_CHANGED — Administrator account password changes.
 *
 * DB filter:
 *   subtype = 'system', logdesc~attribute
 *   cfgpath LIKE '%system.admin%'
 */
export async function getAdminPasswordChangeEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  const description = 'logtype=event subtype=system cfgpath~system.admin logdesc~attribute';

  return runAlarmQuery(
    ctx,
    description,
    () =>
      queryCache({
        ...baseConfigWhere(ctx.timeWindowMinutes),
        AND: [
          { rawLog: { path: ['logdesc'], string_contains: 'attribute' } },
          { rawLog: { path: ['cfgpath'], string_contains: 'system.admin' } },
        ],
      }),
    fa =>
      queryFortiAnalyzerDirect(
        fa,
        'event',
        'subtype == system and logdesc like %attribute% and cfgpath like %system.admin% and ui != ha_daemon',
        ctx.timeWindowMinutes
      )
  );
}

// ─── Address Object Changes ───────────────────────────────────────────────────

/**
 * ADDRESS_OBJECT_CHANGED — Firewall address object add/edit/delete.
 *
 * DB filter:
 *   subtype = 'system', logdesc~attribute
 *   cfgpath LIKE '%firewall.address%'
 */
export async function getAddressObjectChangeEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  const description = 'logtype=event subtype=system cfgpath~firewall.address';

  return runAlarmQuery(
    ctx,
    description,
    () =>
      queryCache({
        ...baseConfigWhere(ctx.timeWindowMinutes),
        AND: [
          { rawLog: { path: ['logdesc'], string_contains: 'attribute' } },
          { rawLog: { path: ['cfgpath'], string_contains: 'firewall.address' } },
        ],
      }),
    fa =>
      queryFortiAnalyzerDirect(
        fa,
        'event',
        'subtype == system and logdesc like %attribute% and cfgpath like %firewall.address% and ui != ha_daemon',
        ctx.timeWindowMinutes
      )
  );
}

// ─── SD-WAN Changes ───────────────────────────────────────────────────────────

/**
 * SD_WAN_CHANGED — SD-WAN rules, members, or health checks modified.
 */
export async function getSdWanChangeEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  const description = 'logtype=event subtype=system cfgpath~system.sdwan';

  return runAlarmQuery(
    ctx,
    description,
    () =>
      queryCache({
        ...baseConfigWhere(ctx.timeWindowMinutes),
        AND: [
          { rawLog: { path: ['logdesc'], string_contains: 'attribute' } },
          { rawLog: { path: ['cfgpath'], string_contains: 'system.sdwan' } },
        ],
      }),
    fa =>
      queryFortiAnalyzerDirect(
        fa,
        'event',
        'subtype == system and logdesc like %attribute% and cfgpath like %system.sdwan% and ui != ha_daemon',
        ctx.timeWindowMinutes
      )
  );
}

// ─── HA Config Changes ────────────────────────────────────────────────────────

/**
 * HA_CONFIG_CHANGED — High Availability settings modified.
 * Critical: HA config changes can cause failover events.
 * Uses softFallback=true — if cache is empty, verify via live FA (high-stakes alarm).
 */
export async function getHaConfigChangeEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  const description = 'logtype=event subtype=system cfgpath~system.ha logdesc~attribute';

  return runAlarmQuery(
    ctx,
    description,
    () =>
      queryCache({
        ...baseConfigWhere(ctx.timeWindowMinutes),
        AND: [
          { rawLog: { path: ['logdesc'], string_contains: 'attribute' } },
          { rawLog: { path: ['cfgpath'], string_contains: 'system.ha' } },
        ],
      }),
    fa =>
      queryFortiAnalyzerDirect(
        fa,
        'event',
        'subtype == system and logdesc like %attribute% and cfgpath like %system.ha% and ui != ha_daemon',
        ctx.timeWindowMinutes
      ),
    { softFallback: true } // HA changes are high-stakes — double-check if cache is empty
  );
}
