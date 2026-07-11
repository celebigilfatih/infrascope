import { AlertTriangle, CheckCircle2, Clock3, Eye, RefreshCw, Repeat2, Search, Shield, Router, Monitor } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export type IncidentStatusFilter = 'ACTIVE' | 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'CLOSED';
export type IncidentSourceFilter = 'all' | 'firewall' | 'switch' | 'vmware';
export type IncidentArchiveFilter = 'HOT' | 'ARCHIVED';

export interface IncidentListItem {
  id: string;
  severity: string;
  title: string;
  deviceName: string | null;
  createdAt: string;
  alarm: { code: string; category: string; source?: string };
  incident?: {
    id: string;
    status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'CLOSED';
    occurrenceCount: number;
    lastSeenAt: string;
    assignedTo: string | null;
  };
}

const severityConfig: Record<string, { label: string; variant: 'destructive' | 'warning' | 'secondary' | 'outline' }> = {
  ALARM_CRITICAL: { label: 'Kritik', variant: 'destructive' },
  ALARM_HIGH: { label: 'Yüksek', variant: 'warning' },
  ALARM_MEDIUM: { label: 'Orta', variant: 'secondary' },
  ALARM_LOW: { label: 'Düşük', variant: 'outline' },
  ALARM_INFO: { label: 'Bilgi', variant: 'outline' },
};

const statusConfig = {
  OPEN: { label: 'Açık', className: 'text-rose-600 dark:text-rose-300' },
  ACKNOWLEDGED: { label: 'Onaylandı', className: 'text-amber-700 dark:text-amber-300' },
  RESOLVED: { label: 'Çözüldü', className: 'text-emerald-600 dark:text-emerald-300' },
  CLOSED: { label: 'Kapatıldı', className: 'text-muted-foreground' },
};

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return 'Şimdi';
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  return `${Math.floor(hours / 24)} gün önce`;
}

function sourceInfo(alarm: IncidentListItem['alarm']) {
  const code = alarm.code.toUpperCase();
  if (alarm.source === 'vmware' || code.startsWith('VM_') || code.startsWith('SNAPSHOT_')) return { label: 'VMware', icon: Monitor };
  if (alarm.source === 'nms' || code.startsWith('NMS_') || code.startsWith('SNMP_')) return { label: 'NMS', icon: Router };
  return { label: 'Firewall', icon: Shield };
}

export function IncidentOverview({ status, severity, archive }: {
  status: Record<string, number>;
  severity: Record<string, number>;
  archive: IncidentArchiveFilter;
}) {
  const active = (status.OPEN || 0) + (status.ACKNOWLEDGED || 0);
  const critical = severity.ALARM_CRITICAL || 0;
  const isArchive = archive === 'ARCHIVED';
  const title = isArchive
    ? 'Arşiv kayıtları korunuyor'
    : active === 0
      ? 'Operasyon kuyruğu temiz'
      : critical > 0
        ? 'Kritik incident’lar takip bekliyor'
        : 'Açık işler takip ediliyor';
  const description = isArchive
    ? 'Kapanmış incident geçmişi ve denetim izi sorgulanabilir durumda.'
    : active === 0
      ? 'Açık veya onay bekleyen incident bulunmuyor.'
      : `${active} aktif incident için operasyon takibi devam ediyor.`;

  return (
    <section aria-labelledby="incident-posture-title" className="border-y border-border py-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', active > 0 ? 'bg-rose-500/10 text-rose-600 dark:text-rose-300' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300')}>
            {active > 0 ? <AlertTriangle className="h-5 w-5" aria-hidden="true" /> : <CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
          </span>
          <div>
            <h2 id="incident-posture-title" className="text-lg font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-4">
          {[
            ['Açık', status.OPEN || 0],
            ['Onaylandı', status.ACKNOWLEDGED || 0],
            ['Çözüldü', status.RESOLVED || 0],
            ['Kapatıldı', status.CLOSED || 0],
          ].map(([label, value], index) => (
            <div key={String(label)} className={cn('min-w-24 px-4 py-2.5 text-center', index > 0 && 'border-l border-border', index === 2 && 'max-sm:border-l-0', index > 1 && 'max-sm:border-t')}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

export function IncidentFilters({
  status, severity, source, archive, search, onStatus, onSeverity, onSource, onArchive, onSearch,
}: {
  status: IncidentStatusFilter;
  severity: string;
  source: IncidentSourceFilter;
  archive: IncidentArchiveFilter;
  search: string;
  onStatus: (value: IncidentStatusFilter) => void;
  onSeverity: (value: string) => void;
  onSource: (value: IncidentSourceFilter) => void;
  onArchive: (value: IncidentArchiveFilter) => void;
  onSearch: (value: string) => void;
}) {
  const statuses: Array<{ value: IncidentStatusFilter; label: string }> = [
    { value: 'ACTIVE', label: 'Aktif' },
    { value: 'OPEN', label: 'Açık' },
    { value: 'ACKNOWLEDGED', label: 'Onaylandı' },
    { value: 'RESOLVED', label: 'Çözüldü' },
    { value: 'CLOSED', label: 'Kapatıldı' },
  ];
  const selectClass = 'h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <section aria-labelledby="incident-filters-title">
      <h2 id="incident-filters-title" className="sr-only">Incident filtreleri</h2>
      <div className="flex gap-1 overflow-x-auto border-b border-border pb-3" role="group" aria-label="Lifecycle durumu">
        {statuses.map((item) => (
          <Button key={item.value} type="button" size="sm" variant={status === item.value ? 'secondary' : 'ghost'} aria-pressed={status === item.value} onClick={() => onStatus(item.value)} className="shrink-0">
            {item.label}
          </Button>
        ))}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_180px_180px_170px]">
        <label className="relative block">
          <span className="sr-only">Incident ara</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Başlık, cihaz veya alarm kodu ara" className="h-10 pl-10" />
        </label>
        <label className="grid gap-1"><span className="sr-only">Önem seviyesi</span><select value={severity} onChange={(event) => onSeverity(event.target.value)} className={selectClass}><option value="all">Tüm seviyeler</option><option value="ALARM_CRITICAL">Kritik</option><option value="ALARM_HIGH">Yüksek</option><option value="ALARM_MEDIUM">Orta</option><option value="ALARM_LOW">Düşük</option><option value="ALARM_INFO">Bilgi</option></select></label>
        <label className="grid gap-1"><span className="sr-only">Kaynak sistemi</span><select value={source} onChange={(event) => onSource(event.target.value as IncidentSourceFilter)} className={selectClass}><option value="all">Tüm kaynaklar</option><option value="firewall">Firewall</option><option value="switch">NMS / Switch</option><option value="vmware">VMware</option></select></label>
        <label className="grid gap-1"><span className="sr-only">Saklama alanı</span><select value={archive} onChange={(event) => onArchive(event.target.value as IncidentArchiveFilter)} className={selectClass}><option value="HOT">Aktif kayıtlar</option><option value="ARCHIVED">Arşiv</option></select></label>
      </div>
    </section>
  );
}

export function IncidentList({
  events, total, loading, loadingMore, hasMore, error, acknowledgingIds, loadMoreRef, onOpen, onAcknowledge, onAcknowledgeVisible,
}: {
  events: IncidentListItem[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  acknowledgingIds: Set<string>;
  loadMoreRef: React.RefObject<HTMLDivElement>;
  onOpen: (event: IncidentListItem) => void;
  onAcknowledge: (event: IncidentListItem) => void;
  onAcknowledgeVisible: () => void;
}) {
  const openVisible = events.filter((event) => event.incident?.status === 'OPEN').length;
  return (
    <section aria-labelledby="incident-list-title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase text-muted-foreground">Incident kayıtları</p><h2 id="incident-list-title" className="mt-1 text-lg font-semibold">Operasyon listesi <span className="font-normal text-muted-foreground">({total})</span></h2></div>
        {openVisible > 0 && <Button variant="outline" size="sm" onClick={onAcknowledgeVisible}><CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />Görünenleri onayla</Button>}
      </div>
      {error && <div role="alert" className="mb-4 border-l-2 border-rose-500 bg-rose-500/5 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">{error}</div>}
      {loading ? (
        <div className="divide-y divide-border border-y border-border">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="grid min-h-24 gap-3 py-4 xl:grid-cols-[88px_minmax(0,1fr)_180px_120px_140px_80px]"><Skeleton className="h-6 w-16" /><div className="space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div><Skeleton className="h-4 w-32" /><Skeleton className="h-5 w-20" /><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-16" /></div>)}</div>
      ) : events.length === 0 ? (
        <div className="flex min-h-64 items-center justify-center border-y border-border text-center"><div><CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500" aria-hidden="true" /><p className="mt-3 text-sm font-medium">Bu filtrelerle eşleşen incident yok</p><p className="mt-1 text-sm text-muted-foreground">Filtreleri değiştirerek diğer kayıtları görüntüleyebilirsiniz.</p></div></div>
      ) : (
        <ol className="divide-y divide-border border-y border-border">
          {events.map((event) => {
            const severity = severityConfig[event.severity] || severityConfig.ALARM_INFO;
            const status = event.incident ? statusConfig[event.incident.status] : { label: 'Eski kayıt', className: 'text-muted-foreground' };
            const source = sourceInfo(event.alarm);
            const SourceIcon = source.icon;
            const incidentId = event.incident?.id;
            return (
              <li key={event.id} className={cn('grid gap-3 py-4 xl:grid-cols-[88px_minmax(0,1fr)_180px_120px_140px_80px] xl:items-center', event.incident?.status === 'CLOSED' && 'opacity-70')}>
                <Badge variant={severity.variant} className="w-fit text-xs">{severity.label}</Badge>
                <button type="button" onClick={() => onOpen(event)} className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <p className="truncate text-sm font-medium hover:text-primary">{event.title}</p>
                  <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground"><SourceIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{source.label} · {event.alarm.code}</p>
                </button>
                <div className="min-w-0"><p className="truncate text-sm">{event.deviceName || 'Varlık bilgisi yok'}</p><p className="mt-1 text-xs text-muted-foreground">{event.alarm.category}</p></div>
                <span className={cn('text-xs font-medium', status.className)}>{status.label}</span>
                <div className="flex items-center gap-3 text-xs text-muted-foreground xl:justify-end"><span className="inline-flex items-center gap-1"><Repeat2 className="h-3.5 w-3.5" aria-hidden="true" />{event.incident?.occurrenceCount || 1}</span><span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />{relativeTime(event.incident?.lastSeenAt || event.createdAt)}</span></div>
                <div className="flex items-center justify-end gap-1">
                  {event.incident?.status === 'OPEN' && <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`${event.title} incident’ını onayla`} title="Onayla" disabled={Boolean(incidentId && acknowledgingIds.has(incidentId))} onClick={() => onAcknowledge(event)}>{incidentId && acknowledgingIds.has(incidentId) ? <RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <CheckCircle2 className="h-4 w-4" />}</Button>}
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`${event.title} detayını aç`} title="Detayı aç" onClick={() => onOpen(event)}><Eye className="h-4 w-4" /></Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {events.length > 0 && <div ref={loadMoreRef} className="flex min-h-14 items-center justify-center border-b border-border text-sm text-muted-foreground">{loadingMore ? <span className="inline-flex items-center gap-2"><RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" />Yükleniyor</span> : hasMore ? `${events.length} / ${total} kayıt · daha fazlası otomatik yüklenir` : `${events.length} / ${total} kayıt gösteriliyor`}</div>}
    </section>
  );
}
