'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, AlertTriangle, ArrowRight, CircleHelp, Clock3, Cpu, Download, Eye, Info, Layers3, MemoryStick, RefreshCw, Search, Server, Unplug, Wrench, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeading } from '@/components/ui/page-heading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCount, formatCpu, formatMemory, hostConnection, hostHealth, hostPower, sumKnown } from '@/lib/virtualization/cluster-workspace';
import { assessHost, clusterLabel, clusterOptions, filterHosts, hostCsv, hostResource } from '@/lib/virtualization/host-workspace';
import type { HostFilters, HostWorkspaceRecord } from '@/lib/virtualization/host-workspace';
import styles from './HostWorkspace.module.css';

export interface HostWorkspaceProps {
  hosts: HostWorkspaceRecord[]; loading: boolean; refreshing: boolean; error: string | null;
  collectedAt: string | null; onRefresh: () => void; focusHostId?: string | null;
}
function Health({ host }: { host: HostWorkspaceRecord }) {
  const health = assessHost(host);
  return <div className={styles.health}><SemanticBadge tone={health.tone} title={health.detail}>{health.label}</SemanticBadge><span>{hostConnection(host.connectionState)}{host.connectionState === 'connected' ? ` · ${hostPower(host.powerState)}` : ''}</span></div>;
}
function Membership({ host, link = false }: { host: HostWorkspaceRecord; link?: boolean }) {
  return <div className={styles.membership}><strong>{host.clusterMembership === 'cluster' ? <Layers3 size={14} /> : <Unplug size={14} />}{clusterLabel(host)}</strong>{host.clusterId && <small>{host.clusterId}</small>}{link && host.clusterId && <Link href={`/virtualization/clusters?clusterId=${encodeURIComponent(host.clusterId)}`}>Kümeyi incele<ArrowRight size={14} /></Link>}</div>;
}
function Resource({ host, resource, detailed = false }: { host: HostWorkspaceRecord; resource: 'cpu' | 'memory'; detailed?: boolean }) {
  const usage = hostResource(host, resource);
  const cpu = resource === 'cpu';
  const format = cpu ? formatCpu : formatMemory;
  const title = cpu ? 'CPU kullanımı' : 'Bellek kullanımı';
  const Icon = cpu ? Cpu : MemoryStick;
  const percent = usage.percent == null ? null : Math.round(usage.percent);
  return <section className={detailed ? styles.resourceDetail : styles.resource} aria-label={`${host.name} ${title}`}>
    {detailed && <div className={styles.resourceTitle}><Icon size={17} /><h3>{title}</h3></div>}
    {detailed && <><strong className={styles.capacity}>{format(usage.total)}</strong><small>{cpu ? host.cpuCores == null ? 'Çekirdek sayısı bilinmiyor' : `${formatCount(host.cpuCores)} fiziksel çekirdek` : 'Fiziksel bellek kapasitesi'}</small></>}
    {percent == null ? <>{!detailed && <strong className={styles.unknownTotal}>{format(usage.total)}</strong>}<span className={styles.unknown}><CircleHelp size={13} />Kullanım verisi yok</span>{!detailed && cpu && <small>{host.cpuCores == null ? 'Çekirdek sayısı bilinmiyor' : `${formatCount(host.cpuCores)} çekirdek`}</small>}</> : <><div className={styles.resourceNumbers}><b>%{percent.toLocaleString('tr-TR')}</b><span>{format(usage.used)} / {format(usage.total)}</span></div><div className={styles.meter} role="meter" aria-label={`${host.name} ${title} oranı`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, percent)} aria-valuetext={`%${percent}`}><i style={{ width: `${Math.min(100, percent)}%` }} /></div><small>{!detailed && cpu ? host.cpuCores == null ? 'Çekirdek sayısı bilinmiyor · ' : `${formatCount(host.cpuCores)} çekirdek · ` : ''}{format(usage.available)} boş{percent > 100 ? ' · Ölçüm kapasiteyi aşıyor' : ''}</small></>}
  </section>;
}
function HostDetails({ host, stale, onClose }: { host: HostWorkspaceRecord; stale: boolean; onClose: () => void }) {
  const health = assessHost(host);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className={styles.dialog}>
    <DialogHeader><DialogTitle className={styles.dialogTitle}><Server size={22} />{host.name}</DialogTitle><DialogDescription>Sunucu sağlığı, küme üyeliği ve fiziksel kaynak kullanımı.</DialogDescription></DialogHeader>
    {stale && <p className={styles.notice} role="status"><AlertTriangle size={16} />Son yenileme başarısız. Son alınan veriler gösteriliyor.</p>}
    <div className={styles.detailHealth}><SemanticBadge tone={health.tone}>{health.label}</SemanticBadge><p>{health.detail}</p></div>
    <div className={styles.stateGrid}><div><Activity size={17} /><span>Bağlantı</span><strong>{hostConnection(host.connectionState)}</strong></div><div><Server size={17} /><span>{host.connectionState === 'connected' ? 'Güç durumu' : 'Son bildirilen güç durumu'}</span><strong>{hostPower(host.powerState)}</strong></div><div><Wrench size={17} /><span>Bakım modu</span><strong>{host.maintenance == null ? 'Bilinmiyor' : host.maintenance ? 'Bakımda' : 'Kapalı'}</strong></div></div>
    <p className={styles.reportedHealth}>vCenter sağlık bildirimi: {hostHealth(host.overallStatus)}</p>
    <div className={styles.clusterPanel}><div><Layers3 size={18} /><h3>Bağlı küme</h3></div><Membership host={host} link />{host.clusterMembership === 'standalone' && <p>Bu sunucu bir kümenin üyesi değil; bağımsız çalışıyor.</p>}{host.clusterMembership === 'unknown' && <p>Küme üyeliği kaynaktan doğrulanamadı.</p>}</div>
    <div className={styles.resources}><Resource host={host} resource="cpu" detailed /><Resource host={host} resource="memory" detailed /></div>
    <p className={styles.resourceNote}><Info size={14} />Kullanım fiziksel kapasiteye oranlanır. Bağlantısı kesik veya çalışmayan sunucuların eski ölçümleri kullanım olarak gösterilmez.</p>
    <dl className={styles.hardware}><div><dt>Üretici</dt><dd>{host.vendor || 'Bilinmiyor'}</dd></div><div><dt>Model</dt><dd>{host.model || 'Bilinmiyor'}</dd></div><div><dt>ESXi sürümü</dt><dd>{host.version || 'Bilinmiyor'}</dd></div><div><dt>Derleme</dt><dd>{host.build || 'Bilinmiyor'}</dd></div><div><dt>Sunucu kimliği</dt><dd>{host.id}</dd></div></dl>
    <DialogFooter className={styles.dialogFooter}><Button variant="outline" onClick={onClose}>Kapat</Button></DialogFooter>
  </DialogContent></Dialog>;
}
const defaultFilters: HostFilters = { search: '', cluster: 'all', health: 'all', connection: 'all' };
export function HostWorkspace({ hosts, loading, refreshing, error, collectedAt, onRefresh, focusHostId }: HostWorkspaceProps) {
  const [filters, setFilters] = useState(defaultFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => { if (focusHostId) setSelected(focusHostId); }, [focusHostId]);
  const clusters = clusterOptions(hosts);
  const filtered = filterHosts(hosts, filters);
  const hasFilters = Object.entries(filters).some(([key, value]) => value !== defaultFilters[key as keyof HostFilters]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const shown = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const detail = hosts.find(host => host.id === selected);
  const known = !loading && (hosts.length > 0 || !error);
  const healths = hosts.map(assessHost);
  const missingCpu = hosts.filter(host => host.cpuCores == null).length;
  const missingMemory = hosts.filter(host => host.totalMemoryBytes == null).length;
  const stats = [
    { title: 'Toplam sunucu', value: String(hosts.length), note: `${hosts.filter(host => host.connectionState === 'connected').length} bağlı · ${clusters.length} küme`, icon: Server },
    { title: 'Dikkat gerektiren', value: String(healths.filter(health => ['warning', 'critical'].includes(health.key)).length), note: `${healths.filter(health => health.key === 'unknown').length} sunucunun sağlığı belirsiz`, icon: Activity },
    { title: 'Fiziksel CPU', value: formatCount(sumKnown(hosts.map(host => host.cpuCores))), note: missingCpu ? `${missingCpu} sunucunun çekirdek bilgisi eksik` : 'Toplam çekirdek', icon: Cpu },
    { title: 'Fiziksel bellek', value: formatMemory(sumKnown(hosts.map(host => host.totalMemoryBytes))), note: missingMemory ? `${missingMemory} sunucunun bellek bilgisi eksik` : 'Toplam kapasite', icon: MemoryStick },
  ];
  const updateFilter = (key: keyof HostFilters, value: string) => { setFilters(current => ({ ...current, [key]: value })); setPage(1); };
  const clear = () => { setFilters(defaultFilters); setPage(1); };
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([hostCsv(filtered)], { type: 'text/csv;charset=utf-8;' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `esxi_sunuculari_${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };
  const identity = (host: HostWorkspaceRecord) => <div className={styles.identity}><span className={styles.hostIcon}><Server size={18} /></span><div><strong>{host.name}</strong><span>{[host.vendor, host.model].filter(Boolean).join(' · ') || 'Donanım bilgisi yok'}</span><small>ESXi {host.version || 'sürümü bilinmiyor'}</small></div></div>;
  const action = (host: HostWorkspaceRecord) => <Button variant="outline" size="sm" onClick={() => setSelected(host.id)} aria-label={`${host.name}: sunucu ayrıntılarını incele`}><Eye size={15} />İncele</Button>;
  return <div className={styles.page}>
    <header className={styles.header}><PageHeading section="hosts" description="Sunucu sağlığını, küme üyeliğini ve CPU/bellek kullanımını birlikte izleyin.">ESXi Sunucuları</PageHeading><div className={styles.actions}><Button variant="outline" onClick={exportCsv} disabled={!known || !filtered.length}><Download size={16} />CSV indir</Button><Button variant="outline" onClick={onRefresh} disabled={loading || refreshing}><RefreshCw size={16} className={loading || refreshing ? 'animate-spin' : ''} />{refreshing ? 'Yenileniyor…' : 'Yenile'}</Button></div></header>
    <section className={styles.metrics} aria-label="ESXi özeti">{stats.map(({ title, value, note, icon: Icon }) => <div key={title}><span className={styles.metricIcon}><Icon size={19} /></span><div><p>{title}</p><strong>{known ? value : '—'}</strong><small>{known ? note : error ? 'Veri alınamadı' : 'Veri bekleniyor'}</small></div></div>)}</section>
    <div className={styles.sourceLine}><span><Clock3 size={14} />{collectedAt && Number.isFinite(Date.parse(collectedAt)) ? `Veri zamanı: ${new Date(collectedAt).toLocaleString('tr-TR')}` : 'Veri zamanı henüz yok'}</span><span>5 dakikada bir otomatik yenilenir</span></div>
    {error && <div className={styles.error} role="alert"><AlertTriangle size={21} /><div><h2>{hosts.length ? 'Veriler yenilenemedi' : 'Sunucu verileri alınamadı'}</h2><p>{error}</p>{hosts.length > 0 && <p>Son alınan veriler gösteriliyor; güncel durum değişmiş olabilir.</p>}<div><Button variant="outline" size="sm" onClick={onRefresh} disabled={loading || refreshing}><RefreshCw size={15} />Tekrar dene</Button><Button variant="outline" size="sm" asChild><Link href="/integrations/vmware">VMware entegrasyonunu aç<ArrowRight size={14} /></Link></Button></div></div></div>}
    {(known || loading) && <><div className={styles.toolbar}><div className={styles.search}><Search size={17} /><Input aria-label="ESXi sunucusu, küme veya model ara" placeholder="Sunucu, küme, üretici veya model ara…" value={filters.search} onChange={event => updateFilter('search', event.target.value)} /></div><select aria-label="Küme filtresi" value={filters.cluster} onChange={event => updateFilter('cluster', event.target.value)}><option value="all">Tüm kümeler</option><option value="standalone">Bağımsız sunucular</option><option value="unknown">Küme bilgisi bilinmeyenler</option>{clusters.map(cluster => <option key={cluster.id} value={cluster.id}>{cluster.name}{clusters.filter(candidate => candidate.name === cluster.name).length > 1 ? ` · ${cluster.id}` : ''}</option>)}</select><select aria-label="Sunucu sağlığı filtresi" value={filters.health} onChange={event => updateFilter('health', event.target.value)}><option value="all">Tüm sağlık durumları</option><option value="healthy">Sağlıklı</option><option value="warning">Uyarı / dikkat gereken</option><option value="critical">Kritik</option><option value="unknown">Sağlık belirsiz</option><option value="maintenance">Bakımda</option></select><select aria-label="Bağlantı filtresi" value={filters.connection} onChange={event => updateFilter('connection', event.target.value)}><option value="all">Tüm bağlantılar</option><option value="connected">Bağlı</option><option value="disconnected">Bağlantı kesik</option><option value="notResponding">Yanıt vermiyor</option><option value="unknown">Bağlantı bilinmiyor</option></select>{hasFilters && <Button variant="ghost" size="sm" onClick={clear}><X size={15} />Temizle</Button>}</div><div className={styles.listHeading}><h2><Server size={17} />ESXi envanteri</h2><span aria-live="polite">{loading ? 'Yükleniyor…' : `${shown.length} sunucu gösteriliyor · ${filtered.length} eşleşme / ${hosts.length} toplam`}</span></div></>}
    {loading ? <div className={styles.empty} role="status"><RefreshCw size={28} className="animate-spin" /><h3>ESXi bilgileri yükleniyor…</h3><p>Sağlık, küme üyeliği ve kullanım ölçümleri alınıyor.</p></div> : !known ? null : !filtered.length ? <div className={styles.empty}><Server size={32} /><h3>{hasFilters ? 'Filtrelere uygun sunucu bulunamadı' : 'Bu kaynakta ESXi sunucusu bulunamadı'}</h3><p>{hasFilters ? 'Arama metnini veya filtreleri değiştirin.' : 'vCenter envanterini ve okuma yetkilerini kontrol edin.'}</p>{hasFilters && <Button variant="outline" onClick={clear}>Filtreleri temizle</Button>}</div> : <><div className={styles.desktopTable} aria-busy={refreshing}><Table><TableHeader><TableRow><TableHead>ESXi sunucusu</TableHead><TableHead>Sağlık / bağlantı</TableHead><TableHead>Bağlı küme</TableHead><TableHead>CPU kullanımı</TableHead><TableHead>Bellek kullanımı</TableHead><TableHead className={styles.actionHeader}>Ayrıntılar</TableHead></TableRow></TableHeader><TableBody>{shown.map(host => <TableRow key={host.id}><TableCell>{identity(host)}</TableCell><TableCell><Health host={host} /></TableCell><TableCell><Membership host={host} /></TableCell><TableCell><Resource host={host} resource="cpu" /></TableCell><TableCell><Resource host={host} resource="memory" /></TableCell><TableCell className={styles.actionCell}>{action(host)}</TableCell></TableRow>)}</TableBody></Table></div><div className={styles.mobileCards}>{shown.map(host => <article key={host.id}>{identity(host)}<Health host={host} /><Membership host={host} /><div className={styles.resources}><Resource host={host} resource="cpu" detailed /><Resource host={host} resource="memory" detailed /></div>{action(host)}</article>)}</div></>}
    {known && filtered.length > 0 && <nav className={styles.pagination} aria-label="ESXi sayfaları"><div><label htmlFor="host-page-size">Sayfa başına</label><select id="host-page-size" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>{[10, 25, 50, 100].map(size => <option value={size} key={size}>{size}</option>)}</select><span>{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} / {filtered.length}</span></div><div><Button size="sm" variant="outline" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1} aria-label="Önceki sayfa"><ChevronLeft size={15} />Önceki</Button><span>{currentPage} / {totalPages}</span><Button size="sm" variant="outline" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= totalPages} aria-label="Sonraki sayfa">Sonraki<ChevronRight size={15} /></Button></div></nav>}
    <p className={styles.note}><Info size={15} />Özetler tüm sunucuları kapsar. Eksik kullanım ölçümleri sıfır sayılmaz; CSV, filtreye uyan tüm sayfalardaki sunucuları içerir.</p>
    {detail && <HostDetails key={detail.id} host={detail} stale={Boolean(error)} onClose={() => setSelected(null)} />}
  </div>;
}
