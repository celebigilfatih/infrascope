'use client';

import { uiError } from '@/lib/i18n/tr';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Activity, ArrowUp, ArrowUpRight, BellRing, CalendarClock,
  CheckCheck, CheckCircle2, CircleAlert, Clock3, FileText, Flag, History,
  Layers, LoaderCircle, LockKeyhole, Radio, RefreshCcw, Repeat2, Server, ShieldCheck, UserRound, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { dashboardGet, incidentLabel } from '@/lib/dashboard/presentation';
import { incidentSourceLabel, incidentStatusLabels } from '@/lib/alarms/incident-detail-presentation';
import { cn } from '@/lib/utils';
import styles from './incident-preview.module.css';
import { incidentAlarmIcon, incidentSeverityAppearance, IncidentSeverityBadge, IncidentStatusBadge } from './IncidentVisuals';

interface Incident {
  id: string; title: string; message: string; status: string; severity: string; source: string;
  firstSeenAt: string; lastSeenAt: string; occurrenceCount: number; entityType: string | null; entityId: string | null;
  alarm: { code: string; name: string };
  transitions: Array<{ id: string; type: string; toStatus: string | null; createdAt: string }>;
}

const transitions: Record<string, { label: string; icon: LucideIcon }> = {
  CREATED: { label: 'Olay açıldı', icon: BellRing },
  MIGRATED: { label: 'Olay kaydı oluşturuldu', icon: FileText },
  ACKNOWLEDGED: { label: 'Onaylandı', icon: CheckCheck },
  UNACKNOWLEDGED: { label: 'Onay geri alındı', icon: RefreshCcw },
  RESOLVED: { label: 'Çözüldü', icon: CheckCircle2 },
  CLOSED: { label: 'Kapatıldı', icon: LockKeyhole },
  REOPENED: { label: 'Yeniden açıldı', icon: Repeat2 },
  ARCHIVED: { label: 'Arşivlendi', icon: Layers },
  RESTORED: { label: 'Arşivden çıkarıldı', icon: ArrowUp },
  ASSIGNED: { label: 'Sorumlu güncellendi', icon: UserRound },
  NOTE_ADDED: { label: 'Operasyon notu eklendi', icon: FileText },
  LEGAL_HOLD_SET: { label: 'Saklama koruması etkinleştirildi', icon: ShieldCheck },
  LEGAL_HOLD_RELEASED: { label: 'Saklama koruması kaldırıldı', icon: ShieldCheck },
};

function Timestamp({ value }: { value: string }) {
  if (Number.isNaN(Date.parse(value))) return <>—</>;
  const date = new Date(value);
  return <time dateTime={value} className={styles.timestamp}>
    <span>{date.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: 'short', year: 'numeric' })}</span>
    <span>{date.toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
  </time>;
}

export function IncidentDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [incident, setIncident] = useState<Incident | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!id) return;
    setIncident(null);
    setError(uiError(''));
    const controller = new AbortController();
    dashboardGet<{ data: Incident }>(`/api/alarm-incidents/${encodeURIComponent(id)}`, undefined, controller.signal)
      .then(result => { if (!controller.signal.aborted) setIncident(result.data); })
      .catch(reason => { if (!controller.signal.aborted) setError(uiError(reason.message)); });
    return () => controller.abort();
  }, [id, retry]);

  const severity = incidentSeverityAppearance(incident?.severity || '');
  const AlarmIcon = incidentAlarmIcon(incident?.alarm.code || '');
  const history = incident?.transitions.slice(0, 4) || [];

  return <Dialog open={Boolean(id)} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className={styles.dialog} closeLabel="Olay detayını kapat" onOpenAutoFocus={event => {
      event.preventDefault();
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      heading.current?.focus({ preventScroll: true });
    }} onCloseAutoFocus={event => {
      event.preventDefault();
      returnFocus.current?.focus({ preventScroll: true });
    }}>
      <DialogHeader className={styles.header}>
        <span className={cn(styles.alarmIcon, styles[severity.tone])}><AlarmIcon size={25} aria-hidden="true" /></span>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>Olay detayı</p>
          <DialogTitle ref={heading} tabIndex={-1} className={styles.title}>
            {incident ? incidentLabel(incident.alarm.code, incident.alarm.name) : 'Olay bilgileri'}
          </DialogTitle>
          <DialogDescription className={styles.subtitle}>{incident?.title || 'Seçilen olayın durumu ve geçmişi.'}</DialogDescription>
        </div>
      </DialogHeader>

      <div className={styles.body}>
        {error ? <div role="alert" className={styles.state}>
          <span className={cn(styles.stateIcon, styles.danger)}><CircleAlert size={24} aria-hidden="true" /></span>
          <h3>Olay bilgileri yüklenemedi</h3>
          <p>{uiError(error)}</p>
          <Button variant="outline" onClick={() => setRetry(value => value + 1)}><RefreshCcw size={16} aria-hidden="true" />Tekrar dene</Button>
        </div> : !incident ? <div className={styles.state} role="status">
          <LoaderCircle className="animate-spin motion-reduce:animate-none" size={26} aria-hidden="true" />
          <p>Olay yükleniyor…</p>
        </div> : <>
          <dl className={styles.facts}>
            <div className={styles.fact}>
              <dt><Activity size={15} aria-hidden="true" />Durum</dt>
              <dd><IncidentStatusBadge value={incident.status} /></dd>
            </div>
            <div className={styles.fact}>
              <dt><Flag size={15} aria-hidden="true" />Öncelik</dt>
              <dd><IncidentSeverityBadge value={incident.severity} /></dd>
            </div>
            <div className={styles.fact}>
              <dt><CalendarClock size={15} aria-hidden="true" />İlk görülme</dt>
              <dd><Timestamp value={incident.firstSeenAt} /></dd>
            </div>
            <div className={styles.fact}>
              <dt><Clock3 size={15} aria-hidden="true" />Son görülme</dt>
              <dd><Timestamp value={incident.lastSeenAt} /></dd>
            </div>
            <div className={styles.fact}>
              <dt><Repeat2 size={15} aria-hidden="true" />Tekrar sayısı</dt>
              <dd className={styles.repeatCount}>{new Intl.NumberFormat('tr-TR').format(incident.occurrenceCount)}<span>kez</span></dd>
            </div>
            <div className={styles.fact}>
              <dt><Server size={15} aria-hidden="true" />Kaynak</dt>
              <dd className={styles.source}><Radio size={15} aria-hidden="true" />{incidentSourceLabel(incident.source)}</dd>
            </div>
          </dl>

          {incident.message && <section className={styles.description} aria-label="Olay açıklaması">
            <FileText size={18} aria-hidden="true" />
            <div><h3>Olay açıklaması</h3><p>{incident.message}</p></div>
          </section>}

          <section className={styles.history} aria-label="Olay geçmişi">
            <div className={styles.sectionHeading}>
              <h3><History size={17} aria-hidden="true" />Olay geçmişi</h3>
              {history.length > 0 && <span>Son {history.length} kayıt</span>}
            </div>
            {history.length ? <ol className={styles.timeline}>{history.map(item => {
              const transition = transitions[item.type];
              const Icon = transition?.icon || Activity;
              return <li key={item.id} className={styles.timelineEntry}>
                <span className={styles.timelineIcon}><Icon size={15} aria-hidden="true" /></span>
                <div className={styles.timelineContent}>
                  <p>{transition?.label || incidentStatusLabels[item.toStatus as keyof typeof incidentStatusLabels] || 'Durum güncellendi'}</p>
                  <Timestamp value={item.createdAt} />
                </div>
              </li>;
            })}</ol> : <p className={styles.emptyHistory}><History size={16} aria-hidden="true" />Henüz durum değişikliği kaydedilmedi.</p>}
          </section>
        </>}
      </div>

      <footer className={styles.footer}>
        <p className={styles.timezone}><Clock3 size={13} aria-hidden="true" />Türkiye saati (UTC+3)</p>
        <div className={styles.actions}>
          <Button variant="outline" onClick={onClose}><X size={15} aria-hidden="true" />Kapat</Button>
          {incident && !error && <Button asChild className={styles.primary}>
            <Link href={`/dashboard/alerts?status=OPEN%2CACKNOWLEDGED&search=${encodeURIComponent(incident.alarm.code)}`}>
              Olay yönetimini aç<ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </Button>}
        </div>
      </footer>
    </DialogContent>
  </Dialog>;
}
