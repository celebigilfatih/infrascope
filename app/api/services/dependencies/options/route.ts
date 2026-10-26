import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeApiRequest } from '@/lib/auth/api-permission';
import { dependencyDeviceSelect, dependencySourceSelect } from '@/lib/services/dependency-select';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: NextRequest) {
  const access = await authorizeApiRequest(request, 'devices', 'read'); if (!access.allowed) return access.response;
  try {
    const options = await prisma.$transaction(async tx => {
      const [services, devices] = await Promise.all([tx.service.count(), tx.device.count()]); if (services > 20000 || devices > 20000) return null;
      const [serviceRows, deviceRows] = await Promise.all([tx.service.findMany({ select: dependencySourceSelect, orderBy: [{ name: 'asc' }, { id: 'asc' }] }), tx.device.findMany({ select: dependencyDeviceSelect, orderBy: [{ name: 'asc' }, { id: 'asc' }] })]); return { services: serviceRows, devices: deviceRows };
    }, { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 15000 });
    if (!options) return NextResponse.json({ success: false, code: 'TOO_LARGE', error: 'Servis veya cihaz seçenekleri görünüm sınırını aşıyor.' }, { status: 503, headers });
    return NextResponse.json({ success: true, source: 'database', ...options }, { headers });
  } catch { return NextResponse.json({ success: false, error: 'Servis ve cihaz seçenekleri alınamadı. Yeniden deneyin.' }, { status: 503, headers }); }
}
