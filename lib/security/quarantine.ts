import { FirewallIntegrationError } from '@/lib/firewall/errors';

export interface QuarantineRecord {
  id: string; ip: string; ipv6?: string; created: string | null; expires: string | null;
  source: string; service: string; comment: string; status: string; vdom: string; interface: string;
}
export type QuarantineResult = { rows: QuarantineRecord[]; collectedAt: string; writeAllowed: boolean; writeReason: string };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown) => typeof v === 'string' ? v.trim() : '';
export function quarantineIpValid(value: unknown): value is string {
  if (typeof value !== 'string' || value !== value.trim() || !value || value.includes('%')) return false;
  if (!value.includes(':')) return /^\d{1,3}(\.\d{1,3}){3}$/.test(value) && value.split('.').every(part => Number(part) <= 255 && (part === '0' || !part.startsWith('0')));
  if (!/^[0-9a-f:.]+$/i.test(value)) return false;
  try { return new URL(`http://[${value}]/`).hostname.startsWith('['); } catch { return false; }
}
export function quarantineHasIp(rows: QuarantineRecord[], ip: string): boolean {
  const key = (value: string) => quarantineIpValid(value) ? value.includes(':') ? new URL(`http://[${value}]/`).hostname.toLowerCase() : value : null;
  const expected = key(ip);
  return expected !== null && rows.some(row => key(row.ip) === expected);
}
export function quarantineFresh(collectedAt: string, now = Date.now()): boolean {
  const age = now - Date.parse(collectedAt);
  return Number.isFinite(age) && age >= -5000 && age < 120000;
}
function epoch(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  const date = new Date(value * 1000); return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
export function normalizeQuarantine(value: unknown): QuarantineRecord[] {
  if (!Array.isArray(value)) throw new FirewallIntegrationError('INVALID_RESPONSE', 'Quarantine list missing', false, 502);
  return value.map((entry, index) => {
    if (!object(entry)) throw new FirewallIntegrationError('INVALID_RESPONSE', 'Invalid quarantine record', false, 502);
    const ip = text(entry.ip_address) || text(entry.ip_v4_address) || text(entry.ip_v6_address);
    if (!quarantineIpValid(ip)) throw new FirewallIntegrationError('INVALID_RESPONSE', 'Quarantine IP missing or invalid', false, 502);
    return { id: `${text(entry.vd)}:${ip}:${index}`, ip, ipv6: text(entry.ipv6) || undefined,
      created: epoch(entry.created), expires: epoch(entry.expires), source: text(entry.source), service: text(entry.service),
      comment: text(entry.comment), status: text(entry.status), vdom: text(entry.vd), interface: text(entry.interface) };
  });
}
export function quarantineExpiry(row: Pick<QuarantineRecord, 'expires'>, now = Date.now()): 'unknown' | 'expired' | 'soon' | 'scheduled' {
  if (!row.expires || !Number.isFinite(Date.parse(row.expires))) return 'unknown';
  const diff = Date.parse(row.expires) - now;
  return diff <= 0 ? 'expired' : diff <= 86400000 ? 'soon' : 'scheduled';
}
export function quarantineRemaining(row: Pick<QuarantineRecord, 'expires'>, now = Date.now()): string {
  const state = quarantineExpiry(row, now);
  if (state === 'unknown') return 'Bitiş zamanı bilinmiyor';
  if (state === 'expired') return 'Bitiş zamanı geçti';
  const minutes = Math.ceil((Date.parse(row.expires!) - now) / 60000);
  if (minutes < 60) return `${minutes} dakika kaldı`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} saat${minutes % 60 ? ` ${minutes % 60} dakika` : ''} kaldı`;
  return `${Math.floor(minutes / 1440)} gün${Math.floor(minutes % 1440 / 60) ? ` ${Math.floor(minutes % 1440 / 60)} saat` : ''} kaldı`;
}
export function quarantineSource(source: string): string {
  const s = source.toLowerCase();
  if (s === 'manual') return 'Elle eklenen';
  if (s === 'ips' || s.includes('intrusion')) return 'Saldırı önleme (IPS)';
  if (s === 'av' || s.includes('virus')) return 'Antivirüs';
  if (s.includes('dos')) return 'Hizmet engelleme (DoS)';
  return source || 'Kaynak bilgisi yok';
}
export function quarantineWriteReason(code: unknown): string {
  if (code === 'feature-disabled') return 'Karantina değişiklikleri sistem ayarlarında kapalı. Kayıtları salt okunur olarak inceleyebilirsiniz.';
  if (code === 'admin-required') return 'Karantinaya ekleme ve karantinadan çıkarma işlemleri için sistem yöneticisi yetkisi gerekir.';
  if (code === 'authentication-required') return 'İşlem yapmak için yeniden oturum açın.';
  return 'Değişiklik yetkisi doğrulanamadı. Kayıtları salt okunur olarak inceleyebilirsiniz.';
}
export function parseQuarantineResult(value: unknown, scope: { configId: string; vdom: string; host?: string }): QuarantineResult {
  if (!object(value) || value.success !== true || !object(value.target) || value.target.configId !== scope.configId || value.target.vdom !== scope.vdom || scope.host !== undefined && value.target.host !== scope.host || value.source !== 'fortigate-rest' || typeof value.collectedAt !== 'string' || !Number.isFinite(Date.parse(value.collectedAt)) || Date.parse(value.collectedAt) > Date.now() + 5000 || !Array.isArray(value.data) || !object(value.writeAccess) || typeof value.writeAccess.allowed !== 'boolean') throw Error('Seçili cihaz ve VDOM için karantina verisi doğrulanamadı.');
  const rows = value.data.map(row => {
    if (!object(row) || !quarantineIpValid(row.ip) || !['id', 'source', 'service', 'comment', 'status', 'vdom', 'interface'].every(key => typeof row[key] === 'string') || !['created', 'expires'].every(key => row[key] === null || typeof row[key] === 'string' && Number.isFinite(Date.parse(row[key]))) || row.vdom && row.vdom !== scope.vdom) throw Error('Karantina kaydı veya VDOM bilgisi doğrulanamadı.');
    return row as unknown as QuarantineRecord;
  });
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw Error('Karantina kayıt kimlikleri doğrulanamadı.');
  return { rows, collectedAt: value.collectedAt, writeAllowed: value.writeAccess.allowed, writeReason: value.writeAccess.allowed ? '' : quarantineWriteReason(value.writeAccess.code) };
}
