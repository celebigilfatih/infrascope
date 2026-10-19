import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import type { FortiGateConfig } from '@/lib/integrations/fortigate';
import { createEphemeralFortiGateConnector, clearFortiGateConnectors } from './connector-factory';
import { normalizeFortiGateVdom } from './target';
import { hasIntegrationCredential, protectIntegrationConfig, unprotectIntegrationConfig } from '@/lib/security/integration-credentials';
import { validateFirewallSettings, type FirewallSettingsDraft } from './workspace';

export class FirewallWorkspaceError extends Error {
  constructor(readonly code: string, readonly status = 400) { super(code); }
}
async function selected(configId: unknown, vdom: unknown) {
  if (typeof configId !== 'string' || !configId || typeof vdom !== 'string') throw new FirewallWorkspaceError('TARGET_REQUIRED');
  const record = await prisma.integrationConfig.findUnique({ where: { id: configId }, include: { firewallConnectors: { where: { vdom }, select: { id: true, managementHost: true } }, syncLogs: { orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], take: 1, select: { id: true, status: true, startedAt: true, completedAt: true, itemsProcessed: true, errorDetails: true } } } });
  if (!record || record.type !== 'FORTIGATE') throw new FirewallWorkspaceError('TARGET_NOT_FOUND', 404);
  const config = unprotectIntegrationConfig<FortiGateConfig>(record.config, 'FORTIGATE');
  if (normalizeFortiGateVdom(config.vdom) !== vdom && !record.firewallConnectors.length) throw new FirewallWorkspaceError('INVALID_VDOM');
  return { record, config, host: record.firewallConnectors[0]?.managementHost || config.host };
}
export async function readFirewallWorkspace(configId: unknown, vdom: unknown) {
  const { record, config, host } = await selected(configId, vdom), log = record.syncLogs[0];
  const details = log?.errorDetails as Prisma.JsonObject | null;
  return NextResponse.json({ success: true, data: { configId: record.id, vdom, host, name: record.description || record.name, enabled: record.enabled, updatedAt: record.updatedAt,
    username: config.username || '', hasPassword: hasIntegrationCredential(record.config, 'FORTIGATE', 'password'), hasToken: hasIntegrationCredential(record.config, 'FORTIGATE', 'accessToken'), interval: record.syncInterval, syncMode: config.syncMode || 'rest', modules: config.enabledModules,
    lastSync: log ? { id: log.id, status: log.status, startedAt: log.startedAt, completedAt: log.completedAt, processed: log.itemsProcessed, errors: typeof details?.errorCount === 'number' ? details.errorCount : null } : null } }, { headers: { 'Cache-Control': 'private, no-store' } });
}
function credentials(draft: FirewallSettingsDraft, config: FortiGateConfig, testing: boolean) {
  if (draft.authMode === 'token') {
    const token = draft.token || (testing ? '' : config.accessToken);
    if (!token) throw new FirewallWorkspaceError('CREDENTIAL_REQUIRED');
    return { accessToken: token, password: '', username: '' };
  }
  const username = draft.username.trim();
  const password = draft.password || (!testing && username === config.username ? config.password : '');
  if (!username || !password) throw new FirewallWorkspaceError('CREDENTIAL_REQUIRED');
  return { username, password, accessToken: '' };
}
export async function saveFirewallWorkspace(body: Record<string, unknown>) {
  const { record, config, host } = await selected(body.configId, body.vdom);
  if (typeof body.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(body.expectedUpdatedAt))) throw new FirewallWorkspaceError('INVALID_SETTINGS');
  if (body.expectedUpdatedAt !== record.updatedAt.toISOString()) throw new FirewallWorkspaceError('SETTINGS_CHANGED', 409);
  // The host/VDOM is bound to inventory identity; this form does not move a connector.
  if (body.host !== host) throw new FirewallWorkspaceError('SETTINGS_CHANGED', 409);
  if (typeof body.draft !== 'object' || !body.draft) throw new FirewallWorkspaceError('INVALID_SETTINGS');
  const draft = body.draft as FirewallSettingsDraft;
  if (validateFirewallSettings(draft, { username: config.username || '', hasPassword: Boolean(config.password), hasToken: Boolean(config.accessToken) })) throw new FirewallWorkspaceError('INVALID_SETTINGS');
  const next = { ...config, ...credentials(draft, config, false), host: config.host, pollingInterval: Number(draft.interval), syncMode: draft.syncMode,
    enabledModules: { ...config.enabledModules, ...draft.modules, ...(draft.syncMode === 'snmp' ? { vlans: false, policies: false, addresses: false, vips: false, sdwan: false } : {}) } };
  const connector = record.firewallConnectors[0];
  const changed = await prisma.integrationConfig.updateMany({ where: { id: record.id, type: 'FORTIGATE', updatedAt: record.updatedAt, config: { equals: record.config as Prisma.InputJsonValue }, enabled: record.enabled, syncInterval: record.syncInterval, ...(connector ? { firewallConnectors: { some: { id: connector.id, managementHost: host, vdom: body.vdom as string } } } : {}) }, data: { config: protectIntegrationConfig(next, 'FORTIGATE') as Prisma.InputJsonObject, syncInterval: next.pollingInterval, enabled: draft.enabled } });
  if (changed.count !== 1) throw new FirewallWorkspaceError('SETTINGS_CHANGED', 409);
  await clearFortiGateConnectors();
  return NextResponse.json({ success: true, configId: record.id, vdom: body.vdom, host });
}
export async function testFirewallWorkspace(body: Record<string, unknown>) {
  const { record, config, host } = await selected(body.configId, body.vdom);
  let auth = { username: config.username, password: config.password, accessToken: config.accessToken };
  if (body.action === 'test-draft') {
    const draft = body.draft as FirewallSettingsDraft;
    if (validateFirewallSettings(draft, null, true)) throw new FirewallWorkspaceError('CREDENTIAL_REQUIRED');
    auth = credentials(draft, config, true);
  }
  const service = createEphemeralFortiGateConnector({ ...config, ...auth, host, vdom: body.vdom as string });
  try {
    const result = await service.getStatus();
    return NextResponse.json({ success: true, configId: record.id, vdom: body.vdom, host, connected: result.connected, version: result.version, errorCode: result.errorCode, testedAt: new Date() });
  } finally { await service.dispose(); }
}
