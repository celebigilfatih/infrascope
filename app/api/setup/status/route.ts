import { NextResponse } from 'next/server';
import { getSetupStatus } from '@/lib/setup/status';
import { hasConfiguredLicense } from '@/lib/license/client';
import { isLicenseServerMode } from '@/lib/license/server-mode';

export async function GET() {
  try {
    const status = await getSetupStatus();

    return NextResponse.json({
      success: true,
      ...status,
      licenseConfigured: hasConfiguredLicense(),
      licenseServerMode: isLicenseServerMode(),
    });
  } catch (error) {
    console.error('[Setup] Status error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to read setup status' },
      { status: 500 }
    );
  }
}
