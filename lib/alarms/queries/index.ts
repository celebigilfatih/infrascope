/**
 * Alarm Query Layer — Registry & Public API
 *
 * ALARM_QUERY_REGISTRY maps alarm codes → dedicated query functions.
 *
 * ─── How the detection engine uses this ─────────────────────────────────────
 *
 * In evaluateLogTypeGroupOptimized(), for each alarm:
 *   1. Check ALARM_QUERY_REGISTRY.has(alarm.code)
 *   2. If YES  → call the dedicated function — returns correctly filtered events,
 *                no in-memory filtering needed
 *   3. If NO   → fall through to generic performLogSearch (existing behavior)
 *
 * ─── Adding a new alarm ──────────────────────────────────────────────────────
 *
 * 1. Write a query function in the appropriate file (e.g. security-events.ts)
 * 2. Add an entry to ALARM_QUERY_REGISTRY below
 * 3. That's it — the detection engine automatically picks it up
 *
 * ─── Priority flags ──────────────────────────────────────────────────────────
 *
 * BYPASS_CACHE_ALARMS: alarm codes that should always hit FortiAnalyzer directly.
 * Currently empty — cache+softFallback covers all critical cases.
 * Add alarm codes here if you need guaranteed real-time accuracy.
 */

// ─── Imports ──────────────────────────────────────────────────────────────────

export type { AlarmQueryContext, QueryResult, QueryStats, AlarmQueryFn } from './types';
export { runAlarmQuery, queryCache, queryFortiAnalyzerDirect, timeWindow } from './base';

// Config change
export {
  getFirewallPolicyChangeEvents,
  getCoreConfigChangeEvents,
  getFirmwareChangeEvents,
  getAuthServerChangeEvents,
  getRouteTableChangeEvents,
  getAdminPasswordChangeEvents,
  getAddressObjectChangeEvents,
  getSdWanChangeEvents,
  getHaConfigChangeEvents,
} from './config-change';

// Auth & login events
export {
  getAdminLoginFailEvents,
  getAdminLoginSuccessEvents,
  getVpnLoginEvents,
  getSslvpnTunnelUpEvents,
  getSslvpnTunnelDownEvents,
} from './auth-events';

// VPN threat events
export {
  getVpnBruteForceEvents,
  getSslvpnLockoutEvents,
  getIpsecTunnelDownEvents,
} from './vpn-events';

// FortiGate direct queries (bypass FortiAnalyzer)
export { getAdminLoginFailedEvents } from './admin-login-failed';

// Security threat events
export {
  getIpsHighSeverityEvents,
  getIpsAllEvents,
  getMalwareDetectedEvents,
  getAppCtrlViolationEvents,
  getShadowItEvents,
  getWebFilterBlockEvents,
  getIocHitEvents,
  getHighOutboundTrafficEvents,
} from './security-events';

// DNS events
export {
  getDnsTunnelSuspectEvents,
  getDnsExternalResolutionEvents,
  getDnsBlockedEvents,
} from './dns-events';

// ─── Registry ─────────────────────────────────────────────────────────────────

import type { AlarmQueryFn } from './types';
import { getFirewallPolicyChangeEvents, getCoreConfigChangeEvents, getFirmwareChangeEvents, getAuthServerChangeEvents, getRouteTableChangeEvents, getAdminPasswordChangeEvents, getAddressObjectChangeEvents, getSdWanChangeEvents, getHaConfigChangeEvents } from './config-change';
import { getAdminLoginFailEvents, getAdminLoginSuccessEvents, getVpnLoginEvents, getSslvpnTunnelUpEvents, getSslvpnTunnelDownEvents } from './auth-events';
import { getVpnBruteForceEvents, getSslvpnLockoutEvents, getIpsecTunnelDownEvents } from './vpn-events';
import { getIpsHighSeverityEvents, getMalwareDetectedEvents, getAppCtrlViolationEvents, getShadowItEvents, getWebFilterBlockEvents, getIocHitEvents } from './security-events';
import { getDnsTunnelSuspectEvents } from './dns-events';

/**
 * Maps alarm codes to their dedicated, type-safe query functions.
 *
 * Each entry guarantees:
 *  ✓ DB-level WHERE filtering (no "fetch 1000 then filter in JS")
 *  ✓ JSONB path filters for fields not in columns (logdesc, cfgpath, status)
 *  ✓ Cache-first with automatic FA fallback
 *  ✓ Per-query observability (source, count, duration logged)
 */
export const ALARM_QUERY_REGISTRY = new Map<string, AlarmQueryFn>([
  // ── Config & Access ──────────────────────────────────────────────────────
  ['FW_POLICY_CHANGED',        getFirewallPolicyChangeEvents],
  ['CORE_CONFIG_CHANGE',       getCoreConfigChangeEvents],
  ['FIRMWARE_CHANGE',          getFirmwareChangeEvents],
  ['AUTH_SERVER_CHANGED',      getAuthServerChangeEvents],
  ['ROUTE_TABLE_CHANGED',      getRouteTableChangeEvents],
  ['ADMIN_PASSWORD_CHANGED',   getAdminPasswordChangeEvents],
  ['ADDRESS_OBJECT_CHANGED',   getAddressObjectChangeEvents],
  ['SD_WAN_CHANGED',           getSdWanChangeEvents],
  ['HA_CONFIG_CHANGED',        getHaConfigChangeEvents],

  // ── Authentication & Login (FortiGate Direct) ────────────────────────────
  ['ADMIN_LOGIN_FAILED',       getAdminLoginFailedEvents],  // Direct FortiGate query
  
  // ── Authentication & Login (FortiAnalyzer) ──────────────────────────────
  ['UNAUTH_ADMIN_LOGIN',       getAdminLoginFailEvents],
  ['ADMIN_LOGIN_OFF_HOURS',    getAdminLoginSuccessEvents],
  ['VPN_LOGIN_OFF_HOURS',      getVpnLoginEvents],
  ['SSLVPN_TUNNEL_UP',         getSslvpnTunnelUpEvents],
  ['VPN_TUNNEL_DOWN',          getSslvpnTunnelDownEvents],

  // ── VPN Threats ──────────────────────────────────────────────────────────
  ['VPN_BRUTE_FORCE',          getVpnBruteForceEvents],
  ['SSLVPN_AUTH_FAILED',       getVpnBruteForceEvents],  // same filter — single failed attempt
  ['SSLVPN_MULTI_FAIL',        getVpnBruteForceEvents],  // same filter — multiple failed attempts
  ['SSLVPN_LOCKOUT',           getSslvpnLockoutEvents],
  ['IPSEC_TUNNEL_DOWN',        getIpsecTunnelDownEvents],

  // ── Security Threats ─────────────────────────────────────────────────────
  ['IPS_HIGH_SEVERITY',        getIpsHighSeverityEvents],
  ['IPS_DETECT',               getIpsHighSeverityEvents],  // alias
  ['MALWARE_DETECTED',         getMalwareDetectedEvents],
  ['APP_CONTROL_VIOLATION',    getAppCtrlViolationEvents],
  ['SHADOW_IT_DETECTED',       getShadowItEvents],
  ['WEB_FILTER_BLOCK',         getWebFilterBlockEvents],
  ['IOC_HIT',                  getIocHitEvents],

  // ── DNS ──────────────────────────────────────────────────────────────────
  ['DNS_TUNNEL_SUSPECT',       getDnsTunnelSuspectEvents],
]);

/**
 * Alarm codes that bypass cache entirely (always query FortiAnalyzer directly).
 * Use sparingly — every entry here means an extra live FA query per check cycle.
 *
 * Currently empty: softFallback=true on critical alarms provides sufficient safety.
 * Add alarm codes here only if real-time accuracy is non-negotiable AND
 * you accept the additional FA API load.
 */
export const BYPASS_CACHE_ALARMS = new Set<string>([
  // Example: 'HA_CONFIG_CHANGED',  // HA changes require instant detection
]);
