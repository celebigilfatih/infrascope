import { NextResponse } from 'next/server';
import { getAuditLogs } from '@/lib/audit/logger';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const params = {
      userId: searchParams.get('userId') || undefined,
      action: searchParams.get('action') || undefined,
      resource: searchParams.get('resource') || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      page: parseInt(searchParams.get('page') || '1'),
      pageSize: parseInt(searchParams.get('pageSize') || '50'),
    };

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
        userName: log.user?.name || 'System',
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
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

// Audit logs are immutable - no POST, PATCH, or DELETE
export async function POST() {
  return NextResponse.json(
    { success: false, error: 'Audit logs are immutable' },
    { status: 405 }
  );
}

export async function PATCH() {
  return NextResponse.json(
    { success: false, error: 'Audit logs are immutable' },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { success: false, error: 'Audit logs are immutable' },
    { status: 405 }
  );
}
