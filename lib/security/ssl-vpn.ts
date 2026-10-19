import { FirewallIntegrationError } from '@/lib/firewall/errors';
import { ipsecCounter as vpnCounter, ipsecBytes as vpnBytes } from './ipsec';

export interface SslVpnSession {
  id: string; username: string | null; sourceAddress: string | null; interface: string | null;
  loginAt: string | null; durationSeconds: number | null; twoFactor: boolean | null;
  children: Array<{ address: string | null; incoming: string | null; outgoing: string | null }> | null;
  incoming: string | null; outgoing: string | null;
}
export type SslVpnScope = { configId: string; vdom: string; host: string };
export interface SslVpnSnapshot { rows: SslVpnSession[]; collectedAt: string }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : null;
const integer = (v: unknown): number | null => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : typeof v === 'string' && /^(0|[1-9]\d*)$/.test(v) && Number.isSafeInteger(Number(v)) ? Number(v) : null;
const date = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T.+(Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
function loginDate(v: unknown): string | null { const seconds = integer(v); if (!seconds || seconds > 8640000000000) return null; const d = new Date(seconds * 1000); return Number.isFinite(d.getTime()) ? d.toISOString() : null; }
export function sslVpnSum(values: Array<string | null>): string | null { return values.some(v => v === null) ? null : values.reduce((sum, v) => sum + BigInt(v!), 0n).toString(); }
export function sslVpnDuration(seconds: number | null): string {
  if (seconds === null) return 'Bilgi yok';
  const days = Math.floor(seconds / 86400), hours = Math.floor(seconds % 86400 / 3600), minutes = Math.floor(seconds % 3600 / 60), rest = seconds % 60;
  return [days && `${days.toLocaleString('tr-TR')} gün`, hours && `${hours} saat`, minutes && `${minutes} dakika`, (rest || !seconds) && `${rest} saniye`].filter(Boolean).join(' ');
}
export const sslVpnFactorLabel = (v: boolean | null) => v === true ? 'Doğrulama var' : v === false ? 'Doğrulama yok' : 'Bilgi yok';
export function sslVpnAddresses(row: SslVpnSession): string[] | null { return row.children === null ? null : [...new Set(row.children.flatMap(c => c.address ? [c.address] : []))]; }
export function normalizeSslVpn(value: unknown, collectedAt: string): SslVpnSnapshot {
  if (!Array.isArray(value)) throw new FirewallIntegrationError('INVALID_RESPONSE', 'SSL-VPN session list missing', false, 502);
  const rows = value.map((row, index) => {
    if (!object(row)) throw new FirewallIntegrationError('INVALID_RESPONSE', 'Invalid SSL-VPN session record', false, 502);
    const children = Array.isArray(row.subsessions) ? row.subsessions.map(c => ({ address: object(c) ? text(c.aip) : null, incoming: object(c) ? vpnCounter(c.in_bytes) : null, outgoing: object(c) ? vpnCounter(c.out_bytes) : null })) : null;
    const username = text(row.user_name), sourceAddress = text(row.remote_host), loginAt = loginDate(row.last_login_timestamp), iface = text(row.interface);
    return { id: JSON.stringify([username, sourceAddress, loginAt, iface, index]), username, sourceAddress, loginAt, interface: iface, durationSeconds: integer(row.duration), twoFactor: typeof row.two_factor_auth === 'boolean' ? row.two_factor_auth : null, children, incoming: children?.length ? sslVpnSum(children.map(c => c.incoming)) : null, outgoing: children?.length ? sslVpnSum(children.map(c => c.outgoing)) : null };
  });
  return { rows, collectedAt };
}
export function sslVpnSummary(rows: SslVpnSession[]) {
  return { records: rows.length, users: rows.some(row => row.username === null) ? null : new Set(rows.map(row => row.username)).size, incoming: sslVpnSum(rows.map(row => row.incoming)), outgoing: sslVpnSum(rows.map(row => row.outgoing)) };
}
export function parseSslVpnSnapshot(value: unknown, scope: SslVpnScope): SslVpnSnapshot {
  if (!object(value) || value.success !== true || value.source !== 'fortigate-rest' || !object(value.target) || value.target.configId !== scope.configId || value.target.vdom !== scope.vdom || value.target.host !== scope.host || !object(value.data) || !Array.isArray(value.data.rows) || !date(value.data.collectedAt) || Date.parse(value.data.collectedAt) > Date.now() + 5000) throw Error('Seçili cihaz ve VDOM için SSL-VPN verisi doğrulanamadı.');
  const rows = value.data.rows.map(row => {
    if (!object(row) || !text(row.id) || !['username', 'sourceAddress', 'interface'].every(key => row[key] === null || typeof row[key] === 'string' && text(row[key])) || !(row.loginAt === null || date(row.loginAt)) || !(row.durationSeconds === null || typeof row.durationSeconds === 'number' && integer(row.durationSeconds) === row.durationSeconds) || !(row.twoFactor === null || typeof row.twoFactor === 'boolean') || !['incoming', 'outgoing'].every(key => row[key] === null || typeof row[key] === 'string' && /^(0|[1-9]\d*)$/.test(row[key])) || !(row.children === null || Array.isArray(row.children) && row.children.every(c => object(c) && (c.address === null || typeof c.address === 'string') && ['incoming', 'outgoing'].every(key => c[key] === null || typeof c[key] === 'string' && vpnCounter(c[key]) === c[key])))) throw Error('SSL-VPN oturum ayrıntıları doğrulanamadı.');
    const r = row as unknown as SslVpnSession;
    if (r.incoming !== (r.children?.length ? sslVpnSum(r.children.map(c => c.incoming)) : null) || r.outgoing !== (r.children?.length ? sslVpnSum(r.children.map(c => c.outgoing)) : null)) throw Error('SSL-VPN trafik toplamları doğrulanamadı.');
    return r;
  });
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw Error('SSL-VPN kayıt kimlikleri doğrulanamadı.');
  return { rows, collectedAt: value.data.collectedAt };
}
function csvCell(value: string): string { const safe = /^[\s\u0000-\u001f]*[=+\-@]/.test(value) ? "'" + value : value; return `"${safe.replace(/"/g, '""')}"`; }
export function sslVpnCsv(rows: SslVpnSession[], meta: SslVpnScope & { collectedAt: string; historical: boolean }): string {
  const headers = ['Kullanıcı', 'Kaynak adresi', 'Tünel/hedef IP adresleri', 'Arabirim', 'Giriş zamanı (UTC)', 'Oturum süresi (saniye)', 'İki aşamalı doğrulama', 'Alınan veri (bayt)', 'Gönderilen veri (bayt)', 'Alt bağlantı sayısı', 'Bağlantı kimliği', 'VDOM', 'Cihaz adresi', 'Okuma zamanı (UTC)', 'Veri durumu'];
  const values = rows.map(row => [row.username || 'Bilgi yok', row.sourceAddress || 'Bilgi yok', sslVpnAddresses(row)?.join(' | ') || 'Bilgi yok', row.interface || 'Bilgi yok', row.loginAt || 'Bilgi yok', row.durationSeconds === null ? 'Bilgi yok' : String(row.durationSeconds), sslVpnFactorLabel(row.twoFactor), row.incoming ?? 'Bilgi yok', row.outgoing ?? 'Bilgi yok', row.children === null ? 'Bilgi yok' : String(row.children.length), meta.configId, meta.vdom, meta.host, meta.collectedAt, meta.historical ? 'Önceki veri' : 'Son başarılı okuma']);
  return '\ufeff' + [headers, ...values].map(row => row.map(csvCell).join(';')).join('\r\n');
}
export { vpnBytes as sslVpnBytes };
