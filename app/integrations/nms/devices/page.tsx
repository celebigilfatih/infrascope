'use client';

import { uiError } from '@/lib/i18n/tr';

import { ActionIcon } from '@/components/ui/action-icon';
import { PageHeading } from '@/components/ui/page-heading';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Activity, AlertCircle, ArrowDownUp, ArrowRight, Cable, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Cpu, Database, Eye, Filter, Loader2, MapPin, MemoryStick, Monitor, MoreHorizontal, Network, PauseCircle, Pencil, Plus, RefreshCw, Router, Search, Server, Settings2, ShieldCheck, Trash2, X, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { notifyDeviceInventoryChanged } from '@/lib/device-inventory-events';
import { cn } from '@/lib/utils';
import styles from './page.module.css';

type DeviceStatus = 'online' | 'offline' | 'unknown' | 'disabled';
interface NmsDevice {
  id: string;
  name: string;
  type: string | null;
  vendor: string | null;
  nmsDeviceId: number;
  managementIp: string | null;
  snmpVersion: string | null;
  snmpPort: number | null;
  pollingEnabled: boolean;
  pollingInterval: number | null;
  lastPolledAt: string | null;
  latestHealth: { cpuUsage: number | null; memoryUsage: number | null; temperature: number | null; collectedAt: string } | null;
  portDownCount: number;
}

const statusInfo: Record<DeviceStatus, { label: string; icon: LucideIcon; className: string }> = {
  online: { label: 'Güncel', icon: CheckCircle2, className: styles.online },
  offline: { label: 'Gecikmiş', icon: AlertCircle, className: styles.offline },
  unknown: { label: 'Veri bekleniyor', icon: Clock3, className: styles.unknown },
  disabled: { label: 'İzleme kapalı', icon: PauseCircle, className: styles.disabled },
};

const tableColumns: { label: string; icon: LucideIcon }[] = [
  { label: 'Cihaz', icon: Server }, { label: 'Yönetim IP', icon: MapPin },
  { label: 'Durum', icon: Activity }, { label: 'Son veri', icon: Clock3 },
  { label: 'CPU / Bellek', icon: Cpu }, { label: 'Port uyarısı', icon: Cable },
  { label: 'İşlemler', icon: Settings2 },
];

function getStatus(device: NmsDevice, now: number): DeviceStatus {
  if (!device.pollingEnabled) return 'disabled';
  const lastPoll = device.lastPolledAt ? Date.parse(device.lastPolledAt) : NaN;
  if (!Number.isFinite(lastPoll)) return 'unknown';
  return now - lastPoll < (device.pollingInterval ?? 300) * 2500 ? 'online' : 'offline';
}
function formatRelative(timestamp: string | null, now: number) {
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) return 'Henüz veri yok';
  const minutes = Math.max(0, Math.floor((now - Date.parse(timestamp)) / 60000));
  if (minutes < 1) return 'Az önce';
  if (minutes < 60) return `${minutes} dk önce`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} saat önce`;
  return `${Math.floor(minutes / 1440)} gün önce`;
}
function formatInterval(seconds: number | null) {
  const value = seconds ?? 300;
  return value % 60 === 0 ? `${value / 60} dk aralıkla` : `${value} sn aralıkla`;
}
function deviceType(type: string | null) {
  const labels: Record<string, string> = { SWITCH: 'Ağ anahtarı', ROUTER: 'Yönlendirici', FIREWALL: 'Güvenlik duvarı', PHYSICAL_SERVER: 'Sunucu', VIRTUAL_HOST: 'Sanal sunucu', VIRTUAL_MACHINE: 'Sanal makine', STORAGE: 'Depolama', OTHER: 'Diğer' };
  return type ? labels[type] || type.replace(/_/g, ' ') : 'Cihaz';
}

export default function NmsDevicesPage() {
  const [devices, setDevices] = useState<NmsDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [portsOnly, setPortsOnly] = useState(false);
  const [sort, setSort] = useState('name');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [removeTarget, setRemoveTarget] = useState<NmsDevice | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);

  const loadDevices = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/integrations/nms/devices', { signal: controller.signal });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.devices)) throw new Error(uiError('Cihaz listesi yüklenemedi. Bağlantınızı ve erişim yetkinizi kontrol edip tekrar deneyin.'));
      if (controller.signal.aborted) return;
      const timestamp = Date.now();
      setDevices(data.devices);
      setLoadedAt(timestamp);
      setNow(timestamp);
    } catch {
      if (!controller.signal.aborted) setError(uiError('Cihaz listesi yüklenemedi. Bağlantınızı ve erişim yetkinizi kontrol edip tekrar deneyin.'));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDevices();
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => { request.current?.abort(); window.clearInterval(timer); };
  }, [loadDevices]);

  useEffect(() => {
    if (removeTarget || deleting) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadDevices();
    }, 60000);
    return () => window.clearInterval(timer);
  }, [loadDevices, removeTarget, deleting]);

  async function removeMonitoring() {
    if (!removeTarget || deleting) return;
    const device = removeTarget;
    setDeleting(true);
    setRemoveError(null);
    try {
      const response = await fetch(`/api/integrations/nms/devices/${device.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(uiError('İzleme kaldırılamadı. Erişim yetkinizi kontrol edip tekrar deneyin.'));
      request.current?.abort();
      setLoading(false);
      setDevices((current) => current.filter((item) => item.id !== device.id));
      setRemoveTarget(null);
      setNotice(`${device.name} için NMS izleme kaldırıldı. Envanter kaydı korunuyor.`);
      notifyDeviceInventoryChanged({ action: 'update', deviceId: device.id, source: 'nms-devices' });
    } catch (removeFailure) {
      setRemoveError(uiError(removeFailure instanceof Error ? removeFailure.message : 'İzleme kaldırılamadı. Tekrar deneyin.'));
    } finally { setDeleting(false); }
  }

  const counts = devices.reduce((result, device) => { result[getStatus(device, now)] += 1; return result; }, { online: 0, offline: 0, unknown: 0, disabled: 0 });
  const portAffected = devices.filter((device) => device.portDownCount > 0).length;
  const query = search.trim().toLocaleLowerCase('tr');
  const filtered = devices.filter((device) => {
    if (filterStatus && getStatus(device, now) !== filterStatus) return false;
    if (portsOnly && device.portDownCount === 0) return false;
    return !query || [device.name, device.managementIp, device.vendor, deviceType(device.type)].some((value) => value?.toLocaleLowerCase('tr').includes(query));
  }).sort((a, b) => {
    const byName = a.name.localeCompare(b.name, 'tr', { numeric: true });
    if (sort === 'ports') return b.portDownCount - a.portDownCount || byName;
    if (sort === 'recent') return (Date.parse(b.lastPolledAt || '') || 0) - (Date.parse(a.lastPolledAt || '') || 0) || byName;
    return byName;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const shown = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const hasFilters = !!(query || filterStatus || portsOnly);
  const initialLoading = loading && loadedAt === null;
  function clearFilters() { setSearch(''); setFilterStatus(''); setPortsOnly(false); setPage(1); }
  function chooseStatus(status: string) { setFilterStatus(status); setPage(1); }
  function changePage(nextPage: number) {
    setPage(nextPage);
    document.getElementById('device-list-heading')?.scrollIntoView({ block: 'start' });
  }
  function openRemoval(device: NmsDevice) { setRemoveError(null); setRemoveTarget(device); }
  const stats = [
    { label: 'Toplam cihaz', value: devices.length, detail: counts.unknown ? `${counts.unknown} cihaz ilk veriyi bekliyor` : 'NMS izleme yapılandırıldı', icon: Server, status: '', tone: '' },
    { label: 'Güncel veri', value: counts.online, detail: 'Beklenen sürede veri alındı', icon: CheckCircle2, status: 'online', tone: styles.online },
    { label: 'Veri gecikmesi', value: counts.offline, detail: 'Son veri beklenen süreden eski', icon: Clock3, status: 'offline', tone: styles.offline },
    { label: 'İzleme kapalı', value: counts.disabled, detail: 'Veri toplama durduruldu', icon: PauseCircle, status: 'disabled', tone: styles.disabled },
  ];

  function actions(device: NmsDevice) {
    return <div className={styles.actions}>
      <Button asChild variant="ghost" size="icon" className="h-9 w-9" title="Cihazı görüntüle"><Link href={`/integrations/nms/devices/${device.id}`} aria-label={`${device.name}: cihazı görüntüle`}><Eye aria-hidden="true" className="h-4 w-4" /></Link></Button>
      <Button asChild variant="ghost" size="icon" className="h-9 w-9" title="İzleme ayarlarını düzenle"><Link href={`/integrations/nms/devices/${device.id}/edit`} aria-label={`${device.name}: izleme ayarlarını düzenle`}><Pencil aria-hidden="true" className="h-4 w-4" /></Link></Button>
      <DeviceMenu device={device} onRemove={() => openRemoval(device)} />
    </div>;
  }

  return <div className={cn(styles.page, 'mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8')}>
    <header className={styles.header}>
      <div><div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-primary"><Activity aria-hidden="true" className="h-4 w-4" />NMS İzleme</div><PageHeading section="nms" description={<>Cihazların veri toplama durumunu, kaynak kullanımını ve port uyarılarını takip edin.</>}>İzlenen cihazlar</PageHeading></div>
      <div className={styles.headerActions}><Button variant="outline" className="gap-2" onClick={() => void loadDevices()} disabled={loading}><RefreshCw aria-hidden="true" className={cn('h-4 w-4', loading && 'animate-spin')} />{loading ? 'Yükleniyor…' : 'Yenile'}</Button><Button asChild className="gap-2"><Link href="/integrations/nms/add-device"><Plus aria-hidden="true" className="h-4 w-4" />Cihazı izlemeye al</Link></Button></div>
    </header>

    <div className={styles.stats} aria-label="İzleme durumuna göre filtrele">
      {stats.map(({ label, value, detail, icon: Icon, status, tone }) => <button key={label} type="button" className={cn(styles.stat, filterStatus === status && styles.statSelected)} onClick={() => chooseStatus(status)} aria-pressed={filterStatus === status} disabled={loadedAt === null}>
        <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{label}</span><span className={cn(styles.statIcon, tone)}><Icon aria-hidden="true" className="h-4 w-4" /></span></div><span className="mt-3 block text-3xl font-semibold tabular-nums tracking-tight">{loadedAt === null ? '—' : value}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{detail}</span>
      </button>)}
    </div>

    {notice && <div role="status" className="mb-5 flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span className="flex-1">{notice}</span><button type="button" aria-label="Bildirimi kapat" onClick={() => setNotice('')}><X className="h-4 w-4" /></button></div>}
    {error && loadedAt !== null && <div role="alert" className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm"><AlertCircle className="h-4 w-4 shrink-0 text-destructive" /><p className="min-w-0 flex-1">{uiError(error)} Son başarılı yüklemedeki bilgiler gösteriliyor.</p><Button variant="outline" size="sm" onClick={() => void loadDevices()} disabled={loading}><ActionIcon action="refresh" />Tekrar dene</Button></div>}

    <section className={styles.collection} aria-labelledby="device-list-heading">
      <div className={styles.collectionHeader}><div><h2 id="device-list-heading" className="flex items-center gap-2 font-semibold"><Network aria-hidden="true" className="h-4 w-4 text-primary" />Cihaz listesi<span className="rounded-full border border-border bg-muted/30 px-2 py-0.5 text-xs font-medium tabular-nums">{loadedAt === null ? '—' : devices.length}</span></h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Son başarılı veri toplama durumudur. Liste 60 saniyede bir yenilenir.</p></div><span role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 aria-hidden="true" className="h-3.5 w-3.5" />{loading ? 'Liste güncelleniyor…' : loadedAt ? `Son yenileme ${new Date(loadedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}` : 'Henüz yüklenmedi'}</span></div>
      <div className={styles.toolbar}>
        <div className={styles.search}><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Cihaz ara" placeholder="Cihaz adı, IP adresi veya üretici ara…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="pl-9 pr-10" />{search && <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-8 w-8" aria-label="Aramayı temizle" onClick={() => { setSearch(''); setPage(1); }}><X className="h-3.5 w-3.5" /></Button>}</div>
        <label className={styles.selectWrap}><Filter aria-hidden="true" className="h-4 w-4 text-muted-foreground" /><span className="sr-only">İzleme durumu</span><select aria-label="İzleme durumu" value={filterStatus} onChange={(event) => chooseStatus(event.target.value)}><option value="">Tüm durumlar</option>{Object.entries(statusInfo).map(([value, info]) => <option key={value} value={value}>{info.label}</option>)}</select></label>
        <label className={styles.selectWrap}><ArrowDownUp aria-hidden="true" className="h-4 w-4 text-muted-foreground" /><span className="sr-only">Sıralama</span><select aria-label="Sıralama" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="name">Cihaz adına göre</option><option value="recent">En son veri alınan</option><option value="ports">En çok port uyarısı</option></select></label>
      </div>
      <div className={styles.filterBar}>
        <Button type="button" variant="outline" size="sm" aria-pressed={portsOnly} onClick={() => { setPortsOnly((value) => !value); setPage(1); }} className={cn('h-8 gap-1.5 text-xs', portsOnly && 'border-primary/40 bg-primary/5')}><Cable aria-hidden="true" className="h-3.5 w-3.5" />Port uyarısı olanlar<span className="ml-1 tabular-nums">{loadedAt === null ? '—' : portAffected}</span></Button>
        {counts.unknown > 0 && <Button type="button" variant="outline" size="sm" aria-pressed={filterStatus === 'unknown'} className={cn('h-8 gap-1.5 text-xs', filterStatus === 'unknown' && 'border-primary/40 bg-primary/5')} onClick={() => chooseStatus(filterStatus === 'unknown' ? '' : 'unknown')}><Clock3 aria-hidden="true" className="h-3.5 w-3.5" />Veri bekleyenler<span className="ml-1 tabular-nums">{counts.unknown}</span></Button>}
        {hasFilters && <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={clearFilters}><X aria-hidden="true" className="h-3.5 w-3.5" />Filtreleri temizle</Button>}
        <div className={styles.resultBar}><p role="status" className="text-xs text-muted-foreground">{loadedAt !== null ? `${filtered.length} / ${devices.length} cihaz` : 'Cihazlar yükleniyor'}</p>{loadedAt !== null && totalPages > 1 && <nav aria-label="Cihaz listesi üst sayfalama" className="flex items-center gap-2"><Button variant="outline" size="icon" className="h-8 w-8" aria-label="Önceki cihaz sayfası" disabled={currentPage === 1} onClick={() => changePage(currentPage - 1)}><ChevronLeft className="h-4 w-4" /></Button><span className="min-w-10 text-center text-xs tabular-nums">{currentPage} / {totalPages}</span><Button variant="outline" size="icon" className="h-8 w-8" aria-label="Sonraki cihaz sayfası" disabled={currentPage === totalPages} onClick={() => changePage(currentPage + 1)}><ChevronRight className="h-4 w-4" /></Button></nav>}</div>
      </div>
      {(query || filterStatus) && <div className={styles.activeFilters} aria-label="Aktif filtreler">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Filter aria-hidden="true" className="h-3.5 w-3.5" />Aktif filtreler</span>
        {query && <button type="button" className={styles.filterChip} onClick={() => { setSearch(''); setPage(1); }} aria-label={`Arama filtresini kaldır: ${search.trim()}`}><Search aria-hidden="true" className="h-3 w-3 shrink-0" /><span>{search.trim()}</span><X aria-hidden="true" className="h-3 w-3 shrink-0" /></button>}
        {filterStatus && <button type="button" className={styles.filterChip} onClick={() => chooseStatus('')} aria-label={`${statusInfo[filterStatus as DeviceStatus].label} durum filtresini kaldır`}><StatusBadge status={filterStatus as DeviceStatus} /><X aria-hidden="true" className="h-3 w-3 shrink-0" /></button>}
      </div>}

      <div aria-busy={loading}>
        {initialLoading ? <div className={styles.empty} role="status"><Loader2 className="mb-3 h-7 w-7 animate-spin text-primary" /><p className="text-sm font-medium">İzlenen cihazlar yükleniyor…</p><p className="mt-1 text-xs text-muted-foreground">İzleme ve port bilgileri hazırlanıyor.</p></div>
        : error && loadedAt === null ? <div className={styles.empty} role="alert"><span className={cn(styles.emptyIcon, styles.offline)}><AlertCircle className="h-6 w-6" /></span><h3 className="font-semibold">Cihaz listesine ulaşılamadı</h3><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{uiError(error)}</p><Button variant="outline" className="mt-5 gap-2" onClick={() => void loadDevices()}><RefreshCw className="h-4 w-4" />Tekrar dene</Button></div>
        : filtered.length === 0 ? <div className={styles.empty}><span className={styles.emptyIcon}>{hasFilters ? <Search className="h-6 w-6" /> : <Server className="h-6 w-6" />}</span><h3 className="font-semibold">{hasFilters ? 'Filtrelere uygun cihaz bulunamadı' : 'Henüz izlenen cihaz yok'}</h3><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{hasFilters ? 'Başka bir cihaz adı veya IP adresi deneyin ya da filtreleri temizleyin.' : 'Envanterdeki bir cihaz için SNMP bağlantısını yapılandırarak izlemeyi başlatın.'}</p>{hasFilters ? <Button variant="outline" className="mt-5" onClick={clearFilters}>Filtreleri temizle</Button> : <Button asChild className="mt-5 gap-2"><Link href="/integrations/nms/add-device"><Plus className="h-4 w-4" />İlk cihazı izlemeye al</Link></Button>}</div>
        : <>
          <div className={styles.tableWrap}><table className={styles.table}><caption className="sr-only">NMS izlenen cihazlar ve son veri toplama durumları</caption><thead><tr>{tableColumns.map(({label, icon: Icon}) => <th scope="col" key={label}><span className={styles.columnLabel}><Icon aria-hidden="true" className="h-3.5 w-3.5" />{label}</span></th>)}</tr></thead><tbody>{shown.map((device) => <tr key={device.id}><td><DeviceIdentity device={device} /></td><td><p className="font-mono text-xs">{device.managementIp || 'Girilmedi'}</p><p className="mt-1 text-xs text-muted-foreground">{snmpLabel(device)}</p></td><td><StatusBadge status={getStatus(device, now)} /></td><td><LastPoll device={device} now={now} /></td><td><Resources device={device} now={now} /></td><td><PortIssues device={device} now={now} /></td><td>{actions(device)}</td></tr>)}</tbody></table></div>
          <div className={styles.mobileList}>{shown.map((device) => <article key={device.id} className={styles.deviceCard}><div className="flex items-start justify-between gap-2"><DeviceIdentity device={device} /><DeviceMenu device={device} onRemove={() => openRemoval(device)} /></div><div className="mt-4 flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-1.5 font-mono text-xs"><MapPin aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />{device.managementIp || 'IP girilmedi'}</span><StatusBadge status={getStatus(device, now)} /></div><div className={styles.cardMetrics}><div><span className={styles.smallLabel}><Clock3 aria-hidden="true" className="h-3.5 w-3.5" />Son veri</span><LastPoll device={device} now={now} /></div><div><span className={styles.smallLabel}><Cpu aria-hidden="true" className="h-3.5 w-3.5" />Kaynak kullanımı</span><Resources device={device} now={now} /></div></div><div className={styles.cardFooter}><PortIssues device={device} now={now} /><Button variant="ghost" size="sm" className="h-8 gap-1.5" asChild><Link href={`/integrations/nms/devices/${device.id}`}><Eye aria-hidden="true" className="h-3.5 w-3.5" />Cihazı aç<ArrowRight aria-hidden="true" className="h-3.5 w-3.5" /></Link></Button></div></article>)}</div>
        </>}
      </div>
      {filtered.length > 0 && loadedAt !== null && <footer className={styles.pagination}><p className="text-xs text-muted-foreground"><span className="font-medium tabular-nums text-foreground">{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)}</span> / {filtered.length} cihaz</p><label className="flex items-center gap-2 text-xs text-muted-foreground">Sayfa başına<select aria-label="Sayfa başına cihaz" className={styles.pageSize} value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>{[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}</select></label><nav aria-label="Cihaz listesi sayfaları" className="flex items-center gap-2"><Button variant="outline" size="icon" className="h-8 w-8" aria-label="Önceki sayfa" disabled={currentPage === 1} onClick={() => changePage(currentPage - 1)}><ChevronLeft className="h-4 w-4" /></Button><span role="status" className="min-w-14 text-center text-xs tabular-nums">{currentPage} / {totalPages}</span><Button variant="outline" size="icon" className="h-8 w-8" aria-label="Sonraki sayfa" disabled={currentPage === totalPages} onClick={() => changePage(currentPage + 1)}><ChevronRight className="h-4 w-4" /></Button></nav></footer>}
    </section>
    <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground"><ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />İzleme ayarları mevcut envanter kaydı üzerinden yönetilir. Veri güncelliği bir bağlantı testi değildir.</p>

    <AlertDialog open={!!removeTarget} onOpenChange={(open) => { if (!open && !deleting) setRemoveTarget(null); }}><AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg"><AlertDialogHeader><AlertDialogTitle>Bu cihaz için NMS izleme kaldırılsın mı?</AlertDialogTitle><AlertDialogDescription><span className="font-medium text-foreground">{removeTarget?.name}</span> cihazının ana envanter kaydı korunur. NMS bağlantı ayarları ile port, ölçüm, topoloji ve yedek geçmişi kalıcı olarak silinir.</AlertDialogDescription></AlertDialogHeader>{removeError && <p role="alert" className="text-sm text-destructive">{uiError(removeError)}</p>}<AlertDialogFooter><AlertDialogCancel disabled={deleting}>Vazgeç</AlertDialogCancel><Button variant="destructive" className="gap-2" disabled={deleting} onClick={() => void removeMonitoring()}>{deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}{deleting ? 'Kaldırılıyor…' : 'İzlemeyi kaldır'}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}

function snmpLabel(device: NmsDevice) {
  const version = device.snmpVersion?.replace(/^v/i, '');
  return version ? `SNMPv${version} · ${device.snmpPort ?? 161}` : 'SNMP yapılandırıldı';
}
function DeviceIdentity({ device }: { device: NmsDevice }) {
  const Icon = device.type === 'ROUTER' ? Router : device.type === 'FIREWALL' ? ShieldCheck : device.type === 'SWITCH' ? Network : device.type === 'STORAGE' ? Database : device.type === 'VIRTUAL_MACHINE' ? Monitor : Server;
  return <div className="flex min-w-0 items-start gap-2.5"><span className={styles.deviceIcon}><Icon aria-hidden="true" className="h-4 w-4" /></span><div className="min-w-0"><Link className={styles.deviceName} href={`/integrations/nms/devices/${device.id}`}>{device.name}</Link><p className="mt-1 text-xs text-muted-foreground">{[device.vendor, deviceType(device.type)].filter(Boolean).join(' · ')}</p></div></div>;
}
function StatusBadge({ status }: { status: DeviceStatus }) {
  const { label, icon: Icon } = statusInfo[status];
  return <SemanticBadge icon={Icon} tone={status === 'online' ? 'success' : status === 'offline' ? 'danger' : status === 'unknown' ? 'info' : 'neutral'}>{label}</SemanticBadge>;
}
function LastPoll({ device, now }: { device: NmsDevice; now: number }) {
  return <div><time className="whitespace-nowrap text-xs" dateTime={device.lastPolledAt || undefined} title={device.lastPolledAt ? new Date(device.lastPolledAt).toLocaleString('tr-TR') : undefined}>{formatRelative(device.lastPolledAt, now)}</time><p className="mt-1 text-xs text-muted-foreground">{device.pollingEnabled ? formatInterval(device.pollingInterval) : 'Veri toplama kapalı'}</p></div>;
}
function Resources({ device, now }: { device: NmsDevice; now: number }) {
  const health = device.latestHealth;
  if (!health || (health.cpuUsage == null && health.memoryUsage == null)) return <span className="text-xs text-muted-foreground">Henüz veri yok</span>;
  const stale = getStatus(device, now) !== 'online' || !Number.isFinite(Date.parse(health.collectedAt)) || now - Date.parse(health.collectedAt) >= (device.pollingInterval ?? 300) * 2500;
  return <div className={cn(styles.resources, stale && styles.stale)} title={`Ölçüm: ${new Date(health.collectedAt).toLocaleString('tr-TR')}${stale ? ' · Güncel olmayan son ölçüm' : ''}`}><ResourceMeter label="CPU" icon={Cpu} value={health.cpuUsage} /><ResourceMeter label="Bellek" icon={MemoryStick} value={health.memoryUsage} />{stale && <span className="flex items-center gap-1 text-[10px]"><Clock3 aria-hidden="true" className="h-3 w-3" />Son ölçüm</span>}</div>;
}

function ResourceMeter({ label, icon: Icon, value }: { label: string; icon: LucideIcon; value: number | null }) {
  const measured = value != null && Number.isFinite(value);
  const percent = measured ? Math.min(100, Math.max(0, value)) : 0;
  return <div className={styles.resourceMeter}>
    <div className={styles.resourceValue}><span><Icon aria-hidden="true" className="h-3 w-3" />{label}</span><strong>{measured ? `%${Math.round(value)}` : '—'}</strong></div>
    <div aria-hidden="true" className={styles.meterTrack}><span className={styles.meterFill} style={{width: `${percent}%`}} /></div>
  </div>;
}
function PortIssues({ device, now }: { device: NmsDevice; now: number }) {
  if (!device.lastPolledAt) return <span className="text-xs text-muted-foreground">Henüz veri yok</span>;
  if (!device.portDownCount) return <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />Uyarı yok</span>;
  return <Link href={`/integrations/nms/devices/${device.id}`} className={cn(styles.portBadge, getStatus(device, now) !== 'online' && styles.stale)} aria-label={`${device.name}: ${device.portDownCount} port uyarısını görüntüle`} title="Yönetimsel olarak açık, bağlantısı kapalı portlar. Ayrıntılar için cihazı açın."><Cable aria-hidden="true" className="h-3.5 w-3.5" />{device.portDownCount} port</Link>;
}
function DeviceMenu({ device, onRemove }: { device: NmsDevice; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label={`${device.name}: diğer işlemler`} title="Diğer işlemler"><MoreHorizontal aria-hidden="true" className="h-4 w-4" /></Button></PopoverTrigger><PopoverContent align="end" className="w-64 p-1.5"><p className="break-words px-2 py-2 text-xs font-medium text-muted-foreground">{device.name}</p><Link className={styles.menuItem} href={`/integrations/nms/devices/${device.id}`}><Eye className="h-4 w-4" />Cihazı görüntüle</Link><Link className={styles.menuItem} href={`/integrations/nms/devices/${device.id}/edit`}><Pencil className="h-4 w-4" />İzleme ayarlarını düzenle</Link><div className="my-1 border-t border-border" /><button type="button" className={cn(styles.menuItem, 'text-destructive')} onClick={() => { setOpen(false); onRemove(); }}><Trash2 className="h-4 w-4" />NMS izlemeyi kaldır</button></PopoverContent></Popover>;
}
