import type { DashboardRange, ResourcePoint } from '@/components/dashboard/types';

export const RESOURCE_RANGES: Record<DashboardRange, { hours: number; buckets: number }> = {
  '6h': { hours: 6, buckets: 24 },
  '24h': { hours: 24, buckets: 24 },
  '7d': { hours: 168, buckets: 28 },
};
export interface ResourceBucket {
  bucket: number;
  cpu: number | null;
  memory: number | null;
  cpuPeak: number | null;
  memoryPeak: number | null;
  samples: number;
}
export function percentage(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}
export function resourceWindow(range: DashboardRange, now = new Date()) {
  const settings = RESOURCE_RANGES[range];
  const seconds = settings.hours * 3600 / settings.buckets;
  const start = new Date(now.getTime() - settings.hours * 3600000);
  return { start, end: now, seconds, count: settings.buckets };
}
export function fillResourceBuckets(start: Date, seconds: number, count: number, rows: ResourceBucket[]): ResourcePoint[] {
  const byBucket = new Map(rows.map(row => [row.bucket, row]));
  return Array.from({ length: count }, (_, index) => {
    const row = byBucket.get(index);
    return {
      at: new Date(start.getTime() + index * seconds * 1000).toISOString(),
      cpu: percentage(row?.cpu), memory: percentage(row?.memory),
      cpuPeak: percentage(row?.cpuPeak), memoryPeak: percentage(row?.memoryPeak),
      samples: row?.samples ?? 0,
    };
  });
}
