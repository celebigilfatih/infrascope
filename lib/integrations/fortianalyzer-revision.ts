import { createHash } from 'node:crypto';
import { FA_EVENT_TIME_VERSION } from '@/lib/alarms/fortianalyzer-event-time';
import { FA_PROFILE_VERSION, normalizeFortiAnalyzerAdom } from './fortianalyzer-profile';

export type FortiAnalyzerConfigRecord = {
  id: string; config: unknown; enabled: boolean; updatedAt: Date | string;
};

/** Hash the persisted encrypted record, never publish a decrypted-password digest. */
export function fortiAnalyzerRevision(record: FortiAnalyzerConfigRecord): string {
  const config = record.config && typeof record.config === 'object' ? record.config as Record<string, unknown> : {};
  const envelope = (value: unknown) => typeof value === 'string' && value.startsWith('enc:v1:') ? value : undefined;
  return createHash('sha256').update(JSON.stringify({
    eventTimeVersion: FA_EVENT_TIME_VERSION,
    profileVersion: FA_PROFILE_VERSION, adom: normalizeFortiAnalyzerAdom(config.adom), authMode: config.authMode,
    id: record.id, enabled: record.enabled, updatedAt: record.updatedAt,
    host: config.host, username: config.username, pollingInterval: config.pollingInterval,
    password: envelope(config.password), apiKey: envelope(config.apiKey), accessToken: envelope(config.accessToken),
  })).digest('hex');
}

export const FA_REVISION_FIELD = '__infrascopeFaRevision';
export const FA_TIME_VERSION_FIELD = '__infrascopeFaTimeVersion';

export function fortiAnalyzerCacheFilter(revision?: string) {
  const timeFilter = { rawLog: { path: [FA_TIME_VERSION_FIELD], equals: FA_EVENT_TIME_VERSION } };
  return revision ? { AND: [timeFilter, { rawLog: { path: [FA_REVISION_FIELD], equals: revision } }] } : timeFilter;
}

/** Internal cache provenance must not change native event/occurrence identities. */
export function nativeFortiAnalyzerLog(raw: unknown): Record<string, unknown> {
  const value = { ...(raw as Record<string, unknown>) };
  delete value[FA_REVISION_FIELD];
  delete value[FA_TIME_VERSION_FIELD];
  return value;
}
