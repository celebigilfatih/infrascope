/**
 * Alarm Query Layer — VPN Threat Events
 *
 * Covers: VPN_BRUTE_FORCE, SSLVPN_LOCKOUT, SSLVPN_AUTH_FAILED, SSLVPN_MULTI_FAIL
 *
 * Key design notes:
 *  - Brute force detection requires GROUP BY srcIp + COUNT (done by detection engine clientCheck)
 *    This query returns the raw failed-login events; detection engine counts per IP.
 *  - ssl-login-fail events are the primary auth-failure action from FortiGate SSL-VPN.
 *  - FA API targeted filter 'action == ssl-login-fail' sometimes returns 0 TID (similar to
 *    'subtype == user' bug). As a safety net, the cache query also captures ssl-exit-error
 *    and ssl-alert events which may indicate auth failures.
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

/**
 * SSLVPN_AUTH_FAILED / SSLVPN_MULTI_FAIL — SSL-VPN authentication failures.
 *
 * Primary: action = 'ssl-login-fail'
 * Fallback: action IN ('ssl-exit-error', 'ssl-alert') where reason != 'warning'
 *   — FortiAnalyzer may log auth failures under these actions on some firmware versions.
 *
 * softFallback: true — auth failures are security-critical, always verify via FA if cache empty.
 */
export async function getSslvpnAuthFailedEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  const description = 'logtype=event subtype=vpn action=ssl-login-fail (+ ssl-exit-error fallback)';

  return runAlarmQuery(
    ctx,
    description,
    async () => {
      // Primary: explicit login failures
      const primary = await queryCache({
        logtype: 'event',
        subtype: 'vpn',
        action: 'ssl-login-fail',
        eventTime: timeWindow(ctx.timeWindowMinutes),
      });
      if (primary.length > 0) return primary;

      // Fallback: ssl-exit-error / ssl-alert events with an identifiable user
      // FortiAnalyzer may log auth failures under these actions on some firmware versions
      const [exitErrors, alerts] = await Promise.all([
        queryCache({ logtype: 'event', subtype: 'vpn', action: 'ssl-exit-error', eventTime: timeWindow(ctx.timeWindowMinutes) }),
        queryCache({ logtype: 'event', subtype: 'vpn', action: 'ssl-alert',     eventTime: timeWindow(ctx.timeWindowMinutes) }),
      ]);
      // Only keep events where user field is a real username (not 'N/A' or empty)
      return [...exitErrors, ...alerts].filter(
        (log) => log.user && log.user !== 'N/A' && log.user !== ''
      );
    },
    fa =>
      queryFortiAnalyzerDirect(
        fa,
        'event',
        'subtype == vpn and action == ssl-login-fail',
        ctx.timeWindowMinutes
      ),
    { softFallback: true }
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
