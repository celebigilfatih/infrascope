/**
 * Alarm Query Layer — FortiGate Direct VPN & SSL-VPN Events
 *
 * Bypasses FortiAnalyzer entirely. Queries FortiGate REST API
 * via GET /api/v2/monitor/log/event?filter=...
 *
 * OPTIMIZATION: Uses only 2 broad API calls (subtype==vpn, subtype==user)
 * and filters by action in memory. This avoids FortiGate 429 rate limiting.
 *
 * Covers VPN/SSL-VPN alarms that are NOT already handled by
 * the fortigate-sslvpn source (VPN_LOGIN_OFF_HOURS, SSLVPN_BUSINESS_HOURS).
 *
 * Alarms covered:
 *   VPN_BRUTE_FORCE, SSLVPN_AUTH_FAILED, SSLVPN_MULTI_FAIL,
 *   SSLVPN_LOCKOUT, SSLVPN_CONNECTION, SSLVPN_TUNNEL_DOWN,
 *   SSLVPN_HIGH_TRAFFIC, USER_SESSION_OFF_HOURS, VPN_NEW_USER,
 *   IPSEC_TUNNEL_CHANGED, SSL_VPN_SETTINGS_CHANGED, VPN_TUNNEL_DOWN
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
    const allLogs = await fg.getEventLogs(broadFilter, 1000);

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

/** All VPN events — covers 8 VPN alarms */
const BROAD_VPN = 'subtype==vpn';

/** All user auth events — covers SSLVPN_LOCKOUT, USER_SESSION_OFF_HOURS */
const BROAD_USER = 'subtype==user';

/** Config attribute changes related to VPN — uses same broad filter as fortigate-config.ts */
const BROAD_SYSTEM_ATTRIBUTE = 'subtype==system&&logdesc=~attribute';

// ─── In-memory matchers ─────────────────────────────────────────────────────

const matchCfgpath = (log: any, pattern: string) =>
  typeof log.cfgpath === 'string' && log.cfgpath.includes(pattern);

// ─── VPN & SSL-VPN Alarm Queries ───────────────────────────────────────────────

/** VPN_BRUTE_FORCE — Multiple SSL-VPN login failures (threshold: 5) */
export async function fgVpnBruteForce(ctx: AlarmQueryContext): Promise<QueryResult> {
  return queryFortiGateBroad(ctx, BROAD_VPN,
    (log) => log.action === 'ssl-login-fail',
    'subtype=vpn action=ssl-login-fail',
  );
}

/** SSLVPN_AUTH_FAILED — Single SSL-VPN authentication failure */
export async function fgSslvpnAuthFailed(ctx: AlarmQueryContext): Promise<QueryResult> {
  return queryFortiGateBroad(ctx, BROAD_VPN,
    (log) => log.action === 'ssl-login-fail',
    'subtype=vpn action=ssl-login-fail',
  );
}

/** SSLVPN_MULTI_FAIL — Multiple SSL-VPN login failures (threshold: 3) */
export async function fgSslvpnMultiFail(ctx: AlarmQueryContext): Promise<QueryResult> {
  return queryFortiGateBroad(ctx, BROAD_VPN,
    (log) => log.action === 'ssl-login-fail',
    'subtype=vpn action=ssl-login-fail',
  );
}

/** SSLVPN_LOCKOUT — SSL-VPN account lockout */
export async function fgSslvpnLockout(ctx: AlarmQueryContext): Promise<QueryResult> {
  return queryFortiGateBroad(ctx, BROAD_USER,
    (log) => log.action === 'auth-lockout',
    'subtype=user action=auth-lockout',
  );
}

/** SSLVPN_CONNECTION — SSL-VPN tunnel established */
export async function fgSslvpnConnection(ctx: AlarmQueryContext): Promise<QueryResult> {
  return queryFortiGateBroad(ctx, BROAD_VPN,
    (log) => log.action === 'tunnel-up',
    'subtype=vpn action=tunnel-up',
  );
}

/** SSLVPN_TUNNEL_DOWN — SSL-VPN tunnel disconnected */
export async function fgSslvpnTunnelDown(ctx: AlarmQueryContext): Promise<QueryResult> {
  return queryFortiGateBroad(ctx, BROAD_VPN,
    (log) => log.action === 'tunnel-down',
    'subtype=vpn action=tunnel-down',
  );
}

/** SSLVPN_HIGH_TRAFFIC — High traffic on SSL-VPN */
export async function fgSslvpnHighTraffic(ctx: AlarmQueryContext): Promise<QueryResult> {
  return queryFortiGateBroad(ctx, BROAD_VPN,
    (log) => log.action === 'tunnel-stats',
    'subtype=vpn action=tunnel-stats',
  );
}

/** USER_SESSION_OFF_HOURS — User session outside business hours */
export async function fgUserSessionOffHours(ctx: AlarmQueryContext): Promise<QueryResult> {
  return queryFortiGateBroad(ctx, BROAD_USER,
    (log) => log.action === 'auth-logon',
    'subtype=user action=auth-logon',
  );
}

/** VPN_NEW_USER — New VPN user detected */
export async function fgVpnNewUser(ctx: AlarmQueryContext): Promise<QueryResult> {
  return queryFortiGateBroad(ctx, BROAD_VPN,
    (log) => log.action === 'tunnel-up',
    'subtype=vpn action=tunnel-up (new user)',
  );
}

/** IPSEC_TUNNEL_CHANGED — IPsec VPN config changes */
export async function fgIpsecTunnelChanged(ctx: AlarmQueryContext): Promise<QueryResult> {
  return queryFortiGateBroad(ctx, BROAD_SYSTEM_ATTRIBUTE,
    (log) => matchCfgpath(log, 'vpn.ipsec'),
    'cfgpath~vpn.ipsec logdesc~attribute',
  );
}

/** SSL_VPN_SETTINGS_CHANGED — SSL-VPN settings modifications */
export async function fgSslVpnSettingsChanged(ctx: AlarmQueryContext): Promise<QueryResult> {
  return queryFortiGateBroad(ctx, BROAD_SYSTEM_ATTRIBUTE,
    (log) => matchCfgpath(log, 'vpn.ssl'),
    'cfgpath~vpn.ssl logdesc~attribute',
  );
}

/** VPN_TUNNEL_DOWN — VPN tunnel down event */
export async function fgVpnTunnelDown(ctx: AlarmQueryContext): Promise<QueryResult> {
  return queryFortiGateBroad(ctx, BROAD_VPN,
    (log) => log.action === 'tunnel-down',
    'subtype=vpn action=tunnel-down',
  );
}
