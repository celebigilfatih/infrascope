'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { VMWorkspace } from '@/components/virtualization/VMWorkspace';
import type { VMWorkspaceRecord } from '@/lib/virtualization/vm-workspace';
import { requestVMPower } from '@/lib/virtualization/vm-workspace';
import type { VMPowerOperation } from '@/lib/virtualization/vm-workspace';
import { uiError } from '@/lib/i18n/tr';

export default function VMsPage() {
  const [vms, setVMs] = useState<VMWorkspaceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collectedAt, setCollectedAt] = useState<string | null>(null);
  const [canPower, setCanPower] = useState(false);
  const [stale, setStale] = useState(false);
  const [focusVMId, setFocusVMId] = useState<string | null>(null);
  const followup = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const loaded = useRef(false);
  const fetchVMs = useCallback(async (bypass = false) => {
    const request = ++requestId.current;
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    if (loaded.current) setRefreshing(true); else setLoading(true);
    try {
      const response = await fetch('/api/integrations/vmware?type=vm-workspace', { signal: current.signal, headers: bypass ? { 'x-cache-bypass': '1' } : undefined });
      const json = await response.json();
      if (!response.ok || json.error) throw new Error(uiError(json.error || 'Sanal makine verileri alınamadı.'));
      if (!Array.isArray(json.vms)) throw new Error('Sanal makine yanıtı eksik. Lütfen tekrar deneyin.');
      if (request !== requestId.current || current.signal.aborted) return;
      setStale(response.headers.get('x-cache') === 'STALE'); setCanPower(json.canPower === true); setVMs(json.vms); setCollectedAt(json.collectedAt || null); setError(null); loaded.current = true;
    } catch (fetchError) {
      if (request === requestId.current && !current.signal.aborted) setError(uiError(fetchError, 'Sanal makine verileri alınamadı.'));
    } finally {
      if (request === requestId.current && !current.signal.aborted) { setLoading(false); setRefreshing(false); }
    }
  }, []);
  useEffect(() => {
    setFocusVMId(new URLSearchParams(window.location.search).get('vmId'));
    fetchVMs();
    const interval = setInterval(() => fetchVMs(), 300_000);
    return () => { controller.current?.abort(); clearInterval(interval); if (followup.current) clearTimeout(followup.current); };
  }, [fetchVMs]);
  const handlePower = async (vm: VMWorkspaceRecord, operation: VMPowerOperation) => {
    if (!canPower) throw new Error('Bu işlem için yetkiniz yok.');
    await requestVMPower(vm, operation);
    await fetchVMs(true);
    if (followup.current) clearTimeout(followup.current);
    followup.current = setTimeout(() => fetchVMs(true), 2000);
  };
  return <VMWorkspace focusVMId={focusVMId} stale={stale} canPower={canPower} onPower={handlePower} vms={vms} loading={loading} refreshing={refreshing} error={error} collectedAt={collectedAt} onRefresh={() => fetchVMs(true)} />;
}
