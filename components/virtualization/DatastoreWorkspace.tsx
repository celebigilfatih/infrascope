'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, ChevronLeft, ChevronRight, CircleHelp, Clock3, Database, Download, Eye, HardDrive, Info, PieChart, RefreshCw, Search, Server, X } from 'lucide-react';
import { PageHeading } from '@/components/ui/page-heading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { hostConnection } from '@/lib/virtualization/cluster-workspace';
import { datastoreAccess, datastoreCapacity, datastoreCsv, datastoreHostOptions, datastoreMaintenance, datastoreTotals, datastoreType, datastoreUsage, filterDatastores, formatStorage, mountMode, mountReason, mountState } from '@/lib/virtualization/datastore-workspace';
import type { DatastoreFilters, DatastoreHostMount, DatastoreWorkspaceRecord } from '@/lib/virtualization/datastore-workspace';
import styles from './HostWorkspace.module.css';
import dsStyles from './DatastoreWorkspace.module.css';

export interface DatastoreWorkspaceProps {
  datastores: DatastoreWorkspaceRecord[]; loading: boolean; refreshing: boolean; error: string | null;
  collectedAt: string | null; stale?: boolean; onRefresh: () => void;
}
const percentage = (value: number) => `%${value.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;
function State({ ds }: { ds: DatastoreWorkspaceRecord }) {
  const access = datastoreAccess(ds.accessible);
  return <div className={styles.health}><SemanticBadge tone={access.tone}>{access.label}</SemanticBadge><span>{datastoreMaintenance(ds.maintenanceMode)}</span></div>;
}
function Usage({ ds }: { ds: DatastoreWorkspaceRecord }) {
  const capacity = datastoreCapacity(ds), usage = datastoreUsage(ds);
  return <section className={dsStyles.usage} aria-label={`${ds.name} doluluk`} data-tone={usage.tone}>
    {capacity.percent == null ? <span className={styles.unknown}><CircleHelp size={13} />{capacity.inconsistent ? 'Kapasite ölçümü tutarsız' : ds.accessible === false ? 'Erişim yok; ölçüm doğrulanamıyor' : capacity.valid ? 'Oran hesaplanamıyor' : 'Kapasite verisi yok'}</span> : <><div className={dsStyles.usageHeading}><b>{percentage(capacity.percent)}</b><SemanticBadge tone={usage.tone}>{usage.label}</SemanticBadge></div><div className={`${styles.meter} ${dsStyles.meter}`} role="meter" aria-label={`${ds.name} doluluk oranı`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={capacity.percent} aria-valuetext={percentage(capacity.percent)}><i style={{ width: `${capacity.percent}%` }} /></div></>}
  </section>;
}
function Capacity({ ds }: { ds: DatastoreWorkspaceRecord }) {
  const capacity = datastoreCapacity(ds);
  return <div className={dsStyles.capacityGrid}>{[{ label: 'Toplam kapasite', value: capacity.total, icon: Database }, { label: 'Kullanılan alan', value: capacity.used, icon: PieChart }, { label: 'Boş alan', value: capacity.free, icon: HardDrive }].map(({ label, value, icon: Icon }) => <div key={label}><span><Icon size={16} />{label}</span><strong>{formatStorage(value)}</strong></div>)}</div>;
}
function HostSummary({ ds }: { ds: DatastoreWorkspaceRecord }) {
  const problems = ds.hosts?.filter(host => host.mounted === false || host.accessible === false).length || 0;
  const unknown = ds.hosts?.filter(host => mountState(host).tone === 'neutral').length || 0;
  return <div className={dsStyles.hostSummary}><strong><Server size={14} />{ds.hosts === null ? 'Sunucu bilgisi bilinmiyor' : ds.hosts.length ? `${ds.hosts.length} ESXi sunucusu` : 'Sunucu bağlantısı yok'}</strong>{ds.hosts?.slice(0, 2).map(host => <small key={host.id}>{host.name}</small>)}{ds.hosts && ds.hosts.length > 2 && <small>+{ds.hosts.length - 2} sunucu daha</small>}{problems > 0 && <span><AlertTriangle size={12} />{problems} bağlantıda erişim sorunu</span>}{unknown > 0 && <small>{unknown} bağlantı doğrulanamadı</small>}</div>;
}
function HostMount({ host }: { host: DatastoreHostMount }) {
  const state = mountState(host), reason = mountReason(host.inaccessibleReason);
  return <article className={dsStyles.hostMount}><div className={dsStyles.hostTitle}><Server size={17} /><div><strong>{host.name}</strong><small>{host.id}</small></div><SemanticBadge tone={state.tone}>{state.label}</SemanticBadge></div><p>vCenter bağlantısı: {hostConnection(host.connectionState)} · {mountMode(host.accessMode)}</p>{reason && <p>{reason}</p>}<Link href={`/virtualization/hosts?hostId=${encodeURIComponent(host.id)}`}>ESXi sunucusunu incele<ArrowRight size={14} /></Link></article>;
}
function DatastoreDetails({ ds, stale, onClose }: { ds: DatastoreWorkspaceRecord; stale: boolean; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const hosts = ds.hosts?.filter(host => [host.name, host.id].some(value => value.toLocaleLowerCase('tr-TR').includes(search.trim().toLocaleLowerCase('tr-TR'))));
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className={styles.dialog}>
    <DialogHeader><DialogTitle className={styles.dialogTitle}><Database size={22} />{ds.name}</DialogTitle><DialogDescription>Kapasite dağılımı ve veri deposuna erişen ESXi sunucuları.</DialogDescription></DialogHeader>
    {stale && <p className={styles.notice} role="status"><AlertTriangle size={16} />Son alınan veriler gösteriliyor; güncel durum değişmiş olabilir.</p>}
    <div className={dsStyles.detailState}><State ds={ds} /><span>{datastoreType(ds.type)}</span></div>
    <Capacity ds={ds} /><Usage ds={ds} />
    <p className={styles.resourceNote}><Info size={14} />Kullanılan alan = toplam kapasite − boş alan. Erişilemeyen veya ölçümü tutarsız depolarda kapasite doğrulanmış sayılmaz.</p>
    <section className={dsStyles.hostSection}><div className={dsStyles.hostSectionHeading}><h3><Server size={17} />ESXi sunucu bağlantıları</h3><span>{ds.hosts === null ? 'Sayı bilinmiyor' : `${ds.hosts.length} sunucu`}</span></div><p>Yapılandırılan sunucuların erişim durumu ayrı gösterilir. Bir deponun erişilebilir olması tüm sunucuların erişebildiği anlamına gelmez.</p>
      {ds.hosts && ds.hosts.length > 0 && <Input aria-label="Bağlı ESXi sunucusu ara" placeholder="Sunucu adı veya kimliği ara…" value={search} onChange={event => setSearch(event.target.value)} />}
      <div className={dsStyles.hostList}>{ds.hosts === null ? <p>Sunucu bağlantıları kaynaktan doğrulanamadı.</p> : ds.hosts.length === 0 ? <p>Bu veri deposu için ESXi bağlantısı bildirilmedi.</p> : hosts?.length === 0 ? <p>Aramaya uygun ESXi sunucusu bulunamadı.</p> : hosts?.map(host => <HostMount key={host.id} host={host} />)}</div>
    </section>
    <dl className={styles.hardware}><div><dt>Veri deposu kimliği</dt><dd>{ds.id}</dd></div><div><dt>Depolama türü</dt><dd>{datastoreType(ds.type)}</dd></div><div><dt>Çoklu sunucu erişimi</dt><dd>{ds.multipleHostAccess == null ? 'Bilinmiyor' : ds.multipleHostAccess ? 'Yapılandırılmış' : 'Yapılandırılmamış'}</dd></div></dl>
    <DialogFooter className={styles.dialogFooter}><Button variant="outline" onClick={onClose}>Kapat</Button></DialogFooter>
  </DialogContent></Dialog>;
}
const defaults: DatastoreFilters = { search: '', type: 'all', host: 'all', access: 'all', usage: 'all' };
export function DatastoreWorkspace({ datastores, loading, refreshing, error, collectedAt, stale = false, onRefresh }: DatastoreWorkspaceProps) {
  const [filters, setFilters] = useState(defaults), [page, setPage] = useState(1), [pageSize, setPageSize] = useState(25), [selected, setSelected] = useState<string | null>(null);
  const filtered = filterDatastores(datastores, filters), hosts = datastoreHostOptions(datastores);
  const types = Array.from(new Set(datastores.map(ds => ds.type))).sort((a, b) => a.localeCompare(b, 'tr-TR'));
  const hasFilters = Object.entries(filters).some(([key, value]) => value !== defaults[key as keyof DatastoreFilters]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)), current = Math.min(page, pages), shown = filtered.slice((current - 1) * pageSize, current * pageSize);
  const detail = datastores.find(ds => ds.id === selected), known = !loading && (datastores.length > 0 || !error), totals = datastoreTotals(datastores);
  const usageWarnings = datastores.filter(ds => ['warning', 'critical'].includes(datastoreUsage(ds).key)).length;
  const scope = totals.omitted ? `${totals.measured} / ${datastores.length} depoda doğrulanan ölçüm` : 'Tüm veri depolarının toplamı';
  const stats = [
    { title: 'Veri deposu', value: String(datastores.length), note: `${datastores.filter(ds => ds.accessible === false).length} erişilemiyor · ${usageWarnings} doluluk uyarısı`, icon: Database },
    { title: 'Toplam kapasite', value: formatStorage(totals.total), note: scope, icon: HardDrive },
    { title: 'Kullanılan alan', value: formatStorage(totals.used), note: scope, icon: PieChart },
    { title: 'Boş alan', value: formatStorage(totals.free), note: scope, icon: HardDrive },
  ];
  const change = (key: keyof DatastoreFilters, value: string) => { setFilters(old => ({ ...old, [key]: value })); setPage(1); };
  const clear = () => { setFilters(defaults); setPage(1); };
  const exportCsv = () => { const url = URL.createObjectURL(new Blob([datastoreCsv(filtered)], { type: 'text/csv;charset=utf-8;' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `veri_depolari_${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url); };
  const identity = (ds: DatastoreWorkspaceRecord) => <div className={styles.identity}><span className={styles.hostIcon}><Database size={18} /></span><div><strong>{ds.name}</strong><span>{datastoreType(ds.type)}</span><small>{ds.id}</small></div></div>;
  const action = (ds: DatastoreWorkspaceRecord) => <Button variant="outline" size="sm" onClick={() => setSelected(ds.id)} aria-label={`${ds.name}: veri deposunu incele`}><Eye size={15} />İncele</Button>;
  return <div className={styles.page}>
    <header className={styles.header}><PageHeading section="datastores" description="Kapasiteyi, doluluk oranını ve ESXi sunucularının erişim durumunu birlikte izleyin.">Veri Depoları</PageHeading><div className={styles.actions}><Button variant="outline" disabled={!known || !filtered.length} onClick={exportCsv}><Download size={16} />CSV indir</Button><Button variant="outline" disabled={loading || refreshing} onClick={onRefresh}><RefreshCw size={16} className={loading || refreshing ? 'animate-spin' : ''} />{refreshing ? 'Yenileniyor…' : 'Yenile'}</Button></div></header>
    <section className={styles.metrics} aria-label="Veri deposu özeti">{stats.map(({ title, value, note, icon: Icon }) => <div key={title}><span className={styles.metricIcon}><Icon size={19} /></span><div><p>{title}</p><strong>{known ? value : '—'}</strong><small>{known ? note : error ? 'Veri alınamadı' : 'Veri bekleniyor'}</small></div></div>)}</section>
    {known && datastores.length > 0 && <section className={dsStyles.overview} data-tone={totals.percent == null ? 'neutral' : totals.percent >= 90 ? 'danger' : totals.percent >= 75 ? 'warning' : 'success'} aria-label="Genel kapasite dağılımı"><div><h2><PieChart size={17} />Genel doluluk</h2><strong>{totals.percent == null ? 'Oran hesaplanamıyor' : percentage(totals.percent)}</strong></div>{totals.percent != null && <div className={styles.meter} role="meter" aria-label="Genel doluluk oranı" aria-valuemin={0} aria-valuemax={100} aria-valuenow={totals.percent} aria-valuetext={percentage(totals.percent)}><i style={{ width: `${totals.percent}%` }} /></div>}<p>{totals.measured} / {datastores.length} deponun erişilebilir ve tutarlı ölçümü hesaplamaya dahil. Paylaşılan bir depo, sunucu sayısından bağımsız olarak bir kez sayılır.</p></section>}
    <div className={styles.sourceLine}><span><Clock3 size={14} />{collectedAt && Number.isFinite(Date.parse(collectedAt)) ? `Veri zamanı: ${new Date(collectedAt).toLocaleString('tr-TR')}` : 'Veri zamanı henüz yok'}</span><span>5 dakikada bir otomatik yenilenir</span></div>
    {(error || stale) && <div className={styles.error} role="alert"><AlertTriangle size={21} /><div><h2>{!error ? 'Veriler güncel olmayabilir' : datastores.length ? 'Veriler yenilenemedi' : 'Veri deposu bilgileri alınamadı'}</h2><p>{error || 'Önbellekteki veriler gösteriliyor. Güncel durum için Yenile düğmesini kullanın.'}</p>{datastores.length > 0 && <p>Son alınan veriler gösteriliyor; güncel durum değişmiş olabilir.</p>}<div><Button variant="outline" size="sm" disabled={loading || refreshing} onClick={onRefresh}><RefreshCw size={15} />Tekrar dene</Button><Button variant="outline" size="sm" asChild><Link href="/integrations/vmware">VMware entegrasyonunu aç<ArrowRight size={14} /></Link></Button></div></div></div>}
    {(known || loading) && <><div className={styles.toolbar}><div className={styles.search}><Search size={17} /><Input aria-label="Veri deposu veya ESXi sunucusu ara" placeholder="Veri deposu, tür veya ESXi sunucusu ara…" value={filters.search} onChange={event => change('search', event.target.value)} /></div><select aria-label="Depolama türü filtresi" value={filters.type} onChange={event => change('type', event.target.value)}><option value="all">Tüm depolama türleri</option>{types.map(type => <option key={type} value={type}>{datastoreType(type)}</option>)}</select><select aria-label="ESXi sunucusu filtresi" value={filters.host} onChange={event => change('host', event.target.value)}><option value="all">Tüm ESXi sunucuları</option><option value="none">Sunucu bağlantısı olmayanlar</option><option value="unknown">Sunucu bilgisi bilinmeyenler</option>{hosts.map(host => <option key={host.id} value={host.id}>{host.name}{hosts.filter(other => other.name === host.name).length > 1 ? ` · ${host.id}` : ''}</option>)}</select><select aria-label="Depo erişimi filtresi" value={filters.access} onChange={event => change('access', event.target.value)}><option value="all">Tüm erişim durumları</option><option value="accessible">Erişilebilir</option><option value="inaccessible">Erişilemiyor</option><option value="unknown">Erişim bilinmiyor</option></select><select aria-label="Doluluk filtresi" value={filters.usage} onChange={event => change('usage', event.target.value)}><option value="all">Tüm doluluk oranları</option><option value="critical">Kritik · %90 ve üzeri</option><option value="warning">Uyarı · %75–90 arası</option><option value="normal">Normal · %75 altı</option><option value="unknown">Doluluk bilinmiyor</option></select>{hasFilters && <Button variant="ghost" size="sm" onClick={clear}><X size={15} />Temizle</Button>}</div><div className={styles.listHeading}><h2><Database size={17} />Veri deposu envanteri</h2><span aria-live="polite">{loading ? 'Yükleniyor…' : `${shown.length} depo gösteriliyor · ${filtered.length} eşleşme / ${datastores.length} toplam`}</span></div></>}
    {loading ? <div className={styles.empty} role="status"><RefreshCw size={28} className="animate-spin" /><h3>Veri depoları yükleniyor…</h3><p>Kapasite ölçümleri ve ESXi bağlantıları alınıyor.</p></div> : !known ? null : !filtered.length ? <div className={styles.empty}><Database size={32} /><h3>{hasFilters ? 'Filtrelere uygun veri deposu bulunamadı' : 'Bu kaynakta veri deposu bulunamadı'}</h3><p>{hasFilters ? 'Arama metnini veya filtreleri değiştirin.' : 'vCenter envanterini ve okuma yetkilerini kontrol edin.'}</p>{hasFilters && <Button variant="outline" onClick={clear}>Filtreleri temizle</Button>}</div> : <><div className={`${styles.desktopTable} ${dsStyles.table}`} aria-busy={refreshing}><Table><TableHeader><TableRow><TableHead>Veri deposu</TableHead><TableHead>Toplam</TableHead><TableHead>Kullanılan</TableHead><TableHead>Boş alan</TableHead><TableHead>Doluluk</TableHead><TableHead>ESXi sunucuları</TableHead><TableHead>Erişim / bakım</TableHead><TableHead className={styles.actionHeader}>Ayrıntılar</TableHead></TableRow></TableHeader><TableBody>{shown.map(ds => { const capacity = datastoreCapacity(ds); return <TableRow key={ds.id}><TableCell>{identity(ds)}</TableCell><TableCell className={dsStyles.size}>{formatStorage(capacity.total)}</TableCell><TableCell className={dsStyles.size}>{formatStorage(capacity.used)}</TableCell><TableCell className={dsStyles.size}>{formatStorage(capacity.free)}</TableCell><TableCell><Usage ds={ds} /></TableCell><TableCell><HostSummary ds={ds} /></TableCell><TableCell><State ds={ds} /></TableCell><TableCell className={styles.actionCell}>{action(ds)}</TableCell></TableRow>; })}</TableBody></Table></div><div className={styles.mobileCards}>{shown.map(ds => <article key={ds.id}>{identity(ds)}<State ds={ds} /><Capacity ds={ds} /><Usage ds={ds} /><HostSummary ds={ds} />{action(ds)}</article>)}</div></>}
    {known && filtered.length > 0 && <nav className={styles.pagination} aria-label="Veri deposu sayfaları"><div><label htmlFor="datastore-page-size">Sayfa başına</label><select id="datastore-page-size" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>{[10, 25, 50, 100].map(size => <option value={size} key={size}>{size}</option>)}</select><span>{(current - 1) * pageSize + 1}–{Math.min(current * pageSize, filtered.length)} / {filtered.length}</span></div><div><Button size="sm" variant="outline" disabled={current === 1} onClick={() => setPage(current - 1)} aria-label="Önceki sayfa"><ChevronLeft size={15} />Önceki</Button><span>{current} / {pages}</span><Button size="sm" variant="outline" disabled={current >= pages} onClick={() => setPage(current + 1)} aria-label="Sonraki sayfa">Sonraki<ChevronRight size={15} /></Button></div></nav>}
    <p className={styles.note}><Info size={15} />Özetler tüm envanteri, CSV filtreye uyan tüm sayfaları kapsar. Doluluk eşikleri: %75 uyarı, %90 kritik. Kapasite ikili birimlerle (GiB/TiB) gösterilir.</p>
    {detail && <DatastoreDetails key={detail.id} ds={detail} stale={stale || Boolean(error) || refreshing} onClose={() => setSelected(null)} />}
  </div>;
}
