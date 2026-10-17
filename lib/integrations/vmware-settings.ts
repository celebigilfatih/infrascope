import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { createSavedVMwareSource } from './vmware-source';
import { unprotectIntegrationConfig, protectIntegrationConfig } from '@/lib/security/integration-credentials';
import { getVMwareCacheScope, invalidateVMwareCache } from './vmware-cache';
import { validateBody } from '@/lib/validators';
import { vmwareSaveConfigSchema } from '@/lib/validators/integrations';

/** Validate the authority before persisting it or handing credentials to a source. */
export function normalizeVMwareSettingsIdentity(host: string, username: string) {
  const authority = host.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  try {
    const url = new URL(`https://${authority}`);
    if (!url.hostname || url.username || url.password || url.pathname !== '/' || url.search || url.hash || /\s|[\\/]/.test(authority) || !username.trim()) return null;
    return { host: authority, username: username.trim() };
  } catch { return null; }
}

export function parseVMwareSettingsConfig(value: unknown) {
  const parsed = validateBody(value, vmwareSaveConfigSchema);
  if (!parsed.success) return parsed;
  const identity = normalizeVMwareSettingsIdentity(parsed.data.host, parsed.data.username);
  return identity ? { success: true as const, data: { ...parsed.data, ...identity } }
    : { success: false as const, error: 'Bağlantı ayarlarını kontrol edin.' };
}

/** Settings metadata is DB-only; never authenticate or collect VMware inventory on page load. */
export async function readVMwareSettings() {
  const profiles = await prisma.integrationConfig.findMany({ where: { type: 'VMWARE_VCENTER' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: { syncLogs: { orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], take: 1, select: { id: true, status: true, startedAt: true, completedAt: true, itemsProcessed: true, itemsCreated: true, itemsUpdated: true, errorDetails: true } } } });
  return NextResponse.json({ success: true, observedAt: new Date(), profiles: profiles.map(profile => {
    const raw = (profile.config && typeof profile.config === 'object' && !Array.isArray(profile.config) ? profile.config : {}) as Prisma.JsonObject, last = profile.syncLogs[0], details = last?.errorDetails as Prisma.JsonObject | null;
    return { id: profile.id, name: profile.name, enabled: profile.enabled, updatedAt: profile.updatedAt,
      config: { host: raw.host, username: raw.username, hasPassword: typeof raw.password === 'string' && Boolean(raw.password), thumbprint: raw.thumbprint || '', pollingInterval: profile.syncInterval, enabledModules: raw.enabledModules },
      lastSyncAt: profile.lastSyncAt, lastSyncStatus: profile.lastSyncStatus,
      lastSync: last ? { id: last.id, status: last.status, startedAt: last.startedAt, completedAt: last.completedAt, itemsProcessed: last.itemsProcessed, itemsCreated: last.itemsCreated, itemsUpdated: last.itemsUpdated, errorCount: typeof details?.errorCount === 'number' ? details.errorCount : null } : null };
  }) }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function testSavedVMwareSettings(configId: unknown) {
  if (typeof configId !== 'string' || !configId) return NextResponse.json({ error: 'Kayıtlı vCenter profilini seçin.', code: 'PROFILE_REQUIRED' }, { status: 400 });
  const profile = await prisma.integrationConfig.findFirst({ where: { id: configId, type: 'VMWARE_VCENTER' } });
  if (!profile) return NextResponse.json({ error: 'Kayıtlı vCenter profili bulunamadı.', code: 'PROFILE_NOT_FOUND' }, { status: 404 });
  const result = await createSavedVMwareSource(profile).service.testConnection();
  return NextResponse.json({ ...result, configId: profile.id, testedAt: new Date() });
}

/** Edit by immutable id, preserving the selected profile's name, secret and enabled state. */
export async function updateVMwareSettings(body: { configId?: unknown; config?: unknown; enabled?: unknown; expectedUpdatedAt?: unknown }) {
  if (typeof body.configId !== 'string' || !body.configId) return NextResponse.json({ error: 'Kayıtlı vCenter profilini seçin.', code: 'PROFILE_REQUIRED' }, { status: 400 });
  const profile = await prisma.integrationConfig.findFirst({ where: { id: body.configId, type: 'VMWARE_VCENTER' } });
  if (!profile) return NextResponse.json({ error: 'Kayıtlı vCenter profili bulunamadı.', code: 'PROFILE_NOT_FOUND' }, { status: 404 });
  const parsed = parseVMwareSettingsConfig(body.config || {});
  if (!parsed.success || (body.enabled !== undefined && typeof body.enabled !== 'boolean')) return NextResponse.json({ error: 'Bağlantı ayarlarını ve 1–1440 dakika aralığını kontrol edin.', code: 'INVALID_SETTINGS' }, { status: 400 });
  const previous = unprotectIntegrationConfig<typeof parsed.data>(profile.config, 'VMWARE_VCENTER');
  if (body.expectedUpdatedAt !== undefined && (typeof body.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(body.expectedUpdatedAt)))) return NextResponse.json({ error: 'Ayar sürümü geçersiz.', code: 'INVALID_SETTINGS' }, { status: 400 });
  if (body.expectedUpdatedAt !== undefined && body.expectedUpdatedAt !== profile.updatedAt.toISOString()) return NextResponse.json({ error: 'Profil başka bir işlemde değişti.', code: 'SETTINGS_CHANGED' }, { status: 409 });
  const config = { ...parsed.data };
  if (!config.password || config.password === '********') {
    if (config.host !== previous.host || config.username !== previous.username) return NextResponse.json({ error: 'Sunucu veya kullanıcı değiştiğinde parolayı yeniden girin.', code: 'PASSWORD_REQUIRED' }, { status: 400 });
    config.password = previous.password;
  }
  if (!config.password) return NextResponse.json({ error: 'VMware parolası gerekli.', code: 'PASSWORD_REQUIRED' }, { status: 400 });
  const changed = await prisma.integrationConfig.updateMany({ where: { id: profile.id, config: { equals: profile.config as Prisma.InputJsonValue }, enabled: profile.enabled, syncInterval: profile.syncInterval, updatedAt: profile.updatedAt }, data: { config: protectIntegrationConfig(config, 'VMWARE_VCENTER'), syncInterval: config.pollingInterval, enabled: body.enabled === undefined ? profile.enabled : body.enabled } });
  if (changed.count !== 1) return NextResponse.json({ error: 'Profil başka bir işlemde değişti.', code: 'SETTINGS_CHANGED' }, { status: 409 });
  if (typeof previous.host === 'string' && typeof previous.username === 'string') invalidateVMwareCache(getVMwareCacheScope({ ...previous, pollingInterval: profile.syncInterval }));
  invalidateVMwareCache(getVMwareCacheScope(config));
  return NextResponse.json({ success: true, configId: profile.id });
}
