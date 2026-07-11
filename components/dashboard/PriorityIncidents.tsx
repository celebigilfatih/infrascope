import Link from 'next/link';
import { ArrowUpRight, CheckCircle2, Clock3, Repeat2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { PriorityIncident } from './types';

const severityLabel: Record<string, string> = {
  ALARM_CRITICAL: 'Kritik',
  ALARM_HIGH: 'Yüksek',
};

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return 'Şimdi';
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  return `${Math.floor(hours / 24)} gün önce`;
}

export function PriorityIncidents({ items, total }: { items: PriorityIncident[]; total: number }) {
  return (
    <section aria-labelledby="priority-incidents-title" className="min-w-0">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Operasyon kuyruğu</p>
          <h2 id="priority-incidents-title" className="mt-1 text-lg font-semibold">Öncelikli işler</h2>
        </div>
        <Link href="/dashboard/alerts?status=OPEN%2CACKNOWLEDGED" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Tümünü gör <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="flex min-h-56 items-center justify-center border-y border-border py-10 text-center">
          <div>
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium">Öncelikli açık incident yok</p>
            <p className="mt-1 text-sm text-muted-foreground">Yeni bir sorun oluştuğunda burada görünecek.</p>
          </div>
        </div>
      ) : (
        <ol className="divide-y divide-border border-y border-border">
          {items.map((incident) => (
            <li key={incident.id}>
              <Link
                href={`/dashboard/alerts?status=OPEN%2CACKNOWLEDGED&search=${encodeURIComponent(incident.code)}`}
                className="group grid gap-3 px-1 py-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
              >
                <Badge variant={incident.severity === 'ALARM_CRITICAL' ? 'destructive' : 'warning'} className="w-fit text-xs">
                  {severityLabel[incident.severity] || incident.severity}
                </Badge>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium group-hover:text-primary">{incident.title}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {incident.entityId || incident.source} · {incident.code}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground sm:justify-end">
                  <span className="inline-flex items-center gap-1"><Repeat2 className="h-3.5 w-3.5" aria-hidden="true" />{incident.occurrenceCount}</span>
                  <span className="inline-flex min-w-24 items-center justify-end gap-1"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />{relativeTime(incident.lastSeenAt)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}
      {total > items.length && <p className="mt-3 text-xs text-muted-foreground">Toplam {total} açık incident bulunuyor.</p>}
    </section>
  );
}
