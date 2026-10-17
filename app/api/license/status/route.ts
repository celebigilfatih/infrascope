/**
 * GET /api/license/status
 *
 * Get current license status and usage statistics.
 * Used by the admin license management page.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminLicenseInfo } from '@/lib/license/middleware';
import { authorizeApiRequest } from '@/lib/auth/api-permission';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authorization = await authorizeApiRequest(request, 'settings', 'read');
  if (!authorization.allowed) {
    authorization.response.headers.set('Cache-Control', 'private, no-store');
    return authorization.response;
  }
  try {
    // Get license state from middleware
    const license = await getAdminLicenseInfo();

    // Get current usage statistics
    const [deviceCount, userCount] = await Promise.all([
      prisma.device.count(),
      prisma.user.count(),
    ]);

    return NextResponse.json({
      license,
      usage: {
        deviceCount,
        userCount,
      },
      observedAt: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    console.error('[License] Status lookup failed', err instanceof Error ? err.name : 'UnknownError');
    return NextResponse.json(
      { error: 'Lisans bilgileri alınamadı.' },
      { status: 500, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }
}
