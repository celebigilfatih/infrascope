import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AuditQueryError, auditWhere, parseAuditQuery } from '@/lib/audit/query';
import { authorizeApiRequest } from '@/lib/auth/api-permission';

export const dynamic = 'force-dynamic';

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

export async function GET(request: NextRequest) {
  try {
    const permission = await authorizeApiRequest(request, 'audit', 'read');
    if (!permission.allowed) return permission.response;
    const { searchParams } = new URL(request.url);

    const where = auditWhere(parseAuditQuery(searchParams));

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      take: 10001,
      include: {
        user: {
          select: { name: true, email: true, role: true },
        },
      },
    });

    // Build CSV with proper escaping on ALL fields
    const headers = ['Tarih ve saat (UTC)', 'İşlem kodu', 'Kaynak', 'Kaynak kimliği', 'Kullanıcı', 'E-posta', 'Rol', 'IP adresi', 'Ayrıntılar'];
    const rows = logs.slice(0, 10000).map((log) => [
      escapeCsv(new Date(log.timestamp).toISOString()),
      escapeCsv(log.action),
      escapeCsv(log.resource),
      escapeCsv(log.resourceId),
      escapeCsv(log.user?.name || (log.userId ? 'Silinmiş kullanıcı' : 'Sistem')),
      escapeCsv(log.user?.email),
      escapeCsv(log.user?.role),
      escapeCsv(log.ipAddress),
      escapeCsv(log.details ? JSON.stringify(log.details) : ''),
    ]);

    const csvContent = [
      headers.map(escapeCsv).join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n');

    return new NextResponse(`\uFEFF${csvContent}`, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-Audit-Export-Truncated': String(logs.length > 10000),
        'Content-Disposition': `attachment; filename="audit-log-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof AuditQueryError) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    console.error('Error exporting audit logs:', error);
    return NextResponse.json(
      { success: false, error: 'Denetim kayıtları dışa aktarılamadı. Tekrar deneyin.' },
      { status: 500 }
    );
  }
}
