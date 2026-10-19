import type { FortiGateService } from '@/lib/integrations/fortigate';
import { classifyFortiGateError, FirewallIntegrationError } from './errors';
import { firewallDateValue, object } from './workspace';
import { paginateFirewallItems, type FirewallListQuery } from './read-query';

export type VipUsage = 'referenced' | 'no-direct-reference' | 'unknown';
export interface VipPolicy { id: number | null; name: string | null; enabled: boolean | null; action: string | null }
export interface VirtualIp { name: string; comment: string | null; type: string | null; external: string | null; internal: string[]; interface: string | null; externalPort: string | null; internalPort: string | null; protocol: string | null; portForward: boolean | null; enabled: boolean | null; usage: VipUsage; policies: VipPolicy[] }
export interface VipWorkspace { items: VirtualIp[]; pagination: { page: number; limit: number; total: number; hasMore: boolean }; summary: { total: number; portForward: number; referenced: number | null; unknownState: number }; interfaces: string[]; usageAvailable: boolean; usageErrorCode: string | null; usageAt: string | null }
const text = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : null;
const enabled = (v: unknown) => v === 'enable' ? true : v === 'disable' ? false : null;
const port = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 65535 ? String(v) : typeof v === 'string' && v.trim() ? v.trim() : null;
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export const vipTypeLabel = (type: string | null) => ({ 'static-nat': 'Statik NAT', 'server-load-balance': 'Yük dengeleme', 'dns-translation': 'DNS çevirisi', fqdn: 'Alan adı eşlemesi' }[type || ''] || 'Tür bilgisi yok');
export const vipUsageLabel = (usage: VipUsage) => ({ referenced: 'Politikada eşleşiyor', 'no-direct-reference': 'Doğrudan eşleşme yok', unknown: 'Kullanım bilgisi yok' }[usage]);
export function normalizeVirtualIps(value: unknown, policies: unknown): VirtualIp[] {
  if (!Array.isArray(value) || !value.every(object)) throw new FirewallIntegrationError('INVALID_RESPONSE', 'Invalid virtual IP list', false, 502);
  const known = Array.isArray(policies) && policies.every(row => object(row) && Array.isArray(row.dstaddr) && row.dstaddr.every(address => object(address) && typeof address.name === 'string'));
  const refs = new Map<string, VipPolicy[]>();
  if (known) for (const policy of policies as Record<string, unknown>[]) {
    for (const name of new Set((policy.dstaddr as { name: string }[]).map(address => address.name))) {
      const entries = refs.get(name) || [];
      entries.push({ id: count(policy.policyid) ? policy.policyid : null, name: text(policy.name), enabled: enabled(policy.status), action: text(policy.action) }); refs.set(name, entries);
    }
  }
  const rows = value.map(row => {
    const name = text(row.name); if (!name) throw new FirewallIntegrationError('INVALID_RESPONSE', 'Virtual IP identity missing', false, 502);
    const matches = refs.get(name) || [];
    return { name, comment: text(row.comment), type: text(row.type), external: text(row.extip), internal: Array.isArray(row.mappedip) ? row.mappedip.flatMap(value => object(value) && text(value.range) ? [text(value.range)!] : []) : [], interface: text(row.extintf), externalPort: port(row.extport), internalPort: port(row.mappedport), protocol: text(row.protocol), portForward: enabled(row.portforward), enabled: enabled(row.status), usage: known ? matches.length ? 'referenced' as const : 'no-direct-reference' as const : 'unknown' as const, policies: matches };
  });
  if (new Set(rows.map(row => row.name)).size !== rows.length) throw new FirewallIntegrationError('INVALID_RESPONSE', 'Duplicate virtual IP identity', false, 502);
  return rows;
}
export function buildVipWorkspace(rows: VirtualIp[], query: FirewallListQuery, usageErrorCode: string | null = null, usageAt: string | null = null): VipWorkspace {
  const usageAvailable = !usageErrorCode && rows.every(row => row.usage !== 'unknown');
  const result = paginateFirewallItems({ items: rows, query,
    searchText: row => [row.name, row.comment, row.external, ...row.internal, row.interface, row.externalPort, row.internalPort, row.protocol].filter(Boolean).join(' '),
    filter: (row, filters) => (!filters.status || (row.enabled === null ? 'unknown' : row.enabled ? 'enable' : 'disable') === filters.status) && (!filters.portforward || (row.portForward === null ? 'unknown' : row.portForward ? 'enable' : 'disable') === filters.portforward) && (!filters.usage || row.usage === filters.usage) && (!filters.interface || row.interface?.toLowerCase() === filters.interface),
  });
  return { ...result, summary: { total: rows.length, portForward: rows.filter(row => row.portForward === true).length, referenced: usageAvailable ? rows.filter(row => row.usage === 'referenced').length : null, unknownState: rows.filter(row => row.enabled === null).length }, interfaces: [...new Set(rows.flatMap(row => row.interface ? [row.interface] : []))].sort(), usageAvailable, usageErrorCode, usageAt };
}
export async function readVipWorkspace(service: Pick<FortiGateService, 'fetchVIPs' | 'fetchFirewallPolicies'>, query: FirewallListQuery): Promise<VipWorkspace> {
  const vips = await service.fetchVIPs({ requireEnabled: true });
  let policies: unknown = null, error: string | null = null, at: string | null = null;
  try { policies = await service.fetchFirewallPolicies({ requireEnabled: true }); at = new Date().toISOString(); }
  catch (failure) { error = classifyFortiGateError(failure).code; }
  const rows = normalizeVirtualIps(vips, policies);
  if (!error && (!Array.isArray(policies) || !policies.every(row => object(row) && Array.isArray(row.dstaddr) && row.dstaddr.every(address => object(address) && typeof address.name === 'string')))) { error = 'INVALID_RESPONSE'; at = null; }
  return buildVipWorkspace(rows, query, error, at);
}
export function parseVipWorkspace(value: unknown): VipWorkspace {
  if (!object(value) || !Array.isArray(value.items) || !object(value.pagination) || !object(value.summary) || !Array.isArray(value.interfaces) || !value.interfaces.every(v => typeof v === 'string') || typeof value.usageAvailable !== 'boolean') throw Error('Sanal IP listesi beklenen biçimde alınamadı.');
  const { pagination: p, summary: s } = value;
  if (!count(p.page) || p.page < 1 || !count(p.limit) || p.limit < 1 || p.limit > 100 || !count(p.total) || p.total < value.items.length || typeof p.hasMore !== 'boolean' || !count(s.total) || s.total < p.total || !count(s.portForward) || s.portForward > s.total || !count(s.unknownState) || s.unknownState > s.total || !(s.referenced === null || count(s.referenced) && s.referenced <= s.total) || (value.usageAvailable ? !count(s.referenced) || !firewallDateValue(value.usageAt) : s.referenced !== null)) throw Error('Sanal IP sayıları doğrulanamadı.');
  const items = value.items.map(row => {
    if (!object(row) || !text(row.name) || !['comment', 'type', 'external', 'interface', 'externalPort', 'internalPort', 'protocol'].every(key => row[key] === null || typeof row[key] === 'string') || !Array.isArray(row.internal) || !row.internal.every(v => typeof v === 'string') || !(row.enabled === true || row.enabled === false || row.enabled === null) || !(row.portForward === true || row.portForward === false || row.portForward === null) || !['referenced', 'no-direct-reference', 'unknown'].includes(String(row.usage)) || !Array.isArray(row.policies) || !row.policies.every(policy => object(policy) && (policy.id === null || count(policy.id)) && (policy.name === null || typeof policy.name === 'string') && (policy.action === null || typeof policy.action === 'string') && (policy.enabled === true || policy.enabled === false || policy.enabled === null)) || (value.usageAvailable ? row.usage === 'unknown' : row.usage !== 'unknown') || (row.usage === 'referenced' ? !row.policies.length : row.policies.length !== 0)) throw Error('Sanal IP eşlemeleri doğrulanamadı.');
    return row as unknown as VirtualIp;
  });
  if (new Set(items.map(row => row.name)).size !== items.length) throw Error('Sanal IP kimlikleri doğrulanamadı.');
  return { items, pagination: p as unknown as VipWorkspace['pagination'], summary: s as unknown as VipWorkspace['summary'], interfaces: value.interfaces as string[], usageAvailable: value.usageAvailable, usageErrorCode: text(value.usageErrorCode), usageAt: firewallDateValue(value.usageAt) };
}
