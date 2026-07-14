import { AlertCircle, CheckCircle2, Clock3, MinusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FirewallCapability, FirewallSourceStatus } from './types';

const SOURCES = [
  { source: 'fortigate-rest', label: 'FortiGate REST', description: 'Canlı durum, policy, VPN ve HA' },
  { source: 'snmp', label: 'SNMP', description: 'Sağlık ve interface metrikleri' },
  { source: 'ssh', label: 'SSH', description: 'Fallback durum ve config yedeği' },
  { source: 'fortianalyzer', label: 'FortiAnalyzer', description: 'Güvenlik ve kimlik olayları' },
] as const;

const STATUS: Record<FirewallSourceStatus, { label: string; icon: typeof CheckCircle2; className: string }> = {
  available: { label: 'Kullanılabilir', icon: CheckCircle2, className: 'text-emerald-700 dark:text-emerald-300' },
  stale: { label: 'Gecikmiş', icon: Clock3, className: 'text-amber-700 dark:text-amber-300' },
  unavailable: { label: 'Erişilemiyor', icon: AlertCircle, className: 'text-red-700 dark:text-red-300' },
  unconfigured: { label: 'Yapılandırılmamış', icon: MinusCircle, className: 'text-muted-foreground' },
};

function formatDate(value: string | null | undefined) {
  if (!value) return 'Başarılı veri yok';
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export function FirewallSourceMatrix({ capabilities }: { capabilities: FirewallCapability[] }) {
  return (
    <div className="divide-y rounded-md border" role="list" aria-label="Firewall veri kaynakları">
      {SOURCES.map((item) => {
        const capability = capabilities.find((entry) => entry.source === item.source);
        const status = capability?.status || 'unconfigured';
        const config = STATUS[status];
        const Icon = config.icon;
        return (
          <div key={item.source} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" role="listitem">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{item.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{capability?.reason || item.description}</p>
            </div>
            <div className="sm:text-right">
              <p className={cn('inline-flex items-center gap-1.5 text-xs font-semibold', config.className)}>
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {config.label}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{formatDate(capability?.lastSuccessAt)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
