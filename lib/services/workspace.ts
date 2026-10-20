import { userSearch } from '@/lib/users/workspace';
import { serviceStateLabels, serviceTypeLabel, relationLabel, serviceRecordDate, type AppDevice, type AppRelation } from './applications';

export interface WorkspaceService {
  id: string; name: string; displayName: string | null; description: string | null; type: string; status: string;
  port: number | null; protocol: string | null; criticality: string; deviceId: string; device: AppDevice;
  applicationId: string | null; application: { id: string; name: string; vendor: string | null; version: string | null } | null;
  createdAt: string | null; updatedAt: string | null; dependencies: AppRelation[];
}
export interface ServicesSnapshot { rows: WorkspaceService[]; readAt: string; canDelete: boolean }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
const optional = (v: unknown) => text(v) ? v : null;
const date = serviceRecordDate;
function device(v: unknown, id: string): AppDevice {
  if (!object(v) || v.id !== id || !text(v.name)) throw Error('Servisin cihaz eşleştirmesi doğrulanamadı.');
  return { id, name: v.name, managementIp: optional(v.managementIp) };
}
export function parseServicesSnapshot(value: unknown): ServicesSnapshot {
  if (!object(value) || value.success !== true || value.source !== 'database' || !date(value.readAt) || Date.parse(String(value.readAt)) > Date.now() + 5000 || typeof value.canDelete !== 'boolean' || !Array.isArray(value.data)) throw Error('Servis listesi doğrulanamadı.');
  const relationIds: string[] = [];
  const rows = value.data.map(s => {
    if (!object(s) || !text(s.id) || !text(s.name) || !text(s.deviceId) || !Array.isArray(s.dependencies) || !(s.applicationId === null || text(s.applicationId))) throw Error('Servis bilgileri doğrulanamadı.');
    let application: WorkspaceService['application'] = null;
    if (s.applicationId === null) { if (s.application !== null) throw Error('Uygulama ataması doğrulanamadı.'); }
    else { if (!object(s.application) || s.application.id !== s.applicationId || !text(s.application.name)) throw Error('Servisin uygulama eşleştirmesi doğrulanamadı.'); application = { id: s.applicationId, name: s.application.name, vendor: optional(s.application.vendor), version: optional(s.application.version) }; }
    const dependencies = s.dependencies.map(d => {
      if (!object(d) || !text(d.id) || d.sourceServiceId !== s.id || !text(d.targetDeviceId)) throw Error('Servis ilişkisinin yönü doğrulanamadı.');
      relationIds.push(d.id);
      return { id: d.id, sourceServiceId: s.id as string, targetDeviceId: d.targetDeviceId, type: optional(d.type) || 'UNKNOWN', criticality: optional(d.criticality) || 'UNKNOWN', description: optional(d.description), targetDevice: device(d.targetDevice, d.targetDeviceId) };
    });
    return { id: s.id, name: s.name, displayName: optional(s.displayName), description: optional(s.description), type: optional(s.type) || 'UNKNOWN', status: typeof s.status === 'string' && Object.prototype.hasOwnProperty.call(serviceStateLabels, s.status) ? s.status : 'UNKNOWN', port: Number.isSafeInteger(s.port) && Number(s.port) >= 1 && Number(s.port) <= 65535 ? Number(s.port) : null, protocol: typeof s.protocol === 'string' && ['TCP', 'UDP', 'BOTH'].includes(s.protocol) ? s.protocol : null, criticality: optional(s.criticality) || 'UNKNOWN', deviceId: s.deviceId, device: device(s.device, s.deviceId), applicationId: s.applicationId, application, createdAt: date(s.createdAt), updatedAt: date(s.updatedAt), dependencies };
  });
  if (new Set(rows.map(s => s.id)).size !== rows.length || new Set(relationIds).size !== relationIds.length) throw Error('Servis veya ilişki kimlikleri yineleniyor.');
  return { rows, readAt: String(value.readAt), canDelete: value.canDelete };
}
export function servicesSummary(rows: WorkspaceService[]) { return { total: rows.length, running: rows.filter(s => s.status === 'RUNNING').length, attention: rows.filter(s => ['FAILED', 'DEGRADED', 'STOPPED'].includes(s.status)).length, unknown: rows.filter(s => s.status === 'UNKNOWN').length, unassigned: rows.filter(s => s.applicationId === null).length, relations: rows.reduce((sum, s) => sum + s.dependencies.length, 0) }; }
export function filterServices(rows: WorkspaceService[], filters: { search: string; status: string; application: string; relation: string }) {
  const query = userSearch(filters.search.trim());
  return rows.filter(s => (!filters.status || s.status === filters.status) && (!filters.application || JSON.stringify(s.applicationId) === filters.application) && (!filters.relation || (filters.relation === 'linked' ? s.dependencies.length > 0 : s.dependencies.length === 0)) && (!query || userSearch([s.name, s.displayName, s.description, serviceTypeLabel(s.type), serviceStateLabels[s.status], s.port, s.protocol, s.device.name, s.device.managementIp, s.application?.name, s.application?.vendor, s.application?.version, ...s.dependencies.flatMap(d => [relationLabel(d.type), d.description, d.targetDevice.name, d.targetDevice.managementIp])].join(' ')).includes(query)));
}
