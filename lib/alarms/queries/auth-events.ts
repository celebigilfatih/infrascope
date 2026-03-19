/**
 * Alarm Query Layer — Authentication & Login Events
 *
 * Covers: UNAUTH_ADMIN_LOGIN, ADMIN_LOGIN_OFF_HOURS,
 *         VPN_LOGIN_OFF_HOURS, USER_SESSION_OFF_HOURS
 *
 * Key design:
 *  - Admin login events: logtype=event, subtype=system, action=login
 *    + JSONB status=failed/success (status is NOT a column — must use rawLog path)
 *  - VPN auth-logon events: logtype=event, action=auth-logon (indexed column)
 *    → This is the fixed case: no longer using generic 1000-row fetch + in-memory filter
 *
 * NOTE on `status` field:
 *   The `status` field (failed/success) is in rawLog.status, NOT a CachedEvent column.
 *   Therefore we use JSONB path filter: rawLog: { path: ['status'], equals: 'failed' }
 */

import { runAlarmQuery, queryCache, queryFortiAnalyzerDirect, timeWindow } from './base';
import type { AlarmQueryContext, QueryResult } from './types';

// ─── Admin Login — Failed ─────────────────────────────────────────────────────

/**
 * UNAUTH_ADMIN_LOGIN — Failed admin login attempts.
 *
 * DB filter (all pushed to PostgreSQL, zero in-memory filtering):
 *   logtype = 'event'            ← table partition key
 *   subtype = 'system'           ← indexed column
 *   action  = 'login'            ← indexed column
 *   rawLog.status = 'failed'     ← JSONB path filter (evaluated in DB)
 *
 * FA filter: subtype == system and action == login and status == failed
 *
 * Priority: HIGH — failed logins are security-critical, use softFallback=true
 * to verify via FA if cache returns empty (don't silently miss brute-force logins).
 */
export async function getAdminLoginFailEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  const description = 'logtype=event subtype=system action=login status=failed';

  return runAlarmQuery(
    ctx,
    description,
    () =>
      queryCache({
        logtype: 'event',
        subtype: 'system',
        action: 'login',
        eventTime: timeWindow(ctx.timeWindowMinutes),
        AND: [{ rawLog: { path: ['status'], equals: 'failed' } }],
      }),
    fa =>
      queryFortiAnalyzerDirect(
        fa,
        'event',
        'subtype == system and action == login and status == failed',
        ctx.timeWindowMinutes
      ),
    { softFallback: true } // Don't miss failed logins — verify via FA if cache empty
  );
}

// ─── Admin Login — Success (Off-Hours Basis) ──────────────────────────────────

/**
 * ADMIN_LOGIN_OFF_HOURS — Successful admin logins (filtered for off-hours by detection engine).
 *
 * DB filter:
 *   logtype = 'event', subtype = 'system', action = 'login'
 *   rawLog.status = 'success'
 *
 * The off-hours check (18:00–08:00 + weekends) is applied by the detection engine
 * using filterOffHours() AFTER this query returns events. That's correct — the time
 * check requires the login timestamp which is available in rawLog.eventtime.
 */
export async function getAdminLoginSuccessEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  const description = 'logtype=event subtype=system action=login status=success';

  return runAlarmQuery(
    ctx,
    description,
    () =>
      queryCache({
        logtype: 'event',
        subtype: 'system',
        action: 'login',
        eventTime: timeWindow(ctx.timeWindowMinutes),
        AND: [{ rawLog: { path: ['status'], equals: 'success' } }],
      }),
    fa =>
      queryFortiAnalyzerDirect(
        fa,
        'event',
        'subtype == system and action == login and status == success',
        ctx.timeWindowMinutes
      )
  );
}

// ─── VPN Login — Off-Hours (SSL-VPN Auth-Logon) ───────────────────────────────

/**
 * VPN_LOGIN_OFF_HOURS — SSL-VPN auth-logon events for off-hours detection.
 *
 * DB filter:
 *   logtype = 'event'          ← table partition key
 *   action  = 'auth-logon'     ← indexed column (CachedEvent.action)
 *
 * This is the corrected query for the bug described in the session:
 *   Previously: fetched 1000 generic events → in-memory filter for action=auth-logon
 *               With 2968 events in the 12h window, cutoff was at 06:11am.
 *               Events from 22:02 last night were beyond the 1000-row limit → MISSED.
 *
 *   Now: WHERE action = 'auth-logon' → DB returns ONLY auth-logon rows (9 in 12h)
 *         All 9 are returned, all 9 are checked for off-hours → alarms fire correctly.
 *
 * The off-hours filter + per-user cooldown (clientCheck: 'off-hours-per-user') is
 * applied by the detection engine after this query returns events.
 *
 * NOTE: FortiGate uses logid 0102043039 for ALL auth-logon events (same type ID).
 * The cache handles deduplication via logId = logid + '-' + eventtime (nanoseconds).
 */
export async function getVpnLoginEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  const description = 'logtype=event action=auth-logon';

  return runAlarmQuery(
    ctx,
    description,
    () =>
      queryCache({
        logtype: 'event',
        action: 'auth-logon',
        eventTime: timeWindow(ctx.timeWindowMinutes),
      }),
    fa =>
      queryFortiAnalyzerDirect(
        fa,
        'event',
        'action == auth-logon',
        ctx.timeWindowMinutes
      )
  );
}

// ─── VPN Tunnel Status ────────────────────────────────────────────────────────

/**
 * SSLVPN_TUNNEL_UP — SSL-VPN tunnel connection events.
 *
 * DB filter:
 *   logtype = 'event', subtype = 'vpn', action = 'tunnel-up'
 *
 * Both subtype and action are indexed columns → fast lookup.
 */
export async function getSslvpnTunnelUpEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  const description = 'logtype=event subtype=vpn action=tunnel-up';

  return runAlarmQuery(
    ctx,
    description,
    () =>
      queryCache({
        logtype: 'event',
        subtype: 'vpn',
        action: 'tunnel-up',
        eventTime: timeWindow(ctx.timeWindowMinutes),
      }),
    fa =>
      queryFortiAnalyzerDirect(
        fa,
        'event',
        'subtype == vpn and action == tunnel-up',
        ctx.timeWindowMinutes
      )
  );
}

/**
 * VPN_TUNNEL_DOWN — VPN tunnel disconnection events.
 *
 * DB filter:
 *   logtype = 'event', subtype = 'vpn', action = 'tunnel-down'
 */
export async function getSslvpnTunnelDownEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  const description = 'logtype=event subtype=vpn action=tunnel-down';

  return runAlarmQuery(
    ctx,
    description,
    () =>
      queryCache({
        logtype: 'event',
        subtype: 'vpn',
        action: 'tunnel-down',
        eventTime: timeWindow(ctx.timeWindowMinutes),
      }),
    fa =>
      queryFortiAnalyzerDirect(
        fa,
        'event',
        'subtype == vpn and action == tunnel-down',
        ctx.timeWindowMinutes
      )
  );
}
