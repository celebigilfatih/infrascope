export const integrationKinds = {
  VMWARE_VCENTER: { label: 'VMware vCenter', category: 'Sanallaştırma', target: '/integrations/vmware' },
  FORTIGATE: { label: 'FortiGate', category: 'Güvenlik', target: '/integrations/firewall' },
  FORTIANALYZER: { label: 'FortiAnalyzer', category: 'Güvenlik', target: '/integrations/fortianalyzer' },
  ZABBIX: { label: 'Zabbix', category: 'İzleme', target: null },
  SNMP: { label: 'SNMP profili', category: 'İzleme', target: '/integrations/nms/devices' },
  NMS: { label: 'NMS / SNMP cihaz izleme', category: 'İzleme', target: '/integrations/nms/devices' },
  AWS: { label: 'Amazon Web Services', category: 'Bulut', target: null },
  AZURE: { label: 'Microsoft Azure', category: 'Bulut', target: null },
  API: { label: 'API bağlantısı', category: 'Diğer', target: null },
} as const;
export type IntegrationKind = keyof typeof integrationKinds;
export type ConnectionState = 'success' | 'failed' | 'stale' | 'unknown';
export type StatusFilter = 'all' | 'attention' | 'success' | 'unknown' | 'disabled' | 'unconfigured';
export type IntegrationSnapshot = {
  id: string; kind: IntegrationKind; name: string; configured: boolean | null; enabled: boolean | null; host: string | null; scope: string | null;
  connection: { state: ConnectionState; checkedAt: string | null; nextCheckAt: string | null; latencyMs: number | null; errorCode: string | null };
  sync: { status: 'success' | 'partial' | 'failed' | null; startedAt: string | null; completedAt: string | null; errors: number | null; source: 'log' | 'metadata' } | null;
  activity: { registered: number | null; polling: number | null; lastMetricAt: string | null; readFailed: boolean } | null;
  identityConflict: boolean;
};
export const connectionLabels: Record<ConnectionState, string> = { success: 'Son kontrol başarılı', failed: 'Son kontrol başarısız', stale: 'Kontrol bilgisi eski', unknown: 'Kontrol kaydı yok' };
export const syncLabels = { success: 'Tamamlandı', partial: 'Kısmen tamamlandı', failed: 'Başarısız' };
export const statusFilterLabels: Record<StatusFilter, string> = { all: 'Tüm durumlar', attention: 'Dikkat gerekenler', success: 'Son kontrolü başarılı', unknown: 'Kontrol kaydı olmayanlar', disabled: 'Devre dışı', unconfigured: 'Yapılandırılmamış' };
export const statusErrorLabels: Record<string, { message: string; action: string }> = {
  AUTHENTICATION_FAILED: { message: 'Kimlik doğrulaması başarısız.', action: 'Kayıtlı kullanıcı/parola veya erişim anahtarını ve hesap yetkilerini kontrol edin.' },
  ACCOUNT_LOCKED: { message: 'Entegrasyon hesabı kilitli.', action: 'Kaynak sistemde hesabı kontrol edin ve bekleme süresinin dolmasını bekleyin.' },
  TLS_CERTIFICATE_EXPIRED: { message: 'Sunucu sertifikasının süresi dolmuş.', action: 'Kaynak sunucunun sertifikasını yenileyin.' },
  TLS_CERTIFICATE_UNTRUSTED: { message: 'Sunucu sertifikası doğrulanamadı.', action: 'Sertifika zincirini ve güvenilen sertifika ayarlarını kontrol edin.' },
  NETWORK_UNREACHABLE: { message: 'Yönetim adresine erişilemedi.', action: 'Sunucu adresini, ağ erişimini ve güvenlik duvarı kurallarını kontrol edin.' },
  REQUEST_TIMEOUT: { message: 'Bağlantı kontrolü zaman aşımına uğradı.', action: 'Sunucunun erişilebilirliğini kontrol edip daha sonra yeniden deneyin.' },
  RATE_LIMITED: { message: 'Kaynak sistemin istek sınırına ulaşıldı.', action: 'Yeni bir test başlatmadan önce bekleyin.' },
  UNSUPPORTED_OPERATION: { message: 'Kaynak bu kontrolü desteklemiyor.', action: 'Entegrasyonun veri toplama yöntemini kontrol edin.' },
  UPSTREAM_UNAVAILABLE: { message: 'Kaynak hizmet yanıt veremiyor.', action: 'Kaynak sistemin hizmet durumunu kontrol edin.' },
  INVALID_RESPONSE: { message: 'Kaynak yanıtı doğrulanamadı.', action: 'Entegrasyon ayarlarını ve kaynak sürümünü kontrol edin.' },
  UNKNOWN: { message: 'Bağlantı doğrulanamadı.', action: 'Entegrasyon ekranından sunucu, kimlik bilgileri ve erişim ayarlarını kontrol edin.' },
};
export const statusObject = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v));
export const statusDate = (v: unknown): string | null => v instanceof Date && Number.isFinite(v.getTime()) ? v.toISOString() : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v)) ? v : null;
const count = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
const knownSync = (v: unknown): NonNullable<IntegrationSnapshot['sync']>['status'] => v === 'success' || v === 'partial' || v === 'failed' ? v : null;
const errorCode = (v: unknown) => typeof v === 'string' && Object.prototype.hasOwnProperty.call(statusErrorLabels, v) ? v : 'UNKNOWN';
export function safeStatusHost(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const input = value.trim();
  try { if (/^https?:\/\//i.test(input)) return new URL(input).host || null; } catch { return null; }
  return input.length <= 255 && !/[\s/@?#\\]/.test(input) ? input : null;
}
export interface StatusConfigRecord { id: string; type: string; name: string; enabled: boolean; config: unknown; lastSyncAt?: Date | string | null; lastSyncStatus?: string | null; syncLogs?: Array<{ status: string; startedAt: Date | string; completedAt: Date | string | null; errorDetails?: unknown }>; firewallConnectors?: Array<{ id: string; managementHost: string; vdom: string; capabilities: unknown; lastProbeAt: Date | string | null; nextProbeAt: Date | string | null; lastErrorCode: string | null; identityStatus: string }> }
/** Uses recorded evidence only. A configured host, inventory transfer or recent metric is not a connection probe. */
export function buildStatusSnapshots(records: StatusConfigRecord[]): IntegrationSnapshot[] {
  const result: IntegrationSnapshot[] = [];
  for (const row of records) {
    const kind: IntegrationKind = Object.prototype.hasOwnProperty.call(integrationKinds, row.type) ? row.type as IntegrationKind : 'API';
    const config = statusObject(row.config) ? row.config : {}, log = row.syncLogs?.[0];
    const sync = log ? { status: knownSync(log.status), startedAt: statusDate(log.startedAt), completedAt: statusDate(log.completedAt), errors: statusObject(log.errorDetails) ? count(log.errorDetails.errorCount) : null, source: 'log' as const }
      : ['VMWARE_VCENTER', 'ZABBIX'].includes(kind) && (knownSync(row.lastSyncStatus) || statusDate(row.lastSyncAt)) ? { status: knownSync(row.lastSyncStatus), startedAt: null, completedAt: statusDate(row.lastSyncAt), errors: null, source: 'metadata' as const } : null;
    const emptyConnection = { state: 'unknown' as ConnectionState, checkedAt: null, nextCheckAt: null, latencyMs: null, errorCode: null };
    const base: IntegrationSnapshot = { id: row.id, kind, name: row.name, configured: true, enabled: row.enabled, host: safeStatusHost(kind === 'ZABBIX' ? config.url : config.host), scope: kind === 'FORTIANALYZER' ? `ADOM: ${typeof config.adom === 'string' ? config.adom : config.adom === undefined ? 'root' : 'Belirtilmemiş'}` : kind === 'FORTIGATE' ? `VDOM: ${typeof config.vdom === 'string' ? config.vdom : 'root'}` : null, connection: emptyConnection, sync, activity: null, identityConflict: false };
    if (kind === 'FORTIGATE' && row.firewallConnectors?.length) {
      for (const connector of row.firewallConnectors) {
        const rest = Array.isArray(connector.capabilities) ? connector.capabilities.find(item => statusObject(item) && item.source === 'fortigate-rest') : null;
        const probe = statusObject(rest) ? rest : {}, checkedAt = statusDate(probe.checkedAt) || statusDate(connector.lastProbeAt);
        const state: ConnectionState = !checkedAt ? 'unknown' : probe.status === 'available' ? 'success' : probe.status === 'unavailable' ? 'failed' : probe.status === 'stale' ? 'stale' : 'unknown';
        result.push({ ...base, id: `${row.id}:${connector.id}`, host: safeStatusHost(connector.managementHost), scope: `VDOM: ${connector.vdom}`, identityConflict: connector.identityStatus === 'CONFLICT', connection: { state, checkedAt, nextCheckAt: statusDate(probe.nextProbeAt) || statusDate(connector.nextProbeAt), latencyMs: count(probe.latencyMs), errorCode: state === 'failed' ? errorCode(probe.errorCode || connector.lastErrorCode) : null } });
      }
    } else result.push(base);
  }
  for (const kind of ['VMWARE_VCENTER', 'FORTIGATE', 'FORTIANALYZER', 'ZABBIX'] as const) if (!records.some(row => row.type === kind)) result.push({ id: `unconfigured-${kind}`, kind, name: integrationKinds[kind].label, configured: false, enabled: false, host: null, scope: null, connection: { state: 'unknown', checkedAt: null, nextCheckAt: null, latencyMs: null, errorCode: null }, sync: null, activity: null, identityConflict: false });
  return result;
}
export function statusNeedsAttention(row: IntegrationSnapshot): boolean { return row.activity?.readFailed === true || (row.configured === true && row.enabled === true && (row.identityConflict || ['failed', 'stale'].includes(row.connection.state) || row.sync?.status === 'partial' || row.sync?.status === 'failed')); }
export function statusPriority(row: IntegrationSnapshot): number { return statusNeedsAttention(row) ? 0 : row.configured === false ? 4 : row.enabled === false ? 3 : row.configured === null ? 2 : 1; }
export function statusMatches(row: IntegrationSnapshot, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'attention') return statusNeedsAttention(row);
  if (filter === 'unconfigured') return row.configured === false;
  if (filter === 'disabled') return row.configured === true && row.enabled === false;
  if (row.configured === null || row.enabled === null) return filter === 'unknown';
  if (!row.configured || !row.enabled) return false;
  return filter === 'success' ? row.connection.state === 'success' : row.connection.state === 'unknown';
}
export function parseStatusWorkspace(value: unknown): { data: IntegrationSnapshot[]; observedAt: string; warnings: string[] } {
  if (!statusObject(value) || value.success !== true || !Array.isArray(value.data) || !statusDate(value.observedAt) || !Array.isArray(value.warnings) || value.warnings.some(w => typeof w !== 'string')) throw Error('Entegrasyon durumları beklenen biçimde alınamadı.');
  const ids = new Set<string>();
  const data = value.data.map(row => {
    if (!statusObject(row) || typeof row.id !== 'string' || !row.id || ids.has(row.id) || typeof row.kind !== 'string' || !Object.prototype.hasOwnProperty.call(integrationKinds, row.kind) || typeof row.name !== 'string' || (row.configured !== null && typeof row.configured !== 'boolean') || (row.enabled !== null && typeof row.enabled !== 'boolean') || !statusObject(row.connection) || !['success', 'failed', 'stale', 'unknown'].includes(String(row.connection.state)) || typeof row.identityConflict !== 'boolean') throw Error('Entegrasyon kaydı okunamadı.');
    ids.add(row.id);
    const c = row.connection;
    if (c.state !== 'unknown' && !statusDate(c.checkedAt)) throw Error('Bağlantı kontrolünün zamanı doğrulanamadı.');
    if (row.sync !== null && (!statusObject(row.sync) || !['log', 'metadata'].includes(String(row.sync.source)))) throw Error('Senkronizasyon bilgileri okunamadı.');
    if (row.activity !== null && (!statusObject(row.activity) || typeof row.activity.readFailed !== 'boolean')) throw Error('İzleme hizmeti bilgileri okunamadı.');
    if ((row.configured === null || row.enabled === null) && (!statusObject(row.activity) || row.activity.readFailed !== true)) throw Error('Yapılandırma durumu doğrulanamadı.');
    const s = statusObject(row.sync) ? row.sync : null, a = statusObject(row.activity) ? row.activity : null;
    return { id: row.id, kind: row.kind as IntegrationKind, name: row.name, configured: row.configured, enabled: row.enabled, host: safeStatusHost(row.host), scope: typeof row.scope === 'string' ? row.scope : null, identityConflict: row.identityConflict, connection: { state: c.state as ConnectionState, checkedAt: statusDate(c.checkedAt), nextCheckAt: statusDate(c.nextCheckAt), latencyMs: count(c.latencyMs), errorCode: c.errorCode === null ? null : errorCode(c.errorCode) }, sync: s ? { status: knownSync(s.status), startedAt: statusDate(s.startedAt), completedAt: statusDate(s.completedAt), errors: count(s.errors), source: s.source as 'log' | 'metadata' } : null, activity: a ? { registered: count(a.registered), polling: count(a.polling), lastMetricAt: statusDate(a.lastMetricAt), readFailed: a.readFailed as boolean } : null };
  });
  return { data, observedAt: statusDate(value.observedAt)!, warnings: value.warnings as string[] };
}
