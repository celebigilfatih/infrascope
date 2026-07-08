import { NextResponse } from 'next/server';
import { getSetupStatus } from '@/lib/setup/status';
import { hasConfiguredLicense } from '@/lib/license/client';

export async function GET() {
  try {
    const status = await getSetupStatus();

    return NextResponse.json({
      success: true,
      ...status,
      licenseConfigured: hasConfiguredLicense(),
    });
  } catch (error) {
    console.error('[Setup] Status error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to read setup status' },
      { status: 500 }
    );
  }
}
