import { prisma } from '@/lib/prisma';

export async function getSetupStatus() {
  const [userCount, adminCount] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } }),
  ]);

  return {
    setupRequired: userCount === 0,
    hasAdmin: adminCount > 0,
  };
}
