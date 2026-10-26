import { userSearch } from '@/lib/users/workspace';
import { criticalityLabels, relationLabels, relationLabel, criticalityLabel, serviceTypeLabel, serviceStateLabels, type AppDevice } from './applications';

export const dependencyTypes = Object.keys(relationLabels);
export const dependencyImportance = Object.keys(criticalityLabels);
export const relationDescriptions: Record<string, string> = {
  DEPENDS_ON: 'Kaynak servis, hedef cihaza bağımlı olarak tanımlanır.', REQUIRES: 'Kaynak servisin hedef cihaza ihtiyaç duyduğu kaydedilir.',
  PROVIDES: 'Kaynak servisin hedef cihaza hizmet sağladığı kaydedilir.', SUPPORTS: 'Kaynak servisin hedef cihazı desteklediği kaydedilir.',
  COMMUNICATES_WITH: 'Kaynak servis ile hedef cihaz arasındaki iletişim ilişkisi kaydedilir.', DEPLOYED_ON: 'Kaynak servisin hedef cihaza dağıtıldığı kaydedilir.',
  HOSTED_ON: 'Kaynak servisin hedef cihazda barındırıldığı kaydedilir.', CONNECTED_TO: 'Kaynak servis ile hedef cihaz arasındaki bağlantı kaydedilir.',
};
export const relationDescription = (type: string) => Object.prototype.hasOwnProperty.call(relationDescriptions, type) ? relationDescriptions[type] : 'Kaynağın bildirdiği ilişki türü tanınmıyor.';
export interface DependencySource { id: string; name: string; displayName: string | null; type: string; status: string; port: number | null; protocol: string | null; deviceId: string; device: AppDevice; applicationId: string | null; application: { id: string; name: string; version: string | null } | null }
export interface WorkspaceDependency { id: string; sourceServiceId: string; targetDeviceId: string; type: string; criticality: string; description: string | null; createdAt: string | null; updatedAt: string | null; sourceService: DependencySource; targetDevice: AppDevice }
export interface DependenciesSnapshot { rows: WorkspaceDependency[]; readAt: string; canWrite: boolean; canDelete: boolean }
export interface DependencyOptions { services: DependencySource[]; devices: AppDevice[] }
export interface DependencyDraft { sourceServiceId: string; targetDeviceId: string; type: string; criticality: string; description: string }
export const dependencyObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
const optional = (v: unknown) => text(v) ? v : null;
export const dependencyDate = (v: unknown): string | null => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v)) ? v : null;
function device(v: unknown, id?: string): AppDevice { if (!dependencyObject(v) || !text(v.id) || id !== undefined && v.id !== id || !text(v.name)) throw Error('İlişkinin cihaz kimliği doğrulanamadı.'); return { id: v.id, name: v.name, managementIp: optional(v.managementIp) }; }
function source(s: unknown): DependencySource {
  if (!dependencyObject(s) || !text(s.id) || !text(s.name) || !text(s.deviceId) || !(s.applicationId === null || text(s.applicationId))) throw Error('Kaynak servis bilgileri doğrulanamadı.');
  let application: DependencySource['application'] = null;
  if (s.applicationId === null) { if (s.application !== null) throw Error('Kaynak uygulama ataması doğrulanamadı.'); }
  else { if (!dependencyObject(s.application) || s.application.id !== s.applicationId || !text(s.application.name)) throw Error('Kaynak uygulama kimliği doğrulanamadı.'); application = { id: s.applicationId, name: s.application.name, version: optional(s.application.version) }; }
  return { id: s.id, name: s.name, displayName: optional(s.displayName), type: optional(s.type) || 'UNKNOWN', status: typeof s.status === 'string' && Object.prototype.hasOwnProperty.call(serviceStateLabels, s.status) ? s.status : 'UNKNOWN', port: Number.isSafeInteger(s.port) && Number(s.port) >= 1 && Number(s.port) <= 65535 ? Number(s.port) : null, protocol: typeof s.protocol === 'string' && ['TCP', 'UDP', 'BOTH'].includes(s.protocol) ? s.protocol : null, deviceId: s.deviceId, device: device(s.device, s.deviceId), applicationId: s.applicationId, application };
}
export function parseDependency(v: unknown): WorkspaceDependency {
  if (!dependencyObject(v) || !text(v.id) || !text(v.sourceServiceId) || !text(v.targetDeviceId)) throw Error('İlişki kaydı doğrulanamadı.');
  const s = source(v.sourceService); if (s.id !== v.sourceServiceId) throw Error('İlişkinin kaynak servis yönü doğrulanamadı.');
  return { id: v.id, sourceServiceId: v.sourceServiceId, targetDeviceId: v.targetDeviceId, type: optional(v.type) || 'UNKNOWN', criticality: optional(v.criticality) || 'UNKNOWN', description: optional(v.description), createdAt: dependencyDate(v.createdAt), updatedAt: dependencyDate(v.updatedAt), sourceService: s, targetDevice: device(v.targetDevice, v.targetDeviceId) };
}
export function parseDependenciesSnapshot(v: unknown): DependenciesSnapshot {
  if (!dependencyObject(v) || v.success !== true || v.source !== 'database' || !dependencyDate(v.readAt) || Date.parse(String(v.readAt)) > Date.now() + 5000 || typeof v.canWrite !== 'boolean' || typeof v.canDelete !== 'boolean' || !Array.isArray(v.data)) throw Error('Bağımlılık listesi doğrulanamadı.');
  const rows = v.data.map(parseDependency);
  if (new Set(rows.map(r => r.id)).size !== rows.length || new Set(rows.map(r => JSON.stringify([r.sourceServiceId, r.targetDeviceId, r.type]))).size !== rows.length) throw Error('İlişki kimlikleri yineleniyor.');
  return { rows, readAt: String(v.readAt), canWrite: v.canWrite, canDelete: v.canDelete };
}
export function parseDependencyOptions(v: unknown): DependencyOptions {
  if (!dependencyObject(v) || v.success !== true || v.source !== 'database' || !Array.isArray(v.services) || !Array.isArray(v.devices)) throw Error('Servis ve cihaz seçenekleri alınamadı.');
  const services = v.services.map(source), devices = v.devices.map(d => device(d));
  if (new Set(services.map(s => s.id)).size !== services.length || new Set(devices.map(d => d.id)).size !== devices.length) throw Error('Seçenek kimlikleri yineleniyor.');
  return { services, devices };
}
export function dependenciesSummary(rows: WorkspaceDependency[]) { return { total: rows.length, sources: new Set(rows.map(r => r.sourceServiceId)).size, targets: new Set(rows.map(r => r.targetDeviceId)).size, important: rows.filter(r => ['CRITICAL', 'HIGH'].includes(r.criticality)).length }; }
export function filterDependencies(rows: WorkspaceDependency[], f: { search: string; type: string; importance: string }) {
  const query = userSearch(f.search.trim());
  return rows.filter(r => (!f.type || (f.type === '__unknown' ? !dependencyTypes.includes(r.type) : r.type === f.type)) && (!f.importance || (f.importance === '__unknown' ? !dependencyImportance.includes(r.criticality) : r.criticality === f.importance)) && (!query || userSearch([r.sourceService.name, r.sourceService.displayName, r.sourceService.device.name, r.sourceService.device.managementIp, r.sourceService.application?.name, r.sourceService.application?.version, serviceTypeLabel(r.sourceService.type), r.sourceService.port, r.targetDevice.name, r.targetDevice.managementIp, relationLabel(r.type), criticalityLabel(r.criticality), r.description].join(' ')).includes(query)));
}
export function dependencyPayload(v: unknown, edit = false) {
  if (!dependencyObject(v)) throw Error('İlişki bilgileri gereklidir.');
  if (!edit && (!text(v.sourceServiceId) || !text(v.targetDeviceId) || String(v.sourceServiceId).length > 200 || String(v.targetDeviceId).length > 200)) throw Error('Kaynak servis ve hedef cihaz seçilmelidir.');
  const type = v.type === undefined && !edit ? 'DEPENDS_ON' : v.type, criticality = v.criticality === undefined && !edit ? 'MEDIUM' : v.criticality;
  if (type !== undefined && (typeof type !== 'string' || !dependencyTypes.includes(type))) throw Error('Geçerli bir ilişki türü seçin.');
  if (criticality !== undefined && (typeof criticality !== 'string' || !dependencyImportance.includes(criticality))) throw Error('Geçerli bir önem seviyesi seçin.');
  if (v.description !== undefined && v.description !== null && (typeof v.description !== 'string' || v.description.length > 2000)) throw Error('Açıklama en fazla 2000 karakter olabilir.');
  if (edit && type === undefined && criticality === undefined && v.description === undefined) throw Error('Güncellenecek alan seçilmelidir.');
  return { ...(!edit ? { sourceServiceId: String(v.sourceServiceId).trim(), targetDeviceId: String(v.targetDeviceId).trim() } : {}), ...(type !== undefined ? { type: type as string } : {}), ...(criticality !== undefined ? { criticality: criticality as string } : {}), ...(v.description !== undefined ? { description: typeof v.description === 'string' && v.description.trim() ? v.description.trim() : null } : {}) };
}
