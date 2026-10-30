'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPut } from '@/lib/api';
import type { PresentationEnvelope, TopologyPresentation } from '@/lib/topology/presentation';

interface Result { success: boolean; status?: number; error?: string; data?: PresentationEnvelope }
const endpoint = '/api/network/topology-presentation';

/** One in-flight document; unsent drags coalesce. A failed snapshot is retried verbatim. */
export function useTopologyPresentation() {
  const [document, setDocument] = useState<TopologyPresentation | null>(null);
  const [ready, setReady] = useState(false), [canEdit, setCanEdit] = useState(false);
  const [status, setStatus] = useState<'loading'|'idle'|'saving'|'saved'|'error'>('loading');
  const [error, setError] = useState(''), [conflict, setConflict] = useState(false);
  const [serverCopy, setServerCopy] = useState<PresentationEnvelope | null>(null);
  const [recoveryDraft,setRecoveryDraft] = useState<TopologyPresentation|null>(null);
  const revision = useRef(0), draft = useRef<TopologyPresentation | null>(null), queued = useRef<TopologyPresentation | null>(null);
  const failed = useRef<{ baseRevision:number; document:TopologyPresentation } | null>(null);
  const inFlight = useRef(false), mounted = useRef(false), generation = useRef(0);
  const load = useCallback(async () => {
    const current = ++generation.current; setStatus('loading'); setError('');
    const result: Result = await apiGet(endpoint);
    if (!mounted.current || current !== generation.current) return;
    if (!result.success || !result.data) { setStatus('error'); setError(result.error || 'Topoloji görünümü yüklenemedi.'); return; }
    revision.current = result.data.revision; draft.current = result.data.document;
    setDocument(result.data.document); setCanEdit(result.data.canEdit); setReady(true); setStatus('idle');
  }, []);
  useEffect(() => { const loadGeneration = generation; mounted.current = true; void load(); return () => { mounted.current = false; loadGeneration.current++; }; }, [load]);
  const drain = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    while (failed.current || queued.current) {
      const request = failed.current || { baseRevision: revision.current, document: queued.current! };
      if (!failed.current) queued.current = null;
      setStatus('saving'); setError('');
      const result: Result = await apiPut(endpoint, request);
      if (!mounted.current) { inFlight.current = false; return; }
      if (!result.success || !result.data) {
        failed.current = request; setStatus('error'); setConflict(result.status === 409);
        setError(`${result.error || 'Bağlantı kesildi veya görünüm kaydedilemedi.'} Taslağınız korunuyor.`);
        break;
      }
      revision.current = result.data.revision; failed.current = null; setConflict(false); setStatus('saved');
    }
    inFlight.current = false;
  }, []);
  const change = useCallback((next: TopologyPresentation) => {
    if (!ready || !canEdit || failed.current) return;
    draft.current = next; setDocument(next); queued.current = next; void drain();
  }, [ready, canEdit, drain]);
  const retry = () => { if (!ready) void load(); else if (!conflict) void drain(); };
  const inspectServer = async () => {
    const result: Result = await apiGet(endpoint);
    if (result.success && result.data) setServerCopy(result.data);
    else setError(`${result.error || 'Güncel görünüm yüklenemedi.'} Taslağınız korunuyor.`);
  };
  // Explicit server adoption only. The local draft stays available for comparison.
  const adoptServer = () => {
    if (!serverCopy) return;
    setRecoveryDraft(draft.current);draft.current=serverCopy.document;
    revision.current = serverCopy.revision; failed.current = null; queued.current = null;
    setDocument(serverCopy.document); setCanEdit(serverCopy.canEdit); setConflict(false); setError(''); setStatus('idle'); setServerCopy(null);
  };
  return { document, ready, canEdit, status, error, conflict, serverCopy, change, retry, inspectServer, adoptServer, localDraft: recoveryDraft };
}
