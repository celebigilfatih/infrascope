import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeApiRequest } from '@/lib/auth/api-permission';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
const device = { id: true, name: true, managementIp: true } as const;
export async function GET(request: NextRequest) {
  const access = await authorizeApiRequest(request, 'devices', 'read');
  if (!access.allowed) return access.response;
  try {
    const snapshot = await prisma.$transaction(async tx => {
      // Fail explicitly rather than sending a silently truncated relationship snapshot.
      const [apps, services, dependencies, unassignedServices] = await Promise.all([
        tx.application.count(), tx.service.count({ where: { applicationId: { not: null } } }),
        tx.dependency.count({ where: { sourceService: { applicationId: { not: null } } } }),
        tx.service.count({ where: { applicationId: null } }),
      ]);
      if (apps > 5000 || services > 20000 || dependencies > 50000) return null;
      const rows = await tx.application.findMany({
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: {
          id: true, name: true, vendor: true, version: true, createdAt: true, updatedAt: true,
          services: { orderBy: [{ name: 'asc' }, { id: 'asc' }], select: {
            id: true, name: true, applicationId: true, displayName: true, description: true, type: true, status: true, port: true, protocol: true, updatedAt: true, deviceId: true, device: { select: device },
            dependencies: { orderBy: { id: 'asc' }, select: { id: true, sourceServiceId: true, targetDeviceId: true, type: true, criticality: true, description: true, targetDevice: { select: device } } },
          } },
        },
      });
      return { rows, unassignedServices };
    }, { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 15000 });
    if (!snapshot) return NextResponse.json({ success: false, code: 'TOO_LARGE', error: 'Uygulama ilişki listesi bu görünümün sınırını aşıyor. Kayıtlar kısaltılarak gösterilmedi.' }, { status: 503, headers });
    return NextResponse.json({ success: true, source: 'database', readAt: new Date().toISOString(), data: snapshot.rows, unassignedServices: snapshot.unassignedServices }, { headers });
  } catch (error) {
    console.error('Applications workspace read failed', error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json({ success: false, error: 'Uygulama, servis ve ilişki kayıtları alınamadı. Yeniden deneyin.' }, { status: 503, headers });
  }
}
