export interface ClusterHost {
  id: string; name: string; connectionState: string; powerState: string; overallStatus: string;
  maintenance: boolean | null; cpuCores: number | null; totalCpuMHz: number | null;
  totalMemoryBytes: number | null; usedCpuMHz: number | null; usedMemoryBytes: number | null; version: string | null;
}
export interface ClusterWorkspaceRecord {
  id: string; name: string; overallStatus: string; hostCount: number; effectiveHosts: number | null;
  cpuCores: number | null; totalCpuMHz: number | null; totalMemoryBytes: number | null;
  haEnabled: boolean | null; drsEnabled: boolean | null; hosts: ClusterHost[];
}
export type ClusterHealthKey = 'healthy' | 'warning' | 'critical' | 'unknown' | 'empty';
export function clusterHealth(cluster: ClusterWorkspaceRecord): { key: ClusterHealthKey; label: string; detail: string; tone: 'success' | 'warning' | 'danger' | 'neutral' } {
  const hosts = cluster.hosts;
  if (cluster.overallStatus === 'red' || hosts.some(host => host.overallStatus === 'red')) return { key: 'critical', label: 'Kritik', detail: 'vCenter kritik sağlık durumu bildiriyor.', tone: 'danger' };
  if (hosts.some(host => ['disconnected', 'notResponding'].includes(host.connectionState))) return { key: 'warning', label: 'Bağlantı sorunu', detail: 'En az bir ESXi sunucusunun bağlantısı kesilmiş veya yanıt vermiyor.', tone: 'warning' };
  if (!cluster.hostCount && !hosts.length) return { key: 'empty', label: 'Sunucu yok', detail: 'Bu kümeye henüz ESXi sunucusu bağlı değil.', tone: 'neutral' };
  if (cluster.overallStatus === 'yellow' || hosts.some(host => host.overallStatus === 'yellow')) return { key: 'warning', label: 'Uyarı', detail: 'vCenter küme veya sunucu sağlığı için uyarı bildiriyor.', tone: 'warning' };
  if (hosts.some(host => host.maintenance)) return { key: 'warning', label: 'Bakım var', detail: 'En az bir ESXi sunucusu bakım modunda.', tone: 'warning' };
  if (hosts.some(host => ['poweredOff', 'standBy'].includes(host.powerState))) return { key: 'warning', label: 'Kapalı sunucu', detail: 'En az bir ESXi sunucusu kapalı veya beklemede.', tone: 'warning' };
  if (cluster.effectiveHosts != null && cluster.effectiveHosts < cluster.hostCount) return { key: 'warning', label: 'Kapasite eksik', detail: 'Kümedeki sunucuların tamamı etkin kaynak sağlamıyor.', tone: 'warning' };
  if (cluster.overallStatus !== 'green' || hosts.length !== cluster.hostCount || hosts.some(host => host.connectionState !== 'connected' || host.overallStatus !== 'green' || host.maintenance == null || host.powerState !== 'poweredOn')) return { key: 'unknown', label: 'Sağlık belirsiz', detail: 'Sağlık, bağlantı veya çalışma bilgilerinin bir bölümü doğrulanamadı.', tone: 'neutral' };
  return { key: 'healthy', label: 'Sağlıklı', detail: 'vCenter sağlığı normal; tüm ESXi sunucuları bağlı ve çalışıyor.', tone: 'success' };
}
export function sumKnown(values: Array<number | null>): number | null {
  return values.length && values.every(value => value != null && Number.isFinite(value) && value >= 0) ? values.reduce<number>((sum, value) => sum + value!, 0) : null;
}
export function clusterUsage(cluster: ClusterWorkspaceRecord, resource: 'cpu' | 'memory') {
  const total = resource === 'cpu' ? cluster.totalCpuMHz : cluster.totalMemoryBytes;
  const complete = cluster.hostCount > 0 && cluster.hosts.length === cluster.hostCount && cluster.hosts.every(host => host.connectionState === 'connected' && host.powerState === 'poweredOn');
  const used = complete ? sumKnown(cluster.hosts.map(host => resource === 'cpu' ? host.usedCpuMHz : host.usedMemoryBytes)) : null;
  const percent = total != null && total > 0 && used != null ? used / total * 100 : null;
  return { total, used, percent, available: total != null && used != null ? Math.max(0, total - used) : null };
}
export function formatCount(value: number | null) { return value == null ? 'Bilinmiyor' : value.toLocaleString('tr-TR'); }
export function formatMemory(bytes: number | null) {
  if (bytes == null) return 'Bilinmiyor';
  const tib = bytes >= 1024 ** 4;
  return `${(bytes / 1024 ** (tib ? 4 : 3)).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} ${tib ? 'TiB' : 'GiB'}`;
}
export function formatCpu(mhz: number | null) { return mhz == null ? 'Bilinmiyor' : `${(mhz / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} GHz`; }
export function hostConnection(value: string) {
  return value === 'connected' ? 'Bağlı' : value === 'disconnected' ? 'Bağlantı kesik' : value === 'notResponding' ? 'Yanıt vermiyor' : 'Bağlantı bilinmiyor';
}
export function hostHealth(value: string) { return value === 'green' ? 'Normal' : value === 'yellow' ? 'Uyarı' : value === 'red' ? 'Kritik' : 'Sağlık bilinmiyor'; }
export function hostPower(value: string) { return value === 'poweredOn' ? 'Çalışıyor' : value === 'poweredOff' ? 'Kapalı' : value === 'standBy' ? 'Beklemede' : 'Güç durumu bilinmiyor'; }
export function filterClusters(clusters: ClusterWorkspaceRecord[], search: string, health: string) {
  const term = search.trim().toLocaleLowerCase('tr-TR');
  return clusters.filter(cluster => (!term || [cluster.name, cluster.id, ...cluster.hosts.map(host => host.name)].some(value => value.toLocaleLowerCase('tr-TR').includes(term))) && (health === 'all' || clusterHealth(cluster).key === health));
}
export function clusterCsv(clusters: ClusterWorkspaceRecord[]) {
  const headers = ['Küme adı', 'Küme kimliği', 'Sağlık', 'ESXi sunucusu', 'Kaynak sağlayan sunucu', 'CPU çekirdeği', 'CPU kapasitesi (MHz)', 'Bellek kapasitesi (bayt)', 'HA', 'DRS'];
  const safe = (value: unknown) => { const text = String(value ?? ''); return `"${(/^[\s]*[=+\-@]/.test(text) ? "'" : '') + text.replace(/"/g, '""')}"`; };
  return '\uFEFF' + [headers, ...clusters.map(cluster => [cluster.name, cluster.id, clusterHealth(cluster).label, cluster.hostCount, cluster.effectiveHosts, cluster.cpuCores, cluster.totalCpuMHz, cluster.totalMemoryBytes, cluster.haEnabled == null ? 'Bilinmiyor' : cluster.haEnabled ? 'Açık' : 'Kapalı', cluster.drsEnabled == null ? 'Bilinmiyor' : cluster.drsEnabled ? 'Açık' : 'Kapalı'])].map(row => row.map(safe).join(';')).join('\r\n');
}
