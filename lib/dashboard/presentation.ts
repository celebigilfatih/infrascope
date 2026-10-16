const names: Record<string, string> = {
  NMS_MEMORY_HIGH: 'Bellek kullanımı yüksek', NMS_CPU_HIGH: 'CPU kullanımı yüksek',
  NMS_PORT_DOWN: 'İzlenen port kapalı', NMS_DEVICE_UNREACHABLE: 'Cihazdan veri alınamıyor',
  NMS_DEVICE_DOWN: 'Cihazdan veri alınamıyor', NMS_BACKUP_FAILED: 'Yedekleme kontrolü gerekiyor',
  NMS_TEMPERATURE_HIGH: 'Sıcaklık yüksek', NMS_BANDWIDTH_HIGH: 'Bant genişliği kullanımı yüksek',
};
export function incidentLabel(code: string, fallback: string) { return names[code] || fallback; }
export function percentLabel(value: number | null | undefined) {
  return value == null ? '—' : `%${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(value)}`;
}
export function relativeLabel(value: string | null) {
  if (!value) return 'Henüz veri yok';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return 'Az önce';
  if (minutes < 60) return `${minutes} dk önce`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} sa önce`;
  return `${Math.floor(minutes / 1440)} gün önce`;
}
export async function dashboardGet<T>(url: string, params?: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const { apiGet } = await import('@/lib/api');
  const result = await apiGet(url, params, { signal, timeout: 15000 });
  if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
  if (result?.success === false) throw new Error(result.error || 'Veriler alınamadı.');
  return result as T;
}
