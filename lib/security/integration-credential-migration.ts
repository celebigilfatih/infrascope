import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import {
  integrationConfigNeedsDedicatedKey,
  integrationConfigNeedsProtection,
  nmsCredentialNeedsDedicatedKey,
  nmsCredentialNeedsProtection,
  protectNmsBackup,
  protectNmsCredential,
  protectIntegrationConfig,
  type IntegrationCredentialProfile,
} from './integration-credentials';

const log = createLogger('integration-credential-migration');
const PROFILES: readonly IntegrationCredentialProfile[] = ['FORTIGATE', 'FORTIANALYZER'];

export async function migrateIntegrationCredentials(): Promise<{
  inspected: number;
  protected: number;
  nmsCredentialsProtected: number;
  backupsProtected: number;
  rotationRequested: boolean;
}> {
  const rotationRequested = Boolean(
    process.env.INTEGRATION_CREDENTIALS_PREVIOUS_KEY?.trim()
  );
  const configs = await prisma.integrationConfig.findMany({
    where: { type: { in: [...PROFILES] } },
    select: { id: true, type: true, config: true },
  });

  let protectedCount = 0;
  for (const config of configs) {
    const profile = config.type as IntegrationCredentialProfile;
    const needsProtection = integrationConfigNeedsProtection(config.config, profile);
    const needsDedicatedKey = integrationConfigNeedsDedicatedKey(config.config, profile);
    if (!rotationRequested && !needsProtection && !needsDedicatedKey) continue;

    const protectedConfig = protectIntegrationConfig<Record<string, unknown>>(
      config.config,
      profile
    );
    await prisma.integrationConfig.update({
      where: { id: config.id },
      data: { config: protectedConfig as any },
    });
    protectedCount += 1;
  }

  const devices = await prisma.device.findMany({
    where: {
      OR: [
        { snmpCommunity: { not: null } },
        { snmpV3AuthPassword: { not: null } },
        { snmpV3PrivacyPassword: { not: null } },
        { sshPassword: { not: null } },
      ],
    },
    select: {
      id: true,
      snmpCommunity: true,
      snmpV3AuthPassword: true,
      snmpV3PrivacyPassword: true,
      sshPassword: true,
    },
  });
  let nmsCredentialsProtected = 0;
  for (const device of devices) {
    const data: {
      snmpCommunity?: string;
      snmpV3AuthPassword?: string;
      snmpV3PrivacyPassword?: string;
      sshPassword?: string;
    } = {};
    if (
      device.snmpCommunity
      && (nmsCredentialNeedsProtection(device.snmpCommunity)
        || nmsCredentialNeedsDedicatedKey(device.snmpCommunity)
        || rotationRequested)
    ) {
      data.snmpCommunity = protectNmsCredential(device.snmpCommunity, 'snmpCommunity');
    }
    if (
      device.snmpV3AuthPassword
      && (nmsCredentialNeedsProtection(device.snmpV3AuthPassword)
        || nmsCredentialNeedsDedicatedKey(device.snmpV3AuthPassword)
        || rotationRequested)
    ) {
      data.snmpV3AuthPassword = protectNmsCredential(
        device.snmpV3AuthPassword,
        'snmpV3AuthPassword'
      );
    }
    if (
      device.snmpV3PrivacyPassword
      && (nmsCredentialNeedsProtection(device.snmpV3PrivacyPassword)
        || nmsCredentialNeedsDedicatedKey(device.snmpV3PrivacyPassword)
        || rotationRequested)
    ) {
      data.snmpV3PrivacyPassword = protectNmsCredential(
        device.snmpV3PrivacyPassword,
        'snmpV3PrivacyPassword'
      );
    }
    if (
      device.sshPassword
      && (nmsCredentialNeedsProtection(device.sshPassword)
        || nmsCredentialNeedsDedicatedKey(device.sshPassword)
        || rotationRequested)
    ) {
      data.sshPassword = protectNmsCredential(device.sshPassword, 'sshPassword');
    }
    if (Object.keys(data).length === 0) continue;
    await prisma.device.update({ where: { id: device.id }, data });
    nmsCredentialsProtected += 1;
  }

  const backups = await prisma.nmsBackup.findMany({
    where: { configuration: { not: null } },
    select: { id: true, configuration: true },
  });
  let backupsProtected = 0;
  for (const backup of backups) {
    if (!backup.configuration) continue;
    if (
      !nmsCredentialNeedsProtection(backup.configuration)
      && !nmsCredentialNeedsDedicatedKey(backup.configuration)
      && !rotationRequested
    ) continue;
    await prisma.nmsBackup.update({
      where: { id: backup.id },
      data: { configuration: protectNmsBackup(backup.configuration) },
    });
    backupsProtected += 1;
  }

  log.info(
    {
      inspected: configs.length,
      protected: protectedCount,
      nmsCredentialsProtected,
      backupsProtected,
      rotationRequested,
    },
    'Integration credential migration completed'
  );
  return {
    inspected: configs.length,
    protected: protectedCount,
    nmsCredentialsProtected,
    backupsProtected,
    rotationRequested,
  };
}
