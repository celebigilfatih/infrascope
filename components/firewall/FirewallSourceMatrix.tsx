import { Activity, Database, KeyRound, Network, Radio, Shield } from 'lucide-react';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { userDate } from '@/lib/users/workspace';
import { firewallErrorMessage } from '@/lib/firewall/workspace';
import type { FirewallCapability } from './types';

const SOURCES = [
  { source: 'fortigate-rest', label: 'FortiGate REST', description: 'Sistem durumu, politikalar, VPN ve yedeklilik bilgileri.', icon: Shield },
  { source: 'snmp', label: 'SNMP', description: 'İşlemci, bellek ve arabirim ölçümleri.', icon: Network },
  { source: 'ssh', label: 'SSH', description: 'Alternatif sistem bilgileri ve yapılandırma yedeği.', icon: KeyRound },
  { source: 'fortianalyzer', label: 'FortiAnalyzer', description: 'Eşleştirilmiş cihazın güvenlik ve kimlik olayları.', icon: Activity },
  { source: 'event-cache', label: 'Olay önbelleği', description: 'Daha önce alınmış olay kayıtları.', icon: Radio },
  { source: 'database', label: 'Kayıtlı envanter', description: 'Veritabanında saklanan önceki envanter verileri.', icon: Database },
] as const;

export function FirewallSourceMatrix({ capabilities }: { capabilities: FirewallCapability[] }) {
  return (
    <div className="grid min-w-0 gap-3 md:grid-cols-2" role="list" aria-label="Güvenlik duvarı veri kaynakları">
      {SOURCES.map((item) => {
        const capability = capabilities.find((entry) => entry.source === item.source);
        const status = capability?.status, Icon = item.icon;
        return (
          <div key={item.source} className="min-w-0 rounded-lg border p-4" role="listitem"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-2 text-xs font-semibold"><Icon size={16} className="text-primary" aria-hidden="true" />{item.label}</p><SemanticBadge tone={status === 'available' ? 'success' : status === 'stale' ? 'warning' : status === 'unavailable' ? 'danger' : 'neutral'}>{status === 'available' ? 'Veri alınmış' : status === 'stale' ? 'Önceki veri' : status === 'unavailable' ? 'Veri alınamıyor' : status === 'unconfigured' ? 'Yapılandırılmamış' : 'Kaynak bilgisi yok'}</SemanticBadge></div><p className="text-[11px] leading-7 text-muted-foreground">{item.description}</p>{status === 'unavailable' && <p className="mt-2 text-[11px] leading-7 text-muted-foreground">{firewallErrorMessage(capability?.errorCode)}</p>}<dl className="mt-3 space-y-2 text-[10px] leading-6 text-muted-foreground"><div className="flex flex-wrap justify-between gap-2"><dt>Son kaynak kontrolü · TSİ</dt><dd>{userDate(capability?.checkedAt)}</dd></div><div className="flex flex-wrap justify-between gap-2"><dt>Son başarılı veri · TSİ</dt><dd>{userDate(capability?.lastSuccessAt)}</dd></div></dl></div>
        );
      })}
    </div>
  );
}
