'use client';
import { useEffect, useState } from 'react';
import type { FirewallListItem } from './types';
import { parseOverviewEnvelope, requestOverviewJson, type OverviewEnvelope } from '@/lib/firewall/overview';
export type OverviewResource<T> = { value: OverviewEnvelope<T> | null; loading: boolean; error: string };
export function useFirewallOverviewResource<T>(url: string | null, target: FirewallListItem | null, parse: (data: unknown, source: string) => T, revision: number): OverviewResource<T> {
  const key = url && target ? JSON.stringify([url, target.id, target.device?.id, target.configId, target.vdom]) : '';
  const [state, setState] = useState<OverviewResource<T> & { key: string }>({ key: '', value: null, loading: false, error: '' });
  useEffect(() => {
    if (!url || !target || !key) return;
    const controller = new AbortController();
    setState(previous => ({ key, value: previous.key === key ? previous.value : null, loading: true, error: '' }));
    void requestOverviewJson(url, controller.signal).then(raw => parseOverviewEnvelope(raw, target, parse)).then(value => {
      if (!controller.signal.aborted) setState({ key, value, loading: false, error: '' });
    }).catch(failure => {
      if (!controller.signal.aborted) setState(previous => ({ key, value: previous.key === key && previous.value ? { ...previous.value, status: previous.value.data ? 'stale' : 'unavailable' } : null, loading: false, error: failure instanceof Error ? failure.message : 'Kaynak verileri okunamadı.' }));
    });
    return () => controller.abort();
    // key includes every selected target identity field; object refreshes alone do not repeat source reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, key, parse, revision]);
  return !key ? { value: null, loading: false, error: '' } : state.key === key ? state : { value: null, loading: true, error: '' };
}
