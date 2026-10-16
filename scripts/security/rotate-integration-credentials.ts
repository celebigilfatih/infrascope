import { prisma } from '../../lib/prisma';
import { migrateIntegrationCredentials } from '../../lib/security/integration-credential-migration';

async function main(): Promise<void> {
  if (!process.env.INTEGRATION_CREDENTIALS_KEY?.trim()) {
    throw new Error('INTEGRATION_CREDENTIALS_KEY must contain the new active key');
  }

  const migrateOnly = process.argv.includes('--migrate');
  const result = await migrateIntegrationCredentials({ rotate: !migrateOnly, includeNms: false });
  console.log(`${migrateOnly ? 'Migrated' : 'Rotated'} ${result.protected} integration and ${result.smtpProtected} SMTP configuration(s).`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
