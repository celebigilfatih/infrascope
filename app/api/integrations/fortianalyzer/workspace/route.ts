import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { authorizeApiRequest } from '@/lib/auth/api-permission';
import FortiAnalyzerService, { resetFortiAnalyzerLoginBackoff } from '@/lib/integrations/fortianalyzer';
import { mergeFortiAnalyzerProfile, type FortiAnalyzerProfileInput } from '@/lib/integrations/fortianalyzer-profile';
import { fortiAnalyzerRevision } from '@/lib/integrations/fortianalyzer-revision';
import { getSharedFortiAnalyzerCacheStatus, refreshFortiAnalyzerEventCache } from '@/lib/alarms/fortianalyzer-cache-runtime';
import { hasIntegrationCredential, protectIntegrationConfig, unprotectIntegrationConfig } from '@/lib/security/integration-credentials';
import { analyzerDraft, validateAnalyzerDraft, type AnalyzerDraft } from '@/lib/integrations/fortianalyzer-workspace';

const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const access = await authorizeApiRequest(request, 'settings', 'read'); if (!access.allowed) return access.response;
  try {
    const rows = await prisma.integrationConfig.findMany({ where: { type: 'FORTIANALYZER' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    const status = getSharedFortiAnalyzerCacheStatus();
    const profiles = rows.map(row => {
      const c = (row.config && typeof row.config === 'object' && !Array.isArray(row.config) ? row.config : {}) as Record<string, unknown>;
      const text = (key: string) => typeof c[key] === 'string' ? c[key] as string : '';
      const apiKeySet = hasIntegrationCredential(row.config, 'FORTIANALYZER', 'apiKey') || hasIntegrationCredential(row.config, 'FORTIANALYZER', 'accessToken');
      let collector = null;
      // The process-local status is valid only for this exact persisted profile revision.
      try { if (status?.sourceRevision === fortiAnalyzerRevision(row)) collector = { lastSyncTime: status.lastSyncTime, isFresh: status.isFresh, stopped: status.stopped, syncInProgress: status.syncInProgress, failedLogtypes: status.failedLogtypes, consecutiveSyncFailures: status.consecutiveSyncFailures, nextSyncDelayMin: status.nextSyncDelayMin }; } catch { /* Invalid legacy ADOM has no verified collector status. */ }
      return { id: row.id, name: row.name, enabled: row.enabled, host: text('host'), username: text('username'), adom: c.adom === undefined ? 'root' : text('adom'), authMode: c.authMode ?? (apiKeySet ? 'api-key' : 'session'), passwordSet: hasIntegrationCredential(row.config, 'FORTIANALYZER', 'password'), apiKeySet, updatedAt: row.updatedAt, collector };
    });
    return reply({ success: true, profiles });
  } catch { return reply({ success: false, code: 'READ_FAILED' }, 503); }
}
export async function POST(request: NextRequest) {
  const access = await authorizeApiRequest(request, 'settings', 'write'); if (!access.allowed) return access.response;
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body) || !['save', 'test-saved', 'test-draft'].includes(body.action) || (body.configId !== undefined && (typeof body.configId !== 'string' || !body.configId.trim()))) return reply({ success: false, code: 'INVALID_SETTINGS' }, 400);
    const existing = body.configId ? await prisma.integrationConfig.findUnique({ where: { id: body.configId } }) : null;
    if (body.configId && (!existing || existing.type !== 'FORTIANALYZER')) return reply({ success: false, code: 'PROFILE_NOT_FOUND' }, 404);
    if (body.action === 'test-saved' && !existing) return reply({ success: false, code: 'PROFILE_REQUIRED' }, 400);
    if (body.action === 'save' && existing) {
      if (typeof body.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(body.expectedUpdatedAt))) return reply({ success: false, code: 'INVALID_SETTINGS' }, 400);
      if (body.expectedUpdatedAt !== existing.updatedAt.toISOString()) return reply({ success: false, code: 'SAVE_CONFLICT' }, 409);
    }
    let profile;
    if (body.action === 'test-saved') profile = mergeFortiAnalyzerProfile(unprotectIntegrationConfig<FortiAnalyzerProfileInput>(existing!.config, 'FORTIANALYZER'));
    else {
      const raw = body.draft;
      if (!raw || ['host', 'adom', 'authMode', 'username', 'password', 'apiKey'].some(k => typeof raw[k] !== 'string')) return reply({ success: false, code: 'INVALID_SETTINGS' }, 400);
      const draft: AnalyzerDraft = { ...analyzerDraft(null), host: raw.host, adom: raw.adom, authMode: raw.authMode, username: raw.username, password: raw.password, apiKey: raw.apiKey };
      // The server validates format before resolving any stored credential.
      const validationDraft = body.action === 'save' ? { ...draft, password: draft.password || 'format-validation-only', apiKey: draft.apiKey || 'format-validation-only' } : draft;
      if (validateAnalyzerDraft(validationDraft, null, true)) return reply({ success: false, code: 'INVALID_SETTINGS' }, 400);
      const prior = existing ? unprotectIntegrationConfig<FortiAnalyzerProfileInput>(existing.config, 'FORTIANALYZER') : undefined;
      profile = mergeFortiAnalyzerProfile({ host: draft.host, adom: draft.adom, authMode: draft.authMode, ...(draft.authMode === 'session' ? { username: draft.username, password: draft.password } : { apiKey: draft.apiKey }) }, body.action === 'save' ? prior : undefined);
    }
    if (body.action !== 'save') {
      if (validateAnalyzerDraft({ host: profile.host, adom: profile.adom, authMode: profile.authMode, username: profile.username ?? '', password: profile.password ?? '', apiKey: profile.accessToken ?? '' }, null, true)) return reply({ success: false, code: 'INVALID_SETTINGS' }, 400);
      const connected = await FortiAnalyzerService.testConnection(profile);
      return reply({ success: true, connected, configId: existing?.id ?? null, testedAt: new Date().toISOString(), host: profile.host, adom: profile.adom });
    }
    if (!existing && await prisma.integrationConfig.count({ where: { type: 'FORTIANALYZER' } })) return reply({ success: false, code: 'PROFILE_REQUIRED' }, 409);
    const { accessToken, ...plain } = profile;
    const previous = existing ? unprotectIntegrationConfig<Record<string, unknown>>(existing.config, 'FORTIANALYZER') : {};
    delete previous.password; delete previous.apiKey; delete previous.accessToken; delete previous.username;
    const protectedConfig = protectIntegrationConfig({ ...previous, ...plain, ...(profile.authMode === 'api-key' ? { apiKey: accessToken } : {}) }, 'FORTIANALYZER') as Prisma.InputJsonObject;
    let saved;
    if (existing) {
      const updatedAt = new Date();
      const changed = await prisma.integrationConfig.updateMany({ where: { id: existing.id, type: 'FORTIANALYZER', updatedAt: existing.updatedAt, config: { equals: existing.config as Prisma.InputJsonValue }, enabled: existing.enabled, syncInterval: existing.syncInterval }, data: { config: protectedConfig, updatedAt } });
      if (changed.count !== 1) return reply({ success: false, code: 'SAVE_CONFLICT' }, 409);
      saved = { ...existing, config: protectedConfig, updatedAt };
    } else saved = await prisma.integrationConfig.create({ data: { type: 'FORTIANALYZER', name: 'FortiAnalyzer', enabled: true, config: protectedConfig } });
    resetFortiAnalyzerLoginBackoff(profile);
    refreshFortiAnalyzerEventCache(fortiAnalyzerRevision(saved));
    (globalThis as typeof globalThis & { fazCache?: Record<string, unknown> }).fazCache = {};
    return reply({ success: true, configId: saved.id });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    return reply({ success: false, code: code === 'SOURCE_INVALID_CONFIG' ? 'CREDENTIAL_REQUIRED' : code === 'P2002' ? 'SAVE_CONFLICT' : 'OPERATION_FAILED' }, code === 'SOURCE_INVALID_CONFIG' ? 400 : code === 'P2002' ? 409 : 500);
  }
}
