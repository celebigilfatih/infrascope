import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { isLicenseServerMode } from '@/lib/license/server-mode';

export async function requireLicenseAdmin(request: NextRequest): Promise<NextResponse | null> {
  if (!isLicenseServerMode()) {
    return NextResponse.json(
      { success: false, error: 'License admin is not enabled on this deployment' },
      { status: 404 }
    );
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json(
      { success: false, error: 'Authentication required' },
      { status: 401 }
    );
  }

  const session = await verifySessionToken(token);
  if (!session) {
    return NextResponse.json(
      { success: false, error: 'Session expired or invalid' },
      { status: 401 }
    );
  }

  if (session.role.toUpperCase() !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'Forbidden: license admin requires ADMIN role' },
      { status: 403 }
    );
  }

  return null;
}
