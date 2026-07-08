import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { isLicenseServerMode } from '@/lib/license/server-mode';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import LicenseAdminClient from './LicenseAdminClient';

export default async function LicenseAdminPage() {
  if (!isLicenseServerMode()) {
    notFound();
  }

  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session || session.role.toUpperCase() !== 'ADMIN') {
    return (
      <div className="p-6">
        <div className="rounded-lg border bg-card p-6">
          <h1 className="text-xl font-semibold">License Admin</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This area requires an ADMIN account on the central license server.
          </p>
        </div>
      </div>
    );
  }

  return <LicenseAdminClient />;
}
