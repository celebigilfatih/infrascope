import Link from 'next/link';
import { AlertCircle, CheckCircle2, ChevronRight, Clock3, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { IntegrationHealth as IntegrationHealthItem, IntegrationState } from './types';

const stateConfig: Record<IntegrationState, { label: string; icon: typeof CheckCircle2; className: string }> = {
  healthy: { label: 'Sağlıklı', icon: CheckCircle2, className: 'text-emerald-600 dark:text-emerald-300' },
  stale: { label: 'Gecikmiş', icon: Clock3, className: 'text-amber-700 dark:text-amber-300' },
  error: { label: 'Hatalı', icon: AlertCircle, className: 'text-rose-600 dark:text-rose-300' },
  unconfigured: { label: 'Yapılandırılmamış', icon: Settings2, className: 'text-muted-foreground' },
};

function syncLabel(value: string | null) {
  if (!value) return 'Henüz veri yok';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return 'Az önce güncellendi';
  if (minutes < 60) return `${minutes} dk önce güncellendi`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} sa önce güncellendi`;
  return `${Math.floor(hours / 24)} gün önce güncellendi`;
}

export function IntegrationHealth({ items }: { items: IntegrationHealthItem[] }) {
  return (
    <section aria-labelledby="integration-health-title">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Veri güvenilirliği</p>
        <h2 id="integration-health-title" className="mt-1 text-lg font-semibold">Veri kaynakları</h2>
      </div>
      <ul className="divide-y divide-border border-y border-border">
        {items.map((item) => {
          const config = stateConfig[item.state];
          const Icon = config.icon;
          return (
            <li key={item.key}>
              <Link href={item.href} className="group flex items-center gap-3 py-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                <Icon className={cn('h-4 w-4 shrink-0', config.className)} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <p className="text-sm font-medium group-hover:text-primary">{item.name}</p>
                    <span className={cn('text-xs font-medium', config.className)}>{config.label}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{item.message || syncLabel(item.lastSyncAt)}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
