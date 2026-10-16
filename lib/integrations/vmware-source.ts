import type { IntegrationConfig } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { unprotectIntegrationConfig } from '@/lib/security/integration-credentials';
import { VMwareService, type VMwareConfig } from './vmware';
import { getVMwareCacheScope, normalizeVMwareHost } from './vmware-cache';
import { inventorySourceScope } from './inventory-source-scope';

export class VMwareConfigurationError extends Error {
  readonly code = 'VMWARE_CONFIGURATION_INVALID';
  constructor() { super('Saved VMware connection configuration is invalid'); }
}

/** Match operational, alarm and health selection; never read VMware ENV credentials. */
export function loadSavedVMwareIntegration() {
  return prisma.integrationConfig.findFirst({
    where: { type: 'VMWARE_VCENTER', enabled: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
}

export function createSavedVMwareSource(integration: Pick<IntegrationConfig, 'id' | 'config' | 'syncInterval'>) {
  const raw = integration.config;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new VMwareConfigurationError();
  const fields = unprotectIntegrationConfig<Record<string, unknown>>(raw, 'VMWARE_VCENTER');
  if (typeof fields.host !== 'string' || !fields.host.trim()
    || typeof fields.username !== 'string' || !fields.username.trim()
    || typeof fields.password !== 'string' || !fields.password.trim()) throw new VMwareConfigurationError();
  let host: string;
  try {
    const authority = normalizeVMwareHost(fields.host);
    const url = new URL(`https://${authority}`);
    if (!url.hostname || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error();
    // Validate with URL, but preserve authority spelling for SQL/application identity parity.
    host = authority;
  } catch { throw new VMwareConfigurationError(); }
  const storedModules = fields.enabledModules;
  if (storedModules !== undefined && (!storedModules || typeof storedModules !== 'object' || Array.isArray(storedModules))) {
    throw new VMwareConfigurationError();
  }
  const enabledModules: VMwareConfig['enabledModules'] = { datacenters: true, clusters: true, hosts: true, vms: true, datastores: true };
  for (const key of Object.keys(enabledModules) as Array<keyof VMwareConfig['enabledModules']>) {
    const value = (storedModules as Record<string, unknown> | undefined)?.[key];
    if (value !== undefined && typeof value !== 'boolean') throw new VMwareConfigurationError();
    if (typeof value === 'boolean') enabledModules[key] = value;
  }
  if (fields.thumbprint !== undefined && typeof fields.thumbprint !== 'string') throw new VMwareConfigurationError();
  const config: VMwareConfig = {
    integrationId: integration.id,
    host, username: fields.username, password: fields.password, enabledModules,
    thumbprint: fields.thumbprint as string | undefined,
    pollingInterval: integration.syncInterval || 10,
  };
  return { service: new VMwareService(config), scope: getVMwareCacheScope(config),
    inventoryScope: inventorySourceScope('VMWARE_VCENTER', integration.id, host) };
}
