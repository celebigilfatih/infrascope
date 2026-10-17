import { normalizedRole, type WorkspaceRole } from '@/lib/users/workspace';
export interface InvitationRow { id: string; email: string; role: WorkspaceRole | null; status: 'pending' | 'accepted' | 'expired' | null; invitedBy: string; expiresAt: string | null; acceptedAt: string | null; createdAt: string | null }
export type DeliveryStatus = 'submitted' | 'failed' | 'development' | 'unknown';
export interface InvitationRead { rows: InvitationRow[]; observedAt: string | null; deliveryMode: 'development' | 'smtp' | 'unknown' }
export const invitationErrors = {
  INVALID_INPUT: 'Geçerli bir e-posta adresi ve rol seçin.',
  INVITE_EXISTS: 'Bu adrese ait bir davet zaten var. Listedeki davetin yeniden gönderme işlemini kullanın.',
  ACCOUNT_EXISTS: 'Bu e-posta adresiyle kayıtlı bir hesap var. Kullanıcılar ve Roller ekranından kontrol edin.',
  NOT_FOUND: 'Davet artık bulunamıyor. Listeyi yenileyin.',
  ACCEPTED: 'Kabul edilmiş bir davet yeniden gönderilemez.',
  CHANGED: 'Davet başka bir işlemde değişti. Listeyi yenileyip tekrar inceleyin.',
  LIMIT: 'Lisansın kullanıcı limitine ulaşıldı.',
  FORBIDDEN: 'Davet gönderme yetkiniz bulunmuyor.',
} as const;
export type InvitationErrorCode = keyof typeof invitationErrors;
const record = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v));
function dateValue(value: unknown): string | null { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)) ? value : null; }
export function parseInvitation(value: unknown): InvitationRow {
  if (!record(value) || typeof value.id !== 'string' || !value.id || typeof value.email !== 'string') throw new Error('Davet bilgileri beklenen biçimde alınamadı.');
  const status = typeof value.status === 'string' ? value.status.toLowerCase() : '';
  return { id: value.id, email: value.email, role: normalizedRole(value.role), status: ['pending', 'accepted', 'expired'].includes(status) ? status as InvitationRow['status'] : null, invitedBy: typeof value.invitedBy === 'string' && value.invitedBy ? value.invitedBy === 'System' ? 'Sistem' : value.invitedBy : 'Bilgi yok', expiresAt: dateValue(value.expiresAt), acceptedAt: dateValue(value.acceptedAt), createdAt: dateValue(value.createdAt) };
}
export function parseInvitationRead(value: unknown): InvitationRead {
  if (!record(value) || value.success !== true || !Array.isArray(value.data)) throw new Error('Davet listesi beklenen biçimde alınamadı.');
  return { rows: value.data.map(parseInvitation), observedAt: dateValue(value.observedAt), deliveryMode: value.deliveryMode === 'development' || value.deliveryMode === 'smtp' ? value.deliveryMode : 'unknown' };
}
export function invitationState(row: InvitationRow, now: number): { state: 'pending' | 'accepted' | 'expired' | 'unknown'; label: string; tone: 'info' | 'success' | 'warning' | 'neutral' } {
  if (row.status === 'accepted' || row.acceptedAt) return { state: 'accepted', label: 'Kabul edildi', tone: 'success' };
  if (row.status === 'expired' || (row.status === 'pending' && row.expiresAt && Date.parse(row.expiresAt) <= now)) return { state: 'expired', label: 'Süresi doldu', tone: 'warning' };
  if (row.status === 'pending' && row.expiresAt) return { state: 'pending', label: 'Kabul bekliyor', tone: 'info' };
  return { state: 'unknown', label: 'Bilgi eksik', tone: 'neutral' };
}
export function invitationRemaining(row: InvitationRow, now: number): string {
  const state = invitationState(row, now).state;
  if (state === 'accepted') return 'Kabul sonrası kullanılmaz';
  if (state === 'expired') return 'Bağlantının süresi doldu';
  if (state === 'unknown' || !row.expiresAt) return 'Kalan süre hesaplanamıyor';
  const minutes = Math.max(1, Math.ceil((Date.parse(row.expiresAt) - now) / 60000)), days = Math.floor(minutes / 1440), hours = Math.floor(minutes % 1440 / 60), remainder = minutes % 60;
  return days ? `${days} gün${hours ? ` ${hours} saat` : ''} kaldı` : hours ? `${hours} saat${remainder ? ` ${remainder} dk` : ''} kaldı` : `${remainder || 1} dk kaldı`;
}
export function canResendInvitation(row: InvitationRow, now: number): boolean { return Boolean(row.role && row.expiresAt && row.createdAt && ['pending', 'expired'].includes(invitationState(row, now).state)); }
export function deliveryMessage(status: DeliveryStatus, resend: boolean): { text: string; tone: 'info' | 'warning' | 'success' } {
  const operation = resend ? 'Davetin geçerlilik süresi yenilendi.' : 'Davet oluşturuldu.';
  if (status === 'development') return { text: `${operation} Geliştirme modunda gerçek e-posta gönderilmez.`, tone: 'info' };
  if (status === 'failed') return { text: `${operation} E-posta gönderilemedi. Yeniden göndermeden önce e-posta ayarlarını kontrol edin.`, tone: 'warning' };
  if (status === 'submitted') return { text: `${operation} İleti e-posta hizmetine iletildi; alıcının gelen kutusuna teslim edildiği doğrulanmadı.`, tone: 'success' };
  return { text: `${operation} E-posta gönderim sonucu doğrulanamadı.`, tone: 'warning' };
}
export function parseInvitationResult(value: unknown, expected: Partial<Pick<InvitationRow, 'id' | 'email' | 'role' | 'createdAt' | 'invitedBy'>> = {}): { invitation: InvitationRow; delivery: DeliveryStatus } {
  if (!record(value) || value.success !== true || !record(value.data)) throw new Error('İşlemin sonucu doğrulanamadı. Listeyi yenileyin.');
  const invitation = parseInvitation(value.data);
  if (!invitation.role || invitation.status !== 'pending' || !invitation.expiresAt || !invitation.createdAt || value.data.acceptedAt !== null ||
    !['submitted', 'failed', 'development'].includes(String(value.delivery)) ||
    value.data.emailSent !== (value.delivery !== 'failed') ||
    Object.entries(expected).some(([key, wanted]) => invitation[key as keyof InvitationRow] !== wanted)) throw new Error('İşlemin sonucu doğrulanamadı. Listeyi yenileyin.');
  return { invitation, delivery: value.delivery as DeliveryStatus };
}
export class InvitationRequestError extends Error { constructor(message: string, public uncertain = false) { super(message); } }
export async function requestInvitationJson(url: string, options: { body?: unknown; post?: boolean; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<unknown> {
  const controller = new AbortController(), abort = () => controller.abort(); options.signal?.addEventListener('abort', abort, { once: true }); if (options.signal?.aborted) abort(); const timer = setTimeout(abort, options.timeoutMs ?? 15000);
  try {
    const response = await fetch(url, { method: options.post ? 'POST' : 'GET', ...(options.body !== undefined ? { body: JSON.stringify(options.body), headers: { 'Content-Type': 'application/json' } } : {}), cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
    let value: unknown; try { value = await response.json(); } catch { value = undefined; }
    if (controller.signal.aborted) throw new Error('timeout');
    if (response.status === 401) throw new InvitationRequestError('Oturumunuz sona ermiş olabilir. Yeniden giriş yapın.');
    if (response.status === 403) throw new InvitationRequestError(record(value) && (value.code === 'LIMIT' || value.error === 'User limit reached') ? invitationErrors.LIMIT : invitationErrors.FORBIDDEN);
    if (options.post && (response.status >= 500 || !record(value))) throw new InvitationRequestError('İşlemin sonucu doğrulanamadı. Yeniden göndermeden önce listeyi yenileyin.', true);
    if (!response.ok || !record(value) || value.success !== true) {
      const code = record(value) && typeof value.code === 'string' && Object.prototype.hasOwnProperty.call(invitationErrors, value.code) ? value.code as InvitationErrorCode : null;
      throw new InvitationRequestError(code ? invitationErrors[code] : options.post ? 'Davet işlemi tamamlanamadı. Bilgileri kontrol edin.' : 'Davet listesi alınamadı.');
    }
    return value;
  } catch (error) {
    if (error instanceof InvitationRequestError) throw error;
    throw new InvitationRequestError(options.post ? 'İşlemin sonucu doğrulanamadı. Yeniden göndermeden önce listeyi yenileyin.' : 'Davet bilgileri alınamadı veya zaman aşımına uğradı. Yeniden deneyin.', Boolean(options.post));
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
}
