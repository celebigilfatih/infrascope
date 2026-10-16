import { prisma } from '../prisma';
import type { Prisma } from '@prisma/client';
import { createLogger } from '../logger';
import {
  integrationConfigNeedsDedicatedKey,
  integrationConfigNeedsProtection,
  nmsCredentialNeedsDedicatedKey,
  nmsCredentialNeedsProtection,
  protectNmsBackup,
  protectNmsCredential,
  protectIntegrationConfig,
  unprotectIntegrationConfig,
  type IntegrationCredentialProfile,
} from './integration-credentials';

const log = createLogger('integration-credential-migration');
const PROFILES = ['FORTIGATE', 'FORTIANALYZER', 'VMWARE_VCENTER', 'ZABBIX'] as const;

export async function migrateIntegrationCredentials(options: { rotate?: boolean; includeNms?: boolean } = {}): Promise<{
  inspected: number;
  protected: number;
  nmsCredentialsProtected: number;
  backupsProtected: number;
  smtpProtected: number;
  rotationRequested: boolean;
}> {
  const rotationRequested = Boolean(options.rotate ||
    process.env.INTEGRATION_CREDENTIALS_PREVIOUS_KEY?.trim()
  );
  // Snapshot comparison prevents a concurrent settings save from being overwritten.
  // Prepare all envelopes before the first write; crypto errors abort the transaction.
  const migrated = await prisma.$transaction(async tx => {
    const configs = await tx.integrationConfig.findMany({
      where: { type: { in: [...PROFILES] } },
      select: { id: true, type: true, config: true },
    });

    const email = await tx.notificationConfig.findUnique({ where: { channel: 'email' } });
    const updates: Array<{ id: string; before: typeof configs[number]['config']; after: Prisma.InputJsonObject }> = [];
    for (const config of configs) {
      const profile = config.type as IntegrationCredentialProfile;
      const needsProtection = integrationConfigNeedsProtection(config.config, profile);
      const needsDedicatedKey = integrationConfigNeedsDedicatedKey(config.config, profile);
      unprotectIntegrationConfig(config.config, profile);
      if (!rotationRequested && !needsProtection && !needsDedicatedKey) continue;

      const protectedConfig = protectIntegrationConfig<Prisma.InputJsonObject>(
        config.config,
        profile
      );
      updates.push({ id: config.id, before: config.config, after: protectedConfig });
    }
    if (email) unprotectIntegrationConfig(email.config, 'SMTP');
    const emailNeedsUpdate = email && (rotationRequested
      || integrationConfigNeedsProtection(email.config, 'SMTP')
      || integrationConfigNeedsDedicatedKey(email.config, 'SMTP'));
    const protectedEmail = emailNeedsUpdate ? protectIntegrationConfig<Prisma.InputJsonObject>(email.config, 'SMTP') : null;
    for (const update of updates) {
      const result = await tx.integrationConfig.updateMany({
        where: { id: update.id, config: { equals: update.before as Prisma.InputJsonValue } },
        data: { config: update.after },
      });
      if (result.count !== 1) throw new Error('Credential migration interrupted by a concurrent integration settings change; retry');
    }
    if (email && protectedEmail) {
      const result = await tx.notificationConfig.updateMany({
        where: { id: email.id, config: { equals: email.config as Prisma.InputJsonValue } },
        data: { config: protectedEmail },
      });
      if (result.count !== 1) throw new Error('Credential migration interrupted by a concurrent email settings change; retry');
    }
    return { inspected: configs.length, protected: updates.length, smtpProtected: protectedEmail ? 1 : 0 };
  }, { timeout: 60_000 });

  if (options.includeNms === false) return { ...migrated, nmsCredentialsProtected: 0, backupsProtected: 0, rotationRequested };

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
      ...migrated,
      nmsCredentialsProtected,
      backupsProtected,
      rotationRequested,
    },
    'Integration credential migration completed'
  );
  return {
    ...migrated,
    nmsCredentialsProtected,
    backupsProtected,
    rotationRequested,
  };
}
