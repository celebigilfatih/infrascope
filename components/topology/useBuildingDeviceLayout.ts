'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BuildingPosition } from '@/lib/topology/building-layout';
import type { DevicePositions } from '@/lib/topology/building-device-layout';

async function layoutRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...init });
  const body = await response.json();
  if (!response.ok || !body.success) throw new Error(body.error || 'Cihaz yerleşimi kaydedilemedi.');
  return body.data;
}

export function useBuildingDeviceLayout(buildingId: string) {
  const [positions, setPositions] = useState<DevicePositions>({});
  const [ready, setReady] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [saving, setSaving] = useState(0);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetSaved, setResetSaved] = useState(false);
  const [resetVersion, setResetVersion] = useState(0);
  const resetLock = useRef(false);
  const resetFailed = useRef(false);
  const pending = useRef(new Map<string, BuildingPosition>());
  const queue = useRef<Promise<void>>(Promise.resolve());
  const loadVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setError(''); setReady(false);
    try {
      const data = await layoutRequest<{ positions: DevicePositions; canEdit: boolean }>(`/api/network/building-device-layout?buildingId=${encodeURIComponent(buildingId)}`);
      if (version === loadVersion.current) { setPositions(data.positions); setCanEdit(data.canEdit); setReady(true); }
    } catch (err) { if (version === loadVersion.current) setError(err instanceof Error ? err.message : 'Cihaz yerleşimi yüklenemedi.'); }
  }, [buildingId]);
  useEffect(() => {
    const version = loadVersion;
    void load();
    return () => { version.current++; };
  }, [load]);

  const persist = useCallback((deviceId: string, position: BuildingPosition) => {
    setSaving(count => count + 1); setSaved(false);
    // Serialize moves, including rapid successive drags of the same device.
    queue.current = queue.current.then(async () => {
      try {
        await layoutRequest('/api/network/building-device-layout', { method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ buildingId, deviceId, position }) });
        if (pending.current.get(deviceId) === position) pending.current.delete(deviceId);
        if (!pending.current.size) { setError(''); setSaved(true); }
      } catch (err) { setError(err instanceof Error ? err.message : 'Cihaz yerleşimi kaydedilemedi.'); }
      finally { setSaving(count => count - 1); }
    });
  }, [buildingId]);
  const move = useCallback((deviceId: string, position: BuildingPosition) => {
    if (!ready || !canEdit || resetLock.current) return;
    resetFailed.current = false; setResetSaved(false);
    const next = { x: position.x, y: position.y };
    setPositions(current => ({ ...current, [deviceId]: next }));
    pending.current.set(deviceId, next);
    persist(deviceId, next);
  }, [ready, canEdit, persist]);
  const reset = useCallback(async () => {
    if (!ready || !canEdit || resetLock.current) return;
    resetLock.current = true; setResetting(true); setResetSaved(false); setError('');
    // A late acknowledgement from a drag must never overwrite a successful reset.
    await queue.current;
    try {
      const data = await layoutRequest<{ positions: DevicePositions }>('/api/network/building-device-layout', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reset', buildingId }) });
      pending.current.clear(); resetFailed.current = false;
      setPositions(data.positions); setError(''); setSaved(true); setResetSaved(true);
      setResetVersion(value => value + 1);
    } catch (err) {
      resetFailed.current = true;
      setError(err instanceof Error ? err.message : 'Cihaz yerleşimi sıfırlanamadı. Mevcut düzen korunuyor.');
    } finally { resetLock.current = false; setResetting(false); }
  }, [buildingId, ready, canEdit]);
  const retry = () => {
    if (resetLock.current) return;
    if (!ready) { void load(); return; }
    if (resetFailed.current) { void reset(); return; }
    setError('');
    for (const [id, position] of pending.current) persist(id, position);
  };
  return { positions, ready, canEdit, saving: saving > 0 || resetting, resetting, resetSaved, resetVersion, error, saved, move, reset, retry };
}
