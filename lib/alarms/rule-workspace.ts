import type { SemanticTone } from '@/components/ui/semantic-badge';

export interface AlarmRule {
  id: string; code: string; name: string; description: string | null; category: string;
  severity: string; source?: string | null; enabled: boolean; cooldownMinutes: number;
  notifyEmail: boolean; detectionLogic: Record<string, unknown>; _count?: { alarmEvents: number };
}
export interface RuleEmailConfig {
  channel: string; enabled: boolean; isConfigured?: boolean;
  config: { smtpHost: string; smtpPort: number; smtpUser: string; smtpPass: string; smtpSecure: boolean; recipients: string[] };
}
export function isAlarmRule(value: unknown): value is AlarmRule {
  if (!value || typeof value !== 'object') return false;
  const rule = value as Record<string, unknown>;
  return ['id', 'code', 'name', 'category', 'severity'].every(key => typeof rule[key] === 'string') && typeof rule.enabled === 'boolean' && typeof rule.notifyEmail === 'boolean' && typeof rule.cooldownMinutes === 'number' && Number.isFinite(rule.cooldownMinutes) && !!rule.detectionLogic && typeof rule.detectionLogic === 'object' && !Array.isArray(rule.detectionLogic);
}
export function isRuleEmailConfig(value: unknown): value is RuleEmailConfig {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>, config = result.config as Record<string, unknown> | null;
  return result.channel === 'email' && typeof result.enabled === 'boolean' && typeof result.isConfigured === 'boolean' && !!config && ['smtpHost', 'smtpUser', 'smtpPass'].every(key => typeof config[key] === 'string') && typeof config.smtpPort === 'number' && Number.isFinite(config.smtpPort) && typeof config.smtpSecure === 'boolean' && Array.isArray(config.recipients) && config.recipients.every(email => typeof email === 'string');
}
export const ruleCategories: Record<string, string> = {
  CONFIG_ACCESS: 'Yapılandırma ve erişim', SECURITY: 'Güvenlik', RISK_ANOMALY: 'Risk ve anomali',
  OPERATIONAL: 'Operasyonel', SOC_CORRELATION: 'Olay ilişkilendirmesi',
};
const nmsNames: Record<string, string> = {
  NMS_CPU_HIGH: 'Ağ cihazı CPU kullanımı yüksek', NMS_MEMORY_HIGH: 'Ağ cihazı bellek kullanımı yüksek',
  NMS_TEMPERATURE_HIGH: 'Ağ cihazı sıcaklığı yüksek', NMS_PORT_DOWN: 'İzlenen ağ portu kapalı',
  NMS_DEVICE_UNREACHABLE: 'Ağ cihazına erişilemiyor', NMS_BACKUP_FAILED: 'Cihaz yedeği başarısız veya gecikmiş',
};
export const ruleName = (rule: AlarmRule) => nmsNames[rule.code] || rule.name;
export const ruleSearchText = (value: string) => value.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/g, 'i');
export function ruleSource(rule: AlarmRule) {
  const logic = rule.detectionLogic || {};
  if (rule.code.startsWith('NMS_') || rule.source === 'nms' || logic.source === 'nms') return 'NMS / ağ izleme';
  if (rule.source === 'vmware' || logic.source === 'vmware' || logic.logtype === 'vmware') return 'VMware';
  if (rule.source === 'fortigate-sslvpn' || logic.source === 'fortigate-sslvpn') return 'FortiGate SSL-VPN';
  if (rule.source && rule.source !== 'fortianalyzer' || logic.source && logic.source !== 'fortianalyzer') return 'Diğer veri kaynağı';
  return 'FortiAnalyzer';
}
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
export function ruleCondition(rule: AlarmRule): { label: string; detail: string; window: string } {
  const logic = rule.detectionLogic || {};
  const threshold = number(logic.threshold), minutes = number(logic.timeWindowMinutes);
  const metric = ({ NMS_CPU_HIGH: 'CPU kullanımı', NMS_MEMORY_HIGH: 'Bellek kullanımı', NMS_TEMPERATURE_HIGH: 'Sıcaklık' } as Record<string, string>)[rule.code];
  if (metric) {
    const valid = threshold !== null && (rule.code === 'NMS_TEMPERATURE_HIGH' || threshold >= 0 && threshold <= 100);
    const value = threshold?.toLocaleString('tr-TR');
    return { label: valid ? `${metric} ≥ ${rule.code === 'NMS_TEMPERATURE_HIGH' ? `${value} °C` : `%${value}`}` : 'Ölçüm eşiği doğrulanamıyor',
      detail: 'Son 5 dakikadaki en güncel sağlık ölçümü değerlendirilir. Değerin katalog penceresi boyunca yüksek kalması şartı aranmaz.', window: 'Son 5 dakika · en güncel ölçüm' };
  }
  if (rule.code === 'NMS_PORT_DOWN') return { label: 'Port en az 5 dakika kapalı', detail: 'İzlenen, yönetimsel olarak açık ve daha önce açık görülmüş portun kesintisi değerlendirilir. Güncel port verisi gerekir.', window: 'En az 5 dakika kesinti' };
  if (rule.code === 'NMS_DEVICE_UNREACHABLE') return { label: 'Uzun süre ölçüm alınamıyor', detail: 'En az 30 dakika veya cihazın 3 izleme aralığından uzun olanı kullanılır. Hem son ölçüm hem son sorgulama bu sınırı aşmalıdır; hiç sorgulanmamış cihazlar dışarıda tutulur.', window: 'En az 30 dakika / 3 izleme aralığı' };
  if (rule.code === 'NMS_BACKUP_FAILED') return { label: 'Başarısız iş veya gecikmiş yedek', detail: 'Başarısız yedekleme işi ya da etkin cihaz politikasında seçilen türün gecikmiş yedeği değerlendirilir. Gecikme eşiği cihazın yedekleme ayarından gelir.', window: 'Cihazın yedekleme politikası' };
  const countValid = threshold !== null && Number.isInteger(threshold) && threshold >= 1;
  const window = minutes !== null && minutes > 0 ? `Son ${minutes.toLocaleString('tr-TR')} dakika` : 'Zaman aralığı bilinmiyor';
  if (logic.clientCheck === 'correlation') return { label: countValid ? `En az ${threshold} ilişkili eşleşme` : 'İlişkili olay koşulu', detail: 'Önceki alarm kodları ve ek kaynak koşulları birlikte değerlendirilir. Yalnızca olay sayısına bakılmaz.', window };
  if (ruleSource(rule) === 'NMS / ağ izleme' || ruleSource(rule) === 'Diğer veri kaynağı') return { label: 'Kaynağa özel koşul', detail: 'Bu kuralın sayısal alanları için ortak bir birim varsayılmaz. Kayıtlı kaynak filtresini ve katalog değerlerini inceleyin.', window: 'Kaynağa özel değerlendirme' };
  return { label: countValid ? `En az ${threshold.toLocaleString('tr-TR')} eşleşme` : 'Eşleşme eşiği bilinmiyor', detail: 'Kaynak filtresi ve varsa ek denetimler uygulandıktan sonra eşleşen kayıtlar sayılır. Bu değer CPU veya bellek yüzdesi değildir.', window };
}
export function ruleCooldown(rule: AlarmRule) {
  if (!Number.isInteger(rule.cooldownMinutes) || rule.cooldownMinutes < 0) return 'Bekleme süresi bilinmiyor';
  if (rule.code === 'NMS_BACKUP_FAILED' && rule.cooldownMinutes === 0) return 'En az 1 dakika';
  return rule.cooldownMinutes === 0 ? 'Tekrar beklemesi yok' : `${rule.cooldownMinutes.toLocaleString('tr-TR')} dakika tekrar beklemesi`;
}
export function ruleEmailState(rule: Pick<AlarmRule, 'enabled' | 'notifyEmail'>, config: RuleEmailConfig | null, stale = false): { label: string; tone: SemanticTone } {
  if (!rule.enabled) return { label: 'Kural kapalı', tone: 'neutral' };
  if (!rule.notifyEmail) return { label: 'Bu kuralda kapalı', tone: 'neutral' };
  if (!config || stale) return { label: 'Kanal durumu bilinmiyor', tone: 'neutral' };
  if (!config.enabled) return { label: 'E-posta kanalı kapalı', tone: 'warning' };
  if (!config.isConfigured) return { label: 'Kanal ayarları eksik', tone: 'warning' };
  return { label: 'Gönderim ayarları uygun', tone: 'info' };
}
export interface RuleDraft { enabled: boolean; notifyEmail: boolean; cooldown: string }
export function rulePatch(rule: AlarmRule, draft: RuleDraft) {
  const cooldownMinutes = Number(draft.cooldown);
  if (!draft.cooldown.trim() || !Number.isInteger(cooldownMinutes) || cooldownMinutes < 0 || cooldownMinutes > 525600) throw new Error('Tekrar beklemesi 0–525.600 arasında tam dakika olmalıdır.');
  const changes = { ...(rule.enabled !== draft.enabled ? { enabled: draft.enabled } : {}), ...(rule.notifyEmail !== draft.notifyEmail ? { notifyEmail: draft.notifyEmail } : {}), ...(rule.cooldownMinutes !== cooldownMinutes ? { cooldownMinutes } : {}) };
  return Object.keys(changes).length ? { id: rule.id, ...changes } : null;
}
export async function requestRuleJson(url: string, failure: string, init: RequestInit = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (init.signal?.aborted) controller.abort();
  init.signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, timeoutMs);
  try {
    const response = await fetch(url, { ...init, cache: 'no-store', signal: controller.signal });
    if (response.status === 401) throw new Error('Oturumunuz sona ermiş. Yeniden giriş yapın.');
    if (response.status === 403) throw new Error('Bu işlem için yetkiniz yok.');
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error(failure);
    const body = await response.json();
    if (!body.success) throw new Error(failure);
    return body;
  } catch (cause) {
    if (controller.signal.aborted || cause instanceof TypeError) throw new Error(init.method && init.method !== 'GET' ? 'İşlem sonucu doğrulanamadı. Kayıtlı ayarları yenileyip kontrol edin.' : failure);
    if (cause instanceof SyntaxError) throw new Error(failure);
    throw cause;
  } finally { clearTimeout(timer); init.signal?.removeEventListener('abort', cancel); }
}
