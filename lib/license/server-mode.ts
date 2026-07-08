import { NextResponse } from 'next/server';

export function isLicenseServerMode(): boolean {
  return (
    process.env.DEPLOYMENT_MODE === 'license-server' ||
    process.env.LICENSE_SERVER_MODE === 'true'
  );
}

export function requireLicenseServerMode(): NextResponse | null {
  if (isLicenseServerMode()) return null;

  return NextResponse.json(
    { error: 'License issuer endpoints are not enabled on this deployment' },
    { status: 404 }
  );
}
