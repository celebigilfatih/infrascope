'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CircleAlert,
  Link2,
  Loader2,
  Plus,
  RefreshCcw,
  Search,
  ServerCog,
  Shield,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { FirewallModeBadge } from '@/components/firewall/FirewallModeBadge';
import { FirewallOnboardingDialog } from '@/components/firewall/FirewallOnboardingDialog';
import type { FirewallListItem } from '@/components/firewall/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

async function readJson(response: Response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  return data;
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Henüz yok';
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export default function FirewallInventoryPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<FirewallListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await fetch('/api/firewalls', { cache: 'no-store' }).then(readJson);
      setItems(result.data || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Firewall listesi yüklenemedi.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const value = search.trim().toLocaleLowerCase('tr-TR');
    if (!value) return items;
    return items.filter((item) => [item.device?.name, item.name, item.host, item.vdom, item.identity?.serialNumber]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('tr-TR')
      .includes(value));
  }, [items, search]);

  const summary = useMemo(() => ({
    total: items.filter((item) => item.id).length,
    full: items.filter((item) => item.monitoring?.mode === 'FULL').length,
    limited: items.filter((item) => item.monitoring?.mode === 'LIMITED').length,
    action: items.filter((item) => item.requiresInventoryLink || item.identity?.status === 'CONFLICT' || item.monitoring?.mode === 'UNAVAILABLE').length,
  }), [items]);

  function created(connectorId: string) {
    toast({ title: 'Firewall eklendi', description: 'Kaynak kontrolleri tamamlandı. İzleme durumunu detay sayfasında görebilirsiniz.' });
    window.location.assign(`/integrations/firewall/${connectorId}`);
  }

  return (
    <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1600px] space-y-7">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-primary">Güvenlik altyapısı</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal sm:text-3xl">Firewall Yönetimi</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">FortiGate cihazlarını, veri kaynaklarını ve salt okunur güvenlik görünümünü tek yerden izleyin.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => load(true)} disabled={refreshing} aria-label="Firewall listesini yenile">
              <RefreshCcw className={cn('mr-2 h-4 w-4 motion-reduce:animate-none', refreshing && 'animate-spin')} aria-hidden="true" />
              Yenile
            </Button>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              FortiGate ekle
            </Button>
          </div>
        </header>

        <section className="grid divide-y rounded-md border bg-card sm:grid-cols-4 sm:divide-x sm:divide-y-0" aria-label="Firewall özeti">
          <SummaryMetric label="Kayıtlı firewall" value={summary.total} />
          <SummaryMetric label="Tam izleme" value={summary.full} tone="positive" />
          <SummaryMetric label="Kısıtlı izleme" value={summary.limited} tone="warning" />
          <SummaryMetric label="İşlem gerekiyor" value={summary.action} tone={summary.action ? 'critical' : 'normal'} />
        </section>

        <section aria-labelledby="firewall-list-title">
          <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 id="firewall-list-title" className="text-lg font-semibold">FortiGate envanteri</h2>
              <p className="mt-1 text-xs text-muted-foreground">TLS sorunu bulunan cihazlar kayıtlı kalır ve güvenli fallback kaynaklarıyla izlenir.</p>
            </div>
            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Cihaz, IP, seri veya VDOM ara" aria-label="Firewall ara" />
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" /> Firewall envanteri yükleniyor</div>
          ) : error ? (
            <div className="my-8 border-l-2 border-red-500 bg-red-500/5 p-5">
              <p className="font-semibold">Firewall verileri yüklenemedi</p>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
              <Button className="mt-4" variant="outline" size="sm" onClick={() => load()}>Tekrar dene</Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-md bg-muted"><Shield className="h-6 w-6 text-muted-foreground" aria-hidden="true" /></span>
              <h3 className="mt-4 text-base font-semibold">{items.length ? 'Eşleşen firewall bulunamadı' : 'Henüz FortiGate eklenmedi'}</h3>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">{items.length ? 'Arama ifadenizi değiştirin.' : 'Cihaz ilk REST kontrolü başarısız olsa bile kaydedilir; SNMP ve SSH fallback daha sonra devreye girer.'}</p>
              {!items.length && <Button className="mt-5" onClick={() => setDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />FortiGate ekle</Button>}
            </div>
          ) : (
            <div className="divide-y" role="list">
              {filtered.map((item) => item.id ? (
                <FirewallRow key={item.id} item={item as FirewallListItem & { id: string }} onRemoved={() => load(true)} />
              ) : (
                <LegacyRow key={item.configId} item={item} onLinked={() => load(true)} onRemoved={() => load(true)} />
              ))}
            </div>
          )}
        </section>
      </div>

      <FirewallOnboardingDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={created} />
    </main>
  );
}

function SummaryMetric({ label, value, tone = 'normal' }: { label: string; value: number; tone?: 'normal' | 'positive' | 'warning' | 'critical' }) {
  return (
    <div className="px-5 py-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-2xl font-semibold', tone === 'positive' && 'text-emerald-600', tone === 'warning' && 'text-amber-600', tone === 'critical' && 'text-red-600')}>{value}</p>
    </div>
  );
}

function FirewallRow({ item, onRemoved }: { item: FirewallListItem & { id: string }; onRemoved: () => void }) {
  const mode = item.monitoring?.mode || 'UNAVAILABLE';
  const sourceCount = item.monitoring?.sources.filter((source) => source.status === 'available').length || 0;
  const needsReview = item.identity?.status === 'CONFLICT';
  return (
    <div className="grid gap-4 py-5 lg:grid-cols-[minmax(260px,1.3fr)_minmax(220px,.8fr)_minmax(240px,1fr)_auto] lg:items-center" role="listitem">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><ShieldCheck className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{item.device?.name || item.name}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{item.host} · VDOM {item.vdom}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{item.device?.model || 'FortiGate'}{item.identity?.serialNumber ? ` · ${item.identity.serialNumber}` : ''}</p>
        </div>
      </div>
      <div>
        <FirewallModeBadge mode={mode} />
        <p className="mt-2 text-xs text-muted-foreground">{sourceCount} aktif veri kaynağı</p>
      </div>
      <div className="text-xs">
        {needsReview ? (
          <p className="inline-flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-300"><CircleAlert className="h-4 w-4" />Kimlik incelemesi gerekiyor</p>
        ) : (
          <p className="font-medium">Son başarılı veri: {formatDate(item.monitoring?.lastSuccessAt || item.lastSyncAt)}</p>
        )}
        <p className="mt-1 text-muted-foreground">Son kontrol: {formatDate(item.monitoring?.lastProbeAt)}</p>
      </div>
      <div className="flex items-center gap-2 justify-self-start lg:justify-self-end">
        <Button asChild variant="outline" size="sm">
          <Link href={`/integrations/firewall/${item.id}`}>İncele <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Link>
        </Button>
        <FirewallRemovalButton
          endpoint={`/api/firewalls/${item.id}`}
          label={`${item.device?.name || item.name} bağlantısını kaldır`}
          description="Bu işlem yalnızca InfraScope'taki FortiGate bağlantı ayarlarını kaldırır. Firewall üzerinde hiçbir değişiklik yapılmaz; cihaz envanterde kalır."
          onRemoved={onRemoved}
        />
      </div>
    </div>
  );
}

function LegacyRow({ item, onLinked, onRemoved }: { item: FirewallListItem; onLinked: () => void; onRemoved: () => void }) {
  const { toast } = useToast();
  const [devices, setDevices] = useState<Array<{ id: string; name: string }>>([]);
  const [deviceId, setDeviceId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/devices?filterType=all&mode=full&limit=100', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => setDevices((data.devices || data.data || []).filter((device: { type?: string }) => device.type === 'FIREWALL')))
      .catch(() => setDevices([]));
  }, []);

  async function link() {
    if (!deviceId) return;
    setBusy(true);
    try {
      const response = await fetch('/api/firewalls/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configId: item.configId, deviceId }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Envanter bağlantısı kurulamadı.');
      toast({ title: 'Bağlantı tamamlandı', description: 'Eski FortiGate kaydı firewall envanterine bağlandı.' });
      onLinked();
    } catch (linkError) {
      toast({ title: 'Bağlantı kurulamadı', description: linkError instanceof Error ? linkError.message : 'İşlem başarısız.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 bg-amber-500/[0.04] py-5 lg:grid-cols-[minmax(240px,1fr)_minmax(320px,1.5fr)_auto] lg:items-center" role="listitem">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300"><ServerCog className="h-5 w-5" /></span>
        <div><p className="text-sm font-semibold">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{item.host} · eski entegrasyon kaydı</p></div>
      </div>
      <div>
        <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">Envanter bağlantısı gerekiyor</p>
        <select value={deviceId} onChange={(event) => setDeviceId(event.target.value)} className="mt-2 h-9 w-full rounded-md border bg-background px-3 text-sm" aria-label={`${item.name} için firewall cihazı seçin`}>
          <option value="">Firewall envanter cihazı seçin</option>
          {devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-2 justify-self-start lg:justify-self-end">
        <Button variant="outline" size="sm" onClick={link} disabled={!deviceId || busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
          Envantere bağla
        </Button>
        <FirewallRemovalButton
          endpoint={`/api/firewalls?configId=${encodeURIComponent(item.configId)}`}
          label={`${item.name} eski entegrasyonunu kaldır`}
          description="Bu işlem yalnızca eski InfraScope FortiGate entegrasyon ayarını kaldırır. Firewall üzerinde hiçbir değişiklik yapılmaz."
          onRemoved={onRemoved}
        />
      </div>
    </div>
  );
}

function FirewallRemovalButton({
  endpoint,
  label,
  description,
  onRemoved,
}: {
  endpoint: string;
  label: string;
  description: string;
  onRemoved: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function remove() {
    if (removing) return;
    setRemoving(true);
    try {
      const response = await fetch(endpoint, { method: 'DELETE' });
      await readJson(response);
      setOpen(false);
      toast({ title: 'Bağlantı kaldırıldı', description: 'Firewall cihazında hiçbir değişiklik yapılmadı.' });
      onRemoved();
    } catch (removeError) {
      toast({
        title: 'Bağlantı kaldırılamadı',
        description: removeError instanceof Error ? removeError.message : 'İşlem başarısız.',
        variant: 'destructive',
      });
    } finally {
      setRemoving(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Firewall bağlantısını kaldır?"
        description={description}
        confirmText={removing ? 'Kaldırılıyor...' : 'Bağlantıyı kaldır'}
        cancelText="Vazgeç"
        variant="destructive"
        onConfirm={() => void remove()}
      />
    </>
  );
}
