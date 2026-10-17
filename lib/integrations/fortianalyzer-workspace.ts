export type AnalyzerDraft = { host: string; adom: string; authMode: 'session' | 'api-key'; username: string; password: string; apiKey: string };
export type AnalyzerProfile = { id: string; name: string; enabled: boolean; host: string; adom: string; authMode: AnalyzerDraft['authMode']; username: string; passwordSet: boolean; apiKeySet: boolean; updatedAt: string | null; collector: AnalyzerCollector | null };
export type AnalyzerCollector = { lastSyncTime: string | null; isFresh: boolean; stopped: boolean; syncInProgress: boolean; failedLogtypes: string[]; consecutiveSyncFailures: number; nextSyncDelayMin: number };
export const analyzerLogtypes: Record<string, string> = { event: 'Sistem olayları', dns: 'DNS sorguları', traffic: 'Ağ trafiği', webfilter: 'Web filtresi', 'app-ctrl': 'Uygulama denetimi', attack: 'Saldırı tespiti', virus: 'Zararlı yazılım' };
const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const date = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v)) ? v : null;
export function parseAnalyzerWorkspace(value: unknown): AnalyzerProfile[] {
  if (!object(value) || value.success !== true || !Array.isArray(value.profiles)) throw Error('FortiAnalyzer ayarları beklenen biçimde alınamadı.');
  return value.profiles.map(row => {
    if (!object(row) || typeof row.id !== 'string' || !row.id || typeof row.name !== 'string' || typeof row.enabled !== 'boolean' || !['session', 'api-key'].includes(String(row.authMode)) || ['host', 'adom', 'username'].some(k => typeof row[k] !== 'string') || typeof row.passwordSet !== 'boolean' || typeof row.apiKeySet !== 'boolean') throw Error('FortiAnalyzer profil bilgileri okunamadı.');
    let collector: AnalyzerCollector | null = null;
    if (row.collector !== null) {
      const c = row.collector;
      if (!object(c) || ['isFresh', 'stopped', 'syncInProgress'].some(k => typeof c[k] !== 'boolean') || !Array.isArray(c.failedLogtypes) || c.failedLogtypes.some(k => typeof k !== 'string') || !Number.isInteger(c.consecutiveSyncFailures) || Number(c.consecutiveSyncFailures) < 0 || !Number.isFinite(c.nextSyncDelayMin) || Number(c.nextSyncDelayMin) < 0) throw Error('Veri toplama durumu okunamadı.');
      collector = { lastSyncTime: date(c.lastSyncTime), isFresh: c.isFresh as boolean, stopped: c.stopped as boolean, syncInProgress: c.syncInProgress as boolean, failedLogtypes: c.failedLogtypes as string[], consecutiveSyncFailures: Number(c.consecutiveSyncFailures), nextSyncDelayMin: Number(c.nextSyncDelayMin) };
    }
    return { id: row.id, name: row.name, enabled: row.enabled, host: row.host as string, adom: row.adom as string, username: row.username as string, authMode: row.authMode as AnalyzerDraft['authMode'], passwordSet: row.passwordSet, apiKeySet: row.apiKeySet, updatedAt: date(row.updatedAt), collector };
  });
}
export function analyzerDraft(profile: AnalyzerProfile | null): AnalyzerDraft { return { host: profile?.host || '', adom: profile?.adom ?? 'root', authMode: profile?.authMode || 'session', username: profile?.username || '', password: '', apiKey: '' }; }
export function analyzerChanges(draft: AnalyzerDraft, profile: AnalyzerProfile | null): string[] {
  const previous = analyzerDraft(profile), result: string[] = [];
  if (draft.host.trim().toLowerCase() !== previous.host.toLowerCase()) result.push('Sunucu adresi');
  if (draft.adom.trim() !== previous.adom) result.push('ADOM');
  if (draft.authMode !== previous.authMode) result.push('Kimlik doğrulama yöntemi');
  if (draft.authMode === 'session' && draft.username.trim() !== previous.username) result.push('Kullanıcı adı');
  if (draft.authMode === 'session' ? draft.password : draft.apiKey) result.push(draft.authMode === 'session' ? 'Yeni parola' : 'Yeni API anahtarı');
  return result;
}
export function validateAnalyzerDraft(draft: AnalyzerDraft, profile: AnalyzerProfile | null, testing = false): string | null {
  try { const host = draft.host.trim(), url = new URL(`https://${host}`); if (!url.hostname || url.username || url.password || url.pathname !== '/' || url.search || url.hash || /\s|[\\/]/.test(host)) throw Error(); } catch { return 'Geçerli bir sunucu adı veya IP adresi girin. https:// ve yol eklemeyin; gerekirse :443 gibi port yazın.'; }
  const adom = draft.adom.trim();
  if (!adom || adom.length > 128 || adom === '.' || adom === '..' || /[/\\\x00-\x1f\x7f]/.test(adom)) return 'ADOM adını 1–128 karakter olarak girin; eğik çizgi ve kontrol karakteri kullanmayın.';
  if (!['session', 'api-key'].includes(draft.authMode)) return 'Kimlik doğrulama yöntemini seçin.';
  if (draft.authMode === 'session' && !draft.username.trim()) return 'FortiAnalyzer kullanıcı adı zorunludur.';
  const secret = draft.authMode === 'session' ? draft.password : draft.apiKey;
  if (secret === '********') return 'Maskelenmiş değer yerine gerçek parolayı veya API anahtarını girin.';
  if (draft.authMode === 'api-key' && /\s/.test(secret)) return 'API anahtarı boşluk içeremez.';
  const same = profile && profile.host.toLowerCase() === draft.host.trim().toLowerCase() && profile.authMode === draft.authMode && (draft.authMode === 'api-key' || profile.username === draft.username.trim());
  const stored = same && (draft.authMode === 'session' ? profile.passwordSet : profile.apiKeySet);
  if (!secret && (testing || !stored)) return testing ? 'Form testi için parolayı veya API anahtarını girin. Saklanan bilgiyle test için “Kayıtlı bağlantıyı test et” düğmesini kullanın.' : 'Yeni sunucu, kullanıcı veya doğrulama yöntemi için parolayı ya da API anahtarını girin.';
  return null;
}
export const analyzerUncertain = 'Kaydetme sonucu doğrulanamadı. Yeniden kaydetmeden önce kayıtlı bilgileri yenileyin; işlem sunucuda tamamlanmış olabilir.';
const errors: Record<string, string> = { INVALID_SETTINGS: 'Sunucu, ADOM ve kimlik doğrulama bilgilerini kontrol edin.', PROFILE_NOT_FOUND: 'Seçili profil bulunamadı. Kayıtlı bilgileri yenileyin.', PROFILE_REQUIRED: 'İşlem yapılacak kayıtlı FortiAnalyzer profilini seçin.', CREDENTIAL_REQUIRED: 'Bu bağlantı için geçerli parola veya API anahtarı girin.', SAVE_CONFLICT: 'Kayıtlı profil başka bir işlemde değişti. Değişiklikleri geri alıp bilgileri yenileyin.' };
export async function requestAnalyzerWorkspace(body?: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const controller = new AbortController(), abort = () => controller.abort(), writes = body?.action === 'save'; signal?.addEventListener('abort', abort); if (signal?.aborted) abort();
  const timer = setTimeout(abort, body ? 120_000 : 20_000), fallback = body ? 'FortiAnalyzer işlemi tamamlanamadı. Bağlantıyı kontrol edip yeniden deneyin.' : 'FortiAnalyzer bilgileri alınamadı. Yeniden deneyin.';
  try {
    const response = await fetch('/api/integrations/fortianalyzer/workspace', { method: body ? 'POST' : 'GET', cache: 'no-store', signal: controller.signal, headers: body ? { 'Content-Type': 'application/json' } : undefined, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (response.status === 401) throw Error('Oturum doğrulanamadı. Yeniden giriş yapın.');
    if (response.status === 403) throw Error('Bu işlem için yetkiniz bulunmuyor.');
    const value: unknown = await response.json();
    if (!response.ok || !object(value) || value.success !== true) {
      if (response.status === 401) throw Error('Oturum doğrulanamadı. Yeniden giriş yapın.');
      if (response.status === 403) throw Error('Bu işlem için yetkiniz bulunmuyor.');
      if (writes && (response.status >= 500 || response.ok)) throw Error(analyzerUncertain);
      throw Error(object(value) && typeof value.code === 'string' && errors[value.code] || fallback);
    }
    if (controller.signal.aborted) throw Error(writes ? analyzerUncertain : fallback);
    return value;
  } catch (failure) {
    if (failure instanceof Error && [analyzerUncertain, fallback, 'Oturum doğrulanamadı. Yeniden giriş yapın.', 'Bu işlem için yetkiniz bulunmuyor.', ...Object.values(errors)].includes(failure.message)) throw failure;
    throw Error(writes ? analyzerUncertain : fallback);
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
