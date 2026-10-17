import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { auditWhere, type AuditQuery } from './query';

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
        details: params.details ? (params.details as Prisma.InputJsonObject) : undefined,
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
export async function getAuditLogs(params: AuditQuery) {
  const { page = 1, pageSize = 50 } = params;
  const where = auditWhere(params);

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
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
