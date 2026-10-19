import { FirewallIntegrationError } from '@/lib/firewall/errors';

export type IpsecState = 'up' | 'down' | 'partial' | 'unknown';
export interface IpsecTunnel {
  id: string; name: string; comment: string | null; parent: string | null; username: string | null;
  remoteGateway: string | null; tunnelId: string | null; tunnelId6: string | null;
  state: IpsecState; phases: Array<{ name: string | null; state: 'up' | 'down' | 'unknown' }> | null;
  incoming: string | null; outgoing: string | null; connections: string | null;
  local: { configName: string; interface: string | null; gateways: string[]; ikeVersion: string | null; type: string | null } | null;
}
export interface IpsecSnapshot { rows: IpsecTunnel[]; monitorAt: string; configAt: string | null; configErrorCode: string | null }
export type IpsecScope = { configId: string; vdom: string; host: string };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : null;
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const date = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T.+(Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
export function ipsecCounter(v: unknown): string | null { return count(v) ? String(v) : typeof v === 'string' && /^(0|[1-9]\d*)$/.test(v) && v.length <= 78 ? v : null; }
export function ipsecCountLabel(v: string | null): string { return v === null ? 'Bilgi yok' : BigInt(v).toLocaleString('tr-TR'); }
export function ipsecBytes(v: string | null): string {
  if (v === null) return 'Bilgi yok';
  const n = BigInt(v), units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
  let index = 0, divisor = 1n; while (index < units.length - 1 && n >= divisor * 1024n) { index++; divisor *= 1024n; }
  if (!index) return `${n.toLocaleString('tr-TR')} B`;
  const rounded = (n * 100n + divisor / 2n) / divisor, fraction = String(rounded % 100n).padStart(2, '0').replace(/0+$/, '');
  return `${(rounded / 100n).toLocaleString('tr-TR')}${fraction ? ',' + fraction : ''} ${units[index]}`;
}
export function ipsecState(phases: IpsecTunnel['phases']): IpsecState {
  if (!phases?.length) return 'unknown';
  const up = phases.filter(p => p.state === 'up').length, down = phases.filter(p => p.state === 'down').length;
  return up && down ? 'partial' : up === phases.length ? 'up' : down === phases.length ? 'down' : 'unknown';
}
export const ipsecStateLabel = (v: IpsecState) => ({ up: 'Bağlı', down: 'Bağlı değil', partial: 'Kısmen bağlı', unknown: 'Durum bilgisi yok' }[v]);
function gateway(v: unknown): string | null {
  const value = text(v); if (!value || ['0.0.0.0', '::', '0:0:0:0:0:0:0:0'].includes(value)) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value) && value.split('.').every(p => Number(p) <= 255 && (p === '0' || !p.startsWith('0')))) return value;
  try {
    if (value.includes(':') && /^[0-9a-fA-F:.]+$/.test(value)) {
      const host = new URL(`http://[${value}]/`).hostname;
      if (host.startsWith('[') && host !== '[::]') return value;
    }
  } catch { /* Unsupported source address. */ }
  return null;
}
function configurations(value: unknown): Map<string, NonNullable<IpsecTunnel['local']>> {
  if (!Array.isArray(value)) throw Error('Missing IPsec configuration list');
  const result = new Map<string, NonNullable<IpsecTunnel['local']>>();
  for (const row of value) {
    if (!object(row) || !text(row.name) || result.has(text(row.name)!)) throw Error('Invalid IPsec configuration identity');
    const name = text(row.name)!;
    result.set(name, { configName: name, interface: text(row.interface), gateways: [...new Set([gateway(row['local-gw']), gateway(row['local-gw6'])].filter((v): v is string => !!v))], ikeVersion: ['1', '2'].includes(String(row['ike-version'])) ? String(row['ike-version']) : null, type: text(row.type) });
  }
  return result;
}
export function buildIpsecSnapshot(monitor: unknown, config: unknown, metadata: Omit<IpsecSnapshot, 'rows'>): IpsecSnapshot {
  if (!Array.isArray(monitor)) throw new FirewallIntegrationError('INVALID_RESPONSE', 'IPsec monitor list missing', false, 502);
  let locals = new Map<string, NonNullable<IpsecTunnel['local']>>(), configErrorCode = metadata.configErrorCode, configAt = metadata.configAt;
  if (!configErrorCode) try { locals = configurations(config); } catch { configErrorCode = 'INVALID_RESPONSE'; configAt = null; }
  const rows = monitor.map(row => {
    if (!object(row) || !text(row.name)) throw new FirewallIntegrationError('INVALID_RESPONSE', 'IPsec tunnel identity missing', false, 502);
    const name = text(row.name)!, parent = text(row.parent), remoteGateway = gateway(row.rgwy);
    const phases = Array.isArray(row.proxyid) ? row.proxyid.map(p => ({ name: object(p) ? text(p.p2name) || text(p.name) : null, state: object(p) && p.status === 'up' ? 'up' as const : object(p) && p.status === 'down' ? 'down' as const : 'unknown' as const })) : null;
    const tunnelId = text(row.tun_id), tunnelId6 = text(row.tun_id6);
    return { id: JSON.stringify([name, parent, remoteGateway, tunnelId, tunnelId6, ipsecCounter(row.dialup_index)]), name, comment: text(row.comments), parent, username: text(row.username), remoteGateway, tunnelId, tunnelId6, phases, state: ipsecState(phases), incoming: ipsecCounter(row.incoming_bytes), outgoing: ipsecCounter(row.outgoing_bytes), connections: ipsecCounter(row.connection_count), local: locals.get(parent || name) || null };
  });
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new FirewallIntegrationError('INVALID_RESPONSE', 'Duplicate IPsec tunnel identity', false, 502);
  return { rows, monitorAt: metadata.monitorAt, configAt, configErrorCode };
}
export function parseIpsecSnapshot(value: unknown, scope: IpsecScope): IpsecSnapshot {
  if (!object(value) || value.success !== true || value.source !== 'fortigate-rest' || !object(value.target) || value.target.configId !== scope.configId || value.target.vdom !== scope.vdom || value.target.host !== scope.host || !object(value.data) || !Array.isArray(value.data.rows) || !date(value.data.monitorAt) || Date.parse(value.data.monitorAt) > Date.now() + 5000 || !(value.data.configAt === null || date(value.data.configAt) && Date.parse(value.data.configAt) <= Date.now() + 5000) || !(value.data.configErrorCode === null || typeof value.data.configErrorCode === 'string') || value.data.configErrorCode !== null && value.data.configAt !== null) throw Error('Seçili cihaz ve VDOM için IPsec verisi doğrulanamadı.');
  const rows = value.data.rows.map(row => {
    if (!object(row) || !text(row.id) || !text(row.name) || !['comment', 'parent', 'username', 'remoteGateway', 'tunnelId', 'tunnelId6'].every(key => row[key] === null || typeof row[key] === 'string') || !['incoming', 'outgoing', 'connections'].every(key => row[key] === null || typeof row[key] === 'string' && ipsecCounter(row[key]) === row[key]) || !(row.phases === null || Array.isArray(row.phases) && row.phases.every(p => object(p) && (p.name === null || typeof p.name === 'string') && ['up', 'down', 'unknown'].includes(String(p.state)))) || row.state !== ipsecState(row.phases as IpsecTunnel['phases']) || !(row.local === null || object(row.local) && text(row.local.configName) && ['interface', 'ikeVersion', 'type'].every(key => (row.local as Record<string, unknown>)[key] === null || typeof (row.local as Record<string, unknown>)[key] === 'string') && Array.isArray(row.local.gateways) && row.local.gateways.every(v => gateway(v) === v)) || value.data && (value.data as Record<string, unknown>).configErrorCode !== null && row.local !== null) throw Error('IPsec bağlantı ayrıntıları doğrulanamadı.');
    return row as unknown as IpsecTunnel;
  });
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw Error('IPsec kayıt kimlikleri doğrulanamadı.');
  return { rows, monitorAt: value.data.monitorAt, configAt: value.data.configAt as string | null, configErrorCode: value.data.configErrorCode as string | null };
}
