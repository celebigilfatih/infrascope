'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Box, Camera, CircleCheck, Database, Expand, Focus, Grid2X2, Layers3, Maximize2, RefreshCw, Search, Server, Square, Wrench, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { calculateRackCapacity } from '@/lib/rack-capacity';
import type { CameraPreset } from '@/components/3d/Room3D';
import type { LocationRack, LocationRoom } from '@/components/locations/types';
import { usePageBreadcrumb } from '@/components/layout/BreadcrumbProvider';
import { cn } from '@/lib/utils';

const Room3D = dynamic(() => import('@/components/3d/Room3D').then((module) => module.Room3D), { ssr: false, loading: () => <SceneLoading /> });
const FloorPlanView = dynamic(() => import('@/components/3d/FloorPlanView').then((module) => module.FloorPlanView), { ssr: false, loading: () => <SceneLoading /> });

function SceneLoading() { return <div className="flex h-full items-center justify-center bg-muted/10"><RefreshCw className="h-5 w-5 animate-spin text-primary" /><span className="ml-3 text-sm text-muted-foreground">Dijital ikiz hazırlanıyor...</span></div>; }

export default function RoomDigitalTwinPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceRef = useRef<HTMLDivElement>(null);
  const roomId = params.id as string;
  const [room, setRoom] = useState<LocationRoom & { floor?: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'3d' | 'plan'>('3d');
  const [displayMode, setDisplayMode] = useState<'operation' | 'capacity'>('operation');
  const [selectedRackId, setSelectedRackId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('isometric');
  const [cameraRequestKey, setCameraRequestKey] = useState(0);
  const [planEditMode, setPlanEditMode] = useState(false);

  const loadRoom = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/rooms/${roomId}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Oda bilgileri yüklenemedi');
      setRoom(body.data);
      setSelectedRackId((current) => body.data.racks.some((rack: LocationRack) => rack.id === current) ? current : null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Oda bilgileri yüklenemedi');
    } finally { setLoading(false); }
  }, [roomId]);

  useEffect(() => { loadRoom(); }, [loadRoom]);

  const breadcrumbItems = useMemo(() => room ? [
    { label: 'Fiziksel Konumlar', href: '/locations' },
    { label: room.floor?.building?.name || 'Bina', href: '/locations' },
    { label: room.name },
  ] : null, [room?.floor?.building?.name, room?.name]);
  usePageBreadcrumb(breadcrumbItems);

  const visibleRacks = useMemo(() => (room?.racks || []).filter((rack) => {
    const matchesSearch = !search || rack.name.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR')) || rack.devices?.some((device) => device.name.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR')));
    const matchesStatus = statusFilter === 'all' || rack.operationalStatus === statusFilter;
    return matchesSearch && matchesStatus;
  }), [room?.racks, search, statusFilter]);
  const visibleRackIds = useMemo(() => new Set(visibleRacks.map((rack) => rack.id)), [visibleRacks]);
  const selectedRack = room?.racks?.find((rack) => rack.id === selectedRackId) || null;
  const selectedCapacity = selectedRack ? calculateRackCapacity(selectedRack.maxUnits, selectedRack.devices || []) : null;

  const requestCamera = (preset: CameraPreset) => { setSelectedRackId(null); setCameraPreset(preset); setCameraRequestKey((key) => key + 1); };
  const toggleFullscreen = async () => { if (!document.fullscreenElement) await workspaceRef.current?.requestFullscreen(); else await document.exitFullscreen(); };

  if (loading) return <div className="flex h-[calc(100vh-4rem)] items-center justify-center"><SceneLoading /></div>;
  if (error || !room) return <div className="flex h-[calc(100vh-4rem)] items-center justify-center p-6"><div className="max-w-md rounded-md border border-destructive/30 bg-destructive/5 p-6 text-center"><AlertTriangle className="mx-auto h-6 w-6 text-destructive" /><p className="mt-3 font-medium">{error || 'Oda bulunamadı'}</p><Button className="mt-4" onClick={loadRoom}>Tekrar dene</Button></div></div>;

  return (
    <div ref={workspaceRef} className="relative flex h-[calc(100vh-4rem)] min-h-[640px] flex-col overflow-hidden bg-background">
      <header className="flex min-h-16 flex-wrap items-center gap-3 border-b border-border bg-background px-3 py-2 sm:px-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/locations')} aria-label="Konumlara dön"><ArrowLeft className="h-4 w-4" /></Button>
        <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h1 className="truncate text-base font-semibold sm:text-lg">{room.name}</h1><Badge variant="outline" className="hidden sm:inline-flex">{room.racks?.length || 0} kabinet</Badge></div><p className="truncate text-xs text-muted-foreground">{room.floor?.building?.name} · {room.width || '?'} × {room.depth || '?'} × {room.height || '?'} m</p></div>

        <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-1">
          <Button variant={view === '3d' ? 'default' : 'ghost'} size="sm" onClick={() => setView('3d')}><Box className="mr-2 h-4 w-4" />3D</Button>
          <Button variant={view === 'plan' ? 'default' : 'ghost'} size="sm" onClick={() => setView('plan')}><Grid2X2 className="mr-2 h-4 w-4" />Plan</Button>
        </div>

        {view === '3d' && <div className="hidden items-center gap-1 md:flex"><Button variant="ghost" size="icon" onClick={() => requestCamera('isometric')} title="İzometrik" aria-label="İzometrik kamera"><Camera className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => requestCamera('front')} title="Önden" aria-label="Önden kamera"><Square className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => requestCamera('top')} title="Üstten" aria-label="Üstten kamera"><Focus className="h-4 w-4" /></Button></div>}
        {view === 'plan' && <Button variant={planEditMode ? 'default' : 'outline'} size="sm" onClick={() => setPlanEditMode((value) => !value)}><Wrench className="mr-2 h-4 w-4" />{planEditMode ? 'Düzenleme açık' : 'Yerleşimi düzenle'}</Button>}
        <Button variant="ghost" size="icon" onClick={loadRoom} aria-label="Odayı yenile" title="Yenile"><RefreshCw className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" onClick={toggleFullscreen} aria-label="Tam ekran" title="Tam ekran"><Maximize2 className="h-4 w-4" /></Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 flex-col border-r border-border bg-background lg:flex">
          <div className="space-y-3 border-b border-border p-4"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Kabinet veya cihaz ara" className="pl-9" /></div><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="all">Tüm kabinetler</option><option value="OPERATIONAL">Operasyonel</option><option value="MAINTENANCE">Bakımda</option><option value="DECOMMISSIONED">Devre dışı</option></select></div>
          <div className="flex-1 overflow-y-auto p-2">{visibleRacks.map((rack) => { const capacity = calculateRackCapacity(rack.maxUnits, rack.devices || []); const selected = rack.id === selectedRackId; return <button key={rack.id} type="button" onClick={() => setSelectedRackId(rack.id)} className={cn('mb-1 w-full rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted', selected && 'bg-primary/10 text-primary')}><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{rack.name}</span><span className={cn('h-2 w-2 rounded-full', rack.operationalStatus === 'OPERATIONAL' ? 'bg-emerald-500' : 'bg-amber-500')} /></div><div className="mt-1 flex items-center justify-between text-xs text-muted-foreground"><span>{rack.devices?.length || 0} cihaz</span><span>{capacity.usedUnits}/{capacity.totalUnits}U · %{capacity.utilization}</span></div></button>; })}</div>
        </aside>

        <div className="relative min-w-0 flex-1">
          {view === '3d' && (
            <div className="absolute left-3 top-3 z-20 flex items-center gap-1 rounded-md border border-border bg-background/90 p-1 shadow-sm backdrop-blur">
              <Button variant={displayMode === 'operation' ? 'secondary' : 'ghost'} size="sm" onClick={() => setDisplayMode('operation')}><CircleCheck className="mr-2 h-4 w-4" />Operasyon</Button>
              <Button variant={displayMode === 'capacity' ? 'secondary' : 'ghost'} size="sm" onClick={() => setDisplayMode('capacity')}><Layers3 className="mr-2 h-4 w-4" />Kapasite</Button>
            </div>
          )}
          <select value={selectedRackId || ''} onChange={(event) => setSelectedRackId(event.target.value || null)} className="absolute right-3 top-3 z-20 h-9 max-w-[46%] rounded-md border border-input bg-background/90 px-3 text-sm shadow-sm lg:hidden"><option value="">Kabinet seçin</option>{visibleRacks.map((rack) => <option key={rack.id} value={rack.id}>{rack.name}</option>)}</select>
          {view === '3d' ? <Room3D room={room} selectedRackId={selectedRackId} onRackClick={setSelectedRackId} visibleRackIds={visibleRackIds} displayMode={displayMode} cameraPreset={cameraPreset} cameraRequestKey={cameraRequestKey} /> : <FloorPlanView room={room} onUpdate={loadRoom} selectedRackId={selectedRackId} onRackClick={setSelectedRackId} editMode={planEditMode} />}
        </div>

        <RackInspector rack={selectedRack} capacity={selectedCapacity} onClose={() => setSelectedRackId(null)} />
      </div>
    </div>
  );
}

function RackInspector({ rack, capacity, onClose }: { rack: LocationRack | null; capacity: ReturnType<typeof calculateRackCapacity> | null; onClose: () => void }) {
  if (!rack || !capacity) return <aside className="hidden w-80 shrink-0 border-l border-border bg-background p-5 xl:block"><Database className="h-6 w-6 text-muted-foreground" /><p className="mt-3 text-sm font-medium">Kabinet seçilmedi</p><p className="mt-1 text-sm text-muted-foreground">Kapasite ve cihaz yerleşimini incelemek için sahneden bir kabinet seçin.</p></aside>;
  return <aside className="absolute inset-x-0 bottom-0 z-30 max-h-[44%] overflow-y-auto border-t border-border bg-background/95 p-4 shadow-lg backdrop-blur xl:static xl:block xl:max-h-none xl:w-80 xl:shrink-0 xl:border-l xl:border-t-0 xl:p-5 xl:shadow-none"><div className="flex items-start justify-between"><div className="min-w-0"><h2 className="truncate font-semibold">{rack.name}</h2><p className="mt-1 text-xs text-muted-foreground">{rack.type.replace(/_/g, ' ')} · {rack.maxUnits}U</p></div><Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Kabinet detayını kapat"><X className="h-4 w-4" /></Button></div><div className="mt-5 grid grid-cols-2 border-y border-border"><InspectorMetric label="Doluluk" value={`%${capacity.utilization}`} /><InspectorMetric label="Kullanılan" value={`${capacity.usedUnits}U`} /><InspectorMetric label="Boş" value={`${capacity.availableUnits}U`} /><InspectorMetric label="U atanmamış" value={capacity.unpositionedDevices} alert={capacity.unpositionedDevices > 0} /></div><div className="mt-5"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Cihazlar</h3><Badge variant="outline">{rack.devices?.length || 0}</Badge></div><div className="mt-3 space-y-1.5">{(rack.devices || []).map((device) => <div key={device.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-medium">{device.name}</p><p className="text-xs text-muted-foreground">{device.type.replace(/_/g, ' ')}</p></div><div className="text-right"><span className={cn('inline-block h-2 w-2 rounded-full', device.status === 'ACTIVE' ? 'bg-emerald-500' : device.status === 'MAINTENANCE' ? 'bg-amber-500' : 'bg-red-500')} /><p className="mt-1 text-xs text-muted-foreground">{device.rackUnitPosition ? `${device.rackUnitPosition}U` : 'U yok'}</p></div></div>)}{(rack.devices?.length || 0) === 0 && <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Bu kabinete cihaz eklenmemiş.</p>}</div></div></aside>;
}

function InspectorMetric({ label, value, alert }: { label: string; value: string | number; alert?: boolean }) { return <div className="border-b border-r border-border p-3 even:border-r-0"><p className="text-xs text-muted-foreground">{label}</p><p className={cn('mt-1 text-lg font-semibold', alert && 'text-amber-600 dark:text-amber-400')}>{value}</p></div>; }
