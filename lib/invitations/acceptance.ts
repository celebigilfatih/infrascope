import { normalizedRole, type WorkspaceRole } from '@/lib/users/workspace';

export interface VerificationData { email: string; role: WorkspaceRole; invitedBy: string; expiresAt: string }
export class VerificationError extends Error { constructor(message: string, public invalid = false, public uncertain = false) { super(message); } }
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));

async function request(token: string, body?: { name: string; password: string }, signal?: AbortSignal) {
  const controller = new AbortController(), abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
  const timer = setTimeout(abort, 15000);
  try {
    const response = await fetch(body ? '/api/users/verify' : '/api/users/verify?token=' + encodeURIComponent(token), {
      method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'same-origin', signal: controller.signal,
      ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ...body }) } : {}),
    });
    let value: unknown; try { value = await response.json(); } catch { value = undefined; }
    if (controller.signal.aborted) throw new Error('Request cancelled');
    if (!response.ok || !record(value) || value.success !== true) {
      if (body && (response.status >= 500 || !record(value))) throw new VerificationError('Hesap oluşturma sonucu doğrulanamadı. Yeniden göndermeden önce giriş ekranından hesap durumunu kontrol edin.', false, true);
      if (!body && (response.status >= 500 || !record(value))) throw new VerificationError('Davet şu anda doğrulanamıyor. Yeniden deneyin.');
      if (response.status === 429) throw new VerificationError('Çok fazla deneme yapıldı. Bir süre bekleyip yeniden deneyin.');
      if (response.status === 403) throw new VerificationError('Hesap oluşturma lisans sınırı nedeniyle tamamlanamadı. Sistem yöneticinizle görüşün.');
      if (response.status === 409) throw new VerificationError('Davet veya hesap durumu değişti. Giriş ekranından hesap durumunu kontrol edin.');
      throw new VerificationError(body ? 'Bilgiler doğrulanamadı. Davet bağlantısını, adınızı ve parola koşullarını kontrol edin.' : 'Davet bağlantısı geçersiz veya artık kullanılamıyor.', !body && response.status === 400);
    }
    return value;
  } catch (error) {
    if (error instanceof VerificationError) throw error;
    throw new VerificationError(body ? 'Hesap oluşturma sonucu doğrulanamadı. Yeniden göndermeden önce giriş ekranından hesap durumunu kontrol edin.' : 'Davet şu anda doğrulanamıyor. Yeniden deneyin.', false, Boolean(body));
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
export async function readInvitationToken(token: string, signal?: AbortSignal): Promise<VerificationData> {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new VerificationError('Davet bağlantısı geçersiz veya artık kullanılamıyor.', true);
  const value = await request(token, undefined, signal), data = value.data;
  if (value.valid !== true || !record(data) || typeof data.email !== 'string' || !normalizedRole(data.role) || typeof data.invitedBy !== 'string' || typeof data.expiresAt !== 'string' || !Number.isFinite(Date.parse(data.expiresAt))) throw new VerificationError('Davet bilgileri beklenen biçimde alınamadı. Yeniden deneyin.');
  return { email: data.email, role: normalizedRole(data.role)!, invitedBy: data.invitedBy, expiresAt: data.expiresAt };
}
export async function acceptInvitationToken(token: string, name: string, password: string, expected: VerificationData) {
  const value = await request(token, { name: name.trim(), password }), data = value.data;
  if (!record(data) || typeof data.id !== 'string' || !data.id || data.name !== name.trim() || data.email !== expected.email || normalizedRole(data.role) !== expected.role) throw new VerificationError('Hesap oluşturma sonucu doğrulanamadı. Yeniden göndermeden önce giriş ekranından hesap durumunu kontrol edin.', false, true);
}
