import { prisma } from '@/lib/prisma';

export interface AlarmHealthStats {
  totalDefinitions: number;
  enabledDefinitions: number;
  recentEvents: number;
  /** Failed/partial checks during the last hour, including recovered checks. */
  recentErrors: number;
  /** Error checks since the latest successful check, within the last hour. */
  unresolvedErrorChecks: number;
}

export async function getAlarmHealthStats(): Promise<AlarmHealthStats> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [totalDefinitions, enabledDefinitions, recentEvents, recentErrors, lastSuccess] = await Promise.all([
    prisma.alarmDefinition.count(),
    prisma.alarmDefinition.count({ where: { enabled: true } }),
    prisma.alarmEvent.count({ where: { createdAt: { gte: oneHourAgo } } }),
    prisma.alarmCheckLog.count({ where: { checkTime: { gte: oneHourAgo }, errorCount: { gt: 0 } } }),
    prisma.alarmCheckLog.findFirst({
      where: { checkTime: { gte: oneHourAgo }, status: 'SUCCESS', errorCount: 0 },
      orderBy: { checkTime: 'desc' },
      select: { checkTime: true },
    }),
  ]);

  const unresolvedErrorChecks = recentErrors === 0 ? 0 : await prisma.alarmCheckLog.count({
    where: {
      checkTime: { gte: oneHourAgo, ...(lastSuccess ? { gt: lastSuccess.checkTime } : {}) },
      errorCount: { gt: 0 },
    },
  });

  return { totalDefinitions, enabledDefinitions, recentEvents, recentErrors, unresolvedErrorChecks };
}
