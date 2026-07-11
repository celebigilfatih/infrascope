'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Cuboid,
  Database,
  Edit3,
  Eye,
  Layers3,
  MapPin,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Server,
  Trash2,
  Warehouse,
} from 'lucide-react';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useToast } from '@/components/ui/use-toast';
import type {
  LocationBuilding,
  LocationFloor,
  LocationOrganization,
  LocationRack,
  LocationRoom,
  LocationsSummary,
  RoomPortfolioSummary,
} from '@/components/locations/types';
import { cn } from '@/lib/utils';

type EntityType = 'org' | 'building' | 'floor' | 'room' | 'rack' | 'device';
type Scope = { type: 'all' | 'org' | 'building' | 'floor' | 'room'; id?: string; label: string };
type EditorState = { mode: 'add' | 'edit'; type: EntityType; parentId?: string; item?: any } | null;

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
  const router = useRouter();
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
  const [editor, setEditor] = useState<EditorState>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: EntityType; id: string; name: string } | null>(null);

  const loadData = useCallback(async (silent = false) => {
    try {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const [organizationsResponse, summaryResponse]: any = await Promise.all([
        apiGet('/api/organizations?fresh=1'),
        apiGet('/api/locations/summary'),
      ]);
      if (!organizationsResponse.success || !summaryResponse.success) throw new Error('Konum portföyü yüklenemedi');
      setOrganizations(organizationsResponse.data);
      setSummary(summaryResponse.data);
      setExpanded((current) => {
        if (current.size > 0 || organizationsResponse.data.length === 0) return current;
        const firstOrg = organizationsResponse.data[0];
        const firstBuilding = firstOrg.buildings?.[0];
        const firstFloor = firstBuilding?.floors?.[0];
        return new Set([firstOrg.id, firstBuilding?.id, firstFloor?.id].filter(Boolean));
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Konum portföyü yüklenemedi');
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
    const matchesSearch = !search || haystack.includes(search.toLocaleLowerCase('tr-TR'));
    const matchesStatus = statusFilter === 'all' || room.status === statusFilter;
    return matchesScope && matchesSearch && matchesStatus;
  }), [scope, search, statusFilter, summary.rooms]);

  const selectedRoom = summary.rooms.find((room) => room.id === selectedRoomId) || null;
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
    const response: any = editor.mode === 'edit' ? await apiPut(endpoint, payload) : await apiPost(endpoint, payload);
    if (!response.success) throw new Error(response.error || 'İşlem tamamlanamadı');
    setEditor(null);
    await loadData(true);
    toast({ title: 'Kaydedildi', description: 'Fiziksel altyapı kaydı güncellendi.' });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const endpointByType = { org: 'organizations', building: 'buildings', floor: 'floors', room: 'rooms', rack: 'racks', device: 'devices' };
    try {
      const response: any = await apiDelete(`/api/${endpointByType[deleteTarget.type]}/${deleteTarget.id}`);
      if (!response.success) throw new Error(response.error || 'Silme işlemi tamamlanamadı');
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
    ['Organizasyon', summary.totals.organizations, Building2],
    ['Bina', summary.totals.buildings, Warehouse],
    ['Oda', summary.totals.rooms, Cuboid],
    ['Kabinet', summary.totals.racks, Database],
    ['Cihaz', summary.totals.devices, Server],
    ['Sorunlu', summary.totals.problemDevices, AlertTriangle],
    ['U atanmamış', summary.totals.unpositionedDevices, Layers3],
  ] as const;

  return (
    <main className="min-h-full bg-background">
      <section className="border-b border-border px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1680px]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="mb-1 flex items-center gap-2 text-sm font-medium text-muted-foreground"><MapPin className="h-4 w-4" /> Fiziksel altyapı portföyü</p>
              <h1 className="text-2xl font-semibold tracking-normal">Konumlar ve Sistem Odaları</h1>
              <p className="mt-1 text-sm text-muted-foreground">Holding genelindeki oda, kabinet ve cihaz yerleşimini tek merkezden yönetin.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => loadData(true)} disabled={refreshing} aria-label="Konum verilerini yenile" title="Yenile">
                <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
              </Button>
              <Button onClick={() => setEditor({ mode: 'add', type: 'org' })}><Plus className="mr-2 h-4 w-4" />Organizasyon</Button>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 border-y border-border sm:grid-cols-4 xl:grid-cols-7">
            {metrics.map(([label, value, Icon], index) => (
              <div key={label} className={cn('px-3 py-3 sm:px-4', index < metrics.length - 1 && 'border-r border-border', index < 5 && 'border-b border-border xl:border-b-0')}>
                <p className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className={cn('h-3.5 w-3.5', label === 'Sorunlu' && value > 0 && 'text-destructive')} />{label}</p>
                <p className={cn('mt-1 text-xl font-semibold', label === 'Sorunlu' && value > 0 && 'text-destructive')}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {loading ? (
        <div className="flex min-h-[520px] items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin text-primary" /><span className="ml-3 text-sm text-muted-foreground">Portföy hazırlanıyor...</span></div>
      ) : error ? (
        <div className="mx-auto mt-16 max-w-md rounded-md border border-destructive/30 bg-destructive/5 p-6 text-center"><AlertTriangle className="mx-auto h-6 w-6 text-destructive" /><p className="mt-3 font-medium">{error}</p><Button className="mt-4" onClick={() => loadData()}>Tekrar dene</Button></div>
      ) : (
        <section className="mx-auto grid max-w-[1680px] lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="border-b border-border p-4 lg:min-h-[calc(100vh-280px)] lg:border-b-0 lg:border-r sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <div><h2 className="text-sm font-semibold">Portföy gezgini</h2><p className="text-xs text-muted-foreground">Organizasyon ve fiziksel konumlar</p></div>
              <Button variant={scope.type === 'all' ? 'secondary' : 'ghost'} size="sm" onClick={() => { setScope({ type: 'all', label: 'Tüm odalar' }); setSelectedRoomId(null); }}>Tümü</Button>
            </div>
            <div className="max-h-[58vh] space-y-1 overflow-y-auto pr-1 lg:max-h-[calc(100vh-360px)]">
              {organizations.map((org) => (
                <TreeOrganization key={org.id} org={org} expanded={expanded} toggle={toggle} scope={scope} setScope={setScope} setSelectedRoomId={setSelectedRoomId} setEditor={setEditor} setDeleteTarget={setDeleteTarget} />
              ))}
            </div>
          </aside>

          <div className="min-w-0 p-4 sm:p-6 lg:p-8">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div><h2 className="text-lg font-semibold">{scope.label}</h2><p className="text-sm text-muted-foreground">{filteredRooms.length} oda gösteriliyor</p></div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[220px] flex-1 xl:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Oda, bina veya kabinet ara" className="pl-9" /></div>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="all">Tüm durumlar</option><option value="HEALTHY">Sağlıklı</option><option value="PLANNING">Yerleşim gerekli</option><option value="ATTENTION">Dikkat gerekiyor</option>
                </select>
              </div>
            </div>

            <div className="mt-6 border-t border-border">
              {filteredRooms.length === 0 ? (
                <div className="py-16 text-center"><Cuboid className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 font-medium">Eşleşen sistem odası bulunamadı</p><p className="mt-1 text-sm text-muted-foreground">Filtreleri değiştirin veya bu konuma oda ekleyin.</p></div>
              ) : filteredRooms.map((room) => (
                <RoomRow key={room.id} room={room} selected={selectedRoomId === room.id} onSelect={() => setSelectedRoomId(selectedRoomId === room.id ? null : room.id)} onOpen={() => router.push(`/locations/rooms/${room.id}`)} setEditor={setEditor} setDeleteTarget={setDeleteTarget} />
              ))}
            </div>

            {selectedRoom && (
              <RoomRackSection room={selectedRoom} setEditor={setEditor} setDeleteTarget={setDeleteTarget} />
            )}
          </div>
        </section>
      )}

      <EntityDialog state={editor} onClose={() => setEditor(null)} onSubmit={mutateEntity} />
      <ConfirmDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)} title="Kaydı sil" description={`${deleteTarget?.name || 'Bu kayıt'} silinsin mi? Bağlı kayıtlar varsa işlem engellenebilir.`} onConfirm={confirmDelete} variant="destructive" confirmText="Sil" />
    </main>
  );
}

function EntityMenu({ onEdit, onDelete, onAdd, addLabel }: { onEdit: () => void; onDelete: () => void; onAdd?: () => void; addLabel?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 opacity-70" aria-label="Kayıt işlemleri"><MoreHorizontal className="h-4 w-4" /></Button></PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-1">
        {onAdd && <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onAdd}><Plus className="mr-2 h-4 w-4" />{addLabel}</Button>}
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onEdit}><Edit3 className="mr-2 h-4 w-4" />Düzenle</Button>
        <Button variant="ghost" size="sm" className="w-full justify-start text-destructive hover:text-destructive" onClick={onDelete}><Trash2 className="mr-2 h-4 w-4" />Sil</Button>
      </PopoverContent>
    </Popover>
  );
}

function TreeOrganization({ org, expanded, toggle, scope, setScope, setSelectedRoomId, setEditor, setDeleteTarget }: any) {
  const open = expanded.has(org.id);
  return <div><TreeLine depth={0} label={org.name} meta={org.code} open={open} selected={scope.type === 'org' && scope.id === org.id} onToggle={() => toggle(org.id)} onSelect={() => { setScope({ type: 'org', id: org.id, label: org.name }); setSelectedRoomId(null); }} menu={<EntityMenu onAdd={() => setEditor({ mode: 'add', type: 'building', parentId: org.id })} addLabel="Bina ekle" onEdit={() => setEditor({ mode: 'edit', type: 'org', item: org })} onDelete={() => setDeleteTarget({ type: 'org', id: org.id, name: org.name })} />} />{open && org.buildings?.map((building: LocationBuilding) => <TreeBuilding key={building.id} building={building} {...{ expanded, toggle, scope, setScope, setSelectedRoomId, setEditor, setDeleteTarget }} />)}</div>;
}

function TreeBuilding({ building, expanded, toggle, scope, setScope, setSelectedRoomId, setEditor, setDeleteTarget }: any) {
  const open = expanded.has(building.id);
  return <div><TreeLine depth={1} label={building.name} meta={building.city} open={open} selected={scope.type === 'building' && scope.id === building.id} onToggle={() => toggle(building.id)} onSelect={() => { setScope({ type: 'building', id: building.id, label: building.name }); setSelectedRoomId(null); }} menu={<EntityMenu onAdd={() => setEditor({ mode: 'add', type: 'floor', parentId: building.id })} addLabel="Kat ekle" onEdit={() => setEditor({ mode: 'edit', type: 'building', item: building })} onDelete={() => setDeleteTarget({ type: 'building', id: building.id, name: building.name })} />} />{open && building.floors?.map((floor: LocationFloor) => <TreeFloor key={floor.id} floor={floor} {...{ expanded, toggle, scope, setScope, setSelectedRoomId, setEditor, setDeleteTarget }} />)}</div>;
}

function TreeFloor({ floor, expanded, toggle, scope, setScope, setSelectedRoomId, setEditor, setDeleteTarget }: any) {
  const open = expanded.has(floor.id);
  return <div><TreeLine depth={2} label={floor.name} meta={`Kat ${floor.floorNumber}`} open={open} selected={scope.type === 'floor' && scope.id === floor.id} onToggle={() => toggle(floor.id)} onSelect={() => { setScope({ type: 'floor', id: floor.id, label: floor.name }); setSelectedRoomId(null); }} menu={<EntityMenu onAdd={() => setEditor({ mode: 'add', type: 'room', parentId: floor.id })} addLabel="Oda ekle" onEdit={() => setEditor({ mode: 'edit', type: 'floor', item: floor })} onDelete={() => setDeleteTarget({ type: 'floor', id: floor.id, name: floor.name })} />} />{open && floor.rooms?.map((room: LocationRoom) => <TreeLine key={room.id} depth={3} label={room.name} meta="Sistem odası" selected={scope.type === 'room' && scope.id === room.id} onSelect={() => { setScope({ type: 'room', id: room.id, label: room.name }); setSelectedRoomId(room.id); }} menu={<EntityMenu onAdd={() => setEditor({ mode: 'add', type: 'rack', parentId: room.id })} addLabel="Kabinet ekle" onEdit={() => setEditor({ mode: 'edit', type: 'room', item: room })} onDelete={() => setDeleteTarget({ type: 'room', id: room.id, name: room.name })} />} />)}</div>;
}

function TreeLine({ depth, label, meta, open, selected, onToggle, onSelect, menu }: any) {
  return <div className={cn('group flex min-w-0 items-center rounded-md pr-1', selected && 'bg-primary/10 text-primary')} style={{ paddingLeft: `${depth * 14}px` }}><button type="button" onClick={onToggle || onSelect} className="flex h-8 w-7 shrink-0 items-center justify-center text-muted-foreground" aria-label={open ? `${label} daralt` : `${label} genişlet`}>{onToggle ? (open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />) : <span className="h-1.5 w-1.5 rounded-full bg-current" />}</button><button type="button" onClick={onSelect} className="min-w-0 flex-1 py-1.5 text-left"><span className="block truncate text-sm font-medium">{label}</span>{meta && <span className="block truncate text-xs text-muted-foreground">{meta}</span>}</button>{menu}</div>;
}

function RoomRow({ room, selected, onSelect, onOpen, setEditor, setDeleteTarget }: any) {
  const statusTone = room.status === 'HEALTHY' ? 'success' : room.status === 'ATTENTION' ? 'destructive' : 'warning';
  return <div className={cn('border-b border-border py-4 transition-colors', selected && 'bg-muted/25')}><div className="flex flex-col gap-4 xl:flex-row xl:items-center"><button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-start gap-3 text-left"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40"><Cuboid className="h-5 w-5 text-primary" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold">{room.name}</h3><Badge variant={statusTone}>{STATUS_LABELS[room.status as keyof typeof STATUS_LABELS]}</Badge></div><p className="mt-1 truncate text-sm text-muted-foreground">{room.floor.building.organization.name} · {room.floor.building.name} · {room.floor.name}</p><p className="mt-1 text-xs text-muted-foreground">{room.width || '?'} × {room.depth || '?'} × {room.height || '?'} m</p></div></button><div className="grid grid-cols-4 gap-5 text-sm xl:w-[430px]"><Metric label="Kabinet" value={room.rackCount} /><Metric label="Cihaz" value={room.deviceCount} /><Metric label="Doluluk" value={`${room.utilization}%`} /><Metric label="Sorun" value={room.problemDeviceCount} alert={room.problemDeviceCount > 0} /></div><div className="flex shrink-0 items-center gap-2"><Button variant="outline" size="sm" onClick={onOpen}><Eye className="mr-2 h-4 w-4" />Dijital ikizi aç</Button><EntityMenu onAdd={() => setEditor({ mode: 'add', type: 'rack', parentId: room.id })} addLabel="Kabinet ekle" onEdit={() => setEditor({ mode: 'edit', type: 'room', item: room })} onDelete={() => setDeleteTarget({ type: 'room', id: room.id, name: room.name })} /></div></div></div>;
}

function Metric({ label, value, alert }: { label: string; value: string | number; alert?: boolean }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className={cn('mt-1 font-semibold', alert && 'text-destructive')}>{value}</p></div>; }

function RoomRackSection({ room, setEditor, setDeleteTarget }: any) {
  return <section className="mt-8 border-t border-border pt-6"><div className="flex items-center justify-between"><div><h2 className="font-semibold">{room.name} kabinetleri</h2><p className="text-sm text-muted-foreground">Kapasite ve cihaz yerleşimi</p></div><Button size="sm" onClick={() => setEditor({ mode: 'add', type: 'rack', parentId: room.id })}><Plus className="mr-2 h-4 w-4" />Kabinet</Button></div><div className="mt-4 divide-y divide-border border-y border-border">{room.racks.map((rack: LocationRack) => <div key={rack.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><Database className="h-4 w-4 text-muted-foreground" /><p className="truncate text-sm font-medium">{rack.name}</p><Badge variant={rack.operationalStatus === 'OPERATIONAL' ? 'success' : 'warning'}>{rack.operationalStatus === 'OPERATIONAL' ? 'Operasyonel' : 'Bakım'}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{rack.type.replace(/_/g, ' ')} · {rack.usedUnits}/{rack.totalUnits}U kullanılıyor</p></div><div className="grid grid-cols-3 gap-6 text-sm"><Metric label="Doluluk" value={`${rack.utilization}%`} /><Metric label="Cihaz" value={rack.deviceCount || 0} /><Metric label="U atanmamış" value={rack.unpositionedDevices || 0} alert={(rack.unpositionedDevices || 0) > 0} /></div><div className="flex items-center"><Button variant="ghost" size="sm" onClick={() => setEditor({ mode: 'add', type: 'device', parentId: rack.id, item: rack })}><Plus className="mr-2 h-4 w-4" />Cihaz</Button><EntityMenu onEdit={() => setEditor({ mode: 'edit', type: 'rack', item: rack })} onDelete={() => setDeleteTarget({ type: 'rack', id: rack.id, name: rack.name })} /></div></div>)}</div></section>;
}

function EntityDialog({ state, onClose, onSubmit }: { state: EditorState; onClose: () => void; onSubmit: (values: Record<string, unknown>) => Promise<void> }) {
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const defaults = state?.type === 'rack'
      ? { type: 'RACK_42U', maxUnits: 42, operationalStatus: 'OPERATIONAL' }
      : state?.type === 'device'
        ? { type: 'PHYSICAL_SERVER', status: 'ACTIVE', criticality: 'MEDIUM' }
        : {};
    setForm({ ...defaults, ...(state?.item || {}) });
    setError(null);
  }, [state]);
  if (!state) return null;
  const set = (key: string, value: unknown) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setSaving(true); setError(null); try { await onSubmit(form); } catch (submitError) { setError(submitError instanceof Error ? submitError.message : 'İşlem tamamlanamadı'); } finally { setSaving(false); } };
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto"><DialogHeader><DialogTitle>{state.mode === 'add' ? 'Yeni kayıt' : 'Kaydı düzenle'}</DialogTitle><DialogDescription>Fiziksel altyapı bilgilerini eksiksiz girin.</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-4"><EntityFields type={state.type} form={form} set={set} rack={state.item} />{error && <p className="text-sm text-destructive">{error}</p>}<DialogFooter><Button type="button" variant="outline" onClick={onClose}>İptal</Button><Button type="submit" disabled={saving}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function EntityFields({ type, form, set, rack }: { type: EntityType; form: Record<string, any>; set: (key: string, value: unknown) => void; rack?: LocationRack }) {
  const field = (label: string, key: string, inputType = 'text', props: Record<string, unknown> = {}) => <label className="block space-y-1.5"><span className="text-sm font-medium">{label}</span><Input type={inputType} value={form[key] ?? ''} onChange={(event) => set(key, inputType === 'number' ? (event.target.value === '' ? undefined : Number(event.target.value)) : event.target.value)} {...props} /></label>;
  if (type === 'org') return <>{field('Organizasyon adı', 'name', 'text', { required: true })}{field('Kod', 'code', 'text', { required: true })}{field('Açıklama', 'description')}</>;
  if (type === 'building') return <>{field('Bina adı', 'name', 'text', { required: true })}{field('Şehir', 'city')}{field('Ülke', 'country')}</>;
  if (type === 'floor') return <>{field('Kat adı', 'name', 'text', { required: true })}{field('Kat numarası', 'floorNumber', 'number', { required: true })}</>;
  if (type === 'room') return <>{field('Oda adı', 'name', 'text', { required: true })}{field('Açıklama', 'description')}<div className="grid grid-cols-3 gap-3">{field('Genişlik (m)', 'width', 'number', { step: 0.1 })}{field('Derinlik (m)', 'depth', 'number', { step: 0.1 })}{field('Yükseklik (m)', 'height', 'number', { step: 0.1 })}</div></>;
  if (type === 'rack') return <>{field('Kabinet adı', 'name', 'text', { required: true })}<label className="block space-y-1.5"><span className="text-sm font-medium">Tip</span><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.type || 'RACK_42U'} onChange={(event) => set('type', event.target.value)}><option value="RACK_42U">42U Kabinet</option><option value="RACK_45U">45U Kabinet</option><option value="CUSTOM">Özel</option></select></label>{field('Maksimum U', 'maxUnits', 'number', { required: true, min: 1, max: 100 })}</>;
  return <>{field('Cihaz adı', 'name', 'text', { required: true })}<label className="block space-y-1.5"><span className="text-sm font-medium">Cihaz tipi</span><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.type || 'PHYSICAL_SERVER'} onChange={(event) => set('type', event.target.value)}>{['PHYSICAL_SERVER','VIRTUAL_HOST','FIREWALL','SWITCH','ROUTER','STORAGE','PDU','PATCH_PANEL','OTHER'].map((value) => <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>)}</select></label><div className="grid grid-cols-2 gap-3">{field('U Pozisyonu', 'rackUnitPosition', 'number', { min: 1, max: rack?.maxUnits || 100 })}<label className="block space-y-1.5"><span className="text-sm font-medium">Durum</span><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.status || 'ACTIVE'} onChange={(event) => set('status', event.target.value)}><option value="ACTIVE">Aktif</option><option value="INACTIVE">Pasif</option><option value="MAINTENANCE">Bakımda</option><option value="UNKNOWN">Bilinmiyor</option></select></label></div><label className="block space-y-1.5"><span className="text-sm font-medium">Kritiklik</span><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.criticality || 'MEDIUM'} onChange={(event) => set('criticality', event.target.value)}><option value="CRITICAL">Kritik</option><option value="HIGH">Yüksek</option><option value="MEDIUM">Orta</option><option value="LOW">Düşük</option><option value="INFORMATIONAL">Bilgi</option></select></label></>;
}
