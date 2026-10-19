import { object, firewallDateValue } from './workspace';
export interface ConfigEvent { id: string; at: string | null; user: string | null; action: string | null; message: string | null; ip: string | null; path: string | null; object: string | null; vdom: string; deviceId: string }
export interface ConfigEvents { items: ConfigEvent[]; total: number; truncated: boolean }
export interface ConfigVersion { id: string; type: string; file: string; at: string | null; bytes: number | null; checksum: string | null; description: string | null }
export interface ConfigVersions { items: ConfigVersion[]; canRead: boolean }
export type DiffLine = { kind: 'same' | 'added' | 'removed'; text: string; before: number | null; after: number | null };
const text = (v: unknown) => typeof v === 'string' && v.trim() ? v : null;
export const configActions: Record<string, string> = { edit: 'Düzenleme', add: 'Ekleme', delete: 'Silme', move: 'Taşıma', clone: 'Kopyalama', rename: 'Yeniden adlandırma', 'config-change': 'Yapılandırma değişikliği', backup: 'Yedekleme', restore: 'Geri yükleme', upgrade: 'Güncelleme', reboot: 'Yeniden başlatma', shutdown: 'Kapatma' };
export const configActionLabel = (v: string | null) => v ? configActions[v.toLowerCase()] || 'Diğer işlem' : 'İşlem belirtilmemiş';
export function parseConfigEvents(value: unknown): ConfigEvents {
  if (!object(value) || !Array.isArray(value.items) || !object(value.pagination) || !Number.isSafeInteger(value.pagination.total) || Number(value.pagination.total) < value.items.length || !value.items.every(object)) throw Error('Değişiklik kayıtları beklenen biçimde alınamadı.');
  if (value.items.some(row => row.category !== 'config')) throw Error('Yapılandırma olayı kapsamı doğrulanamadı.');
  const items = value.items.map(row => ({ id: text(row.id) || '', at: firewallDateValue(row.occurredAt), user: text(row.user), action: text(row.action), message: text(row.message), ip: text(row.sourceIp), path: text(row.configPath), object: text(row.configObject), deviceId: text(row.deviceId) || '', vdom: text(row.vdom) || '' }));
  // Invalid times stay unknown and sort after dated events, never become "now".
  items.sort((a, b) => (b.at ? Date.parse(b.at) : -Infinity) - (a.at ? Date.parse(a.at) : -Infinity));
  return { items, total: Number(value.pagination.total), truncated: value.pagination.hasMore === true || Number(value.pagination.total) > items.length };
}
export function scopedConfigEvents(value: unknown, analyzerId: string, vdom: string): ConfigEvents {
  const result = parseConfigEvents(value);
  if (result.items.some(row => row.deviceId !== analyzerId || row.vdom.toLowerCase() !== vdom.toLowerCase())) throw Error('Olay kayıtları seçili cihaz ve VDOM ile eşleşmiyor.');
  return result;
}
export function parseConfigVersions(value: unknown): ConfigVersions {
  if (!object(value) || !Array.isArray(value.backups) || !object(value.permissions)) throw Error('Kayıtlı sürümler okunamadı.');
  const items = value.backups.map(row => {
    if (!object(row) || !text(row.id) || !text(row.backupType)) throw Error('Sürüm bilgileri beklenen biçimde alınamadı.');
    const size = typeof row.sizeBytes === 'number' || typeof row.sizeBytes === 'string' && /^\d+$/.test(row.sizeBytes) ? Number(row.sizeBytes) : NaN;
    return { id: String(row.id), type: String(row.backupType), file: text(row.backupFile) || 'Dosya adı yok', at: firewallDateValue(row.createdAt), bytes: Number.isSafeInteger(size) && size >= 0 ? size : null, checksum: text(row.checksum), description: text(row.description) };
  });
  if (new Set(items.map(row => row.id)).size !== items.length) throw Error('Sürüm kimlikleri doğrulanamadı.');
  items.sort((a, b) => (b.at ? Date.parse(b.at) : -Infinity) - (a.at ? Date.parse(a.at) : -Infinity));
  // The existing API permits content reads to the same ADMIN/EDITOR roles as create.
  return { items, canRead: value.permissions.create === true };
}
export function configPairError(before?: ConfigVersion, after?: ConfigVersion) {
  if (!before || !after) return 'Karşılaştırmak için eski ve yeni sürümü seçin.';
  if (before.id === after.id) return 'İki farklı sürüm seçin.';
  if (before.type !== after.type) return 'Aynı yapılandırma türüne ait iki sürüm seçin.';
  if (!before.at || !after.at || Date.parse(before.at) >= Date.parse(after.at)) return 'Eski sürümün tarihi yeni sürümden önce olmalı.';
  return '';
}
export function parseConfigContent(value: unknown, expected: ConfigVersion): string {
  if (!object(value) || value.id !== expected.id || value.backupType !== expected.type || typeof value.configuration !== 'string' || !value.configuration || typeof value.checksum !== 'string' || !value.checksum || expected.checksum && value.checksum !== expected.checksum) throw Error('Sürüm içeriği veya dosya kimliği doğrulanamadı. Listeyi yenileyin.');
  if (value.configuration.length > 500_000) throw Error('Bu dosya tarayıcıda karşılaştırmak için çok büyük. Yapılandırma Yedekleri ekranından dosyaları indirin.');
  return value.configuration;
}
/** Bounded LCS: exact line additions/removals with original line numbers. No quadratic work on large files. */
export function compareConfigLines(before: string, after: string) {
  const split = (v: string) => v.replace(/\r\n/g, '\n').split('\n');
  const a = split(before), b = split(after), prefix: DiffLine[] = [], suffix: DiffLine[] = [];
  if (before.length > 500_000 || after.length > 500_000 || a.length > 20_000 || b.length > 20_000) throw Error('Dosyalar tarayıcıda karşılaştırmak için çok büyük. Yapılandırma Yedekleri ekranından dosyaları indirin.');
  let start = 0, ae = a.length, be = b.length;
  while (start < ae && start < be && a[start] === b[start]) { prefix.push({ kind: 'same', text: a[start], before: start + 1, after: start + 1 }); start++; }
  while (ae > start && be > start && a[ae - 1] === b[be - 1]) { suffix.push({ kind: 'same', text: a[ae - 1], before: ae, after: be }); ae--; be--; }
  const n = ae - start, m = be - start;
  if ((n + 1) * (m + 1) > 2_000_000) throw Error('Değişiklik kapsamı tarayıcıda karşılaştırmak için çok büyük. Yapılandırma Yedekleri ekranından dosyaları indirin.');
  const width = m + 1, lcs = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i * width + j] = a[start + i] === b[start + j] ? 1 + lcs[(i + 1) * width + j + 1] : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
  const lines = prefix; let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[start + i] === b[start + j]) { lines.push({ kind: 'same', text: a[start + i], before: start + ++i, after: start + ++j }); }
    else if (i < n && (j === m || lcs[(i + 1) * width + j] >= lcs[i * width + j + 1])) { lines.push({ kind: 'removed', text: a[start + i], before: start + ++i, after: null }); }
    else { lines.push({ kind: 'added', text: b[start + j], before: null, after: start + ++j }); }
  }
  lines.push(...suffix.reverse());
  return { lines, added: lines.filter(row => row.kind === 'added').length, removed: lines.filter(row => row.kind === 'removed').length };
}
export async function requestConfigJson(url: string, signal: AbortSignal): Promise<unknown> {
  const controller = new AbortController(), abort = () => controller.abort(); signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
  const timer = setTimeout(abort, 60_000);
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw Error(response.status === 401 ? 'Oturumunuz sona ermiş olabilir. Yeniden giriş yapın.' : response.status === 403 ? 'Bu bilgiyi görüntüleme yetkiniz yok.' : response.status === 404 ? 'Cihaz veya sürüm bulunamadı. Listeyi yenileyin.' : response.status === 409 ? 'Cihaz eşleştirmesi veya dosya bütünlüğü doğrulanamadı. Bağlantı ve yedek ayrıntılarını kontrol edin.' : 'Veriler alınamadı. Yeniden deneyin.');
    const value: unknown = await response.json();
    if (controller.signal.aborted || !object(value) || value.success === false) throw Error('Veriler alınamadı. Yeniden deneyin.');
    return value;
  } catch (error) {
    if (error instanceof Error && /^(Oturumunuz|Bu bilgiyi|Cihaz veya|Cihaz eşleştirmesi|Veriler alınamadı)/.test(error.message)) throw error;
    throw Error('Veriler alınamadı. Yeniden deneyin.');
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
}
