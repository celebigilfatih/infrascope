'use client';

import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import type { BuildingEndpointDevice, BuildingEndpointSelection, BuildingLinkedDevices } from '@/lib/topology/building-connection-options';
import type { DeviceLinkPort } from '@/lib/topology/device-link-options';

export const emptyBuildingEndpoints = (): BuildingEndpointSelection => ({ sourceDeviceId: '', targetDeviceId: '', sourcePortId: '', targetPortId: '' });

export function BuildingConnectionEndpointFields({ connectionId, sourceBuildingName, targetBuildingName, sourceDevices, targetDevices, saved, value, onChange, disabled, onReady }: {
  connectionId: string; sourceBuildingName: string; targetBuildingName: string;
  sourceDevices: BuildingEndpointDevice[]; targetDevices: BuildingEndpointDevice[]; saved?: BuildingLinkedDevices | null;
  value: BuildingEndpointSelection; onChange: (next: BuildingEndpointSelection) => void; disabled: boolean; onReady: (valid: boolean) => void;
}) {
  const [ports, setPorts] = useState<Record<string, DeviceLinkPort[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const { sourceDeviceId, targetDeviceId } = value;
  useEffect(() => {
    const controller = new AbortController();
    setPorts({}); setError('');
    if (!sourceDeviceId && !targetDeviceId) { setLoading(false); return; }
    setLoading(true);
    const params = new URLSearchParams({ mode: 'ports', sourceDeviceId, targetDeviceId });
    fetch(`/api/building-connections/${encodeURIComponent(connectionId)}?${params}`, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then(async response => { const body = await response.json(); if (!response.ok || !body.success) throw new Error(body.error || 'Portlar yüklenemedi.'); return body.data.ports; })
      .then(next => { if (!controller.signal.aborted) setPorts(next); })
      .catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Portlar yüklenemedi.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [connectionId, sourceDeviceId, targetDeviceId, revision]);

  const empty = Object.values(value).every(item => !item);
  const availablePort = (deviceId: string, portId: string) => ports[deviceId]?.some(port => port.id === portId && !port.occupied);
  const valid = empty || (!loading && !error && sourceDevices.some(device => device.id === sourceDeviceId) && targetDevices.some(device => device.id === targetDeviceId) && !!availablePort(sourceDeviceId, value.sourcePortId) && !!availablePort(targetDeviceId, value.targetPortId));
  useEffect(() => onReady(valid), [valid, onReady]);

  const picker = (source: boolean) => {
    const deviceId = source ? value.sourceDeviceId : value.targetDeviceId;
    const portId = source ? value.sourcePortId : value.targetPortId;
    const devices = source ? sourceDevices : targetDevices;
    const deviceField = source ? 'sourceDeviceId' : 'targetDeviceId';
    const portField = source ? 'sourcePortId' : 'targetPortId';
    const id = source ? 'building-source' : 'building-target';
    const options = ports[deviceId] || [];
    const previousDevice = source ? saved?.sourceDevice : saved?.targetDevice;
    const previousPort = saved?.endpoints.find(port => port.side === (source ? 0 : 1));
    const selectClass = 'h-10 w-full min-w-0 rounded-md border bg-background px-2 text-sm';
    return <div className="min-w-0 space-y-3 rounded-lg border bg-muted/20 p-3">
      <div><p className="text-xs font-medium text-muted-foreground">{source ? 'Kaynak bina' : 'Hedef bina'}</p><p className="break-words text-sm font-semibold">{source ? sourceBuildingName : targetBuildingName}</p></div>
      <div className="space-y-1.5"><Label htmlFor={`${id}-device`}>{source ? 'Kaynak cihaz' : 'Hedef cihaz'}</Label><select id={`${id}-device`} className={selectClass} disabled={disabled || !devices.length} value={deviceId} onChange={event => onChange({ ...value, [deviceField]: event.target.value, [portField]: '' })}>
        <option value="">Cihaz seçin</option>
        {deviceId && !devices.some(device => device.id === deviceId) && <option value={deviceId} disabled>{previousDevice?.name || 'Kayıtlı cihaz'} · Bu binada bulunmuyor</option>}
        {devices.map(device => <option key={device.id} value={device.id}>{device.name}{device.managementIp ? ` · ${device.managementIp}` : ''}</option>)}
      </select></div>
      <div className="space-y-1.5"><Label htmlFor={`${id}-port`}>{source ? 'Kaynak port' : 'Hedef port'}</Label><select id={`${id}-port`} className={selectClass} disabled={disabled || loading || !deviceId || !options.length || !!error} value={portId} onChange={event => onChange({ ...value, [portField]: event.target.value })}>
        <option value="">{loading && deviceId ? 'Portlar yükleniyor…' : 'Port seçin'}</option>
        {portId && !options.some(port => port.id === portId) && <option value={portId} disabled>{previousPort?.portName || 'Kayıtlı port'} · {loading ? 'Yükleniyor…' : 'Artık mevcut değil'}</option>}
        {options.map(port => <option key={port.id} value={port.id} disabled={port.occupied}>{port.name} · {port.kind}{port.occupied ? ' · Kullanımda' : ''}</option>)}
      </select></div>
      {!devices.length ? <p className="text-xs text-muted-foreground">Bu binaya cihaz atanmamış. Bina görünümünden önce cihaz atayın.</p> : !loading && !error && deviceId && !options.length ? <p className="text-xs text-muted-foreground">Bu cihazın kayıtlı portu yok. Cihaza port ekleyin veya NMS portlarını eşitleyin.</p> : !loading && options.length > 0 && options.every(port => port.occupied) ? <p className="text-xs text-muted-foreground">Bu cihazın tüm portları kullanımda.</p> : null}
    </div>;
  };
  return <fieldset className="min-w-0 space-y-3">
    <legend className="text-sm font-semibold">Cihaz ve port uçları</legend>
    <p className="text-xs text-muted-foreground">Atama isteğe bağlıdır. Atamak için iki binadan da cihaz ve boş port seçin.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">{picker(true)}{picker(false)}</div>
    {!empty && !valid && !loading && !error && <p role="status" className="text-xs text-muted-foreground">Kaydetmek için iki uçtaki cihaz ve port seçimlerini tamamlayın.</p>}
    <div className="flex flex-wrap gap-2">
      {!empty && <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => onChange(emptyBuildingEndpoints())}>Cihaz ve port atamalarını kaldır</Button>}
      {(sourceDeviceId || targetDeviceId) && <Button type="button" size="sm" variant="ghost" disabled={disabled || loading} onClick={() => { setPorts({}); setRevision(current => current + 1); }}>Portları yenile</Button>}
    </div>
  </fieldset>;
}
