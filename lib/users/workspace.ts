import { DEFAULT_PERMISSIONS, canAccessSync, type Resource, type Action } from '@/lib/auth/permission-policy';
export const userRoles = ['admin', 'editor', 'viewer'] as const;
export const userStatuses = ['active', 'inactive', 'suspended'] as const;
export type WorkspaceRole = typeof userRoles[number];
export type WorkspaceStatus = typeof userStatuses[number];
export const roleLabels: Record<WorkspaceRole, string> = { admin: 'Yönetici', editor: 'Editör', viewer: 'İzleyici' };
export const statusLabels: Record<WorkspaceStatus, string> = { active: 'Aktif', inactive: 'Pasif', suspended: 'Askıya alınmış' };
export const resourceLabels: Record<Resource, string> = { users: 'Kullanıcılar', alarms: 'Alarmlar', devices: 'Cihazlar', organizations: 'Organizasyonlar', settings: 'Ayarlar', audit: 'Denetim kayıtları', firewall: 'Güvenlik duvarı' };
export const actionLabels: Record<Action, string> = { read: 'Görüntüleme', write: 'Ekleme / düzenleme', delete: 'Silme' };
export const roleDescriptions: Record<WorkspaceRole, string> = {
  admin: 'Tanımlı kaynakların rol kurallarında en geniş erişim. İşlem kısıtları ilgili ekrana bağlıdır.',
  editor: 'Kullanıcı, alarm ve cihaz kayıtlarını düzenleyebilir. Yönetim ayarları ve silme işlemleri matristeki kurallara bağlıdır.',
  viewer: 'İzin verilen kaynakları görüntüleyebilir. Ekleme, düzenleme ve silme izni yoktur.',
};
export interface WorkspaceUser { id: string; name: string; email: string; role: WorkspaceRole | null; status: WorkspaceStatus | null; lastLoginAt: string | null | undefined; createdAt: string | null }
export interface WorkspaceActor { id: string; role: WorkspaceRole }
export interface WorkspaceActivity { id: string; action: string; occurredAt: string | null }
const record = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v));
export function normalizedRole(value: unknown): WorkspaceRole | null { const role = typeof value === 'string' ? value.toLowerCase() : ''; return userRoles.includes(role as WorkspaceRole) ? role as WorkspaceRole : null; }
export function normalizedStatus(value: unknown): WorkspaceStatus | null { const status = typeof value === 'string' ? value.toLowerCase() : ''; return userStatuses.includes(status as WorkspaceStatus) ? status as WorkspaceStatus : null; }
function dateValue(value: unknown): string | null { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)) ? value : null; }
export function parseUser(value: unknown): WorkspaceUser {
  if (!record(value) || typeof value.id !== 'string' || !value.id || typeof value.name !== 'string' || typeof value.email !== 'string') throw new Error('Kullanıcı bilgileri beklenen biçimde alınamadı.');
  return { id: value.id, name: value.name, email: value.email, role: normalizedRole(value.role), status: normalizedStatus(value.status), lastLoginAt: value.lastLoginAt === null ? null : dateValue(value.lastLoginAt) ?? undefined, createdAt: dateValue(value.createdAt) };
}
export function parseUsers(value: unknown): WorkspaceUser[] { if (!record(value) || value.success !== true || !Array.isArray(value.data)) throw new Error('Kullanıcı listesi beklenen biçimde alınamadı.'); return value.data.map(parseUser); }
/** A success envelope alone cannot verify which account was written. */
export function verifyUserWrite(value: Record<string, unknown>, expected: Record<string, string>): void {
  try {
    const user = parseUser(value.data);
    if (!user.role || !user.status || Object.entries(expected).some(([key, wanted]) => user[key as keyof WorkspaceUser] !== wanted)) throw new Error('Mismatched account');
  } catch {
    throw new Error('İşlemin sonucu doğrulanamadı. Tekrar denemeden önce listeyi yenileyin.');
  }
}
export function parseActor(value: unknown): WorkspaceActor {
  if (!record(value) || value.success !== true || !record(value.user) || typeof value.user.id !== 'string' || !normalizedRole(value.user.role) || normalizedStatus(value.user.status) !== 'active') throw new Error('İşlem yetkisi doğrulanamadı.');
  return { id: value.user.id, role: normalizedRole(value.user.role)! };
}
export function parseActivities(value: unknown): WorkspaceActivity[] {
  if (!record(value) || value.success !== true || !Array.isArray(value.data)) throw new Error('Hesap kayıtları alınamadı.');
  return value.data.map(item => { if (!record(item) || typeof item.id !== 'string' || typeof item.action !== 'string') throw new Error('Hesap kayıtları beklenen biçimde alınamadı.'); return { id: item.id, action: item.action, occurredAt: dateValue(item.occurredAt) }; });
}
export function userDate(value: string | null | undefined): string { return value && dateValue(value) ? new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : 'Bilgi yok'; }
export function userSearch(value: string): string { return value.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i'); }
export function initials(user: Pick<WorkspaceUser, 'name' | 'email'>): string { return (user.name.trim() || user.email).split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('tr-TR'); }
export const permissionResources = Object.keys(resourceLabels) as Resource[];
export const permissionActions: Action[] = ['read', 'write', 'delete'];
export function roleAllows(role: WorkspaceRole | null, resource: Resource, action: Action): boolean { return role !== null && canAccessSync(role, resource, action); }
export function rolePermissionCount(role: WorkspaceRole): number { return DEFAULT_PERMISSIONS.filter(permission => permission.roles.includes(role.toUpperCase())).length; }
export function passwordChecks(password: string) { return [ { label: '8–72 karakter', valid: password.length >= 8 && password.length <= 72 }, { label: 'En az bir büyük harf', valid: /[A-Z]/.test(password) }, { label: 'En az bir rakam', valid: /[0-9]/.test(password) }, { label: 'En az bir özel karakter', valid: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) } ]; }
export interface UserDraft { name: string; email: string; role: string; status: string }
export function validateUserDraft(draft: UserDraft): string | null {
  if (!draft.name.trim() || draft.name.trim().length > 100) return 'Ad soyad 1–100 karakter olmalıdır.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) return 'Geçerli bir e-posta adresi girin.';
  if (!normalizedRole(draft.role) || !normalizedStatus(draft.status)) return 'Geçerli bir rol ve hesap durumu seçin.';
  return null;
}
export function userChanges(user: WorkspaceUser, draft: UserDraft): { field: string; before: string; after: string }[] {
  const changes = [];
  if (draft.name.trim() !== user.name) changes.push({ field: 'Ad soyad', before: user.name, after: draft.name.trim() });
  if (draft.email.trim().toLowerCase() !== user.email.toLowerCase()) changes.push({ field: 'E-posta', before: user.email, after: draft.email.trim().toLowerCase() });
  if (draft.role !== user.role) changes.push({ field: 'Rol', before: user.role ? roleLabels[user.role] : 'Bilgi yok', after: roleLabels[normalizedRole(draft.role)!] || 'Seçilmedi' });
  if (draft.status !== user.status) changes.push({ field: 'Hesap durumu', before: user.status ? statusLabels[user.status] : 'Bilgi yok', after: statusLabels[normalizedStatus(draft.status)!] || 'Seçilmedi' });
  return changes;
}
export function userPatch(user: WorkspaceUser, draft: UserDraft): Record<string, string> {
  const error = validateUserDraft(draft); if (error) throw new Error(error);
  const patch: Record<string, string> = { id: user.id };
  if (draft.name.trim() !== user.name) patch.name = draft.name.trim();
  if (draft.email.trim().toLowerCase() !== user.email.toLowerCase()) patch.email = draft.email.trim().toLowerCase();
  if (draft.role !== user.role) patch.role = draft.role;
  if (draft.status !== user.status) patch.status = draft.status;
  return patch;
}
const errors: Record<string, string> = { 'Email already exists': 'Bu e-posta adresi zaten kullanılıyor.', 'Current password is incorrect': 'Seçili hesabın mevcut parolası hatalı.', 'Current password is required': 'Seçili hesabın mevcut parolası zorunludur.', 'User not found': 'Kullanıcı artık bulunamıyor. Listeyi yenileyin.', 'Cannot delete the last admin user': 'Son yönetici hesabı silinemez.', 'User limit reached': 'Lisansın kullanıcı limitine ulaşıldı.', 'Password does not meet requirements': 'Parola güvenlik koşullarını karşılamıyor.', 'New password does not meet requirements': 'Yeni parola güvenlik koşullarını karşılamıyor.' };
export async function requestUsersJson(url: string, fallback: string, options: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<Record<string, unknown>> {
  const controller = new AbortController(), abort = () => controller.abort(), mutation = options.method && options.method !== 'GET';
  options.signal?.addEventListener('abort', abort, { once: true }); if (options.signal?.aborted) abort();
  const timer = setTimeout(abort, options.timeoutMs ?? 15000);
  try {
    const response = await fetch(url, { method: options.method || 'GET', body: options.body === undefined ? undefined : JSON.stringify(options.body), headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' }, signal: controller.signal, cache: 'no-store', credentials: 'same-origin' });
    let value: unknown;
    try { value = await response.json(); } catch { value = undefined; }
    if (controller.signal.aborted) throw new Error('timeout');
    // HTTP authorization and server failures take precedence over the response body.
    if (response.status === 401) throw new Error('Oturumunuz sona ermiş olabilir. Yeniden giriş yapın.');
    if (response.status === 403) throw new Error(record(value) && value.error === 'User limit reached' ? errors['User limit reached'] : 'Bu işlem için yetkiniz bulunmuyor.');
    if (mutation && (response.status >= 500 || !record(value))) throw new Error('İşlemin sonucu doğrulanamadı. Tekrar denemeden önce listeyi yenileyin.');
    if (!response.ok || !record(value) || value.success !== true) {
      throw new Error(record(value) && typeof value.error === 'string' && errors[value.error] ? errors[value.error] : fallback);
    }
    return value;
  } catch (failure) {
    if (controller.signal.aborted) throw new Error(mutation ? 'İşlemin sonucu doğrulanamadı. Tekrar denemeden önce listeyi yenileyin.' : 'Bilgiler zamanında alınamadı. Yeniden deneyin.');
    if (failure instanceof Error && (failure.message === fallback || Object.values(errors).includes(failure.message) || /^(Oturumunuz|Bu işlem için|İşlemin sonucu)/.test(failure.message))) throw failure;
    throw new Error(mutation ? 'İşlemin sonucu doğrulanamadı. Tekrar denemeden önce listeyi yenileyin.' : fallback);
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
}
