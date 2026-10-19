'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Clock3, Info, Link2, Loader2, Plus, Radio, RefreshCw, Search, Settings2, Shield, ShieldCheck, Trash2, TriangleAlert, X } from 'lucide-react';
import { PageHeading } from '@/components/ui/page-heading';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { FirewallModeBadge } from '@/components/firewall/FirewallModeBadge';
import { FirewallOnboardingDialog } from '@/components/firewall/FirewallOnboardingDialog';
import { FirewallWorkspaceDialog } from '@/components/firewall/FirewallWorkspaceDialog';
import type { FirewallListItem } from '@/components/firewall/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { uiError } from '@/lib/i18n/tr';
import { parseActor, requestUsersJson, userDate, userSearch, type WorkspaceActor } from '@/lib/users/workspace';
import { canAccessSync } from '@/lib/auth/permission-policy';
import { firewallDateValue, firewallSyncLabels, firewallSyncStatus, firewallUncertain, parseFirewallList, requestFirewall, restObservation } from '@/lib/firewall/workspace';
import common from '@/components/users/users-workspace.module.css';
import styles from '@/components/firewall/firewall-workspace.module.css';
async function readJson(response: Response) { const data = await response.json().catch(() => null); if (!response.ok || data?.success !== true) throw Error('Güvenlik duvarı işlemi tamamlanamadı.'); return data; }
export default function FirewallInventoryPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<FirewallListItem[] | null>(null), [actor, setActor] = useState<WorkspaceActor | null>(null), [loading, setLoading] = useState(true), [errors, setErrors] = useState<string[]>([]), [readAt, setReadAt] = useState<string | null>(null);
  const [search, setSearch] = useState(''), [status, setStatus] = useState('all'), [enabled, setEnabled] = useState('all'), [dialogOpen, setDialogOpen] = useState(false), [selected, setSelected] = useState<FirewallListItem | null>(null), [uncertain, setUncertain] = useState(false);
  const active = useRef<AbortController | null>(null), sequence = useRef(0);
  const load = useCallback(async () => {
    const id = ++sequence.current; active.current?.abort(); const controller = new AbortController(); active.current = controller; setLoading(true);
    const results = await Promise.allSettled([requestFirewall('/api/firewalls', { signal: controller.signal }).then(parseFirewallList), requestUsersJson('/api/auth/me', 'İşlem yetkisi doğrulanamadı.', { signal: controller.signal }).then(parseActor)]);
    if (id !== sequence.current || controller.signal.aborted) return;
    const next: string[] = [];
    if (results[0].status === 'fulfilled') { setItems(results[0].value); setReadAt(new Date().toISOString()); setUncertain(false); } else next.push(results[0].reason instanceof Error ? results[0].reason.message : 'Güvenlik duvarı listesi alınamadı.');
    if (results[1].status === 'fulfilled') setActor(results[1].value); else { setActor(null); next.push('İşlem yetkisi doğrulanamadı. Salt okunur görünüm kullanılıyor.'); }
    setErrors(next); setLoading(false);
  }, []);
  useEffect(() => { void load(); return () => active.current?.abort(); }, [load]);
  const allowed = Boolean(actor && canAccessSync(actor.role, 'firewall', 'write') && items && !loading && !errors.length && !uncertain);
  const all = items || [], term = userSearch(search.trim()), filtered = all.filter(item => (!term || userSearch([item.device?.name, item.name, item.host, item.vdom, item.identity?.serialNumber].filter(Boolean).join(' ')).includes(term)) && (status === 'all' || restObservation(item).state === status) && (enabled === 'all' || item.enabled === (enabled === 'enabled')));
  const hasFilters = Boolean(search || status !== 'all' || enabled !== 'all'), clear = () => { setSearch(''); setStatus('all'); setEnabled('all'); };
  const metrics = [{ label: 'Kayıtlı bağlantı', value: all.length, icon: Shield, help: 'Envantere bağlı ve eski profil kayıtları' }, { label: 'REST kontrolü başarılı', value: all.filter(row => restObservation(row).state === 'available').length, icon: Link2, help: 'Son kayıtlı REST kontrolünün sonucu' }, { label: 'Kısıtlı izleme', value: all.filter(row => row.monitoring?.mode === 'LIMITED').length, icon: Radio, help: 'Alternatif kaynaklardan veri alınabiliyor' }, { label: 'İnceleme gerekiyor', value: all.filter(row => row.requiresInventoryLink || row.identity?.status === 'CONFLICT' || (row.enabled && row.monitoring?.mode === 'UNAVAILABLE')).length, icon: TriangleAlert, help: 'Kimlik, envanter bağlantısı veya kaynak sorunu' }];
  function created(connectorId: string) { toast({ title: 'Güvenlik duvarı kaydedildi', description: 'İlk kontrolün sonucunu cihazın ayrıntılarında görebilirsiniz.' }); window.location.assign(`/integrations/firewall/${encodeURIComponent(connectorId)}`); }
  return <div className={common.page}><div className={common.workspace}>
    <header className={common.header}><PageHeading section="firewall" description="FortiGate bağlantılarını, veri kaynaklarını ve envanter senkronizasyonunu takip edin.">Güvenlik Duvarları</PageHeading><div className={common.headerActions}><Button variant="outline" disabled={loading || dialogOpen || Boolean(selected)} onClick={() => void load()}><RefreshCw size={16} aria-hidden="true" className={loading ? 'animate-spin' : ''} />{loading ? 'Yükleniyor…' : 'Bilgileri yenile'}</Button><Button disabled={!allowed} onClick={() => setDialogOpen(true)}><Plus size={16} aria-hidden="true" />FortiGate ekle</Button></div></header>
    <div className={common.serviceBar}><SemanticBadge tone={errors.length || uncertain ? 'warning' : 'info'} icon={Clock3}>{uncertain ? 'İşlem sonucu belirsiz' : errors.length ? items ? 'Önceki liste gösteriliyor' : 'Liste alınamadı' : loading ? 'Bilgiler alınıyor' : 'Kayıtlı bağlantı bilgileri'}</SemanticBadge><span>{readAt ? `Son okuma: ${userDate(readAt)} · TSİ` : 'Henüz başarılı okuma yok'}</span></div>
    {errors.map(error => <div key={error} className={common.error} role="alert"><TriangleAlert size={18} aria-hidden="true" /><p>{error}{items && ' Son başarılı okumadaki kayıtlar korunuyor; güncel durum doğrulanamadı.'}</p></div>)}
    {uncertain && <div className={common.error} role="alert"><TriangleAlert size={18} aria-hidden="true" /><p>{firewallUncertain}</p></div>}
    <section className={common.stats} aria-label="Güvenlik duvarı özeti">{metrics.map(metric => <article className={common.stat} key={metric.label}><div><h2>{metric.label}</h2><span className={common.icon}><metric.icon size={18} aria-hidden="true" /></span></div><strong>{items ? metric.value.toLocaleString('tr-TR') : '—'}</strong><p>{metric.help}</p></article>)}</section>
    <div className={common.info}><Info size={18} aria-hidden="true" /><p>REST bağlantısı, SNMP/SSH gibi veri kaynakları ve envanter aktarımı ayrı değerlendirilir. Son kontrol sonucu sürekli erişilebilirlik garantisi değildir; kontrol zamanı her kayıtta gösterilir.</p></div>
    {actor && !canAccessSync(actor.role, 'firewall', 'write') && <p className={common.muted}>Rolünüz kayıtları görüntüleyebilir. Ekleme, düzenleme, test, senkronizasyon ve kaldırma işlemleri yönetici rolü gerektirir.</p>}
    <div className={common.filters}><div className={common.search}><Search size={16} aria-hidden="true" /><Input aria-label="Güvenlik duvarı ara" placeholder="Cihaz, sunucu, seri numarası veya VDOM ara…" value={search} onChange={event => setSearch(event.target.value)} /></div><div><label className="sr-only" htmlFor="firewall-rest-filter">REST kontrol sonucu</label><select id="firewall-rest-filter" value={status} onChange={event => setStatus(event.target.value)}><option value="all">Tüm REST sonuçları</option><option value="available">Son kontrol başarılı</option><option value="unavailable">Son kontrol başarısız</option><option value="stale">Gecikmiş veri</option><option value="unknown">Kontrol sonucu yok</option></select></div><div><label className="sr-only" htmlFor="firewall-enabled-filter">Profil durumu</label><select id="firewall-enabled-filter" value={enabled} onChange={event => setEnabled(event.target.value)}><option value="all">Tüm profil durumları</option><option value="enabled">Etkin profiller</option><option value="disabled">Devre dışı profiller</option></select></div>{hasFilters && <Button variant="outline" onClick={clear}><X size={16} aria-hidden="true" />Temizle</Button>}</div>
    <section aria-labelledby="firewall-list-title" aria-busy={loading}><div className={styles.listHeading}><h2 id="firewall-list-title"><Shield size={19} aria-hidden="true" />FortiGate bağlantıları</h2><p aria-live="polite">{items ? `${filtered.length} / ${all.length} bağlantı gösteriliyor` : loading ? 'Liste yükleniyor…' : 'Liste alınamadı'}</p></div>
    {!items || !filtered.length ? <div className={`${common.empty} ${styles.firewall}`}><Shield size={28} aria-hidden="true" /><h3>{!items ? loading ? 'Güvenlik duvarları yükleniyor…' : 'Güvenlik duvarı listesi alınamadı' : hasFilters ? 'Filtrelerle eşleşen bağlantı yok' : 'Henüz FortiGate eklenmedi'}</h3><p>{!items ? 'Kayıtlar ve işlem yetkileri kontrol ediliyor. Bilgileri yenileyerek tekrar deneyebilirsiniz.' : hasFilters ? 'Aramayı veya filtreleri değiştirin.' : 'FortiGate ekleyerek yönetim adresini ve erişim yöntemini tanımlayın.'}</p>{hasFilters && <Button variant="outline" onClick={clear}>Filtreleri temizle</Button>}</div> : <div className={styles.pageList}>{filtered.map(item => { const rest = restObservation(item), sync = item.lastInventorySync, syncState = firewallSyncStatus(sync?.status); return <article key={`${item.configId}:${item.vdom}`} className={styles.firewall}><header><div className={styles.identity}><span className={common.icon}><ShieldCheck size={20} aria-hidden="true" /></span><div><h3>{item.device?.name || item.name}</h3><p>{item.host} · VDOM {item.vdom}</p><p>{item.device?.model || 'FortiGate'}{item.identity?.serialNumber ? ` · ${item.identity.serialNumber}` : ''}</p><div className={styles.badges}><SemanticBadge tone={item.enabled ? 'info' : 'neutral'}>{item.enabled ? 'Profil etkin' : 'Profil devre dışı'}</SemanticBadge><FirewallModeBadge mode={item.monitoring?.mode} />{item.identity?.status === 'CONFLICT' && <SemanticBadge tone="warning">Kimlik incelemesi gerekiyor</SemanticBadge>}{item.requiresInventoryLink && <SemanticBadge tone="warning" icon={Link2}>Envanter bağlantısı gerekli</SemanticBadge>}</div></div></div><div className={styles.actions}>{item.id && <Button variant="outline" size="sm" asChild><Link href={`/integrations/firewall/${encodeURIComponent(item.id)}`}>İncele<ArrowRight size={15} aria-hidden="true" /></Link></Button>}<Button variant="outline" size="sm" onClick={() => setSelected(item)} aria-label={`${item.device?.name || item.name} bağlantısını yönet`}><Settings2 size={15} aria-hidden="true" />Bağlantıyı yönet</Button><FirewallRemovalButton allowed={allowed} endpoint={item.id ? `/api/firewalls/${encodeURIComponent(item.id)}` : `/api/firewalls?configId=${encodeURIComponent(item.configId)}`} label={`${item.device?.name || item.name} bağlantısını kaldır`} description="Bu işlem InfraScope bağlantı ayarlarını kaldırır; cihaz envanterde kalır. Firewall üzerinde hiçbir değişiklik yapılmaz." onRemoved={() => void load()} /></div></header>
    <dl className={styles.meta}><div><dt>Son REST kontrolü</dt><dd><SemanticBadge tone={rest.tone}>{rest.label}</SemanticBadge><small>{userDate(rest.at)} · TSİ</small></dd></div><div><dt>Profilin son envanter denemesi</dt><dd><SemanticBadge tone={syncState === 'success' ? 'success' : syncState === 'partial' ? 'warning' : syncState === 'failed' ? 'danger' : 'neutral'} icon={RefreshCw}>{syncState ? firewallSyncLabels[syncState] : sync ? 'Sonuç bilgisi eksik' : sync === null ? 'Senkronizasyon kaydı yok' : 'Senkronizasyon bilgisi yok'}</SemanticBadge><small>{sync ? `${userDate(firewallDateValue(sync.completedAt) || firewallDateValue(sync.startedAt))} · TSİ` : 'Bağlantı kontrolünden ayrı tutulur'}</small></dd></div><div><dt>Veri kaynağı ve erişim</dt><dd>{Array.isArray(item.monitoring?.sources) ? `${item.monitoring.sources.filter(source => source.status === 'available').length} kullanılabilir kaynak` : 'Kaynak bilgisi yok'}<small>{item.credentialSet ? 'REST erişim bilgisi kayıtlı' : 'REST erişim bilgisi yok'} · {item.device ? 'Envanter cihazına bağlı' : 'Eski entegrasyon profili'}</small></dd></div></dl>{item.requiresInventoryLink && <div className={styles.legacy}><LegacyRow item={item} allowed={allowed} onLinked={() => void load()} /></div>}</article>; })}</div>}
    <p className={`${common.muted} mt-4`}>Üstteki sayılar tüm kayıtlı bağlantılara aittir. İzleme modu son kaynak değerlendirmesini, envanter sonucu profilin son kalıcı aktarım günlüğünü gösterir.</p></section>
    {dialogOpen && <FirewallOnboardingDialog open onOpenChange={setDialogOpen} onCreated={created} onUncertain={() => setUncertain(true)} />}
    {selected && <FirewallWorkspaceDialog key={`${selected.configId}:${selected.vdom}`} item={selected} allowed={allowed} multipleActive={new Set(all.filter(row => row.enabled).map(row => row.configId)).size > 1} onClose={() => setSelected(null)} onUpdated={() => void load()} />}
  </div></div>;
}
function LegacyRow({ item, allowed, onLinked }: { item: FirewallListItem; allowed: boolean; onLinked: () => void }) {
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
    if (!allowed || !deviceId || busy) return;
    setBusy(true);
    try {
      const response = await fetch('/api/firewalls/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configId: item.configId, deviceId }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(uiError(data?.error || 'Envanter bağlantısı kurulamadı.'));
      toast({ title: 'Bağlantı tamamlandı', description: 'Eski FortiGate kaydı güvenlik duvarı envanterine bağlandı.' });
      onLinked();
    } catch (linkError) {
      toast({ title: 'Bağlantı kurulamadı', description: linkError instanceof Error ? linkError.message : 'İşlem başarısız.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className={styles.hint}>Eski profili mevcut bir güvenlik duvarı cihazına bağlayın. Seçenekler envanterin ilk 100 kaydındaki güvenlik duvarlarıyla sınırlıdır; eşleştirme ilk bağlantı kontrolünü de başlatır.</p>
      <div>
        <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">Envanter bağlantısı gerekiyor</p>
        <select value={deviceId} onChange={(event) => setDeviceId(event.target.value)} className="mt-2 h-9 w-full rounded-md border bg-background px-3 text-sm" aria-label={`${item.name} için güvenlik duvarı cihazı seçin`}>
          <option value="">Güvenlik duvarı envanter cihazı seçin</option>
          {devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-2 justify-self-start lg:justify-self-end">
        <Button variant="outline" size="sm" onClick={link} disabled={!allowed || !deviceId || busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
          Envantere bağla
        </Button>

      </div>
    </div>
  );
}

function FirewallRemovalButton({
  endpoint,
  allowed,
  label,
  description,
  onRemoved,
}: {
  endpoint: string;
  allowed: boolean;
  label: string;
  description: string;
  onRemoved: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function remove() {
    if (removing || !allowed) return;
    setRemoving(true);
    try {
      const response = await fetch(endpoint, { method: 'DELETE' });
      await readJson(response);
      setOpen(false);
      toast({ title: 'Bağlantı kaldırıldı', description: 'Güvenlik duvarı cihazında hiçbir değişiklik yapılmadı.' });
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
        disabled={!allowed || removing}
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Güvenlik duvarı bağlantısını kaldır?"
        description={description}
        confirmText={removing ? 'Kaldırılıyor...' : 'Bağlantıyı kaldır'}
        cancelText="Vazgeç"
        variant="destructive"
        onConfirm={() => void remove()}
      />
    </>
  );
}
