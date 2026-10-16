import type { SemanticTone } from '@/components/ui/semantic-badge';

export interface DatastoreHostMount {
  id: string; name: string; connectionState: string;
  mounted: boolean | null; accessible: boolean | null; accessMode: string; inaccessibleReason: string | null;
}
export interface DatastoreWorkspaceRecord {
  id: string; name: string; type: string; accessible: boolean | null;
  capacityBytes: number | null; freeBytes: number | null; maintenanceMode: string;
  multipleHostAccess: boolean | null; hosts: DatastoreHostMount[] | null;
}
export function formatStorage(bytes: number | null) {
  if (bytes == null) return 'Bilinmiyor';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  const index = bytes > 0 ? Math.min(5, Math.floor(Math.log(bytes) / Math.log(1024))) : 0;
  return `${(bytes / 1024 ** Math.max(0, index)).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} ${units[Math.max(0, index)]}`;
}
export function datastoreCapacity(ds: DatastoreWorkspaceRecord) {
  const validNumber = (value: number | null): value is number => value != null && Number.isFinite(value) && value >= 0;
  const complete = ds.accessible === true && validNumber(ds.capacityBytes) && validNumber(ds.freeBytes);
  const inconsistent = complete && ds.freeBytes! > ds.capacityBytes!;
  const valid = complete && !inconsistent;
  const total = valid ? ds.capacityBytes! : null, free = valid ? ds.freeBytes! : null;
  const used = valid ? total! - free! : null;
  const percent = valid && total! > 0 ? used! / total! * 100 : null;
  return { total, free, used, percent, valid, inconsistent };
}
export function datastoreTotals(rows: DatastoreWorkspaceRecord[]) {
  const valid = rows.map(datastoreCapacity).filter(value => value.valid);
  const known = rows.length === 0 || valid.length > 0;
  const total = known ? valid.reduce((sum, value) => sum + value.total!, 0) : null;
  const free = known ? valid.reduce((sum, value) => sum + value.free!, 0) : null;
  const used = known ? valid.reduce((sum, value) => sum + value.used!, 0) : null;
  return { total, free, used, percent: total != null && total > 0 ? used! / total * 100 : null, measured: valid.length, omitted: rows.length - valid.length };
}
export function datastoreAccess(value: boolean | null): { label: string; tone: SemanticTone } {
  return value === true ? { label: 'Erişilebilir', tone: 'success' } : value === false ? { label: 'Erişilemiyor', tone: 'danger' } : { label: 'Erişim bilinmiyor', tone: 'neutral' };
}
export function datastoreUsage(ds: DatastoreWorkspaceRecord): { key: string; label: string; tone: SemanticTone } {
  const { percent } = datastoreCapacity(ds);
  return percent == null ? { key: 'unknown', label: 'Doluluk bilinmiyor', tone: 'neutral' } : percent >= 90 ? { key: 'critical', label: 'Kritik doluluk', tone: 'danger' } : percent >= 75 ? { key: 'warning', label: 'Doluluk uyarısı', tone: 'warning' } : { key: 'normal', label: 'Normal doluluk', tone: 'success' };
}
export function datastoreMaintenance(value: string) {
  return ({ normal: 'Bakımda değil', enteringMaintenance: 'Bakıma geçiyor', inMaintenance: 'Bakımda' } as Record<string, string>)[value] || 'Bakım durumu bilinmiyor';
}
export function datastoreType(value: string) { return !value || value === 'unknown' ? 'Tür bilinmiyor' : value; }
export function mountState(host: DatastoreHostMount): { label: string; tone: SemanticTone } {
  if (host.mounted === false) return { label: 'Bağlı değil', tone: 'warning' };
  if (host.accessible === false) return { label: 'Erişilemiyor', tone: 'danger' };
  if (host.connectionState !== 'connected' || host.accessible == null || host.mounted == null) return { label: 'Erişim doğrulanamadı', tone: 'neutral' };
  return { label: 'Bağlı ve erişilebilir', tone: 'success' };
}
export function mountMode(value: string) { return value === 'readWrite' ? 'Okuma / yazma' : value === 'readOnly' ? 'Salt okunur' : 'Erişim modu bilinmiyor'; }
export function mountReason(value: string | null) {
  if (!value) return null;
  const labels: Record<string, string> = { AllPathsDown_Start: 'Tüm depolama yolları kapalı', AllPathsDown_Timeout: 'Depolama yollarında erişim zaman aşımı', PermanentDeviceLoss: 'Kalıcı aygıt kaybı' };
  return labels[value] || `vCenter erişim nedeni: ${value}`;
}
export function datastoreHostOptions(rows: DatastoreWorkspaceRecord[]) {
  const hosts = new Map<string, string>(); rows.forEach(row => row.hosts?.forEach(host => hosts.set(host.id, host.name)));
  return Array.from(hosts, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'tr-TR') || a.id.localeCompare(b.id));
}
export interface DatastoreFilters { search: string; host: string; type: string; access: string; usage: string }
export function filterDatastores(rows: DatastoreWorkspaceRecord[], filters: DatastoreFilters) {
  const term = filters.search.trim().toLocaleLowerCase('tr-TR');
  return rows.filter(row => (!term || [row.name, row.id, row.type, ...(row.hosts?.flatMap(host => [host.name, host.id]) || [])].some(value => value.toLocaleLowerCase('tr-TR').includes(term))) &&
    (filters.host === 'all' || filters.host === 'unknown' && row.hosts === null || filters.host === 'none' && row.hosts?.length === 0 || row.hosts?.some(host => host.id === filters.host)) &&
    (filters.type === 'all' || row.type === filters.type) && (filters.access === 'all' || filters.access === (row.accessible === true ? 'accessible' : row.accessible === false ? 'inaccessible' : 'unknown')) &&
    (filters.usage === 'all' || datastoreUsage(row).key === filters.usage));
}
export function datastoreCsv(rows: DatastoreWorkspaceRecord[]) {
  const safe = (value: unknown) => { const text = String(value ?? ''); return `"${(/^[\s]*[=+\-@]/.test(text) ? "'" : '') + text.replace(/"/g, '""')}"`; };
  const headers = ['Veri deposu', 'Kimlik', 'Tür', 'Erişim', 'Toplam kapasite (bayt)', 'Kullanılan alan (bayt)', 'Boş alan (bayt)', 'Doluluk (%)', 'Bakım durumu', 'ESXi sunucuları', 'ESXi kimlikleri', 'Sunucu bazında erişim'];
  return '\uFEFF' + [headers, ...rows.map(row => { const capacity = datastoreCapacity(row); return [row.name, row.id, datastoreType(row.type), datastoreAccess(row.accessible).label, capacity.total, capacity.used, capacity.free, capacity.percent == null ? null : capacity.percent.toLocaleString('tr-TR', { maximumFractionDigits: 1 }), datastoreMaintenance(row.maintenanceMode), row.hosts === null ? 'Bilinmiyor' : row.hosts.map(host => host.name).join(' | '), row.hosts?.map(host => host.id).join(' | '), row.hosts?.map(host => `${host.name}: ${mountState(host).label}`).join(' | ')]; })].map(row => row.map(safe).join(';')).join('\r\n');
}
