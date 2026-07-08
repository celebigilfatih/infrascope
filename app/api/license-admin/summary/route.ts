import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireLicenseAdmin } from '@/lib/license/admin-auth';

export async function GET(request: NextRequest) {
  const authError = await requireLicenseAdmin(request);
  if (authError) return authError;

  const now = new Date();
  const soon = new Date(now);
  soon.setDate(soon.getDate() + 30);

  const [
    totalCustomers,
    activeLicenses,
    expiringSoon,
    suspendedOrRevoked,
    activeActivations,
    recentHeartbeats,
  ] = await Promise.all([
    prisma.customer.count(),
    prisma.license.count({ where: { status: 'ACTIVE' } }),
    prisma.license.count({ where: { status: 'ACTIVE', validUntil: { lte: soon, gte: now } } }),
    prisma.license.count({ where: { status: { in: ['SUSPENDED', 'REVOKED'] } } }),
    prisma.licenseActivation.count({ where: { status: 'ACTIVE' } }),
    prisma.licenseHeartbeat.count({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      totalCustomers,
      activeLicenses,
      expiringSoon,
      suspendedOrRevoked,
      activeActivations,
      recentHeartbeats,
    },
  });
}
