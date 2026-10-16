'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Activity, AlertTriangle, ArrowRight, ChevronLeft, ChevronRight, CircleHelp, Clock3, Cpu, Download, Eye, Info, MemoryStick, Pause, Play, Power, RefreshCw, RotateCcw, Search, Server, SquareStack, X } from 'lucide-react';
import { PageHeading } from '@/components/ui/page-heading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCount, formatMemory, sumKnown } from '@/lib/virtualization/cluster-workspace';
import { filterVMs, formatVMCpu, powerDescription, powerOperations, vmConnection, vmCsv, vmGuestState, vmHealth, vmHostLabel, vmHostOptions, vmPowerState, vmResource } from '@/lib/virtualization/vm-workspace';
import type { VMFilters, VMPowerOperation, VMWorkspaceRecord } from '@/lib/virtualization/vm-workspace';
import { uiError } from '@/lib/i18n/tr';
import styles from './HostWorkspace.module.css';
import vmStyles from './VMWorkspace.module.css';

export interface VMWorkspaceProps {
  vms: VMWorkspaceRecord[]; loading: boolean; refreshing: boolean; error: string | null;
  collectedAt: string | null; canPower: boolean; stale?: boolean; focusVMId?: string | null; onRefresh: () => void;
  onPower: (vm: VMWorkspaceRecord, operation: VMPowerOperation) => Promise<void>;
}
function State({ vm }: { vm: VMWorkspaceRecord }) {
  const health = vmHealth(vm);
  return <div className={styles.health}><SemanticBadge tone={vm.powerState === 'poweredOn' ? 'success' : vm.powerState === 'suspended' ? 'warning' : 'neutral'}>{vmPowerState(vm.powerState)}</SemanticBadge><SemanticBadge tone={health.tone}>{health.label}</SemanticBadge><span>{vmConnection(vm.connectionState)}</span></div>;
}
function Host({ vm, link = false }: { vm: VMWorkspaceRecord; link?: boolean }) {
  return <div className={styles.membership}><strong><Server size={14} />{vmHostLabel(vm)}</strong>{vm.hostId && <small>{vm.hostId}</small>}{link && vm.hostAssignment === 'assigned' && vm.hostId && <Link href={`/virtualization/hosts?hostId=${encodeURIComponent(vm.hostId)}`}>ESXi sunucusunu incele<ArrowRight size={14} /></Link>}</div>;
}
function Resource({ vm, resource, detailed = false }: { vm: VMWorkspaceRecord; resource: 'cpu' | 'memory'; detailed?: boolean }) {
  const cpu = resource === 'cpu', usage = vmResource(vm, resource), format = cpu ? formatVMCpu : formatMemory;
  const title = cpu ? 'CPU kullanımı' : 'Aktif bellek';
  const Icon = cpu ? Cpu : MemoryStick;
  const percent = usage.percent == null ? null : Math.round(usage.percent);
  return <section className={detailed ? styles.resourceDetail : styles.resource} aria-label={`${vm.name} ${title}`}>
    {detailed && <div className={styles.resourceTitle}><Icon size={17} /><h3>{title}</h3></div>}
    <strong className={detailed ? styles.capacity : styles.unknownTotal}>{cpu ? vm.cpuCount == null ? 'Bilinmiyor' : `${formatCount(vm.cpuCount)} vCPU` : formatMemory(vm.memoryBytes)}</strong><small>{cpu ? 'Atanan sanal işlemci' : 'Atanan bellek'}</small>
    {usage.used == null ? <span className={styles.unknown}><CircleHelp size={13} />{usage.measurable ? 'Kullanım verisi yok' : 'Bu durumda ölçüm gösterilmez'}</span> : <><div className={styles.resourceNumbers}><b>{percent == null ? format(usage.used) : `%${percent.toLocaleString('tr-TR')}`}</b><span>{percent == null ? 'Oran hesaplanamıyor' : `${format(usage.used)} / ${format(usage.total)}`}</span></div>{percent != null && <div className={styles.meter} role="meter" aria-label={`${vm.name} ${title} oranı`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, percent)} aria-valuetext={`%${percent}`}><i style={{ width: `${Math.min(100, percent)}%` }} /></div>}<small>{cpu ? 'vCenter CPU üst sınırına göre' : 'Atanan belleğe göre aktif kullanım'}{percent != null && percent > 100 ? ' · Ölçüm sınırı aşıyor' : ''}</small></>}
  </section>;
}
const operationIcons = { on: Play, off: Power, suspend: Pause, reset: RotateCcw };
function VMDetails({ vm, stale, canPower, onPower, onClose }: { vm: VMWorkspaceRecord; stale: boolean; canPower: boolean; onPower: VMWorkspaceProps['onPower']; onClose: () => void }) {
  const [pending, setPending] = useState<VMPowerOperation | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const permitted = canPower && !stale;
  const confirm = async () => {
    if (!pending || inFlight.current) return;
    if (!permitted || !powerOperations(vm).includes(pending)) { setError('VM durumu değişti. Verileri yenileyip işlemi yeniden seçin.'); setPending(null); return; }
    inFlight.current = true; setBusy(true); setError(null); setMessage(null);
    try { await onPower(vm, pending); setPending(null); setMessage('İşlem vCenter’a iletildi. Güncel güç durumunu kontrol edin.'); }
    catch (failure) { setError(uiError(failure, 'Güç işlemi tamamlanamadı.')); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !inFlight.current) onClose(); }}><DialogContent className={styles.dialog}>
    <DialogHeader><DialogTitle className={styles.dialogTitle}><SquareStack size={22} />{vm.name}</DialogTitle><DialogDescription>Çalışma durumu, bağlı ESXi sunucusu ve kaynak kullanımı.</DialogDescription></DialogHeader>
    {stale && <p className={styles.notice} role="status"><AlertTriangle size={16} />Son alınan veriler gösteriliyor. Güç işlemleri için verileri yenileyin.</p>}
    <div className={styles.detailHealth}><State vm={vm} /></div>
    <div className={styles.stateGrid}><div><Power size={17} /><span>Güç durumu</span><strong>{vmPowerState(vm.powerState)}</strong></div><div><Activity size={17} /><span>Yönetim bağlantısı</span><strong>{vmConnection(vm.connectionState)}</strong></div><div><Server size={17} /><span>Konuk işletim sistemi</span><strong>{vmGuestState(vm.guestState)}</strong></div></div>
    <div className={styles.clusterPanel}><div><Server size={18} /><h3>Bağlı ESXi sunucusu</h3></div><Host vm={vm} link /><p>{vm.hostAssignment === 'assigned' ? 'vCenter tarafından bildirilen çalışma sunucusu.' : vm.hostAssignment === 'unassigned' ? 'Bu VM için çalışma sunucusu ataması bildirilmedi.' : 'Sunucu ataması kaynaktan doğrulanamadı.'}</p></div>
    <div className={styles.resources}><Resource vm={vm} resource="cpu" detailed /><Resource vm={vm} resource="memory" detailed /></div>
    <p className={styles.resourceNote}><Info size={14} />CPU oranı çalışma anındaki üst sınıra göredir; garanti edilen kapasite değildir. Aktif bellek, konuk sistemde kullanılan etkin bellektir; kalan miktar boş RAM anlamına gelmez.</p>
    <dl className={styles.hardware}><div><dt>IP adresi</dt><dd>{vm.ip || 'Bilinmiyor'}</dd></div><div><dt>İşletim sistemi</dt><dd>{vm.os || 'Bilinmiyor'}</dd></div><div><dt>VM kimliği</dt><dd>{vm.id}</dd></div><div><dt>Sunucuda tüketilen bellek</dt><dd>{formatMemory(vmResource(vm, 'memory').measurable ? vm.hostMemoryBytes : null)}<small className={vmStyles.subtext}>VM ek yükü dahil</small></dd></div></dl>
    {canPower && <section className={vmStyles.power}><h3><Power size={16} />Güç işlemleri</h3><div className={vmStyles.powerActions}>{powerOperations(vm).map(operation => { const Icon = operationIcons[operation]; return <Button key={operation} variant="outline" size="sm" disabled={!permitted || busy} onClick={() => { setPending(operation); setError(null); setMessage(null); }}><Icon size={15} />{powerDescription(vm, operation).label}</Button>; })}</div>{!powerOperations(vm).length && <p>Güç işlemleri için yönetilebilir bir VM ve bilinen güç durumu gerekir.</p>}
      {pending && <div className={vmStyles.confirm} role="group" aria-label="Güç işlemini onayla"><strong>{powerDescription(vm, pending).label}: {vm.name}</strong><p>{powerDescription(vm, pending).description}</p><div><Button variant="outline" size="sm" disabled={busy} onClick={() => { setPending(null); setError(null); }}>Vazgeç</Button><Button variant={powerDescription(vm, pending).destructive ? 'destructive' : 'default'} size="sm" disabled={busy || !permitted} onClick={confirm}>{busy ? 'İletiliyor…' : 'İşlemi onayla'}</Button></div></div>}
      {error && <p className={vmStyles.failure} role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    </section>}
    <DialogFooter className={styles.dialogFooter}><Button variant="outline" disabled={busy} onClick={onClose}>Kapat</Button></DialogFooter>
  </DialogContent></Dialog>;
}
const defaults: VMFilters = { search: '', state: 'all', host: 'all', health: 'all' };
export function VMWorkspace({ vms, loading, refreshing, error, collectedAt, canPower, stale = false, focusVMId, onRefresh, onPower }: VMWorkspaceProps) {
  const [filters, setFilters] = useState(defaults), [page, setPage] = useState(1), [pageSize, setPageSize] = useState(25), [selected, setSelected] = useState<string | null>(null);
  useEffect(() => { if (focusVMId) setSelected(focusVMId); }, [focusVMId]);
  const hosts = vmHostOptions(vms), filtered = filterVMs(vms, filters);
  const hasFilters = Object.entries(filters).some(([key, value]) => value !== defaults[key as keyof VMFilters]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)), current = Math.min(page, pages), shown = filtered.slice((current - 1) * pageSize, current * pageSize);
  const detail = vms.find(vm => vm.id === selected), known = !loading && (vms.length > 0 || !error);
  const stats = [
    { title: 'Toplam sanal makine', value: String(vms.length), note: `${hosts.length} ESXi sunucusuna atanmış · Şablonlar hariç`, icon: SquareStack },
    { title: 'Çalışan VM', value: String(vms.filter(vm => vm.powerState === 'poweredOn').length), note: `${vms.filter(vm => vm.powerState === 'poweredOff').length} kapalı · ${vms.filter(vm => vm.powerState === 'suspended').length} askıda · ${vms.filter(vm => !['poweredOn', 'poweredOff', 'suspended'].includes(vm.powerState)).length} belirsiz`, icon: Activity },
    { title: 'Atanan vCPU', value: formatCount(vms.length ? sumKnown(vms.map(vm => vm.cpuCount)) : 0), note: vms.some(vm => vm.cpuCount == null) ? 'Eksik veri nedeniyle toplam bilinmiyor' : 'Tüm VM’lere ayrılan sanal işlemci', icon: Cpu },
    { title: 'Atanan bellek', value: formatMemory(vms.length ? sumKnown(vms.map(vm => vm.memoryBytes)) : 0), note: vms.some(vm => vm.memoryBytes == null) ? 'Eksik veri nedeniyle toplam bilinmiyor' : 'Tüm VM’lere ayrılan bellek', icon: MemoryStick },
  ];
  const change = (key: keyof VMFilters, value: string) => { setFilters(old => ({ ...old, [key]: value })); setPage(1); };
  const clear = () => { setFilters(defaults); setPage(1); };
  const exportCsv = () => { const url = URL.createObjectURL(new Blob([vmCsv(filtered)], { type: 'text/csv;charset=utf-8;' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `sanal_makineler_${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url); };
  const identity = (vm: VMWorkspaceRecord) => <div className={styles.identity}><span className={styles.hostIcon}><SquareStack size={18} /></span><div><strong>{vm.name}</strong><span>{vm.os || 'İşletim sistemi bilinmiyor'}</span><small>{vm.ip || 'IP adresi bilinmiyor'}</small></div></div>;
  const action = (vm: VMWorkspaceRecord) => <Button variant="outline" size="sm" onClick={() => setSelected(vm.id)} aria-label={`${vm.name}: sanal makineyi incele`}><Eye size={15} />İncele</Button>;
  return <div className={styles.page}>
    <header className={styles.header}><PageHeading section="vms" description="VM durumunu, bağlı ESXi sunucusunu ve CPU/bellek kullanımını birlikte izleyin.">Sanal Makineler</PageHeading><div className={styles.actions}><Button variant="outline" disabled={!known || !filtered.length} onClick={exportCsv}><Download size={16} />CSV indir</Button><Button variant="outline" disabled={loading || refreshing} onClick={onRefresh}><RefreshCw size={16} className={loading || refreshing ? 'animate-spin' : ''} />{refreshing ? 'Yenileniyor…' : 'Yenile'}</Button></div></header>
    <section className={styles.metrics} aria-label="Sanal makine özeti">{stats.map(({ title, value, note, icon: Icon }) => <div key={title}><span className={styles.metricIcon}><Icon size={19} /></span><div><p>{title}</p><strong>{known ? value : '—'}</strong><small>{known ? note : error ? 'Veri alınamadı' : 'Veri bekleniyor'}</small></div></div>)}</section>
    <div className={styles.sourceLine}><span><Clock3 size={14} />{collectedAt && Number.isFinite(Date.parse(collectedAt)) ? `Veri zamanı: ${new Date(collectedAt).toLocaleString('tr-TR')}` : 'Veri zamanı henüz yok'}</span><span>5 dakikada bir otomatik yenilenir</span></div>
    {(error || stale) && <div className={styles.error} role="alert"><AlertTriangle size={21} /><div><h2>{!error ? 'Veriler güncelleniyor' : vms.length ? 'Veriler yenilenemedi' : 'Sanal makine verileri alınamadı'}</h2><p>{error || 'Önbellekteki veriler gösteriliyor. Güncel durum için Yenile düğmesini kullanın.'}</p>{vms.length > 0 && <p>Son alınan veriler gösteriliyor; güncel durum değişmiş olabilir.</p>}<div><Button variant="outline" size="sm" disabled={loading || refreshing} onClick={onRefresh}><RefreshCw size={15} />Tekrar dene</Button><Button variant="outline" size="sm" asChild><Link href="/integrations/vmware">VMware entegrasyonunu aç<ArrowRight size={14} /></Link></Button></div></div></div>}
    {(known || loading) && <><div className={styles.toolbar}><div className={styles.search}><Search size={17} /><Input aria-label="Sanal makine, ESXi, IP veya işletim sistemi ara" placeholder="VM, ESXi, IP veya işletim sistemi ara…" value={filters.search} onChange={event => change('search', event.target.value)} /></div><select aria-label="VM güç durumu filtresi" value={filters.state} onChange={event => change('state', event.target.value)}><option value="all">Tüm güç durumları</option><option value="poweredOn">Çalışıyor</option><option value="poweredOff">Kapalı</option><option value="suspended">Askıda</option><option value="unknown">Durum bilinmiyor</option></select><select aria-label="ESXi sunucusu filtresi" value={filters.host} onChange={event => change('host', event.target.value)}><option value="all">Tüm ESXi sunucuları</option><option value="unassigned">ESXi atanmamış</option><option value="unknown">ESXi bilgisi bilinmiyor</option>{hosts.map(host => <option key={host.id} value={host.id}>{host.name}{hosts.filter(other => other.name === host.name).length > 1 ? ` · ${host.id}` : ''}</option>)}</select><select aria-label="VM sağlığı filtresi" value={filters.health} onChange={event => change('health', event.target.value)}><option value="all">Tüm sağlık durumları</option><option value="normal">Sağlık normal</option><option value="warning">Uyarı / erişim sorunu</option><option value="critical">Kritik</option><option value="unknown">Sağlık belirsiz</option></select>{hasFilters && <Button variant="ghost" size="sm" onClick={clear}><X size={15} />Temizle</Button>}</div><div className={styles.listHeading}><h2><SquareStack size={17} />Sanal makine envanteri</h2><span aria-live="polite">{loading ? 'Yükleniyor…' : `${shown.length} VM gösteriliyor · ${filtered.length} eşleşme / ${vms.length} toplam`}</span></div></>}
    {loading ? <div className={styles.empty} role="status"><RefreshCw size={28} className="animate-spin" /><h3>Sanal makineler yükleniyor…</h3><p>Çalışma durumu ve kullanım ölçümleri alınıyor.</p></div> : !known ? null : !filtered.length ? <div className={styles.empty}><SquareStack size={32} /><h3>{hasFilters ? 'Filtrelere uygun sanal makine bulunamadı' : 'Bu kaynakta sanal makine bulunamadı'}</h3><p>{hasFilters ? 'Arama metnini veya filtreleri değiştirin.' : 'vCenter envanterini ve okuma yetkilerini kontrol edin. Şablonlar bu listede gösterilmez.'}</p>{hasFilters && <Button variant="outline" onClick={clear}>Filtreleri temizle</Button>}</div> : <><div className={styles.desktopTable} aria-busy={refreshing}><Table><TableHeader><TableRow><TableHead>Sanal makine</TableHead><TableHead>Durum / sağlık</TableHead><TableHead>ESXi sunucusu</TableHead><TableHead>CPU kullanımı</TableHead><TableHead>Aktif bellek</TableHead><TableHead className={styles.actionHeader}>Ayrıntılar</TableHead></TableRow></TableHeader><TableBody>{shown.map(vm => <TableRow key={vm.id}><TableCell>{identity(vm)}</TableCell><TableCell><State vm={vm} /></TableCell><TableCell><Host vm={vm} /></TableCell><TableCell><Resource vm={vm} resource="cpu" /></TableCell><TableCell><Resource vm={vm} resource="memory" /></TableCell><TableCell className={styles.actionCell}>{action(vm)}</TableCell></TableRow>)}</TableBody></Table></div><div className={styles.mobileCards}>{shown.map(vm => <article key={vm.id}>{identity(vm)}<State vm={vm} /><Host vm={vm} /><div className={styles.resources}><Resource vm={vm} resource="cpu" detailed /><Resource vm={vm} resource="memory" detailed /></div>{action(vm)}</article>)}</div></>}
    {known && filtered.length > 0 && <nav className={styles.pagination} aria-label="Sanal makine sayfaları"><div><label htmlFor="vm-page-size">Sayfa başına</label><select id="vm-page-size" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>{[10, 25, 50, 100].map(size => <option value={size} key={size}>{size}</option>)}</select><span>{(current - 1) * pageSize + 1}–{Math.min(current * pageSize, filtered.length)} / {filtered.length}</span></div><div><Button size="sm" variant="outline" disabled={current === 1} onClick={() => setPage(current - 1)} aria-label="Önceki sayfa"><ChevronLeft size={15} />Önceki</Button><span>{current} / {pages}</span><Button size="sm" variant="outline" disabled={current >= pages} onClick={() => setPage(current + 1)} aria-label="Sonraki sayfa">Sonraki<ChevronRight size={15} /></Button></div></nav>}
    <p className={styles.note}><Info size={15} />Özetler tüm VM’leri kapsar. Eksik ölçümler sıfır sayılmaz. CSV, filtreye uyan tüm sayfaları içerir.</p>
    {detail && <VMDetails key={detail.id} vm={detail} stale={stale || Boolean(error) || refreshing} canPower={canPower} onPower={onPower} onClose={() => setSelected(null)} />}
  </div>;
}
