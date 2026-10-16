'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { HostWorkspace } from '@/components/virtualization/HostWorkspace';
import type { HostWorkspaceRecord } from '@/lib/virtualization/host-workspace';
import { uiError } from '@/lib/i18n/tr';

export default function HostsPage() {
  const [hosts, setHosts] = useState<HostWorkspaceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collectedAt, setCollectedAt] = useState<string | null>(null);
  const [focusHostId, setFocusHostId] = useState<string | null>(null);
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const loaded = useRef(false);
  const fetchHosts = useCallback(async (bypass = false) => {
    const request = ++requestId.current;
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    if (loaded.current) setRefreshing(true); else setLoading(true);
    try {
      const response = await fetch('/api/integrations/vmware?type=host-workspace', { signal: current.signal, headers: bypass ? { 'x-cache-bypass': '1' } : undefined });
      const json = await response.json();
      if (!response.ok || json.error) throw new Error(uiError(json.error || 'Sunucu verileri alınamadı.'));
      if (!Array.isArray(json.hosts)) throw new Error('Sunucu yanıtı eksik. Lütfen tekrar deneyin.');
      if (request !== requestId.current || current.signal.aborted) return;
      setHosts(json.hosts); setCollectedAt(json.collectedAt || null); setError(null); loaded.current = true;
    } catch (fetchError) {
      if (request === requestId.current && !current.signal.aborted) setError(uiError(fetchError, 'Sunucu verileri alınamadı.'));
    } finally {
      if (request === requestId.current && !current.signal.aborted) { setLoading(false); setRefreshing(false); }
    }
  }, []);
  useEffect(() => {
    setFocusHostId(new URLSearchParams(window.location.search).get('hostId'));
    fetchHosts();
    const interval = setInterval(() => fetchHosts(), 300_000);
    return () => { controller.current?.abort(); clearInterval(interval); };
  }, [fetchHosts]);
  return <HostWorkspace focusHostId={focusHostId} hosts={hosts} loading={loading} refreshing={refreshing} error={error} collectedAt={collectedAt} onRefresh={() => fetchHosts(true)} />;
}
