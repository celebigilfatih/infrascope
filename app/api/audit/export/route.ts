import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Escape a value for safe CSV output.
 * Wraps in double quotes and escapes internal double quotes.
 * Prevents formula injection by prefixing dangerous characters.
 */
function escapeCsv(value: unknown): string {
  const str = String(value ?? '');
  // Prevent CSV formula injection: = + - @ \t \r
  const needsSanitizing = /^[=+\-@\t\r]/.test(str);
  const sanitized = needsSanitizing ? `'${str}` : str;
  return `"${sanitized.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const where: Record<string, unknown> = {};
    const userId = searchParams.get('userId');
    const action = searchParams.get('action');
    const resource = searchParams.get('resource');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (userId) where.userId = userId;
    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (resource) where.resource = resource;

    if (startDate || endDate) {
      const timestampFilter: Record<string, Date> = {};
      if (startDate) timestampFilter.gte = new Date(startDate);
      if (endDate) timestampFilter.lte = new Date(endDate);
      where.timestamp = timestampFilter;
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: 10000,
      include: {
        user: {
          select: { name: true, email: true, role: true },
        },
      },
    });

    // Build CSV with proper escaping on ALL fields
    const headers = ['Timestamp', 'Action', 'Resource', 'Resource ID', 'User', 'Email', 'Role', 'IP Address', 'Details'];
    const rows = logs.map((log) => [
      escapeCsv(new Date(log.timestamp).toISOString()),
      escapeCsv(log.action),
      escapeCsv(log.resource),
      escapeCsv(log.resourceId),
      escapeCsv(log.user?.name || 'System'),
      escapeCsv(log.user?.email),
      escapeCsv(log.user?.role),
      escapeCsv(log.ipAddress),
      escapeCsv(log.details ? JSON.stringify(log.details) : ''),
    ]);

    const csvContent = [
      headers.map(escapeCsv).join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n');

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="audit-log-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error('Error exporting audit logs:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
