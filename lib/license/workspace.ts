import type { SemanticTone } from '@/components/ui/semantic-badge';
import { getFeatureMatrix, type LicenseTier } from './features';

export interface LicenseView {
  valid: boolean | null;
  tier: LicenseTier | null;
  maxDevices: number | null;
  maxUsers: number | null;
  validUntil: string | null;
  graceMode: boolean | null;
  lastValidated: string | null;
  hasKey: boolean | null;
  maskedKey: string | null;
  machineId: string | null;
}
export interface LicenseSnapshot {
  license: LicenseView;
  usage: { deviceCount: number | null; userCount: number | null };
  observedAt: string | null;
}
export const tierLabels: Record<LicenseTier, string> = { TRIAL: 'Deneme', STANDARD: 'Standart', ENTERPRISE: 'Kurumsal' };
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
export function countValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function timestamp(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
}
export function parseLicenseSnapshot(value: unknown): LicenseSnapshot {
  if (!record(value) || !record(value.license) || value.success === false || typeof value.license.valid !== 'boolean') throw new Error('Lisans bilgileri beklenen biçimde alınamadı.');
  const source = value.license, usage = record(value.usage) ? value.usage : {};
  const key = typeof source.licenseKey === 'string' ? source.licenseKey.trim() : '';
  return {
    license: {
      valid: source.valid as boolean,
      tier: typeof source.tier === 'string' && Object.prototype.hasOwnProperty.call(tierLabels, source.tier) ? source.tier as LicenseTier : null,
      maxDevices: countValue(source.maxDevices), maxUsers: countValue(source.maxUsers),
      validUntil: timestamp(source.validUntil), lastValidated: timestamp(source.lastValidated),
      graceMode: typeof source.graceMode === 'boolean' ? source.graceMode : null,
      hasKey: typeof source.licenseKey === 'string' ? Boolean(key) : null,
      // The response contract is masked; never render an unexpected full key.
      maskedKey: key ? (key.length >= 12 && key.includes('****') ? `${key.slice(0, 4)}••••${key.slice(-4)}` : '••••••••') : null,
      machineId: typeof source.machineId === 'string' && source.machineId ? source.machineId : null,
    },
    usage: { deviceCount: countValue(usage.deviceCount), userCount: countValue(usage.userCount) },
    observedAt: timestamp(value.observedAt),
  };
}
export function licenseDate(value: string | null, includeTime = true): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Bilgi yok';
  return new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric', ...(includeTime ? { hour: '2-digit', minute: '2-digit' } as const : {}) }).format(new Date(value));
}
export function remainingDays(license: LicenseView, now: number): number | null {
  if (!license.validUntil) return null;
  return Math.max(0, Math.ceil((Date.parse(license.validUntil) - now) / 86400000));
}
export function licenseStatus(license: LicenseView | null, now: number): { label: string; tone: SemanticTone; description: string } {
  if (!license) return { label: 'Bilgi alınamadı', tone: 'neutral', description: 'Lisans durumu henüz doğrulanamıyor.' };
  if (!license.valid && license.graceMode) return { label: 'Erişim kısıtlı', tone: 'danger', description: 'Lisansın geçerli olduğu doğrulanamadı. Lisansı yöneten kişiyle iletişime geçin.' };
  if (license.validUntil && Date.parse(license.validUntil) <= now) return { label: 'Süresi doldu', tone: 'danger', description: 'Bildirilen lisans geçerlilik tarihi geçti. Güncel durumu yenileyin ve lisansı yöneten kişiyle iletişime geçin.' };
  if (!license.valid) return { label: 'Doğrulanamadı', tone: 'danger', description: 'Lisansın geçerli olduğu doğrulanamadı. Lisansı yöneten kişiyle iletişime geçin.' };
  if (license.graceMode) return { label: 'Ek süre', tone: 'warning', description: 'Lisans sunucusuyla doğrulama yapılamadı. Son başarılı doğrulamadaki bilgiler kullanılıyor; gösterilen kalan gün lisans süresidir, bağlantı için tanınan ek süre değildir.' };
  if (!license.validUntil || !license.tier || license.graceMode === null) return { label: 'Bilgiler eksik', tone: 'neutral', description: 'Durum yanıtında plan, geçerlilik tarihi veya doğrulama bilgisi eksik.' };
  if (remainingDays(license, now)! <= 30) return { label: 'Süre azalıyor', tone: 'warning', description: 'Lisansın bitişine 30 gün veya daha az kaldı. Yenileme planınızı kontrol edin.' };
  return { label: 'Aktif', tone: 'success', description: license.tier === 'TRIAL' && license.hasKey === false ? 'Yerel deneme modu kullanılıyor. Tarihler uygulamanın bildirdiği deneme süresini gösterir.' : 'Uygulamanın bildirdiği lisans geçerli. Son başarılı doğrulama zamanını aşağıda görebilirsiniz.' };
}
export function licenseCapacity(used: number | null, limit: number | null): { percent: number | null; bar: number | null; tone: SemanticTone; label: string; detail: string } {
  if (used === null || limit === null) return { percent: null, bar: null, tone: 'neutral', label: 'Bilgi eksik', detail: 'Kullanım veya limit bilgisi alınamadı; doluluk hesaplanamıyor.' };
  const percent = limit > 0 ? used / limit * 100 : null;
  if (used > limit) return { percent, bar: limit > 0 ? 100 : null, tone: 'danger', label: 'Limit aşıldı', detail: `${(used - limit).toLocaleString('tr-TR')} adet limitin üzerinde.` };
  if (limit === 0) return { percent: null, bar: null, tone: 'neutral', label: 'Kapasite yok', detail: 'Bildirilen limit 0; doluluk oranı hesaplanamaz.' };
  if (used === limit) return { percent, bar: 100, tone: 'warning', label: 'Limit doldu', detail: 'Ek kayıt için kalan kapasite bulunmuyor.' };
  return { percent, bar: Math.min(100, percent!), tone: percent! >= 90 ? 'warning' : 'success', label: percent! >= 90 ? 'Sınıra yakın' : 'Kapasite uygun', detail: `${(limit - used).toLocaleString('tr-TR')} adet kullanılabilir kapasite.` };
}
export const planFeatures: { code: string; tiers: Record<LicenseTier, boolean>; label: string }[] = Object.entries(getFeatureMatrix()).map(([code, tiers]) => ({ code, tiers, label: ({
  dashboard: 'Genel bakış', devices: 'Cihaz yönetimi', locations: 'Konumlar ve odalar', racks: 'Kabinetler', nms: 'Temel ağ izleme', alarms: 'Alarm yönetimi',
  'integrations.vmware': 'VMware entegrasyonu', 'integrations.fortigate': 'FortiGate entegrasyonu', 'integrations.zabbix': 'Zabbix entegrasyonu',
  reports: 'Temel raporlar', 'reports.advanced': 'Gelişmiş raporlar', 'api.external': 'Harici API için plan hakkı', analytics: 'Analizler', topology: 'Ağ topolojisi', services: 'Servis yönetimi', audit: 'Denetim kayıtları',
  'settings.users': 'Kullanıcı yönetimi', 'settings.license': 'Lisans yönetimi',
} as Record<string, string>)[code] || 'Diğer özellik' }));

/** Read only. Never call issuer activation/validation endpoints from this workspace. */
export async function requestLicenseSnapshot(signal?: AbortSignal, timeoutMs = 12000): Promise<LicenseSnapshot> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, timeoutMs);
  try {
    const response = await fetch('/api/license/status', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
    if (!response.ok) throw new Error(response.status === 401 ? 'Oturumunuz sona ermiş olabilir. Yeniden giriş yapın.' : response.status === 403 ? 'Lisans bilgilerini görüntüleme yetkiniz bulunmuyor.' : 'Lisans bilgileri alınamadı. Yeniden deneyin.');
    const value = await response.json();
    if (controller.signal.aborted) throw new Error('Lisans bilgileri zamanında alınamadı. Yeniden deneyin.');
    return parseLicenseSnapshot(value);
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Lisans bilgileri zamanında alınamadı. Yeniden deneyin.');
    if (error instanceof Error && /^(Lisans bilgileri|Oturumunuz|Lisans bilgilerini)/.test(error.message)) throw error;
    throw new Error('Lisans bilgileri alınamadı. Yeniden deneyin.');
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
