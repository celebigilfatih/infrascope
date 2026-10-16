'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DatastoreWorkspace } from '@/components/virtualization/DatastoreWorkspace';
import type { DatastoreWorkspaceRecord } from '@/lib/virtualization/datastore-workspace';
import { uiError } from '@/lib/i18n/tr';

export default function DatastoresPage() {
  const [datastores, setDatastores] = useState<DatastoreWorkspaceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collectedAt, setCollectedAt] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const loaded = useRef(false);
  const fetchDatastores = useCallback(async (bypass = false) => {
    const request = ++requestId.current;
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    if (loaded.current) setRefreshing(true); else setLoading(true);
    try {
      const response = await fetch('/api/integrations/vmware?type=datastore-workspace', { signal: current.signal, headers: bypass ? { 'x-cache-bypass': '1' } : undefined });
      const json = await response.json();
      if (!response.ok || json.error) throw new Error(uiError(json.error || 'Veri deposu bilgileri alınamadı.'));
      if (!Array.isArray(json.datastores)) throw new Error('Veri deposu yanıtı eksik. Lütfen tekrar deneyin.');
      if (request !== requestId.current || current.signal.aborted) return;
      setStale(response.headers.get('x-cache') === 'STALE'); setDatastores(json.datastores); setCollectedAt(json.collectedAt || null); setError(null); loaded.current = true;
    } catch (fetchError) {
      if (request === requestId.current && !current.signal.aborted) setError(uiError(fetchError, 'Veri deposu bilgileri alınamadı.'));
    } finally {
      if (request === requestId.current && !current.signal.aborted) { setLoading(false); setRefreshing(false); }
    }
  }, []);
  useEffect(() => {
    fetchDatastores();
    const interval = setInterval(() => fetchDatastores(), 300_000);
    return () => { controller.current?.abort(); clearInterval(interval); };
  }, [fetchDatastores]);
  return <DatastoreWorkspace stale={stale} datastores={datastores} loading={loading} refreshing={refreshing} error={error} collectedAt={collectedAt} onRefresh={() => fetchDatastores(true)} />;
}
