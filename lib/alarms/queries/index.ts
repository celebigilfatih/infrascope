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
  getAdminConfigChangeEvents,
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
  getSslvpnAuthFailedEvents,
  getIpsecTunnelDownEvents,
} from './vpn-events';

// FortiGate CMDB diff queries — Config & Access (replaces FA log queries for v7.2.11)
export {
  cmdbFirewallPolicyChanged,
  cmdbNewVip,
  cmdbNewAdminUser,
  cmdbAdminPasswordChanged,
  cmdbAdminPrivilegeChange,
  cmdbRouteTableChanged,
  cmdbIpsecTunnelChanged,
  cmdbSslVpnSettingsChanged,
  cmdbAuthServerChanged,
  cmdbInterfaceConfigChanged,
  cmdbAddressObjectChanged,
  cmdbAddressGroupChanged,
  cmdbCoreConfigChange,
} from './fortigate-cmdb';

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

// NMS (SNMP) alarms — Prisma nmsInterface / nmsHealthMetric queries
export {
  getNmsPortDownEvents,
  getNmsDeviceUnreachableEvents,
  getNmsBackupFailedEvents,
} from './nms';

// VMware / vCenter alarms — cached_events source=vmware JSONB filter
export {
  getDatastoreSpaceCriticalEvents,
  getDatastoreSpaceLowEvents,
  getVmCreatedEvents,
  getVmDeletedEvents,
  getVmPoweredOnEvents,
  getVmPoweredOffEvents,
  getVmSuspendedEvents,
  getVmRestartedEvents,
  getVmCpuCriticalEvents,
  getVmMemoryCriticalEvents,
  getVmReconfiguredEvents,
  getVmClonedEvents,
  getVmMigratedEvents,
  getSnapshotCreatedEvents,
  getSnapshotDeletedEvents,
  getSnapshotRevertedEvents,
} from './vmware';

// ─── Registry ─────────────────────────────────────────────────────────────────

import type { AlarmQueryFn } from './types';

// FortiAnalyzer cache imports — all log-based alarms use FA event cache
import {
  cmdbFirewallPolicyChanged,
  cmdbNewVip,
  cmdbNewAdminUser,
  cmdbAdminPasswordChanged,
  cmdbAdminPrivilegeChange,
  cmdbRouteTableChanged,
  cmdbIpsecTunnelChanged,
  cmdbSslVpnSettingsChanged,
  cmdbAuthServerChanged,
  cmdbInterfaceConfigChanged,
  cmdbAddressObjectChanged,
  cmdbAddressGroupChanged,
  cmdbCoreConfigChange,
} from './fortigate-cmdb';
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
  getAdminConfigChangeEvents,
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
  getSslvpnAuthFailedEvents,
  getIpsecTunnelDownEvents,
} from './vpn-events';
import { getIpsHighSeverityEvents, getMalwareDetectedEvents, getAppCtrlViolationEvents, getShadowItEvents, getWebFilterBlockEvents, getIocHitEvents } from './security-events';
import { getDnsTunnelSuspectEvents } from './dns-events';
import {
  getNmsPortDownEvents,
  getNmsDeviceUnreachableEvents,
  getNmsBackupFailedEvents,
} from './nms';
import {
  getDatastoreSpaceCriticalEvents,
  getDatastoreSpaceLowEvents,
  getVmCreatedEvents,
  getVmDeletedEvents,
  getVmPoweredOnEvents,
  getVmPoweredOffEvents,
  getVmSuspendedEvents,
  getVmRestartedEvents,
  getVmCpuCriticalEvents,
  getVmMemoryCriticalEvents,
  getVmReconfiguredEvents,
  getVmClonedEvents,
  getVmMigratedEvents,
  getSnapshotCreatedEvents,
  getSnapshotDeletedEvents,
  getSnapshotRevertedEvents,
} from './vmware';

/**
 * Maps alarm codes to their dedicated, type-safe query functions.
 *
 * ── FortiGate CMDB Diff (CONFIG_ACCESS alarms) ───────────────────────────────
 * FortiGate v7.2.11 does NOT support REST log querying (/monitor/log/event → 404).
 * CONFIG_ACCESS alarms use CMDB diff: poll /api/v2/cmdb/* and compare state.
 *
 * ── FortiAnalyzer Cache (log-based alarms) ────────────────────────────────────
 * Security, VPN, DNS alarms use FA event cache as before.
 *
 * ── FortiGate Real-Time (SSLVPN source alarms) ────────────────────────────────
 * VPN_LOGIN_OFF_HOURS and SSLVPN_BUSINESS_HOURS use source: 'fortigate-sslvpn'
 * and are evaluated separately by evaluateFortiGateSslvpnAlarm().
 */
export const ALARM_QUERY_REGISTRY = new Map<string, AlarmQueryFn>([
  // ── Config & Access ──────────────────────────────────────────────────────────
  // NOTE: CMDB diff alarms (FW_POLICY_CHANGED, ADDRESS_OBJECT_CHANGED, CORE_CONFIG_CHANGE,
  // NEW_VIP, NEW_ADMIN_USER, ADMIN_PASSWORD_CHANGED, ADMIN_PRIVILEGE_CHANGE,
  // ROUTE_TABLE_CHANGED, IPSEC_TUNNEL_CHANGED, SSL_VPN_SETTINGS_CHANGED,
  // AUTH_SERVER_CHANGED, INTERFACE_CONFIG_CHANGED, ADDRESS_GROUP_CHANGED) were
  // disabled intentionally — Config Revisions page already surfaces admin config
  // changes natively from FortiAnalyzer cached_events with full user/IP context.
  // Keeping CMDB queries registered here would create duplicate noise without
  // user attribution. CMDB snapshot polling is retained for Config Backups only.

  // ── Config & Access (FortiAnalyzer cache — FA log-based, v7.2.11 fallback) ───
  ['FIRMWARE_CHANGE',          getFirmwareChangeEvents],
  ['SD_WAN_CHANGED',           getSdWanChangeEvents],
  ['HA_CONFIG_CHANGED',        getHaConfigChangeEvents],
  ['ADMIN_CONFIG_CHANGE',      getAdminConfigChangeEvents],

  // ── VPN (FortiAnalyzer cache) ───────────────────────────────────────────────
  ['VPN_BRUTE_FORCE',          getVpnBruteForceEvents],
  ['SSLVPN_AUTH_FAILED',       getSslvpnAuthFailedEvents],
  ['SSLVPN_MULTI_FAIL',        getSslvpnAuthFailedEvents],  // Same query, different threshold (3 vs 1)
  ['SSLVPN_LOCKOUT',           getSslvpnLockoutEvents],
  ['SSLVPN_TUNNEL_UP',         getSslvpnTunnelUpEvents],
  ['SSLVPN_TUNNEL_DOWN',       getSslvpnTunnelDownEvents],

  // ── Authentication (FortiAnalyzer cache — no FG log API on v7.2.11) ─────────
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

  // ── NMS / SNMP (Prisma nmsInterface / nmsHealthMetric — no FA fallback) ─────
  // NMS alarms query Prisma tables populated by the Python NMS service,
  // NOT FortiAnalyzer logs. FA fallback returns [] (NMS data is never in FA).
  ['NMS_PORT_DOWN',             getNmsPortDownEvents],
  ['NMS_DEVICE_UNREACHABLE',    getNmsDeviceUnreachableEvents],
  ['NMS_BACKUP_FAILED',         getNmsBackupFailedEvents],     // Stub — not yet implemented

  // ── VMware / vCenter (cached_events source=vmware — no FA fallback) ──────────
  // VMware alarms use cached_events with rawLog.source='vmware' JSONB filter.
  // The current detection engine path (evaluateVMwareAlarm) calls vmwareService
  // directly; these registry entries ensure performLogSearch() never falls
  // through to generic FA log queries for VMware-sourced alarms.
  ['DATASTORE_SPACE_CRITICAL',  getDatastoreSpaceCriticalEvents],
  ['DATASTORE_SPACE_LOW',       getDatastoreSpaceLowEvents],
  ['VM_CREATED',                getVmCreatedEvents],
  ['VM_DELETED',                getVmDeletedEvents],
  ['VM_POWERED_ON',             getVmPoweredOnEvents],
  ['VM_POWERED_OFF',            getVmPoweredOffEvents],
  ['VM_SUSPENDED',              getVmSuspendedEvents],
  ['VM_RESTARTED',              getVmRestartedEvents],
  ['VM_CPU_CRITICAL',           getVmCpuCriticalEvents],
  ['VM_MEMORY_CRITICAL',        getVmMemoryCriticalEvents],
  ['VM_RECONFIGURED',           getVmReconfiguredEvents],
  ['VM_CLONED',                 getVmClonedEvents],
  ['VM_MIGRATED',               getVmMigratedEvents],
  ['SNAPSHOT_CREATED',          getSnapshotCreatedEvents],
  ['SNAPSHOT_DELETED',          getSnapshotDeletedEvents],
  ['SNAPSHOT_REVERTED',         getSnapshotRevertedEvents],
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
