import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeApiRequest } from '@/lib/auth/api-permission';
import { canAccessSync } from '@/lib/auth/permission-policy';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
const device = { id: true, name: true, managementIp: true } as const;
export async function GET(request: NextRequest) {
  const access = await authorizeApiRequest(request, 'devices', 'read');
  if (!access.allowed) return access.response;
  try {
    const rows = await prisma.$transaction(async tx => {
      const [services, relations] = await Promise.all([tx.service.count(), tx.dependency.count()]);
      if (services > 20000 || relations > 50000) return null;
      return tx.service.findMany({ orderBy: [{ name: 'asc' }, { id: 'asc' }], select: {
        id: true, name: true, displayName: true, description: true, type: true, status: true, port: true, protocol: true, criticality: true, deviceId: true, applicationId: true, createdAt: true, updatedAt: true,
        device: { select: device }, application: { select: { id: true, name: true, vendor: true, version: true } },
        dependencies: { orderBy: { id: 'asc' }, select: { id: true, sourceServiceId: true, targetDeviceId: true, type: true, criticality: true, description: true, targetDevice: { select: device } } },
      } });
    }, { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 15000 });
    if (!rows) return NextResponse.json({ success: false, code: 'TOO_LARGE', error: 'Servis ve ilişki listesi görünüm sınırını aşıyor. Kayıtlar kısaltılarak gösterilmedi.' }, { status: 503, headers });
    return NextResponse.json({ success: true, source: 'database', data: rows, readAt: new Date().toISOString(), canDelete: canAccessSync(access.auth.role, 'devices', 'delete') }, { headers });
  } catch (error) {
    console.error('Services workspace read failed', error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json({ success: false, error: 'Servis, uygulama ve cihaz ilişkileri alınamadı. Yeniden deneyin.' }, { status: 503, headers });
  }
}
