'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, AlertTriangle, ArrowRight, CircleHelp, Clock3, Cpu, Download, Filter, Info, Layers3, MemoryStick, RefreshCw, Search, Server, ShieldCheck, SlidersHorizontal, Wrench, X } from 'lucide-react';
import { PageHeading } from '@/components/ui/page-heading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { clusterCsv, clusterHealth, clusterUsage, filterClusters, formatCount, formatCpu, formatMemory, hostConnection, hostHealth, hostPower, sumKnown } from '@/lib/virtualization/cluster-workspace';
import type { ClusterHost, ClusterWorkspaceRecord } from '@/lib/virtualization/cluster-workspace';
import styles from './ClusterWorkspace.module.css';

export interface ClusterWorkspaceProps {
  clusters: ClusterWorkspaceRecord[]; loading: boolean; refreshing: boolean; error: string | null;
  collectedAt: string | null; onRefresh: () => void;
  focusClusterId?: string | null;
}
function Capacity({ cluster, resource }: { cluster: ClusterWorkspaceRecord; resource: 'cpu' | 'memory' }) {
  const usage = clusterUsage(cluster, resource);
  const Icon = resource === 'cpu' ? Cpu : MemoryStick;
  const format = resource === 'cpu' ? formatCpu : formatMemory;
  const title = resource === 'cpu' ? 'CPU kapasitesi' : 'Bellek kapasitesi';
  const percent = usage.percent == null ? null : Math.round(usage.percent);
  return <section className={styles.capacity} aria-label={`${cluster.name} ${title}`}>
    <div className={styles.capacityTitle}><Icon size={16} aria-hidden="true" /><h3>{title}</h3></div>
    <strong>{format(usage.total)}</strong><span>{resource === 'cpu' ? `${formatCount(cluster.cpuCores)} fiziksel çekirdek` : 'Fiziksel toplam bellek'}</span>
    {percent == null ? <div className={styles.unknownUsage}><CircleHelp size={14} aria-hidden="true" />Kullanım verisi eksik</div> : <><div className={styles.usageLabel}><span>Kullanım</span><b>%{percent.toLocaleString('tr-TR')}</b></div><div className={styles.meter} role="meter" aria-label={`${cluster.name} ${title} kullanımı`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, percent)} aria-valuetext={`%${percent}`}><i style={{ width: `${Math.min(100, percent)}%` }} /></div><p>{format(usage.used)} kullanılıyor · {format(usage.available)} boş</p></>}
  </section>;
}
function Availability({ value, title }: { value: boolean | null; title: string }) {
  return <SemanticBadge tone={value == null ? 'neutral' : value ? 'info' : 'neutral'} icon={title === 'HA' ? ShieldCheck : SlidersHorizontal}>{title}: {value == null ? 'Bilinmiyor' : value ? 'Açık' : 'Kapalı'}</SemanticBadge>;
}
function HostState({ host }: { host: ClusterHost }) {
  return <div className={styles.hostBadges}><SemanticBadge tone={host.connectionState === 'connected' ? 'success' : ['disconnected', 'notResponding'].includes(host.connectionState) ? 'danger' : 'neutral'}>{hostConnection(host.connectionState)}</SemanticBadge><SemanticBadge tone={host.overallStatus === 'green' ? 'success' : host.overallStatus === 'red' ? 'danger' : host.overallStatus === 'yellow' ? 'warning' : 'neutral'}>{hostHealth(host.overallStatus)}</SemanticBadge>{host.maintenance === true && <SemanticBadge tone="warning" icon={Wrench}>Bakımda</SemanticBadge>}{host.maintenance == null && <span className={styles.muted}>Bakım bilgisi yok</span>}<span className={styles.muted}>{hostPower(host.powerState)}</span></div>;
}
function HostCapacity({ host, resource }: { host: ClusterHost; resource: 'cpu' | 'memory' }) {
  const cpu = resource === 'cpu';
  const total = cpu ? host.totalCpuMHz : host.totalMemoryBytes;
  const used = cpu ? host.usedCpuMHz : host.usedMemoryBytes;
  const measured = host.connectionState === 'connected' && host.powerState === 'poweredOn' && used != null;
  const format = cpu ? formatCpu : formatMemory;
  return <div className={styles.hostCapacity}><strong>{format(total)}</strong><small>{cpu ? `${formatCount(host.cpuCores)} çekirdek · ` : ''}{measured ? `${format(used)} kullanım` : 'Kullanım bilinmiyor'}</small></div>;
}
function ClusterDetails({ cluster, onClose, stale }: { cluster: ClusterWorkspaceRecord; onClose: () => void; stale: boolean }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const health = clusterHealth(cluster);
  const hosts = cluster.hosts.filter(host => (!search.trim() || host.name.toLocaleLowerCase('tr-TR').includes(search.trim().toLocaleLowerCase('tr-TR'))) && (filter === 'all' || filter === 'maintenance' && host.maintenance || filter === 'connected' && host.connectionState === 'connected' || filter === 'issues' && (host.connectionState !== 'connected' || host.overallStatus !== 'green' || host.maintenance !== false || host.powerState !== 'poweredOn')));
  const hasFilters = Boolean(search) || filter !== 'all';
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className={styles.dialog}>
    <DialogHeader><DialogTitle className={styles.dialogTitle}><Layers3 size={22} aria-hidden="true" />{cluster.name}</DialogTitle><DialogDescription>Bu kümenin sağlığını, fiziksel kapasitesini ve bağlı ESXi sunucularını inceleyin.</DialogDescription></DialogHeader>
    {stale && <p className={styles.notice} role="status"><AlertTriangle size={16} />Son yenileme başarısız. Son alınan veriler gösteriliyor.</p>}
    <div className={styles.detailHealth}><SemanticBadge tone={health.tone}>{health.label}</SemanticBadge><p>{health.detail}</p><span>vCenter sağlığı: {hostHealth(cluster.overallStatus)}</span></div>
    <div className={styles.detailFacts}><div><Server size={17} /><span>Bağlı / toplam ESXi</span><strong>{cluster.hosts.filter(host => host.connectionState === 'connected').length} / {cluster.hostCount}</strong></div><div><Activity size={17} /><span>Kaynak sağlayan</span><strong>{formatCount(cluster.effectiveHosts)}</strong></div><div><Wrench size={17} /><span>Bakım modunda</span><strong>{cluster.hosts.filter(host => host.maintenance).length}</strong></div></div>
    <div className={styles.resources}><Capacity cluster={cluster} resource="cpu" /><Capacity cluster={cluster} resource="memory" /></div>
    <p className={styles.resourceNote}><Info size={14} />Toplam kapasite fiziksel kaynakları gösterir; HA için ayrılan kapasite düşülmez. Kullanım, tüm sunucuların ölçümleri mevcutsa gösterilir.</p>
    <div className={styles.features}><Availability value={cluster.haEnabled} title="HA" /><Availability value={cluster.drsEnabled} title="DRS" /><span>HA: yüksek erişilebilirlik · DRS: kaynak dengeleme</span></div>
    <div className={styles.listHeading}><h3><Server size={17} />Kümeye bağlı ESXi sunucuları</h3><span>{hosts.length} / {cluster.hostCount} sunucu</span></div>
    {cluster.hosts.length !== cluster.hostCount && <p className={styles.notice}><AlertTriangle size={16} />Sunucu listesi ile küme özeti eşleşmiyor. Kapasite kullanımı eksik olabilir; verileri yenileyin.</p>}
    <div className={styles.hostToolbar}><div className={styles.search}><Search size={16} /><Input aria-label="Kümedeki ESXi sunucusunu ara" placeholder="Sunucu adı ara…" value={search} onChange={event => setSearch(event.target.value)} /></div><select aria-label="ESXi sunucusu durum filtresi" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">Tüm sunucular</option><option value="connected">Bağlı sunucular</option><option value="maintenance">Bakım modundakiler</option><option value="issues">Dikkat gerektirenler</option></select></div>
    {hosts.length ? <><div className={styles.hostTable}><Table><TableHeader><TableRow><TableHead>ESXi sunucusu</TableHead><TableHead>Bağlantı ve sağlık</TableHead><TableHead>CPU</TableHead><TableHead>Bellek</TableHead><TableHead>Sürüm</TableHead></TableRow></TableHeader><TableBody>{hosts.map(host => <TableRow key={host.id}><TableCell><strong className={styles.hostName}><Server size={15} />{host.name}</strong><small className={styles.muted}>{host.id}</small></TableCell><TableCell><HostState host={host} /></TableCell><TableCell><HostCapacity host={host} resource="cpu" /></TableCell><TableCell><HostCapacity host={host} resource="memory" /></TableCell><TableCell>{host.version || 'Bilinmiyor'}</TableCell></TableRow>)}</TableBody></Table></div><div className={styles.hostCards}>{hosts.map(host => <article key={host.id}><strong className={styles.hostName}><Server size={16} />{host.name}</strong><HostState host={host} /><dl><div><dt>CPU</dt><dd><HostCapacity host={host} resource="cpu" /></dd></div><div><dt>Bellek</dt><dd><HostCapacity host={host} resource="memory" /></dd></div><div><dt>ESXi sürümü</dt><dd>{host.version || 'Bilinmiyor'}</dd></div></dl></article>)}</div></> : <div className={styles.empty}><Server size={26} /><h3>{hasFilters ? 'Filtrelere uygun sunucu yok' : 'Bu kümede ESXi sunucusu bulunmuyor'}</h3>{hasFilters && <Button variant="outline" onClick={() => { setSearch(''); setFilter('all'); }}>Sunucu filtrelerini temizle</Button>}</div>}
    <div className={styles.dialogFooter}><span>Küme kimliği: {cluster.id}</span><Button variant="outline" onClick={onClose}>Kapat</Button></div>
  </DialogContent></Dialog>;
}
export function ClusterWorkspace({ clusters, loading, refreshing, error, collectedAt, onRefresh, focusClusterId }: ClusterWorkspaceProps) {
  const [search, setSearch] = useState('');
  const [healthFilter, setHealthFilter] = useState('all');
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => { if (focusClusterId) setSelected(focusClusterId); }, [focusClusterId]);
  const filtered = filterClusters(clusters, search, healthFilter);
  const detail = clusters.find(cluster => cluster.id === selected);
  const hasFilters = Boolean(search) || healthFilter !== 'all';
  const clear = () => { setSearch(''); setHealthFilter('all'); };
  const known = !loading && (clusters.length > 0 || !error);
  const issueCount = clusters.filter(cluster => ['warning', 'critical'].includes(clusterHealth(cluster).key)).length;
  const unknownCount = clusters.filter(cluster => clusterHealth(cluster).key === 'unknown').length;
  const totalHosts = clusters.reduce((sum, cluster) => sum + cluster.hostCount, 0);
  const connected = clusters.reduce((sum, cluster) => sum + cluster.hosts.filter(host => host.connectionState === 'connected').length, 0);
  const stats = [
    { title: 'Toplam küme', value: String(clusters.length), note: `${issueCount} dikkat gerektiren${unknownCount ? ` · ${unknownCount} sağlık belirsiz` : ''}`, icon: Layers3 },
    { title: 'ESXi bağlantısı', value: `${connected} / ${totalHosts}`, note: 'Bağlı / toplam sunucu', icon: Server },
    { title: 'Fiziksel CPU', value: formatCount(sumKnown(clusters.map(cluster => cluster.cpuCores))), note: 'Toplam çekirdek', icon: Cpu },
    { title: 'Fiziksel bellek', value: formatMemory(sumKnown(clusters.map(cluster => cluster.totalMemoryBytes))), note: 'Toplam kapasite', icon: MemoryStick },
  ];
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([clusterCsv(filtered)], { type: 'text/csv;charset=utf-8;' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `kumeler_${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };
  return <div className={styles.page}>
    <header className={styles.header}><PageHeading section="clusters" description="Küme sağlığını, ESXi bağlantılarını ve kaynak kapasitesini birlikte izleyin.">Kümeler</PageHeading><div className={styles.actions}><Button variant="outline" onClick={exportCsv} disabled={!known || !filtered.length}><Download size={16} />CSV indir</Button><Button variant="outline" onClick={onRefresh} disabled={loading || refreshing}><RefreshCw size={16} className={refreshing || loading ? 'animate-spin' : ''} />{refreshing ? 'Yenileniyor…' : 'Yenile'}</Button></div></header>
    <section className={styles.metrics} aria-label="Küme özeti">{stats.map(({ title, value, note, icon: Icon }) => <div key={title}><span className={styles.metricIcon}><Icon size={19} aria-hidden="true" /></span><div><p>{title}</p><strong>{known ? value : '—'}</strong><small>{known ? note : error ? 'Veri alınamadı' : 'Veri bekleniyor'}</small></div></div>)}</section>
    <div className={styles.sourceLine}><span><Clock3 size={14} />{collectedAt && Number.isFinite(Date.parse(collectedAt)) ? `Veri zamanı: ${new Date(collectedAt).toLocaleString('tr-TR')}` : 'Veri zamanı henüz yok'}</span><span>5 dakikada bir otomatik yenilenir</span></div>
    {error && <div className={styles.error} role="alert"><AlertTriangle size={21} /><div><h2>{clusters.length ? 'Veriler yenilenemedi' : 'Küme verileri alınamadı'}</h2><p>{error}</p>{clusters.length > 0 && <p>Son alınan veriler gösteriliyor; güncel durum değişmiş olabilir.</p>}<div><Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}><RefreshCw size={15} />Tekrar dene</Button><Button variant="outline" size="sm" asChild><Link href="/integrations/vmware">VMware entegrasyonunu aç<ArrowRight size={14} /></Link></Button></div></div></div>}
    <div className={styles.toolbar}><div className={styles.search}><Search size={17} aria-hidden="true" /><Input aria-label="Küme veya ESXi sunucusu ara" placeholder="Küme veya ESXi sunucusu ara…" value={search} onChange={event => setSearch(event.target.value)} /></div><label className={styles.filter}><Filter size={15} aria-hidden="true" /><select aria-label="Küme sağlığı filtresi" value={healthFilter} onChange={event => setHealthFilter(event.target.value)}><option value="all">Tüm sağlık durumları</option><option value="healthy">Sağlıklı</option><option value="warning">Uyarı / dikkat gereken</option><option value="critical">Kritik</option><option value="unknown">Sağlık belirsiz</option><option value="empty">Sunucu yok</option></select></label>{hasFilters && <Button variant="ghost" size="sm" onClick={clear}><X size={15} />Temizle</Button>}</div>
    <div className={styles.listHeading}><h2><Layers3 size={17} />Küme görünümü</h2><span>{loading ? 'Yükleniyor…' : known ? `${filtered.length} / ${clusters.length} küme` : 'Veri alınamadı'}</span></div>
    {loading ? <div className={styles.empty} role="status"><RefreshCw size={28} className="animate-spin" /><h3>Küme bilgileri yükleniyor…</h3><p>Sağlık, sunucular ve kapasite bilgileri birlikte alınıyor.</p></div> : !known ? null : !filtered.length ? <div className={styles.empty}><Layers3 size={32} /><h3>{hasFilters ? 'Filtrelere uygun küme bulunamadı' : 'Bu kaynakta küme bulunamadı'}</h3><p>{hasFilters ? 'Küme adı, sunucu adı veya sağlık filtresini değiştirin.' : 'vCenter üzerinde küme tanımlarını ve envanter okuma yetkisini kontrol edin.'}</p>{hasFilters && <Button variant="outline" onClick={clear}>Filtreleri temizle</Button>}</div> : <div className={styles.clusterGrid} aria-busy={refreshing}>{filtered.map(cluster => {
      const health = clusterHealth(cluster);
      const connectedHosts = cluster.hosts.filter(host => host.connectionState === 'connected').length;
      return <article className={styles.cluster} key={cluster.id}>
        <div className={styles.clusterHeader}><span className={styles.clusterIcon}><Layers3 size={23} /></span><div><h2>{cluster.name}</h2><span>{cluster.id}</span></div><SemanticBadge tone={health.tone}>{health.label}</SemanticBadge></div>
        <p className={styles.healthText}>{health.detail}</p>
        <div className={styles.hostSummary}><span><Server size={17} /><strong>{connectedHosts} / {cluster.hostCount}</strong> ESXi bağlı</span><span>{cluster.effectiveHosts == null ? 'Kaynak sağlayan sunucu sayısı bilinmiyor' : `${formatCount(cluster.effectiveHosts)} sunucu kaynak sağlıyor`}</span></div>
        <div className={styles.resources}><Capacity cluster={cluster} resource="cpu" /><Capacity cluster={cluster} resource="memory" /></div>
        <div className={styles.features}><Availability value={cluster.haEnabled} title="HA" /><Availability value={cluster.drsEnabled} title="DRS" /></div>
        <div className={styles.cardFooter}><span>Sağlık ve kapasite ayrıntıları</span><Button variant="outline" size="sm" onClick={() => setSelected(cluster.id)} aria-label={`${cluster.name}: ESXi sunucularını ve kapasiteyi incele`}>ESXi sunucularını incele<ArrowRight size={15} /></Button></div>
      </article>;
    })}</div>}
    <p className={styles.note}><Info size={15} />Sağlık değerlendirmesi vCenter durumu, sunucu bağlantıları ve bakım bilgilerine dayanır. Eksik ölçümler sıfır kullanım olarak gösterilmez.</p>
    {detail && <ClusterDetails key={detail.id} cluster={detail} onClose={() => setSelected(null)} stale={Boolean(error)} />}
  </div>;
}
