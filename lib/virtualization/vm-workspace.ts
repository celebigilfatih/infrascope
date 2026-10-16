export interface VMWorkspaceRecord {
  id: string; name: string; template: boolean | null; powerState: string; connectionState: string; overallStatus: string; guestState: string;
  hostAssignment: 'assigned' | 'unassigned' | 'unknown'; hostId: string | null; hostName: string | null;
  ip: string | null; os: string | null; cpuCount: number | null; cpuCapacityMHz: number | null; usedCpuMHz: number | null;
  memoryBytes: number | null; activeMemoryBytes: number | null; hostMemoryBytes: number | null;
}
export type VMPowerOperation = 'on' | 'off' | 'suspend' | 'reset';
export function formatVMCpu(mhz: number | null) {
  if (mhz == null) return 'Bilinmiyor';
  return mhz < 1000 ? `${mhz.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MHz` : `${(mhz / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} GHz`;
}
export function vmPowerState(value: string) { return value === 'poweredOn' ? 'Çalışıyor' : value === 'poweredOff' ? 'Kapalı' : value === 'suspended' ? 'Askıda' : 'Durum bilinmiyor'; }
export function vmConnection(value: string) {
  return ({ connected: 'Yönetilebilir', disconnected: 'Bağlantı kesik', inaccessible: 'Erişilemiyor', invalid: 'Yapılandırma geçersiz', orphaned: 'Envanter bağlantısı kopuk' } as Record<string, string>)[value] || 'Bağlantı bilinmiyor';
}
export function vmGuestState(value: string) { return ({ running: 'Konuk sistem çalışıyor', notRunning: 'Konuk sistem çalışmıyor', shuttingDown: 'Konuk sistem kapanıyor', resetting: 'Konuk sistem yeniden başlıyor', standby: 'Konuk sistem beklemede' } as Record<string, string>)[value] || 'Konuk sistem durumu bilinmiyor'; }
export function vmHealth(vm: VMWorkspaceRecord): { key: string; label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' } {
  if (vm.overallStatus === 'red') return { key: 'critical', label: 'Kritik', tone: 'danger' };
  if (['inaccessible', 'invalid', 'orphaned', 'disconnected'].includes(vm.connectionState)) return { key: 'warning', label: 'Erişim sorunu', tone: 'warning' };
  if (vm.overallStatus === 'yellow') return { key: 'warning', label: 'Uyarı', tone: 'warning' };
  if (vm.overallStatus !== 'green' || vm.connectionState !== 'connected') return { key: 'unknown', label: 'Sağlık belirsiz', tone: 'neutral' };
  return { key: 'normal', label: 'Sağlık normal', tone: 'success' };
}
export function vmHostLabel(vm: VMWorkspaceRecord) { return vm.hostAssignment === 'assigned' ? vm.hostName || 'Sunucu adı bilinmiyor' : vm.hostAssignment === 'unassigned' ? 'ESXi atanmamış' : 'ESXi bilgisi bilinmiyor'; }
export function vmResource(vm: VMWorkspaceRecord, resource: 'cpu' | 'memory') {
  const total = resource === 'cpu' ? vm.cpuCapacityMHz : vm.memoryBytes;
  const measurable = vm.powerState === 'poweredOn' && vm.connectionState === 'connected';
  const used = measurable ? resource === 'cpu' ? vm.usedCpuMHz : vm.activeMemoryBytes : null;
  const percent = total != null && total > 0 && used != null ? used / total * 100 : null;
  return { total, used, percent, measurable };
}
export interface VMFilters { search: string; state: string; host: string; health: string }
export function vmHostOptions(vms: VMWorkspaceRecord[]) {
  const values = new Map<string, string>(); vms.forEach(vm => { if (vm.hostAssignment === 'assigned' && vm.hostId) values.set(vm.hostId, vmHostLabel(vm)); });
  return Array.from(values, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'tr-TR') || a.id.localeCompare(b.id));
}
export function filterVMs(vms: VMWorkspaceRecord[], filters: VMFilters) {
  const term = filters.search.trim().toLocaleLowerCase('tr-TR');
  return vms.filter(vm => (!term || [vm.name, vm.id, vm.hostName, vm.ip, vm.os].some(value => value?.toLocaleLowerCase('tr-TR').includes(term))) &&
    (filters.state === 'all' || filters.state === 'unknown' && !['poweredOn', 'poweredOff', 'suspended'].includes(vm.powerState) || filters.state === vm.powerState) &&
    (filters.host === 'all' || filters.host === 'unassigned' && vm.hostAssignment === 'unassigned' || filters.host === 'unknown' && vm.hostAssignment === 'unknown' || vm.hostAssignment === 'assigned' && filters.host === vm.hostId) &&
    (filters.health === 'all' || vmHealth(vm).key === filters.health));
}
export function powerOperations(vm: VMWorkspaceRecord): VMPowerOperation[] {
  if (vm.connectionState !== 'connected' || vm.template !== false) return [];
  return vm.powerState === 'poweredOn' ? ['off', 'suspend', 'reset'] : ['poweredOff', 'suspended'].includes(vm.powerState) ? ['on'] : [];
}
export function powerDescription(vm: VMWorkspaceRecord, operation: VMPowerOperation) {
  if (operation === 'on') return { label: vm.powerState === 'suspended' ? 'Devam et' : 'Başlat', description: `${vm.name} sanal makinesi ${vm.powerState === 'suspended' ? 'askıdan çıkarılacak' : 'başlatılacak'}.`, destructive: false };
  if (operation === 'off') return { label: 'Güvenli kapat', description: `${vm.name} için konuk işletim sistemine kapanış isteği gönderilecek. VMware Tools desteği gerekir; açık uygulamaları kontrol edin.`, destructive: true };
  if (operation === 'suspend') return { label: 'Askıya al', description: `${vm.name} askıya alınacak; içindeki hizmetler devam ettirilene kadar duracak.`, destructive: true };
  return { label: 'Yeniden başlat (reset)', description: `${vm.name} işletim sistemi kapanışı beklenmeden yeniden başlatılacak. Kaydedilmemiş veriler kaybolabilir.`, destructive: true };
}
export async function requestVMPower(vm: VMWorkspaceRecord, operation: VMPowerOperation, fetcher: typeof fetch = fetch) {
  if (!powerOperations(vm).includes(operation)) throw new Error('VM durumu bu işlem için uygun değil. Verileri yenileyin.');
  const response = await fetcher('/api/integrations/vmware', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'vm-power', vmId: vm.id, operation }) });
  const json = await response.json();
  if (!response.ok || json.success !== true) throw new Error(typeof json.error === 'string' ? json.error : 'Güç işlemi vCenter tarafından kabul edilmedi.');
}
export function vmCsv(vms: VMWorkspaceRecord[]) {
  const safe = (value: unknown) => { const text = String(value ?? ''); return `"${(/^[\s]*[=+\-@]/.test(text) ? "'" : '') + text.replace(/"/g, '""')}"`; };
  const headers = ['VM adı', 'VM kimliği', 'Güç durumu', 'Sağlık', 'Yönetim bağlantısı', 'ESXi sunucusu', 'ESXi kimliği', 'IP', 'İşletim sistemi', 'Atanan vCPU', 'CPU üst sınırı (MHz)', 'CPU kullanımı (MHz)', 'Atanan bellek (bayt)', 'Aktif konuk belleği (bayt)'];
  return '\uFEFF' + [headers, ...vms.map(vm => [vm.name, vm.id, vmPowerState(vm.powerState), vmHealth(vm).label, vmConnection(vm.connectionState), vmHostLabel(vm), vm.hostId, vm.ip, vm.os, vm.cpuCount, vm.cpuCapacityMHz, vmResource(vm, 'cpu').used, vm.memoryBytes, vmResource(vm, 'memory').used])].map(row => row.map(safe).join(';')).join('\r\n');
}
