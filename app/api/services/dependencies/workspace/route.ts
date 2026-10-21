import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeApiRequest } from '@/lib/auth/api-permission';
import { canAccessSync } from '@/lib/auth/permission-policy';
import { dependencySelect } from '@/lib/services/dependency-select';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: NextRequest) {
  const access = await authorizeApiRequest(request, 'devices', 'read'); if (!access.allowed) return access.response;
  try {
    const rows = await prisma.$transaction(async tx => { if (await tx.dependency.count() > 50000) return null; return tx.dependency.findMany({ select: dependencySelect, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] }); }, { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 15000 });
    if (!rows) return NextResponse.json({ success: false, code: 'TOO_LARGE', error: 'İlişki sayısı görünüm sınırını aşıyor. Kısaltılmış liste gösterilmedi.' }, { status: 503, headers });
    return NextResponse.json({ success: true, source: 'database', readAt: new Date().toISOString(), data: rows, canWrite: canAccessSync(access.auth.role, 'devices', 'write'), canDelete: canAccessSync(access.auth.role, 'devices', 'delete') }, { headers });
  } catch { return NextResponse.json({ success: false, error: 'Bağımlılık kayıtları alınamadı. Yeniden deneyin.' }, { status: 503, headers }); }
}
