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
import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';

const log = createLogger('fortigate-cmdb');

// Maps CMDB endpoint paths to FortiAnalyzer cfgpath values stored in cached_events.
// FortiGate uses dot-separated cfgpath (e.g. 'firewall.policy') while CMDB endpoints
// use slash-separated paths (e.g. '/cmdb/firewall/policy').
function endpointToCfgpath(endpoint: string): string {
  // Strip leading '/cmdb/' and replace '/' with '.'
  return endpoint.replace(/^\/cmdb\//, '').replace(/\//g, '.');
}

/**
 * Look up which admin user(s) made changes matching the given CMDB endpoint
 * in the last `windowMs` milliseconds. Queries `cached_events.rawLog.cfgpath`.
 * Returns deduplicated list of { user, ui } records sorted by most-recent first.
 */
async function resolveAdminUsers(
  cfgpath: string,
  windowMs = 60 * 60 * 1000, // 1 hour
): Promise<Array<{ user: string; ui: string; cfgobj: string; eventTime: Date }>> {
  try {
    const cutoff = new Date(Date.now() - windowMs);
    // Use raw SQL via Prisma for JSONB path filter on rawLog->>'cfgpath'
    const rows = await prisma.$queryRaw<Array<{
      user: string | null;
      ui: string | null;
      cfgobj: string | null;
      eventTime: Date;
    }>>`
      SELECT "user", "rawLog"->>'ui' AS ui, "rawLog"->>'cfgobj' AS cfgobj, "eventTime"
      FROM cached_events
      WHERE "rawLog"->>'cfgpath' = ${cfgpath}
        AND "eventTime" >= ${cutoff}
      ORDER BY "eventTime" DESC
      LIMIT 20
    `;
    return rows
      .filter(r => r.user)
      .map(r => ({
        user: r.user as string,
        ui: r.ui || '',
        cfgobj: r.cfgobj || '',
        eventTime: r.eventTime,
      }));
  } catch {
    return [];
  }
}

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
 *   Includes detailed diff information (added/removed/modified items)
 */
async function cmdbDiff(
  ctx: AlarmQueryContext,
  endpoint: string,
  description: string,
): Promise<QueryResult> {
  const start = Date.now();

  const fg = getFortiGateService();
  if (!fg) {
    log.warn({ alarmCode: ctx.alarmCode }, 'FortiGate service not available');
    return emptyResult(ctx, description);
  }

  const { changed, isFirstRun, current } = await fg.getCmdbChanges(endpoint);

  const durationMs = Date.now() - start;

  if (isFirstRun) {
    log.info({ alarmCode: ctx.alarmCode, endpoint }, 'CMDB snapshot initialized — first run, no alarm');
    return emptyResult(ctx, `${description} [first-run]`, durationMs);
  }

  if (!changed) {
    log.info({ alarmCode: ctx.alarmCode, durationMs, endpoint }, 'CMDB no change');
    return emptyResult(ctx, description, durationMs);
  }

  // Change detected — compute detailed diff
  const count = Array.isArray(current) ? current.length : 1;
  log.info({ alarmCode: ctx.alarmCode, durationMs, endpoint, count }, 'CMDB CHANGE detected');

  // Get previous snapshot data for detailed diff
  const fgService = getFortiGateService();
  const previousSnapshot = fgService?.getCmdbSnapshot(endpoint);
  
  // Extract the actual items array — previous snapshot may be wrapped in API response
  const prevData = previousSnapshot?.data;
  const prevItems = Array.isArray(prevData)
    ? prevData
    : (prevData?.results && Array.isArray(prevData.results) ? prevData.results : null);
  const currItems = Array.isArray(current)
    ? current
    : (current?.results && Array.isArray(current.results) ? current.results : null);
  
  let diffDetails: any = null;
  if (prevItems && currItems) {
    log.info({ alarmCode: ctx.alarmCode, prevItems: prevItems.length, currItems: currItems.length }, 'Computing diff');
    diffDetails = computeArrayDiff(prevItems, currItems);
    log.info({ alarmCode: ctx.alarmCode, added: diffDetails.added.length, removed: diffDetails.removed.length, modified: diffDetails.modified.length }, 'Diff result');
  } else {
    log.warn({ alarmCode: ctx.alarmCode, hasPrevItems: !!prevItems, hasCurrItems: !!currItems, prevType: typeof prevData, currType: typeof current }, 'Cannot compute diff');
  }

  // ── Enrich with admin user info from FortiAnalyzer cached_events ──────────
  // FortiAnalyzer records config-change events with user, ui (e.g. GUI(10.7.7.7))
  // and cfgpath (e.g. 'firewall.policy'). We correlate these with the CMDB diff
  // timestamp to identify who made the change, then store in the alarm rawData.
  const cfgpath = endpointToCfgpath(endpoint);
  const adminRows = await resolveAdminUsers(cfgpath, 60 * 60 * 1000);

  // Deduplicate: one entry per user, include all affected objects and UI
  const adminMap = new Map<string, { user: string; ui: string; objects: Set<string> }>();
  for (const row of adminRows) {
    if (!adminMap.has(row.user)) {
      adminMap.set(row.user, { user: row.user, ui: row.ui, objects: new Set() });
    }
    const entry = adminMap.get(row.user)!;
    // Prefer non-ha_daemon UI (ha_daemon is internal replication, not the actual admin source)
    if (row.ui && !row.ui.startsWith('ha_daemon') && !entry.ui) {
      entry.ui = row.ui;
    }
    if (row.cfgobj) entry.objects.add(row.cfgobj);
  }

  const adminUsers = [...adminMap.values()].map(e => ({
    user: e.user,
    ui: e.ui,
    objects: [...e.objects].slice(0, 5),
  }));

  if (adminUsers.length > 0) {
    log.info({ alarmCode: ctx.alarmCode, adminUsers: adminUsers.map(u => u.user) }, 'Enriched with admin user(s)');
  }

  return {
    events: [{
      endpoint,
      description,
      itemCount: count,
      detectedAt: new Date().toISOString(),
      source: 'fortigate-cmdb-diff',
      itime_t: Math.floor(Date.now() / 1000), // Unix timestamp for parseLogTime
      diffDetails, // Include detailed diff in the event
      // Who made the change (from FortiAnalyzer audit logs)
      admin_users: adminUsers,         // full list with ui + objects
      admin_user: adminUsers[0]?.user ?? null,  // convenience: primary user
      admin_ui: adminUsers[0]?.ui ?? null,      // convenience: primary access method
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

/**
 * Compute detailed diff between two arrays of CMDB objects.
 * Returns { added, removed, modified } with item details.
 */
function computeArrayDiff(
  previous: any[],
  current: any[],
): { added: any[]; removed: any[]; modified: any[] } {
  // Use 'policyid' or 'name' or 'id' as the unique key
  const getKey = (item: any): string => {
    return String(item.policyid || item.name || item.id || JSON.stringify(item));
  };

  const prevMap = new Map<string, any>();
  const currMap = new Map<string, any>();

  for (const item of previous) {
    prevMap.set(getKey(item), item);
  }
  for (const item of current) {
    currMap.set(getKey(item), item);
  }

  const added: any[] = [];
  const removed: any[] = [];
  const modified: any[] = [];

  // Find added and modified items
  for (const [key, currItem] of currMap) {
    const prevItem = prevMap.get(key);
    if (!prevItem) {
      // New item added
      added.push({
        key,
        name: currItem.name || `#${currItem.policyid || currItem.id}`,
        data: currItem,
      });
    } else if (JSON.stringify(prevItem) !== JSON.stringify(currItem)) {
      // Item modified - find what changed
      const changes = findObjectChanges(prevItem, currItem);
      if (changes.length > 0) {
        modified.push({
          key,
          name: currItem.name || `#${currItem.policyid || currItem.id}`,
          changes,
        });
      }
    }
  }

  // Find removed items
  for (const [key, prevItem] of prevMap) {
    if (!currMap.has(key)) {
      removed.push({
        key,
        name: prevItem.name || `#${prevItem.policyid || prevItem.id}`,
        data: prevItem,
      });
    }
  }

  return { added, removed, modified };
}

/**
 * Find specific field changes between two objects.
 * Returns array of { field, oldValue, newValue } for changed fields.
 */
function findObjectChanges(oldObj: any, newObj: any): Array<{ field: string; oldValue: any; newValue: any }> {
  const changes: Array<{ field: string; oldValue: any; newValue: any }> = [];
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

  for (const key of allKeys) {
    // Skip internal/verbose fields
    if (key.startsWith('q_') || key === 'uuid' || key === 'obj name' || key === 'obj seq') continue;
    
    const oldVal = oldObj[key];
    const newVal = newObj[key];
    
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({
        field: key,
        oldValue: oldVal,
        newValue: newVal,
      });
    }
  }

  return changes;
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

  log.info({ alarmCode: ctx.alarmCode, durationMs, changedEndpoints }, 'CORE CONFIG CHANGE detected');
  return {
    events: [{
      changedEndpoints,
      detectedAt: new Date().toISOString(),
      source: 'fortigate-cmdb-diff',
      itime_t: Math.floor(Date.now() / 1000), // Unix timestamp for parseLogTime
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
