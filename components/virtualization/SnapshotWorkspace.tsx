'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Archive, ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Clock3, Download, Eye, HardDrive, Info, Plus, RefreshCw, RotateCcw, Search, SquareStack, Trash2, X } from 'lucide-react';
import { PageHeading } from '@/components/ui/page-heading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatStorage } from '@/lib/virtualization/datastore-workspace';
import { vmConnection, vmPowerState } from '@/lib/virtualization/vm-workspace';
import { filterSnapshots, snapshotAge, snapshotCreateOptions, snapshotCsv, snapshotDate, snapshotKey, snapshotManageable, snapshotRows, snapshotSize, snapshotSizeTotal, validateSnapshotMutation } from '@/lib/virtualization/snapshot-workspace';
import type { SnapshotCapabilities, SnapshotFilters, SnapshotMutation, SnapshotRow, SnapshotWorkspaceVM } from '@/lib/virtualization/snapshot-workspace';
import { uiError } from '@/lib/i18n/tr';
import styles from './HostWorkspace.module.css';
import snapStyles from './SnapshotWorkspace.module.css';

export interface SnapshotWorkspaceProps {
  vms: SnapshotWorkspaceVM[]; loading: boolean; refreshing: boolean; error: string | null; stale?: boolean;
  collectedAt: string | null; capabilities: SnapshotCapabilities; onRefresh: () => void;
  onMutation: (mutation: SnapshotMutation) => Promise<void>; now?: number;
}
function Age({ row, now }: { row: SnapshotRow; now: number }) {
  const age = snapshotAge(row.snapshot, now);
  return <div className={styles.health}><SemanticBadge tone={age.tone}>{age.label}</SemanticBadge><span>{age.detail}</span></div>;
}
function VM({ row, link = false }: { row: SnapshotRow; link?: boolean }) {
  return <div className={styles.membership}><strong><SquareStack size={15} />{row.vm.name}</strong><small>{row.vm.id}</small>{link && <Link href={`/virtualization/vms?vmId=${encodeURIComponent(row.vm.id)}`}>Sanal makineyi incele<ArrowRight size={14} /></Link>}</div>;
}
function Details({ row, now, blocked, capabilities, onMutation, onClose }: { row: SnapshotRow; now: number; blocked: boolean; capabilities: SnapshotCapabilities; onMutation: SnapshotWorkspaceProps['onMutation']; onClose: () => void }) {
  const [pending, setPending] = useState<'snapshot-delete' | 'snapshot-revert' | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false), manageable = snapshotManageable(row.vm);
  const confirm = async () => {
    if (!pending || inFlight.current) return;
    if (blocked) { setError('İşlem yapmadan önce verileri yenileyin.'); return; }
    inFlight.current = true; setBusy(true); setError(null);
    try { await onMutation({ action: pending, vmId: row.vm.id, snapshotId: row.snapshot.id }); onClose(); }
    catch (failure) { setError(uiError(failure, 'Anlık görüntü işlemi tamamlanamadı.')); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !inFlight.current) onClose(); }}><DialogContent className={styles.dialog}>
    <DialogHeader><DialogTitle className={styles.dialogTitle}><Archive size={22} />{row.snapshot.name}</DialogTitle><DialogDescription>Bağlı sanal makine, oluşturulma zamanı ve ilişkili dosya boyutu.</DialogDescription></DialogHeader>
    {blocked && <p className={styles.notice} role="status"><AlertTriangle size={16} />Son alınan veriler gösteriliyor. İşlem yapmadan önce verileri yenileyin.</p>}
    <div className={snapStyles.detailGrid}><div><span><CalendarDays size={17} />Oluşturulma zamanı (TSİ)</span><strong>{snapshotDate(row.snapshot.createTime)}</strong></div><div><span><Clock3 size={17} />Görüntünün yaşı</span><Age row={row} now={now} /></div><div><span><HardDrive size={17} />İlişkili dosya boyutu</span><strong>{formatStorage(snapshotSize(row))}</strong></div></div>
    <div className={styles.clusterPanel}><div><SquareStack size={18} /><h3>Bağlı sanal makine</h3></div><VM row={row} link /><p>{vmConnection(row.vm.connectionState)} · Güncel güç bildirimi: {vmPowerState(row.vm.powerState)}</p></div>
    <section className={snapStyles.description}><h3>Açıklama</h3><p>{row.snapshot.description || 'Bu anlık görüntü için açıklama girilmemiş.'}</p></section>
    <p className={styles.resourceNote}><Info size={14} />Boyut, görüntünün başvurduğu disk ve durum dosyalarını kapsar; temel diskleri ve paylaşılan dosyaları içerebilir. Silindiğinde açılacak alanı göstermez.</p>
    <dl className={styles.hardware}><div><dt>Anlık görüntü kimliği</dt><dd>{row.snapshot.id}</dd></div><div><dt>Görüntü alındığındaki güç durumu</dt><dd>{vmPowerState(row.snapshot.state)}</dd></div><div><dt>VM’deki görüntü sayısı</dt><dd>{row.vm.snapshots.length}</dd></div></dl>
    {(capabilities.delete || capabilities.revert) && <section className={snapStyles.management}><h3>Görüntü işlemleri</h3>{!manageable && <p>Bu VM için yönetim bağlantısı ve kayıt türü doğrulanamadı. İşlemler kullanılamıyor.</p>}<div>{capabilities.revert && <Button variant="outline" size="sm" disabled={blocked || !manageable || busy} onClick={() => { setPending('snapshot-revert'); setError(null); }}><RotateCcw size={15} />Bu noktaya dön</Button>}{capabilities.delete && <Button variant="outline" size="sm" disabled={blocked || !manageable || busy} onClick={() => { setPending('snapshot-delete'); setError(null); }}><Trash2 size={15} />Görüntüyü sil</Button>}</div>
      {pending && <div className={snapStyles.confirm} role="group" aria-label="Anlık görüntü işlemini onayla"><strong>{pending === 'snapshot-delete' ? 'Görüntüyü sil' : 'Bu noktaya dön'}: {row.snapshot.name}</strong><p><b>Sanal makine: {row.vm.name}</b></p><p>{pending === 'snapshot-delete' ? 'Bu geri dönüş noktası kaldırılacak. VM’nin mevcut durumu korunur; disk birleştirme işlemi zaman alabilir. Görüntüyü silme işlemi geri alınamaz.' : `VM, ${snapshotDate(row.snapshot.createTime)} tarihindeki görüntüye döndürülecek. Bu noktadan sonra yapılan değişiklikler kaybolabilir.`}</p><div><Button variant="outline" size="sm" disabled={busy} onClick={() => { setPending(null); setError(null); }}>Vazgeç</Button><Button variant="destructive" size="sm" disabled={busy || blocked || !manageable} onClick={confirm}>{busy ? 'İletiliyor…' : pending === 'snapshot-delete' ? 'Silmeyi onayla' : 'Geri dönmeyi onayla'}</Button></div></div>}{error && <p className={snapStyles.failure} role="alert">{error}</p>}
    </section>}
    <DialogFooter className={styles.dialogFooter}><Button variant="outline" disabled={busy} onClick={onClose}>Kapat</Button></DialogFooter>
  </DialogContent></Dialog>;
}
function CreateSnapshot({ vms, blocked, onMutation, onClose }: { vms: SnapshotWorkspaceVM[]; blocked: boolean; onMutation: SnapshotWorkspaceProps['onMutation']; onClose: () => void }) {
  const [vmId, setVmId] = useState(''), [name, setName] = useState(''), [description, setDescription] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false), choices = snapshotCreateOptions(vms);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (inFlight.current) return;
    if (blocked) { setError('Oluşturmadan önce verileri yenileyin.'); return; }
    inFlight.current = true; setBusy(true); setError(null);
    try { await onMutation({ action: 'snapshot-create', vmId, name, description }); onClose(); }
    catch (failure) { setError(uiError(failure, 'Anlık görüntü oluşturulamadı.')); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !inFlight.current) onClose(); }}><DialogContent className={snapStyles.createDialog}>
    <DialogHeader><DialogTitle className={styles.dialogTitle}><Plus size={21} />Yeni anlık görüntü</DialogTitle><DialogDescription>VM’yi seçin ve geri dönüş noktasını açıklayan bir ad girin.</DialogDescription></DialogHeader>
    <form noValidate onSubmit={submit} className={snapStyles.form}>
      {blocked && <p className={styles.notice} role="status">Son alınan veriler gösteriliyor. Oluşturmadan önce verileri yenileyin.</p>}
      <div><Label htmlFor="snapshot-vm">Sanal makine</Label><select id="snapshot-vm" value={vmId} onChange={event => setVmId(event.target.value)} disabled={busy} required><option value="">Sanal makine seçin…</option>{choices.map(vm => <option value={vm.id} key={vm.id}>{vm.name}{choices.filter(other => other.name === vm.name).length > 1 ? ` · ${vm.id}` : ''}</option>)}</select><small>Yönetim bağlantısı ve güç durumu bilinen VM’ler listelenir.</small></div>
      <div><Label htmlFor="snapshot-name">Anlık görüntü adı</Label><Input id="snapshot-name" value={name} onChange={event => setName(event.target.value)} disabled={busy} placeholder="Örn. Güncelleme öncesi — 16 Ekim" required /></div>
      <div><Label htmlFor="snapshot-description">Açıklama (isteğe bağlı)</Label><textarea id="snapshot-description" rows={3} value={description} onChange={event => setDescription(event.target.value)} disabled={busy} placeholder="Neden oluşturulduğunu ve ne zaman gözden geçirileceğini yazın…" /></div>
      <p className={styles.resourceNote}><Info size={14} />VM için bir geri dönüş noktası oluşturulur. Bellek içeriği bu işlemde kaydedilmez.</p>
      {error && <p className={snapStyles.failure} role="alert">{error}</p>}
      <DialogFooter className={styles.dialogFooter}><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Vazgeç</Button><Button type="submit" disabled={blocked || busy || !vmId || !name.trim()}><Plus size={15} />{busy ? 'İletiliyor…' : 'Görüntü oluştur'}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}
const defaults: SnapshotFilters = { search: '', vm: 'all', age: 'all', sort: 'oldest' };
export function SnapshotWorkspace({ vms, loading, refreshing, error, collectedAt, stale = false, capabilities, onRefresh, onMutation, now: fixedNow }: SnapshotWorkspaceProps) {
  const [filters, setFilters] = useState(defaults), [page, setPage] = useState(1), [pageSize, setPageSize] = useState(25), [selected, setSelected] = useState<string | null>(null), [creating, setCreating] = useState(false), [notice, setNotice] = useState<string | null>(null), [clock, setClock] = useState(() => Date.now());
  useEffect(() => { if (fixedNow != null) return; const timer = setInterval(() => setClock(Date.now()), 60_000); return () => clearInterval(timer); }, [fixedNow]);
  const now = fixedNow ?? clock, rows = snapshotRows(vms), filtered = filterSnapshots(vms, filters, now), size = snapshotSizeTotal(rows);
  const hasFilters = Object.entries(filters).some(([key, value]) => value !== defaults[key as keyof SnapshotFilters]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)), current = Math.min(page, pages), shown = filtered.slice((current - 1) * pageSize, current * pageSize);
  const detail = rows.find(row => snapshotKey(row) === selected), known = !loading && (vms.length > 0 || !error), blocked = !known || stale || Boolean(error) || refreshing;
  const old = rows.filter(row => ['old', 'veryOld'].includes(snapshotAge(row.snapshot, now).key)), veryOld = old.filter(row => snapshotAge(row.snapshot, now).key === 'veryOld').length;
  const vmChoices = vms.filter(vm => vm.snapshots.length > 0), missingDates = rows.filter(row => snapshotAge(row.snapshot, now).key === 'unknown').length;
  const stats = [
    { title: 'Anlık görüntü', value: String(rows.length), note: `${missingDates} görüntünün yaşı doğrulanamadı`, icon: Archive },
    { title: 'Görüntüsü olan VM', value: String(vmChoices.length), note: `${vms.length} VM içinden`, icon: SquareStack },
    { title: 'Eski görüntüler', value: String(old.length), note: `7 gün ve üzeri · ${veryOld} tanesi 30 gün ve üzeri`, icon: Clock3 },
    { title: 'İlişkili dosya toplamı', value: formatStorage(size.bytes), note: size.bytes == null ? 'Dosya boyutları kaynaktan doğrulanamadı' : size.unknownSnapshots ? `${size.unknownSnapshots} görüntüde eksik ölçüm; toplam kısmi` : 'Her VM’de paylaşılan dosyalar bir kez sayılır', icon: HardDrive },
  ];
  const change = (key: keyof SnapshotFilters, value: string) => { setFilters(old => ({ ...old, [key]: value })); setPage(1); };
  const clear = () => { setFilters(defaults); setPage(1); };
  const mutate = async (mutation: SnapshotMutation) => { if (blocked) throw new Error('İşlem yapmadan önce verileri yenileyin.'); validateSnapshotMutation(vms, mutation, capabilities); await onMutation(mutation); setNotice('İşlem vCenter’a iletildi. Güncel listeyi kontrol edin.'); };
  const exportCsv = () => { const url = URL.createObjectURL(new Blob([snapshotCsv(filtered, now)], { type: 'text/csv;charset=utf-8;' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `anlik_goruntuler_${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url); };
  const identity = (row: SnapshotRow) => <div className={styles.identity}><span className={styles.hostIcon}><Archive size={18} /></span><div><strong>{row.snapshot.name}</strong><span className={snapStyles.excerpt}>{row.snapshot.description || 'Açıklama yok'}</span></div></div>;
  const action = (row: SnapshotRow) => <Button variant="outline" size="sm" onClick={() => setSelected(snapshotKey(row))} aria-label={`${row.vm.name} / ${row.snapshot.name}: görüntüyü incele`}><Eye size={15} />İncele</Button>;
  return <div className={styles.page}>
    <header className={styles.header}><PageHeading section="snapshots" description="Bağlı VM’yi, oluşturulma tarihini, görüntü yaşını ve dosya boyutunu birlikte inceleyin.">Anlık Görüntüler</PageHeading><div className={`${styles.actions} ${snapStyles.actions}`}><Button variant="outline" disabled={!known || !filtered.length} onClick={exportCsv}><Download size={16} />CSV indir</Button><Button variant="outline" disabled={loading || refreshing} onClick={onRefresh}><RefreshCw size={16} className={loading || refreshing ? 'animate-spin' : ''} />{refreshing ? 'Yenileniyor…' : 'Yenile'}</Button>{capabilities.create && <Button disabled={blocked || !snapshotCreateOptions(vms).length} onClick={() => setCreating(true)}><Plus size={16} />Yeni görüntü</Button>}</div></header>
    <section className={styles.metrics} aria-label="Anlık görüntü özeti">{stats.map(({ title, value, note, icon: Icon }) => <div key={title}><span className={styles.metricIcon}><Icon size={19} /></span><div><p>{title}</p><strong>{known ? value : '—'}</strong><small>{known ? note : error ? 'Veri alınamadı' : 'Veri bekleniyor'}</small></div></div>)}</section>
    <div className={styles.sourceLine}><span><Clock3 size={14} />{collectedAt && Number.isFinite(Date.parse(collectedAt)) ? `Veri zamanı: ${snapshotDate(collectedAt)}` : 'Veri zamanı henüz yok'}</span><span>2 dakikada bir yenilenir · Tarihler Türkiye saatiyle (TSİ)</span></div>
    {notice && <p className={snapStyles.notice} role="status"><Info size={16} />{notice}<Button variant="ghost" size="sm" aria-label="İşlem bildirimini kapat" onClick={() => setNotice(null)}><X size={14} /></Button></p>}
    {(error || stale) && <div className={styles.error} role="alert"><AlertTriangle size={21} /><div><h2>{!error ? 'Veriler güncel olmayabilir' : vms.length ? 'Veriler yenilenemedi' : 'Anlık görüntü bilgileri alınamadı'}</h2><p>{error || 'Önbellekteki veriler gösteriliyor. Güncel durum için Yenile düğmesini kullanın.'}</p>{vms.length > 0 && <p>Son alınan veriler korunuyor; işlemler güncel veri alınana kadar kapalı.</p>}<div><Button variant="outline" size="sm" disabled={loading || refreshing} onClick={onRefresh}><RefreshCw size={15} />Tekrar dene</Button><Button variant="outline" size="sm" asChild><Link href="/integrations/vmware">VMware entegrasyonunu aç<ArrowRight size={14} /></Link></Button></div></div></div>}
    {known && old.length > 0 && <div className={snapStyles.oldNotice}><Clock3 size={19} /><p><strong>{old.length} görüntü en az 7 gündür tutuluyor.</strong> {veryOld > 0 ? `${veryOld} tanesi 30 günü doldurmuş. ` : ''}Gerekli olup olmadıklarını gözden geçirin.</p><Button variant="outline" size="sm" onClick={() => change('age', 'old')}>Eskileri göster<ArrowRight size={14} /></Button></div>}
    {(known || loading) && <><div className={styles.toolbar}><div className={styles.search}><Search size={17} /><Input aria-label="Anlık görüntü, VM veya açıklama ara" placeholder="Görüntü, VM veya açıklama ara…" value={filters.search} onChange={event => change('search', event.target.value)} /></div><select aria-label="Sanal makine filtresi" value={filters.vm} onChange={event => change('vm', event.target.value)}><option value="all">Tüm sanal makineler</option>{vmChoices.map(vm => <option value={vm.id} key={vm.id}>{vm.name}{vmChoices.filter(other => other.name === vm.name).length > 1 ? ` · ${vm.id}` : ''}</option>)}</select><select aria-label="Görüntü yaşı filtresi" value={filters.age} onChange={event => change('age', event.target.value)}><option value="all">Tüm yaşlar</option><option value="recent">7 günden yeni</option><option value="old">7 gün ve üzeri</option><option value="veryOld">30 gün ve üzeri</option><option value="unknown">Yaş doğrulanamadı</option></select><select aria-label="Görüntü sıralaması" value={filters.sort} onChange={event => change('sort', event.target.value)}><option value="oldest">En eski önce</option><option value="newest">En yeni önce</option><option value="size">Boyut: büyükten küçüğe</option></select>{hasFilters && <Button variant="ghost" size="sm" onClick={clear}><X size={15} />Temizle</Button>}</div><div className={styles.listHeading}><h2><Archive size={17} />Anlık görüntü envanteri</h2><span aria-live="polite">{loading ? 'Yükleniyor…' : `${shown.length} görüntü gösteriliyor · ${filtered.length} eşleşme / ${rows.length} toplam`}</span></div></>}
    {loading ? <div className={styles.empty} role="status"><RefreshCw size={28} className="animate-spin" /><h3>Anlık görüntüler yükleniyor…</h3><p>VM ilişkileri, tarihler ve dosya ölçümleri alınıyor.</p></div> : !known ? null : !filtered.length ? <div className={styles.empty}><Archive size={32} /><h3>{hasFilters ? 'Filtrelere uygun anlık görüntü bulunamadı' : 'Bu kaynakta anlık görüntü bulunamadı'}</h3><p>{hasFilters ? 'Arama metnini veya filtreleri değiştirin.' : 'Sanal makinelerinizde kayıtlı bir geri dönüş noktası bildirilmedi.'}</p>{hasFilters && <Button variant="outline" onClick={clear}>Filtreleri temizle</Button>}</div> : <><div className={styles.desktopTable} aria-busy={refreshing}><Table><TableHeader><TableRow><TableHead>Anlık görüntü</TableHead><TableHead>Bağlı sanal makine</TableHead><TableHead>Oluşturulma (TSİ)</TableHead><TableHead>Yaş / değerlendirme</TableHead><TableHead>İlişkili dosya boyutu</TableHead><TableHead className={styles.actionHeader}>Ayrıntılar</TableHead></TableRow></TableHeader><TableBody>{shown.map(row => <TableRow key={snapshotKey(row)}><TableCell>{identity(row)}</TableCell><TableCell><VM row={row} /></TableCell><TableCell className={snapStyles.date}>{snapshotDate(row.snapshot.createTime)}</TableCell><TableCell><Age row={row} now={now} /></TableCell><TableCell className={snapStyles.size}>{formatStorage(snapshotSize(row))}</TableCell><TableCell className={styles.actionCell}>{action(row)}</TableCell></TableRow>)}</TableBody></Table></div><div className={styles.mobileCards}>{shown.map(row => <article key={snapshotKey(row)}>{identity(row)}<VM row={row} /><Age row={row} now={now} /><div className={snapStyles.cardFacts}><div><CalendarDays size={15} /><span>Oluşturulma (TSİ)</span><strong>{snapshotDate(row.snapshot.createTime)}</strong></div><div><HardDrive size={15} /><span>İlişkili dosya boyutu</span><strong>{formatStorage(snapshotSize(row))}</strong></div></div>{action(row)}</article>)}</div></>}
    {known && filtered.length > 0 && <nav className={styles.pagination} aria-label="Anlık görüntü sayfaları"><div><label htmlFor="snapshot-page-size">Sayfa başına</label><select id="snapshot-page-size" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>{[10, 25, 50, 100].map(size => <option value={size} key={size}>{size}</option>)}</select><span>{(current - 1) * pageSize + 1}–{Math.min(current * pageSize, filtered.length)} / {filtered.length}</span></div><div><Button size="sm" variant="outline" disabled={current === 1} onClick={() => setPage(current - 1)} aria-label="Önceki sayfa"><ChevronLeft size={15} />Önceki</Button><span>{current} / {pages}</span><Button size="sm" variant="outline" disabled={current >= pages} onClick={() => setPage(current + 1)} aria-label="Sonraki sayfa">Sonraki<ChevronRight size={15} /></Button></div></nav>}
    <p className={styles.note}><Info size={15} />Boyut, disk ve durum dosyalarını kapsar; silindiğinde açılacak alan değildir. Özet, aynı VM’nin görüntülerinde paylaşılan dosyaları bir kez sayar. CSV filtreye uyan tüm sayfaları içerir.</p>
    {detail && <Details key={snapshotKey(detail)} row={detail} now={now} blocked={blocked} capabilities={capabilities} onMutation={mutate} onClose={() => setSelected(null)} />}
    {creating && <CreateSnapshot vms={vms} blocked={blocked || !capabilities.create} onMutation={mutate} onClose={() => setCreating(false)} />}
  </div>;
}
