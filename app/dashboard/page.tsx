'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Database, Monitor, Network, RefreshCcw, Server, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { StatusOverview } from '@/components/dashboard/StatusOverview';
import { PriorityIncidents } from '@/components/dashboard/PriorityIncidents';
import { IntegrationHealth } from '@/components/dashboard/IntegrationHealth';
import { MetricStrip, type DashboardMetric } from '@/components/dashboard/MetricStrip';
import { InfrastructureOperations, NetworkSecurityOperations } from '@/components/dashboard/OperationsSections';
import type { DashboardSummary, DataState, IpsecTunnel, LiveDashboardData, SslVpnUser } from '@/components/dashboard/types';
import DashboardLoading from './loading';

const EMPTY_LIVE_DATA: LiveDashboardData = {
  ipsec: { state: 'loading', items: [] },
  sslVpn: { state: 'loading', users: [] },
  quarantine: { state: 'loading', count: null },
};

async function readJson(response: Response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  return data;
}

function liveStateFromError(error: unknown): DataState {
  return error instanceof Error && /not configured|yapılandırılmadı/i.test(error.message)
    ? 'unconfigured'
    : 'unavailable';
}

function lastUpdatedLabel(value: string | null) {
  if (!value) return 'Henüz güncellenmedi';
  const date = new Date(value);
  return new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date);
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [live, setLive] = useState<LiveDashboardData>(EMPTY_LIVE_DATA);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const requestSequenceRef = useRef(0);

  const loadDashboard = useCallback(async (manual = false) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    if (manual) setRefreshing(true);
    setError(null);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestSequenceRef.current;

    const summaryPromise = fetch('/api/dashboard/summary', { cache: 'no-store', signal: controller.signal })
      .then(readJson)
      .then((data: DashboardSummary) => setSummary(data));

    const livePromise = Promise.allSettled([
      fetch('/api/integrations/fortigate?vpn=ipsec', { cache: 'no-store', signal: controller.signal }).then(readJson),
      fetch('/api/integrations/fortigate?vpn=ssl', { cache: 'no-store', signal: controller.signal }).then(readJson),
      fetch('/api/security/quarantine', { cache: 'no-store', signal: controller.signal }).then(readJson),
    ]).then(([ipsecResult, sslResult, quarantineResult]) => {
      setLive({
        ipsec: ipsecResult.status === 'fulfilled'
          ? { state: 'ready', items: (ipsecResult.value?.data || []) as IpsecTunnel[] }
          : { state: liveStateFromError(ipsecResult.reason), items: [] },
        sslVpn: sslResult.status === 'fulfilled'
          ? { state: 'ready', users: (sslResult.value?.data || []) as SslVpnUser[] }
          : { state: liveStateFromError(sslResult.reason), users: [] },
        quarantine: quarantineResult.status === 'fulfilled'
          ? { state: 'ready', count: Number(quarantineResult.value?.count || 0) }
          : { state: liveStateFromError(quarantineResult.reason), count: null },
      });
    });

    try {
      await Promise.all([summaryPromise, livePromise]);
      if (manual) setAnnouncement('Dashboard verileri güncellendi.');
    } catch (loadError) {
      if (!(loadError instanceof DOMException && loadError.name === 'AbortError')) {
        setError(loadError instanceof Error ? loadError.message : 'Dashboard verileri alınamadı.');
        if (manual) setAnnouncement('Dashboard verileri güncellenemedi.');
      }
    } finally {
      if (requestSequenceRef.current === requestId) {
        setInitialLoading(false);
        setRefreshing(false);
        inFlightRef.current = false;
      }
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadDashboard();
    }, 60_000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadDashboard();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      requestSequenceRef.current += 1;
      inFlightRef.current = false;
      abortRef.current?.abort();
    };
  }, [loadDashboard]);

  const fortigateState = summary?.integrations.find((item) => item.key === 'FORTIGATE')?.state;
  const downTunnels = live.ipsec.items.filter((tunnel) => tunnel.status !== 'up').length;
  const upTunnels = live.ipsec.items.length - downTunnels;

  const metrics = useMemo<DashboardMetric[]>(() => {
    if (!summary) return [];
    const storage = summary.metrics.storage;
    const ipsecState: DataState = fortigateState === 'unconfigured' ? 'unconfigured' : live.ipsec.state;
    const sslState: DataState = fortigateState === 'unconfigured' ? 'unconfigured' : live.sslVpn.state;
    return [
      {
        label: 'Cihaz erişilebilirliği',
        value: `${summary.metrics.devices.healthy}/${summary.metrics.devices.total}`,
        detail: summary.metrics.devices.unavailable > 0 ? `${summary.metrics.devices.unavailable} cihaz erişilemiyor` : 'Tüm envanter erişilebilir',
        href: '/devices',
        icon: Monitor,
        tone: summary.metrics.devices.unavailable > 0 ? 'critical' : 'positive',
      },
      {
        label: 'ESXi hostları',
        value: `${summary.metrics.hosts.healthy}/${summary.metrics.hosts.total}`,
        detail: summary.metrics.hosts.unavailable > 0 ? `${summary.metrics.hosts.unavailable} host çevrimdışı` : 'Host durumu normal',
        href: '/virtualization/hosts',
        icon: Server,
        tone: summary.metrics.hosts.unavailable > 0 ? 'critical' : 'positive',
      },
      {
        label: 'Çalışan VM',
        value: `${summary.metrics.virtualMachines.healthy}/${summary.metrics.virtualMachines.total}`,
        detail: summary.metrics.virtualMachines.unavailable > 0 ? `${summary.metrics.virtualMachines.unavailable} VM çalışmıyor` : 'VM durumu normal',
        href: '/virtualization/vms',
        icon: Server,
        tone: summary.metrics.virtualMachines.unavailable > 0 ? 'warning' : 'positive',
      },
      {
        label: 'Depolama kullanımı',
        value: storage.usedPercent === null ? '—' : `%${storage.usedPercent}`,
        detail: storage.capacityTB > 0 ? `${storage.usedTB.toFixed(1)} / ${storage.capacityTB.toFixed(1)} TB` : 'Kapasite verisi yok',
        href: '/virtualization/datastores',
        icon: Database,
        tone: (storage.usedPercent || 0) >= 90 ? 'critical' : (storage.usedPercent || 0) >= 80 ? 'warning' : 'normal',
        state: storage.usedPercent === null ? 'unavailable' : 'ready',
      },
      {
        label: 'IPSec tünelleri',
        value: ipsecState === 'ready' ? `${upTunnels}/${live.ipsec.items.length}` : '—',
        detail: ipsecState === 'unconfigured' ? 'FortiGate yapılandırılmamış' : ipsecState === 'unavailable' ? 'Canlı veri alınamadı' : downTunnels > 0 ? `${downTunnels} tünel kapalı` : 'Tüm tüneller aktif',
        href: '/network/ipsec',
        icon: Network,
        tone: downTunnels > 0 ? 'critical' : 'positive',
        state: ipsecState,
      },
      {
        label: 'SSL-VPN oturumları',
        value: sslState === 'ready' ? String(live.sslVpn.users.length) : '—',
        detail: sslState === 'unconfigured' ? 'FortiGate yapılandırılmamış' : sslState === 'unavailable' ? 'Canlı veri alınamadı' : 'Aktif kullanıcı',
        href: '/network/ssl-vpn',
        icon: Wifi,
        tone: 'normal',
        state: sslState,
      },
    ];
  }, [summary, fortigateState, live, downTunnels, upTunnels]);

  if (initialLoading && !summary) return <DashboardLoading />;

  if (!summary) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">Dashboard yüklenemedi</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error || 'Özet veriler şu anda kullanılamıyor.'}</p>
          <Button className="mt-5" onClick={() => loadDashboard(true)}>Tekrar dene</Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1600px] space-y-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-primary">InfraScope operasyon merkezi</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal sm:text-3xl">Genel Sağlık</h1>
            <p className="mt-2 text-sm text-muted-foreground">Altyapı, ağ ve güvenlik hizmetlerinin güncel operasyon görünümü.</p>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted-foreground">Son güncelleme: <time dateTime={summary.generatedAt}>{lastUpdatedLabel(summary.generatedAt)}</time></p>
            <Button variant="outline" size="sm" onClick={() => loadDashboard(true)} disabled={refreshing} className="min-w-24">
              <RefreshCcw className={cn('mr-2 h-4 w-4 motion-reduce:animate-none', refreshing && 'animate-spin')} aria-hidden="true" />
              {refreshing ? 'Yenileniyor' : 'Yenile'}
            </Button>
          </div>
        </header>

        <p className="sr-only" aria-live="polite">{announcement}</p>
        {error && (
          <div role="status" className="border-l-2 border-amber-500 bg-amber-500/5 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            Yeni veriler alınamadı. Son başarılı dashboard görünümü gösteriliyor.
          </div>
        )}

        <StatusOverview summary={summary} />

        <div className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-8"><PriorityIncidents items={summary.incidents.items} total={summary.incidents.total} /></div>
          <div className="lg:col-span-4"><IntegrationHealth items={summary.integrations} /></div>
        </div>

        <MetricStrip metrics={metrics} />

        <div className="grid gap-8 lg:grid-cols-2">
          <InfrastructureOperations data={summary.operations.infrastructure} />
          <NetworkSecurityOperations summary={summary} live={live} />
        </div>
      </div>
    </main>
  );
}
