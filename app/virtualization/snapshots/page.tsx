'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SnapshotWorkspace } from '@/components/virtualization/SnapshotWorkspace';
import { requestSnapshotMutation } from '@/lib/virtualization/snapshot-workspace';
import type { SnapshotCapabilities, SnapshotMutation, SnapshotWorkspaceVM } from '@/lib/virtualization/snapshot-workspace';
import { uiError } from '@/lib/i18n/tr';

export default function SnapshotsPage() {
  const [vms, setVMs] = useState<SnapshotWorkspaceVM[]>([]);
  const [loading, setLoading] = useState(true), [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null), [collectedAt, setCollectedAt] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [capabilities, setCapabilities] = useState<SnapshotCapabilities>({ create: false, delete: false, revert: false });
  const requestId = useRef(0), controller = useRef<AbortController | null>(null), loaded = useRef(false), mounted = useRef(false);
  const followup = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchSnapshots = useCallback(async (bypass = false) => {
    const request = ++requestId.current;
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    if (loaded.current) setRefreshing(true); else setLoading(true);
    try {
      const response = await fetch('/api/integrations/vmware?type=snapshot-workspace', { signal: current.signal, headers: bypass ? { 'x-cache-bypass': '1' } : undefined });
      const json = await response.json();
      if (!response.ok || json.error) throw new Error(uiError(json.error || 'Anlık görüntü bilgileri alınamadı.'));
      if (!Array.isArray(json.vms)) throw new Error('Anlık görüntü yanıtı eksik. Lütfen tekrar deneyin.');
      if (request !== requestId.current || current.signal.aborted) return;
      setVMs(json.vms); setCollectedAt(json.collectedAt || null); setStale(response.headers.get('x-cache') === 'STALE');
      setCapabilities({ create: json.capabilities?.create === true, delete: json.capabilities?.delete === true, revert: json.capabilities?.revert === true });
      setError(null); loaded.current = true;
    } catch (failure) {
      if (request === requestId.current && !current.signal.aborted) setError(uiError(failure, 'Anlık görüntü bilgileri alınamadı.'));
    } finally {
      if (request === requestId.current && !current.signal.aborted) { setLoading(false); setRefreshing(false); }
    }
  }, []);
  useEffect(() => {
    mounted.current = true; fetchSnapshots();
    const interval = setInterval(() => fetchSnapshots(), 120_000);
    return () => { mounted.current = false; controller.current?.abort(); clearInterval(interval); if (followup.current) clearTimeout(followup.current); };
  }, [fetchSnapshots]);
  const mutate = async (mutation: SnapshotMutation) => {
    if (stale || error || refreshing || loading) throw new Error('İşlem yapmadan önce verileri yenileyin.');
    await requestSnapshotMutation(vms, mutation, capabilities);
    if (!mounted.current) return;
    await fetchSnapshots(true);
    if (!mounted.current) return;
    if (followup.current) clearTimeout(followup.current);
    followup.current = setTimeout(() => fetchSnapshots(true), 2000);
  };
  return <SnapshotWorkspace vms={vms} loading={loading} refreshing={refreshing} error={error} stale={stale} collectedAt={collectedAt} capabilities={capabilities} onRefresh={() => fetchSnapshots(true)} onMutation={mutate} />;
}