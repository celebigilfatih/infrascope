'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronLeft, ChevronRight, Database, Info, Layers3, MapPin, Pencil, Plus, RefreshCw, Search, Server, Trash2, Unplug, X } from 'lucide-react';
import { PageHeading } from '@/components/ui/page-heading';
import { StatusBadge } from '@/components/ui/status-badge';
import { SeverityBadge } from '@/components/ui/severity-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { DeviceEditor } from '@/components/devices/DeviceEditor';
import type { DeviceFormValues, InventoryDevice } from '@/components/devices/types';
import { INVENTORY_TYPES } from '@/components/devices/types';
import type { RackRecord } from '@/components/racks/types';
import { apiGet, apiDelete, apiPost, apiPut } from '@/lib/api';
import { uiError, uiLabel } from '@/lib/i18n/tr';
import { deviceUnitHeight, placementIssue } from '@/lib/racks/device-placement';
import { matchesInventoryFilters } from '@/lib/devices/inventory-view';
import { DEVICE_INVENTORY_CHANGED_EVENT, DEVICE_INVENTORY_CHANGED_STORAGE_KEY, notifyDeviceInventoryChanged } from '@/lib/device-inventory-events';
import { cn } from '@/lib/utils';
import styles from './page.module.css';

interface InventoryResponse { success: boolean; error?: string; data?: InventoryDevice[]; total?: number; totalPages?: number }
interface EditorState { device?: InventoryDevice; tab: 'details' | 'placement' }

export default function DevicesPage() {
  const { toast } = useToast();
  const [devices, setDevices] = useState<InventoryDevice[]>([]);
  const [racks, setRacks] = useState<RackRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [racksLoading, setRacksLoading] = useState(true);
  const [racksError, setRacksError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterType, setFilterType] = useState('manual');
  const [rackFilter, setRackFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [placementFilter, setPlacementFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InventoryDevice | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deviceRequest = useRef(0);
  const rackRequest = useRef(0);

  useEffect(() => { const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400); return () => clearTimeout(timer); }, [search]);
  const loadDevices = useCallback(async (silent = false, signal?: AbortSignal) => {
    const request = ++deviceRequest.current;
    if (silent) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize), filterType, rackId: rackFilter, status: statusFilter, placement: placementFilter });
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      const response = await apiGet(`/api/devices?${params}`, undefined, { signal }) as InventoryResponse;
      if (request !== deviceRequest.current || signal?.aborted) return;
      if (!response.success) throw new Error(uiError(response.error || 'Cihazlar yüklenemedi.'));
      setDevices(response.data || []); setTotal(response.total || 0); setTotalPages(response.totalPages || 0);
      if (page > Math.max(1, response.totalPages || 0)) setPage(Math.max(1, response.totalPages || 0));
    } catch (loadError) {
      if (request === deviceRequest.current && !signal?.aborted) setError(uiError(loadError, 'Cihazlar yüklenemedi.'));
    } finally { if (request === deviceRequest.current && !signal?.aborted) { setLoading(false); setRefreshing(false); } }
  }, [page, pageSize, filterType, rackFilter, statusFilter, placementFilter, debouncedSearch]);
  const loadRacks = useCallback(async (): Promise<RackRecord[] | null> => {
    const request = ++rackRequest.current;
    setRacksLoading(true); setRacksError(null);
    try {
      const response = await apiGet('/api/racks?fresh=1') as { success: boolean; data?: RackRecord[]; error?: string };
      if (!response.success) throw new Error(uiError(response.error || 'Kabinet bilgileri alınamadı.'));
      if (request === rackRequest.current) setRacks(response.data || []);
      return response.data || [];
    } catch (rackError) { if (request === rackRequest.current) setRacksError(uiError(rackError, 'Kabinet bilgileri alınamadı.')); return null; }
    finally { if (request === rackRequest.current) setRacksLoading(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); loadDevices(false, controller.signal); return () => controller.abort(); }, [loadDevices]);
  useEffect(() => { loadRacks(); }, [loadRacks]);
  useEffect(() => {
    const refresh = () => { loadDevices(true); loadRacks(); };
    const handleChange = (event: Event) => { if ((event as CustomEvent).detail?.source !== 'devices-page') refresh(); };
    const storage = (event: StorageEvent) => { if (event.key === DEVICE_INVENTORY_CHANGED_STORAGE_KEY) refresh(); };
    const visibility = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener(DEVICE_INVENTORY_CHANGED_EVENT, handleChange); window.addEventListener('storage', storage); window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener(DEVICE_INVENTORY_CHANGED_EVENT, handleChange); window.removeEventListener('storage', storage); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visibility); };
  }, [loadDevices, loadRacks]);
  const openEditor = (device?: InventoryDevice, tab: 'details' | 'placement' = 'details') => { setEditor({ device, tab }); loadRacks(); };
  const filters = { type: filterType, search: debouncedSearch, rack: rackFilter, status: statusFilter, placement: placementFilter };
  const hasFilters = Boolean(search) || filterType !== 'manual' || rackFilter !== 'all' || statusFilter !== 'all' || placementFilter !== 'all';
  const clearFilters = () => { setSearch(''); setDebouncedSearch(''); setFilterType('manual'); setRackFilter('all'); setStatusFilter('all'); setPlacementFilter('all'); setPage(1); };
  const saveDevice = async (values: DeviceFormValues) => {
    const target = editor?.device;
    // Recheck current cabinet data before submitting; the API checks again at the write boundary.
    const freshRacks = await loadRacks();
    if (values.rackId && !freshRacks) throw new Error('Yerleşim doğrulanamadı. Kabinet bilgilerini tekrar yükleyin.');
    const targetRack = freshRacks?.find(rack => rack.id === values.rackId) || null;
    const issue = placementIssue({ rackId: values.rackId, rack: targetRack, start: values.rackUnitPosition, height: values.unitHeight, deviceId: target?.id });
    if (issue) throw new Error(issue);
    const payload: Partial<DeviceFormValues> = { ...values };
    if (target && !INVENTORY_TYPES.includes(values.type) && values.type === target.type) delete payload.type;
    const response = target ? await apiPut(`/api/devices/${target.id}`, payload) : await apiPost('/api/devices', payload);
    if (!response.success) throw new Error(uiError(response.error || 'Cihaz kaydedilemedi.'));
    const saved = response.data as InventoryDevice | undefined;
    if (saved) {
      const updated = { ...saved, rack: targetRack };
      const matches = matchesInventoryFilters(updated, filters);
      if (target) {
        setDevices(current => matches ? current.map(device => device.id === target.id ? updated : device) : current.filter(device => device.id !== target.id));
        if (!matches) setTotal(current => Math.max(0, current - 1));
      } else if (matches && page === 1) {
        setDevices(current => [updated, ...current.filter(device => device.id !== updated.id)].slice(0, pageSize)); setTotal(current => current + 1);
      }
    }
    setEditor(null);
    notifyDeviceInventoryChanged({ action: target ? 'update' : 'create', deviceId: saved?.id, source: 'devices-page' });
    toast({ title: 'Cihaz kaydedildi', description: `${values.name} bilgileri ve kabinet yerleşimi güncellendi.` });
    if (!target && page !== 1) setPage(1); else await loadDevices(true);
    await loadRacks();
  };
  const removeDevice = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true); setDeleteError(null);
    try {
      const response = await apiDelete(`/api/devices/${deleteTarget.id}`);
      if (!response.success) throw new Error(uiError(response.error || 'Cihaz silinemedi.'));
      setDevices(current => current.filter(device => device.id !== deleteTarget.id)); setTotal(current => Math.max(0, current - 1)); setDeleteTarget(null);
      notifyDeviceInventoryChanged({ action: 'delete', deviceId: deleteTarget.id, source: 'devices-page' });
      toast({ title: 'Cihaz silindi', description: `${deleteTarget.name} kaldırıldı.` }); await loadDevices(true); await loadRacks();
    } catch (removeError) { setDeleteError(uiError(removeError, 'Cihaz silinemedi.')); }
    finally { setDeleting(false); }
  };
  const stats = [
    { label: 'Eşleşen cihaz', value: total, detail: 'Seçili filtrelerin tüm sayfalardaki toplamı', icon: Server },
    { label: 'Kabinet atanmış', value: devices.filter(device => device.rackId).length, detail: 'Bu sayfadaki cihazlar', icon: Database },
    { label: 'U konumu bekleyen', value: devices.filter(device => device.rackId && !(Number(device.rackUnitPosition) > 0)).length, detail: 'Bu sayfadaki kabinetli cihazlar', icon: Layers3 },
    { label: 'Kabinet atanmamış', value: devices.filter(device => !device.rackId).length, detail: 'Bu sayfadaki cihazlar', icon: Unplug },
  ];
  const rackFor = (device: InventoryDevice) => racks.find(rack => rack.id === device.rackId) || device.rack;
  const location = (device: InventoryDevice) => {
    const rack = rackFor(device);
    return device.rackId ? <div className={styles.location}><strong><Database size={14} aria-hidden="true" />{rack?.name || 'Kabinet bilgisi alınamadı'}</strong><span><MapPin size={11} aria-hidden="true" />{rack?.room?.name || 'Oda bilgisi yok'}</span></div> : <span className={styles.unassigned}><Unplug size={14} aria-hidden="true" />Kabinet atanmamış</span>;
  };
  const placement = (device: InventoryDevice) => {
    const height = deviceUnitHeight(device.metadata);
    const start = device.rackUnitPosition;
    const rack = rackFor(device);
    const overflow = start != null && rack && start + height - 1 > rack.maxUnits;
    return <div className={styles.unitCell}>{device.rackId && start && start > 0 ? <strong className={cn(overflow && styles.warnText)}>U {start}{height > 1 ? `–${start + height - 1}` : ''}</strong> : <span>{device.rackId ? 'U konumu atanmamış' : '—'}</span>}<small>{height} U yükseklik{overflow ? ' · Kapasite aşılıyor' : ''}</small></div>;
  };
  const actions = (device: InventoryDevice) => <div className={styles.rowActions}><Button variant="outline" size="sm" onClick={() => openEditor(device, 'placement')} aria-label={`${device.name}: kabinet ve U konumunu düzenle`}><Layers3 size={14} />Yerleşim</Button><Button variant="ghost" size="icon" onClick={() => openEditor(device)} aria-label={`${device.name}: cihazı düzenle`} title="Cihaz bilgilerini düzenle"><Pencil size={15} /></Button><Button variant="ghost" size="icon" onClick={() => { setDeleteTarget(device); setDeleteError(null); }} aria-label={`${device.name}: cihazı sil`} title="Cihazı sil"><Trash2 size={15} /></Button></div>;
  const identity = (device: InventoryDevice) => <div className={styles.deviceIdentity}><span className={styles.deviceIcon}><Server size={17} aria-hidden="true" /></span><div><strong>{device.name}</strong><span>{uiLabel(device.type)}{device.nmsDeviceId != null && <Badge variant={device.pollingEnabled ? 'success' : 'secondary'}>NMS {device.pollingEnabled ? 'aktif' : 'pasif'}</Badge>}</span><small>{device.managementIp || device.serialNumber || 'IP / seri numarası belirtilmemiş'}</small></div></div>;
  const formatDate = (date?: string | null) => date && !Number.isNaN(new Date(date).getTime()) ? new Date(date).toLocaleDateString('tr-TR') : 'Belirtilmedi';
  return <div className={styles.page}>
    <header className={styles.header}><PageHeading section="devices" description="Cihazları, kabinet atamalarını ve U yerleşimlerini tek ekrandan yönetin.">Cihaz Envanteri</PageHeading><div className={styles.headerActions}><Button variant="outline" onClick={() => { loadDevices(true); loadRacks(); }} disabled={loading || refreshing}><RefreshCw size={16} className={cn(refreshing && 'animate-spin')} />Yenile</Button><Button onClick={() => openEditor()}><Plus size={16} />Cihaz ekle</Button></div></header>
    <section className={styles.metrics} aria-label="Envanter özeti">{stats.map(({ label, value, detail, icon: Icon }) => <div key={label}><span className={styles.metricIcon}><Icon size={18} aria-hidden="true" /></span><div><p>{label}</p><strong>{loading || error ? '—' : value.toLocaleString('tr-TR')}</strong><small>{detail}</small></div></div>)}</section>
    <div className={styles.toolbar}><div className={styles.search}><Search size={17} aria-hidden="true" /><Input aria-label="Cihaz, IP veya seri numarası ara" placeholder="Cihaz, IP, seri no veya model ara…" value={search} onChange={event => setSearch(event.target.value)} className="pl-10" /></div><select aria-label="Cihaz tipi filtresi" className={styles.select} value={filterType} onChange={event => { setFilterType(event.target.value); setPage(1); }}><option value="manual">Genel envanter türleri</option><option value="all">Entegrasyonlar dahil tüm türler</option>{INVENTORY_TYPES.map(type => <option key={type} value={type}>{uiLabel(type)}</option>)}</select><select aria-label="Kabinet filtresi" className={styles.select} value={rackFilter} onChange={event => { setRackFilter(event.target.value); setPage(1); }}><option value="all">Tüm kabinetler</option><option value="unassigned">Kabinet atanmamış</option>{racks.map(rack => <option key={rack.id} value={rack.id}>{rack.name} · {rack.room?.name || 'Oda yok'}</option>)}</select><select aria-label="Yerleşim filtresi" className={styles.select} value={placementFilter} onChange={event => { setPlacementFilter(event.target.value); setPage(1); }}><option value="all">Tüm yerleşimler</option><option value="pending">U konumu bekleyen</option><option value="positioned">U konumu atanmış</option></select><select aria-label="Çalışma durumu filtresi" className={styles.select} value={statusFilter} onChange={event => { setStatusFilter(event.target.value); setPage(1); }}><option value="all">Tüm durumlar</option>{['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED', 'UNKNOWN'].map(status => <option key={status} value={status}>{uiLabel(status)}</option>)}</select>{hasFilters && <Button variant="ghost" size="sm" onClick={clearFilters}><X size={14} />Temizle</Button>}</div>
    {racksError && <div className={styles.rackError}><AlertTriangle size={17} /><p>Kabinet bilgileri güncellenemedi: {racksError}</p><Button variant="outline" size="sm" onClick={loadRacks}>Tekrar dene</Button></div>}
    <div className={styles.listHeading}><h2>Cihazlar</h2><p aria-live="polite">{loading ? 'Yükleniyor…' : `${devices.length} cihaz gösteriliyor · Toplam ${total.toLocaleString('tr-TR')}`}{refreshing && ' · Güncelleniyor…'}</p></div>
    {loading ? <div className={styles.pageState} role="status"><RefreshCw size={27} className="animate-spin text-primary" /><p>Envanter yükleniyor…</p></div> : error ? <div className={styles.pageState} role="alert"><AlertTriangle size={28} className="text-destructive" /><h3>Cihazlar yüklenemedi</h3><p>{error}</p><Button onClick={() => loadDevices()}><RefreshCw size={16} />Tekrar dene</Button></div> : devices.length === 0 ? <div className={styles.pageState}><Server size={34} className="text-primary" /><h3>{hasFilters ? 'Filtrelere uygun cihaz bulunamadı' : 'Henüz cihaz kaydı yok'}</h3><p>{hasFilters ? 'Arama metnini veya filtreleri değiştirerek tekrar deneyin.' : 'Cihaz ekleyip kabinet ve U yerleşimini tanımlayarak başlayın.'}</p>{hasFilters ? <Button variant="outline" onClick={clearFilters}>Filtreleri temizle</Button> : <Button onClick={() => openEditor()}><Plus size={16} />Cihaz ekle</Button>}</div> : <>
      <div className={styles.desktopTable} aria-busy={refreshing}><Table><TableHeader><TableRow><TableHead>Cihaz</TableHead><TableHead>Durum / kritiklik</TableHead><TableHead>Kabinet / oda</TableHead><TableHead>U yerleşimi</TableHead><TableHead className={styles.optionalColumn}>Üretici / model</TableHead><TableHead className={styles.optionalColumn}>Destek bitişi</TableHead><TableHead className={styles.actionHeader}>İşlemler</TableHead></TableRow></TableHeader><TableBody>{devices.map(device => <TableRow key={device.id}><TableCell>{identity(device)}</TableCell><TableCell><div className={styles.badges}><StatusBadge status={device.status} /><SeverityBadge severity={device.criticality} /></div></TableCell><TableCell>{location(device)}</TableCell><TableCell>{placement(device)}</TableCell><TableCell className={styles.optionalColumn}><div className={styles.vendor}><span>{device.vendor || 'Belirtilmedi'}</span><small>{device.model || '—'}</small></div></TableCell><TableCell className={cn(styles.date, styles.optionalColumn)}>{formatDate(device.supportDate)}</TableCell><TableCell className={styles.actionCell}>{actions(device)}</TableCell></TableRow>)}</TableBody></Table></div>
      <div className={styles.mobileCards}>{devices.map(device => <article className={styles.mobileCard} key={device.id}>{identity(device)}<div className={styles.mobileBadges}><StatusBadge status={device.status} /><SeverityBadge severity={device.criticality} /></div><div className={styles.mobilePlacement}>{location(device)}{placement(device)}</div><p className={styles.mobileSpecs}>{[device.vendor, device.model].filter(Boolean).join(' · ') || 'Üretici / model belirtilmemiş'}<span>Destek: {formatDate(device.supportDate)}</span></p>{actions(device)}</article>)}</div>
    </>}
    {!loading && !error && total > 0 && <nav className={styles.pagination} aria-label="Envanter sayfaları"><div><label htmlFor="device-page-size">Sayfa başına</label><select id="device-page-size" className={styles.select} value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>{[10, 25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}</select><span>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} / {total}</span></div><div><Button size="sm" variant="outline" disabled={page <= 1 || refreshing} onClick={() => setPage(current => current - 1)} aria-label="Önceki sayfa"><ChevronLeft size={15} />Önceki</Button><span>Sayfa {page} / {Math.max(1, totalPages)}</span><Button size="sm" variant="outline" disabled={page >= totalPages || refreshing} onClick={() => setPage(current => current + 1)} aria-label="Sonraki sayfa">Sonraki<ChevronRight size={15} /></Button></div></nav>}
    <p className={styles.pageNote}><Info size={14} /><span>U 1 kabinetin en alt birimidir. Yerleşim düğmesiyle kabinet atamasını, başlangıç U konumunu ve cihaz yüksekliğini düzenleyebilirsiniz. <Link href="/racks">Kabinetleri görüntüle</Link></span></p>
    {editor && <DeviceEditor device={editor.device} initialTab={editor.tab} racks={racks} racksLoading={racksLoading} racksError={racksError} onRefreshRacks={loadRacks} onClose={() => setEditor(null)} onSave={saveDevice} />}
    <Dialog open={Boolean(deleteTarget)} onOpenChange={open => { if (!open && !deleting) setDeleteTarget(null); }}><DialogContent className="max-w-md"><DialogHeader><DialogTitle className="flex items-center gap-2"><Trash2 size={19} className="text-destructive" />Cihazı sil</DialogTitle><DialogDescription>{deleteTarget?.name} cihazını silmek istediğinizden emin misiniz? Bu işlem geri alınamaz. Bağlı alt cihaz veya servis varsa silme işlemi engellenir.</DialogDescription></DialogHeader>{deleteError && <p role="alert" className={styles.deleteError}>{deleteError}</p>}<DialogFooter><Button variant="outline" disabled={deleting} onClick={() => setDeleteTarget(null)}>Vazgeç</Button><Button variant="destructive" disabled={deleting} onClick={removeDevice}>{deleting ? <RefreshCw size={16} className="animate-spin" /> : <Trash2 size={16} />}{deleting ? 'Siliniyor…' : 'Cihazı sil'}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
