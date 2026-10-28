'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DEVICE_LINK_SPEEDS, DEVICE_LINK_TYPES, type DeviceLinkPort } from '@/lib/topology/device-link-options';
import type { BuildingDevice, BuildingDeviceConnection } from '@/lib/topology/building-devices';
interface EditableConnection extends BuildingDeviceConnection { sourcePortId: string; targetPortId: string; updatedAt: string }

export function BuildingDeviceConnectionForm({ buildingId, source: initialSource, target: initialTarget, devices, connectionId, onClose, onCreated, onDeleted }: {
  buildingId: string; source?: BuildingDevice; target?: BuildingDevice; devices?: BuildingDevice[]; connectionId?: string;
  onClose: () => void; onCreated: (connection: BuildingDeviceConnection) => Promise<void>; onDeleted?: () => Promise<void>;
}) {
  const [sourceId, setSourceId] = useState(initialSource?.id || '');
  const [targetId, setTargetId] = useState(initialTarget?.id || '');
  const source = devices?.find(device => device.id === sourceId) || (initialSource?.id === sourceId ? initialSource : undefined);
  const target = devices?.find(device => device.id === targetId) || (initialTarget?.id === targetId ? initialTarget : undefined);
  const sourceDeviceId = source?.id, targetDeviceId = target?.id;
  const [ports, setPorts] = useState<Record<string, DeviceLinkPort[]> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sourcePortId, setSourcePortId] = useState('');
  const [targetPortId, setTargetPortId] = useState('');
  const [type, setType] = useState('ETHERNET');
  const [bandwidth, setBandwidth] = useState('');
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<EditableConnection | null>(null);
  const [canEdit, setCanEdit] = useState(!connectionId);
  const [canDelete, setCanDelete] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const saving = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setPorts(null); setSnapshot(null); setSourcePortId(''); setTargetPortId(''); setConfirmDelete(false);
    if (!sourceDeviceId || !targetDeviceId || sourceDeviceId === targetDeviceId) { setLoading(false); return () => controller.abort(); }
    const params = new URLSearchParams({ buildingId, sourceDeviceId, targetDeviceId, ...(connectionId ? { connectionId } : {}) });
    fetch(`/api/network/building-device-connections?${params}`, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then(async response => { const body = await response.json(); if (!response.ok || !body.success) throw new Error(body.error || 'Portlar yüklenemedi.'); return body.data; })
      .then(next => { if (!controller.signal.aborted) {
        setPorts(next.ports);
        if (next.connection) {
          setSnapshot(next.connection); setSourcePortId(next.connection.sourcePortId); setTargetPortId(next.connection.targetPortId);
          setType(next.connection.type); setBandwidth(next.connection.bandwidth); setCanEdit(next.canEdit); setCanDelete(next.canDelete);
        }
      } })
      .catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Portlar yüklenemedi.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [buildingId, sourceDeviceId, targetDeviceId, connectionId, revision]);
  const validPort = (id: string, portId: string) => ports?.[id]?.some(port => port.id === portId && !port.occupied);
  const canSubmit = !!source && !!target && !loading && canEdit && validPort(source.id, sourcePortId) && validPort(target.id, targetPortId) && !!bandwidth && !busy && !confirmDelete;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || !source || !target || saving.current) return;
    saving.current = true; setBusy(true); setError('');
    try {
      const response = await fetch('/api/network/building-device-connections', { method: connectionId ? 'PATCH' : 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ buildingId, sourceDeviceId: source.id, targetDeviceId: target.id, sourcePortId, targetPortId, type, bandwidth, ...(connectionId ? { connectionId, updatedAt: snapshot?.updatedAt } : {}) }) });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Bağlantı kaydedilemedi.');
      await onCreated(body.data.connection);
    } catch (err) { setError(err instanceof Error ? err.message : 'Bağlantı kaydedilemedi.'); }
    finally { saving.current = false; setBusy(false); }
  };
  const remove = async () => {
    if (!connectionId || !snapshot || !canDelete || !confirmDelete || saving.current) return;
    saving.current = true; setBusy(true); setError('');
    try {
      const response = await fetch('/api/network/building-device-connections', { method: 'DELETE', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ buildingId, connectionId, updatedAt: snapshot.updatedAt }) });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Bağlantı silinemedi.');
      await onDeleted?.();
    } catch (err) { setError(err instanceof Error ? err.message : 'Bağlantı silinemedi.'); }
    finally { saving.current = false; setBusy(false); }
  };
  const portPicker = (device: BuildingDevice, id: string, value: string, onChange: (value: string) => void) => {
    const options = ports?.[device.id] || [];
    return <div className="space-y-2 rounded-lg border p-3">
      <p className="wrap-break-word text-sm font-semibold">{device.name}</p>
      <p className="text-xs text-muted-foreground">{device.managementIp || 'IP belirtilmemiş'}</p>
      <Label htmlFor={id}>{id === 'device-link-source-port' ? 'Kaynak port' : 'Hedef port'}</Label>
      <select id={id} required className="h-10 w-full min-w-0 rounded-md border bg-background px-2 text-sm" disabled={loading || busy || !canEdit || confirmDelete || !options.length} value={value} onChange={event => onChange(event.target.value)}>
        <option value="">{loading ? 'Portlar yükleniyor…' : 'Port seçin'}</option>
        {value && !options.some(port => port.id === value) && <option value={value} disabled>{id === 'device-link-source-port' ? snapshot?.sourcePortName : snapshot?.targetPortName} · Port artık mevcut değil</option>}
        {options.map(port => <option key={port.id} value={port.id} disabled={port.occupied}>{port.name} · {port.kind}{port.occupied ? ' · Kullanımda' : ''}</option>)}
      </select>
      {!loading && ports && !options.length && <p className="text-xs text-muted-foreground">Kayıtlı port bulunamadı. Cihaz envanterine port ekleyin veya NMS portlarını eşitleyin.</p>}
      {!loading && options.length > 0 && options.every(port => port.occupied) && <p className="text-xs text-muted-foreground">Bu cihazın tüm kayıtlı portları kullanımda.</p>}
    </div>;
  };
  return <Dialog open onOpenChange={open => { if (!open && !saving.current) onClose(); }}>
    <DialogContent closeButtonText="Kapat" closeLabel="Cihaz bağlantı formunu kapat" className="max-h-[90dvh] overflow-y-auto" style={{ width: 'calc(100vw - 2rem)', maxWidth: 560 }}>
      <DialogHeader><DialogTitle>{connectionId ? 'Cihaz bağlantısını düzenle' : 'Cihazları bağla'}</DialogTitle><DialogDescription>{connectionId ? 'Kayıtlı bağlantının türünü, iki uçtaki portlarını ve hızını düzenleyin.' : 'İki cihazın portlarını, bağlantı türünü ve hızını seçin. Bağlantı bu topolojiye kaydedilir.'}</DialogDescription></DialogHeader>
      <form onSubmit={event => void submit(event)} className="min-w-0 space-y-4">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!connectionId && devices && <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="device-link-source">Kaynak cihaz</Label><select id="device-link-source" className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={sourceId} disabled={busy} onChange={event => { setSourceId(event.target.value); if (targetId === event.target.value) setTargetId(''); }}><option value="">Cihaz seçin</option>{devices.map(device => <option key={device.id} value={device.id}>{device.name}{device.managementIp ? ` · ${device.managementIp}` : ''}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="device-link-target">Hedef cihaz</Label><select id="device-link-target" className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={targetId} disabled={busy} onChange={event => setTargetId(event.target.value)}><option value="">Cihaz seçin</option>{devices.map(device => <option key={device.id} value={device.id} disabled={device.id === sourceId}>{device.name}{device.managementIp ? ` · ${device.managementIp}` : ''}</option>)}</select></div>
        </div>}
        {source && target ? <div className="grid min-w-0 gap-3 sm:grid-cols-2">{portPicker(source, 'device-link-source-port', sourcePortId, setSourcePortId)}{portPicker(target, 'device-link-target-port', targetPortId, setTargetPortId)}</div> : <p role="status" className="text-sm text-muted-foreground">Bağlantı için iki farklı cihaz seçin. Ardından kayıtlı portları listelenecek.</p>}
        <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="device-link-type">Bağlantı türü</Label><select id="device-link-type" required disabled={busy || !canEdit || confirmDelete} className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={type} onChange={event => setType(event.target.value)}>{DEVICE_LINK_TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="device-link-speed">Bağlantı hızı</Label><select id="device-link-speed" required disabled={busy || !canEdit || confirmDelete} className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={bandwidth} onChange={event => setBandwidth(event.target.value)}><option value="">Hız seçin</option>{DEVICE_LINK_SPEEDS.map(speed => <option key={speed} value={speed}>{speed}</option>)}</select></div></div>
        <p className="text-xs text-muted-foreground">{connectionId ? 'Portlar değiştirildiğinde erişim durumu “Bilinmiyor” olarak güncellenir.' : 'Yeni kaydın erişim durumu “Bilinmiyor” olarak gösterilir.'}</p>
        {confirmDelete ? <div className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3" role="group" aria-label="Bağlantıyı silme onayı"><p className="text-sm font-semibold">Bağlantı silinsin mi?</p><p className="wrap-break-word text-xs text-muted-foreground">{source?.name} ({snapshot?.sourcePortName}) ↔ {target?.name} ({snapshot?.targetPortName}) bağlantısı silinecek ve portlar boşalacak.</p><div className="flex flex-wrap justify-end gap-2"><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setConfirmDelete(false)}>Silmekten vazgeç</Button><Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => void remove()}>{busy ? 'Siliniyor…' : 'Evet, bağlantıyı sil'}</Button></div></div> : <div className="flex flex-wrap justify-end gap-2">{connectionId && canDelete && <Button type="button" size="sm" variant="destructive" className="mr-auto" disabled={busy || loading || !snapshot} onClick={() => setConfirmDelete(true)}>Bağlantıyı sil</Button>}<Button type="button" size="sm" variant="ghost" disabled={busy || loading} onClick={() => setRevision(value => value + 1)}>{connectionId ? 'Bağlantıyı yenile' : 'Portları yenile'}</Button><Button type="button" size="sm" variant="outline" disabled={busy} onClick={onClose}>Vazgeç</Button><Button type="submit" size="sm" disabled={!canSubmit}>{busy ? 'Kaydediliyor…' : connectionId ? 'Değişiklikleri kaydet' : 'Bağlantıyı kaydet'}</Button></div>}
      </form>
    </DialogContent>
  </Dialog>;
}
