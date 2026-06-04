/**
 * GET /api/license/status
 *
 * Get current license status and usage statistics.
 * Used by the admin license management page.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminLicenseInfo } from '@/lib/license/middleware';

export async function GET() {
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
    });
  } catch (err) {
    console.error('[License] Status error:', err);
    return NextResponse.json(
      { error: 'Failed to get license status' },
      { status: 500 }
    );
  }
}
