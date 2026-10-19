import type { FirewallListItem } from '@/components/firewall/types';
export const firewallModuleKeys = ['interfaces', 'vlans', 'policies', 'addresses'] as const;
export type FirewallModuleKey = typeof firewallModuleKeys[number];
export const firewallModuleLabels = { interfaces: 'Arabirimler', vlans: 'VLAN kayıtları', policies: 'Güvenlik politikaları', addresses: 'Adres nesneleri' };
export interface FirewallSettingsDraft { authMode: 'password' | 'token'; username: string; password: string; token: string; interval: string; enabled: boolean; syncMode: 'rest' | 'snmp' | 'both'; modules: Record<FirewallModuleKey, boolean> }
export interface FirewallSyncSummary { status: 'success' | 'partial' | 'failed' | null; startedAt: string | null; completedAt: string | null; processed: number | null; errors: number | null }
export interface FirewallWorkspace { configId: string; vdom: string; host: string; name: string; username: string; hasPassword: boolean; hasToken: boolean; interval: number | null; enabled: boolean; syncMode: FirewallSettingsDraft['syncMode']; modules: FirewallSettingsDraft['modules']; updatedAt: string | null; lastSync: FirewallSyncSummary | null }
export const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const text = (v: unknown) => typeof v === 'string' ? v : '';
export const firewallDateValue = (v: unknown): string | null => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v)) ? v : null;
const count = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
export const firewallSyncStatus = (v: unknown): FirewallSyncSummary['status'] => v === 'success' || v === 'partial' || v === 'failed' ? v : null;
export const firewallSyncLabels = { success: 'Tamamlandı', partial: 'Kısmen tamamlandı', failed: 'Başarısız' };
export function parseFirewallList(value: unknown): FirewallListItem[] {
  if (!object(value) || value.success !== true || !Array.isArray(value.data)) throw Error('Güvenlik duvarı listesi alınamadı.');
  return value.data.map(row => { if (!object(row) || typeof row.configId !== 'string' || !(row.id === null || typeof row.id === 'string') || typeof row.name !== 'string' || typeof row.host !== 'string' || typeof row.vdom !== 'string' || typeof row.enabled !== 'boolean' || typeof row.credentialSet !== 'boolean' || typeof row.requiresInventoryLink !== 'boolean') throw Error('Güvenlik duvarı listesi beklenen biçimde alınamadı.'); return row as unknown as FirewallListItem; });
}
export function restObservation(row: FirewallListItem): { state: 'available' | 'unavailable' | 'stale' | 'unknown'; label: string; at: string | null; tone: 'success' | 'danger' | 'warning' | 'neutral' } {
  const source = Array.isArray(row.monitoring?.sources) ? row.monitoring.sources.find(entry => entry.source === 'fortigate-rest') : undefined;
  const at = firewallDateValue(source?.checkedAt) || firewallDateValue(row.monitoring?.lastProbeAt);
  if (source?.status === 'available') return { state: 'available', label: 'Son REST kontrolü başarılı', at, tone: 'success' };
  if (source?.status === 'unavailable') return { state: 'unavailable', label: 'Son REST kontrolü başarısız', at, tone: 'danger' };
  if (source?.status === 'stale') return { state: 'stale', label: 'REST verisi gecikmiş', at, tone: 'warning' };
  return { state: 'unknown', label: 'REST sonucu yok', at, tone: 'neutral' };
}
export function parseFirewallWorkspace(value: unknown): FirewallWorkspace {
  if (!object(value) || value.success !== true || !object(value.data)) throw Error('FortiGate ayarları alınamadı.');
  const row = value.data;
  if (typeof row.configId !== 'string' || typeof row.vdom !== 'string' || typeof row.enabled !== 'boolean' || typeof row.hasPassword !== 'boolean' || typeof row.hasToken !== 'boolean' || !Object.prototype.hasOwnProperty.call(row, 'lastSync') || !['rest', 'snmp', 'both'].includes(String(row.syncMode))) throw Error('FortiGate ayarları beklenen biçimde alınamadı.');
  if (row.modules !== undefined && !object(row.modules)) throw Error('Senkronizasyon kapsamı okunamadı.');
  const modules = { interfaces: true, vlans: true, policies: true, addresses: true };
  for (const key of firewallModuleKeys) { const v = object(row.modules) ? row.modules[key] : undefined; if (v !== undefined && typeof v !== 'boolean') throw Error('Senkronizasyon kapsamı okunamadı.'); if (typeof v === 'boolean') modules[key] = v; }
  const log = object(row.lastSync) ? row.lastSync : null;
  return { configId: row.configId, vdom: row.vdom, host: text(row.host), name: text(row.name), username: text(row.username), hasPassword: row.hasPassword === true, hasToken: row.hasToken === true, interval: typeof row.interval === 'number' && Number.isInteger(row.interval) && row.interval >= 1 && row.interval <= 1440 ? row.interval : null, enabled: row.enabled, syncMode: row.syncMode as FirewallWorkspace['syncMode'], modules, updatedAt: firewallDateValue(row.updatedAt), lastSync: log ? { status: firewallSyncStatus(log.status), startedAt: firewallDateValue(log.startedAt), completedAt: firewallDateValue(log.completedAt), processed: count(log.processed), errors: count(log.errors) } : null };
}
export function firewallDraft(row: FirewallWorkspace): FirewallSettingsDraft { return { authMode: row.hasToken ? 'token' : 'password', username: row.username, password: '', token: '', interval: row.interval?.toString() || '', enabled: row.enabled, syncMode: row.syncMode, modules: { ...row.modules } }; }
export function firewallSettingsChanges(draft: FirewallSettingsDraft, row: FirewallWorkspace): string[] {
  const previous = firewallDraft(row), changes: string[] = [];
  if (draft.authMode !== previous.authMode) changes.push('Kimlik doğrulama yöntemi');
  if (draft.username.trim() !== previous.username) changes.push('Kullanıcı adı');
  if (draft.password) changes.push('Yeni parola girildi'); if (draft.token) changes.push('Yeni erişim anahtarı girildi');
  if (draft.interval !== previous.interval) changes.push('Senkronizasyon aralığı'); if (draft.enabled !== previous.enabled) changes.push('Profil etkinliği'); if (draft.syncMode !== previous.syncMode) changes.push('Veri toplama yöntemi');
  for (const key of firewallModuleKeys) if (draft.modules[key] !== previous.modules[key]) changes.push(firewallModuleLabels[key]);
  return changes;
}
export function validateFirewallSettings(draft: unknown, saved: { username: string; hasPassword: boolean; hasToken: boolean } | null, testing = false): string | null {
  if (!object(draft) || !['password', 'token'].includes(String(draft.authMode)) || typeof draft.username !== 'string' || typeof draft.password !== 'string' || typeof draft.token !== 'string') return 'Kimlik doğrulama bilgilerini kontrol edin.';
  if (draft.authMode === 'token' && !draft.token && (testing || !saved?.hasToken)) return 'API erişim anahtarını girin.';
  if (draft.authMode === 'password' && (!draft.username.trim() || (!draft.password && (testing || !saved?.hasPassword || draft.username.trim() !== saved.username)))) return 'Kullanıcı adı ve parolayı girin. Kullanıcı değiştiğinde parola yeniden gerekir.';
  if (!testing && (typeof draft.interval !== 'string' || !/^\d+$/.test(draft.interval) || Number(draft.interval) < 1 || Number(draft.interval) > 1440)) return 'Senkronizasyon aralığı 1–1440 arasında tam dakika olmalıdır.';
  if (!testing && (typeof draft.enabled !== 'boolean' || !['rest', 'snmp', 'both'].includes(String(draft.syncMode)) || !object(draft.modules) || firewallModuleKeys.some(key => typeof (draft.modules as Record<string, unknown>)[key] !== 'boolean') || Object.keys(draft.modules).some(key => !firewallModuleKeys.includes(key as FirewallModuleKey)))) return 'Senkronizasyon yöntemi ve kapsamını kontrol edin.';
  if (!testing && draft.syncMode === 'snmp' && object(draft.modules) && ['vlans', 'policies', 'addresses'].some(key => draft.modules && (draft.modules as Record<string, unknown>)[key] === true)) return 'Yalnız SNMP ile envantere sadece arabirimler aktarılabilir.';
  return null;
}
export const firewallUncertain = 'İşlemin sonucu doğrulanamadı. Tekrar denemeden önce bilgileri yenileyin; sunucudaki işlem devam ediyor olabilir.';
const errors: Record<string, string> = { SETTINGS_CHANGED: 'Ayarlar veya hedef başka bir işlemde değişti. Değişiklikleri geri alıp bilgileri yenileyin.', DEVICE_LIMIT: 'Lisansın cihaz kapasitesine ulaşıldı. Lisans Yönetimi ekranını kontrol edin.', LICENSE_INVALID: 'Lisans doğrulanamadığı için cihaz eklenemedi. Lisans Yönetimi ekranını kontrol edin.', TARGET_REQUIRED: 'İşlem yapılacak FortiGate kaydını seçin.', TARGET_NOT_FOUND: 'FortiGate kaydı bulunamadı. Listeyi yenileyin.', TARGET_DISABLED: 'Bu FortiGate profili devre dışı.', INVALID_VDOM: 'VDOM seçimi geçersiz.', INVALID_SETTINGS: 'Kimlik bilgilerini, modül seçimlerini ve 1–1440 dakika aralığını kontrol edin.', CREDENTIAL_REQUIRED: 'Seçili yöntem için kullanıcı/parola veya API erişim anahtarı girin.', FIREWALL_EXISTS: 'Bu sunucu ve VDOM zaten kayıtlı.', PROBE_RATE_LIMITED: 'Bağlantı kontrolü yakın zamanda yapıldı. Biraz sonra yeniden deneyin.', INVENTORY_SYNC_BUSY: 'Envanter senkronizasyonu zaten çalışıyor. Mevcut işin tamamlanmasını bekleyin.', INVALID_FIREWALL_INPUT: 'Cihaz adını, yönetim adresini, VDOM ve erişim bilgilerini kontrol edin.', AUTHENTICATION_FAILED: 'FortiGate kimlik doğrulaması başarısız.', TLS_CERTIFICATE_EXPIRED: 'FortiGate sertifikasının süresi dolmuş.', TLS_CERTIFICATE_UNTRUSTED: 'FortiGate sertifikası güvenilir bulunmadı. Sertifika güven ayarlarını kontrol edin.', REQUEST_TIMEOUT: 'FortiGate zamanında yanıt vermedi.', NETWORK_UNREACHABLE: 'FortiGate yönetim adresine erişilemedi.', ACCOUNT_LOCKED: 'FortiGate hesabı kilitli. Hesap durumunu kontrol edin.', RATE_LIMITED: 'Kaynak istek sınırına ulaşıldı.', UNSUPPORTED_OPERATION: 'Seçili veri toplama yöntemi bu işlemi desteklemiyor.' };
export const firewallErrorMessage = (code: unknown) => typeof code === 'string' && errors[code] ? errors[code] : 'Bağlantı doğrulanamadı. Erişim, kimlik bilgileri ve sertifikayı kontrol edin.';
export async function requestFirewall(url: string, options: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown; signal?: AbortSignal; kind?: 'read' | 'test' | 'write' | 'sync' } = {}): Promise<Record<string, unknown>> {
  const controller = new AbortController(), abort = () => controller.abort(), mutation = options.kind === 'write' || options.kind === 'sync';
  options.signal?.addEventListener('abort', abort, { once: true }); if (options.signal?.aborted) abort();
  const timer = setTimeout(abort, options.kind === 'sync' ? 300000 : options.kind === 'test' || options.kind === 'write' ? 120000 : 20000), fallback = mutation ? 'Güvenlik duvarı işlemi tamamlanamadı.' : 'Güvenlik duvarı bilgileri alınamadı.';
  try {
    const response = await fetch(url, { method: options.method || 'GET', body: options.body === undefined ? undefined : JSON.stringify(options.body), headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' }, credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
    if (response.status === 401) throw Error('Oturumunuz sona ermiş olabilir. Yeniden giriş yapın.'); if (response.status === 403) { const denied = await response.json().catch(() => null); throw Error(object(denied) && denied.error === 'Device limit reached' ? errors.DEVICE_LIMIT : object(denied) && denied.error === 'License validation failed' ? errors.LICENSE_INVALID : 'Bu işlem için yetkiniz bulunmuyor.'); }
    let value: unknown; try { value = await response.json(); } catch { throw Error(mutation ? firewallUncertain : fallback); }
    if (controller.signal.aborted) throw Error(mutation ? firewallUncertain : fallback);
    if (!response.ok || !object(value)) { if (response.status >= 500 && mutation) throw Error(firewallUncertain); throw Error(object(value) && typeof value.code === 'string' && errors[value.code] ? errors[value.code] : fallback); }
    // Inventory sync returns success:false for a complete partial/failed result.
    if (options.kind !== 'sync' && value.success !== true) throw Error(mutation ? firewallUncertain : fallback);
    return value;
  } catch (error) { if (error instanceof Error && [fallback, firewallUncertain, 'Oturumunuz sona ermiş olabilir. Yeniden giriş yapın.', 'Bu işlem için yetkiniz bulunmuyor.', ...Object.values(errors)].includes(error.message)) throw error; throw Error(mutation ? firewallUncertain : fallback); }
  finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
}
