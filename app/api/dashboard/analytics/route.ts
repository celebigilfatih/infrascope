import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestActor } from '@/lib/auth/request-actor';
import { RESOURCE_RANGES, resourceWindow, fillResourceBuckets, type ResourceBucket } from '@/lib/dashboard/resources';
import type { DashboardRange } from '@/components/dashboard/types';

export const dynamic = 'force-dynamic';
const deviceSelect = { id: true, name: true, managementIp: true, nmsDeviceId: true, pollingEnabled: true, lastPolledAt: true } as const;

export async function GET(request: NextRequest) {
  if (!await getRequestActor(request)) return NextResponse.json({ error: 'Oturum gerekli.' }, { status: 401 });
  const range = request.nextUrl.searchParams.get('range') || '24h';
  const deviceId = request.nextUrl.searchParams.get('deviceId');
  if (!Object.prototype.hasOwnProperty.call(RESOURCE_RANGES, range) || (deviceId !== null && (!deviceId.trim() || deviceId.length > 128))) {
    return NextResponse.json({ error: 'Geçersiz cihaz veya zaman aralığı.' }, { status: 400 });
  }
  try {
    const devices = await prisma.device.findMany({ where: { nmsDeviceId: { not: null } }, select: deviceSelect, orderBy: { name: 'asc' }, take: 250 });
    let device = deviceId ? await prisma.device.findUnique({ where: { id: deviceId }, select: deviceSelect }) : null;
    if (deviceId && (!device || device.nmsDeviceId === null)) return NextResponse.json({ error: 'NMS cihazı bulunamadı.' }, { status: 404 });
    if (!deviceId) {
      const incident = await prisma.alarmIncident.findFirst({
        where: { entityType: 'nms-device', status: { in: ['OPEN', 'ACKNOWLEDGED'] }, severity: { in: ['ALARM_CRITICAL', 'ALARM_HIGH'] }, archiveState: 'HOT' },
        orderBy: [{ severity: 'asc' }, { lastSeenAt: 'desc' }], select: { entityId: true },
      });
      const nmsId = incident?.entityId && /^\d+$/.test(incident.entityId) ? Number(incident.entityId) : null;
      if (nmsId && nmsId <= 2147483647) device = await prisma.device.findUnique({ where: { nmsDeviceId: nmsId }, select: deviceSelect });
      if (!device) device = await prisma.device.findFirst({ where: { nmsDeviceId: { not: null }, pollingEnabled: true }, select: deviceSelect, orderBy: { lastPolledAt: 'desc' } });
    }
    const window = resourceWindow(range as DashboardRange);
    if (!device || device.nmsDeviceId === null) {
      return NextResponse.json({ generatedAt: window.end, range, device: null, devices, points: [], latest: { cpu: null, memory: null } }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    const [rows, cpu, memory] = await Promise.all([
      prisma.$queryRaw<ResourceBucket[]>`
        SELECT FLOOR(EXTRACT(EPOCH FROM (collected_at - ${window.start}::timestamp)) / ${window.seconds})::int AS bucket,
          AVG(cpu_usage) FILTER (WHERE cpu_usage BETWEEN 0 AND 100)::float8 AS cpu,
          AVG(memory_usage) FILTER (WHERE memory_usage BETWEEN 0 AND 100)::float8 AS memory,
          MAX(cpu_usage) FILTER (WHERE cpu_usage BETWEEN 0 AND 100)::float8 AS "cpuPeak",
          MAX(memory_usage) FILTER (WHERE memory_usage BETWEEN 0 AND 100)::float8 AS "memoryPeak", COUNT(*)::int AS samples
        FROM nms_health_metrics
        WHERE nms_device_id = ${device.nmsDeviceId} AND collected_at >= ${window.start} AND collected_at < ${window.end}
        GROUP BY bucket ORDER BY bucket`,
      prisma.nmsHealthMetric.findFirst({ where: { nmsDeviceId: device.nmsDeviceId, cpuUsage: { gte: 0, lte: 100 }, collectedAt: { lte: window.end } }, orderBy: { collectedAt: 'desc' }, select: { cpuUsage: true, collectedAt: true } }),
      prisma.nmsHealthMetric.findFirst({ where: { nmsDeviceId: device.nmsDeviceId, memoryUsage: { gte: 0, lte: 100 }, collectedAt: { lte: window.end } }, orderBy: { collectedAt: 'desc' }, select: { memoryUsage: true, collectedAt: true } }),
    ]);
    return NextResponse.json({
      generatedAt: window.end, range, device, devices,
      points: fillResourceBuckets(window.start, window.seconds, window.count, rows),
      latest: { cpu: cpu?.cpuUsage == null ? null : { value: cpu.cpuUsage, at: cpu.collectedAt }, memory: memory?.memoryUsage == null ? null : { value: memory.memoryUsage, at: memory.collectedAt } },
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[Dashboard] Resource query failed:', error);
    return NextResponse.json({ error: 'Kaynak kullanım verileri alınamadı.' }, { status: 503 });
  }
}
