import type { ClusterHost } from './cluster-workspace';
import { hostConnection, hostHealth, hostPower } from './cluster-workspace';

export interface HostWorkspaceRecord extends ClusterHost {
  clusterMembership: 'cluster' | 'standalone' | 'unknown'; clusterId: string | null; clusterName: string | null;
  vendor: string | null; model: string | null; build: string | null;
}
export type HostHealthKey = 'healthy' | 'warning' | 'critical' | 'unknown';
export function assessHost(host: HostWorkspaceRecord): { key: HostHealthKey; label: string; detail: string; tone: 'success' | 'warning' | 'danger' | 'neutral' } {
  if (host.overallStatus === 'red') return { key: 'critical', label: 'Kritik', tone: 'danger', detail: 'vCenter bu sunucu için kritik sağlık durumu bildiriyor.' };
  if (['disconnected', 'notResponding'].includes(host.connectionState)) return { key: 'warning', label: 'Bağlantı sorunu', tone: 'warning', detail: 'Sunucunun bağlantısı kesik veya sunucu yanıt vermiyor. Kullanım ölçümleri güncel olmayabilir.' };
  if (host.maintenance === true) return { key: 'warning', label: 'Bakımda', tone: 'warning', detail: 'Sunucu bakım modunda; yeni iş yükü planlarken bu durumu dikkate alın.' };
  if (['poweredOff', 'standBy'].includes(host.powerState)) return { key: 'warning', label: 'Çalışmıyor', tone: 'warning', detail: 'Sunucu kapalı veya bekleme durumunda.' };
  if (host.overallStatus === 'yellow') return { key: 'warning', label: 'Uyarı', tone: 'warning', detail: 'vCenter sunucu sağlığı için uyarı bildiriyor.' };
  if (host.overallStatus !== 'green' || host.connectionState !== 'connected' || host.powerState !== 'poweredOn' || host.maintenance == null) return { key: 'unknown', label: 'Sağlık belirsiz', tone: 'neutral', detail: 'Sağlık, bağlantı veya bakım bilgisinin bir bölümü doğrulanamadı.' };
  return { key: 'healthy', label: 'Sağlıklı', tone: 'success', detail: 'vCenter sağlığı normal; sunucu bağlı, çalışıyor ve bakım modunda değil.' };
}
export function hostResource(host: HostWorkspaceRecord, resource: 'cpu' | 'memory') {
  const total = resource === 'cpu' ? host.totalCpuMHz : host.totalMemoryBytes;
  const raw = resource === 'cpu' ? host.usedCpuMHz : host.usedMemoryBytes;
  const used = host.connectionState === 'connected' && host.powerState === 'poweredOn' ? raw : null;
  const percent = used != null && total != null && total > 0 ? used / total * 100 : null;
  return { total, used, percent, available: used != null && total != null ? Math.max(0, total - used) : null };
}
export function clusterLabel(host: HostWorkspaceRecord) {
  return host.clusterMembership === 'cluster' ? host.clusterName || 'Küme adı bilinmiyor' : host.clusterMembership === 'standalone' ? 'Bağımsız sunucu' : 'Küme bilgisi bilinmiyor';
}
export function clusterOptions(hosts: HostWorkspaceRecord[]) {
  const options = new Map<string, string>();
  hosts.forEach(host => { if (host.clusterMembership === 'cluster' && host.clusterId) options.set(host.clusterId, clusterLabel(host)); });
  return Array.from(options, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'tr-TR') || a.id.localeCompare(b.id));
}
export interface HostFilters { search: string; cluster: string; health: string; connection: string }
export function filterHosts(hosts: HostWorkspaceRecord[], filters: HostFilters) {
  const term = filters.search.trim().toLocaleLowerCase('tr-TR');
  return hosts.filter(host => (!term || [host.name, host.id, host.clusterName, host.vendor, host.model, host.version].some(value => value?.toLocaleLowerCase('tr-TR').includes(term))) &&
    (filters.cluster === 'all' || filters.cluster === 'standalone' && host.clusterMembership === 'standalone' || filters.cluster === 'unknown' && host.clusterMembership === 'unknown' || host.clusterMembership === 'cluster' && host.clusterId === filters.cluster) &&
    (filters.health === 'all' || filters.health === 'maintenance' && host.maintenance === true || assessHost(host).key === filters.health) &&
    (filters.connection === 'all' || filters.connection === 'unknown' && !['connected', 'disconnected', 'notResponding'].includes(host.connectionState) || filters.connection === host.connectionState));
}
export function hostCsv(hosts: HostWorkspaceRecord[]) {
  const safe = (value: unknown) => { const text = String(value ?? ''); return `"${(/^[\s]*[=+\-@]/.test(text) ? "'" : '') + text.replace(/"/g, '""')}"`; };
  const headers = ['Sunucu adı', 'Sunucu kimliği', 'Küme', 'Küme kimliği', 'Sağlık özeti', 'vCenter sağlığı', 'Bağlantı', 'Güç durumu', 'Bakım modu', 'Üretici', 'Model', 'CPU çekirdeği', 'CPU kapasitesi (MHz)', 'CPU kullanımı (MHz)', 'Bellek kapasitesi (bayt)', 'Bellek kullanımı (bayt)', 'ESXi sürümü', 'Derleme'];
  return '\uFEFF' + [headers, ...hosts.map(host => [host.name, host.id, clusterLabel(host), host.clusterId, assessHost(host).label, hostHealth(host.overallStatus), hostConnection(host.connectionState), hostPower(host.powerState), host.maintenance == null ? 'Bilinmiyor' : host.maintenance ? 'Bakımda' : 'Normal', host.vendor, host.model, host.cpuCores, host.totalCpuMHz, hostResource(host, 'cpu').used, host.totalMemoryBytes, hostResource(host, 'memory').used, host.version, host.build])].map(row => row.map(safe).join(';')).join('\r\n');
}
