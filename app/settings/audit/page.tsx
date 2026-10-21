'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Download, Eye, FileClock, Filter, Fingerprint, Loader2, RefreshCw, Search, ShieldCheck, Trash2, TriangleAlert, UsersRound, X } from 'lucide-react';
import { PageHeading } from '@/components/ui/page-heading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { AuditAction, AuditActor, AuditEntryDetail } from '@/components/audit/AuditEntryDetail';
import { uiLabel } from '@/lib/i18n/tr';
import { auditDateRange } from '@/lib/audit/query';
import { auditFilterParams, auditKind, auditPreset, auditTime, emptyAuditFilters, isAuditEntry, type AuditEntry, type AuditFilters } from '@/lib/audit/view';
import { cn } from '@/lib/utils';
import styles from './page.module.css';

interface Result { key: string; rows: AuditEntry[]; pagination: { page: number; pageSize: number; total: number; totalPages: number }; updatedAt: string }
const resources = [['all', 'Tüm kaynaklar'], ['user', 'Kullanıcılar'], ['alarm', 'Alarmlar'], ['device', 'Cihazlar'], ['permission', 'Yetkiler'], ['settings', 'Ayarlar'], ['integration', 'Entegrasyonlar'], ['license', 'Lisans']];
function requestMessage(status: number) {
  return status === 401 ? 'Oturumunuz sona ermiş. Yeniden giriş yapın.' : status === 403 ? 'Denetim kayıtlarını görüntüleme yetkiniz yok.' : 'Denetim kayıtları yüklenemedi. Tekrar deneyin.';
}
export default function AuditLogPage() {
  const [draft, setDraft] = useState<AuditFilters>(emptyAuditFilters);
  const [applied, setApplied] = useState<AuditFilters>(emptyAuditFilters);
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState(25);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const [exporting, setExporting] = useState(false), [exportError, setExportError] = useState(''), [notice, setNotice] = useState('');
  const activeRequest = useRef<AbortController | null>(null), exportRequest = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const filterQuery = auditFilterParams(applied).toString();
  const queryKey = `${filterQuery ? `${filterQuery}&` : ''}page=${page}&pageSize=${pageSize}`;
  const data = result?.key === queryKey ? result : null;
  const rows = data?.rows || [];
  const dirty = JSON.stringify(draft) !== JSON.stringify(applied);
  let dateError = '';
  try { auditDateRange(draft.startDate, draft.endDate); } catch (cause) { dateError = cause instanceof Error ? cause.message : 'Tarih aralığını kontrol edin.'; }

  const load = useCallback(async () => {
    const requestId = ++sequence.current;
    activeRequest.current?.abort();
    const controller = new AbortController(); activeRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/audit?${queryKey}`, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error(requestMessage(response.status));
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Kayıtlar alınamadı. Oturumunuzu kontrol edip yeniden deneyin.');
      const body = await response.json();
      if (!body.success || !Array.isArray(body.data) || !body.data.every(isAuditEntry) || !Number.isSafeInteger(body.pagination?.total) || body.pagination.total < 0 || body.pagination.page !== page || body.pagination.pageSize !== pageSize || body.pagination.totalPages !== Math.ceil(body.pagination.total / pageSize)) throw new Error('Denetim kayıtları beklenen biçimde alınamadı. Tekrar deneyin.');
      if (sequence.current !== requestId || controller.signal.aborted) return;
      if (page > 1 && page > Math.max(1, body.pagination.totalPages)) { setPage(Math.max(1, body.pagination.totalPages)); return; }
      setResult({ key: queryKey, rows: body.data, pagination: body.pagination, updatedAt: new Date().toISOString() });
    } catch (cause) {
      if (sequence.current === requestId) setError(controller.signal.aborted ? 'İstek zaman aşımına uğradı. Yeniden deneyin.' : cause instanceof TypeError ? 'Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.' : cause instanceof SyntaxError ? 'Sunucudan geçerli kayıt bilgisi alınamadı. Yeniden deneyin.' : cause instanceof Error ? cause.message : 'Denetim kayıtları yüklenemedi.');
    } finally { clearTimeout(timeout); if (sequence.current === requestId) setLoading(false); }
  }, [queryKey, page, pageSize]);
  useEffect(() => { void load(); return () => { sequence.current += 1; activeRequest.current?.abort(); }; }, [load]);
  useEffect(() => () => { exportRequest.current?.abort(); exportRequest.current = null; }, []);

  const apply = (filters: AuditFilters) => {
    setSelected(null); setDraft(filters); setApplied(filters); setPage(1); setNotice(''); setExportError('');
    if (JSON.stringify(filters) === JSON.stringify(applied) && page === 1) void load();
  };
  const submit = (event: FormEvent) => { event.preventDefault(); if (!dateError && !exporting) apply(draft); };
  const exportCsv = async () => {
    if (exporting || dirty || !data || error) return;
    const controller = new AbortController(); exportRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    setExporting(true); setExportError(''); setNotice('');
    try {
      const response = await fetch(`/api/audit/export?${filterQuery}`, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? requestMessage(response.status) : 'CSV dosyası hazırlanamadı. Tekrar deneyin.');
      if (!response.headers.get('content-type')?.startsWith('text/csv')) throw new Error('CSV dosyası alınamadı. Oturumunuzu kontrol edin.');
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `denetim-kayitlari-${auditPreset(1).endDate}.csv`; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(response.headers.get('X-Audit-Export-Truncated') === 'true' ? 'İlk 10.000 kayıt CSV olarak tarayıcıya iletildi. Tüm kayıtlar için tarih aralığını daraltın.' : 'Uygulanan filtrelerle CSV tarayıcıya iletildi. İndirmelerinizi kontrol edin.');
    } catch (cause) {
      if (exportRequest.current === controller) setExportError(controller.signal.aborted ? 'Dışa aktarma zaman aşımına uğradı. Tarih aralığını daraltıp tekrar deneyin.' : cause instanceof TypeError ? 'Sunucuya ulaşılamadı. Tekrar deneyin.' : cause instanceof Error ? cause.message : 'CSV indirilemedi.');
    } finally { clearTimeout(timeout); if (exportRequest.current === controller) setExporting(false); }
  };
  const detailButton = (entry: AuditEntry) => <Button variant="outline" size="sm" className="gap-1.5" aria-label={`${entry.id} kaydının ayrıntıları`} onClick={() => setSelected(entry)}><Eye size={14} />İncele</Button>;
  const stats = [
    { icon: FileClock, label: 'Eşleşen kayıt', value: data?.pagination.total, hint: filterQuery ? 'Uygulanan filtrelerde · tüm sayfalar' : 'Tüm denetim kayıtları' },
    { icon: UsersRound, label: 'İşlem yapan kullanıcı', value: data ? new Set(rows.filter(row => row.userId).map(row => row.userId)).size : undefined, hint: 'Bu sayfada · sistem kayıtları hariç' },
    { icon: Trash2, label: 'Silme türünde işlem', value: data ? rows.filter(row => auditKind(row.action).kind === 'delete').length : undefined, hint: 'Bu sayfada · işlem türüne göre' },
    { icon: Clock3, label: 'Son 24 saatte', value: data ? rows.filter(row => { const elapsed = Date.now() - Date.parse(row.timestamp); return elapsed >= 0 && elapsed < 86400000; }).length : undefined, hint: 'Bu sayfada · son 24 saate ait kayıt' },
  ];
  return <div className={styles.page}><div className={styles.workspace}>
    <header className={styles.header}><div><p className={styles.eyebrow}><FileClock size={14} />İşlem geçmişi</p><PageHeading section="audit" showIcon={false} className="text-2xl! font-semibold!">Denetim kayıtları</PageHeading><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Kimin, ne zaman, hangi kaynak üzerinde işlem yaptığını inceleyin.</p></div><div className={styles.headerActions}><Button variant="outline" className="gap-2" disabled={loading} onClick={() => void load()}><RefreshCw size={16} className={cn(loading && 'animate-spin')} />{loading ? 'Yenileniyor…' : 'Yenile'}</Button><Button className="gap-2" onClick={() => void exportCsv()} disabled={loading || exporting || dirty || !data || !!error}>{exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}{exporting ? 'CSV hazırlanıyor…' : 'CSV indir'}</Button></div></header>
    <div className={styles.serviceBar}><SemanticBadge tone="neutral" icon={ShieldCheck}>Salt okunur kayıtlar</SemanticBadge><p>{data ? `${error ? 'Son alınan veri' : 'Son güncelleme'}: ${auditTime(data.updatedAt)}` : 'Tüm tarihler Türkiye saatine göre gösterilir.'}</p></div>
    {error && <div role="alert" className={styles.error}><TriangleAlert size={18} /><div><p className="font-medium">{error}</p>{data && <p className="mt-1">Son alınan kayıtlar gösteriliyor. Güncellikleri doğrulanamadı.</p>}</div><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>Tekrar dene</Button></div>}
    {exportError && <p role="alert" className={styles.error}>{exportError}</p>}{notice && <p role="status" className={styles.notice}><CheckCircle2 size={16} />{notice}<Button variant="ghost" size="icon" className="ml-auto h-7 w-7 shrink-0" aria-label="Bildirimi kapat" onClick={() => setNotice('')}><X size={14} /></Button></p>}
    <section className={styles.stats} aria-label="Denetim özeti">{stats.map(({ icon: Icon, label, value, hint }) => <div className={styles.stat} key={label}><div><p>{label}</p><span><Icon size={17} /></span></div><strong>{value === undefined ? '—' : value.toLocaleString('tr-TR')}</strong><small>{hint}{data && error ? ' · son alınan veri' : ''}</small></div>)}</section>
    <section className={styles.filters} aria-labelledby="audit-filters-heading"><div className={styles.sectionHeader}><div><h2 id="audit-filters-heading"><Filter size={18} />Kayıtları filtrele</h2><p>Tarih aralığına başlangıç ve bitiş günlerinin tamamı dahildir (TSİ).</p></div>{dirty && <SemanticBadge tone="warning">Uygulanmamış değişiklikler</SemanticBadge>}</div>
      <form onSubmit={submit} className={styles.filterForm} noValidate><div className={styles.filterGrid}>
        <div><Label htmlFor="audit-action">İşlem</Label><div className="relative mt-2"><Search size={16} className="absolute left-3 top-3 text-muted-foreground" aria-hidden="true" /><Input id="audit-action" maxLength={200} className="pl-9" placeholder="Örn. silme, giriş, güncelleme…" value={draft.action} onChange={e => setDraft({ ...draft, action: e.target.value })} /></div></div>
        <div><Label htmlFor="audit-user">Kullanıcı</Label><Input id="audit-user" maxLength={200} className="mt-2" placeholder="Ad, e-posta veya kullanıcı kimliği…" value={draft.user} onChange={e => setDraft({ ...draft, user: e.target.value, userId: undefined })} /></div>
        <div><Label htmlFor="audit-resource">Kaynak türü</Label><select id="audit-resource" className={styles.select} value={draft.resource} onChange={e => setDraft({ ...draft, resource: e.target.value })}>{resources.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div><Label htmlFor="audit-start">Başlangıç tarihi</Label><Input id="audit-start" className="mt-2" type="date" onInput={e => setDraft({ ...draft, startDate: e.currentTarget.value })} value={draft.startDate} onChange={e => setDraft({ ...draft, startDate: e.target.value })} aria-invalid={!!dateError} aria-describedby={dateError ? 'audit-date-error' : undefined} /></div>
        <div><Label htmlFor="audit-end">Bitiş tarihi</Label><Input id="audit-end" className="mt-2" type="date" onInput={e => setDraft({ ...draft, endDate: e.currentTarget.value })} value={draft.endDate} onChange={e => setDraft({ ...draft, endDate: e.target.value })} aria-invalid={!!dateError} aria-describedby={dateError ? 'audit-date-error' : undefined} /></div>
      </div>{dateError && <p id="audit-date-error" role="alert" className="mt-3 text-xs text-destructive">{dateError}</p>}
      <div className={styles.filterFooter}><div className={styles.presets}><span><CalendarDays size={14} />Hızlı tarih seçimi</span>{[[1, 'Bugün'], [7, 'Son 7 gün'], [30, 'Son 30 gün']].map(([days, label]) => { const range = auditPreset(Number(days)); return <Button type="button" key={days} size="sm" variant="outline" aria-pressed={draft.startDate === range.startDate && draft.endDate === range.endDate} onClick={() => setDraft({ ...draft, ...range })}>{label}</Button>; })}</div><div className="flex flex-wrap gap-2"><Button type="button" variant="ghost" disabled={exporting || (!dirty && !filterQuery)} onClick={() => apply(emptyAuditFilters)}><X size={14} className="mr-1.5" />Temizle</Button><Button type="submit" disabled={loading || exporting || !!dateError} className="gap-2"><Filter size={14} />Filtreleri uygula</Button></div></div>
      </form>
    </section>
    <section className={styles.collection} aria-labelledby="audit-records-heading" aria-busy={loading}><div className={styles.sectionHeader}><div><h2 id="audit-records-heading"><FileClock size={18} />İşlem kayıtları</h2><p>{filterQuery ? 'Uygulanan filtrelere uyan kayıtlar' : 'Tüm kayıtlar'} · En yeni işlem önce gösterilir.</p></div><span className="text-xs text-muted-foreground">CSV: aynı filtrelerle en fazla 10.000 kayıt · tarihler UTC</span></div>
      {filterQuery && <div className={styles.activeFilters} aria-label="Uygulanan filtreler">{applied.action && <span>İşlem: {applied.action}</span>}{applied.user && <span>Kullanıcı: {applied.user}</span>}{applied.resource !== 'all' && <span>Kaynak: {uiLabel(applied.resource)}</span>}{(applied.startDate || applied.endDate) && <span>Tarih: {applied.startDate || 'En eski kayıt'} → {applied.endDate || 'Bugün ve sonrası'} · TSİ</span>}</div>}
      {!data ? <div className={styles.empty} role={loading ? 'status' : undefined}>{loading ? <Loader2 size={28} className="animate-spin text-primary" /> : <FileClock size={28} className="text-muted-foreground" />}<h3>{loading ? 'Denetim kayıtları yükleniyor…' : 'Kayıtlar görüntülenemiyor'}</h3><p>{loading ? 'İşlem geçmişi hazırlanıyor.' : 'Bağlantınızı ve erişim yetkinizi kontrol edip yeniden deneyin.'}</p></div> : !rows.length ? <div className={styles.empty}><Search size={28} className="text-primary" /><h3>{filterQuery ? 'Bu filtrelere uygun kayıt yok' : 'Henüz denetim kaydı yok'}</h3><p>{filterQuery ? 'Tarih aralığını genişletin veya arama koşullarını değiştirin.' : 'Kaydedilen kullanıcı ve sistem işlemleri burada listelenir.'}</p>{filterQuery && <Button variant="outline" onClick={() => apply(emptyAuditFilters)}>Filtreleri temizle</Button>}</div> : <>
        <div className={styles.tableWrap}><table className={styles.table}><caption className="sr-only">Denetim işlem kayıtları</caption><thead><tr><th scope="col"><Clock3 size={13} />Tarih / saat</th><th scope="col"><Fingerprint size={13} />İşlem</th><th scope="col"><UsersRound size={13} />Kullanıcı</th><th scope="col">Kaynak</th><th scope="col">IP adresi</th><th scope="col">Ayrıntılar</th></tr></thead><tbody>{rows.map(entry => <tr key={entry.id}><td><time dateTime={entry.timestamp}>{auditTime(entry.timestamp)}</time></td><td><AuditAction action={entry.action} /><p className={styles.actionCode} title={entry.action}>{entry.action}</p></td><td><AuditActor entry={entry} /></td><td><p>{entry.resource ? uiLabel(entry.resource) : 'Belirtilmemiş'}</p>{entry.resourceId && <p className={styles.resourceId} title={entry.resourceId}>{entry.resourceId}</p>}</td><td className="font-mono text-xs">{entry.ipAddress || 'Kaydedilmemiş'}</td><td>{detailButton(entry)}</td></tr>)}</tbody></table></div>
        <div className={styles.mobileList}>{rows.map(entry => <article className={styles.record} key={entry.id}><div className="flex flex-wrap items-start justify-between gap-3"><AuditAction action={entry.action} /><time dateTime={entry.timestamp}>{auditTime(entry.timestamp)}</time></div><p className={styles.actionCode}>{entry.action}</p><div className="my-4"><AuditActor entry={entry} /></div><dl><div><dt>Kaynak</dt><dd>{entry.resource ? uiLabel(entry.resource) : 'Belirtilmemiş'}</dd></div><div><dt>IP adresi</dt><dd>{entry.ipAddress || 'Kaydedilmemiş'}</dd></div></dl><div className="mt-4 flex justify-end border-t border-border pt-3">{detailButton(entry)}</div></article>)}</div>
      </>}
      <footer className={styles.pagination}><p role="status">{loading && !data ? 'Kayıtlar yükleniyor…' : data ? data.pagination.total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, data.pagination.total)} / ${data.pagination.total.toLocaleString('tr-TR')} kayıt${error ? ' · son alınan veri' : ''}` : '0 kayıt' : 'Kayıt sayısı bilinmiyor'}</p><div><select aria-label="Sayfa başına kayıt" className={styles.pageSize} value={pageSize} disabled={loading || exporting} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>{[25, 50, 100].map(size => <option key={size} value={size}>{size} / sayfa</option>)}</select><Button variant="outline" size="icon" className="h-8 w-8" disabled={loading || exporting || !data || page <= 1} aria-label="Önceki sayfa" onClick={() => setPage(page - 1)}><ChevronLeft size={16} /></Button><span>{page} / {Math.max(1, data?.pagination.totalPages || 0)}</span><Button variant="outline" size="icon" className="h-8 w-8" disabled={loading || exporting || !data || page >= data.pagination.totalPages} aria-label="Sonraki sayfa" onClick={() => setPage(page + 1)}><ChevronRight size={16} /></Button></div></footer>
    </section>
    <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><ShieldCheck size={14} className="mt-0.5 shrink-0" />Kayıtlar bu ekrandan değiştirilemez veya silinemez. Ayrıntılar, işlem sırasında kaydedilen bilgilerle sınırlıdır.</p>
  </div><AuditEntryDetail entry={selected} onClose={() => setSelected(null)} onUserFilter={(id, name) => apply({ ...applied, user: name, userId: id })} /></div>;
}
