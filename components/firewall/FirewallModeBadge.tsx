import { AlertTriangle, CheckCircle2, CircleOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FirewallMonitoringMode } from './types';

const MODE = {
  FULL: {
    label: 'Tam izleme',
    icon: CheckCircle2,
    className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  LIMITED: {
    label: 'Kısıtlı izleme',
    icon: AlertTriangle,
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200',
  },
  UNAVAILABLE: {
    label: 'Veri alınamıyor',
    icon: CircleOff,
    className: 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300',
  },
} as const;

export function FirewallModeBadge({ mode, className }: { mode: FirewallMonitoringMode; className?: string }) {
  const config = MODE[mode];
  const Icon = config.icon;
  return (
    <span className={cn('inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold', config.className, className)}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {config.label}
    </span>
  );
}
