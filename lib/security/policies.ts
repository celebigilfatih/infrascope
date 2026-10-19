import { FirewallIntegrationError } from '@/lib/firewall/errors';

export interface SecurityPolicy {
  policyId: number; position: number; name: string | null; comment: string | null;
  action: string | null; enabled: boolean | null; nat: boolean | null; logging: string | null;
  sourceInterfaces: string[] | null; destinationInterfaces: string[] | null;
  sourceAddresses: string[] | null; destinationAddresses: string[] | null; services: string[] | null;
  schedule: string | null; hitCount: string | null; lastUsedAt: string | null;
}
export type PolicyScope = { configId: string; vdom: string; host: string };
export type PolicySnapshot = { rows: SecurityPolicy[]; collectedAt: string };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : null;
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const state = (v: unknown) => v === 'enable' ? true : v === 'disable' ? false : null;
const names = (v: unknown): string[] | null => Array.isArray(v) && v.every(item => object(item) && text(item.name)) ? v.map(item => (item as { name: string }).name.trim()) : null;
export function policyCounter(v: unknown): string | null {
  if (count(v)) return String(v);
  return typeof v === 'string' && /^(0|[1-9]\d*)$/.test(v) && v.length <= 78 ? v : null;
}
export function policyCounterLabel(value: string | null): string { return value === null ? 'Bilgi yok' : BigInt(value).toLocaleString('tr-TR'); }
export function policyDate(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(v) || !Number.isFinite(Date.parse(v))) return null;
  const [y, m, d] = v.slice(0, 10).split('-').map(Number), day = new Date(Date.UTC(y, m - 1, d));
  return day.getUTCFullYear() === y && day.getUTCMonth() === m - 1 && day.getUTCDate() === d ? new Date(v).toISOString() : null;
}
export function normalizeSecurityPolicies(value: unknown): SecurityPolicy[] {
  if (!Array.isArray(value)) throw new FirewallIntegrationError('INVALID_RESPONSE', 'Policy list missing', false, 502);
  const rows = value.map((row, index) => {
    if (!object(row) || !count(row.policyid)) throw new FirewallIntegrationError('INVALID_RESPONSE', 'Policy identity missing', false, 502);
    return { policyId: row.policyid, position: index + 1, name: text(row.name), comment: text(row.comments), action: text(row.action), enabled: state(row.status), nat: state(row.nat), logging: text(row.logtraffic), sourceInterfaces: names(row.srcintf), destinationInterfaces: names(row.dstintf), sourceAddresses: names(row.srcaddr), destinationAddresses: names(row.dstaddr), services: names(row.service), schedule: text(row.schedule), hitCount: policyCounter(row.hit_count), lastUsedAt: policyDate(row.last_used) };
  });
  if (new Set(rows.map(row => row.policyId)).size !== rows.length) throw new FirewallIntegrationError('INVALID_RESPONSE', 'Duplicate policy identity', false, 502);
  return rows;
}
export function parsePolicySnapshot(value: unknown, scope: PolicyScope): PolicySnapshot {
  if (!object(value) || value.success !== true || value.source !== 'fortigate-rest' || !object(value.target) || !['configId', 'vdom', 'host'].every(key => value.target && (value.target as Record<string, unknown>)[key] === scope[key as keyof PolicyScope]) || !policyDate(value.collectedAt) || Date.parse(String(value.collectedAt)) > Date.now() + 5000 || !Array.isArray(value.data)) throw Error('Seçili cihaz ve VDOM için politika verisi doğrulanamadı.');
  const rows = value.data.map((row, index) => {
    if (!object(row) || !count(row.policyId) || row.position !== index + 1 || !['name', 'comment', 'action', 'logging', 'schedule'].every(key => row[key] === null || typeof row[key] === 'string') || !['enabled', 'nat'].every(key => row[key] === null || typeof row[key] === 'boolean') || !['sourceInterfaces', 'destinationInterfaces', 'sourceAddresses', 'destinationAddresses', 'services'].every(key => row[key] === null || Array.isArray(row[key]) && (row[key] as unknown[]).every(item => typeof item === 'string' && item.trim())) || !(row.hitCount === null || typeof row.hitCount === 'string' && policyCounter(row.hitCount) === row.hitCount) || !(row.lastUsedAt === null || policyDate(row.lastUsedAt))) throw Error('Politika kaydı beklenen biçimde alınamadı.');
    return row as unknown as SecurityPolicy;
  });
  if (new Set(rows.map(row => row.policyId)).size !== rows.length) throw Error('Politika kimlikleri doğrulanamadı.');
  return { rows, collectedAt: String(value.collectedAt) };
}
export function policyActionLabel(value: string | null): string { return value === 'accept' ? 'İzin ver' : value === 'deny' ? 'Engelle' : value ? `Diğer işlem: ${value}` : 'İşlem bilgisi yok'; }
export function policyScheduleLabel(value: string | null): string { return value === 'always' ? 'Her zaman' : value || 'Zamanlama bilgisi yok'; }
export function policyLoggingLabel(value: string | null): string { return value === 'all' ? 'Tüm trafik' : value === 'utm' ? 'Güvenlik olayları' : value === 'disable' ? 'Kapalı' : value ? `Diğer kayıt ayarı: ${value}` : 'Bilgi yok'; }
export function policyNameLabel(value: string, kind: 'addresses' | 'interfaces' | 'services'): string { return kind === 'addresses' && value === 'all' ? 'Tüm adresler (all)' : kind === 'services' && value === 'ALL' ? 'Tüm hizmetler (ALL)' : kind === 'interfaces' && value === 'any' ? 'Tüm arabirimler (any)' : value; }
