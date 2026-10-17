import { NextResponse, type NextRequest } from 'next/server';
import { getAuditLogs } from '@/lib/audit/logger';
import { AuditQueryError, parseAuditQuery } from '@/lib/audit/query';
import { authorizeApiRequest } from '@/lib/auth/api-permission';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const permission = await authorizeApiRequest(request, 'audit', 'read');
    if (!permission.allowed) return permission.response;
    const { searchParams } = new URL(request.url);

    const params = parseAuditQuery(searchParams);

    const result = await getAuditLogs(params);

    return NextResponse.json({
      success: true,
      data: result.logs.map((log) => ({
        id: log.id,
        action: log.action,
        resource: log.resource,
        resourceId: log.resourceId,
        details: log.details,
        userId: log.userId,
        userName: log.user?.name || (log.userId ? 'Silinmiş kullanıcı' : 'Sistem'),
        userEmail: log.user?.email || null,
        userRole: log.user?.role?.toLowerCase() || null,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        timestamp: log.timestamp,
      })),
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof AuditQueryError) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    console.error('Error fetching audit logs:', error);
    return NextResponse.json(
      { success: false, error: 'Denetim kayıtları yüklenemedi. Tekrar deneyin.' },
      { status: 500 }
    );
  }
}

// Audit logs are immutable - no POST, PATCH, or DELETE
export async function POST() {
  return NextResponse.json(
    { success: false, error: 'Denetim kayıtları değiştirilemez.' },
    { status: 405 }
  );
}

export async function PATCH() {
  return NextResponse.json(
    { success: false, error: 'Denetim kayıtları değiştirilemez.' },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { success: false, error: 'Denetim kayıtları değiştirilemez.' },
    { status: 405 }
  );
}
