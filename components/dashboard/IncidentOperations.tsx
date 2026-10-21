'use client';

import { uiError } from '@/lib/i18n/tr';

import { useEffect, useState } from 'react';
import { Activity, Archive, ArrowDown, ArrowRight, ArrowUp, CalendarClock, Check, CheckCheck, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, CircleDot, Clock3, Flag, Layers, LockKeyhole, Monitor, RefreshCw, Repeat2, Search, SlidersHorizontal, UserRound, UsersRound, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { IncidentBulkAssignment, type IncidentBulkAssignmentResult } from '@/components/dashboard/IncidentBulkAssignment';
import { IncidentBulkLifecycle } from '@/components/dashboard/IncidentBulkLifecycle';
import { isIncidentBulkLifecycleEligible, type IncidentBulkLifecycleAction, type IncidentBulkLifecycleResult } from '@/lib/alarms/incident-bulk-lifecycle';
import { IncidentSeverityBadge, IncidentSourceIcon, IncidentStatusBadge } from './IncidentVisuals';
import { incidentLabel } from '@/lib/dashboard/presentation';
import styles from './incident-operations.module.css';

export type IncidentStatusFilter = 'ALL' | 'ACTIVE' | 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'CLOSED';
export type IncidentSourceFilter = 'all' | 'firewall' | 'switch' | 'vmware';
export type IncidentArchiveFilter = 'HOT' | 'ARCHIVED';
export type IncidentSort = 'severity' | 'lastSeenAt';
export type IncidentSortDirection = 'asc' | 'desc';
export interface IncidentListItem {
  id: string; severity: string; title: string; deviceName: string | null; createdAt: string;
  alarm: { code: string; category: string; source?: string };
  incident?: { id: string; status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'CLOSED'; occurrenceCount: number; firstSeenAt: string; lastSeenAt: string; assignedTo: string | null };
}
const severityLabels: Record<string, string> = { ALARM_CRITICAL: 'Kritik', ALARM_HIGH: 'Yüksek', ALARM_MEDIUM: 'Orta', ALARM_LOW: 'Düşük', ALARM_INFO: 'Bilgi' };
function sourceLabel(alarm: IncidentListItem['alarm']) {
  const source = alarm.source?.toLowerCase(), code = alarm.code.toUpperCase();
  if (source === 'vmware' || code.startsWith('VM_') || code.startsWith('SNAPSHOT_')) return 'VMware';
  if (source === 'nms' || code.startsWith('NMS_') || code.startsWith('SNMP_')) return 'NMS';
  return "Güvenlik Duvarı";
}
function timeLabel(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const time = d.toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' }) === new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' }) ? time : `${d.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit' })} ${time}`;
}
function dateLabel(value: string) { const d = new Date(value); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }); }

export function IncidentOverview({ status, severity, archive, loading }: { status: Record<string, number>; severity: Record<string, number>; archive: IncidentArchiveFilter; loading: boolean }) {
  const pending = loading && Object.keys(status).length === 0;
  return <div className={styles.summary} aria-label="Olay özeti" aria-busy={pending}>{archive === 'ARCHIVED' ? <div className={styles.summaryCard}><span className={styles.summaryIcon}><Archive size={21} aria-hidden="true" /></span><div><strong>Arşiv kayıtları</strong><span>Arşivdeki olayları görüntülüyorsunuz.</span></div></div> : [
    { label: 'Açık olay', hint: 'İnceleme bekliyor', count: status.OPEN || 0, icon: CircleDot, tone: styles.summaryOpen },
    { label: 'Kritik olay', hint: 'Aktif kritik öncelik', count: severity.ALARM_CRITICAL || 0, icon: CircleAlert, tone: (severity.ALARM_CRITICAL || 0) > 0 ? styles.summaryCritical : '' },
    { label: 'Onaylandı', hint: 'İnceleme sürüyor', count: status.ACKNOWLEDGED || 0, icon: CheckCheck, tone: styles.summaryAcknowledged },
  ].map(({ label, hint, count, icon: Icon, tone }) => <div key={label} className={cn(styles.summaryCard, tone)}>
    <span className={styles.summaryIcon}><Icon size={21} aria-hidden="true" /></span>
    <div><span className={styles.summaryLabel}>{label}</span>{pending ? <Skeleton className="my-1 h-7 w-12" /> : <strong>{new Intl.NumberFormat('tr-TR').format(count)}</strong>}<span>{hint}</span></div>
  </div>)}</div>;
}

export function IncidentFilters({ status, severity, source, archive, assignee, search, counts, disabled, onStatus, onSeverity, onSource, onArchive, onAssignee, onSearch }: {
  status: IncidentStatusFilter; severity: string; source: IncidentSourceFilter; archive: IncidentArchiveFilter; assignee: string; search: string; counts: Record<string, number>; disabled?: boolean;
  onStatus: (v: IncidentStatusFilter) => void; onSeverity: (v: string) => void; onSource: (v: IncidentSourceFilter) => void; onArchive: (v: IncidentArchiveFilter) => void; onAssignee: (v: string) => void; onSearch: (v: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [people, setPeople] = useState<Array<{ id: string; name: string }>>([]);
  const [peopleLoading, setPeopleLoading] = useState(true);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [peopleRevision, setPeopleRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setPeopleLoading(true); setPeopleError(null);
    void (async () => {
      try {
        const response = await fetch('/api/alarm-incidents/assignees?scope=filter', { signal: controller.signal, cache: 'no-store' });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(uiError(result.error || 'Sorumlu listesi alınamadı.'));
        if (!controller.signal.aborted) setPeople(result.data);
      } catch (cause) {
        if (!controller.signal.aborted) setPeopleError(uiError(cause instanceof Error ? cause.message : 'Sorumlu listesi alınamadı.'));
      } finally { if (!controller.signal.aborted) setPeopleLoading(false); }
    })();
    return () => controller.abort();
  }, [peopleRevision]);
  const isActive = ['ACTIVE', 'OPEN', 'ACKNOWLEDGED'].includes(status);
  const activeFilters = Number(source !== 'all') + Number(archive !== 'HOT') + Number(assignee !== 'all') + Number(status === 'OPEN' || status === 'ACKNOWLEDGED');
  const assigneeLabel = assignee === 'me' ? 'Bana atananlar' : assignee === 'unassigned' ? 'Atanmamış' : people.find(person => person.id === assignee)?.name || 'Seçili sorumlu';
  const reset = () => { onSearch(''); onSeverity('all'); onSource('all'); onArchive('HOT'); onAssignee('all'); onStatus('ACTIVE'); };
  return <section aria-label="Olay filtreleri">
    <div className={styles.filterHeader}>
    <div className={styles.tabs} role="group" aria-label="Olay durumu">
      {([
        { value: 'ALL', label: 'Tümü', icon: Layers, count: Object.values(counts).reduce((sum, count) => sum + count, 0), selected: status === 'ALL' },
        { value: 'ACTIVE', label: 'Aktif', icon: Activity, count: (counts.OPEN || 0) + (counts.ACKNOWLEDGED || 0), selected: isActive },
        { value: 'RESOLVED', label: 'Çözüldü', icon: CheckCircle2, count: counts.RESOLVED || 0, selected: status === 'RESOLVED' },
        { value: 'CLOSED', label: 'Kapatıldı', icon: LockKeyhole, count: counts.CLOSED || 0, selected: status === 'CLOSED' },
      ] as const).map(item => <button type="button" key={item.value} className={styles.tab} aria-pressed={item.selected} disabled={disabled} onClick={() => onStatus(item.value)}><item.icon size={15} aria-hidden="true" />{item.label}<span className={styles.tabCount}>{item.count}</span></button>)}
    </div>
    <div className={styles.ownerViews} role="group" aria-label="Sorumlu görünümü">
      <button type="button" aria-pressed={assignee === 'all'} disabled={disabled} onClick={() => onAssignee('all')}><UsersRound size={14} aria-hidden="true" />Tüm olaylar</button>
      <button type="button" aria-pressed={assignee === 'me'} disabled={disabled} onClick={() => onAssignee('me')}><UserRound size={14} aria-hidden="true" />Bana atananlar</button>
    </div>
    </div>
    <fieldset disabled={disabled} className={styles.toolbar}><legend className="sr-only">Arama ve filtreler</legend>
      <div className={styles.search}><Search size={18} aria-hidden="true" /><Input aria-label="Olay ara" value={search} onChange={e => onSearch(e.target.value)} placeholder="Olay, cihaz veya kod ara" className={styles.searchInput} />{search && <button type="button" aria-label="Aramayı temizle" onClick={() => onSearch('')}><X size={16} /></button>}</div>
      <Popover open={expanded} onOpenChange={setExpanded}>
        <PopoverTrigger asChild><Button variant="outline" className={styles.filterButton} disabled={disabled}><SlidersHorizontal size={17} aria-hidden="true" />Filtreler{activeFilters > 0 && <span className={styles.filterCount}>{activeFilters}</span>}</Button></PopoverTrigger>
        <PopoverContent align="end" collisionPadding={12} aria-label="Olay filtreleri" className="z-1050 max-h-(--radix-popover-content-available-height) w-[min(320px,calc(100vw-32px))] space-y-4 overflow-y-auto p-5">
          <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Olay filtreleri</h2><Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Filtreleri kapat" onClick={() => setExpanded(false)}><X size={16} /></Button></div>
          <label className={styles.filterLabel}>Kaynak sistemi<select value={source} onChange={e => onSource(e.target.value as IncidentSourceFilter)} className={styles.select}><option value="all">Tüm kaynaklar</option><option value="firewall">Güvenlik Duvarı</option><option value="switch">NMS / Ağ Anahtarı</option><option value="vmware">VMware</option></select></label>
          <div>
            <label className={styles.filterLabel}>Sorumlu<select value={assignee} onChange={e => onAssignee(e.target.value)} className={styles.select} disabled={disabled}>
              <option value="all">Tüm sorumlular</option><option value="me">Bana atananlar</option><option value="unassigned">Atanmamış</option>
              {!['all', 'me', 'unassigned'].includes(assignee) && !people.some(person => person.id === assignee) && <option value={assignee}>Seçili sorumlu</option>}
              {people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select></label>
            {peopleLoading && <p className={styles.peopleHint} role="status">Kullanıcılar yükleniyor…</p>}
            {peopleError && <p className={styles.peopleHint} role="alert">{uiError(peopleError)}<button type="button" disabled={disabled} onClick={() => setPeopleRevision(value => value + 1)}>Tekrar dene</button></p>}
          </div>
          {isActive && <label className={styles.filterLabel}>Aktif olay durumu<select value={status} onChange={e => onStatus(e.target.value as IncidentStatusFilter)} className={styles.select}><option value="ACTIVE">Tüm aktif olaylar</option><option value="OPEN">Açık</option><option value="ACKNOWLEDGED">Onaylandı</option></select></label>}
          <label className={styles.filterLabel}>Saklama alanı<select value={archive} onChange={e => onArchive(e.target.value as IncidentArchiveFilter)} className={styles.select}><option value="HOT">Aktif kayıtlar</option><option value="ARCHIVED">Arşiv</option></select></label>
          <div className="flex items-center justify-between border-t pt-3"><button type="button" className="text-sm text-muted-foreground underline underline-offset-4" onClick={reset}>Filtreleri sıfırla</button><Button size="sm" onClick={() => setExpanded(false)}>Tamam</Button></div>
        </PopoverContent>
      </Popover>
      <label className={styles.severitySelect}><Flag size={16} aria-hidden="true" /><span className="sr-only">Önem seviyesi</span><select value={severity} onChange={e => onSeverity(e.target.value)} className={styles.select}><option value="all">Tüm önem seviyeleri</option>{Object.entries(severityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </fieldset>
    {(activeFilters > 0 || severity !== 'all' || search) && <div className={styles.appliedFilters}>
      {assignee !== 'all' && <span>Sorumlu: {assigneeLabel}</span>}{status === 'OPEN' && <span>Durum: Açık</span>}{status === 'ACKNOWLEDGED' && <span>Durum: Onaylandı</span>}{source !== 'all' && <span>Kaynak: {source === 'switch' ? 'NMS / Switch' : source === 'firewall' ? 'Firewall' : 'VMware'}</span>}{archive === 'ARCHIVED' && <span>Arşiv kayıtları</span>}{severity !== 'all' && <span>Önem: {severityLabels[severity]}</span>}
      <button type="button" onClick={reset} disabled={disabled}>Filtreleri sıfırla<X size={13} aria-hidden="true" /></button>
    </div>}
  </section>;
}

export function IncidentList({ events, total, loading, refreshing, error, acknowledgingIds, selectedIds, page, hasMore, sort, direction, onSort, onPrevious, onNext, onOpen, onSelection, onAcknowledgeSelected, onAssignSelected, onTransitionSelected, onRetry }: {
  events: IncidentListItem[]; total: number; loading: boolean; refreshing: boolean; error: string | null; acknowledgingIds: Set<string>; selectedIds: Set<string>; page: number; hasMore: boolean; sort: IncidentSort; direction: IncidentSortDirection;
  onSort: (v: IncidentSort) => void; onPrevious: () => void; onNext: () => void; onOpen: (v: IncidentListItem) => void; onSelection: (v: Set<string>) => void; onAcknowledgeSelected: () => void; onAssignSelected: (assigneeId: string) => Promise<IncidentBulkAssignmentResult>; onRetry: () => void;
  onTransitionSelected: (action: IncidentBulkLifecycleAction, reason: string) => Promise<IncidentBulkLifecycleResult>;
}) {
  const selectable = events.filter(e => e.incident);
  const selectedCount = selectable.filter(e => selectedIds.has(e.incident!.id)).length;
  const openSelectedCount = selectable.filter(e => e.incident?.status === 'OPEN' && selectedIds.has(e.incident.id)).length;
  const selectedIncidents = selectable.filter(e => selectedIds.has(e.incident!.id)).map(e => ({ id: e.incident!.id, title: e.title, status: e.incident!.status }));
  const resolveIncidents = selectedIncidents.filter(incident => isIncidentBulkLifecycleEligible(incident.status, 'RESOLVE'));
  const closeIncidents = selectedIncidents.filter(incident => isIncidentBulkLifecycleEligible(incident.status, 'CLOSE'));
  const resolveExcludedIncidents = selectedIncidents.filter(incident => !isIncidentBulkLifecycleEligible(incident.status, 'RESOLVE'));
  const closeExcludedIncidents = selectedIncidents.filter(incident => !isIncidentBulkLifecycleEligible(incident.status, 'CLOSE'));
  const allSelected = selectable.length > 0 && selectedCount === selectable.length;
  const busy = acknowledgingIds.size > 0 || refreshing;
  const selectionKey = JSON.stringify([...selectedIds].sort());
  const keepEligible = (action: IncidentBulkLifecycleAction) => {
    if (busy || loading) return;
    onSelection(new Set(selectedIncidents.filter(incident => isIncidentBulkLifecycleEligible(incident.status, action)).map(incident => incident.id)));
  };
  const restoreSelection = (ids: string[]) => {
    if (busy || loading) return null;
    const availableIds = new Set(selectable.map(event => event.incident!.id));
    const restoredIds = [...new Set(ids.filter(id => availableIds.has(id)))];
    onSelection(new Set(restoredIds));
    return restoredIds;
  };
  const toggle = (id: string) => { const next = new Set(selectedIds); if (next.has(id)) next.delete(id); else next.add(id); onSelection(next); };
  const sortHeading = (value: IncidentSort, label: string) => <button type="button" onClick={() => onSort(value)} disabled={loading || busy} className={styles.sortButton}>{label}{sort === value ? direction === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : <SlidersHorizontal size={12} className="opacity-40" />}</button>;
  return <section aria-label="Olay listesi" aria-busy={loading}>
    <div className={styles.mobileOrdering} aria-label="Olay sıralaması">Sırala: {sortHeading('severity', 'Önem')}{sortHeading('lastSeenAt', 'Son görülme')}</div>
    {selectedCount > 0 && <div className={styles.selectionBar} role="region" aria-label="Toplu olay işlemleri"><Check size={18} aria-hidden="true" /><strong aria-live="polite">{selectedCount} seçili</strong><div className={styles.selectionActions}><IncidentBulkAssignment count={selectedCount} disabled={busy || loading} onAssign={onAssignSelected} />{openSelectedCount > 0 && <Button onClick={onAcknowledgeSelected} disabled={busy || loading} className={styles.acknowledgeButton}>{busy ? <RefreshCw size={16} className="animate-spin motion-reduce:animate-none" /> : <Check size={16} />}{openSelectedCount === selectedCount ? 'Seçilenleri onayla' : `Açık olanları onayla (${openSelectedCount})`}</Button>}<IncidentBulkLifecycle key="resolve" onRestoreSelection={restoreSelection} selectionKey={selectionKey} onKeepEligible={() => keepEligible('RESOLVE')} action="RESOLVE" incidents={resolveIncidents} excludedIncidents={resolveExcludedIncidents} disabled={busy || loading} onApply={onTransitionSelected} /><IncidentBulkLifecycle key="close" onRestoreSelection={restoreSelection} selectionKey={selectionKey} onKeepEligible={() => keepEligible('CLOSE')} action="CLOSE" incidents={closeIncidents} excludedIncidents={closeExcludedIncidents} disabled={busy || loading} onApply={onTransitionSelected} /></div><Button variant="ghost" size="icon" aria-label="Seçimi temizle" disabled={busy} onClick={() => onSelection(new Set())}><X size={18} /></Button></div>}
    {error ? <div role="alert" className={styles.error}><p>{uiError(error)}</p><Button size="sm" variant="outline" onClick={onRetry}>Tekrar dene</Button></div> : loading ? <div aria-label="Olay listesi yükleniyor" role="status" className={styles.skeletonRows}>{Array.from({ length: 5 }, (_, i) => <div key={i}><Skeleton className="h-5 w-16" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/3" /></div><Skeleton className="h-6 w-20" /></div>)}</div> : events.length === 0 ? <div className={styles.empty}><CheckCircle2 size={32} aria-hidden="true" /><h2>Bu görünümde olay yok</h2><p>Diğer durumları veya filtreleri seçerek kayıtları görüntüleyebilirsiniz.</p></div> : <div className={styles.tableContainer}>
      <table className={styles.table}><caption className="sr-only">Olay kayıtları. Önem veya son görülme başlığını seçerek sıralayabilirsiniz.</caption>
        <thead><tr><th className={styles.checkCell}><Checkbox aria-label="Bu sayfadaki olayları seç" checked={allSelected ? true : selectedCount > 0 ? 'indeterminate' : false} disabled={selectable.length === 0 || busy} onCheckedChange={() => onSelection(allSelected ? new Set() : new Set(selectable.map(e => e.incident!.id)))} /></th><th aria-sort={sort === 'severity' ? direction === 'asc' ? 'ascending' : 'descending' : 'none'}>{sortHeading('severity', 'Önem')}</th><th>Olay / Cihaz</th><th>Durum</th><th className={styles.sourceCell}>Kaynak</th><th className={styles.assigneeCell}>Sorumlu</th><th aria-sort={sort === 'lastSeenAt' ? direction === 'asc' ? 'ascending' : 'descending' : 'none'}>{sortHeading('lastSeenAt', 'Son görülme')}</th><th><span className="sr-only">İşlem</span></th></tr></thead>
        <tbody>{events.map(event => {
          const incident = event.incident, firstSeen = incident?.firstSeenAt || event.createdAt, lastSeen = incident?.lastSeenAt || event.createdAt;
          return <tr key={incident?.id || event.id} data-selected={Boolean(incident && selectedIds.has(incident.id))}>
            <td className={styles.checkCell}>{incident && <Checkbox checked={selectedIds.has(incident.id)} disabled={busy} aria-label={`${event.title} olayını seç`} onCheckedChange={() => toggle(incident.id)} />}</td>
            <td data-label="Önem"><IncidentSeverityBadge value={event.severity} /></td>
            <td className={styles.incidentCell}><button type="button" onClick={() => onOpen(event)} className={styles.incidentTitle} aria-label={event.title} title={event.title}>{incidentLabel(event.alarm.code, event.title)}</button><p className={styles.incidentMeta}><span title={incident?.id || event.id}>{incident ? `INC-${incident.id.slice(-8).toUpperCase()}` : event.alarm.code}</span><span aria-hidden="true">·</span><span className={styles.metaItem}><Repeat2 size={12} aria-hidden="true" />{incident?.occurrenceCount || 1} tekrar</span></p><p className={styles.deviceName}><Monitor size={13} aria-hidden="true" />{event.deviceName || 'Varlık bilgisi yok'}</p></td>
            <td data-label="Durum"><IncidentStatusBadge value={incident?.status || 'CLOSED'} label={incident ? undefined : 'Eski kayıt'} /></td>
            <td data-label="Kaynak" className={styles.sourceCell}><span className={styles.metaItem}><IncidentSourceIcon source={sourceLabel(event.alarm)} />{sourceLabel(event.alarm)}</span></td>
            <td data-label="Sorumlu" className={cn(styles.assigneeCell, !incident?.assignedTo && styles.unassigned)}><span className={styles.metaItem}><UserRound size={14} aria-hidden="true" />{incident?.assignedTo || 'Atanmamış'}</span></td>
            <td data-label="Son görülme" className={styles.timeCell}><time dateTime={lastSeen} title={dateLabel(lastSeen)}><Clock3 size={12} aria-hidden="true" />{timeLabel(lastSeen)}</time><span title={dateLabel(firstSeen)}><CalendarClock size={12} aria-hidden="true" />İlk: {timeLabel(firstSeen)}</span></td><td className={styles.actionCell}><Button variant="outline" size="sm" onClick={() => onOpen(event)} aria-label={`${event.title} detayını aç`} className={styles.inspectButton}>İncele<ArrowRight size={15} aria-hidden="true" /></Button></td>
          </tr>;
        })}</tbody>
      </table>
    </div>}
    <footer className={styles.footer}><p role="status">{loading ? 'Kayıtlar yükleniyor…' : error ? 'Kayıtlar alınamadı' : total === 0 ? "0 olay" : `${page * 25 + 1}–${page * 25 + events.length} / ${total} olay`}</p><nav aria-label="Olay sayfaları"><Button variant="outline" size="icon" aria-label="Önceki sayfa" disabled={page === 0 || loading || busy} onClick={onPrevious}><ChevronLeft size={17} /></Button><span aria-current="page" className={styles.pageNumber}>{page + 1}</span><Button variant="outline" size="icon" aria-label="Sonraki sayfa" disabled={!hasMore || loading || busy || Boolean(error)} onClick={onNext}><ChevronRight size={17} /></Button></nav></footer>
  </section>;
}
