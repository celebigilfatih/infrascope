'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Archive, ArrowRight, Check, ChevronLeft, ChevronRight, Clock3, Eye, FileClock, FileCode2, GitCompareArrows, History, Info, RefreshCw, Search, Server, Settings2, TriangleAlert, UserRound } from 'lucide-react';
import { PageHeading } from '@/components/ui/page-heading';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type { FirewallListItem } from '@/components/firewall/types';
import { parseOverviewEnvelope, parseOverviewTargets, firewallSourceLabels } from '@/lib/firewall/overview';
import { object } from '@/lib/firewall/workspace';
import { backupDate, backupSize, backupTypeLabel } from '@/lib/nms/backup-view';
import { compareConfigLines, configActionLabel, configPairError, parseConfigContent, parseConfigVersions, requestConfigJson, scopedConfigEvents, type ConfigEvent, type ConfigVersions } from '@/lib/firewall/config-history';
import common from '@/components/users/users-workspace.module.css';
import styles from './page.module.css';
const date = (value: string | null | undefined) => value ? backupDate(value) : 'Zaman bilgisi yok';

interface ReadState<T> { key: string; data: T | null; loading: boolean; error: string; at: string | null }
function useHistoryRead<T>(key: string | null, parse: (value: unknown) => T, revision: number) {
  const [state, setState] = useState<ReadState<T>>({ key: '', data: null, loading: false, error: '', at: null });
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    setState(old => ({ key, data: old.key === key ? old.data : null, at: old.key === key ? old.at : null, loading: true, error: '' }));
    void requestConfigJson(key, controller.signal).then(parse).then(data => {
      if (!controller.signal.aborted) setState({ key, data, loading: false, error: '', at: new Date().toISOString() });
    }).catch(error => {
      if (!controller.signal.aborted) setState(old => ({ ...old, key, data: old.key === key ? old.data : null, loading: false, error: error instanceof Error ? error.message : 'Veriler okunamadı.' }));
    });
    return () => controller.abort();
  }, [key, parse, revision]);
  return !key ? { data: null, loading: false, error: '', at: null } : state.key === key ? state : { data: null, loading: true, error: '', at: null };
}

export default function ConfigRevisionsPage() {
  const [revision, setRevision] = useState(0), [choice, setChoice] = useState<string | null>(null);
  const targets = useHistoryRead('/api/firewalls', parseOverviewTargets, revision);
  const linked = targets.data?.filter(row => row.id && row.device) || [];
  const target = linked.find(row => row.id === (choice ?? (linked.length === 1 ? linked[0].id : ''))) || null;
  return <div className={common.page}><div className={common.workspace}>
    <header className={common.header}><PageHeading section="revisions" description="Cihaz bazında yapılandırma değişikliklerini inceleyin, kayıtlı sürümleri karşılaştırın.">Yapılandırma Geçmişi</PageHeading><div className={common.headerActions}><Button asChild variant="outline"><Link href="/integrations/nms/backups"><Archive size={16} aria-hidden="true" />Yapılandırma yedekleri</Link></Button><Button variant="outline" disabled={targets.loading} onClick={() => setRevision(v => v + 1)}><RefreshCw size={16} aria-hidden="true" className={targets.loading ? 'animate-spin motion-reduce:animate-none' : ''} />{targets.loading ? 'Okunuyor…' : 'Verileri yenile'}</Button></div></header>
    <div className={common.serviceBar}><SemanticBadge tone="info" icon={FileClock}>Olay geçmişi ve kayıtlı sürümler</SemanticBadge><span>{targets.at ? `Cihaz listesi okundu: ${date(targets.at)}` : 'Cihaz listesi okunuyor…'}</span></div>
    {targets.error && <Notice error>{targets.error}{targets.data && ' Önceki cihaz listesi gösteriliyor; güncel olmayabilir.'}</Notice>}
    {targets.loading && !targets.data ? <Empty icon={RefreshCw} title="Cihaz listesi yükleniyor" /> : targets.data && !linked.length ? <Empty icon={Server} title={targets.data.length ? 'Cihaz eşleştirmesi gerekiyor' : 'Henüz güvenlik duvarı eklenmemiş'}><p>{targets.data.length ? 'Kayıtlı bağlantıyı envanter cihazıyla eşleştirerek cihaz bazında geçmişi inceleyebilirsiniz.' : 'Bir FortiGate bağlantısı ekleyerek cihazın değişiklik geçmişini ve kayıtlı sürümlerini burada inceleyebilirsiniz.'}</p><Button asChild><Link href="/integrations/firewall"><Settings2 size={16} aria-hidden="true" />Bağlantıları yönet</Link></Button></Empty> : targets.data && <>
      <section className={styles.target}><label htmlFor="history-target"><Server size={16} aria-hidden="true" />Cihaz ve VDOM</label><select id="history-target" value={target?.id || ''} disabled={targets.loading} onChange={e => setChoice(e.target.value)}><option value="">Cihaz ve VDOM seçin</option>{linked.map(row => <option key={row.id} value={row.id!}>{row.device?.name || row.name} · {row.host} · VDOM: {row.vdom}{row.enabled ? '' : ' · Devre dışı'}</option>)}</select><p>Değişiklikler seçili VDOM’a aittir. Yapılandırma yedekleri cihazın tamamını kapsayabilir.</p></section>
      {target ? <DeviceHistory key={`${target.id}:${target.configId}:${target.device?.id}:${target.vdom}:${target.identity?.analyzerDeviceId}`} target={target} revision={revision} listStale={!!targets.error} /> : <Notice>Geçmişi ve sürümleri görmek için bir cihaz ve VDOM seçin.</Notice>}
    </>}
  </div></div>;
}

function DeviceHistory({ target, revision, listStale }: { target: FirewallListItem; revision: number; listStale: boolean }) {
  const [search, setSearch] = useState(''), [action, setAction] = useState(''), [page, setPage] = useState(1), [detail, setDetail] = useState<ConfigEvent | null>(null);
  const analyzer = target.identity?.analyzerDeviceId || '';
  const parseEvents = useCallback((raw: unknown) => {
    if (!object(raw) || !object(raw.target) || raw.target.analyzerDeviceId !== analyzer || !['fortianalyzer', 'event-cache'].includes(String(raw.source))) throw Error('FortiAnalyzer cihaz kimliği veya olay kaynağı doğrulanamadı.');
    return parseOverviewEnvelope(raw, target, data => scopedConfigEvents(data, analyzer, target.vdom));
  }, [target, analyzer]);
  const eventUrl = target.enabled && analyzer ? `/api/firewalls/${encodeURIComponent(target.id!)}/events?category=config&limit=100&page=1` : null;
  const events = useHistoryRead(eventUrl, parseEvents, revision);
  const versions = useHistoryRead(target.device?.nmsDeviceId ? `/api/integrations/nms/devices/${encodeURIComponent(target.device.id)}/backups` : null, parseConfigVersions, revision);
  const rows = useMemo(() => events.data?.data?.items || [], [events.data]), files = versions.data?.items || [];
  const visible = useMemo(() => rows.filter(row => (!action || row.action?.toLowerCase() === action) && [row.user, configActionLabel(row.action), row.message, row.path, row.object, row.ip].some(value => value?.toLocaleLowerCase('tr-TR').includes(search.trim().toLocaleLowerCase('tr-TR')))), [rows, action, search]);
  const pages = Math.max(1, Math.ceil(visible.length / 10)), safePage = Math.min(page, pages), slice = visible.slice((safePage - 1) * 10, safePage * 10);
  const eventStale = !!events.error || events.data?.status === 'stale', latest = rows.find(row => row.at), latestFile = files.find(row => row.at);
  const clearFilters = () => { setSearch(''); setAction(''); setPage(1); };
  return <>
    {!target.enabled && <Notice>Bağlantı devre dışı. FortiAnalyzer’dan yeni olay istenmez; cihazın kayıtlı yedekleri incelenebilir.</Notice>}
    <section className={common.stats} aria-label="Yapılandırma özeti">
      <Stat icon={History} label="Alınan değişiklik" value={events.data?.data ? String(rows.length) : events.loading ? 'Okunuyor…' : 'Bilgi yok'} note={events.data?.data ? `${events.data.data.total.toLocaleString('tr-TR')} kayıtlık kaynak sonucundan en fazla 100 kayıt` : 'Seçili cihaz ve VDOM'} />
      <Stat icon={UserRound} label="İşlem yapan kullanıcı" value={events.data?.data ? String(new Set(rows.flatMap(row => row.user ? [row.user] : [])).size) : 'Bilgi yok'} note="Alınan olaylar içindeki farklı kullanıcılar" />
      <Stat icon={Clock3} label="Son kayıtlı değişiklik" value={latest ? date(latest.at) : events.loading ? 'Okunuyor…' : events.error || rows.length || !events.data?.data ? 'Bilgi yok' : 'Kayıt yok'} note={latest ? `${latest.user || 'Kullanıcı belirtilmemiş'} · ${configActionLabel(latest.action)}${eventStale ? ' · Önceki veri' : ''}` : 'Alınan olaylar içinde tarihi doğrulanabilen son kayıt'} />
      <Stat icon={FileCode2} label="Son kayıtlı sürüm" value={latestFile ? date(latestFile.at) : versions.loading ? 'Okunuyor…' : versions.error || files.length || !target.device?.nmsDeviceId ? 'Bilgi yok' : 'Yedek yok'} note={latestFile ? `${backupTypeLabel(latestFile.type)}${versions.error ? ' · Önceki liste' : ''}` : 'Cihazın canlı yapılandırması değildir'} />
    </section>
    <Tabs defaultValue="changes" className={styles.tabs}><TabsList className={common.tabs} aria-label="Yapılandırma bölümleri"><TabsTrigger value="changes"><History size={16} aria-hidden="true" />Değişiklikler</TabsTrigger><TabsTrigger value="versions"><GitCompareArrows size={16} aria-hidden="true" />Sürümler ve karşılaştırma</TabsTrigger></TabsList>
      <TabsContent value="changes" className={styles.content}>
        <Notice>Yönetici olayları kimin, ne zaman ve hangi nesnede işlem yaptığını gösterir. Tam dosya farkını “Sürümler ve karşılaştırma” bölümünden inceleyebilirsiniz.</Notice>
        {!target.enabled ? null : !analyzer ? <Empty icon={Info} title="FortiAnalyzer cihaz eşleştirmesi eksik"><p>Bu cihazın olay geçmişini almak için FortiAnalyzer kimliğini bağlantı ayrıntılarında doğrulayın.</p><Button asChild variant="outline"><Link href={`/integrations/firewall/${encodeURIComponent(target.id!)}`}>Cihaz bağlantısını incele<ArrowRight size={16} aria-hidden="true" /></Link></Button></Empty> : <>
          {events.error && <Notice error>{events.error}{events.data && ' Önceki olaylar korunuyor; güncel olmayabilir.'}</Notice>}
          {events.data?.error && <Notice error={events.data.status === 'unavailable'}>{events.data.error}</Notice>}
          <div className={common.filters} role="search" aria-label="Değişiklik filtreleri"><div className={styles.field}><label htmlFor="history-search"><Search size={14} aria-hidden="true" />Değişikliklerde ara</label><Input id="history-search" type="search" value={search} placeholder="Kullanıcı, nesne, açıklama veya IP" onChange={e => { setSearch(e.target.value); setPage(1); }} /></div><div className={styles.field}><label htmlFor="history-action">İşlem türü</label><select id="history-action" value={action} onChange={e => { setAction(e.target.value); setPage(1); }}><option value="">Tüm işlemler</option>{Array.from(new Set(rows.flatMap(row => row.action ? [row.action.toLowerCase()] : []))).map(value => <option key={value} value={value}>{configActionLabel(value)}</option>)}</select></div>{(search || action) && <Button variant="ghost" onClick={clearFilters}>Filtreleri temizle</Button>}</div>
          <section className={common.collection} aria-label="Cihaz değişiklikleri" aria-busy={events.loading}><header className={common.sectionHeader}><div><h2><History size={18} aria-hidden="true" />Cihaz değişiklikleri</h2><p>{target.device?.name} · VDOM: {target.vdom} · Filtreler alınan en fazla 100 kayıt içinde uygulanır.</p></div><SemanticBadge tone={eventStale ? 'warning' : events.data?.data ? 'info' : 'neutral'} icon={Clock3}>{events.loading ? 'Okunuyor…' : eventStale ? 'Önceki veri' : events.data?.data ? firewallSourceLabels[events.data.source] : 'Veri yok'}</SemanticBadge></header>
          {events.loading && !events.data ? <Empty icon={RefreshCw} title="Değişiklikler okunuyor" /> : !events.data?.data ? <Empty icon={Info} title="Değişiklik bilgisi alınamadı"><p>Kaynak erişimini ve cihaz eşleştirmesini kontrol edip verileri yenileyin.</p></Empty> : !slice.length ? <Empty icon={search || action ? Search : Check} title={search || action ? 'Filtrelere uygun değişiklik yok' : 'Kaynak sonucunda değişiklik kaydı yok'}>{(search || action) && <Button variant="outline" onClick={clearFilters}>Filtreleri temizle</Button>}</Empty> : <>
            <div className={styles.tableWrap}><table className={styles.table}><caption className="sr-only">Seçili cihaz ve VDOM yapılandırma olayları</caption><thead><tr><th scope="col">Zaman / kullanıcı</th><th scope="col">İşlem</th><th scope="col">Değişen nesne</th><th scope="col">Kaynak IP</th><th scope="col">Ayrıntılar</th></tr></thead><tbody>{slice.map((row, i) => <tr key={`${row.id}:${i}`}><td><strong>{row.user || 'Kullanıcı belirtilmemiş'}</strong><small>{date(row.at)}</small></td><td><Action value={row.action} /></td><td><strong>{row.path || 'Yapılandırma yolu belirtilmemiş'}</strong>{row.object && <small>Nesne: {row.object}</small>}<p className={styles.message}>{row.message || 'Açıklama yok'}</p></td><td><code>{row.ip || 'Bilgi yok'}</code></td><td><Button size="sm" variant="outline" aria-label={`${row.user || 'Kullanıcı belirtilmemiş'} · ${date(row.at)} · işlem ayrıntıları`} onClick={() => setDetail(row)}><Eye size={14} aria-hidden="true" />İncele</Button></td></tr>)}</tbody></table></div>
            <div className={styles.mobile}>{slice.map((row, i) => <article className={styles.record} key={`${row.id}:${i}`}><div className={styles.recordHead}><strong>{row.user || 'Kullanıcı belirtilmemiş'}</strong><Action value={row.action} /></div><p className={styles.hint}>{date(row.at)}</p><dl className={styles.meta}><Meta label="Yapılandırma yolu" value={row.path} /><Meta label="Nesne" value={row.object} /><Meta label="Kaynak IP" value={row.ip} /></dl><p className={styles.message}>{row.message || 'Açıklama yok'}</p><Button variant="outline" onClick={() => setDetail(row)}><Eye size={16} aria-hidden="true" />İşlem ayrıntıları</Button></article>)}</div>
          </>}
          {events.data?.data && <><Pagination label="Değişiklikler" page={safePage} pages={pages} count={visible.length} onChange={setPage} /><footer className={common.collectionFoot}>Veri zamanı: {date(events.data.at)}{events.data.data.truncated && ` · Kaynakta ${events.data.data.total.toLocaleString('tr-TR')} sonuç var; ilk 100 kayıt alındı. Daha eski kayıtları FortiAnalyzer’da inceleyin.`}</footer></>}
          </section>
        </>}
      </TabsContent>
      <TabsContent value="versions" className={styles.content}>
        <Notice>Buradaki sürümler cihazın kayıtlı yapılandırma yedekleridir; VDOM dışındaki ayarları da içerebilir. Karşılaştırma, eski sürümden yeni sürüme doğru yapılır.</Notice>
        {!target.device?.nmsDeviceId ? <Empty icon={Archive} title="Cihazın yedek kaydı eşleştirilemiyor"><p>Kayıtlı sürümler için cihazın izleme envanteriyle eşleşmesi gerekiyor.</p><Button asChild variant="outline"><Link href="/integrations/nms/devices">İzlenen cihazları aç<ArrowRight size={16} aria-hidden="true" /></Link></Button></Empty> : <>
          {versions.error && <Notice error>{versions.error}{versions.data && ' Önceki sürüm listesi korunuyor.'}</Notice>}
          {versions.loading && !versions.data ? <Empty icon={RefreshCw} title="Kayıtlı sürümler okunuyor" /> : versions.data ? <VersionWorkspace key={`${target.id}:${versions.at}:${versions.error}`} deviceId={target.device.id} versions={versions.data} stale={!!versions.error || listStale || versions.loading} /> : <Empty icon={Info} title="Sürüm bilgileri alınamadı" />}
        </>}
      </TabsContent>
    </Tabs>
    <Dialog open={!!detail} onOpenChange={open => { if (!open) setDetail(null); }}><DialogContent className={`${common.modal} ${styles.modal}`}><DialogHeader><DialogTitle className={styles.dialogTitle}><FileClock size={20} aria-hidden="true" />Yapılandırma işlemi</DialogTitle><DialogDescription>{target.device?.name} · VDOM: {target.vdom}</DialogDescription></DialogHeader>{detail && <><div className={styles.recordHead}><Action value={detail.action} /><SemanticBadge tone="info">Yönetici olay kaydı</SemanticBadge></div><dl className={styles.meta}><Meta label="İşlem zamanı" value={date(detail.at)} /><Meta label="Kullanıcı" value={detail.user} /><Meta label="Kaynak IP" value={detail.ip} /><Meta label="Kaynak cihaz kimliği" value={detail.deviceId} /><Meta label="Yapılandırma yolu" value={detail.path} /><Meta label="Nesne" value={detail.object} /></dl><section className={styles.raw}><h3>Kaynak açıklaması</h3><p>{detail.message || 'Açıklama yok'}</p></section><p className={styles.hint}>Kaynak açıklaması cihazdan geldiği biçimde gösterilir. Olay kaydı, tam dosyanın önceki ve sonraki içeriğini içermez.</p><div className={common.dialogActions}><Button variant="outline" onClick={() => setDetail(null)}>Kapat</Button></div></>}</DialogContent></Dialog>
  </>;
}

function VersionWorkspace({ deviceId, versions, stale }: { deviceId: string; versions: ConfigVersions; stale: boolean }) {
  const [type, setType] = useState('Running Config'), [page, setPage] = useState(1);
  const files = versions.items.filter(row => row.type === type), latest = files.find(row => row.at);
  const [beforeId, setBefore] = useState(''), [afterId, setAfter] = useState('');
  const before = files.find(row => row.id === beforeId), after = files.find(row => row.id === afterId), pairError = configPairError(before, after);
  const [result, setResult] = useState<ReturnType<typeof compareConfigLines> | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [onlyChanges, setOnlyChanges] = useState(true), [diffPage, setDiffPage] = useState(1);
  const request = useRef<AbortController | null>(null);
  function clear() { request.current?.abort(); request.current = null; setResult(null); setBusy(false); setError(''); setDiffPage(1); }
  useEffect(() => () => { request.current?.abort(); }, []);
  async function compare() {
    if (pairError || !before || !after || !versions.canRead || stale) return;
    const controller = new AbortController(); request.current?.abort(); request.current = controller; setBusy(true); setError(''); setResult(null); setDiffPage(1);
    try {
      const root = `/api/integrations/nms/devices/${encodeURIComponent(deviceId)}/backups/`;
      const [a, b] = await Promise.all([requestConfigJson(root + encodeURIComponent(before.id), controller.signal), requestConfigJson(root + encodeURIComponent(after.id), controller.signal)]);
      const diff = compareConfigLines(parseConfigContent(a, before), parseConfigContent(b, after));
      if (!controller.signal.aborted && request.current === controller) setResult(diff);
    } catch (failure) { if (!controller.signal.aborted && request.current === controller) setError(failure instanceof Error ? failure.message : 'Sürümler karşılaştırılamadı.'); }
    finally { if (request.current === controller) setBusy(false); }
  }
  const pages = Math.max(1, Math.ceil(files.length / 10)), safePage = Math.min(page, pages);
  const diffLines = result?.lines.filter(row => !onlyChanges || row.kind !== 'same') || [], diffPages = Math.max(1, Math.ceil(diffLines.length / 200)), safeDiffPage = Math.min(diffPage, diffPages);
  return <>
    <section className={styles.panel} aria-label="Kayıtlı sürüm özeti"><header><span className={common.icon}><FileCode2 size={20} aria-hidden="true" /></span><div><h2>Son kayıtlı yapılandırma</h2><p>Seçili türün tarihi doğrulanabilen en son yedeği. Canlı cihaz durumu ayrıca doğrulanmaz.</p></div></header><div className={styles.body}><div className={styles.field}><label htmlFor="version-type">Yapılandırma türü</label><select id="version-type" value={type} onChange={e => { clear(); setType(e.target.value); setBefore(''); setAfter(''); setPage(1); }}><option value="Running Config">Çalışan yapılandırma</option><option value="Startup Config">Başlangıç yapılandırması</option>{Array.from(new Set(versions.items.map(row => row.type))).filter(value => !['Running Config', 'Startup Config'].includes(value)).map(value => <option key={value} value={value}>{backupTypeLabel(value)}</option>)}</select></div>{latest ? <dl className={styles.meta}><Meta label="Kaydedilme zamanı" value={date(latest.at)} /><Meta label="Dosya adı" value={latest.file} /><Meta label="Dosya boyutu" value={latest.bytes === null ? null : backupSize(latest.bytes)} /><Meta label="Dosya kimliği (SHA-256)" value={latest.checksum} /></dl> : <p className={styles.hint}>{files.length ? 'Bu türdeki sürümlerin tarihi doğrulanamıyor.' : 'Bu yapılandırma türünde kayıtlı sürüm yok.'}</p>}{stale && <SemanticBadge tone="warning">Önceki sürüm listesi · karşılaştırmak için yenileyin</SemanticBadge>}</div></section>
    <section className={styles.panel} aria-label="Sürüm karşılaştırması"><header><span className={common.icon}><GitCompareArrows size={20} aria-hidden="true" /></span><div><h2>Sürümleri karşılaştır</h2><p>Aynı cihazın aynı türdeki iki farklı yedeğini seçin.</p></div></header><div className={styles.body}>{!versions.canRead ? <Notice>Yapılandırma içeriğini karşılaştırmak için yönetici veya operatör yetkisi gerekir. Sürüm bilgilerini aşağıda inceleyebilirsiniz.</Notice> : files.length < 2 ? <Notice>Karşılaştırma için bu türde en az iki kayıtlı sürüm gerekiyor.</Notice> : <>
      <div className={styles.compareFields}>{[{ id: 'before', label: 'Eski sürüm', value: beforeId, onChange: setBefore }, { id: 'after', label: 'Yeni sürüm', value: afterId, onChange: setAfter }].map(field => <div key={field.id} className={styles.field}><label htmlFor={`version-${field.id}`}>{field.label}</label><select id={`version-${field.id}`} value={field.value} aria-describedby="compare-help" onChange={e => { clear(); field.onChange(e.target.value); }}><option value="">Sürüm seçin</option>{files.map(row => <option key={row.id} value={row.id}>{date(row.at)} · {row.file}</option>)}</select></div>)}</div><div className={styles.compareActions}><p id="compare-help" className={styles.hint}>{pairError || 'Eski → yeni yönünde eklenen ve kaldırılan satırlar gösterilir.'}</p><Button disabled={!!pairError || busy || stale} onClick={() => void compare()}><GitCompareArrows size={16} aria-hidden="true" />{busy ? 'Karşılaştırılıyor…' : 'Karşılaştır'}</Button></div>
    </>}{error && <Notice error>{error}</Notice>}{busy && <p role="status" className={styles.hint}>Seçili iki dosya okunuyor ve farklar hesaplanıyor…</p>}
    {result && <div className={styles.diff} aria-label="Yapılandırma farkları"><div className={styles.diffHeader}><div role="status"><SemanticBadge tone="success">+{result.added} eklenen satır</SemanticBadge><SemanticBadge tone={result.removed ? 'danger' : 'neutral'}>−{result.removed} kaldırılan satır</SemanticBadge></div><label><input type="checkbox" checked={onlyChanges} onChange={e => { setOnlyChanges(e.target.checked); setDiffPage(1); }} />Yalnızca değişen satırlar</label></div><p className={styles.hint}>{date(before?.at)} → {date(after?.at)} · Sol numara eski, sağ numara yeni dosyadaki satırı gösterir.</p>{!result.added && !result.removed && onlyChanges ? <Empty icon={Check} title="İki sürümün satır içeriği aynı" /> : <><div className={styles.diffCode} tabIndex={0} aria-label="Eski ve yeni satır numaralarıyla dosya farkı">{diffLines.slice((safeDiffPage - 1) * 200, safeDiffPage * 200).map((line, index) => <div key={index} className={styles[line.kind]}><span>{line.before ?? '·'}</span><span>{line.after ?? '·'}</span><b aria-label={line.kind === 'added' ? 'Eklenen' : line.kind === 'removed' ? 'Kaldırılan' : 'Aynı'}>{line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : ' '}</b><code>{line.text || ' '}</code></div>)}</div><Pagination label="Fark satırları" page={safeDiffPage} pages={diffPages} count={diffLines.length} onChange={setDiffPage} /></>}</div>}
    </div></section>
    <section className={common.collection} aria-label="Kayıtlı yapılandırma sürümleri"><header className={common.sectionHeader}><div><h2><Archive size={18} aria-hidden="true" />Kayıtlı sürümler</h2><p>{backupTypeLabel(type)} · En fazla son 500 cihaz yedeği içinden</p></div><SemanticBadge tone="info" icon={FileCode2}>{files.length} sürüm</SemanticBadge></header>{!files.length ? <Empty icon={Archive} title="Bu türde kayıtlı sürüm yok"><Button asChild variant="outline"><Link href="/integrations/nms/backups">Yapılandırma yedeklerini aç<ArrowRight size={16} aria-hidden="true" /></Link></Button></Empty> : <><div className={styles.versions}>{files.slice((safePage - 1) * 10, safePage * 10).map(row => <article key={row.id} className={styles.version}><span className={common.icon}><FileCode2 size={18} aria-hidden="true" /></span><div><div className={styles.recordHead}><strong>{date(row.at)}</strong>{row.id === latest?.id && <SemanticBadge tone="info" icon={Clock3}>Son kayıt</SemanticBadge>}</div><p>{row.file}</p><small>{row.bytes === null ? 'Boyut bilgisi yok' : backupSize(row.bytes)}{row.description ? ` · ${row.description}` : ''}</small></div>{versions.canRead && <div className={styles.versionActions}><Button variant="outline" size="sm" aria-pressed={beforeId === row.id} onClick={() => { clear(); setBefore(row.id); }}>Eski sürüm seç</Button><Button variant="outline" size="sm" aria-pressed={afterId === row.id} onClick={() => { clear(); setAfter(row.id); }}>Yeni sürüm seç</Button></div>}</article>)}</div><Pagination label="Sürümler" page={safePage} pages={pages} count={files.length} onChange={setPage} /></>}</section>
  </>;
}

function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) { const Icon = error ? TriangleAlert : Info; return <div className={error ? common.error : common.info} role={error ? 'alert' : undefined}><Icon size={18} aria-hidden="true" /><p>{children}</p></div>; }
function Empty({ icon: Icon, title, children }: { icon: typeof Info; title: string; children?: ReactNode }) { return <div className={common.empty}><Icon size={28} aria-hidden="true" /><h3>{title}</h3>{children}</div>; }
function Stat({ icon: Icon, label, value, note }: { icon: typeof Info; label: string; value: string; note: string }) { return <article className={`${common.stat} ${styles.stat}`}><div><h2>{label}</h2><span className={common.icon}><Icon size={18} aria-hidden="true" /></span></div><strong>{value}</strong><p>{note}</p></article>; }
function Action({ value }: { value: string | null }) { return <SemanticBadge tone={value?.toLowerCase() === 'delete' ? 'danger' : value?.toLowerCase() === 'add' ? 'success' : 'info'} icon={Settings2}>{configActionLabel(value)}</SemanticBadge>; }
function Meta({ label, value }: { label: string; value: string | null | undefined }) { return <div><dt>{label}</dt><dd>{value || 'Bilgi yok'}</dd></div>; }
function Pagination({ label, page, pages, count, onChange }: { label: string; page: number; pages: number; count: number; onChange: (v: number) => void }) { return <div className={styles.pagination}><p role="status">{count.toLocaleString('tr-TR')} kayıt · Sayfa {page} / {pages}</p><div><Button variant="outline" size="sm" aria-label={`${label}: önceki sayfa`} disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={16} aria-hidden="true" />Önceki</Button><Button variant="outline" size="sm" aria-label={`${label}: sonraki sayfa`} disabled={page >= pages} onClick={() => onChange(page + 1)}>Sonraki<ChevronRight size={16} aria-hidden="true" /></Button></div></div>; }
