import { NotificationAttemptStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export async function recordNotificationAttempt(params: {
  alarmEventId?: string;
  incidentId?: string;
  channel: string;
  status: NotificationAttemptStatus;
  attempt?: number;
  error?: string;
  providerId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await prisma.notificationAttempt.create({
    data: {
      alarmEventId: params.alarmEventId,
      incidentId: params.incidentId,
      channel: params.channel,
      status: params.status,
      attempt: params.attempt ?? 1,
      error: params.error?.slice(0, 1000),
      providerId: params.providerId,
      metadata: params.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}
