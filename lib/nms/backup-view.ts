import type { SemanticTone } from '@/components/ui/semantic-badge';

export interface BackupCoverageDevice {
  id: number; name: string; lastSuccessAt: string | null;
  lastPolicySuccessAt?: string | null;
  policy: { enabled: boolean; staleAfterHours: number; backupType?: string } | null;
}
export function backupTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}
export function backupDate(value: string | null | undefined) {
  const timestamp = backupTimestamp(value);
  return timestamp === null ? value ? 'Tarih doğrulanamıyor' : 'Kayıt yok' : `${new Date(timestamp).toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })} TSİ`;
}
export function backupAge(value: string | null | undefined, now = Date.now()) {
  const timestamp = backupTimestamp(value);
  if (timestamp === null) return value ? 'Tarih doğrulanamıyor' : 'Henüz başarılı yedek yok';
  const elapsed = now - timestamp;
  if (elapsed < 0) return 'Tarih gelecekte · kontrol edin';
  if (elapsed < 60000) return 'Az önce';
  if (elapsed < 3600000) return `${Math.floor(elapsed / 60000)} dakika önce`;
  if (elapsed < 86400000) return `${Math.floor(elapsed / 3600000)} saat önce`;
  return `${Math.floor(elapsed / 86400000)} gün önce`;
}
export function backupCoverage(device: BackupCoverageDevice, now = Date.now()): { label: string; tone: SemanticTone; attention: boolean } {
  if (device.policy?.enabled && device.lastPolicySuccessAt === undefined) return { label: 'Güncellik bilinmiyor', tone: 'neutral', attention: true };
  const value = device.policy?.enabled ? device.lastPolicySuccessAt : device.lastSuccessAt;
  const timestamp = backupTimestamp(value);
  if (value && (timestamp === null || timestamp > now)) return { label: 'Tarih doğrulanamıyor', tone: 'neutral', attention: true };
  if (timestamp === null) return { label: device.policy?.enabled && device.lastSuccessAt ? 'Planlanan türde yedek yok' : 'Yedek yok', tone: 'warning', attention: true };
  if (!device.policy?.enabled) return { label: 'Yedek var', tone: 'info', attention: false };
  const threshold = device.policy.staleAfterHours;
  if (!Number.isFinite(threshold) || threshold <= 0) return { label: 'Eşik bilinmiyor', tone: 'neutral', attention: true };
  return now - timestamp >= threshold * 3600000
    ? { label: 'Yedek gecikmiş', tone: 'warning', attention: true }
    : { label: 'Yedek güncel', tone: 'success', attention: false };
}
export const backupTypeLabel = (type: string) => type === 'Startup Config' ? 'Başlangıç yapılandırması' : type === 'Running Config' ? 'Çalışan yapılandırma' : 'Bilinmeyen yedek türü';
export function backupSize(size: number) {
  if (!Number.isFinite(size) || size < 0) return 'Boyut bilinmiyor';
  if (size < 1024) return `${size.toLocaleString('tr-TR')} B`;
  return size >= 1048576 ? `${(size / 1048576).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MiB` : `${(size / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} KiB`;
}
export function backupDownloadName(name: string) {
  return name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 180) || 'yapilandirma.cfg';
}
