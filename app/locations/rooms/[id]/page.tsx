'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Box, Camera, ChevronDown, CircleCheck, Database, Focus, Grid2X2, Info, Layers3, Maximize2, Minimize2, MousePointer2, RefreshCw, Search, Server, Wrench, X } from 'lucide-react';
import { PageHeading, PageStateFrame } from '@/components/ui/page-heading';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { calculateRackCapacity, resolveRackDevices } from '@/lib/rack-capacity';
import type { CameraPreset } from '@/components/3d/Room3D';
import type { LocationRack, LocationRoom } from '@/components/locations/types';
import { usePageBreadcrumb } from '@/components/layout/BreadcrumbProvider';
import { uiError, uiLabel } from '@/lib/i18n/tr';
import { cn } from '@/lib/utils';
import styles from './page.module.css';

const Room3D = dynamic(() => import('@/components/3d/Room3D').then((module) => module.Room3D), { ssr: false, loading: () => <SceneLoading /> });
const FloorPlanView = dynamic(() => import('@/components/3d/FloorPlanView').then((module) => module.FloorPlanView), { ssr: false, loading: () => <SceneLoading /> });
type RoomDetail = LocationRoom & { floor?: { name: string; building?: { name: string } } };
const number = (value: number) => value.toLocaleString('tr-TR');

function SceneLoading() { return <div className={styles.sceneLoading} role="status"><RefreshCw className="h-5 w-5 animate-spin text-primary" aria-hidden="true" /><span>Oda yerleşimi hazırlanıyor…</span></div>; }

function RackStatus({ status }: { status: string }) { return status === 'OPERATIONAL' ? <Badge variant="success">Çalışıyor</Badge> : <StatusBadge status={status} />; }

export default function RoomLayoutPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const workspaceRef = useRef<HTMLDivElement>(null);
  const roomId = params.id as string;
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'3d' | 'plan'>('3d');
  const [displayMode, setDisplayMode] = useState<'operation' | 'capacity'>('operation');
  const [selectedRackId, setSelectedRackId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('isometric');
  const [cameraRequestKey, setCameraRequestKey] = useState(0);
  const [focusSelectedRack, setFocusSelectedRack] = useState(false);
  const [planEditMode, setPlanEditMode] = useState(false);
  const [rackListOpen, setRackListOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const loadRoom = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/rooms/${roomId}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(uiError(body.error || 'Oda bilgileri yüklenemedi'));
      setRoom(body.data);
      setSelectedRackId((current) => (body.data.racks || []).some((rack: LocationRack) => rack.id === current) ? current : null);
    } catch (loadError) {
      const message = uiError(loadError, 'Oda bilgileri yüklenemedi');
      if (silent) toast({ title: 'Oda bilgileri yenilenemedi', description: message, variant: 'destructive' });
      else setError(message);
    } finally { setLoading(false); setRefreshing(false); }
  }, [roomId, toast]);

  useEffect(() => { loadRoom(); }, [loadRoom]);
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === workspaceRef.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  const breadcrumbItems = useMemo(() => room ? [
    { label: 'Konumlar ve Odalar', href: '/locations' },
    { label: room.name },
    { label: 'Oda yerleşimi' },
  ] : null, [room]);
  usePageBreadcrumb(breadcrumbItems);

  const visibleRacks = useMemo(() => (room?.racks || []).filter((rack) => {
    const query = search.trim().toLocaleLowerCase('tr-TR');
    const matchesSearch = !query || rack.name.toLocaleLowerCase('tr-TR').includes(query) || rack.devices?.some((device) => device.name.toLocaleLowerCase('tr-TR').includes(query));
    return matchesSearch && (statusFilter === 'all' || rack.operationalStatus === statusFilter);
  }), [room?.racks, search, statusFilter]);
  const visibleRackIds = useMemo(() => new Set(visibleRacks.map((rack) => rack.id)), [visibleRacks]);
  useEffect(() => { if (selectedRackId && !visibleRackIds.has(selectedRackId)) setSelectedRackId(null); }, [selectedRackId, visibleRackIds]);
  const selectedRack = visibleRacks.find((rack) => rack.id === selectedRackId) || null;
  const rackNumbers = useMemo(() => new Map((room?.racks || []).map((rack, index) => [rack.id, index + 1])), [room?.racks]);
  const capacities = useMemo(() => new Map((room?.racks || []).map((rack) => [rack.id, calculateRackCapacity(rack.maxUnits, rack.devices || [])])), [room?.racks]);
  const totalCapacity = [...capacities.values()].reduce((total, capacity) => ({ used: total.used + capacity.usedUnits, available: total.available + capacity.availableUnits }), { used: 0, available: 0 });
  const deviceCount = (room?.racks || []).reduce((total, rack) => total + (rack.devices?.length || 0), 0);
  const hasFilters = Boolean(search) || statusFilter !== 'all';
  const clearFilters = () => { setSearch(''); setStatusFilter('all'); };
  const selectRack = (id: string) => { setSelectedRackId(id || null); setFocusSelectedRack(true); setCameraRequestKey((key) => key + 1); };
  const requestCamera = (preset: CameraPreset) => { setFocusSelectedRack(false); setCameraPreset(preset); setCameraRequestKey((key) => key + 1); };
  const toggleFullscreen = async () => {
    try { if (!document.fullscreenElement) await workspaceRef.current?.requestFullscreen(); else await document.exitFullscreen(); }
    catch { toast({ title: 'Tam ekran açılamadı', description: 'Tarayıcınızın tam ekran iznini kontrol edin.', variant: 'destructive' }); }
  };

  if (loading) return <PageStateFrame section="rooms" title="Oda Yerleşimi"><div className="h-96"><SceneLoading /></div></PageStateFrame>;
  if (error || !room) return <PageStateFrame section="rooms" title="Oda Yerleşimi"><div className={styles.error} role="alert"><AlertTriangle size={28} className="text-destructive" /><h2>Oda bilgileri yüklenemedi</h2><p>{error || 'Oda bulunamadı'}</p><div className="flex flex-wrap justify-center gap-2"><Button variant="outline" onClick={() => router.push('/locations')}><ArrowLeft size={16} />Konumlara dön</Button><Button onClick={() => loadRoom()}><RefreshCw size={16} />Tekrar dene</Button></div></div></PageStateFrame>;

  const racks = room.racks || [];
  const dimensions = room.width && room.depth ? `${number(room.width)} × ${number(room.depth)}${room.height ? ` × ${number(room.height)}` : ''} m` : 'Oda ölçüleri eklenmemiş';
  const missingDimensions = !room.width || !room.depth || !room.height;
  const autoPositions = racks.filter((rack) => !Number.isFinite(rack.coordX) || !Number.isFinite(rack.coordZ)).length;
  const renderScene = (mode: '3d' | 'plan') => <div className={styles.sceneBody}>
    {mode === '3d' ? <Room3D room={room} selectedRackId={selectedRackId} onRackClick={selectRack} visibleRackIds={visibleRackIds} displayMode={displayMode} cameraPreset={cameraPreset} cameraRequestKey={cameraRequestKey} focusSelectedRack={focusSelectedRack} /> : <FloorPlanView room={room} onUpdate={() => loadRoom(true)} selectedRackId={selectedRackId} onRackClick={selectRack} visibleRackIds={visibleRackIds} editMode={planEditMode} />}
    {visibleRacks.length === 0 && <div className={styles.sceneEmpty}><Database size={26} aria-hidden="true" /><strong>{racks.length === 0 ? 'Bu odada kabinet yok' : 'Filtreye uygun kabinet yok'}</strong><p>{racks.length === 0 ? 'Konumlar sayfasından bu odaya kabinet ekleyebilirsiniz.' : 'Diğer kabinetleri görmek için filtreleri temizleyin.'}</p>{hasFilters ? <Button variant="outline" size="sm" onClick={clearFilters}>Filtreleri temizle</Button> : <Button variant="outline" size="sm" onClick={() => router.push('/locations')}>Konumlara dön</Button>}</div>}
  </div>;

  return <div ref={workspaceRef} className={styles.page}>
    <header className={styles.header}>
      <div className={styles.identity}><span className={styles.eyebrow}>Oda yerleşimi</span><PageHeading section="rooms" compact description={[room.floor?.building?.name, room.floor?.name, dimensions].filter(Boolean).join(' · ')}>{room.name}</PageHeading></div>
      <div className={styles.headerActions}><Button variant="outline" size="sm" onClick={() => router.push('/locations')}><ArrowLeft size={16} />Konumlar</Button><Button variant="outline" size="icon" onClick={() => loadRoom(true)} disabled={refreshing || planEditMode} aria-label="Oda bilgilerini yenile" title="Yenile"><RefreshCw size={16} className={cn(refreshing && 'animate-spin')} /></Button><Button variant="outline" size="icon" onClick={toggleFullscreen} aria-label={fullscreen ? 'Tam ekrandan çık' : 'Tam ekran aç'} title={fullscreen ? 'Tam ekrandan çık' : 'Tam ekran'}>{fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</Button></div>
    </header>
    <section className={styles.summary} aria-label="Oda özeti"><SummaryItem icon={<Database size={17} />} label="Kabinet" value={number(racks.length)} /><SummaryItem icon={<Server size={17} />} label="Cihaz" value={number(deviceCount)} /><SummaryItem icon={<Layers3 size={17} />} label="Kullanılan kapasite" value={`${number(totalCapacity.used)} U`} /><SummaryItem icon={<Grid2X2 size={17} />} label="Boş kapasite" value={`${number(totalCapacity.available)} U`} /></section>
    <Tabs value={view} onValueChange={(value) => { setView(value as '3d' | 'plan'); setPlanEditMode(false); }} className={styles.viewRoot}>
      <div className={styles.viewBar}>
        <TabsList aria-label="Oda görünümü" className={styles.viewTabs}><TabsTrigger value="3d"><Box size={18} /><span>3B görünüm<small>Odayı farklı açılardan inceleyin</small></span></TabsTrigger><TabsTrigger value="plan"><Grid2X2 size={18} /><span>Oda planı<small>Üstten görün ve yerleşimi düzenleyin</small></span></TabsTrigger></TabsList>
        <p className={styles.viewHint}><MousePointer2 size={16} aria-hidden="true" />Detayları görmek için bir kabinet seçin.</p>
      </div>
      <div className={styles.workspace}>
        <aside className={styles.rackBrowser} aria-label="Odadaki kabinetler">
          <div className={styles.panelHeading}><span><Database size={17} aria-hidden="true" />Kabinetler</span><Badge icon={null} variant="outline">{visibleRacks.length}/{racks.length}</Badge></div>
          <div className={styles.filters}><div className={styles.search}><Search size={16} aria-hidden="true" /><Input aria-label="Kabinet veya cihaz ara" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Kabinet veya cihaz ara…" className="pl-9" /></div><select aria-label="Kabinet durumu" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={styles.select}><option value="all">Tüm durumlar</option><option value="OPERATIONAL">Çalışıyor</option><option value="MAINTENANCE">Bakımda</option><option value="DECOMMISSIONED">Devre dışı</option></select>{hasFilters && <Button variant="ghost" size="sm" onClick={clearFilters}><X size={14} />Filtreleri temizle</Button>}</div>
          <div className={styles.mobileSelection}><label htmlFor="room-rack-selection">Kabinet seçin</label><select id="room-rack-selection" className={styles.select} value={selectedRackId || ''} onChange={(event) => selectRack(event.target.value)}><option value="">Kabinet seçilmedi</option>{visibleRacks.map((rack) => <option key={rack.id} value={rack.id}>#{rackNumbers.get(rack.id)} · {rack.name}</option>)}</select><p className={styles.mobileDetailHint}>Kabinet ayrıntıları görünümün altında yer alır.</p><button className={styles.listToggle} aria-expanded={rackListOpen} aria-controls="room-rack-list" onClick={() => setRackListOpen(!rackListOpen)}>Kabinet listesini {rackListOpen ? 'gizle' : 'göster'}<ChevronDown size={15} /></button></div>
          <div id="room-rack-list" className={cn(styles.rackList, rackListOpen && styles.rackListOpen)}>{visibleRacks.map((rack) => { const capacity = capacities.get(rack.id)!; return <button key={rack.id} type="button" aria-pressed={rack.id === selectedRackId} aria-label={`${rack.name} detaylarını göster`} className={cn(styles.rackButton, rack.id === selectedRackId && styles.rackSelected)} onClick={() => selectRack(rack.id)}><div className={styles.rackName}><span className={styles.rackNumber}>#{rackNumbers.get(rack.id)}</span><strong>{rack.name}</strong></div><RackStatus status={rack.operationalStatus} /><div className={styles.rackMeta}><span>{rack.devices?.length || 0} cihaz</span><span>%{number(capacity.utilization)} dolu</span></div><div className={styles.progress} aria-hidden="true"><span style={{ width: `${capacity.utilization}%` }} /></div></button>; })}{visibleRacks.length === 0 && <p className={styles.noRacks}>Gösterilecek kabinet yok.</p>}</div>
        </aside>

        <section className={styles.scene} aria-label="Oda yerleşim alanı">
          <div className={styles.sceneToolbar}>
            {view === '3d' ? <><div className={styles.controlGroup}><span>Renklendirme</span><div role="group" aria-label="3B renklendirme"><Button size="sm" variant={displayMode === 'operation' ? 'secondary' : 'ghost'} aria-pressed={displayMode === 'operation'} onClick={() => setDisplayMode('operation')}><CircleCheck size={15} />Çalışma durumu</Button><Button size="sm" variant={displayMode === 'capacity' ? 'secondary' : 'ghost'} aria-pressed={displayMode === 'capacity'} onClick={() => setDisplayMode('capacity')}><Layers3 size={15} />Doluluk</Button></div></div><div className={styles.cameraGroup}><label htmlFor="room-camera"><Camera size={14} />Kamera açısı</label><select id="room-camera" value={cameraPreset} className={styles.select} onChange={(event) => requestCamera(event.target.value as CameraPreset)}><option value="isometric">Genel görünüm</option><option value="front">Önden</option><option value="top">Üstten</option></select><Button variant="ghost" size="icon" onClick={() => requestCamera('isometric')} aria-label="Genel görünüme dön" title="Genel görünüme dön"><RefreshCw size={15} /></Button>{selectedRack && <Button variant="ghost" size="icon" onClick={() => selectRack(selectedRack.id)} aria-label="Seçili kabinete odaklan" title="Seçili kabinete odaklan"><Focus size={16} /></Button>}</div></> : <><div><h2 className={styles.planTitle}>Üstten oda planı</h2><p className={styles.smallText}>Kabinetlerin oda içindeki konumlarını inceleyin.</p></div><Button variant={planEditMode ? 'default' : 'outline'} size="sm" disabled={racks.length === 0} aria-pressed={planEditMode} onClick={() => setPlanEditMode(!planEditMode)}>{planEditMode ? <CircleCheck size={15} /> : <Wrench size={15} />}{planEditMode ? 'Düzenlemeyi bitir' : 'Yerleşimi düzenle'}</Button></>}
          </div>
          {planEditMode && <p className={styles.editNotice} role="status"><Wrench size={16} aria-hidden="true" />Kabineti sürükleyerek taşıyın. Bıraktığınızda konumu otomatik kaydedilir; adım aralığı 25 cm.</p>}
          <TabsContent value="3d" className={styles.sceneContent}>{renderScene('3d')}</TabsContent><TabsContent value="plan" className={styles.sceneContent}>{renderScene('plan')}</TabsContent>
          <div className={styles.legend} aria-label="Görünüm açıklaması">{view === '3d' && displayMode === 'capacity' ? <><span><i className={styles.green} />%0–64 dolu</span><span><i className={styles.amber} />%65–84 dolu</span><span><i className={styles.red} />%85 ve üzeri dolu</span></> : <><span><i className={styles.green} />Çalışıyor</span><span><i className={styles.amber} />Bakımda</span><span><i className={styles.gray} />Devre dışı / diğer</span></>}{autoPositions > 0 && <span title="Oda içi konumu henüz kaydedilmemiş kabinetler"><i className={styles.auto} />Otomatik konum</span>}</div>
          <p className={styles.instructions}><MousePointer2 size={15} aria-hidden="true" />{view === '3d' ? 'Sürükleyerek döndürün, tekerlekle yakınlaştırın. Dokunmatik ekranda iki parmakla yakınlaştırabilirsiniz.' : planEditMode ? 'Kabinetler oda sınırları içinde ve birbirleriyle çakışmadan taşınabilir.' : 'Plandaki numaralar kabinet listesindeki numaralardır. Boş alanı sürükleyerek kaydırın; + / − ile yakınlaştırın.'}</p>
        </section>
        <RackInspector rack={selectedRack} onClose={() => setSelectedRackId(null)} />
      </div>
    </Tabs>
    {(missingDimensions || autoPositions > 0) && <div className={styles.layoutNote}><Info size={17} aria-hidden="true" /><div>{missingDimensions && <p>Eksik oda ölçülerinde görselleştirme için varsayılan boyutlar kullanılır: genişlik {number(Math.max(2, room.width || 10))} m, derinlik {number(Math.max(2, room.depth || 8))} m, yükseklik {number(Math.max(2.2, room.height || 3))} m.</p>}{autoPositions > 0 && <p>{autoPositions} kabinetin oda içi konumu otomatik gösteriliyor. Oda planında yerleşimi düzenleyerek gerçek konumunu kaydedebilirsiniz.</p>}</div></div>}
  </div>;
}

function SummaryItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) { return <div><span className={styles.summaryIcon} aria-hidden="true">{icon}</span><div><p>{label}</p><strong>{value}</strong></div></div>; }

function RackInspector({ rack, onClose }: { rack: LocationRack | null; onClose: () => void }) {
  if (!rack) return <aside className={styles.inspector} aria-label="Kabinet detayları"><div className={styles.panelHeading}><span><Info size={17} aria-hidden="true" />Kabinet detayları</span></div><div className={styles.inspectorEmpty}><span className={styles.emptyIcon}><Database size={27} aria-hidden="true" /></span><h2>Bir kabinet seçin</h2><p>Listeden, 3B görünümden veya oda planından bir kabinet seçerek ayrıntılarını inceleyin.</p><div><Layers3 size={16} />Kullanılan ve boş kapasite</div><div><Server size={16} />Cihazlar ve kabinet içi konumları</div></div></aside>;
  const capacity = calculateRackCapacity(rack.maxUnits, rack.devices || []);
  const devices = resolveRackDevices(rack.maxUnits, rack.devices || []).sort((a, b) => (b.device.rackUnitPosition || 0) - (a.device.rackUnitPosition || 0));
  return <aside className={styles.inspector} aria-label="Kabinet detayları">
    <div className={styles.panelHeading}><span><Database size={17} aria-hidden="true" />Kabinet detayları</span><Button variant="ghost" size="icon" onClick={onClose} aria-label="Kabinet seçimini temizle"><X size={16} /></Button></div>
    <div className={styles.inspectorContent}><div className={styles.inspectorIdentity}><h2>{rack.name}</h2><p>{uiLabel(rack.type)} · {number(capacity.totalUnits)} U</p><RackStatus status={rack.operationalStatus} /></div>
      <section className={styles.capacity} aria-label="Kabinet kapasitesi"><div className={styles.capacityHeading}><h3>Doluluk</h3><strong>%{number(capacity.utilization)}</strong></div><div className={styles.progress} role="progressbar" aria-label="Kabinet doluluğu" aria-valuenow={capacity.utilization} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${capacity.utilization}%` }} /></div><div className={styles.capacityMetrics}><InspectorMetric label="Kullanılan" value={`${number(capacity.usedUnits)} U`} /><InspectorMetric label="Boş" value={`${number(capacity.availableUnits)} U`} /></div><p className={styles.smallText}>U, kabinet içindeki yükseklik birimidir. 1 U ≈ 4,45 cm.</p></section>
      {(capacity.unpositionedDevices > 0 || capacity.conflictDevices > 0) && <div className={styles.capacityNotice}><AlertTriangle size={16} aria-hidden="true" /><div>{capacity.unpositionedDevices > 0 && <p>{capacity.unpositionedDevices} cihazın kabinet içi yeri atanmamış. Doluluk hesabında otomatik yerleştirilir; kayıtlı konumu değişmez.</p>}{capacity.conflictDevices > 0 && <p>{capacity.conflictDevices} cihazda konum çakışması veya kapasite aşımı var.</p>}</div></div>}
      <section aria-label="Kabinet cihazları"><div className={styles.devicesHeading}><h3>Cihazlar</h3><Badge icon={null} variant="secondary">{devices.length}</Badge></div><div className={styles.deviceList}>{devices.map(({ device, unitHeight, hasConflict }) => <div key={device.id} className={styles.device}><div className={styles.deviceHeading}><Server size={15} aria-hidden="true" /><h4>{device.name}</h4></div><p>{uiLabel(device.type)}</p><div className={styles.deviceMeta}><StatusBadge status={device.status} /><span>{device.rackUnitPosition ? unitHeight > 1 ? `U ${device.rackUnitPosition}–${device.rackUnitPosition + unitHeight - 1}` : `U ${device.rackUnitPosition}` : 'Konum atanmamış'}</span></div>{hasConflict && <Badge variant="warning">Konumu kontrol edin</Badge>}</div>)}{devices.length === 0 && <div className={styles.deviceEmpty}><Server size={23} aria-hidden="true" /><strong>Henüz cihaz eklenmemiş</strong><p>Bu kabinetin cihazları eklendiğinde burada listelenir.</p></div>}</div></section>
    </div>
  </aside>;
}

function InspectorMetric({ label, value }: { label: string; value: string }) { return <div><p>{label}</p><strong>{value}</strong></div>; }
