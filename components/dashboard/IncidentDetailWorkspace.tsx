'use client';

import { uiError } from '@/lib/i18n/tr';
import Link from 'next/link';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Activity, Archive, ArchiveRestore, ArrowRight, Bell, BellRing, CalendarClock, CheckCheck, CheckCircle2, ChevronDown, Clock3, Code2, FileText, History, Info, Layers, LayoutDashboard, ListChecks, LockKeyhole, MessageSquareText, Monitor, MoreHorizontal, RefreshCw, Repeat2, RotateCcw, Server, Settings2, Shield, UserRound } from 'lucide-react';
import { DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { buildIncidentHistory, incidentHistoryHighlights, incidentDate, incidentLifecycleActions, incidentSourceLabel, type HistoryKind, type IncidentActionPayload, type IncidentDetailAction, type IncidentDetailData, type IncidentDetailEvent, type IncidentHistoryEntry } from '@/lib/alarms/incident-detail-presentation';
import { INCIDENT_NOTE_MAX_LENGTH } from '@/lib/alarms/incident-collaboration';
import { cn } from '@/lib/utils';
import { IncidentSeverityBadge, IncidentSourceIcon, IncidentStatusBadge, IncidentSymbol } from './IncidentVisuals';
import { incidentLabel } from '@/lib/dashboard/presentation';
import styles from './incident-detail.module.css';

function HistoryList({ entries }: { entries: IncidentHistoryEntry[] }) {
  return <ol className={styles.timeline}>{entries.map(entry => {
    const Icon = entry.kind === 'note' ? MessageSquareText : entry.type === 'ASSIGNED' ? UserRound : entry.kind === 'occurrence' ? Activity : entry.kind === 'notification' ? Bell : entry.type === 'CREATED' ? BellRing : entry.type === 'ACKNOWLEDGED' ? CheckCheck : entry.type === 'CLOSED' ? LockKeyhole : entry.type === 'RESOLVED' ? CheckCircle2 : entry.type === 'REOPENED' ? Repeat2 : History;
    return <li key={entry.id} className={styles.timelineEntry}>
      <span className={styles.timelineIcon}><Icon size={16} aria-hidden="true" /></span>
      <div className={styles.timelineBody}><div className={styles.timelineHeading}><h4>{entry.title}</h4><time dateTime={entry.createdAt} title={incidentDate(entry.createdAt)}>{incidentDate(entry.createdAt)}</time></div>
        {(entry.description || entry.actor) && <p>{[entry.description, entry.actor].filter(Boolean).join(' · ')}</p>}
        {entry.reason && <p className={styles.timelineReason}>{entry.reason}</p>}
      </div>
    </li>;
  })}</ol>;
}

export function IncidentDetailWorkspace({ event, detail, loading, error, busy, notice, description, recommendedAction, onRetry, onAction, onDiscard, children }: {
  event: IncidentDetailEvent; detail: IncidentDetailData | null; loading: boolean; error: string | null; busy: boolean;
  notice: { text: string; type: 'success' | 'error'; authStatus?: 401 | 403 } | null; description: string; recommendedAction?: string;
  onRetry: () => void; onAction: (action: IncidentDetailAction, payload?: IncidentActionPayload) => Promise<boolean>; onDiscard: () => void; children: ReactNode;
}) {
  const [tab, setTab] = useState('overview');
  const [historyKind, setHistoryKind] = useState<HistoryKind | 'all'>('all');
  const [visibleHistory, setVisibleHistory] = useState(20);
  const [moreOpen, setMoreOpen] = useState(false);
  const pendingDiscard = useRef(false);
  const incident = detail && detail.id === event.incident?.id ? detail : event.incident;
  const [assignees, setAssignees] = useState<Array<{ id: string; name: string }>>([]);
  const [canManage, setCanManage] = useState(false);
  const [peopleLoading, setPeopleLoading] = useState(Boolean(incident));
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [peopleRevision, setPeopleRevision] = useState(0);
  const [assigneeId, setAssigneeId] = useState(incident?.assignedToId || '');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState<'assignment' | 'note' | null>(null);
  const savingRef = useRef(false);
  const noteAttempt = useRef<{ incidentId: string; reason: string; requestId: string } | null>(null);
  const incidentId = incident?.id;
  useEffect(() => { setAssigneeId(incident?.assignedToId || ''); }, [incident?.assignedToId]);
  useEffect(() => {
    if (!incidentId) return;
    const controller = new AbortController();
    setPeopleLoading(true); setPeopleError(null); setCanManage(false);
    void (async () => {
      try {
        const response = await fetch('/api/alarm-incidents/assignees', { signal: controller.signal, cache: 'no-store' });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(uiError(result.error || 'Sorumlu listesi alınamadı.'));
        if (!controller.signal.aborted) { setAssignees(result.data); setCanManage(result.canManage === true); }
      } catch (cause) {
        if (!controller.signal.aborted) setPeopleError(uiError(cause instanceof Error ? cause.message : 'Sorumlu listesi alınamadı.'));
      } finally { if (!controller.signal.aborted) setPeopleLoading(false); }
    })();
    return () => controller.abort();
  }, [incidentId, peopleRevision]);
  const saveCollaboration = async (kind: 'assignment' | 'note') => {
    if (savingRef.current) return;
    savingRef.current = true; setSaving(kind);
    try {
      const reason = note.trim();
      if (kind === 'note' && (!noteAttempt.current || noteAttempt.current.incidentId !== incidentId || noteAttempt.current.reason !== reason)) {
        noteAttempt.current = { incidentId: incidentId || event.id, reason, requestId: crypto.randomUUID() };
      }
      const success = await onAction(kind === 'note' ? 'ADD_NOTE' : 'ASSIGN', kind === 'note'
        ? { reason, requestId: noteAttempt.current!.requestId } : { assigneeId: assigneeId || null });
      if (success && kind === 'note') { setNote(''); noteAttempt.current = null; }
    } finally { savingRef.current = false; setSaving(null); }
  };
  const history = useMemo(() => detail ? buildIncidentHistory(detail) : [], [detail]);
  const lastNotification = history.find(entry => entry.kind === 'notification');
  const filteredHistory = historyKind === 'all' ? history : history.filter(entry => entry.kind === historyKind);
  const actions = incidentLifecycleActions(incident);
  const blocked = busy || saving !== null || loading || Boolean(error);
  const collaborationBlocked = blocked || peopleLoading || !canManage || !incident;
  const severity = detail?.severity || event.severity;
  const operationText = !incident ? "Bu alarm bir olay kaydına bağlı değil." : incident.archiveState === 'ARCHIVED' ? 'Bu olay arşivde korunuyor.' : {
    OPEN: 'İncelemeye başladığınızda olayı onaylayın.', ACKNOWLEDGED: 'İnceleme sürüyor. Sorun giderildiğinde çözümü kaydedin.',
    RESOLVED: 'Çözüm kaydedildi. Takip tamamlandığında olayı kapatın.', CLOSED: 'Olay kapatıldı. Kaydı arşive taşıyabilirsiniz.',
  }[incident.status];
  const historyState = loading ? <div className={styles.historyState} role="status"><RefreshCw size={17} className="animate-spin motion-reduce:animate-none" />Olay geçmişi yükleniyor…</div>
    : error ? <div className={styles.historyError} role="alert"><Info size={17} /><div><p>{uiError(error)}</p><Button size="sm" variant="outline" onClick={onRetry}>Tekrar dene</Button></div></div>
      : !incident ? <p className={styles.historyState}>Bu eski alarm için olay geçmişi bulunmuyor.</p>
        : history.length === 0 ? <p className={styles.historyState}>Henüz geçmiş kaydı bulunmuyor.</p> : null;

  return <div className={styles.workspace}>
    <header className={styles.header}>
      <IncidentSymbol code={event.alarm.code} severity={severity} className={styles.headerIcon} />
      <div className={styles.eyebrow}><span>Olay detayı</span><span aria-hidden="true">/</span><span title={incident?.id || event.id}>{incident ? `INC-${incident.id.slice(-8).toUpperCase()}` : 'Eski alarm kaydı'}</span></div>
      <div className={styles.badges}><IncidentSeverityBadge value={severity} />{incident && <IncidentStatusBadge value={incident.status} />}{incident?.archiveState === 'ARCHIVED' && <span className={styles.archiveBadge}><Archive size={13} aria-hidden="true" />Arşiv</span>}</div>
      <DialogTitle className={styles.title} data-incident-heading tabIndex={-1}>{incidentLabel(event.alarm.code, detail?.title || event.title)}</DialogTitle>
      <DialogDescription className={styles.subtitle}><span><Monitor size={14} aria-hidden="true" />{event.deviceName || 'Varlık belirtilmemiş'}</span><span aria-hidden="true">·</span><span><IncidentSourceIcon source={incidentSourceLabel(detail?.source || event.alarm.source)} />{incidentSourceLabel(detail?.source || event.alarm.source)}</span></DialogDescription>
    </header>

    <div className={styles.layout}>
      <Tabs value={tab} onValueChange={setTab} className={styles.main}>
        <TabsList className={styles.tabs} aria-label="Olay detay bölümleri"><TabsTrigger value="overview"><LayoutDashboard size={15} aria-hidden="true" />Genel bakış</TabsTrigger><TabsTrigger value="history"><History size={15} aria-hidden="true" />Olay geçmişi{detail && <span className={styles.count}>{history.length}</span>}</TabsTrigger><TabsTrigger value="technical"><Code2 size={15} aria-hidden="true" />Teknik detaylar</TabsTrigger></TabsList>
        <div className={styles.mainContent}>
          <TabsContent value="overview" className={styles.tabContent}>
            <dl className={styles.facts}>
              <div><dt><CalendarClock size={15} aria-hidden="true" />İlk görülme</dt><dd>{incidentDate(incident?.firstSeenAt || event.createdAt)}</dd></div>
              <div><dt><Clock3 size={15} aria-hidden="true" />Son görülme</dt><dd>{incidentDate(incident?.lastSeenAt || event.createdAt)}</dd></div>
              <div><dt><Repeat2 size={15} aria-hidden="true" />Alarm oluşumu</dt><dd>{incident?.occurrenceCount || 1}<small> kez görüldü</small></dd></div>
              <div><dt><RotateCcw size={15} aria-hidden="true" />Yeniden açılma</dt><dd>{incident?.reopenCount || 0}<small> kez</small></dd></div>
              <div><dt><UserRound size={15} aria-hidden="true" />Sorumlu</dt><dd>{incident?.assignedTo || 'Atanmamış'}</dd></div>
              <div><dt><Code2 size={15} aria-hidden="true" />Alarm kodu</dt><dd className={styles.factCode}>{event.alarm.code}</dd></div>
            </dl>
            {description && <section className={styles.description}><h3><FileText size={17} aria-hidden="true" />Olay özeti</h3><p>{description}</p></section>}
            {recommendedAction && <section className={styles.recommendation}><Info size={17} aria-hidden="true" /><div><h3>Önerilen aksiyon</h3><p>{recommendedAction}</p></div></section>}
            {incident && <section className={styles.notes} aria-label="Operasyon notları">
              <div className={styles.sectionHeading}><h3><MessageSquareText size={17} aria-hidden="true" />Operasyon notları</h3><button type="button" onClick={() => { setHistoryKind('note'); setVisibleHistory(20); setTab('history'); }}>Not geçmişi<ArrowRight size={14} aria-hidden="true" /></button></div>
              <form onSubmit={event => { event.preventDefault(); if (!collaborationBlocked && note.trim()) void saveCollaboration('note'); }}>
                <label htmlFor="incident-operation-note" className={styles.fieldLabel}>Yeni operasyon notu</label>
                <textarea id="incident-operation-note" value={note} onChange={event => setNote(event.target.value)} maxLength={INCIDENT_NOTE_MAX_LENGTH} rows={3} placeholder="İnceleme bulgusu, yapılan müdahale veya bir sonraki adım…" disabled={collaborationBlocked} aria-describedby="incident-note-hint" />
                <div className={styles.noteFooter}><p id="incident-note-hint">{!peopleLoading && !peopleError && !canManage ? 'Not eklemek için yönetici veya editör yetkisi gerekiyor.' : 'Yazan kişi ve zaman bilgisiyle geçmişe kaydedilir.'}<span>{note.length} / {INCIDENT_NOTE_MAX_LENGTH}</span></p><Button type="submit" size="sm" disabled={collaborationBlocked || !note.trim()}>{saving === 'note' ? <RefreshCw size={14} className="animate-spin motion-reduce:animate-none" /> : <MessageSquareText size={14} />}{saving === 'note' ? 'Kaydediliyor…' : 'Not ekle'}</Button></div>
              </form>
              {notice?.type === 'error' && notice.authStatus === 401 && !blocked && <Button asChild variant="outline" size="sm"><Link href="/login?next=%2Fdashboard%2Falerts" target="_blank" rel="noopener noreferrer">Yeni sekmede giriş yap</Link></Button>}
            </section>}
            <section aria-label="Öne çıkan hareketler"><div className={styles.sectionHeading}><h3><ListChecks size={17} aria-hidden="true" />Öne çıkan hareketler</h3>{history.length > 0 && <button type="button" onClick={() => setTab('history')}>Tüm geçmiş<ArrowRight size={14} aria-hidden="true" /></button>}</div>{historyState || <HistoryList entries={incidentHistoryHighlights(history)} />}</section>
          </TabsContent>
          <TabsContent value="history" className={styles.tabContent}>
            <div className={styles.sectionHeading}><h3><History size={17} aria-hidden="true" />Olay geçmişi</h3><span className={styles.timezone}><Clock3 size={13} aria-hidden="true" />Türkiye saati</span></div>
            <div className={styles.historyFilters} role="group" aria-label="Geçmiş türü">
              {([{ value: 'all', label: 'Tümü', icon: Layers }, { value: 'transition', label: 'Durum / sorumlu', icon: Activity }, { value: 'note', label: 'Operasyon notları', icon: MessageSquareText }, { value: 'occurrence', label: 'Oluşumlar', icon: Repeat2 }, { value: 'notification', label: 'Bildirimler', icon: Bell }] as const).map(item => <button type="button" key={item.value} aria-pressed={historyKind === item.value} onClick={() => { setHistoryKind(item.value); setVisibleHistory(20); }}><item.icon size={13} aria-hidden="true" />{item.label}</button>)}
            </div>
            {historyState || (filteredHistory.length === 0 ? <p className={styles.historyState}>Bu türde geçmiş kaydı yok.</p> : <><HistoryList entries={filteredHistory.slice(0, visibleHistory)} />{filteredHistory.length > visibleHistory && <Button variant="outline" size="sm" className={styles.loadHistory} onClick={() => setVisibleHistory(value => value + 20)}><ChevronDown size={15} />Daha fazla göster ({filteredHistory.length - visibleHistory})</Button>}</>)}
            {detail && <p className={styles.historyFootnote}>{detail.occurrenceCount > detail.occurrences.length ? `${detail.occurrenceCount} oluşumun son ${detail.occurrences.length} kaydı gösteriliyor. ` : ''}{detail.transitions.length === 100 ? 'Son 100 durum, sorumlu ve not hareketi yüklendi. ' : ''}{detail.notificationAttempts.length === 100 ? 'Son 100 bildirim denemesi yüklendi.' : ''}</p>}
          </TabsContent>
          <TabsContent value="technical" className={styles.tabContent}><div className={styles.sectionHeading}><h3><Code2 size={17} aria-hidden="true" />Teknik detaylar</h3></div>{children}</TabsContent>
        </div>
      </Tabs>

      <aside className={styles.aside} aria-label="Olay aksiyonları">
        <section className={styles.operation}><h3><Settings2 size={16} aria-hidden="true" />Operasyon</h3><p>{operationText}</p>
          <div className={styles.actionStack}>{actions.map(item => {
            const Icon = item.action === 'ARCHIVE' ? Archive : item.action === 'RESTORE' ? ArchiveRestore : item.action === 'CLOSE' ? LockKeyhole : item.action === 'RESOLVE' ? CheckCircle2 : CheckCheck;
            return <Button key={item.action} variant={item.primary ? 'default' : 'outline'} className={item.primary ? styles.primaryAction : undefined} disabled={blocked || item.disabled} onClick={() => void onAction(item.action)}>{busy ? <RefreshCw size={16} aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Icon size={16} aria-hidden="true" />}{busy ? 'İşlem sürüyor…' : item.label}</Button>;
          })}</div>
          {incident?.legalHold && <p className={styles.holdNotice}><LockKeyhole size={14} />Saklama koruması etkin.</p>}
          {notice && <p role={notice.type === 'error' ? 'alert' : 'status'} className={cn(styles.actionNotice, notice.type === 'error' && styles.actionError)}>{uiError(notice.text)}</p>}
        </section>
        {incident && <section className={styles.assignment} aria-label="Sorumlu atama">
          <h3><UserRound size={15} aria-hidden="true" />Sorumlu</h3>
          <p className={styles.currentAssignee}>{incident.assignedTo || 'Atanmamış'}</p>
          {peopleError ? <div className={styles.peopleError} role="alert"><p>{uiError(peopleError)}</p><button type="button" onClick={() => setPeopleRevision(value => value + 1)}>Tekrar dene</button></div> : <>
            <label htmlFor="incident-assignee" className={styles.fieldLabel}>Sorumlu seçimi</label>
            <select id="incident-assignee" value={assigneeId} onChange={event => setAssigneeId(event.target.value)} disabled={collaborationBlocked}>
              <option value="">Atanmamış</option>
              {incident.assignedToId && !assignees.some(user => user.id === incident.assignedToId) && <option value={incident.assignedToId} disabled>{incident.assignedTo || 'Mevcut sorumlu'} (uygun değil)</option>}
              {assignees.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
            <p className={styles.fieldHint}>{peopleLoading ? 'Kullanıcılar yükleniyor…' : !canManage ? 'Yalnızca yönetici ve editörler atama yapabilir.' : 'Aktif yönetici ve editörler atanabilir.'}</p>
            <Button variant="outline" size="sm" disabled={collaborationBlocked || assigneeId === (incident.assignedToId || '')} onClick={() => void saveCollaboration('assignment')}>{saving === 'assignment' && <RefreshCw size={14} className="animate-spin motion-reduce:animate-none" />}{saving === 'assignment' ? 'Kaydediliyor…' : assigneeId || !incident.assignedToId ? 'Atamayı kaydet' : 'Atamayı kaldır'}</Button>
          </>}
        </section>}
        <dl className={styles.context}>
          <div><dt><Server size={14} aria-hidden="true" />Kaynak</dt><dd>{incidentSourceLabel(detail?.source || event.alarm.source)}</dd></div>
          <div><dt><Info size={14} aria-hidden="true" />Alarm kodu</dt><dd className={styles.code}>{event.alarm.code}</dd></div>
          <div><dt><Bell size={14} aria-hidden="true" />Son bildirim</dt><dd>{lastNotification ? <>{lastNotification.title}<small className={styles.deliveryDate}>{incidentDate(lastNotification.createdAt)}</small></> : event.notifiedAt ? incidentDate(event.notifiedAt) : 'Gönderilmedi'}</dd></div>
        </dl>
        <Popover open={moreOpen} onOpenChange={setMoreOpen}><PopoverTrigger asChild><Button variant="outline" className={styles.moreButton} disabled={busy}><MoreHorizontal size={17} />Diğer işlemler<ChevronDown size={14} /></Button></PopoverTrigger>
          <PopoverContent align="end" className="pointer-events-auto z-[1060] w-[min(290px,calc(100vw-32px))] p-2" onCloseAutoFocus={event => {
            if (pendingDiscard.current) {
              // Open the next modal after this popover releases its focus scope.
              event.preventDefault();
              pendingDiscard.current = false;
              onDiscard();
            }
          }}>
            {incident?.status === 'ACKNOWLEDGED' && incident.archiveState !== 'ARCHIVED' && <><Button variant="ghost" className="h-auto min-h-10 w-full justify-start gap-2 whitespace-normal text-left text-sm" disabled={blocked} onClick={() => { setMoreOpen(false); void onAction('UNACKNOWLEDGE'); }}><RotateCcw size={16} className="shrink-0" />Onayı geri al</Button><p className="px-3 pb-2 text-xs leading-5 text-muted-foreground">İnceleme onayını geri alır; olay açık duruma geçer.</p><div className="my-1 border-t" /></>}
            {incident && <><Button variant="ghost" className="h-auto min-h-10 w-full justify-start gap-2 whitespace-normal text-left text-sm" disabled={blocked} onClick={() => { setMoreOpen(false); void onAction(incident.legalHold ? 'RELEASE_LEGAL_HOLD' : 'SET_LEGAL_HOLD'); }}><LockKeyhole size={16} className="shrink-0" />{incident.legalHold ? 'Saklama korumasını kaldır' : 'Saklama korumasını etkinleştir'}</Button><p className="px-3 pb-2 text-xs leading-5 text-muted-foreground">Yönetici işlemi. Kanıtların otomatik arşivlenmesini durdurur.</p><div className="my-1 border-t" /></>}
            <Button variant="ghost" className="w-full justify-start gap-2" disabled={busy} onClick={() => { pendingDiscard.current = true; setMoreOpen(false); }}><Shield size={16} />Alarmı hariç tut</Button><p className="px-3 pb-2 text-xs leading-5 text-muted-foreground">Alarmı yok sayma listesine ekler.</p>
          </PopoverContent>
        </Popover>
        <p className={styles.asideFootnote}><Clock3 size={13} aria-hidden="true" />Tüm zamanlar Türkiye saatidir.</p>
      </aside>
    </div>
  </div>;
}
