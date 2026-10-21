'use client';

import { useEffect, useRef, useState } from 'react';
import { Building2, Link2, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { BUILDING_CONNECTION_SPEEDS, BUILDING_CONNECTION_TYPES, isBuildingConnectionSpeed } from '@/lib/topology/building-connection-options';
import type { BuildingConnection } from '@/types';
import { BuildingConnectionEndpointFields, emptyBuildingEndpoints } from './BuildingConnectionEndpointFields';
import type { BuildingEndpointDevice, BuildingEndpointSelection } from '@/lib/topology/building-connection-options';

type ConnectionSnapshot = BuildingConnection & { updatedAt: string };

export function BuildingConnectionEditor({ connectionId, onClose, onChanged }: {
  connectionId: string;
  onClose: () => void;
  onChanged: (connection: BuildingConnection | null) => void;
}) {
  const [snapshot, setSnapshot] = useState<ConnectionSnapshot | null>(null);
  const [connectionType, setConnectionType] = useState('');
  const [bandwidth, setBandwidth] = useState('');
  const [endpointOptions, setEndpointOptions] = useState<{ sourceDevices: BuildingEndpointDevice[]; targetDevices: BuildingEndpointDevice[] }>({ sourceDevices: [], targetDevices: [] });
  const [endpoints, setEndpoints] = useState<BuildingEndpointSelection>(emptyBuildingEndpoints);
  const [endpointsReady, setEndpointsReady] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [revision, setRevision] = useState(0);
  const saving = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setSnapshot(null); setCanEdit(false); setCanDelete(false); setConfirmDelete(false);
    fetch(`/api/building-connections/${encodeURIComponent(connectionId)}`, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok || !body.success) throw new Error(body.error || 'Bağlantı yüklenemedi.');
        return body;
      })
      .then(body => {
        if (controller.signal.aborted) return;
        setSnapshot(body.data); setConnectionType(body.data.connectionType); setBandwidth(body.data.bandwidth || '');
        setCanEdit(body.canEdit); setCanDelete(body.canDelete);
        setEndpointOptions(body.endpointOptions);
        const link = body.data.deviceLink;
        setEndpoints(link ? { sourceDeviceId: link.sourceDeviceId, targetDeviceId: link.targetDeviceId, sourcePortId: link.endpoints.find((port: { side: number }) => port.side === 0)?.portId || '', targetPortId: link.endpoints.find((port: { side: number }) => port.side === 1)?.portId || '' } : emptyBuildingEndpoints());
        setEndpointsReady(false);
      })
      .catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Bağlantı yüklenemedi.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [connectionId, revision]);

  const validSpeed = isBuildingConnectionSpeed(bandwidth);
  const previous = snapshot?.deviceLink;
  const changedEndpoints = endpoints.sourceDeviceId !== (previous?.sourceDeviceId || '') || endpoints.targetDeviceId !== (previous?.targetDeviceId || '') || endpoints.sourcePortId !== (previous?.endpoints.find(port => port.side === 0)?.portId || '') || endpoints.targetPortId !== (previous?.endpoints.find(port => port.side === 1)?.portId || '');
  const changed = snapshot && (snapshot.connectionType !== connectionType || (snapshot.bandwidth || '') !== bandwidth.trim() || changedEndpoints);
  const mutate = async (method: 'PATCH' | 'DELETE') => {
    if (!snapshot || saving.current || loading || (method === 'PATCH' ? !canEdit || !validSpeed || !changed || !endpointsReady : !canDelete || !confirmDelete)) return;
    saving.current = true; setBusy(true); setError('');
    try {
      const response = await fetch(`/api/building-connections/${encodeURIComponent(connectionId)}`, {
        method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updatedAt: snapshot.updatedAt, ...(method === 'PATCH' ? { connectionType, bandwidth: bandwidth.trim(), endpoints: Object.values(endpoints).some(Boolean) ? endpoints : null } : {}) }),
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'İşlem tamamlanamadı.');
      onChanged(method === 'DELETE' ? null : body.data);
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : 'İşlem tamamlanamadı.'); }
    finally { saving.current = false; setBusy(false); }
  };

  return <Dialog open onOpenChange={open => { if (!open && !saving.current) onClose(); }}>
    <DialogContent closeButtonText="Kapat" closeLabel="Bina bağlantı formunu kapat" className="max-h-[90dvh] overflow-y-auto" style={{ width: 'calc(100vw - 2rem)', maxWidth: 640 }}>
      <DialogHeader><DialogTitle>Bina bağlantısını düzenle</DialogTitle><DialogDescription>Binalar arasındaki bağlantının cihazlarını, portlarını, türünü ve hızını güncelleyin.</DialogDescription></DialogHeader>
      {loading && <p role="status" className="text-sm text-muted-foreground">Bağlantı yükleniyor…</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {snapshot && <form className="min-w-0 space-y-4" onSubmit={event => { event.preventDefault(); void mutate('PATCH'); }}>
        <div className="flex min-w-0 items-center gap-3 rounded-lg border bg-muted/30 p-3">
          <Building2 aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1 space-y-1"><p className="break-words text-sm font-semibold">{snapshot.sourceBuilding?.name || 'Kaynak bina'}</p><p className="break-words text-sm font-semibold">{snapshot.destBuilding?.name || 'Hedef bina'}</p></div>
          <Link2 aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" />
        </div>
        {!canEdit && <p className="text-sm text-muted-foreground">{snapshot.recordingMethod === 'AUTO' ? 'Otomatik keşfedilen bağlantılar salt okunurdur.' : 'Bu bağlantıyı düzenleme yetkiniz yok.'}</p>}
        <BuildingConnectionEndpointFields key={`${snapshot.id}:${snapshot.updatedAt}`} connectionId={connectionId} sourceBuildingName={snapshot.sourceBuilding?.name || 'Kaynak bina'} targetBuildingName={snapshot.destBuilding?.name || 'Hedef bina'} {...endpointOptions} saved={snapshot.deviceLink} value={endpoints} onChange={setEndpoints} onReady={setEndpointsReady} disabled={busy || !canEdit || confirmDelete} />
        <div className="space-y-2"><Label htmlFor="building-link-type">Bağlantı türü</Label><select id="building-link-type" required disabled={busy || !canEdit || confirmDelete} value={connectionType} onChange={event => setConnectionType(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">{BUILDING_CONNECTION_TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="building-link-speed">Bağlantı hızı</Label><Input id="building-link-speed" list="building-link-speed-options" value={bandwidth} disabled={busy || !canEdit || confirmDelete} maxLength={40} placeholder="Örn. 10 Gbps" aria-describedby="building-link-speed-hint" aria-invalid={!validSpeed} onChange={event => setBandwidth(event.target.value)} /><datalist id="building-link-speed-options">{BUILDING_CONNECTION_SPEEDS.map(speed => <option key={speed} value={speed} />)}</datalist><p id="building-link-speed-hint" className={`text-xs ${validSpeed ? 'text-muted-foreground' : 'text-destructive'}`}>{validSpeed ? 'Listeden seçin veya Mbps / Gbps cinsinden hız girin. Bilinmiyorsa boş bırakın.' : 'Pozitif bir hız ve birim girin. Örn. 100 Mbps veya 10 Gbps.'}</p></div>
        {confirmDelete ? <div role="group" aria-label="Bina bağlantısını silme onayı" className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm font-semibold">Bağlantı silinsin mi?</p><p className="break-words text-xs text-muted-foreground">{snapshot.sourceBuilding?.name} ↔ {snapshot.destBuilding?.name} bağlantısı topolojiden kaldırılacak. Binalar ve cihazlar korunur.</p>
          <div className="flex flex-wrap justify-end gap-2"><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setConfirmDelete(false)}>Silmekten vazgeç</Button><Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => void mutate('DELETE')}>{busy ? 'Siliniyor…' : 'Evet, bağlantıyı sil'}</Button></div>
        </div> : <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
          {canDelete && <Button type="button" size="sm" variant="destructive" className="mr-auto gap-1.5" disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 aria-hidden="true" className="h-3.5 w-3.5" />Bağlantıyı sil</Button>}
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onClose}>Vazgeç</Button>
          {canEdit && <Button type="submit" size="sm" disabled={busy || !validSpeed || !changed || !endpointsReady}>{busy ? 'Kaydediliyor…' : 'Değişiklikleri kaydet'}</Button>}
        </div>}
      </form>}
      <Button type="button" size="sm" variant="ghost" className="justify-self-start" disabled={busy || loading} onClick={() => setRevision(value => value + 1)}>Bağlantıyı yenile</Button>
    </DialogContent>
  </Dialog>;
}
