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

// Config change (FortiAnalyzer cache+fallback — kept as secondary)
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

// Auth & login events (FortiAnalyzer — kept as secondary)
export {
  getAdminLoginFailEvents,
  getAdminLoginSuccessEvents,
  getVpnLoginEvents,
  getSslvpnTunnelUpEvents,
  getSslvpnTunnelDownEvents,
} from './auth-events';

// VPN threat events (FortiAnalyzer — kept as secondary)
export {
  getVpnBruteForceEvents,
  getSslvpnLockoutEvents,
  getIpsecTunnelDownEvents,
} from './vpn-events';

// FortiGate direct queries — Config & Access
export {
  fgFirewallPolicyChanged,
  fgUnauthAdminLogin,
  fgAdminLoginFailed,
  fgAdminLoginOffHours,
  fgCoreConfigChange,
  fgFirmwareChange,
  fgAdminPasswordChanged,
  fgAdminPrivilegeChange,
  fgAddressObjectChanged,
  fgNewAddressObject,
  fgNewServiceObject,
  fgRouteTableChanged,
  fgInterfaceConfigChanged,
  fgAuthServerChanged,
} from './fortigate-config';

// FortiGate direct queries — VPN & SSL-VPN
export {
  fgVpnBruteForce,
  fgSslvpnAuthFailed,
  fgSslvpnMultiFail,
  fgSslvpnLockout,
  fgSslvpnConnection,
  fgSslvpnTunnelDown,
  fgSslvpnHighTraffic,
  fgUserSessionOffHours,
  fgVpnNewUser,
  fgIpsecTunnelChanged,
  fgSslVpnSettingsChanged,
  fgVpnTunnelDown,
} from './fortigate-vpn';

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

// FortiAnalyzer cache imports — all log-based alarms use FA event cache
import {
  getFirewallPolicyChangeEvents,
  getCoreConfigChangeEvents,
  getFirmwareChangeEvents,
  getAdminPasswordChangeEvents,
  getAddressObjectChangeEvents,
  getAuthServerChangeEvents,
  getRouteTableChangeEvents,
  getSdWanChangeEvents,
  getHaConfigChangeEvents,
} from './config-change';
import {
  getAdminLoginFailEvents,
  getAdminLoginSuccessEvents,
  getVpnLoginEvents,
  getSslvpnTunnelUpEvents,
  getSslvpnTunnelDownEvents,
} from './auth-events';
import {
  getVpnBruteForceEvents,
  getSslvpnLockoutEvents,
  getIpsecTunnelDownEvents,
} from './vpn-events';
import { getIpsHighSeverityEvents, getMalwareDetectedEvents, getAppCtrlViolationEvents, getShadowItEvents, getWebFilterBlockEvents, getIocHitEvents } from './security-events';
import { getDnsTunnelSuspectEvents } from './dns-events';

/**
 * Maps alarm codes to their dedicated, type-safe query functions.
 *
 * ── FortiAnalyzer Cache (all log-based alarms) ────────────────────────────────
 * Config/Access, VPN/SSL-VPN, Security, DNS alarms use FA event cache.
 * FortiGate v7.2.11 does not support REST log querying (/monitor/log/event → 404).
 *
 * ── FortiGate Real-Time (SSLVPN source alarms) ────────────────────────────────
 * VPN_LOGIN_OFF_HOURS and SSLVPN_BUSINESS_HOURS use source: 'fortigate-sslvpn'
 * and are evaluated separately by evaluateFortiGateSslvpnAlarm().
 */
export const ALARM_QUERY_REGISTRY = new Map<string, AlarmQueryFn>([
  // ── Config & Access (FortiAnalyzer cache) ──────────────────────────────────
  ['FW_POLICY_CHANGED',        getFirewallPolicyChangeEvents],
  ['CORE_CONFIG_CHANGE',       getCoreConfigChangeEvents],
  ['FIRMWARE_CHANGE',          getFirmwareChangeEvents],
  ['ADMIN_PASSWORD_CHANGED',   getAdminPasswordChangeEvents],
  ['ADDRESS_OBJECT_CHANGED',   getAddressObjectChangeEvents],
  ['AUTH_SERVER_CHANGED',      getAuthServerChangeEvents],
  ['ROUTE_TABLE_CHANGED',      getRouteTableChangeEvents],
  ['SD_WAN_CHANGED',           getSdWanChangeEvents],
  ['HA_CONFIG_CHANGED',        getHaConfigChangeEvents],

  // ── VPN (FortiAnalyzer cache) ───────────────────────────────────────────────
  ['VPN_BRUTE_FORCE',          getVpnBruteForceEvents],
  ['SSLVPN_LOCKOUT',           getSslvpnLockoutEvents],
  ['IPSEC_TUNNEL_CHANGED',     getIpsecTunnelDownEvents],
  ['SSLVPN_TUNNEL_UP',         getSslvpnTunnelUpEvents],
  ['SSLVPN_TUNNEL_DOWN',       getSslvpnTunnelDownEvents],

  // ── Authentication (FortiAnalyzer cache) ────────────────────────────────────
  ['UNAUTH_ADMIN_LOGIN',       getAdminLoginFailEvents],
  ['ADMIN_LOGIN_FAILED',       getAdminLoginFailEvents],
  ['ADMIN_LOGIN_OFF_HOURS',    getAdminLoginSuccessEvents],
  ['USER_SESSION_OFF_HOURS',   getVpnLoginEvents],

  // ── Security Threats (FortiAnalyzer cache) ──────────────────────────────────
  ['IPS_HIGH_SEVERITY',        getIpsHighSeverityEvents],
  ['IPS_DETECT',               getIpsHighSeverityEvents],
  ['MALWARE_DETECTED',         getMalwareDetectedEvents],
  ['APP_CONTROL_VIOLATION',    getAppCtrlViolationEvents],
  ['SHADOW_IT_DETECTED',       getShadowItEvents],
  ['WEB_FILTER_BLOCK',         getWebFilterBlockEvents],
  ['IOC_HIT',                  getIocHitEvents],

  // ── DNS (FortiAnalyzer cache) ───────────────────────────────────────────────
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
