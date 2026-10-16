'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ClusterWorkspace } from '@/components/virtualization/ClusterWorkspace';
import type { ClusterWorkspaceRecord } from '@/lib/virtualization/cluster-workspace';
import { uiError } from '@/lib/i18n/tr';

export default function ClustersPage() {
  const [clusters, setClusters] = useState<ClusterWorkspaceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collectedAt, setCollectedAt] = useState<string | null>(null);
  const [focusClusterId, setFocusClusterId] = useState<string | null>(null);
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const loaded = useRef(false);
  const fetchClusters = useCallback(async (bypass = false) => {
    const request = ++requestId.current;
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    if (loaded.current) setRefreshing(true); else setLoading(true);
    try {
      const response = await fetch('/api/integrations/vmware?type=cluster-workspace', { signal: current.signal, headers: bypass ? { 'x-cache-bypass': '1' } : undefined });
      const json = await response.json();
      if (!response.ok || json.error) throw new Error(uiError(json.error || 'Küme verileri alınamadı.'));
      if (!Array.isArray(json.clusters)) throw new Error('Küme yanıtı eksik. Lütfen tekrar deneyin.');
      if (request !== requestId.current || current.signal.aborted) return;
      setClusters(json.clusters); setCollectedAt(json.collectedAt || null); setError(null); loaded.current = true;
    } catch (fetchError) {
      if (request === requestId.current && !current.signal.aborted) setError(uiError(fetchError, 'Küme verileri alınamadı.'));
    } finally {
      if (request === requestId.current && !current.signal.aborted) { setLoading(false); setRefreshing(false); }
    }
  }, []);
  useEffect(() => {
    setFocusClusterId(new URLSearchParams(window.location.search).get('clusterId'));
    fetchClusters();
    const interval = setInterval(() => fetchClusters(), 300_000);
    return () => { controller.current?.abort(); clearInterval(interval); };
  }, [fetchClusters]);
  return <ClusterWorkspace clusters={clusters} loading={loading} refreshing={refreshing} error={error} collectedAt={collectedAt} onRefresh={() => fetchClusters(true)} focusClusterId={focusClusterId} />;
}
