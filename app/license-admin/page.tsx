import { PageHeading } from '@/components/ui/page-heading';
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
          <PageHeading section="license" description={<>
            Bu alan, merkezi lisans sunucusunda yönetici hesabı gerektirir.
          </>}>Merkezi Lisans Yönetimi</PageHeading>
        </div>
      </div>
    );
  }

  return <LicenseAdminClient />;
}
