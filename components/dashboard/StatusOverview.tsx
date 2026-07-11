import { AlertTriangle, CheckCircle2, Clock3, Siren } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DashboardSummary } from './types';

const statusConfig = {
  healthy: {
    label: 'Tümü normal',
    description: 'Aktif kritik sorun veya gecikmiş veri kaynağı görünmüyor.',
    icon: CheckCircle2,
    className: 'text-emerald-700 dark:text-emerald-300',
    iconClassName: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  },
  attention: {
    label: 'Dikkat gerekiyor',
    description: 'Operasyon ekibinin incelemesi gereken açık sorunlar var.',
    icon: AlertTriangle,
    className: 'text-amber-800 dark:text-amber-200',
    iconClassName: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
  },
  critical: {
    label: 'Kritik müdahale gerekiyor',
    description: 'Hizmet sürekliliğini etkileyebilecek kritik incident kayıtları var.',
    icon: Siren,
    className: 'text-rose-700 dark:text-rose-300',
    iconClassName: 'bg-rose-500/10 text-rose-600 dark:text-rose-300',
  },
  stale: {
    label: 'Veriler güncel değil',
    description: 'Bazı veri kaynakları beklenen sürede güncellenmedi.',
    icon: Clock3,
    className: 'text-sky-800 dark:text-sky-200',
    iconClassName: 'bg-sky-500/10 text-sky-600 dark:text-sky-300',
  },
} as const;

export function StatusOverview({ summary }: { summary: DashboardSummary }) {
  const config = statusConfig[summary.posture.status];
  const Icon = config.icon;

  return (
    <section aria-labelledby="system-posture-title" className="border-y border-border/80 py-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', config.iconClassName)}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="system-posture-title" className={cn('text-lg font-semibold', config.className)}>{config.label}</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{config.description}</p>
          </div>
        </div>
        <dl className="flex shrink-0 divide-x divide-border rounded-lg border border-border bg-card">
          <div className="min-w-24 px-4 py-2.5 text-center">
            <dt className="text-xs text-muted-foreground">Kritik</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums">{summary.posture.critical}</dd>
          </div>
          <div className="min-w-24 px-4 py-2.5 text-center">
            <dt className="text-xs text-muted-foreground">Yüksek</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums">{summary.posture.high}</dd>
          </div>
          <div className="min-w-24 px-4 py-2.5 text-center">
            <dt className="text-xs text-muted-foreground">Gecikmiş</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums">{summary.posture.staleSources}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
