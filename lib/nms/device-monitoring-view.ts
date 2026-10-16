export interface NmsDevice {
  id: string; name: string; type: string | null; vendor: string | null;
  nmsDeviceId: number; managementIp: string | null; snmpVersion: string | null; snmpPort: number | null;
  pollingEnabled: boolean; pollingInterval: number | null; lastPolledAt: string | null;
  latestHealth: { cpuUsage: number | null; memoryUsage: number | null; temperature: number | null; collectedAt: string } | null;
  portDownCount: number;
}
export type DeviceStatus = 'online' | 'offline' | 'unknown' | 'disabled';

export function pollingSeconds(value: number | null) {
  return value != null && Number.isFinite(value) && value >= 10 && value <= 86400 ? value : 300;
}
export function observationTime(timestamp: string | null | undefined, now: number) {
  if (!timestamp) return { key: 'missing', time: null } as const;
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time)) return { key: 'invalid', time: null } as const;
  if (time > now) return { key: 'future', time } as const;
  return { key: 'valid', time } as const;
}
export function dataFreshness(timestamp: string | null | undefined, interval: number | null, now: number) {
  const observation = observationTime(timestamp, now);
  if (observation.key !== 'valid') return observation.key;
  return now - observation.time < pollingSeconds(interval) * 2500 ? 'fresh' : 'delayed';
}
export function getStatus(device: NmsDevice, now: number): DeviceStatus {
  if (!device.pollingEnabled) return 'disabled';
  const freshness = dataFreshness(device.lastPolledAt, device.pollingInterval, now);
  return freshness === 'fresh' ? 'online' : freshness === 'delayed' ? 'offline' : 'unknown';
}
export function formatRelative(timestamp: string | null | undefined, now: number) {
  const observation = observationTime(timestamp, now);
  if (observation.key === 'missing') return 'Henüz veri yok';
  if (observation.key === 'invalid') return 'Tarih okunamadı';
  if (observation.key === 'future') return 'Gelecek tarih · saati kontrol edin';
  const minutes = Math.floor((now - observation.time) / 60000);
  if (minutes < 1) return 'Az önce';
  if (minutes < 60) return `${minutes} dk önce`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} saat önce`;
  return `${Math.floor(minutes / 1440)} gün önce`;
}
export function absoluteTime(timestamp: string | null | undefined) {
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) return 'Tarih bilinmiyor';
  return new Date(timestamp).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'medium', timeStyle: 'short' });
}
export function formatInterval(seconds: number | null) {
  const value = pollingSeconds(seconds);
  return value % 60 === 0 ? `${value / 60} dk aralıkla` : `${value} sn aralıkla`;
}
export function measuredPercent(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}
