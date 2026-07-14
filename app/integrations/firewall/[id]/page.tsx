'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleOff,
  Clock3,
  KeyRound,
  Loader2,
  Network,
  RefreshCcw,
  Shield,
  ShieldAlert,
} from 'lucide-react';
import { usePageBreadcrumb } from '@/components/layout/BreadcrumbProvider';
import { FirewallModeBadge } from '@/components/firewall/FirewallModeBadge';
import { FirewallSourceMatrix } from '@/components/firewall/FirewallSourceMatrix';
import { FirewallTrustedCaCard } from '@/components/firewall/FirewallTrustedCaCard';
import type { FirewallDetail, FirewallEnvelope } from '@/components/firewall/types';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

type ResourceKey = 'status' | 'interfaces' | 'policies' | 'addresses' | 'vips' | 'ssl-vpn' | 'ipsec' | 'ha' | 'events';

const RESOURCE: Record<ResourceKey, { label: string; endpoint: (id: string) => string; empty: string }> = {
  status: { label: 'Sistem durumu', endpoint: (id) => `/api/firewalls/${id}/status`, empty: 'Sistem durum verisi yok.' },
  interfaces: { label: 'Arabirimler', endpoint: (id) => `/api/firewalls/${id}/interfaces?limit=100`, empty: 'Arabirim bulunamadı.' },
  policies: { label: 'Firewall politikaları', endpoint: (id) => `/api/firewalls/${id}/policies?limit=100`, empty: 'Politika bulunamadı.' },
  addresses: { label: 'Adres nesneleri', endpoint: (id) => `/api/firewalls/${id}/addresses?limit=100`, empty: 'Adres nesnesi bulunamadı.' },
  vips: { label: 'VIP / NAT', endpoint: (id) => `/api/firewalls/${id}/vips?limit=100`, empty: 'VIP kaydı bulunamadı.' },
  'ssl-vpn': { label: 'SSL-VPN oturumları', endpoint: (id) => `/api/firewalls/${id}/vpn/ssl-sessions?limit=100`, empty: 'Aktif SSL-VPN oturumu yok.' },
  ipsec: { label: 'IPsec tünelleri', endpoint: (id) => `/api/firewalls/${id}/vpn/ipsec?limit=100`, empty: 'IPsec tüneli bulunamadı.' },
  ha: { label: 'HA durumu', endpoint: (id) => `/api/firewalls/${id}/ha`, empty: 'HA verisi bulunamadı.' },
  events: { label: 'Kimlik olayları', endpoint: (id) => `/api/firewalls/${id}/events?category=auth&limit=100`, empty: 'Kimlik olayı bulunamadı.' },
};

async function readJson(response: Response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  return data;
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Henüz yok';
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export default function FirewallDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { toast } = useToast();
  const [detail, setDetail] = useState<FirewallDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [vpnTab, setVpnTab] = useState<'ssl-vpn' | 'ipsec'>('ssl-vpn');
  const [sshInspection, setSshInspection] = useState<null | { observed: { algorithm: string; fingerprint: string; observed_at: string }; trusted: null | { fingerprint: string; matches: boolean } }>(null);
  const fallbackRefreshRef = useRef<string | null>(null);

  const breadcrumbs = useMemo(() => detail ? [
    { label: 'Firewall Yönetimi', href: '/integrations/firewall' },
    { label: detail.device.name },
  ] : null, [detail]);
  usePageBreadcrumb(breadcrumbs);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const result = await fetch(`/api/firewalls/${id}`, { cache: 'no-store' }).then(readJson);
      setDetail(result.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Firewall detayı yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!detail?.device.nmsDeviceId || fallbackRefreshRef.current === detail.id) return;
    fallbackRefreshRef.current = detail.id;
    void fetch(`/api/firewalls/${id}/snmp/health`, { cache: 'no-store' })
      .then(() => load(true))
      .catch(() => undefined);
  }, [detail?.device.nmsDeviceId, detail?.id, id, load]);

  async function runAction(key: string, action: () => Promise<void>, success: string) {
    setBusy(key);
    try {
      await action();
      toast({ title: success });
      await load(true);
    } catch (actionError) {
      toast({ title: 'İşlem tamamlanamadı', description: actionError instanceof Error ? actionError.message : 'Bilinmeyen hata.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  async function probe() {
    await runAction('probe', async () => {
      await fetch(`/api/firewalls/${id}/probe`, { method: 'POST' }).then(readJson);
    }, 'Bağlantı kontrolü tamamlandı');
  }

  async function correlateAnalyzer() {
    await runAction('analyzer', async () => {
      await fetch(`/api/firewalls/${id}/analyzer-correlation`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(readJson);
    }, 'FortiAnalyzer eşleştirmesi tamamlandı');
  }

  async function reviewIdentity(action: 'keep-current' | 'accept-candidate' | 'merge-into-existing') {
    await runAction(`identity:${action}`, async () => {
      const result = await fetch(`/api/firewalls/${id}/identity`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      }).then(readJson);
      if (action === 'merge-into-existing' && result.data?.connectorId) {
        window.location.assign(`/integrations/firewall/${result.data.connectorId}`);
      }
    }, 'Firewall kimliği güncellendi');
  }

  async function inspectSsh() {
    setBusy('ssh-inspect');
    try {
      const result = await fetch(`/api/firewalls/${id}/ssh/host-key`, { cache: 'no-store' }).then(readJson);
      setSshInspection(result.data);
    } catch (inspectError) {
      toast({ title: 'SSH anahtarı okunamadı', description: inspectError instanceof Error ? inspectError.message : 'Bilinmeyen hata.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  async function trustSsh() {
    if (!sshInspection) return;
    await runAction('ssh-trust', async () => {
      await fetch(`/api/firewalls/${id}/ssh/host-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint: sshInspection.observed.fingerprint }),
      }).then(readJson);
      setSshInspection((current) => current ? { ...current, trusted: { fingerprint: current.observed.fingerprint, matches: true } } : null);
    }, 'SSH host key güvenilir olarak kaydedildi');
  }

  if (loading && !detail) {
    return <main className="flex min-h-[60vh] items-center justify-center"><Loader2 className="mr-2 h-5 w-5 animate-spin motion-reduce:animate-none" /> Firewall detayı yükleniyor</main>;
  }
  if (!detail) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center p-6 text-center">
        <div><CircleOff className="mx-auto h-8 w-8 text-muted-foreground" /><h1 className="mt-4 text-xl font-semibold">Firewall açılamadı</h1><p className="mt-2 text-sm text-muted-foreground">{error}</p><Button asChild className="mt-5" variant="outline"><Link href="/integrations/firewall">Listeye dön</Link></Button></div>
      </main>
    );
  }

  const capabilities = detail.capabilities || [];
  const remediation = remediationFor(detail.lastErrorCode);

  return (
    <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1600px] space-y-7">
        <header className="flex flex-col gap-5 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <Link href="/integrations/firewall" className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />Firewall Yönetimi</Link>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h1 className="truncate text-2xl font-semibold tracking-normal sm:text-3xl">{detail.device.name}</h1>
              <FirewallModeBadge mode={detail.monitoringMode} />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{detail.managementHost} · VDOM {detail.vdom} · {detail.device.model || 'FortiGate'}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => load(true)} disabled={Boolean(busy)}><RefreshCcw className="mr-2 h-4 w-4" />Yenile</Button>
            <Button size="sm" onClick={probe} disabled={Boolean(busy)}>{busy === 'probe' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Network className="mr-2 h-4 w-4" />}Bağlantıyı kontrol et</Button>
          </div>
        </header>

        {detail.identityStatus === 'CONFLICT' && (
          <IdentityReview detail={detail} busy={busy} onReview={reviewIdentity} />
        )}

        {detail.monitoringMode !== 'FULL' && (
          <section className="grid gap-4 border-l-2 border-amber-500 bg-amber-500/5 px-5 py-4 md:grid-cols-[auto_1fr_auto] md:items-center" aria-labelledby="remediation-title">
            <ShieldAlert className="h-5 w-5 text-amber-700 dark:text-amber-300" aria-hidden="true" />
            <div><h2 id="remediation-title" className="text-sm font-semibold">{remediation.title}</h2><p className="mt-1 text-xs text-muted-foreground">{remediation.description}</p></div>
            <Button variant="outline" size="sm" onClick={() => setActiveTab('sources')}>Kaynakları incele</Button>
          </section>
        )}

        <section className="grid divide-y rounded-md border bg-card sm:grid-cols-4 sm:divide-x sm:divide-y-0" aria-label="Firewall kimlik özeti">
          <HeaderMetric label="Seri numarası" value={detail.serialNumber || 'Doğrulanmadı'} />
          <HeaderMetric label="FortiOS" value={detail.device.firmwareVersion || 'Veri yok'} />
          <HeaderMetric label="Kimlik" value={identityLabel(detail.identityStatus)} />
          <HeaderMetric label="Son başarılı veri" value={formatDate(detail.lastSuccessAt)} />
        </section>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="overflow-x-auto border-b">
            <TabsList className="h-auto min-w-max justify-start rounded-none bg-transparent p-0">
              {[
                ['overview', 'Genel'], ['interfaces', 'Arabirimler'], ['policies', 'Politikalar'], ['addresses', 'Adresler'],
                ['vips', 'VIP / NAT'], ['vpn', 'VPN'], ['ha', 'HA'], ['events', 'Olaylar'], ['sources', 'Veri Kaynakları'],
              ].map(([value, label]) => (
                <TabsTrigger key={value} value={value} className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">{label}</TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="overview" className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,.8fr)]">
            <DataPanel connectorId={id} resource="status" active={activeTab === 'overview'} />
            <section aria-labelledby="source-summary-title">
              <div className="mb-4 flex items-end justify-between"><div><h2 id="source-summary-title" className="text-lg font-semibold">Veri kaynakları</h2><p className="mt-1 text-xs text-muted-foreground">Her kaynak bağımsız değerlendirilir.</p></div><button type="button" onClick={() => setActiveTab('sources')} className="text-xs font-semibold text-primary hover:underline">Tümünü aç</button></div>
              <FirewallSourceMatrix capabilities={capabilities} />
            </section>
          </TabsContent>
          {(['interfaces', 'policies', 'addresses', 'vips', 'ha', 'events'] as ResourceKey[]).map((resource) => (
            <TabsContent key={resource} value={resource} className="mt-6"><DataPanel connectorId={id} resource={resource} active={activeTab === resource} /></TabsContent>
          ))}
          <TabsContent value="vpn" className="mt-6">
            <div className="mb-5 inline-flex rounded-md bg-muted p-1">
              <button type="button" onClick={() => setVpnTab('ssl-vpn')} aria-pressed={vpnTab === 'ssl-vpn'} className={cn('h-8 rounded-sm px-3 text-xs font-semibold', vpnTab === 'ssl-vpn' && 'bg-background shadow-sm')}>SSL-VPN</button>
              <button type="button" onClick={() => setVpnTab('ipsec')} aria-pressed={vpnTab === 'ipsec'} className={cn('h-8 rounded-sm px-3 text-xs font-semibold', vpnTab === 'ipsec' && 'bg-background shadow-sm')}>IPsec</button>
            </div>
            <DataPanel connectorId={id} resource={vpnTab} active={activeTab === 'vpn'} />
          </TabsContent>
          <TabsContent value="sources" className="mt-6 grid gap-7 xl:grid-cols-[minmax(0,1fr)_minmax(320px,.8fr)]">
            <section><h2 className="text-lg font-semibold">Kaynak durumu</h2><p className="mt-1 mb-4 text-xs text-muted-foreground">“Veri yok” ile “kaynak erişilemiyor” birbirinden ayrı gösterilir.</p><FirewallSourceMatrix capabilities={capabilities} /></section>
            <section className="space-y-5">
              <SourceActions detail={detail} busy={busy} sshInspection={sshInspection} onUpdated={() => load(true)} onCorrelate={correlateAnalyzer} onInspectSsh={inspectSsh} onTrustSsh={trustSsh} />
              <DataPanel connectorId={id} resource="status" endpoint={`/api/firewalls/${id}/snmp/health`} title="SNMP sağlık özeti" active={activeTab === 'sources'} compact />
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function HeaderMetric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 px-5 py-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate text-sm font-semibold" title={value}>{value}</p></div>;
}

function IdentityReview({ detail, busy, onReview }: { detail: FirewallDetail; busy: string | null; onReview: (action: 'keep-current' | 'accept-candidate' | 'merge-into-existing') => void }) {
  return (
    <section className="border-l-2 border-red-500 bg-red-500/5 px-5 py-4" aria-labelledby="identity-review-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div><h2 id="identity-review-title" className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-red-600" />Firewall kimliği değişti</h2><p className="mt-1 text-xs text-muted-foreground">Mevcut: {detail.identityKey || 'yok'} · Aday: {detail.identityCandidateKey || 'yok'}</p></div>
        <div className="flex flex-wrap gap-2">
          {detail.identityKey && <Button variant="outline" size="sm" onClick={() => onReview('keep-current')} disabled={Boolean(busy)}>Mevcut kimliği koru</Button>}
          {!detail.conflict && <Button variant="outline" size="sm" onClick={() => onReview('accept-candidate')} disabled={Boolean(busy)}>Yeni kimliği kabul et</Button>}
          {detail.conflict && <Button size="sm" onClick={() => onReview('merge-into-existing')} disabled={Boolean(busy)}>Mevcut kayıtla birleştir</Button>}
        </div>
      </div>
    </section>
  );
}

function SourceActions({ detail, busy, sshInspection, onUpdated, onCorrelate, onInspectSsh, onTrustSsh }: {
  detail: FirewallDetail;
  busy: string | null;
  sshInspection: null | { observed: { algorithm: string; fingerprint: string }; trusted: null | { fingerprint: string; matches: boolean } };
  onUpdated: () => Promise<void> | void;
  onCorrelate: () => void;
  onInspectSsh: () => void;
  onTrustSsh: () => void;
}) {
  return (
    <div className="divide-y rounded-md border">
      <FirewallTrustedCaCard connectorId={detail.id} tls={detail.tls} onUpdated={onUpdated} />
      <div className="p-4"><h2 className="text-sm font-semibold">FortiAnalyzer korelasyonu</h2><p className="mt-1 text-xs text-muted-foreground">Doğrulanmış seri numarasını managed-device devid ile eşleştirir.</p><Button className="mt-3" variant="outline" size="sm" onClick={onCorrelate} disabled={Boolean(busy) || detail.identityStatus !== 'VERIFIED'}>{busy === 'analyzer' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{detail.analyzerDeviceId ? 'Eşleştirmeyi yenile' : 'FortiAnalyzer ile eşleştir'}</Button></div>
      <div className="p-4"><h2 className="text-sm font-semibold">SSH host key güveni</h2><p className="mt-1 text-xs text-muted-foreground">Anahtar otomatik kabul edilmez. Gözlemlenen SHA-256 fingerprint açıkça onaylanır.</p><Button className="mt-3" variant="outline" size="sm" onClick={onInspectSsh} disabled={Boolean(busy) || !detail.device.nmsDeviceId || !detail.device.sshUsername}><KeyRound className="mr-2 h-4 w-4" />Anahtarı incele</Button>{sshInspection && <div className="mt-3 rounded-md bg-muted p-3"><p className="break-all font-mono text-xs">{sshInspection.observed.fingerprint}</p><p className="mt-2 text-xs text-muted-foreground">{sshInspection.observed.algorithm}</p>{!sshInspection.trusted?.matches && <Button className="mt-3" size="sm" onClick={onTrustSsh} disabled={Boolean(busy)}>Bu anahtara güven</Button>}{sshInspection.trusted?.matches && <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" />Güvenilen anahtarla eşleşiyor</p>}</div>}</div>
    </div>
  );
}

function DataPanel({ connectorId, resource, endpoint, title, active, compact = false }: { connectorId: string; resource: ResourceKey; endpoint?: string; title?: string; active: boolean; compact?: boolean }) {
  const [data, setData] = useState<FirewallEnvelope | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const result = await fetch(endpoint || RESOURCE[resource].endpoint(connectorId), { cache: 'no-store' }).then(readJson);
      setData(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Veri alınamadı.');
    } finally { setLoading(false); }
  }, [connectorId, endpoint, resource]);
  useEffect(() => { if (active && !data && !loading && !error) void load(); }, [active, data, error, load, loading]);

  return (
    <section aria-labelledby={`${resource}-panel-title`}>
      <div className="mb-4 flex items-end justify-between gap-3"><div><h2 id={`${resource}-panel-title`} className={compact ? 'text-sm font-semibold' : 'text-lg font-semibold'}>{title || RESOURCE[resource].label}</h2>{data && <p className="mt-1 text-xs text-muted-foreground">Kaynak: {sourceLabel(data.source)} · {formatDate(data.collectedAt)}</p>}</div><Button variant="ghost" size="sm" onClick={load} disabled={loading} aria-label={`${title || RESOURCE[resource].label} verisini yenile`}><RefreshCcw className={cn('h-4 w-4 motion-reduce:animate-none', loading && 'animate-spin')} /></Button></div>
      {loading && !data ? <PanelState icon={Loader2} text="Veri alınıyor" spin /> : error ? <PanelState icon={CircleOff} text={error} tone="critical" /> : data?.status === 'unavailable' ? <PanelState icon={CircleOff} text={data.unavailableReason || 'Bu kaynak şu anda kullanılamıyor.'} tone="critical" /> : data ? <><EnvelopeStatus data={data} /><DataView value={data.data} empty={RESOURCE[resource].empty} /></> : null}
    </section>
  );
}

function EnvelopeStatus({ data }: { data: FirewallEnvelope }) {
  if (data.status === 'available') return null;
  return <div className="mb-3 flex items-center gap-2 border-l-2 border-amber-500 bg-amber-500/5 px-3 py-2 text-xs"><Clock3 className="h-4 w-4 text-amber-600" />Son bilinen veri gösteriliyor. {data.unavailableReason}</div>;
}

function DataView({ value, empty }: { value: unknown; empty: string }) {
  const resolved = value && typeof value === 'object' && 'items' in value ? (value as { items: unknown[] }).items : value;
  if (Array.isArray(resolved)) {
    if (!resolved.length) return <PanelState icon={CheckCircle2} text={empty} />;
    const rows = resolved.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)));
    const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).filter((key) => !['rawData', 'password'].includes(key)).slice(0, 7);
    return <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-muted/60 text-xs text-muted-foreground"><tr>{columns.map((column) => <th key={column} className="px-4 py-3 font-semibold">{columnLabel(column)}</th>)}</tr></thead><tbody className="divide-y">{rows.map((row, index) => <tr key={String(row.id || row.name || row.policyId || index)}>{columns.map((column) => <td key={column} className="max-w-[280px] px-4 py-3 align-top"><span className="line-clamp-2">{displayValue(row[column])}</span></td>)}</tr>)}</tbody></table></div>;
  }
  if (resolved && typeof resolved === 'object') {
    return <dl className="grid divide-y rounded-md border sm:grid-cols-2 sm:divide-x sm:divide-y-0">{Object.entries(resolved as Record<string, unknown>).filter(([key]) => !/password|token|cookie/i.test(key)).slice(0, 12).map(([key, item]) => <div key={key} className="min-w-0 px-4 py-3"><dt className="text-xs text-muted-foreground">{columnLabel(key)}</dt><dd className="mt-1 break-words text-sm font-medium">{displayValue(item)}</dd></div>)}</dl>;
  }
  return <PanelState icon={CheckCircle2} text={empty} />;
}

function PanelState({ icon: Icon, text, tone = 'normal', spin = false }: { icon: typeof Shield; text: string; tone?: 'normal' | 'critical'; spin?: boolean }) {
  return <div className={cn('flex min-h-36 flex-col items-center justify-center rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground', tone === 'critical' && 'border-red-500/30 bg-red-500/[0.03] text-red-700 dark:text-red-300')}><Icon className={cn('mb-3 h-5 w-5', spin && 'animate-spin motion-reduce:animate-none')} aria-hidden="true" /><p className="max-w-md">{text}</p></div>;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır';
  if (Array.isArray(value)) return value.map(displayValue).join(', ') || '—';
  if (typeof value === 'object') return Object.entries(value as Record<string, unknown>).map(([key, item]) => `${key}: ${displayValue(item)}`).join(' · ');
  return String(value);
}

const COLUMN_LABELS: Record<string, string> = { name: 'Ad', alias: 'Takma ad', ipAddress: 'IP adresi', macAddress: 'MAC adresi', linkUp: 'Bağlantı', speed: 'Hız', policyId: 'Policy ID', action: 'Aksiyon', sourceInterfaces: 'Kaynak arayüz', destinationInterfaces: 'Hedef arayüz', sourceAddresses: 'Kaynak adres', destinationAddresses: 'Hedef adres', services: 'Servisler', schedule: 'Zamanlama', enabled: 'Aktif', type: 'Tür', value: 'Değer', associatedInterface: 'Bağlı arayüz', status: 'Durum', user_name: 'Kullanıcı', remote_host: 'Uzak IP', lastSeenAt: 'Son görülme', collectedAt: 'Toplanma zamanı' };
function columnLabel(value: string) { return COLUMN_LABELS[value] || value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' '); }
function sourceLabel(value: string) { return ({ 'fortigate-rest': 'FortiGate REST', fortianalyzer: 'FortiAnalyzer', 'event-cache': 'Olay önbelleği', snmp: 'SNMP', ssh: 'SSH', database: 'Veritabanı snapshot' } as Record<string, string>)[value] || value; }
function identityLabel(value: string) { return ({ VERIFIED: 'Doğrulandı', PENDING: 'Doğrulama bekliyor', CONFLICT: 'İnceleme gerekiyor' } as Record<string, string>)[value] || value; }
function remediationFor(code: string | null) {
  if (code === 'TLS_CERTIFICATE_EXPIRED') return { title: 'FortiGate sertifikasının süresi dolmuş', description: 'Cihaz kısıtlı izlemeyle kayıtlı kalır. FortiGate üzerinde geçerli bir sertifika yenilendiğinde otomatik REST kontrolü tam izlemeye geçer.' };
  if (code === 'TLS_CERTIFICATE_UNTRUSTED') return { title: 'FortiGate sertifikası güvenilir değil', description: 'Veri Kaynakları sekmesinden bu firewall için CA zincirini yükleyin. Global TLS bypass kullanılmaz; SNMP, SSH ve FortiAnalyzer verileri çalışmaya devam edebilir.' };
  if (code === 'AUTHENTICATION_FAILED') return { title: 'REST kimlik doğrulaması başarısız', description: 'Salt okunur hesabın veya API token’ın yetkisini kontrol edin. Mevcut fallback kaynakları etkilenmez.' };
  if (code === 'NETWORK_UNREACHABLE' || code === 'REQUEST_TIMEOUT') return { title: 'FortiGate REST adresine erişilemiyor', description: 'Ağ yolu ve 443/tcp erişimini kontrol edin. Sistem güvenli fallback kaynaklarını bağımsız kullanır.' };
  return { title: 'Tam izleme henüz kullanılamıyor', description: 'Veri kaynaklarını inceleyin. Kullanılabilir bir fallback kaynağı geldiğinde cihaz kısıtlı izlemeye otomatik geçer.' };
}
