'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BadgeCheck, CalendarClock, Check, ChevronDown, Clock3, Gauge, Info, KeyRound, Layers, RefreshCw, Server, ShieldCheck, TriangleAlert, UsersRound, X } from 'lucide-react';
import { PageHeading } from '@/components/ui/page-heading';
import { Button } from '@/components/ui/button';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { licenseCapacity, licenseDate, licenseStatus, planFeatures, remainingDays, requestLicenseSnapshot, tierLabels, type LicenseSnapshot } from '@/lib/license/workspace';
import type { LicenseTier } from '@/lib/license/features';
import styles from './page.module.css';

const tiers: LicenseTier[] = ['TRIAL', 'STANDARD', 'ENTERPRISE'];
const number = (value: number | null | undefined) => value === null || value === undefined ? '—' : value.toLocaleString('tr-TR');

function CapacityCard({ title, used, limit, kind }: { title: string; used: number | null; limit: number | null; kind: 'devices' | 'users' }) {
  const state = licenseCapacity(used, limit), Icon = kind === 'devices' ? Server : UsersRound;
  const percentage = state.percent === null ? null : new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(state.percent);
  return <article className={styles.capacity}>
    <div className={styles.capacityHeader}><h3><span className={styles.icon}><Icon size={19} aria-hidden="true" /></span>{title}</h3><SemanticBadge tone={state.tone}>{state.label}</SemanticBadge></div>
    <div className={styles.capacityValues}><p><strong>{number(used)}</strong><span> / {number(limit)}</span></p><span>{percentage === null ? 'Oran hesaplanamıyor' : `%${percentage} dolu`}</span></div>
    <div className={styles.track} role={state.bar === null ? undefined : 'progressbar'} aria-label={`${title} kapasite kullanımı`} aria-valuemin={state.bar === null ? undefined : 0} aria-valuemax={state.bar === null ? undefined : 100} aria-valuenow={state.bar ?? undefined} aria-valuetext={state.bar === null ? undefined : `${number(used)} / ${number(limit)}; yüzde ${percentage}. ${state.detail}`}>
      {state.bar !== null && <span className={styles[state.tone]} style={{ width: `${state.bar}%` }} />}
    </div>
    <div className={styles.capacityLabels}><span>Kullanılan / lisans limiti</span><span>{state.detail}</span></div>
    <p className={styles.capacityNote}>{kind === 'devices' ? 'Envanterdeki tüm cihaz kayıtları sayılır; yalnızca izlenen cihazlarla sınırlı değildir.' : 'Kayıtlı tüm kullanıcılar sayılır; yalnızca aktif oturumlar veya etkin hesaplarla sınırlı değildir.'}</p>
  </article>;
}

export default function LicensePage() {
  const [snapshot, setSnapshot] = useState<LicenseSnapshot | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [readAt, setReadAt] = useState<number | null>(null), [now, setNow] = useState(Date.now());
  const sequence = useRef(0), active = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    const id = ++sequence.current; active.current?.abort(); const controller = new AbortController(); active.current = controller;
    setLoading(true); setError('');
    try {
      const result = await requestLicenseSnapshot(controller.signal);
      if (id !== sequence.current || controller.signal.aborted) return;
      setSnapshot(result); setReadAt(Date.now()); setNow(Date.now());
    } catch (failure) {
      if (id === sequence.current && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Lisans bilgileri alınamadı.');
    } finally { if (id === sequence.current && !controller.signal.aborted) setLoading(false); }
  }, []);
  useEffect(() => { void load(); const timer = setInterval(() => setNow(Date.now()), 60000); return () => { clearInterval(timer); sequence.current += 1; active.current?.abort(); }; }, [load]);
  const license = snapshot?.license ?? null;
  const effectiveNow = snapshot?.observedAt && readAt ? Date.parse(snapshot.observedAt) + Math.max(0, now - readAt) : now;
  const state = licenseStatus(license, effectiveNow), days = license ? remainingDays(license, effectiveNow) : null;
  const currentTier = license?.tier;
  const expiryPassed = Boolean(license?.validUntil && Date.parse(license.validUntil) <= effectiveNow);
  return <div className={styles.page}><div className={styles.workspace}>
    <header className={styles.header}>
      <PageHeading section="license" description="Lisans durumunu, geçerlilik süresini ve kayıt kapasitenizi takip edin.">Lisans Yönetimi</PageHeading>
      <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw size={16} aria-hidden="true" className={loading ? 'animate-spin' : ''} />{loading ? 'Yükleniyor…' : 'Bilgileri yenile'}</Button>
    </header>
    <div className={styles.serviceBar}><SemanticBadge tone={error ? 'warning' : 'info'} icon={Clock3}>{error ? snapshot ? 'Önceki bilgiler gösteriliyor' : 'Bilgi alınamadı' : loading ? 'Bilgiler alınıyor' : 'Uygulamanın bildirdiği durum'}</SemanticBadge><span>{readAt ? `Son okuma: ${licenseDate(new Date(readAt).toISOString())} · TSİ` : 'Henüz başarılı okuma yok'}</span></div>
    {error && <div role="alert" className={styles.error}><TriangleAlert size={19} aria-hidden="true" /><div><strong>{error}</strong>{snapshot && <p>Aşağıdaki bilgiler son başarılı okumaya aittir. Güncel durum doğrulanamadı.</p>}</div></div>}
    <div aria-live="polite" className="sr-only">{loading ? 'Lisans bilgileri yükleniyor.' : error || 'Lisans bilgileri güncellendi.'}</div>
    <div aria-busy={loading} className={styles.content}>
      <section aria-label="Lisans özeti" className={styles.stats}>
        <article className={styles.stat}><div><h2>Lisans durumu</h2><span className={styles.icon}><ShieldCheck size={18} aria-hidden="true" /></span></div><div className={styles.statValue}><SemanticBadge tone={state.tone}>{state.label}</SemanticBadge></div><p>{license?.graceMode ? 'Doğrulama bilgilerini kontrol edin' : 'Uygulamanın bildirdiği geçerlilik'}</p></article>
        <article className={styles.stat}><div><h2>Lisans planı</h2><span className={styles.icon}><Layers size={18} aria-hidden="true" /></span></div><strong>{currentTier ? tierLabels[currentTier] : 'Bilgi yok'}</strong><p>{license?.hasKey ? 'Lisans anahtarı tanımlı' : license?.hasKey === false ? 'Tanımlı anahtar bilgisi yok' : 'Anahtar bilgisi alınamadı'}</p></article>
        <article className={styles.stat}><div><h2>Geçerlilik sonu</h2><span className={styles.icon}><CalendarClock size={18} aria-hidden="true" /></span></div><strong>{licenseDate(license?.validUntil ?? null, false)}</strong><p>{license?.validUntil ? `${licenseDate(license.validUntil).split(' ').slice(-1).join(' ')} · Türkiye saati` : 'Bitiş tarihi bildirilmedi'}</p></article>
        <article className={styles.stat}><div><h2>Kalan lisans süresi</h2><span className={styles.icon}><Clock3 size={18} aria-hidden="true" /></span></div><strong>{days === null ? 'Bilgi yok' : expiryPassed ? 'Süre doldu' : `${number(days)} gün`}</strong><p>{days === null ? 'Geçerlilik tarihi gerekli' : 'Bitiş tarihinden hesaplanır'}</p></article>
      </section>
      {license && <div className={`${styles.statusNote} ${styles[state.tone]}`}><Info size={18} aria-hidden="true" /><p>{state.description}</p></div>}
      <section className={styles.panel} aria-labelledby="capacity-title">
        <div className={styles.sectionHeader}><span className={styles.icon}><Gauge size={20} aria-hidden="true" /></span><div><h2 id="capacity-title">Kapasite kullanımı</h2><p>Kullanılan kayıt, lisans limiti ve kalan kapasite</p></div></div>
        <div className={styles.capacities}><CapacityCard title="Cihaz kapasitesi" kind="devices" used={snapshot?.usage.deviceCount ?? null} limit={license?.maxDevices ?? null} /><CapacityCard title="Kullanıcı kapasitesi" kind="users" used={snapshot?.usage.userCount ?? null} limit={license?.maxUsers ?? null} /></div>
        <p className={styles.panelFoot}>Eksik bilgi sıfır kabul edilmez. Limit 0 ise yüzde hesaplanmaz; aşım varsa ayrıca belirtilir.</p>
      </section>
      <section className={styles.panel} aria-labelledby="validation-title">
        <div className={styles.sectionHeader}><span className={styles.icon}><BadgeCheck size={20} aria-hidden="true" /></span><div><h2 id="validation-title">Doğrulama bilgileri</h2><p>Lisans bilgisi ile sayfanın yenilenme zamanı farklıdır</p></div></div>
        <dl className={styles.details}>
          <div><dt>{license?.tier === 'TRIAL' && license.hasKey === false ? 'Yerel deneme durum zamanı' : 'Son başarılı lisans doğrulaması'}</dt><dd>{licenseDate(license?.lastValidated ?? null)}{license?.lastValidated && <small>Türkiye saati (TSİ)</small>}</dd></div>
          <div><dt>Doğrulama yöntemi</dt><dd>{!license || license.graceMode === null ? 'Bilgi yok' : license.graceMode ? 'Önbellekteki lisans bilgisi' : license.tier === 'TRIAL' && license.hasKey === false ? 'Yerel deneme modu' : 'Kaydedilmiş doğrulama sonucu'}<small>Bilgileri yenile, uygulamanın mevcut durumunu okur.</small></dd></div>
        </dl>
        <details className={styles.technical}><summary><KeyRound size={16} aria-hidden="true" />Lisans ve kurulum kimliği<ChevronDown size={16} aria-hidden="true" /></summary><dl className={styles.details}><div><dt>Maskelenmiş lisans anahtarı</dt><dd><code>{license?.maskedKey || (license?.hasKey === false ? 'Tanımlı anahtar bilgisi yok' : 'Anahtar bilgisi alınamadı')}</code></dd></div><div><dt>Kurulum kimliği</dt><dd><code>{license?.machineId || 'Bilgi yok'}</code></dd></div></dl></details>
      </section>
    </div>
    <details className={styles.panel}>
      <summary className={styles.planSummary}><span className={styles.icon}><Layers size={19} aria-hidden="true" /></span><span>Plan kapsamını karşılaştır<span className={styles.planSubtitle}>Deneme, Standart ve Kurumsal plan hakları</span></span><ChevronDown size={18} aria-hidden="true" /></summary>
      <div className={styles.planNote}><Info size={17} aria-hidden="true" /><p>Tablo plan haklarını gösterir. Özelliğin bu sürümde bulunduğunu, yapılandırıldığını veya etkin olduğunu doğrulamaz.</p></div>
      <div className={styles.tableWrap}><table className={styles.table}><caption className="sr-only">Lisans planlarının özellik kapsamı</caption><thead><tr><th scope="col">Özellik</th>{tiers.map(tier => <th key={tier} scope="col" className={tier === currentTier ? styles.current : undefined}>{tierLabels[tier]}{tier === currentTier && <span>Mevcut plan</span>}</th>)}</tr></thead><tbody>{planFeatures.map(feature => <tr key={feature.code}><th scope="row">{feature.label}</th>{tiers.map(tier => <td key={tier} className={tier === currentTier ? styles.current : undefined}>{feature.tiers[tier] ? <Check size={17} aria-hidden="true" className={styles.included} /> : <X size={16} aria-hidden="true" className={styles.excluded} />}<span className="sr-only">{feature.tiers[tier] ? 'Plan kapsamında' : 'Plan kapsamında değil'}</span></td>)}</tr>)}</tbody></table></div>
    </details>
    <section className={styles.changeNote} aria-labelledby="license-change-title"><span className={styles.icon}><KeyRound size={19} aria-hidden="true" /></span><div><h2 id="license-change-title">Lisans yenileme veya değiştirme</h2><p>Bu ekrandan lisans anahtarı etkinleştirme desteklenmiyor. Lisans yenileme ve plan değişikliği için kurulumunuzu yöneten kişiyle iletişime geçin.</p></div></section>
  </div></div>;
}
