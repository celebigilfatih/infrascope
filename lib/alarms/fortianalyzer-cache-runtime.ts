import { prisma } from '@/lib/prisma';
import { initSharedFortiAnalyzerService } from '@/lib/integrations/fortianalyzer';
import { readFortiAnalyzerProfile } from '@/lib/integrations/fortianalyzer-source';
import { fortiAnalyzerRevision } from '@/lib/integrations/fortianalyzer-revision';
import { SourceQueryError, withSourceDeadline } from '@/lib/integrations/source-query-error';
import { createLogger } from '@/lib/logger';
import { EventCacheService } from './event-cache';
import { withoutAlarmExecution } from './execution-context';

const log = createLogger('fa-cache-runtime');
type Entry = {
  revision: string; configId: string; cache: EventCacheService;
  service: ReturnType<typeof initSharedFortiAnalyzerService>; ready: Promise<number>;
};
function runtime() {
  const global = globalThis as typeof globalThis & { __infrascopeFaCache?: { epoch: number; current: Entry | null } };
  return global.__infrascopeFaCache ??= { epoch: 0, current: null };
}

function retire() {
  const state = runtime();
  state.epoch++;
  state.current?.cache.stop();
  state.current = null;
}

export function getSharedFortiAnalyzerCacheStatus() {
  return runtime().current?.cache.getCacheStatus() ?? null;
}

/** Does not wait for source warmup; a failed source cannot block settings saves. */
export function refreshFortiAnalyzerEventCache(savedRevision: string): void {
  const state = runtime();
  state.epoch++;
  if (!state.current || state.current.revision === savedRevision) return;
  retire();
  void getFortiAnalyzerEventCache().catch(error => log.warn({ error: error instanceof Error ? error.name : 'UnknownError' }, 'Cache rebind unavailable'));
}

/** Re-read settings before binding and before every scheduled collection cycle. */
export async function getFortiAnalyzerEventCache(expected?: { configId?: string; revision?: string }): Promise<Entry> {
  return withoutAlarmExecution(() => bindFortiAnalyzerEventCache(expected));
}

async function bindFortiAnalyzerEventCache(expected?: { configId?: string; revision?: string }): Promise<Entry> {
  const state = runtime();
  for (;;) {
    const epoch = state.epoch;
    const record = await withSourceDeadline(() => prisma.integrationConfig.findFirst({ where: { type: 'FORTIANALYZER', enabled: true } }), 10_000);
    if (epoch !== state.epoch) continue; // A save completed while the read was outstanding.
    if (!record) {
      retire();
      throw new SourceQueryError('SOURCE_NOT_CONFIGURED', 'FortiAnalyzer is not configured or enabled');
    }
    const revision = fortiAnalyzerRevision(record);
    if (state.current?.revision !== revision || state.current.cache.getCacheStatus().stopped) {
      retire();
      const service = initSharedFortiAnalyzerService(readFortiAnalyzerProfile(record.config));
      const cache = new EventCacheService(service, {
        revision,
        beforeSync: async () => (await getFortiAnalyzerEventCache()) === entry,
      });
      const entry: Entry = { revision, configId: record.id, service, cache, ready: Promise.resolve(0) };
      state.current = entry;
      entry.ready = cache.startBackgroundSync();
    }
    const entry = state.current;
    if ((expected?.configId && expected.configId !== entry.configId) || (expected?.revision && expected.revision !== entry.revision)) {
      throw new SourceQueryError('SOURCE_CONFIG_CHANGED', 'FortiAnalyzer settings changed during this check');
    }
    return entry;
  }
}
