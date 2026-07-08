import { NextRequest, NextResponse } from 'next/server';
import { requireLicenseAdmin } from '@/lib/license/admin-auth';

export async function GET(request: NextRequest) {
  const authError = await requireLicenseAdmin(request);
  if (authError) return authError;

  return NextResponse.json({ success: true, enabled: true });
}
