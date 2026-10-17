export const vmwareModules = ['datacenters', 'clusters', 'hosts', 'vms', 'datastores'] as const;
export type VMwareModule = typeof vmwareModules[number];
export const moduleLabels: Record<VMwareModule, string> = { datacenters: 'Veri merkezleri', clusters: 'Kümeler', hosts: 'ESXi sunucuları', vms: 'Sanal makineler', datastores: 'Veri depoları' };
export interface VMwareDraft { host: string; username: string; password: string; thumbprint: string; interval: string; enabled: boolean; modules: Record<VMwareModule, boolean> }
export interface VMwareSync { status: 'success' | 'partial' | 'failed' | null; startedAt: string | null; completedAt: string | null; processed: number | null; created: number | null; updated: number | null; errors: number | null; duration: number | null }
export interface VMwareProfile { id: string; name: string; enabled: boolean; host: string; username: string; hasPassword: boolean; thumbprint: string; interval: number | null; modules: Record<VMwareModule, boolean>; updatedAt: string | null; lastSyncAt: string | null; lastSyncStatus: VMwareSync['status']; lastSync: VMwareSync | null }
const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const text = (v: unknown) => typeof v === 'string' ? v : '';
const date = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v)) ? v : null;
const count = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
export const syncStatus = (v: unknown): VMwareSync['status'] => v === 'success' || v === 'partial' || v === 'failed' ? v : null;
export const syncLabels = { success: 'Tamamlandı', partial: 'Kısmen tamamlandı', failed: 'Başarısız' };
export function parseVMwareSync(value: unknown, manual = false): VMwareSync {
  if (!object(value)) throw new Error('Senkronizasyon sonucu beklenen biçimde alınamadı.');
  const startedAt = date(value.startedAt), completedAt = date(value.completedAt), status = syncStatus(value.status);
  if (manual && (!status || value.success !== (status === 'success'))) throw new Error(vmwareUncertain);
  return { status, startedAt, completedAt, processed: count(value.itemsProcessed), created: count(value.itemsCreated), updated: count(value.itemsUpdated), errors: count(value.errorCount), duration: manual ? count(value.duration) : startedAt && completedAt && Date.parse(completedAt) >= Date.parse(startedAt) ? Date.parse(completedAt) - Date.parse(startedAt) : null };
}
export function parseVMwareProfiles(value: unknown): VMwareProfile[] {
  if (!object(value) || value.success !== true || !Array.isArray(value.profiles)) throw new Error('VMware ayarları beklenen biçimde alınamadı.');
  return value.profiles.map(raw => {
    if (!object(raw) || typeof raw.id !== 'string' || !raw.id || typeof raw.name !== 'string' || typeof raw.enabled !== 'boolean' || !object(raw.config)) throw new Error('vCenter profil bilgileri beklenen biçimde alınamadı.');
    const config = raw.config;
    if (config.enabledModules !== undefined && !object(config.enabledModules)) throw new Error('Senkronizasyon kapsamı okunamadı.');
    const stored = object(config.enabledModules) ? config.enabledModules : {}, modules = { datacenters: true, clusters: true, hosts: true, vms: true, datastores: true };
    for (const key of vmwareModules) { if (stored[key] !== undefined && typeof stored[key] !== 'boolean') throw new Error('Senkronizasyon kapsamı okunamadı.'); if (typeof stored[key] === 'boolean') modules[key] = stored[key]; }
    return { id: raw.id, name: raw.name, enabled: raw.enabled, host: text(config.host), username: text(config.username), hasPassword: config.hasPassword === true, thumbprint: text(config.thumbprint), interval: typeof config.pollingInterval === 'number' && Number.isInteger(config.pollingInterval) && config.pollingInterval >= 1 && config.pollingInterval <= 1440 ? config.pollingInterval : null, modules, updatedAt: date(raw.updatedAt), lastSyncAt: date(raw.lastSyncAt), lastSyncStatus: syncStatus(raw.lastSyncStatus), lastSync: raw.lastSync ? parseVMwareSync(raw.lastSync) : null };
  });
}
export function vmwareDraft(profile: VMwareProfile | null): VMwareDraft { return { host: profile?.host || '', username: profile?.username || '', password: '', thumbprint: profile?.thumbprint || '', interval: profile?.interval?.toString() || (profile ? '' : '10'), enabled: profile?.enabled ?? true, modules: profile ? { ...profile.modules } : { datacenters: true, clusters: true, hosts: true, vms: true, datastores: true } }; }
export function vmwareChanges(draft: VMwareDraft, profile: VMwareProfile | null): string[] {
  const previous = vmwareDraft(profile), result: string[] = [];
  if (draft.host.trim() !== previous.host) result.push('vCenter sunucusu');
  if (draft.username.trim() !== previous.username) result.push('Kullanıcı adı');
  if (draft.password) result.push('Parola (yeni değer girildi)');
  if (draft.thumbprint.trim() !== previous.thumbprint) result.push('Sertifika parmak izi');
  if (draft.interval !== previous.interval) result.push('Senkronizasyon aralığı');
  if (draft.enabled !== previous.enabled) result.push('Otomatik senkronizasyon');
  for (const key of vmwareModules) if (draft.modules[key] !== previous.modules[key]) result.push(moduleLabels[key]);
  return result;
}
export function validateVMwareDraft(draft: VMwareDraft, profile: VMwareProfile | null, testing = false): string | null {
  try { const url = new URL(`https://${draft.host.trim()}`); if (!url.hostname || url.username || url.password || url.pathname !== '/' || url.search || url.hash || /\s|[\\/]/.test(draft.host.trim())) throw Error(); } catch { return 'Geçerli bir sunucu adı veya IP adresi girin. https:// ve yol eklemeyin; gerekirse :443 gibi port yazın.'; }
  if (!draft.username.trim()) return 'vCenter kullanıcı adı zorunludur.';
  if (!draft.password && (testing || !profile?.hasPassword || draft.host.trim() !== profile.host || draft.username.trim() !== profile.username)) return testing ? 'Formdaki bilgileri test etmek için parolayı girin. Kayıtlı parolayla test için diğer düğmeyi kullanın.' : 'Sunucu veya kullanıcı yeni/değişmiş olduğunda parolayı girin.';
  if (!testing && (!/^\d+$/.test(draft.interval) || Number(draft.interval) < 1 || Number(draft.interval) > 1440)) return 'Senkronizasyon aralığı 1–1440 arasında tam sayı olmalıdır.';
  return null;
}
export function vmwareConfigPayload(draft: VMwareDraft) { return { host: draft.host.trim(), username: draft.username.trim(), password: draft.password, thumbprint: draft.thumbprint.trim(), pollingInterval: Number(draft.interval), enabledModules: { ...draft.modules } }; }
export const vmwareUncertain = 'İşlemin sonucu doğrulanamadı. Tekrar çalıştırmadan önce kayıtlı bilgileri yenileyin; sunucudaki işlem devam ediyor olabilir.';
const errorLabels: Record<string, string> = { SETTINGS_CHANGED: 'Profil başka bir işlemde değişti. Değişiklikleri geri alıp kayıtlı bilgileri yenileyin.', PROFILE_REQUIRED: 'Kayıtlı vCenter profilini seçin.', PROFILE_NOT_FOUND: 'Seçili profil artık bulunamıyor. Bilgileri yenileyin.', PASSWORD_REQUIRED: 'Sunucu veya kullanıcı yeni/değişmiş olduğunda parolayı girin.', INVALID_SETTINGS: 'Bağlantı ayarlarını ve 1–1440 dakika aralığını kontrol edin.', INVENTORY_SYNC_BUSY: 'Bu profil için senkronizasyon zaten çalışıyor. Sonucu daha sonra yenileyin.', INVENTORY_SOURCE_SELECTION_REQUIRED: 'İşlem yapılacak vCenter profilini seçin.', VMWARE_HELPER_SOURCE_TIMEOUT: 'vCenter kaynağı zamanında yanıt vermedi.', VMWARE_HELPER_UNAVAILABLE: 'VMware Python çalışma ortamı veya yardımcı dosyası bulunamadı.', VMWARE_HELPER_SDK_MISSING: 'VMware Python SDK (PyVmomi) kurulu değil.', VMWARE_HELPER_AUTH_FAILED: 'vCenter kullanıcı adı veya parolası doğrulanamadı.', VMWARE_HELPER_PERMISSION_DENIED: 'vCenter veri okuma yetkisi yetersiz.', VMWARE_HELPER_TLS_POLICY: 'VMware sertifika güven ayarları geçersiz.', VMWARE_HELPER_TLS_ERROR: 'vCenter sertifikası doğrulanamadı. Sertifika güven ayarlarını kontrol edin.' };
export function vmwareTestError(value: Record<string, unknown>): string { return typeof value.code === 'string' && errorLabels[value.code] ? errorLabels[value.code] : 'Bağlantı doğrulanamadı. Sunucu, kullanıcı, parola, sertifika ve VMware toplama bileşenlerini kontrol edin.'; }
export async function requestVMwareWorkspace(body?: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const controller = new AbortController(), abort = () => controller.abort(), action = body?.action, writes = action === 'save-config' || action === 'sync';
  signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
  const timer = setTimeout(abort, action === 'sync' ? 300000 : action === 'test' || action === 'test-saved' ? 180000 : 20000);
  const fallback = body ? 'VMware işlemi tamamlanamadı. Bilgileri kontrol edin.' : 'Kayıtlı VMware bilgileri alınamadı.';
  try {
    const response = await fetch(body ? '/api/integrations/vmware' : '/api/integrations/vmware?type=workspace', { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined, headers: body ? { 'Content-Type': 'application/json' } : undefined, credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
    if (response.status === 401) throw new Error('Oturum veya vCenter kimlik doğrulaması başarısız. Oturumunuzu ve bağlantı bilgilerini kontrol edin.');
    if (response.status === 403) throw new Error('Bu işlem için yetkiniz bulunmuyor.');
    let value: unknown; try { value = await response.json(); } catch { throw new Error(writes ? vmwareUncertain : fallback); }
    if (!response.ok || !object(value)) {
      if (writes && response.status >= 500) throw new Error(vmwareUncertain);
      if (response.status === 401) throw new Error('Oturum veya vCenter kimlik doğrulaması başarısız. Oturumunuzu ve bağlantı bilgilerini kontrol edin.');
      throw new Error(object(value) && typeof value.code === 'string' && errorLabels[value.code] ? errorLabels[value.code] : fallback);
    }
    if (controller.signal.aborted) throw new Error(writes ? vmwareUncertain : fallback);
    if (!body && value.success !== true) throw new Error(fallback);
    if (action === 'save-config' && (value.success !== true || typeof value.configId !== 'string' || !value.configId.trim() || (body?.configId && value.configId !== body.configId))) throw new Error(vmwareUncertain);
    if (action === 'sync' && value.configId !== body?.configId) throw new Error(vmwareUncertain);
    return value;
  } catch (error) {
    if (error instanceof Error && [vmwareUncertain, fallback, 'Bu işlem için yetkiniz bulunmuyor.', 'Oturum veya vCenter kimlik doğrulaması başarısız. Oturumunuzu ve bağlantı bilgilerini kontrol edin.', ...Object.values(errorLabels)].includes(error.message)) throw error;
    throw new Error(writes ? vmwareUncertain : fallback);
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
