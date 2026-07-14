import { prisma } from '../../lib/prisma';
import {
  protectIntegrationConfig,
  unprotectIntegrationConfig,
  type IntegrationCredentialProfile,
} from '../../lib/security/integration-credentials';

const PROFILES: readonly IntegrationCredentialProfile[] = ['FORTIGATE', 'FORTIANALYZER'];

async function main(): Promise<void> {
  if (!process.env.INTEGRATION_CREDENTIALS_KEY?.trim()) {
    throw new Error('INTEGRATION_CREDENTIALS_KEY must contain the new active key');
  }

  const configs = await prisma.integrationConfig.findMany({
    where: { type: { in: [...PROFILES] } },
    select: { id: true, type: true, config: true },
  });

  const updates = configs.map((config) => {
    const profile = config.type as IntegrationCredentialProfile;
    const plaintext = unprotectIntegrationConfig<Record<string, unknown>>(
      config.config,
      profile
    );
    const protectedConfig = protectIntegrationConfig<Record<string, unknown>>(
      plaintext,
      profile
    );
    return prisma.integrationConfig.update({
      where: { id: config.id },
      data: { config: protectedConfig as any },
    });
  });

  await prisma.$transaction(updates);
  console.log(`Rotated ${updates.length} FortiGate/FortiAnalyzer integration configuration(s).`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
