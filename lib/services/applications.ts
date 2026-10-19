import { userSearch } from '@/lib/users/workspace';

export const appStates = ['running', 'failed', 'degraded', 'partial', 'stopped', 'unknown', 'unlinked'] as const;
export type AppState = typeof appStates[number];
export const appStateLabels: Record<AppState, string> = { running: 'Servisler çalışıyor', failed: 'Başarısız servis var', degraded: 'Sorunlu servis var', partial: 'Kısmen çalışıyor', stopped: 'Servisler durmuş', unknown: 'Durum bilgisi eksik', unlinked: 'Servis bağlı değil' };
export const serviceStateLabels: Record<string, string> = { RUNNING: 'Çalışıyor', STOPPED: 'Durmuş', DEGRADED: 'Sorunlu', FAILED: 'Başarısız', UNKNOWN: 'Bilinmiyor' };
export const relationLabels: Record<string, string> = { DEPENDS_ON: 'Bağımlı', REQUIRES: 'Gerektirir', PROVIDES: 'Sağlar', SUPPORTS: 'Destekler', COMMUNICATES_WITH: 'İletişim kurar', DEPLOYED_ON: 'Dağıtıldığı cihaz', HOSTED_ON: 'Barındırıldığı cihaz', CONNECTED_TO: 'Bağlı' };
export const serviceTypeLabels: Record<string, string> = { WEB_SERVER: 'Web sunucusu', DATABASE: 'Veritabanı', DNS: 'DNS', DHCP: 'DHCP', LDAP: 'LDAP', MONITORING: 'İzleme', BACKUP: 'Yedekleme', FILE_SERVER: 'Dosya sunucusu', MAIL_SERVER: 'E-posta sunucusu', PROXY: 'Vekil sunucu', VPN: 'VPN', LOAD_BALANCER: 'Yük dengeleyici', STORAGE: 'Depolama', CONTAINER_ORCHESTRATION: 'Konteyner yönetimi', OTHER: 'Diğer' };
export const criticalityLabels: Record<string, string> = { CRITICAL: 'Kritik', HIGH: 'Yüksek', MEDIUM: 'Orta', LOW: 'Düşük', INFORMATIONAL: 'Bilgi' };
export interface AppDevice { id: string; name: string; managementIp: string | null }
export interface AppRelation { id: string; sourceServiceId: string; targetDeviceId: string; type: string; criticality: string; description: string | null; targetDevice: AppDevice }
export interface AppService { id: string; applicationId: string; name: string; displayName: string | null; description: string | null; type: string; status: string; port: number | null; protocol: string | null; updatedAt: string | null; deviceId: string; device: AppDevice; dependencies: AppRelation[] }
export interface WorkspaceApplication { id: string; name: string; vendor: string | null; version: string | null; createdAt: string | null; updatedAt: string | null; services: AppService[] }
export interface ApplicationsSnapshot { rows: WorkspaceApplication[]; readAt: string; unassignedServices: number }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
const optionalText = (v: unknown) => text(v) ? v : null;
const date = (v: unknown): string | null => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(v) || !Number.isFinite(Date.parse(v))) return null;
  // Date.parse permits calendar rollover; keep impossible record dates unknown.
  const day = new Date(v.slice(0, 10) + 'T00:00:00Z');
  return day.toISOString().slice(0, 10) === v.slice(0, 10) ? v : null;
};
const distinct = (ids: string[]) => new Set(ids).size === ids.length;
function device(v: unknown, id: string): AppDevice {
  if (!object(v) || v.id !== id || !text(v.name)) throw Error('Servisin cihaz eşleştirmesi doğrulanamadı.');
  return { id, name: v.name, managementIp: optionalText(v.managementIp) };
}
export function parseApplicationsSnapshot(value: unknown): ApplicationsSnapshot {
  if (!object(value) || value.success !== true || value.source !== 'database' || !date(value.readAt) || Date.parse(String(value.readAt)) > Date.now() + 5000 || !Number.isSafeInteger(value.unassignedServices) || Number(value.unassignedServices) < 0 || !Array.isArray(value.data)) throw Error('Uygulama kayıtları beklenen biçimde alınamadı.');
  const serviceIds: string[] = [], relationIds: string[] = [];
  const rows = value.data.map(app => {
    if (!object(app) || !text(app.id) || !text(app.name) || !Array.isArray(app.services)) throw Error('Uygulama ve bağlı servis listesi doğrulanamadı.');
    const services = app.services.map(s => {
      if (!object(s) || !text(s.id) || !text(s.name) || s.applicationId !== app.id || !text(s.deviceId) || !Array.isArray(s.dependencies)) throw Error('Uygulamaya bağlı servis doğrulanamadı.');
      serviceIds.push(s.id);
      const dependencies = s.dependencies.map(d => {
        if (!object(d) || !text(d.id) || d.sourceServiceId !== s.id || !text(d.targetDeviceId)) throw Error('Servis ilişkisinin yönü doğrulanamadı.');
        relationIds.push(d.id);
        return { id: d.id, sourceServiceId: s.id as string, targetDeviceId: d.targetDeviceId, type: optionalText(d.type) || 'UNKNOWN', criticality: optionalText(d.criticality) || 'UNKNOWN', description: optionalText(d.description), targetDevice: device(d.targetDevice, d.targetDeviceId) };
      });
      return { id: s.id, applicationId: app.id as string, name: s.name, displayName: optionalText(s.displayName), description: optionalText(s.description), type: optionalText(s.type) || 'UNKNOWN', status: typeof s.status === 'string' && Object.prototype.hasOwnProperty.call(serviceStateLabels, s.status) ? s.status : 'UNKNOWN', port: Number.isSafeInteger(s.port) && Number(s.port) >= 1 && Number(s.port) <= 65535 ? Number(s.port) : null, protocol: typeof s.protocol === 'string' && ['TCP', 'UDP', 'BOTH'].includes(s.protocol) ? s.protocol : null, updatedAt: date(s.updatedAt), deviceId: s.deviceId, device: device(s.device, s.deviceId), dependencies };
    });
    return { id: app.id, name: app.name, vendor: optionalText(app.vendor), version: optionalText(app.version), createdAt: date(app.createdAt), updatedAt: date(app.updatedAt), services };
  });
  if (!distinct(rows.map(app => app.id)) || !distinct(serviceIds) || !distinct(relationIds)) throw Error('Uygulama ilişkilerinde yinelenen kimlikler alındı.');
  return { rows, readAt: String(value.readAt), unassignedServices: Number(value.unassignedServices) };
}
export function applicationState(app: WorkspaceApplication): AppState {
  const states = app.services.map(s => s.status);
  if (!states.length) return 'unlinked';
  if (states.includes('FAILED')) return 'failed';
  if (states.includes('DEGRADED')) return 'degraded';
  if (states.some(s => !['RUNNING', 'STOPPED'].includes(s))) return 'unknown';
  if (states.every(s => s === 'RUNNING')) return 'running';
  if (states.every(s => s === 'STOPPED')) return 'stopped';
  return 'partial';
}
export function appRelations(app: WorkspaceApplication) { return app.services.flatMap(service => service.dependencies.map(relation => ({ service, relation }))); }
export const appDeviceCount = (app: WorkspaceApplication) => new Set(app.services.map(s => s.deviceId)).size;
export function applicationSummary(rows: WorkspaceApplication[]) {
  return { applications: rows.length, attention: rows.filter(app => ['failed', 'degraded', 'partial', 'stopped'].includes(applicationState(app))).length, services: rows.reduce((sum, app) => sum + app.services.length, 0), relations: rows.reduce((sum, app) => sum + appRelations(app).length, 0) };
}
export function filterApplications(rows: WorkspaceApplication[], filters: { search: string; state: string; relation: string; vendor: string }) {
  const query = userSearch(filters.search.trim());
  return rows.filter(app => (!filters.state || applicationState(app) === filters.state) && (!filters.vendor || JSON.stringify(app.vendor) === filters.vendor) && (!filters.relation || (filters.relation === 'linked' ? appRelations(app).length > 0 : appRelations(app).length === 0)) && (!query || userSearch([app.name, app.vendor, app.version, appStateLabels[applicationState(app)], ...app.services.flatMap(s => [s.name, s.displayName, s.description, s.device.name, s.device.managementIp, serviceTypeLabel(s.type), s.port, ...s.dependencies.flatMap(d => [d.targetDevice.name, d.targetDevice.managementIp, d.description, relationLabel(d.type)])])].join(' ')).includes(query)));
}
const knownLabel = (labels: Record<string, string>, key: string, fallback: string) => Object.prototype.hasOwnProperty.call(labels, key) ? labels[key] : fallback;
export const relationLabel = (type: string) => knownLabel(relationLabels, type, 'Türü bilinmeyen ilişki');
export const serviceTypeLabel = (type: string) => knownLabel(serviceTypeLabels, type, 'Tür bilgisi yok');
export const criticalityLabel = (value: string) => knownLabel(criticalityLabels, value, 'Bilgi yok');
export const servicePortLabel = (service: Pick<AppService, 'port' | 'protocol'>) => `${service.port ?? 'Port bilgisi yok'}${service.protocol ? ` / ${service.protocol === 'BOTH' ? 'TCP ve UDP' : service.protocol}` : ' · Protokol bilgisi yok'}`;
