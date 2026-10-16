export interface WorkspaceSnapshot {
  id: string; name: string; description: string; createTime: string | null; state: string;
  fileKeys: number[] | null;
}
export interface SnapshotWorkspaceVM {
  id: string; name: string; template: boolean | null; connectionState: string; powerState: string;
  snapshots: WorkspaceSnapshot[]; files: Array<{ key: number; sizeBytes: number | null }> | null;
}
export interface SnapshotRow { vm: SnapshotWorkspaceVM; snapshot: WorkspaceSnapshot }
export interface SnapshotCapabilities { create: boolean; delete: boolean; revert: boolean }
export type SnapshotMutation = ({ action: 'snapshot-create'; vmId: string; name: string; description: string } | { action: 'snapshot-delete' | 'snapshot-revert'; vmId: string; snapshotId: string }) & { configId?: string };
export const DAY_MS = 86_400_000;
export function snapshotKey(row: SnapshotRow) { return JSON.stringify([row.vm.id, row.snapshot.id]); }
export function snapshotRows(vms: SnapshotWorkspaceVM[]): SnapshotRow[] { return vms.flatMap(vm => vm.snapshots.map(snapshot => ({ vm, snapshot }))); }
export function snapshotTimestamp(value: string | null) {
  return value && /(Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
}
export function snapshotDate(value: string | null) {
  const timestamp = snapshotTimestamp(value);
  return timestamp == null ? 'Tarih bilinmiyor' : new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Istanbul' }).format(timestamp);
}
export function snapshotAge(snapshot: WorkspaceSnapshot, now: number): { key: string; label: string; detail: string; tone: 'neutral' | 'success' | 'warning' | 'danger'; elapsed: number | null } {
  const created = snapshotTimestamp(snapshot.createTime);
  if (created == null || !Number.isFinite(now)) return { key: 'unknown', label: 'Yaş bilinmiyor', detail: 'Oluşturulma zamanı doğrulanamadı.', tone: 'neutral', elapsed: null };
  const elapsed = now - created;
  if (elapsed < 0) return { key: 'unknown', label: 'Gelecek tarih', detail: 'Kaynak ve uygulama saatlerini kontrol edin.', tone: 'neutral', elapsed: null };
  const days = Math.floor(elapsed / DAY_MS);
  const label = days ? `${days.toLocaleString('tr-TR')} gün` : elapsed >= 3_600_000 ? `${Math.floor(elapsed / 3_600_000)} saat` : elapsed >= 60_000 ? `${Math.floor(elapsed / 60_000)} dakika` : '1 dakikadan yeni';
  return { key: elapsed >= 30 * DAY_MS ? 'veryOld' : elapsed >= 7 * DAY_MS ? 'old' : 'recent', label, detail: elapsed >= 30 * DAY_MS ? '30 gün ve üzeri · Öncelikle gözden geçirin' : elapsed >= 7 * DAY_MS ? '7 gün ve üzeri · Gözden geçirin' : '7 günden yeni', tone: elapsed >= 30 * DAY_MS ? 'danger' : elapsed >= 7 * DAY_MS ? 'warning' : 'success', elapsed };
}
export function snapshotSize(row: SnapshotRow): number | null {
  if (!row.snapshot.fileKeys?.length || row.vm.files === null) return null;
  const files = new Map(row.vm.files.map(file => [file.key, file.sizeBytes]));
  let total = 0;
  for (const key of new Set(row.snapshot.fileKeys)) { const size = files.get(key); if (size == null) return null; total += size; }
  return total;
}
export function snapshotSizeTotal(rows: SnapshotRow[]) {
  const files = new Map<string, number | null>();
  let unknownSnapshots = 0;
  for (const row of rows) {
    if (snapshotSize(row) == null) unknownSnapshots++;
    const sizes = new Map(row.vm.files?.map(file => [file.key, file.sizeBytes]));
    row.snapshot.fileKeys?.forEach(key => files.set(JSON.stringify([row.vm.id, key]), sizes.get(key) ?? null));
  }
  const known = [...files.values()].filter((value): value is number => value != null);
  return { bytes: rows.length === 0 || known.length > 0 ? known.reduce((sum, value) => sum + value, 0) : null, unknownSnapshots };
}
export interface SnapshotFilters { search: string; vm: string; age: string; sort: string }
export function filterSnapshots(vms: SnapshotWorkspaceVM[], filters: SnapshotFilters, now: number) {
  const term = filters.search.trim().toLocaleLowerCase('tr-TR');
  const rows = snapshotRows(vms).filter(row => {
    const age = snapshotAge(row.snapshot, now);
    return (!term || [row.snapshot.name, row.snapshot.description, row.snapshot.id, row.vm.name, row.vm.id].some(value => value.toLocaleLowerCase('tr-TR').includes(term))) &&
      (filters.vm === 'all' || filters.vm === row.vm.id) && (filters.age === 'all' || filters.age === 'old' && age.elapsed != null && age.elapsed >= 7 * DAY_MS || filters.age === age.key);
  });
  const compare = (left: number | null, right: number | null, descending = false) => left == null ? right == null ? 0 : 1 : right == null ? -1 : descending ? right - left : left - right;
  return rows.sort((a, b) => (filters.sort === 'size' ? compare(snapshotSize(a), snapshotSize(b), true) : compare(snapshotTimestamp(a.snapshot.createTime), snapshotTimestamp(b.snapshot.createTime), filters.sort === 'newest')) || a.vm.id.localeCompare(b.vm.id) || a.snapshot.id.localeCompare(b.snapshot.id));
}
export function snapshotManageable(vm: SnapshotWorkspaceVM) { return vm.template === false && vm.connectionState === 'connected'; }
export function snapshotCreateOptions(vms: SnapshotWorkspaceVM[]) { return vms.filter(vm => snapshotManageable(vm) && ['poweredOn', 'poweredOff', 'suspended'].includes(vm.powerState)).sort((a, b) => a.name.localeCompare(b.name, 'tr-TR') || a.id.localeCompare(b.id)); }
export function validateSnapshotMutation(vms: SnapshotWorkspaceVM[], mutation: SnapshotMutation, capabilities: SnapshotCapabilities) {
  const vm = vms.find(vm => vm.id === mutation.vmId);
  if (!vm || !snapshotManageable(vm)) throw new Error('VM kaydı doğrulanamadı veya bağlantısı uygun değil. Verileri yenileyin.');
  if (mutation.action === 'snapshot-create') {
    if (!capabilities.create) throw new Error('Anlık görüntü oluşturma yetkiniz yok.');
    if (!snapshotCreateOptions([vm]).length || !mutation.name.trim()) throw new Error('Uygun bir VM seçin ve anlık görüntü adını girin.');
  } else {
    if (!(mutation.action === 'snapshot-delete' ? capabilities.delete : capabilities.revert)) throw new Error('Bu anlık görüntü işlemi için yetkiniz yok.');
    if (!vm.snapshots.some(snapshot => snapshot.id === mutation.snapshotId)) throw new Error('Anlık görüntü artık listede yok. Verileri yenileyin.');
  }
}
export async function requestSnapshotMutation(vms: SnapshotWorkspaceVM[], mutation: SnapshotMutation, capabilities: SnapshotCapabilities, fetcher: typeof fetch = fetch) {
  validateSnapshotMutation(vms, mutation, capabilities);
  const payload = mutation.action === 'snapshot-create' ? { ...mutation, name: mutation.name.trim() } : mutation;
  const response = await fetcher('/api/integrations/vmware', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const json = await response.json();
  if (!response.ok || json.success !== true) throw new Error(typeof json.error === 'string' ? json.error : 'Anlık görüntü işlemi vCenter tarafından kabul edilmedi.');
}
export function snapshotCsv(rows: SnapshotRow[], now: number) {
  const safe = (value: unknown) => { const text = String(value ?? ''); return `"${(/^[\s]*[=+\-@]/.test(text) ? "'" : '') + text.replace(/"/g, '""')}"`; };
  const utc = (value: string | null) => { const timestamp = snapshotTimestamp(value); return timestamp == null ? null : new Date(timestamp).toISOString(); };
  const headers = ['Anlık görüntü', 'Görüntü kimliği', 'Sanal makine', 'VM kimliği', 'Oluşturulma zamanı (UTC)', 'Oluşturulma zamanı (TSİ)', 'Yaş', 'Yaş değerlendirmesi', 'İlişkili dosya boyutu (bayt; satırlar arasında paylaşılabilir)', 'Açıklama'];
  return '\uFEFF' + [headers, ...rows.map(row => [row.snapshot.name, row.snapshot.id, row.vm.name, row.vm.id, utc(row.snapshot.createTime), snapshotDate(row.snapshot.createTime), snapshotAge(row.snapshot, now).label, snapshotAge(row.snapshot, now).detail, snapshotSize(row), row.snapshot.description])].map(row => row.map(safe).join(';')).join('\r\n');
}
