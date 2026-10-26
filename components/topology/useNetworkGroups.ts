'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { readExpandedNetworkGroups, type NetworkGroup } from '@/lib/topology/network-groups';
import type { BuildingPosition } from '@/lib/topology/building-layout';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';
const storageKey = 'infrascope:topology:expanded-network-groups:v1';
export async function networkGroupRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const input = typeof options?.body === 'string' ? JSON.parse(options.body) : undefined;
  const body = options?.method === 'PATCH' ? await apiPatch(url, input, { timeout: 20000 })
    : options?.method === 'POST' ? await apiPost(url, input, { timeout: 20000 })
    : options?.method === 'DELETE' ? await apiDelete(url, { data: input, timeout: 20000 })
    : await apiGet(url, undefined, { timeout: 20000, signal: options?.signal || undefined });
  if (!body?.success) throw new Error(body?.status && typeof body.error === 'string' ? body.error : 'Ağ grubu bilgileri alınamadı. Bağlantıyı kontrol edip yeniden deneyin.');
  return body.data;
}
export function useNetworkGroups() {
  const [groups, setGroups] = useState<NetworkGroup[]>([]), [canManage, setCanManage] = useState(false), [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set()), [ready, setReady] = useState(false);
  const current = useRef(groups), queue = useRef(Promise.resolve());
  current.current = groups;
  const load = useCallback(async () => {
    try { const data = await networkGroupRequest<{ items: NetworkGroup[]; canManage: boolean }>('/api/network/groups'); current.current = data.items; setGroups(data.items); setCanManage(data.canManage); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Ağ grupları yüklenemedi.'); }
  }, []);
  useEffect(() => { try { const ids = [...readExpandedNetworkGroups(localStorage.getItem(storageKey))]; setExpanded(new Set(ids.slice(-1))); } catch { /* Storage is optional. */ } setReady(true); void load(); }, [load]);
  useEffect(() => { if (ready) try { localStorage.setItem(storageKey, JSON.stringify([...expanded])); } catch { /* Folding still works without storage. */ } }, [expanded, ready]);
  // One focused group at a time; overview coordinates are never rewritten.
  const toggle = useCallback((id: string) => setExpanded(previous => previous.has(id) ? new Set() : new Set([id])), []);
  const reveal = useCallback((buildingId: string) => { const group = current.current.find(g => g.members.some(m => m.buildingId === buildingId)); setExpanded(new Set(group ? [group.id] : [])); }, []);
  const savePosition = useCallback((id: string, view: string, position: BuildingPosition) => {
    queue.current = queue.current.then(async () => {
      const group = current.current.find(g => g.id === id); if (!group) return;
      try {
        await networkGroupRequest(`/api/network/groups/${id}`, { method: 'PATCH', body: JSON.stringify({ version: group.version, position: { view, ...position } }) });
        await load();
      } catch (e) { setError(e instanceof Error ? e.message : 'Grup konumu kaydedilemedi.'); }
    });
  }, [load]);
  return { groups, canManage, error, expanded, load, toggle, reveal, savePosition };
}
