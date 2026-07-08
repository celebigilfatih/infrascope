import { NextResponse } from 'next/server';
import { activateAndCacheLicense } from '@/lib/license/client';
import { getSetupStatus } from '@/lib/setup/status';

export async function POST(request: Request) {
  try {
    const setup = await getSetupStatus();
    if (!setup.setupRequired) {
      return NextResponse.json(
        { success: false, error: 'Setup is already completed' },
        { status: 403 }
      );
    }

    const { licenseKey } = await request.json();
    if (!licenseKey || typeof licenseKey !== 'string') {
      return NextResponse.json(
        { success: false, error: 'licenseKey is required' },
        { status: 400 }
      );
    }

    const state = await activateAndCacheLicense(licenseKey.trim());
    if (!state) {
      return NextResponse.json(
        { success: false, error: 'License activation failed' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, license: state });
  } catch (error) {
    console.error('[Setup] License activation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to activate license' },
      { status: 500 }
    );
  }
}
