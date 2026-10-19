import { NextRequest, NextResponse } from 'next/server';
import { authorizeApiRequest } from '@/lib/auth/api-permission';
import { prisma } from '@/lib/prisma';
import { buildStatusSnapshots, statusNeedsAttention, type IntegrationSnapshot } from '@/lib/integrations/status-workspace';

export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function GET(request: NextRequest) {
  const access = await authorizeApiRequest(request, 'settings', 'read');
  if (!access.allowed) return access.response;
  try {
    const records = await prisma.integrationConfig.findMany({
      orderBy: [{ type: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      select: {
        id: true, type: true, name: true, enabled: true, config: true, lastSyncAt: true, lastSyncStatus: true,
        syncLogs: { orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], take: 1, select: { status: true, startedAt: true, completedAt: true, errorDetails: true } },
        firewallConnectors: { orderBy: [{ vdom: 'asc' }, { id: 'asc' }], select: { id: true, managementHost: true, vdom: true, capabilities: true, lastProbeAt: true, nextProbeAt: true, lastErrorCode: true, identityStatus: true } },
      },
    });
    const data = buildStatusSnapshots(records), warnings: string[] = [];
    // NMS is configured per device, independently of IntegrationConfig SNMP profiles.
    let activity: NonNullable<IntegrationSnapshot['activity']>;
    try {
      const [registered, polling, latest] = await Promise.all([
        prisma.device.count({ where: { nmsDeviceId: { not: null } } }),
        prisma.device.count({ where: { nmsDeviceId: { not: null }, pollingEnabled: true } }),
        prisma.nmsHealthMetric.findFirst({ where: { device: { pollingEnabled: true } }, orderBy: [{ collectedAt: 'desc' }, { id: 'desc' }], select: { collectedAt: true } }),
      ]);
      activity = { registered, polling, lastMetricAt: latest?.collectedAt.toISOString() ?? null, readFailed: false };
    } catch {
      activity = { registered: null, polling: null, lastMetricAt: null, readFailed: true };
      warnings.push('Cihaz izleme hizmetinin kayıt ve ölçüm bilgileri alınamadı. Diğer entegrasyonların bilgileri gösteriliyor.');
    }
    data.push({ id: 'system-nms', kind: 'NMS', name: 'Cihaz izleme hizmeti', configured: activity.readFailed ? null : Boolean(activity.registered), enabled: activity.readFailed ? null : Boolean(activity.polling), host: null, scope: 'NMS / SNMP', connection: { state: 'unknown', checkedAt: null, nextCheckAt: null, latencyMs: null, errorCode: null }, sync: null, activity, identityConflict: false });
    // Keep the summary outcome for existing readers; connection and transfer evidence remain separate.
    const output = data.map(row => ({ ...row, status: row.configured === false ? 'unconfigured' : row.enabled === false ? 'disabled' : statusNeedsAttention(row) ? 'error' : row.connection.state === 'success' ? 'connected' : 'unknown', message: row.sync?.status === 'partial' ? 'Son senkronizasyon kısmen tamamlandı.' : row.sync?.status === 'failed' ? 'Son senkronizasyon başarısız.' : row.connection.state === 'failed' ? 'Son bağlantı kontrolü başarısız.' : row.connection.state === 'success' ? 'Son kayıtlı bağlantı kontrolü başarılı.' : 'Kayıtlı bağlantı kontrolü bulunmuyor.' }));
    return reply({ success: true, data: output, observedAt: new Date().toISOString(), warnings });
  } catch {
    return reply({ success: false, error: 'Entegrasyon durumları alınamadı. Daha sonra yeniden deneyin.' }, 503);
  }
}
