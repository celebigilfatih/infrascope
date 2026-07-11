import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DataState } from './types';

export interface DashboardMetric {
  label: string;
  value: string;
  detail: string;
  href: string;
  icon: LucideIcon;
  tone?: 'normal' | 'warning' | 'critical' | 'positive';
  state?: DataState;
}

const toneClass = {
  normal: 'text-foreground',
  positive: 'text-emerald-600 dark:text-emerald-300',
  warning: 'text-amber-700 dark:text-amber-300',
  critical: 'text-rose-600 dark:text-rose-300',
};

export function MetricStrip({ metrics }: { metrics: DashboardMetric[] }) {
  return (
    <section aria-labelledby="key-metrics-title">
      <h2 id="key-metrics-title" className="sr-only">Temel operasyon metrikleri</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          const unavailable = metric.state === 'unavailable' || metric.state === 'unconfigured';
          return (
            <Link
              key={metric.label}
              href={metric.href}
              className="group min-h-32 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:text-primary">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
              </div>
              <p className={cn('mt-4 text-2xl font-semibold tabular-nums', toneClass[metric.tone || 'normal'], unavailable && 'text-muted-foreground')}>
                {metric.state === 'loading' ? '…' : metric.value}
              </p>
              <p className="mt-1 text-sm font-medium">{metric.label}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{metric.detail}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
