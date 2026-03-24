/**
 * Alarm Query Layer — FortiGate Direct Config & Access Events
 *
 * Bypasses FortiAnalyzer entirely. Queries FortiGate REST API
 * via GET /api/v2/monitor/log/event?filter=...
 *
 * OPTIMIZATION: Uses only 3 broad API calls (subtype==system, system+action==login,
 * system+action==Add) and filters by cfgpath/action in memory.
 * This avoids FortiGate 429 rate limiting.
 *
 * Covers 14 Config & Access alarms:
 *   FW_POLICY_CHANGED, UNAUTH_ADMIN_LOGIN, ADMIN_LOGIN_FAILED,
 *   ADMIN_LOGIN_OFF_HOURS, CORE_CONFIG_CHANGE, FIRMWARE_CHANGE,
 *   ADMIN_PASSWORD_CHANGED, ADMIN_PRIVILEGE_CHANGE,
 *   ADDRESS_OBJECT_CHANGED, NEW_ADDRESS_OBJECT, NEW_SERVICE_OBJECT,
 *   ROUTE_TABLE_CHANGED, INTERFACE_CONFIG_CHANGED, AUTH_SERVER_CHANGED
 */

import type { AlarmQueryContext, QueryResult } from './types';

// ─── Helper ────────────────────────────────────────────────────────────────────

/** Access FortiGateService from the detection engine singleton */
function getFortiGateService() {
  const engine = (globalThis as any).__detectionEngine;
  return engine?.fortiGateService ?? null;
}

/** Build an empty QueryResult */
function emptyResult(ctx: AlarmQueryContext, description: string, durationMs = 0): QueryResult {
  return {
    events: [],
    stats: {
      alarmCode: ctx.alarmCode,
      source: 'cache' as const,
      eventCount: 0,
      durationMs,
      usedFallback: false,
      queryDescription: `FG: ${description}`,
    },
  };
}

/**
 * Fetch a broad FortiGate filter, then narrow in-memory by a predicate.
 * The broad filter is cached by FortiGateService so multiple alarms
 * sharing the same broad filter only make 1 API call.
 */
async function queryFortiGateBroad(
  ctx: AlarmQueryContext,
  broadFilter: string,
  memFilter: (log: any) => boolean,
  description: string,
): Promise<QueryResult> {
  const start = Date.now();

  const fg = getFortiGateService();
  if (!fg) {
    console.warn(`[AlarmQuery] ${ctx.alarmCode}: FortiGate service not available`);
    return emptyResult(ctx, description);
  }

  try {
    // Broad fetch (cached per-cycle by FortiGateService)
    const allLogs = await fg.getEventLogs(broadFilter, 1000);

    // Time window filter
    const cutoff = Date.now() / 1000 - ctx.timeWindowMinutes * 60;
    const events = allLogs
      .filter((log: any) => {
        const ts = log.eventtime ? Number(log.eventtime) / 1e9 : (log.itime_t ?? log.date_epoch ?? 0);
        return ts >= cutoff && memFilter(log);
      })
      .map((log: any) => ({
        rawLog: log,
        timestamp: log.eventtime ? Number(log.eventtime) / 1e9 : (log.itime_t ?? log.date_epoch),
      }));

    const durationMs = Date.now() - start;
    console.log(
      `[AlarmQuery] ${ctx.alarmCode}: FortiGate — ${events.length} events (${durationMs}ms) | ${description}`
    );

    return {
      events,
      stats: {
        alarmCode: ctx.alarmCode,
        source: 'cache' as const,
        eventCount: events.length,
        durationMs,
        usedFallback: false,
        queryDescription: `FG: ${description}`,
      },
    };
  } catch (error) {
    const durationMs = Date.now() - start;
    console.error(`[AlarmQuery] ${ctx.alarmCode}: FortiGate query FAILED (${durationMs}ms):`, error);
    return emptyResult(ctx, description, durationMs);
  }
}

// ─── Broad filters (shared across multiple alarms) ──────────────────────────

/** All system config attribute changes — covers 10 config alarms */
const BROAD_SYSTEM_ATTRIBUTE = 'subtype==system&&logdesc=~attribute';

/** All system login events — covers UNAUTH_ADMIN_LOGIN, ADMIN_LOGIN_FAILED, ADMIN_LOGIN_OFF_HOURS */
const BROAD_SYSTEM_LOGIN = 'subtype==system&&action==login';

/** All system Add events — covers NEW_ADDRESS_OBJECT, NEW_SERVICE_OBJECT */
const BROAD_SYSTEM_ADD = 'subtype==system&&action==Add';

// ─── In-memory cfgpath matchers ─────────────────────────────────────────────

const matchCfgpath = (log: any, pattern: string) =>
  typeof log.cfgpath === 'string' && log.cfgpath.includes(pattern);

const matchLogdesc = (log: any, pattern: string) =>
  typeof log.logdesc === 'string' && log.logdesc.includes(pattern);

// ─── Config & Access Alarm Queries ─────────────────────────────────────────────

/** FW_POLICY_CHANGED — Firewall policy add/edit/delete */
export async function fgFirewallPolicyChanged(ctx: AlarmQueryContext): Promise<QueryResult> {
  return queryFortiGateBroad(ctx, BROAD_SYSTEM_ATTRIBUTE,
    (log) => matchCfgpath(log, 'firewall.policy'),
    'cfgpath~firewall.policy logdesc~attribute',
  );
}

/** UNAUTH_ADMIN_LOGIN — Failed admin login attempts */
export async function fgUnauthAdminLogin(ctx: AlarmQueryContext): Promise<QueryResult> {
  return queryFortiGateBroad(ctx, BROAD_SYSTEM_LOGIN,
    (log) => log.status === 'failed',
    'action=login status=failed',
  );
}

/** ADMIN_LOGIN_FAILED — All failed admin login attempts (FortiGate direct) */
export async function fgAdminLoginFailed(ctx: AlarmQueryContext): Promise<QueryResult> {
  return queryFortiGateBroad(ctx, BROAD_SYSTEM_LOGIN,
    (log) => log.status === 'failed',
    'action=login status=failed',
  );
}

/** ADMIN_LOGIN_OFF_HOURS — Successful admin logins (off-hours check done by detection engine) */
export async function fgAdminLoginOffHours(ctx: AlarmQueryContext): Promise<QueryResult> {
  return queryFortiGateBroad(ctx, BROAD_SYSTEM_LOGIN,
    (log) => log.status === 'success',
    'action=login status=success',
  );
}

/** CORE_CONFIG_CHANGE — Any system config attribute change */
export async function fgCoreConfigChange(ctx: AlarmQueryContext): Promise<QueryResult> {
  return queryFortiGateBroad(ctx, BROAD_SYSTEM_ATTRIBUTE,
    () => true, // all attribute changes
    'logdesc~attribute (all)',
  );
}

/** FIRMWARE_CHANGE — Firmware upgrade/downgrade */
export async function fgFirmwareChange(ctx: AlarmQueryContext): Promise<QueryResult> {
  // Firmware events are rare, use a specific filter (will be cached anyway)
  return queryFortiGateBroad(ctx, 'subtype==system&&logdesc=~Firmware',
    () => true,
    'logdesc~Firmware',
  );
}

/** ADMIN_PASSWORD_CHANGED — Admin password changes */
export async function fgAdminPasswordChanged(ctx: AlarmQueryContext): Promise<QueryResult> {
  return queryFortiGateBroad(ctx, BROAD_SYSTEM_ATTRIBUTE,
    (log) => matchCfgpath(log, 'system.admin'),
    'cfgpath~system.admin logdesc~attribute',
  );
}

/** ADMIN_PRIVILEGE_CHANGE — Access profile / privilege changes */
export async function fgAdminPrivilegeChange(ctx: AlarmQueryContext): Promise<QueryResult> {
  return queryFortiGateBroad(ctx, BROAD_SYSTEM_ATTRIBUTE,
    (log) => matchCfgpath(log, 'system.accprofile'),
    'cfgpath~system.accprofile logdesc~attribute',
  );
}

/** ADDRESS_OBJECT_CHANGED — Firewall address object edits */
export async function fgAddressObjectChanged(ctx: AlarmQueryContext): Promise<QueryResult> {
  return queryFortiGateBroad(ctx, BROAD_SYSTEM_ATTRIBUTE,
    (log) => matchCfgpath(log, 'firewall.address'),
    'cfgpath~firewall.address logdesc~attribute',
  );
}

/** NEW_ADDRESS_OBJECT — New firewall address object created */
export async function fgNewAddressObject(ctx: AlarmQueryContext): Promise<QueryResult> {
  return queryFortiGateBroad(ctx, BROAD_SYSTEM_ADD,
    (log) => matchCfgpath(log, 'firewall.address'),
    'action=Add cfgpath~firewall.address',
  );
}

/** NEW_SERVICE_OBJECT — New firewall service object created */
export async function fgNewServiceObject(ctx: AlarmQueryContext): Promise<QueryResult> {
  return queryFortiGateBroad(ctx, BROAD_SYSTEM_ADD,
    (log) => matchCfgpath(log, 'firewall.service'),
    'action=Add cfgpath~firewall.service',
  );
}

/** ROUTE_TABLE_CHANGED — Routing table modifications */
export async function fgRouteTableChanged(ctx: AlarmQueryContext): Promise<QueryResult> {
  return queryFortiGateBroad(ctx, BROAD_SYSTEM_ATTRIBUTE,
    (log) => matchCfgpath(log, 'router'),
    'cfgpath~router logdesc~attribute',
  );
}

/** INTERFACE_CONFIG_CHANGED — Interface configuration changes */
export async function fgInterfaceConfigChanged(ctx: AlarmQueryContext): Promise<QueryResult> {
  return queryFortiGateBroad(ctx, BROAD_SYSTEM_ATTRIBUTE,
    (log) => matchCfgpath(log, 'system.interface'),
    'cfgpath~system.interface logdesc~attribute',
  );
}

/** AUTH_SERVER_CHANGED — Authentication server configuration changes */
export async function fgAuthServerChanged(ctx: AlarmQueryContext): Promise<QueryResult> {
  return queryFortiGateBroad(ctx, BROAD_SYSTEM_ATTRIBUTE,
    (log) => matchCfgpath(log, 'user'),
    'cfgpath~user logdesc~attribute',
  );
}
