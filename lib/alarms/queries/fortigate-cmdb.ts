/**
 * Alarm Query Layer — FortiGate CMDB Diff Detection
 *
 * Polls FortiGate CMDB (REST API) endpoints and compares current state
 * to the last known snapshot. Fires when configuration changes are detected.
 *
 * Why CMDB diff instead of logs?
 *  - FortiGate v7.2.11 does NOT support /monitor/log/event (404)
 *  - CMDB endpoints (/api/v2/cmdb/*) are fully supported on v7.2.11
 *  - CMDB diff is more reliable: no log filtering, no FA dependency
 *  - First alarm cycle always initializes snapshot without firing (no false positives)
 *
 * Endpoints verified working on v7.2.11 (HTTP 200):
 *   /cmdb/firewall/policy, /cmdb/firewall/vip, /cmdb/system/admin,
 *   /cmdb/router/static, /cmdb/vpn.ipsec/phase1-interface, /cmdb/vpn.ssl/settings,
 *   /cmdb/user/ldap, /cmdb/system/interface, /cmdb/firewall/address,
 *   /cmdb/firewall/addrgrp, /cmdb/system/accprofile
 *
 * Endpoints NOT available on v7.2.11 (400):
 *   /cmdb/firewall/service/group, /cmdb/firewall/central-nat
 *
 * Covers 13 CONFIG_ACCESS alarms:
 *   FW_POLICY_CHANGED, NEW_VIP, NEW_ADMIN_USER, ADMIN_PASSWORD_CHANGED,
 *   ADMIN_PRIVILEGE_CHANGE, ROUTE_TABLE_CHANGED, IPSEC_TUNNEL_CHANGED,
 *   SSL_VPN_SETTINGS_CHANGED, AUTH_SERVER_CHANGED, INTERFACE_CONFIG_CHANGED,
 *   ADDRESS_OBJECT_CHANGED, ADDRESS_GROUP_CHANGED, CORE_CONFIG_CHANGE
 */

import type { AlarmQueryContext, QueryResult } from './types';

// ─── Helper ────────────────────────────────────────────────────────────────────

function getFortiGateService() {
  const engine = (globalThis as any).__detectionEngine;
  return engine?.fortiGateService ?? null;
}

function emptyResult(ctx: AlarmQueryContext, description: string, durationMs = 0): QueryResult {
  return {
    events: [],
    stats: {
      alarmCode: ctx.alarmCode,
      source: 'cache' as const,
      eventCount: 0,
      durationMs,
      usedFallback: false,
      queryDescription: `CMDB: ${description}`,
    },
  };
}

/**
 * Core CMDB diff check.
 * - On first run: initializes snapshot, returns empty result (no alarm)
 * - On subsequent runs: returns 1 synthetic event if the endpoint state changed
 */
async function cmdbDiff(
  ctx: AlarmQueryContext,
  endpoint: string,
  description: string,
): Promise<QueryResult> {
  const start = Date.now();

  const fg = getFortiGateService();
  if (!fg) {
    console.warn(`[AlarmQuery] ${ctx.alarmCode}: FortiGate service not available`);
    return emptyResult(ctx, description);
  }

  const { changed, isFirstRun, current } = await fg.getCmdbChanges(endpoint);

  const durationMs = Date.now() - start;

  if (isFirstRun) {
    console.log(`[AlarmQuery] ${ctx.alarmCode}: CMDB snapshot initialized (${endpoint}) — first run, no alarm`);
    return emptyResult(ctx, `${description} [first-run]`, durationMs);
  }

  if (!changed) {
    console.log(`[AlarmQuery] ${ctx.alarmCode}: CMDB no change (${durationMs}ms) | ${endpoint}`);
    return emptyResult(ctx, description, durationMs);
  }

  // Change detected — produce a synthetic event so the detection engine fires the alarm
  const count = Array.isArray(current) ? current.length : 1;
  console.log(`[AlarmQuery] ${ctx.alarmCode}: CMDB CHANGE detected (${durationMs}ms) | ${endpoint} | items: ${count}`);

  return {
    events: [{
      rawLog: {
        endpoint,
        description,
        itemCount: count,
        detectedAt: new Date().toISOString(),
        source: 'fortigate-cmdb-diff',
      },
      timestamp: Date.now() / 1000,
    }],
    stats: {
      alarmCode: ctx.alarmCode,
      source: 'cache' as const,
      eventCount: 1,
      durationMs,
      usedFallback: false,
      queryDescription: `CMDB diff: ${description}`,
    },
  };
}

// ─── CONFIG_ACCESS Alarm Functions ─────────────────────────────────────────────

/** FW_POLICY_CHANGED — Firewall policy add/edit/delete */
export async function cmdbFirewallPolicyChanged(ctx: AlarmQueryContext): Promise<QueryResult> {
  return cmdbDiff(ctx, '/cmdb/firewall/policy', 'firewall/policy');
}

/** NEW_VIP — New Virtual IP (DNAT) created */
export async function cmdbNewVip(ctx: AlarmQueryContext): Promise<QueryResult> {
  return cmdbDiff(ctx, '/cmdb/firewall/vip', 'firewall/vip');
}

/** NEW_ADMIN_USER — New admin user created */
export async function cmdbNewAdminUser(ctx: AlarmQueryContext): Promise<QueryResult> {
  return cmdbDiff(ctx, '/cmdb/system/admin', 'system/admin (new user)');
}

/** ADMIN_PASSWORD_CHANGED — Admin password changes (detected via admin object hash change) */
export async function cmdbAdminPasswordChanged(ctx: AlarmQueryContext): Promise<QueryResult> {
  return cmdbDiff(ctx, '/cmdb/system/admin', 'system/admin (password change)');
}

/** ADMIN_PRIVILEGE_CHANGE — Access profile / accprofile changes */
export async function cmdbAdminPrivilegeChange(ctx: AlarmQueryContext): Promise<QueryResult> {
  return cmdbDiff(ctx, '/cmdb/system/accprofile', 'system/accprofile');
}

/** ROUTE_TABLE_CHANGED — Static routing table modifications */
export async function cmdbRouteTableChanged(ctx: AlarmQueryContext): Promise<QueryResult> {
  return cmdbDiff(ctx, '/cmdb/router/static', 'router/static');
}

/** IPSEC_TUNNEL_CHANGED — IPsec phase1 interface configuration changes */
export async function cmdbIpsecTunnelChanged(ctx: AlarmQueryContext): Promise<QueryResult> {
  return cmdbDiff(ctx, '/cmdb/vpn.ipsec/phase1-interface', 'vpn.ipsec/phase1-interface');
}

/** SSL_VPN_SETTINGS_CHANGED — SSL-VPN global settings changes */
export async function cmdbSslVpnSettingsChanged(ctx: AlarmQueryContext): Promise<QueryResult> {
  return cmdbDiff(ctx, '/cmdb/vpn.ssl/settings', 'vpn.ssl/settings');
}

/** AUTH_SERVER_CHANGED — LDAP / RADIUS authentication server changes */
export async function cmdbAuthServerChanged(ctx: AlarmQueryContext): Promise<QueryResult> {
  return cmdbDiff(ctx, '/cmdb/user/ldap', 'user/ldap');
}

/** INTERFACE_CONFIG_CHANGED — Network interface configuration changes */
export async function cmdbInterfaceConfigChanged(ctx: AlarmQueryContext): Promise<QueryResult> {
  return cmdbDiff(ctx, '/cmdb/system/interface', 'system/interface');
}

/** ADDRESS_OBJECT_CHANGED — Firewall address object edits */
export async function cmdbAddressObjectChanged(ctx: AlarmQueryContext): Promise<QueryResult> {
  return cmdbDiff(ctx, '/cmdb/firewall/address', 'firewall/address');
}

/** ADDRESS_GROUP_CHANGED — Firewall address group edits */
export async function cmdbAddressGroupChanged(ctx: AlarmQueryContext): Promise<QueryResult> {
  return cmdbDiff(ctx, '/cmdb/firewall/addrgrp', 'firewall/addrgrp');
}

/**
 * CORE_CONFIG_CHANGE — Any core configuration change.
 * Polls the most critical endpoints: policy, admin, VIP, routing, VPN.
 * Fires if ANY of them changes.
 */
export async function cmdbCoreConfigChange(ctx: AlarmQueryContext): Promise<QueryResult> {
  const fg = getFortiGateService();
  if (!fg) return emptyResult(ctx, 'core config (all)');

  const start = Date.now();
  const coreEndpoints = [
    '/cmdb/firewall/policy',
    '/cmdb/system/admin',
    '/cmdb/firewall/vip',
    '/cmdb/router/static',
    '/cmdb/vpn.ipsec/phase1-interface',
    '/cmdb/vpn.ssl/settings',
  ];

  let anyChanged = false;
  let anyFirstRun = false;
  const changedEndpoints: string[] = [];

  for (const ep of coreEndpoints) {
    const { changed, isFirstRun } = await fg.getCmdbChanges(ep);
    if (isFirstRun) anyFirstRun = true;
    if (changed) { anyChanged = true; changedEndpoints.push(ep); }
  }

  const durationMs = Date.now() - start;

  if (anyFirstRun) {
    return emptyResult(ctx, 'core config [first-run]', durationMs);
  }

  if (!anyChanged) {
    return emptyResult(ctx, 'core config (no change)', durationMs);
  }

  console.log(`[AlarmQuery] ${ctx.alarmCode}: CORE CONFIG CHANGE detected (${durationMs}ms) | ${changedEndpoints.join(', ')}`);
  return {
    events: [{
      rawLog: {
        changedEndpoints,
        detectedAt: new Date().toISOString(),
        source: 'fortigate-cmdb-diff',
      },
      timestamp: Date.now() / 1000,
    }],
    stats: {
      alarmCode: ctx.alarmCode,
      source: 'cache' as const,
      eventCount: 1,
      durationMs,
      usedFallback: false,
      queryDescription: `CMDB diff: core config [${changedEndpoints.join(', ')}]`,
    },
  };
}
