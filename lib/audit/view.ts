import { auditActionLabel, auditActionQuery, uiLabel } from '@/lib/i18n/tr';
import type { SemanticTone } from '@/components/ui/semantic-badge';

export interface AuditEntry {
  id: string; action: string; resource: string | null; resourceId: string | null;
  details: unknown; userId: string | null; userName: string;
  userEmail: string | null; userRole: string | null; ipAddress: string | null;
  userAgent: string | null; timestamp: string;
}
export function isAuditEntry(value: unknown): value is AuditEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return ['id', 'action', 'userName', 'timestamp'].every(key => typeof entry[key] === 'string')
    && ['resource', 'resourceId', 'userId', 'userEmail', 'userRole', 'ipAddress', 'userAgent'].every(key => entry[key] === null || typeof entry[key] === 'string');
}
export interface AuditFilters { action: string; resource: string; user: string; userId?: string; startDate: string; endDate: string }
export const emptyAuditFilters: AuditFilters = { action: '', resource: 'all', user: '', startDate: '', endDate: '' };
export function auditFilterParams(filters: AuditFilters) {
  const params = new URLSearchParams();
  if (filters.action.trim()) params.set('action', auditActionQuery(filters.action.trim()));
  if (filters.resource !== 'all') params.set('resource', filters.resource);
  if (filters.userId) params.set('userId', filters.userId);
  else if (filters.user.trim()) params.set('user', filters.user.trim());
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  return params;
}
const actions: Record<string, string> = {
  SSH_CONFIG_BACKUP_REQUESTED: 'Yedekleme istendi', SSH_CONFIG_BACKUP_COMPLETED: 'Yedekleme tamamlandı',
  SSH_CONFIG_BACKUP_FAILED: 'Yedekleme başarısız', SSH_CONFIG_BACKUP_RETRYING: 'Yedekleme yeniden denenecek',
  SSH_CONFIG_BACKUP_RECOVERED: 'Yedekleme işi kurtarıldı', SSH_CONFIG_BACKUP_READ: 'Yedek içeriği okundu',
  SSH_CONFIG_BACKUP_DELETED: 'Yedek silindi', SSH_CONFIG_BACKUP_POLICY_UPDATED: 'Yedekleme zamanlaması değiştirildi',
  SSH_CONFIG_BACKUP_RETENTION_APPLIED: 'Yedek saklama politikası uygulandı',
  'user.password_reset_request': 'Parola sıfırlama istendi', 'user.password_reset_complete': 'Parola sıfırlama tamamlandı',
  'user.password_change': 'Kullanıcı parolası değiştirildi', 'user.password_set': 'Kullanıcı parolası oluşturuldu',
  'invitation.create': 'Kullanıcı davet edildi', 'invitation.accept': 'Kullanıcı daveti kabul edildi',
  'invitation.resend': 'Davet yenilendi ve e-posta gönderimi denendi',
  first_admin_created: 'İlk yönetici oluşturuldu',
};
export function auditTitle(action: string) {
  const translated = actions[action] || auditActionLabel(action);
  return translated === action ? 'Diğer işlem' : translated;
}
export function auditKind(action: string): { tone: SemanticTone; kind: 'delete' | 'create' | 'update' | 'access' | 'other' } {
  const tokens = action.toLowerCase().split(/[._:\s-]+/);
  if (tokens.some(token => ['delete', 'deleted', 'remove', 'removed'].includes(token))) return { tone: 'danger', kind: 'delete' };
  if (tokens.some(token => ['failed', 'error', 'retrying'].includes(token))) return { tone: 'warning', kind: 'other' };
  if (tokens.some(token => ['create', 'created', 'add', 'added'].includes(token))) return { tone: 'info', kind: 'create' };
  if (tokens.some(token => ['update', 'updated', 'edit', 'change', 'changed'].includes(token))) return { tone: 'info', kind: 'update' };
  if (tokens.some(token => ['login', 'logout', 'read', 'view'].includes(token))) return { tone: 'neutral', kind: 'access' };
  return { tone: 'neutral', kind: 'other' };
}
export function auditTime(value: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Tarih bilinmiyor';
  return `${new Date(value).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })} TSİ`;
}
export function auditPreset(days: number, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (key: string) => parts.find(item => item.type === key)!.value;
  const endDate = `${part('year')}-${part('month')}-${part('day')}`;
  const startDate = new Date(Date.parse(`${endDate}T00:00:00Z`) - (days - 1) * 86400000).toISOString().slice(0, 10);
  return { startDate, endDate };
}
export const auditFieldLabels: Record<string, string> = {
  name: 'Ad', email: 'E-posta', role: 'Rol', status: 'Durum', enabled: 'Etkin',
  before: 'Önceki değer', after: 'Yeni değer', old: 'Önceki değer', new: 'Yeni değer',
  changes: 'Değişiklikler', reason: 'Gerekçe', message: 'Açıklama', description: 'Açıklama',
  userId: 'Kullanıcı kimliği', deviceId: 'Cihaz kimliği', resourceId: 'Kaynak kimliği',
  deviceName: 'Cihaz adı', backupType: 'Yedek türü', backupId: 'Yedek kimliği', jobId: 'İş kimliği',
  source: 'Kaynak', download: 'Dosya indirme', count: 'Adet', sizeBytes: 'Boyut (bayt)',
  action: 'İşlem', errorCode: 'Hata kodu', attempt: 'Deneme', revision: 'Sürüm',
  fields: 'Alanlar', method: 'Yöntem', url: 'Adres', ipAddress: 'IP adresi',
  platform: 'Platform', interval_hours: 'Yedekleme aralığı (saat)', retention_days: 'Saklama süresi (gün)',
  keep_last: 'Korunacak yedek sayısı', stale_after_hours: 'Gecikme eşiği (saat)',
  fromStatus: 'Önceki durum', toStatus: 'Yeni durum', assignment: 'Atama',
  assigneeId: 'Atanan kullanıcı kimliği', assigneeName: 'Atanan kullanıcı',
  previousAssigneeId: 'Önceki kullanıcı kimliği', previousAssigneeName: 'Önceki atanan kullanıcı',
  checksum: 'Bütünlük özeti (SHA-256)', encrypted: 'Şifreli saklama', integrityVerified: 'Bütünlük doğrulandı',
  completenessVerified: 'Eksiksizlik doğrulandı', algorithm: 'Algoritma', approvedAt: 'Onay zamanı',
  fingerprint: 'Anahtar parmak izi', approvalSource: 'Onay kaynağı', identityRechecked: 'Cihaz kimliği yeniden doğrulandı',
};
export function auditValue(value: unknown): string {
  if (value === null || value === undefined) return 'Bilgi yok';
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır';
  if (value === 'Running Config') return 'Çalışan yapılandırma';
  if (value === 'Startup Config') return 'Başlangıç yapılandırması';
  if (typeof value === 'string') return value === '' ? 'Boş değer' : uiLabel(value);
  return String(value);
}
