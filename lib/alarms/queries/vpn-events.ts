/**
 * Alarm Query Layer — VPN Threat Events
 *
 * Covers: VPN_BRUTE_FORCE, SSLVPN_LOCKOUT
 *
 * Key design notes:
 *  - Brute force detection requires GROUP BY srcIp + COUNT (done by detection engine clientCheck)
 *    This query returns the raw failed-login events; detection engine counts per IP.
 *  - All filters use indexed columns where possible (subtype, action) to avoid full table scans.
 */

import { runAlarmQuery, queryCache, queryFortiAnalyzerDirect, timeWindow } from './base';
import type { AlarmQueryContext, QueryResult } from './types';

// ─── VPN Brute Force ──────────────────────────────────────────────────────────

/**
 * VPN_BRUTE_FORCE — Multiple failed SSL-VPN login attempts from same source.
 *
 * DB filter:
 *   logtype = 'event'              ← table partition key
 *   subtype = 'vpn'                ← indexed column
 *   action  = 'ssl-login-fail'     ← indexed column
 *
 * Detection logic (applied by engine after this query):
 *   clientCheck: 'brute-force-group'
 *   threshold: 5 (5+ failed attempts from same srcIp in timeWindow)
 *
 * NOTE: Previously used filter 'subtype == vpn and status == failed' — this was
 * wrong because ssl-login-fail events don't set the status field. Use action instead.
 */
export async function getVpnBruteForceEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  const description = 'logtype=event subtype=vpn action=ssl-login-fail';

  return runAlarmQuery(
    ctx,
    description,
    () =>
      queryCache({
        logtype: 'event',
        subtype: 'vpn',
        action: 'ssl-login-fail',
        eventTime: timeWindow(ctx.timeWindowMinutes),
      }),
    fa =>
      queryFortiAnalyzerDirect(
        fa,
        'event',
        'subtype == vpn and action == ssl-login-fail',
        ctx.timeWindowMinutes
      ),
    { softFallback: true } // Brute force is high-priority — verify via FA if cache empty
  );
}

// ─── SSL-VPN Lockout ──────────────────────────────────────────────────────────

/**
 * SSLVPN_LOCKOUT — User or IP locked out after repeated failed VPN logins.
 *
 * DB filter:
 *   logtype = 'event'
 *   subtype = 'vpn'                ← indexed column
 *   rawLog.logdesc LIKE '%lockout%' ← JSONB path filter
 *
 * The 'lockout' logdesc is specific to FortiGate SSL-VPN lockout events
 * (distinct from the general ssl-login-fail stream).
 *
 * NOTE: softFallback is intentionally disabled here. The JSONB string_contains
 * scan on VPN events is slow (~14s with large caches). Adding a FA soft fallback
 * on top would push the total past the 25s batch timeout.
 * The cache query is authoritative: lockout events land in the cache within
 * minutes and the JSONB scan will find them.
 */
export async function getSslvpnLockoutEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  const description = 'logtype=event subtype=vpn logdesc~lockout';

  return runAlarmQuery(
    ctx,
    description,
    () =>
      queryCache({
        logtype: 'event',
        subtype: 'vpn',
        eventTime: timeWindow(ctx.timeWindowMinutes),
        AND: [{ rawLog: { path: ['logdesc'], string_contains: 'lockout' } }],
      }),
    fa =>
      queryFortiAnalyzerDirect(
        fa,
        'event',
        'subtype == vpn and logdesc like %lockout%',
        ctx.timeWindowMinutes
      )
    // No softFallback — see note above
  );
}

// ─── IPsec VPN Events ─────────────────────────────────────────────────────────

/**
 * IPSEC_TUNNEL_DOWN — IPsec tunnel disconnection (phase2 down).
 *
 * DB filter:
 *   logtype = 'event', subtype = 'vpn', action = 'tunnel-down'
 *   rawLog.tunneltype = 'ipsec' (to distinguish from SSL-VPN)
 */
export async function getIpsecTunnelDownEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  const description = 'logtype=event subtype=vpn action=tunnel-down tunneltype=ipsec';

  return runAlarmQuery(
    ctx,
    description,
    () =>
      queryCache({
        logtype: 'event',
        subtype: 'vpn',
        action: 'tunnel-down',
        eventTime: timeWindow(ctx.timeWindowMinutes),
        AND: [{ rawLog: { path: ['tunneltype'], equals: 'ipsec' } }],
      }),
    fa =>
      queryFortiAnalyzerDirect(
        fa,
        'event',
        'subtype == vpn and action == tunnel-down and tunneltype == ipsec',
        ctx.timeWindowMinutes
      )
  );
}
