'use client';

import { uiError, uiLabel } from '@/lib/i18n/tr';

import { ActionIcon } from '@/components/ui/action-icon';
import { PageHeading } from '@/components/ui/page-heading';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Building2, ChevronDown, ChevronRight, Cuboid, Database, Edit3, Layers3, MapPin, MoreHorizontal, Plus, RefreshCw, Search, Server, SlidersHorizontal, Trash2, X } from 'lucide-react';
import styles from './page.module.css';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useToast } from '@/components/ui/use-toast';
import type {
  LocationBuilding,
  LocationDevice,
  LocationFloor,
  LocationOrganization,
  LocationRack,
  LocationRoom,
  LocationsSummary,
  RoomPortfolioSummary,
} from '@/components/locations/types';
import type { ApiResponse } from '@/types';
import { cn } from '@/lib/utils';

type EntityType = 'org' | 'building' | 'floor' | 'room' | 'rack' | 'device';
type Scope = { type: 'all' | 'org' | 'building' | 'floor' | 'room'; id?: string; label: string };
type EditableEntity = LocationOrganization | LocationBuilding | LocationFloor | LocationRoom | LocationRack | LocationDevice;
type EditorState = ({ mode: 'add'; type: EntityType; parentId?: string; item?: EditableEntity } | { mode: 'edit'; type: EntityType; item: EditableEntity }) | null;
type TreeControls = EntityControls & { expanded: Set<string>; toggle: (id: string) => void; scope: Scope; setScope: (scope: Scope) => void; setSelectedRoomId: (id: string | null) => void };

const EMPTY_SUMMARY: LocationsSummary = {
  totals: { organizations: 0, buildings: 0, rooms: 0, racks: 0, devices: 0, problemDevices: 0, unpositionedDevices: 0, totalUnits: 0, usedUnits: 0, utilization: 0 },
  rooms: [],
};

const STATUS_LABELS = {
  HEALTHY: 'Sağlıklı',
  PLANNING: 'Yerleşim gerekli',
  ATTENTION: 'Dikkat gerekiyor',
};

export default function LocationsPage() {
  const { toast } = useToast();
  const [organizations, setOrganizations] = useState<LocationOrganization[]>([]);
  const [summary, setSummary] = useState<LocationsSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [scope, setScope] = useState<Scope>({ type: 'all', label: 'Tüm odalar' });
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: EntityType; id: string; name: string } | null>(null);

  const loadData = useCallback(async (silent = false) => {
    try {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const [organizationsResponse, summaryResponse]: [ApiResponse<LocationOrganization[]> & { data: LocationOrganization[] }, ApiResponse<LocationsSummary> & { data: LocationsSummary }] = await Promise.all([
        apiGet('/api/organizations?fresh=1'),
        apiGet('/api/locations/summary'),
      ]);
      if (!organizationsResponse.success || !summaryResponse.success) throw new Error(uiError('Konum bilgileri yüklenemedi'));
      setOrganizations(organizationsResponse.data);
      setSummary(summaryResponse.data);
      setExpanded((current) => {
        if (current.size > 0 || organizationsResponse.data.length === 0) return current;
        const firstOrg = organizationsResponse.data[0];
        const firstBuilding = firstOrg.buildings?.[0];
        const firstFloor = firstBuilding?.floors?.[0];
        return new Set([firstOrg.id, firstBuilding?.id, firstFloor?.id].filter((id): id is string => Boolean(id)));
      });
    } catch (loadError) {
      setError(uiError(loadError instanceof Error ? loadError.message : 'Konum bilgileri yüklenemedi'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredRooms = useMemo(() => summary.rooms.filter((room) => {
    const matchesScope = scope.type === 'all'
      || (scope.type === 'org' && room.floor.building.organization.id === scope.id)
      || (scope.type === 'building' && room.floor.building.id === scope.id)
      || (scope.type === 'floor' && room.floor.id === scope.id)
      || (scope.type === 'room' && room.id === scope.id);
    const haystack = `${room.name} ${room.floor.name} ${room.floor.building.name} ${room.floor.building.organization.name} ${room.racks.map((rack) => rack.name).join(' ')}`.toLocaleLowerCase('tr-TR');
    const matchesSearch = !search.trim() || haystack.includes(search.trim().toLocaleLowerCase('tr-TR'));
    const matchesStatus = statusFilter === 'all' || room.status === statusFilter;
    return matchesScope && matchesSearch && matchesStatus;
  }), [scope, search, statusFilter, summary.rooms]);

  const hasFilters = scope.type !== 'all' || Boolean(search) || statusFilter !== 'all';
  const clearFilters = () => { setScope({ type: 'all', label: 'Tüm odalar' }); setSearch(''); setStatusFilter('all'); setSelectedRoomId(null); };
  const toggle = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const mutateEntity = async (values: Record<string, unknown>) => {
    if (!editor) return;
    const endpointByType = { org: 'organizations', building: 'buildings', floor: 'floors', room: 'rooms', rack: 'racks', device: 'devices' };
    const payload = { ...values } as Record<string, unknown>;
    if (editor.mode === 'add') {
      const parentKey = ({ building: 'organizationId', floor: 'buildingId', room: 'floorId', rack: 'roomId', device: 'rackId' } as Partial<Record<EntityType, string>>)[editor.type];
      if (parentKey) payload[parentKey] = editor.parentId;
    }
    const endpoint = `/api/${endpointByType[editor.type]}${editor.mode === 'edit' ? `/${editor.item.id}` : ''}`;
    const response: ApiResponse<unknown> = editor.mode === 'edit' ? await apiPut(endpoint, payload) : await apiPost(endpoint, payload);
    if (!response.success) throw new Error(uiError(response.error || 'İşlem tamamlanamadı'));
    setEditor(null);
    await loadData(true);
    toast({ title: 'Kaydedildi', description: 'Fiziksel altyapı kaydı güncellendi.' });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const endpointByType = { org: 'organizations', building: 'buildings', floor: 'floors', room: 'rooms', rack: 'racks', device: 'devices' };
    try {
      const response: ApiResponse<unknown> = await apiDelete(`/api/${endpointByType[deleteTarget.type]}/${deleteTarget.id}`);
      if (!response.success) throw new Error(uiError(response.error || 'Silme işlemi tamamlanamadı'));
      if (selectedRoomId === deleteTarget.id) setSelectedRoomId(null);
      await loadData(true);
      toast({ title: 'Silindi', description: `${deleteTarget.name} kaldırıldı.` });
    } catch (deleteError) {
      toast({ title: 'Silinemedi', description: deleteError instanceof Error ? deleteError.message : 'Silme işlemi başarısız', variant: 'destructive' });
    } finally {
      setDeleteTarget(null);
    }
  };

  const metrics = [
    { label: 'Sistem odası', value: summary.totals.rooms, icon: Building2 },
    { label: 'Kabinet', value: summary.totals.racks, icon: Database },
    { label: 'Cihaz', value: summary.totals.devices, icon: Server },
    { label: 'Sorunlu cihaz', value: summary.totals.problemDevices, icon: AlertTriangle },
  ];

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <PageHeading section="locations" compact showIcon={false} className="text-base sm:text-lg">Konumlar ve Sistem Odaları</PageHeading>
        <div className={styles.headerActions}>
          <Button size="sm" variant="outline" onClick={() => loadData(true)} disabled={refreshing || loading}>
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} aria-hidden="true" />Yenile
          </Button>
          <Button size="sm" onClick={() => setEditor({ mode: 'add', type: 'org' })}><Plus className="h-4 w-4" aria-hidden="true" />Organizasyon ekle</Button>
        </div>
      </header>

      <section className={styles.metrics} aria-label="Konum özeti" aria-busy={loading}>
        {metrics.map(({ label, value, icon: Icon }) => (
          <div key={label} className={styles.summaryCard}>
            <span className={cn(styles.summaryIcon, label === 'Sorunlu cihaz' && value > 0 && styles.danger)}><Icon size={15} aria-hidden="true" /></span>
            <div className="min-w-0"><p className={styles.metricLabel}>{label}</p><p className={styles.metricValue}>{loading || error ? '—' : value.toLocaleString('tr-TR')}</p></div>
          </div>
        ))}
      </section>

      {loading ? (
        <div className={styles.pageState} role="status"><RefreshCw className="h-6 w-6 animate-spin text-primary" /><p>Konum bilgileri yükleniyor…</p></div>
      ) : error ? (
        <div className={styles.pageState} role="alert"><AlertTriangle className="h-7 w-7 text-destructive" /><h2 className="font-semibold">Konumlar yüklenemedi</h2><p className="text-sm text-muted-foreground">{uiError(error)}</p><Button onClick={() => loadData()}><ActionIcon action="refresh" />Tekrar dene</Button></div>
      ) : (
        <div className={styles.workspace}>
          <aside className={styles.explorer} aria-label="Konuma göre filtrele">
            <div className={styles.explorerHeading}><MapPin size={16} aria-hidden="true" /><h2>Konumlar</h2></div>
            <button className={styles.mobileExplorerToggle} aria-expanded={explorerOpen} aria-controls="location-explorer" onClick={() => setExplorerOpen(!explorerOpen)}><SlidersHorizontal size={16} aria-hidden="true" />Konum seçimi<ChevronDown size={16} aria-hidden="true" /></button>
            <div id="location-explorer" className={cn(styles.explorerBody, explorerOpen && styles.explorerOpen)}>
              <button className={cn(styles.allLocations, scope.type === 'all' && styles.allLocationsActive)} aria-pressed={scope.type === 'all'} onClick={() => { setScope({ type: 'all', label: 'Tüm odalar' }); setSelectedRoomId(null); }}><Building2 size={16} aria-hidden="true" /><span>Tüm konumlar</span></button>
              <nav className={styles.tree} aria-label="Organizasyon, bina, kat ve odalar">
                {organizations.map((org) => <TreeOrganization key={org.id} org={org} expanded={expanded} toggle={toggle} scope={scope} setScope={setScope} setSelectedRoomId={setSelectedRoomId} setEditor={setEditor} setDeleteTarget={setDeleteTarget} />)}
              </nav>
              {organizations.length === 0 && <p className="px-3 py-5 text-sm text-muted-foreground">Henüz konum eklenmemiş. Organizasyon ekleyerek başlayın.</p>}
            </div>
          </aside>

          <section className={styles.rooms} aria-labelledby="rooms-heading">
            <div className={styles.listHeading}>
              <h2 id="rooms-heading">{scope.label}</h2><p aria-live="polite">{filteredRooms.length} / {summary.rooms.length} oda</p>
            </div>
            <div className={styles.toolbar}>
              <div className={styles.search}><Search size={17} aria-hidden="true" /><Input aria-label="Oda, bina veya kabinet ara" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Oda, bina veya kabinet ara…" className="pl-10" /></div>
              <select aria-label="Oda durumu" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={styles.select}>
                <option value="all">Tüm durumlar</option><option value="HEALTHY">Sağlıklı</option><option value="PLANNING">Yerleşim gerekli</option><option value="ATTENTION">Dikkat gerekiyor</option>
              </select>
              {hasFilters && <Button variant="ghost" size="sm" onClick={clearFilters}><X size={15} aria-hidden="true" />Temizle</Button>}
            </div>

            <div className={styles.roomList}>
              {filteredRooms.length === 0 ? (
                <div className={styles.emptyState}><Cuboid className="h-9 w-9 text-primary" aria-hidden="true" /><h3>{summary.rooms.length === 0 ? 'Henüz sistem odası eklenmemiş' : 'Aramanıza uygun oda bulunamadı'}</h3><p>{summary.rooms.length === 0 ? 'Konumlar bölümünden organizasyon, bina ve kat ekleyin. Ardından katın menüsünden oda oluşturun.' : 'Arama metnini, seçili konumu veya durum filtresini değiştirebilirsiniz.'}</p>{hasFilters && <Button variant="outline" onClick={clearFilters}><X size={16} aria-hidden="true" />Filtreleri temizle</Button>}</div>
              ) : filteredRooms.map((room) => (
                <RoomRow key={room.id} room={room} selected={selectedRoomId === room.id} onSelect={() => setSelectedRoomId(selectedRoomId === room.id ? null : room.id)} setEditor={setEditor} setDeleteTarget={setDeleteTarget} />
              ))}
            </div>
          </section>
        </div>
      )}

      <EntityDialog state={editor} onClose={() => setEditor(null)} onSubmit={mutateEntity} />
      <ConfirmDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)} title="Kaydı sil" description={`${deleteTarget?.name || 'Bu kayıt'} silinsin mi? Bağlı kayıtlar varsa işlem engellenebilir.`} onConfirm={confirmDelete} variant="destructive" confirmText="Sil" />
    </main>
  );
}

function EntityMenu({ onEdit, onDelete, onAdd, addLabel, name }: { name?: string; onEdit: () => void; onDelete: () => void; onAdd?: () => void; addLabel?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 opacity-70" aria-label={`${name || 'Konum kaydı'}: işlemler`}><MoreHorizontal className="h-4 w-4" /></Button></PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-1">
        {onAdd && <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onAdd}><Plus className="mr-2 h-4 w-4" />{addLabel}</Button>}
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onEdit}><Edit3 className="mr-2 h-4 w-4" />Düzenle</Button>
        <Button variant="ghost" size="sm" className="w-full justify-start text-destructive hover:text-destructive" onClick={onDelete}><Trash2 className="mr-2 h-4 w-4" />Sil</Button>
      </PopoverContent>
    </Popover>
  );
}

function TreeOrganization({ org, expanded, toggle, scope, setScope, setSelectedRoomId, setEditor, setDeleteTarget }: TreeControls & { org: LocationOrganization }) {
  const open = expanded.has(org.id);
  return <div><TreeLine depth={0} label={org.name} meta={org.code} open={open} selected={scope.type === 'org' && scope.id === org.id} onToggle={() => toggle(org.id)} onSelect={() => { setScope({ type: 'org', id: org.id, label: org.name }); setSelectedRoomId(null); }} menu={<EntityMenu name={org.name} onAdd={() => setEditor({ mode: 'add', type: 'building', parentId: org.id })} addLabel="Bina ekle" onEdit={() => setEditor({ mode: 'edit', type: 'org', item: org })} onDelete={() => setDeleteTarget({ type: 'org', id: org.id, name: org.name })} />} />{open && org.buildings?.map((building: LocationBuilding) => <TreeBuilding key={building.id} building={building} {...{ expanded, toggle, scope, setScope, setSelectedRoomId, setEditor, setDeleteTarget }} />)}</div>;
}

function TreeBuilding({ building, expanded, toggle, scope, setScope, setSelectedRoomId, setEditor, setDeleteTarget }: TreeControls & { building: LocationBuilding }) {
  const open = expanded.has(building.id);
  return <div><TreeLine depth={1} label={building.name} meta={building.city} open={open} selected={scope.type === 'building' && scope.id === building.id} onToggle={() => toggle(building.id)} onSelect={() => { setScope({ type: 'building', id: building.id, label: building.name }); setSelectedRoomId(null); }} menu={<EntityMenu name={building.name} onAdd={() => setEditor({ mode: 'add', type: 'floor', parentId: building.id })} addLabel="Kat ekle" onEdit={() => setEditor({ mode: 'edit', type: 'building', item: building })} onDelete={() => setDeleteTarget({ type: 'building', id: building.id, name: building.name })} />} />{open && building.floors?.map((floor: LocationFloor) => <TreeFloor key={floor.id} floor={floor} {...{ expanded, toggle, scope, setScope, setSelectedRoomId, setEditor, setDeleteTarget }} />)}</div>;
}

function TreeFloor({ floor, expanded, toggle, scope, setScope, setSelectedRoomId, setEditor, setDeleteTarget }: TreeControls & { floor: LocationFloor }) {
  const open = expanded.has(floor.id);
  return <div><TreeLine depth={2} label={floor.name} meta={`Kat ${floor.floorNumber}`} open={open} selected={scope.type === 'floor' && scope.id === floor.id} onToggle={() => toggle(floor.id)} onSelect={() => { setScope({ type: 'floor', id: floor.id, label: floor.name }); setSelectedRoomId(null); }} menu={<EntityMenu name={floor.name} onAdd={() => setEditor({ mode: 'add', type: 'room', parentId: floor.id })} addLabel="Oda ekle" onEdit={() => setEditor({ mode: 'edit', type: 'floor', item: floor })} onDelete={() => setDeleteTarget({ type: 'floor', id: floor.id, name: floor.name })} />} />{open && floor.rooms?.map((room: LocationRoom) => <TreeLine key={room.id} depth={3} label={room.name} meta="Sistem odası" selected={scope.type === 'room' && scope.id === room.id} onSelect={() => { setScope({ type: 'room', id: room.id, label: room.name }); setSelectedRoomId(room.id); }} menu={<EntityMenu name={room.name} onAdd={() => setEditor({ mode: 'add', type: 'rack', parentId: room.id })} addLabel="Kabinet ekle" onEdit={() => setEditor({ mode: 'edit', type: 'room', item: room })} onDelete={() => setDeleteTarget({ type: 'room', id: room.id, name: room.name })} />} />)}</div>;
}

function TreeLine({ depth, label, meta, open, selected, onToggle, onSelect, menu }: { depth: number; label: string; meta?: string | null; open?: boolean; selected?: boolean; onToggle?: () => void; onSelect: () => void; menu?: React.ReactNode }) {
  const Icon = depth === 0 ? Building2 : depth === 1 ? MapPin : depth === 2 ? Layers3 : Cuboid;
  return <div className={cn('group flex min-w-0 items-center rounded-lg pr-1 hover:bg-muted/60', selected && 'bg-primary/10 text-primary')} style={{ paddingLeft: `${depth * 10}px` }}>
    {onToggle ? <button type="button" onClick={onToggle} className="flex h-9 w-6 shrink-0 items-center justify-center rounded text-muted-foreground" aria-expanded={open} aria-label={`${label}: alt konumları ${open ? 'gizle' : 'göster'}`}>{open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}</button> : <span className="w-6 shrink-0" />}
    <button type="button" onClick={onSelect} aria-pressed={Boolean(selected)} className="flex min-w-0 flex-1 items-start gap-2 rounded py-2 text-left" title={label}><Icon size={15} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="min-w-0"><span className="block truncate text-xs font-semibold">{label}</span>{meta && <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{meta}</span>}</span></button>{menu}
  </div>;
}

function RoomRow({ room, selected, onSelect, setEditor, setDeleteTarget }: { room: RoomPortfolioSummary; selected: boolean; onSelect: () => void } & EntityControls) {
  const statusTone = room.status === 'HEALTHY' ? 'success' : room.status === 'ATTENTION' ? 'destructive' : 'warning';
  const dimensions = room.width && room.depth ? `${room.width.toLocaleString('tr-TR')} × ${room.depth.toLocaleString('tr-TR')}${room.height ? ` × ${room.height.toLocaleString('tr-TR')}` : ''} m` : 'Oda ölçüleri eklenmemiş';
  const locationPath = [...new Set([room.floor.building.organization.name, room.floor.building.name, room.floor.name])].join(' / ');
  return <article className={cn(styles.roomCard, selected && styles.roomSelected)} aria-label={room.name}>
    <div className={styles.roomHeader}>
      <span className={styles.summaryIcon}><Cuboid size={16} aria-hidden="true" /></span>
      <div className={styles.roomIdentity}><div className={styles.roomTitle}><h3>{room.name}</h3><Badge variant={statusTone}>{STATUS_LABELS[room.status]}</Badge></div><div className={styles.roomMeta}><p className={styles.roomPath}>{locationPath}</p><p className={styles.roomDimensions}>{dimensions}</p></div></div>
      <EntityMenu name={room.name} onAdd={() => setEditor({ mode: 'add', type: 'rack', parentId: room.id })} addLabel="Kabinet ekle" onEdit={() => setEditor({ mode: 'edit', type: 'room', item: room })} onDelete={() => setDeleteTarget({ type: 'room', id: room.id, name: room.name })} />
    </div>
    <div className={styles.roomMetrics}><Metric label="Kabinet" value={room.rackCount} /><Metric label="Cihaz" value={room.deviceCount} /><Metric label="Doluluk" value={`%${room.utilization.toLocaleString('tr-TR')}`} /><Metric label="Sorunlu cihaz" value={room.problemDeviceCount} alert={room.problemDeviceCount > 0} /></div>
    {room.unpositionedDeviceCount > 0 && <p className={styles.roomNotice}><Layers3 size={14} aria-hidden="true" />{room.unpositionedDeviceCount} cihazın kabinet içi yeri atanmamış.</p>}
    <div className={styles.roomFooter}>
      <Button variant="ghost" size="sm" aria-label={`${room.name}: kabinet ${selected ? 'listesini kapat' : 've kapasite bilgilerini göster'}`} aria-expanded={selected} aria-controls={`room-racks-${room.id}`} onClick={onSelect}><Database size={15} aria-hidden="true" />Kabinetler<ChevronDown size={14} className={cn('transition-transform', selected && 'rotate-180')} aria-hidden="true" /></Button>
      <Button size="sm" variant="outline" asChild><Link href={`/locations/rooms/${room.id}`} aria-label={`${room.name}: oda yerleşimini aç`}><Cuboid size={16} aria-hidden="true" />Oda yerleşimini aç<ChevronRight size={14} aria-hidden="true" /></Link></Button>
    </div>
    <div id={`room-racks-${room.id}`} hidden={!selected}>{selected && <RoomRackSection room={room} setEditor={setEditor} setDeleteTarget={setDeleteTarget} />}</div>
  </article>;
}

type EntityControls = {
  setEditor: (state: EditorState) => void;
  setDeleteTarget: (target: { type: EntityType; id: string; name: string } | null) => void;
};

function Metric({ label, value, alert }: { label: string; value: string | number; alert?: boolean }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className={cn('mt-1 text-sm font-semibold tabular-nums', alert && 'text-destructive')}>{typeof value === 'number' ? value.toLocaleString('tr-TR') : value}</p></div>; }

function RoomRackSection({ room, setEditor, setDeleteTarget }: { room: RoomPortfolioSummary } & EntityControls) {
  return <section className={styles.rackSection} aria-label={`${room.name} kabinetleri`}><div className={styles.rackHeading}><h4>Kabinetler ve kapasite</h4><Button size="sm" variant="outline" onClick={() => setEditor({ mode: 'add', type: 'rack', parentId: room.id })}><Plus size={15} aria-hidden="true" />Kabinet ekle</Button></div>
    <div className={styles.rackList}>{room.racks.map((rack) => <div key={rack.id} className={styles.rackRow}>
      <div className={styles.rackIdentity}><div className="flex flex-wrap items-center gap-2"><Database className="h-4 w-4 text-primary" aria-hidden="true" /><p className="break-all text-sm font-semibold">{rack.name}</p><Badge variant={rack.operationalStatus === 'OPERATIONAL' ? 'success' : 'warning'}>{rack.operationalStatus === 'OPERATIONAL' ? 'Çalışıyor' : rack.operationalStatus === 'MAINTENANCE' ? 'Bakımda' : rack.operationalStatus === 'DECOMMISSIONED' ? 'Devre dışı' : uiLabel(rack.operationalStatus)}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{uiLabel(rack.type)} · {rack.usedUnits ?? 0}/{rack.totalUnits ?? rack.maxUnits} U kullanılıyor</p></div>
      <div className={styles.rackMetrics}><Metric label="Doluluk" value={`%${(rack.utilization ?? 0).toLocaleString('tr-TR')}`} /><Metric label="Cihaz" value={rack.deviceCount || 0} /><Metric label="Yeri atanmamış" value={rack.unpositionedDevices || 0} alert={(rack.unpositionedDevices || 0) > 0} /></div>
      <div className={styles.rackActions}><Button variant="ghost" size="sm" onClick={() => setEditor({ mode: 'add', type: 'device', parentId: rack.id, item: rack })}><Plus size={15} aria-hidden="true" />Cihaz ekle</Button><EntityMenu name={rack.name} onEdit={() => setEditor({ mode: 'edit', type: 'rack', item: rack })} onDelete={() => setDeleteTarget({ type: 'rack', id: rack.id, name: rack.name })} /></div>
    </div>)}{room.racks.length === 0 && <p className="py-5 text-center text-sm text-muted-foreground">Bu odada henüz kabinet yok. Kabinet ekleyerek yerleşimi oluşturmaya başlayın.</p>}</div>
  </section>;
}

function EntityDialog({ state, onClose, onSubmit }: { state: EditorState; onClose: () => void; onSubmit: (values: Record<string, unknown>) => Promise<void> }) {
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const defaults = state?.type === 'rack'
      ? { type: 'RACK_42U', maxUnits: 42, operationalStatus: 'OPERATIONAL' }
      : state?.type === 'device'
        ? { type: 'PHYSICAL_SERVER', status: 'ACTIVE', criticality: 'MEDIUM' }
        : {};
    setForm({ ...defaults, ...(state?.mode === 'edit' ? state.item : {}) });
    setError(null);
  }, [state]);
  if (!state) return null;
  const set = (key: string, value: unknown) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setSaving(true); setError(null); try { await onSubmit(form); } catch (submitError) { setError(uiError(submitError instanceof Error ? submitError.message : 'İşlem tamamlanamadı')); } finally { setSaving(false); } };
  return <Dialog open onOpenChange={(open) => !open && onClose()}>
    <DialogContent className={styles.organizationDialog} aria-describedby={undefined}>
      <DialogHeader><DialogTitle className={styles.organizationTitle}>{`${({ org: 'Organizasyon', building: 'Bina', floor: 'Kat', room: 'Oda', rack: 'Kabinet', device: 'Cihaz' })[state.type]} ${state.mode === 'add' ? 'ekle' : 'düzenle'}`}</DialogTitle></DialogHeader>
      <form onSubmit={submit} className={styles.organizationForm}>
        <EntityFields type={state.type} form={form} set={set} rack={state.item as LocationRack | undefined} />
        {error && <p className="text-sm text-destructive">{uiError(error)}</p>}
        <DialogFooter className={styles.organizationActions}><Button type="button" size="sm" variant="outline" onClick={onClose}>İptal</Button><Button type="submit" size="sm" disabled={saving}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

function EntityFields({ type, form, set, rack }: { type: EntityType; form: Record<string, unknown>; set: (key: string, value: unknown) => void; rack?: LocationRack }) {
  const field = (label: string, key: string, inputType = 'text', props: Record<string, unknown> = {}) => <label className="block space-y-1.5"><span className="text-sm font-medium">{label}</span><Input type={inputType} value={(form[key] as string | number | undefined) ?? ''} onChange={(event) => set(key, inputType === 'number' ? (event.target.value === '' ? undefined : Number(event.target.value)) : event.target.value)} {...props} /></label>;
  if (type === 'org') return <>{field('Organizasyon adı', 'name', 'text', { required: true })}{field('Kod', 'code', 'text', { required: true })}{field('Açıklama', 'description')}</>;
  if (type === 'building') return <>{field('Bina adı', 'name', 'text', { required: true })}{field('Şehir', 'city')}{field('Ülke', 'country')}</>;
  if (type === 'floor') return <>{field('Kat adı', 'name', 'text', { required: true })}{field('Kat numarası', 'floorNumber', 'number', { required: true })}</>;
  if (type === 'room') return <>{field('Oda adı', 'name', 'text', { required: true })}{field('Açıklama', 'description')}<div className="grid grid-cols-3 gap-3">{field('Genişlik (m)', 'width', 'number', { step: 0.1 })}{field('Derinlik (m)', 'depth', 'number', { step: 0.1 })}{field('Yükseklik (m)', 'height', 'number', { step: 0.1 })}</div></>;
  if (type === 'rack') return <>{field('Kabinet adı', 'name', 'text', { required: true })}<label className="block space-y-1.5"><span className="text-sm font-medium">Tip</span><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.type as string || 'RACK_42U'} onChange={(event) => set('type', event.target.value)}><option value="RACK_42U">42U Kabinet</option><option value="RACK_45U">45U Kabinet</option><option value="CUSTOM">Özel</option></select></label>{field('Maksimum U', 'maxUnits', 'number', { required: true, min: 1, max: 100 })}</>;
  return <>{field('Cihaz adı', 'name', 'text', { required: true })}<label className="block space-y-1.5"><span className="text-sm font-medium">Cihaz tipi</span><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.type as string || 'PHYSICAL_SERVER'} onChange={(event) => set('type', event.target.value)}>{['PHYSICAL_SERVER','VIRTUAL_HOST','FIREWALL','SWITCH','ROUTER','STORAGE','PDU','PATCH_PANEL','OTHER'].map((value) => <option key={value} value={value}>{uiLabel(value)}</option>)}</select></label><div className="grid grid-cols-2 gap-3">{field('U Pozisyonu', 'rackUnitPosition', 'number', { min: 1, max: rack?.maxUnits || 100 })}<label className="block space-y-1.5"><span className="text-sm font-medium">Durum</span><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.status as string || 'ACTIVE'} onChange={(event) => set('status', event.target.value)}><option value="ACTIVE">Aktif</option><option value="INACTIVE">Pasif</option><option value="MAINTENANCE">Bakımda</option><option value="UNKNOWN">Bilinmiyor</option></select></label></div><label className="block space-y-1.5"><span className="text-sm font-medium">Kritiklik</span><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.criticality as string || 'MEDIUM'} onChange={(event) => set('criticality', event.target.value)}><option value="CRITICAL">Kritik</option><option value="HIGH">Yüksek</option><option value="MEDIUM">Orta</option><option value="LOW">Düşük</option><option value="INFORMATIONAL">Bilgi</option></select></label></>;
}
