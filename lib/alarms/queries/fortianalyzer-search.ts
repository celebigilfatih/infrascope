import type FortiAnalyzerService from '@/lib/integrations/fortianalyzer';
import { alarmExecutionSignal } from '../execution-context';
import { SourceQueryError, waitForSource, withSourceDeadline } from '@/lib/integrations/source-query-error';

export async function startFortiAnalyzerSearch(
  fa: FortiAnalyzerService, logtype: string, limit: number, filter?: string, parentSignal?: AbortSignal,
): Promise<number> {
  return withSourceDeadline(async signal => {
    const tid = await fa.startLogSearch(logtype, limit, filter, { signal });
    if (!tid || !Number.isInteger(tid) || tid < 0) throw new SourceQueryError('SEARCH_NOT_STARTED', 'FortiAnalyzer did not return a valid search task');
    return tid;
  }, 10_000, alarmExecutionSignal(parentSignal));
}

/** null means pending; [] means a completed search with no matching events. */
export async function waitForFortiAnalyzerResults(
  fa: FortiAnalyzerService,
  tid: number,
  limit: number,
  options: { offset?: number; attempts?: number; intervalMs?: number; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<Array<Record<string, unknown>>> {
  const { offset = 0, attempts = 4, intervalMs = 2000, timeoutMs = 12_000 } = options;
  return withSourceDeadline(async signal => {
    for (let attempt = 0; attempt < attempts; attempt++) {
      await waitForSource(intervalMs, signal);
      const events = await fa.fetchLogResults(tid, offset, limit, { requireComplete: true, signal });
      if (events !== null) return events;
    }
    throw new SourceQueryError('SEARCH_INCOMPLETE', 'FortiAnalyzer search did not complete within the poll budget');
  }, timeoutMs, alarmExecutionSignal(options.signal));
}
