import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, CheckCircle2, CircleOff, Clock3, Database, HardDrive, Network, Server, ShieldBan, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DashboardSummary, LiveDashboardData } from './types';

function SectionHeader({ eyebrow, title, href }: { eyebrow: string; title: string; href: string }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase text-muted-foreground">{eyebrow}</p>
        <h2 className="mt-1 text-lg font-semibold">{title}</h2>
      </div>
      <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Detay <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden="true" />{text}</div>;
}

export function InfrastructureOperations({ data }: { data: DashboardSummary['operations']['infrastructure'] }) {
  const hasItems = data.problemHosts.length > 0 || data.criticalDatastores.length > 0 || data.oldSnapshots.length > 0;
  return (
    <section aria-labelledby="infrastructure-operations-title" className="border-t border-border pt-6">
      <div id="infrastructure-operations-title"><SectionHeader eyebrow="Altyapı" title="İncelenmesi gerekenler" href="/virtualization/hosts" /></div>
      {!hasItems ? <EmptyState text="Altyapıda dikkat gerektiren kayıt yok." /> : (
        <ul className="divide-y divide-border">
          {data.problemHosts.map((host) => (
            <li key={host.id} className="flex items-center gap-3 py-3">
              <Server className="h-4 w-4 shrink-0 text-rose-500" aria-hidden="true" />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{host.name}</p><p className="text-xs text-muted-foreground">Host erişilebilir değil · {host.status}</p></div>
              <span className="text-xs font-medium text-rose-600 dark:text-rose-300">Kontrol et</span>
            </li>
          ))}
          {data.criticalDatastores.map((datastore) => (
            <li key={datastore.id} className="flex items-center gap-3 py-3">
              <Database className={cn('h-4 w-4 shrink-0', datastore.usedPercent >= 90 ? 'text-rose-500' : 'text-amber-500')} aria-hidden="true" />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{datastore.name}</p><p className="text-xs text-muted-foreground">Datastore kapasitesi kritik eşiğe yaklaştı</p></div>
              <span className={cn('text-sm font-semibold tabular-nums', datastore.usedPercent >= 90 ? 'text-rose-600 dark:text-rose-300' : 'text-amber-700 dark:text-amber-300')}>%{datastore.usedPercent}</span>
            </li>
          ))}
          {data.oldSnapshots.map((snapshot) => (
            <li key={snapshot.id} className="flex items-center gap-3 py-3">
              <HardDrive className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{snapshot.vmName}</p><p className="truncate text-xs text-muted-foreground">{snapshot.name}</p></div>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />{snapshot.ageInDays} gün</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function NetworkSecurityOperations({ summary, live }: { summary: DashboardSummary; live: LiveDashboardData }) {
  const downTunnels = live.ipsec.items.filter((item) => item.status !== 'up');
  const hasItems = summary.operations.network.offlineDevices.length > 0 || downTunnels.length > 0 || (live.quarantine.count || 0) > 0;
  return (
    <section aria-labelledby="network-security-title" className="border-t border-border pt-6">
      <div id="network-security-title"><SectionHeader eyebrow="Ağ ve güvenlik" title="Canlı operasyon durumu" href="/network" /></div>
      {!hasItems && live.ipsec.state === 'ready' && live.quarantine.state === 'ready' ? <EmptyState text="Ağ ve güvenlik tarafında dikkat gerektiren kayıt yok." /> : (
        <ul className="divide-y divide-border">
          {summary.operations.network.offlineDevices.map((device) => (
            <li key={device.id} className="flex items-center gap-3 py-3">
              <CircleOff className="h-4 w-4 shrink-0 text-rose-500" aria-hidden="true" />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{device.name}</p><p className="text-xs text-muted-foreground">{device.managementIp || 'IP bilgisi yok'} · polling yanıtı alınamıyor</p></div>
              <Link href="/integrations/nms/devices" className="text-xs font-medium text-primary hover:underline">NMS</Link>
            </li>
          ))}
          {downTunnels.slice(0, 5).map((tunnel) => (
            <li key={tunnel.name} className="flex items-center gap-3 py-3">
              <Network className="h-4 w-4 shrink-0 text-rose-500" aria-hidden="true" />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{tunnel.name}</p><p className="truncate text-xs text-muted-foreground">IPSec tüneli kapalı {tunnel.rgwy ? `· ${tunnel.rgwy}` : ''}</p></div>
              <span className="text-xs font-medium text-rose-600 dark:text-rose-300">Kapalı</span>
            </li>
          ))}
          {(live.quarantine.count || 0) > 0 && (
            <li className="flex items-center gap-3 py-3">
              <ShieldBan className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
              <div className="min-w-0 flex-1"><p className="text-sm font-medium">Karantina listesi</p><p className="text-xs text-muted-foreground">Engellenen IP adreslerini gözden geçirin</p></div>
              <span className="text-sm font-semibold tabular-nums">{live.quarantine.count}</span>
            </li>
          )}
          {live.ipsec.state === 'unavailable' && <li className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><AlertTriangle className="h-4 w-4" aria-hidden="true" />IPSec canlı verisi alınamadı.</li>}
        </ul>
      )}
      <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
        <div className="flex items-center gap-2 text-sm"><Wifi className="h-4 w-4 text-cyan-500" aria-hidden="true" /><span>Aktif SSL-VPN oturumları</span></div>
        <span className="text-lg font-semibold tabular-nums">{live.sslVpn.state === 'ready' ? live.sslVpn.users.length : '—'}</span>
      </div>
    </section>
  );
}
