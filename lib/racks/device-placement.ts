import type { RackCapacityDevice } from '@/lib/rack-capacity';

export interface PlacementDevice extends RackCapacityDevice { name?: string }
export interface PlacementRack { id: string; name?: string; maxUnits: number; devices: PlacementDevice[] }

export function deviceUnitHeight(metadata: unknown): number {
  const value = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? Number((metadata as Record<string, unknown>).unitHeight ?? 1) : 1;
  return Number.isFinite(value) ? Math.max(1, Math.min(100, Math.floor(value))) : 1;
}

export function mergeUnitHeight(metadata: unknown, height: number): Record<string, unknown> {
  if (metadata != null && (typeof metadata !== 'object' || Array.isArray(metadata))) throw new Error('Cihazın ek bilgileri nesne biçiminde olmadığı için yükseklik güncellenemedi.');
  return { ...(metadata as Record<string, unknown> | null || {}), unitHeight: height };
}

export function placementIssue({ rackId, rack, start, height, deviceId }: { rackId: string | null; rack: PlacementRack | null; start: number | null; height: number; deviceId?: string }): string | null {
  if (!Number.isInteger(height) || height < 1 || height > 100) return 'Cihaz yüksekliği 1–100 arasında bir tam sayı olmalıdır.';
  if (!rackId) return start == null ? null : 'U konumu belirlemek için önce bir kabinet seçin.';
  if (!rack || rack.id !== rackId) return 'Seçili kabinet bulunamadı. Kabinet listesini yenileyin.';
  if (height > rack.maxUnits) return `Cihazın ${height} U yüksekliği, kabinetin ${rack.maxUnits} U kapasitesini aşıyor.`;
  if (start == null) return null;
  if (!Number.isInteger(start) || start < 1) return 'Başlangıç U konumu pozitif bir tam sayı olmalıdır.';
  const end = start + height - 1;
  if (end > rack.maxUnits) return `U ${start}–${end} aralığı kabinetin ${rack.maxUnits} U sınırını aşıyor.`;
  const overlapping = rack.devices.filter(device => device.id !== deviceId && Number.isInteger(device.rackUnitPosition) && Number(device.rackUnitPosition) > 0 && start <= Number(device.rackUnitPosition) + deviceUnitHeight(device.metadata) - 1 && end >= Number(device.rackUnitPosition));
  return overlapping.length ? `U ${start}–${end} aralığı şu cihazlarla çakışıyor: ${overlapping.map(device => device.name || device.id).join(', ')}.` : null;
}

/** Saved positions reserve space; estimated positions of unassigned devices do not. */
export function availableUnitRanges(rack: PlacementRack, deviceId?: string) {
  const occupied = new Set<number>();
  rack.devices.forEach(device => {
    if (device.id === deviceId || !Number.isInteger(device.rackUnitPosition) || Number(device.rackUnitPosition) < 1) return;
    const start = Number(device.rackUnitPosition);
    for (let unit = start; unit < start + deviceUnitHeight(device.metadata) && unit <= rack.maxUnits; unit++) occupied.add(unit);
  });
  const ranges: Array<{ start: number; end: number }> = [];
  for (let unit = 1; unit <= rack.maxUnits; unit++) {
    if (occupied.has(unit)) continue;
    const previous = ranges[ranges.length - 1];
    if (previous?.end === unit - 1) previous.end = unit; else ranges.push({ start: unit, end: unit });
  }
  return ranges;
}

export function firstAvailableUnit(rack: PlacementRack, height: number, deviceId?: string) {
  if (!Number.isInteger(height) || height < 1 || height > rack.maxUnits) return null;
  return availableUnitRanges(rack, deviceId).find(range => range.end - range.start + 1 >= height)?.start ?? null;
}
