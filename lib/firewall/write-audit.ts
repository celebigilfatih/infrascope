import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { classifyFortiGateError } from './errors';
import {
  executeAuditedFirewallWrite,
  type FirewallWriteAuditReservation,
} from './write-audit-contract';

export type FirewallWriteAuditRequest = {
  action: 'firewall.quarantine.add' | 'firewall.quarantine.remove';
  actorId: string;
  actorName?: string;
  targetKey: string;
  resourceId: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
};

export class FirewallWriteAuditError extends Error {
  readonly code = 'AUDIT_UNAVAILABLE';
  readonly status = 503;

  constructor(message = 'Firewall write audit service is unavailable', cause?: unknown) {
    super(message);
    this.name = 'FirewallWriteAuditError';
    if (cause) (this as Error & { cause?: unknown }).cause = cause;
  }
}

async function reserveFirewallWriteAudit(
  request: FirewallWriteAuditRequest
): Promise<FirewallWriteAuditReservation<FirewallWriteAuditRequest>> {
  const operationId = randomUUID();
  try {
    const audit = await prisma.auditLog.create({
      data: {
        entity: 'FirewallWrite',
        entityId: operationId,
        action: `${request.action}.reserved`,
        resource: 'firewall',
        resourceId: request.resourceId,
        userId: request.actorId,
        ipAddress: request.ipAddress,
        userAgent: request.userAgent,
        details: {
          phase: 'RESERVED',
          operationId,
          targetKey: request.targetKey,
          actorName: request.actorName,
          ...request.details,
        },
      },
      select: { id: true },
    });
    return { operationId, auditId: audit.id, request };
  } catch (error) {
    throw new FirewallWriteAuditError(undefined, error);
  }
}

async function recordFirewallWriteOutcome(
  reservation: FirewallWriteAuditReservation<FirewallWriteAuditRequest>,
  outcome: 'SUCCEEDED' | 'FAILED',
  error?: unknown
): Promise<void> {
  const classified = error ? classifyFortiGateError(error) : null;
  try {
    await prisma.auditLog.create({
      data: {
        entity: 'FirewallWrite',
        entityId: reservation.operationId,
        action: `${reservation.request.action}.${outcome.toLowerCase()}`,
        resource: 'firewall',
        resourceId: reservation.request.resourceId,
        userId: reservation.request.actorId,
        ipAddress: reservation.request.ipAddress,
        userAgent: reservation.request.userAgent,
        details: {
          phase: outcome,
          operationId: reservation.operationId,
          reservationAuditId: reservation.auditId,
          targetKey: reservation.request.targetKey,
          errorCode: classified?.code,
          retryable: classified?.retryable,
        },
      },
    });
  } catch (auditError) {
    throw new FirewallWriteAuditError(undefined, auditError);
  }
}

export function executeFirewallWriteWithAudit<Result>(
  request: FirewallWriteAuditRequest,
  operation: () => Promise<Result>
) {
  return executeAuditedFirewallWrite(request, operation, {
    reserve: reserveFirewallWriteAudit,
    recordOutcome: recordFirewallWriteOutcome,
  });
}
