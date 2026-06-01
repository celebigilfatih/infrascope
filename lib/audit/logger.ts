import { prisma } from '@/lib/prisma';

export interface AuditLogParams {
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Log an audit event. Audit logs are immutable - no update or delete operations.
 */
export async function logAudit(params: AuditLogParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        entity: params.resource,
        entityId: params.resourceId || 'system',
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId,
        details: params.details ? (params.details as any) : undefined,
        userId: params.userId || undefined,
        ipAddress: params.ipAddress || undefined,
        userAgent: params.userAgent || undefined,
      },
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
    // Audit logging should not break the main flow
  }
}

/**
 * Get audit logs with filtering and pagination.
 */
export async function getAuditLogs(params: {
  userId?: string;
  action?: string;
  resource?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}) {
  const { userId, action, resource, startDate, endDate, page = 1, pageSize = 50 } = params;

  const where: Record<string, unknown> = {};

  if (userId) where.userId = userId;
  if (action) where.action = { contains: action, mode: 'insensitive' };
  if (resource) where.resource = resource;

  if (startDate || endDate) {
    const timestampFilter: Record<string, Date> = {};
    if (startDate) timestampFilter.gte = new Date(startDate);
    if (endDate) timestampFilter.lte = new Date(endDate);
    where.timestamp = timestampFilter;
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    logs,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
