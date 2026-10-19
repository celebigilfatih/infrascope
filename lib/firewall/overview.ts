import type { FirewallCapability, FirewallListItem } from '@/components/firewall/types';
import { firewallDateValue, firewallErrorMessage, object, parseFirewallList } from './workspace';
export const firewallSourceLabels: Record<string, string> = { 'fortigate-rest': 'FortiGate REST', snmp: 'SNMP', ssh: 'SSH', fortianalyzer: 'FortiAnalyzer', 'event-cache': 'Olay önbelleği', database: 'Kayıtlı envanter' };
export type OverviewEnvelope<T> = { data: T | null; source: string; status: 'available' | 'stale' | 'unavailable'; at: string | null; error: string };
export type OverviewSystem = { hostname: string | null; model: string | null; serial: string | null; version: string | null; cpu: number | null; memory: number | null; sessions: number | null; sessionPercent: number | null; haEnabled: boolean | null; haRole: string | null; peerSerial: string | null; license: { status: string | null; support: string | null; expires: string | null }; sdwan: Array<{ name: string; link: boolean | null; rx: number | null; tx: number | null }> | null };
export type OverviewSnmp = { cpu: number | null; memory: number | null; uptime: number | null; temperature: number | null };
export type OverviewInterface = { id: string; name: string; alias: string | null; ip: string | null; link: boolean | null; speed: number | null; rx: number | null; tx: number | null; errors: number | null };
export type OverviewVpn = { name: string; remote: string | null; ip: string | null; interface: string | null; seconds: number | null; twoFactor: boolean | null; rx: number | null; tx: number | null };
export type OverviewPage<T> = { items: T[]; page: number; total: number; hasMore: boolean };
export const overviewNumber = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const count = (value: unknown) => Number.isSafeInteger(value) ? overviewNumber(value) : null;
export const overviewPercent = (value: unknown) => overviewNumber(value) !== null && Number(value) <= 100 ? Number(value) : null;
const text = (value: unknown): string | null => typeof value === 'string' && value.trim() && !['unknown', 'n/a', '-'].includes(value.toLowerCase()) ? value.trim() : null;
const boolean = (value: unknown) => typeof value === 'boolean' ? value : null;
export function parseOverviewTargets(value: unknown): FirewallListItem[] {
  return parseFirewallList(value).map(row => {
    if (row.id && (!row.device || typeof row.device.id !== 'string' || !row.device.id)) throw Error('Güvenlik duvarının envanter eşleştirmesi okunamadı.');
    return { ...row, monitoring: row.monitoring ? { ...row.monitoring, sources: Array.isArray(row.monitoring.sources) ? row.monitoring.sources.filter(s => s && Object.prototype.hasOwnProperty.call(firewallSourceLabels, s.source) && ['available', 'stale', 'unavailable', 'unconfigured'].includes(s.status)) : [] } : null };
  });
}
export function parseOverviewEnvelope<T>(value: unknown, target: FirewallListItem, parse: (data: unknown, source: string) => T): OverviewEnvelope<T> {
  if (!object(value) || value.success !== true || !object(value.target) || value.target.connectorId !== target.id || value.target.deviceId !== target.device?.id || value.target.vdom !== target.vdom || (value.target.configId !== undefined && value.target.configId !== target.configId) || !['available', 'stale', 'unavailable'].includes(String(value.status)) || typeof value.source !== 'string' || !Object.prototype.hasOwnProperty.call(firewallSourceLabels, value.source)) throw Error('Seçili cihaz ve VDOM için veri doğrulanamadı.');
  const status = value.status as OverviewEnvelope<T>['status'], at = firewallDateValue(value.collectedAt);
  if (status !== 'unavailable' && !at) throw Error('Verinin ölçüm zamanı doğrulanamadı.');
  return { data: status === 'unavailable' ? null : parse(value.data, value.source), source: value.source, status, at, error: status === 'available' ? '' : status === 'stale' ? 'Kaynağa güncel erişim sağlanamadı; önceki kayıt gösteriliyor.' : firewallErrorMessage(value.errorCode) };
}
export function parseOverviewSystem(value: unknown): OverviewSystem {
  if (!object(value) || value.connected !== true) throw Error('Cihazın sistem durumu doğrulanamadı.');
  const session = object(value.session) ? value.session : {}, ha = object(value.ha) ? value.ha : {}, license = object(value.license) ? value.license : {}, sdwan = object(value.sdwan) ? value.sdwan : {};
  return { hostname: text(value.hostname), model: text(value.model), serial: text(value.serial), version: text(value.version), cpu: overviewPercent(value.cpu), memory: overviewPercent(value.memory), sessions: count(session.current), sessionPercent: overviewPercent(session.percent), haEnabled: boolean(ha.enabled), haRole: ha.enabled === true ? text(ha.role) : null, peerSerial: text(ha.serial), license: { status: text(license.status), support: text(license.support), expires: typeof license.expires === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(license.expires) && Number.isFinite(Date.parse(license.expires)) ? license.expires : null }, sdwan: Array.isArray(sdwan.interfaces) ? sdwan.interfaces.filter(object).map(row => ({ name: text(row.name) || 'Adı belirtilmemiş', link: row.link === 'up' ? true : row.link === 'down' ? false : null, rx: overviewNumber(row.rx_bandwidth), tx: overviewNumber(row.tx_bandwidth) })) : null };
}
export function parseOverviewSnmp(value: unknown): OverviewSnmp {
  if (!object(value) || value.reachable !== true) throw Error('SNMP ölçümü doğrulanamadı.');
  return { cpu: overviewPercent(value.cpuUsage), memory: overviewPercent(value.memoryUsage), uptime: overviewNumber(value.uptimeSeconds), temperature: typeof value.temperature === 'number' && Number.isFinite(value.temperature) ? value.temperature : null };
}
function parsePage(value: unknown) {
  if (!object(value) || !Array.isArray(value.items) || !object(value.pagination) || !value.items.every(object) || !Number.isSafeInteger(value.pagination.page) || Number(value.pagination.page) < 1 || count(value.pagination.total) === null || typeof value.pagination.hasMore !== 'boolean') throw Error('Liste ve sayfalama bilgileri okunamadı.');
  return { items: value.items as Record<string, unknown>[], page: Number(value.pagination.page), total: Number(value.pagination.total), hasMore: value.pagination.hasMore };
}
export function parseOverviewInterfaces(value: unknown, source: string): OverviewPage<OverviewInterface> {
  const page = parsePage(value), historical = source === 'database';
  return { ...page, items: page.items.map((row, index) => { const rxErrors = count(row.rxErrors), txErrors = count(row.txErrors); return { id: String(row.id ?? index), name: text(row.name) || 'Adı belirtilmemiş', alias: text(row.alias), ip: text(row.ipAddress), link: historical ? null : boolean(row.linkUp), speed: historical ? null : overviewNumber(row.speed), rx: historical ? null : count(row.rxBytes), tx: historical ? null : count(row.txBytes), errors: historical || rxErrors === null || txErrors === null ? null : rxErrors + txErrors }; }) };
}
export function parseOverviewVpn(value: unknown): OverviewPage<OverviewVpn> {
  const page = parsePage(value);
  return { ...page, items: page.items.map(row => ({ name: text(row.user_name) || 'Adı belirtilmemiş', remote: text(row.remote_host), ip: text(row.aip), interface: text(row.interface), seconds: overviewNumber(row.duration), twoFactor: boolean(row.two_factor_auth), rx: count(row.in_bytes), tx: count(row.out_bytes) })) };
}
export function parseOverviewPolicyCount(value: unknown): number { return parsePage(value).total; }
export function overviewMetric(rest: OverviewEnvelope<OverviewSystem> | null, snmp: OverviewEnvelope<OverviewSnmp> | null, key: 'cpu' | 'memory') {
  const candidates = [rest, snmp].filter((item): item is NonNullable<typeof item> => Boolean(item?.data && item.data[key] !== null));
  const chosen = candidates.find(item => item.status === 'available') || candidates[0];
  return { value: chosen?.data?.[key] ?? null, source: chosen?.source || null, status: chosen?.status || null, at: chosen?.at || null };
}
export function overviewNumberLabel(value: number | null | undefined, suffix = '') { return value === null || value === undefined ? 'Bilgi yok' : `${value.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}${suffix}`; }
export function overviewBytes(value: number | null) { if (value === null) return 'Bilgi yok'; const units = ['B', 'KB', 'MB', 'GB', 'TB'], index = Math.min(4, Math.floor(Math.log(Math.max(1, value)) / Math.log(1000))); return `${(value / 1000 ** index).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${units[index]}`; }
export function overviewDuration(seconds: number | null) { if (seconds === null) return 'Bilgi yok'; const whole = Math.floor(seconds); return whole >= 86400 ? `${Math.floor(whole / 86400)} gün ${Math.floor(whole % 86400 / 3600)} sa.` : whole >= 3600 ? `${Math.floor(whole / 3600)} sa. ${Math.floor(whole % 3600 / 60)} dk.` : `${Math.floor(whole / 60)} dk. ${whole % 60} sn.`; }
export function overviewRecordedSources(row: FirewallListItem): FirewallCapability[] { return row.monitoring?.sources || []; }
export async function requestOverviewJson(url: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const controller = new AbortController(), abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
  const timer = setTimeout(abort, 60_000), fallback = 'Güvenlik duvarı verileri alınamadı. Yeniden deneyin.';
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store', credentials: 'same-origin' }), value: unknown = await response.json();
    if (response.status === 401) throw Error('Oturumunuz sona ermiş olabilir. Yeniden giriş yapın.');
    if (response.status === 403) throw Error('Bu veriyi görüntüleme yetkiniz bulunmuyor.');
    if (!response.ok || !object(value) || value.success !== true) throw Error(fallback);
    if (controller.signal.aborted) throw Error(fallback);
    return value;
  } catch (error) { if (error instanceof Error && [fallback, 'Oturumunuz sona ermiş olabilir. Yeniden giriş yapın.', 'Bu veriyi görüntüleme yetkiniz bulunmuyor.'].includes(error.message)) throw error; throw Error(fallback); }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
