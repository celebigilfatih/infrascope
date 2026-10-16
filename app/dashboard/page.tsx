'use client';

import { uiError } from '@/lib/i18n/tr';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Activity, ArrowRight, CheckCheck, ChevronRight, CircleAlert, Download, EllipsisVertical, HardDrive, Link2, LoaderCircle, Monitor, Plus, Radio, RefreshCcw, TriangleAlert, TrendingUp } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { dashboardGet, incidentLabel, percentLabel, relativeLabel } from '@/lib/dashboard/presentation';
import { ResourceBars, ResourceSparkline, CoveragePlot } from '@/components/dashboard/ResourceCharts';
import { IncidentDetail } from '@/components/dashboard/IncidentDetail';
import { IncidentSeverityBadge, IncidentStatusBadge } from '@/components/dashboard/IncidentVisuals';
import type { DashboardAnalytics, DashboardRange, DashboardSummary, ResourceMetric } from '@/components/dashboard/types';
import styles from '@/components/dashboard/dashboard.module.css';
import DashboardLoading from './loading';

function Menu({ label, children }: { label: string; children: React.ReactNode }) {
  return <Popover><PopoverTrigger asChild><button className={styles.more} aria-label={label}><EllipsisVertical size={17} /></button></PopoverTrigger><PopoverContent align="end" className="w-52 rounded-xl p-2 text-sm">{children}</PopoverContent></Popover>;
}
function Empty({ children }: { children: React.ReactNode }) { return <div className={styles.empty}>{children}</div>; }
const stateLabels = { healthy: 'Bağlı', unconfigured: 'Bağlı değil', stale: 'Veri gecikmiş', error: uiError('Bağlantı hatası') };

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [summaryError, setSummaryError] = useState('');
  const [analyticsError, setAnalyticsError] = useState('');
  const [range, setRange] = useState<DashboardRange>('24h');
  const [metric, setMetric] = useState<ResourceMetric>('cpu');
  const [deviceId, setDeviceId] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [incidentId, setIncidentId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const manualRefresh = useRef(false);

  useEffect(() => {
    const controller = new AbortController(); setSummaryLoading(true); setSummaryError(uiError(''));
    dashboardGet<DashboardSummary>('/api/dashboard/summary', undefined, controller.signal)
      .then(data => { if (!controller.signal.aborted) setSummary(data); })
      .catch(error => { if (!controller.signal.aborted) setSummaryError(uiError(error.message)); })
      .finally(() => { if (!controller.signal.aborted) setSummaryLoading(false); });
    return () => controller.abort();
  }, [refresh]);
  useEffect(() => {
    const controller = new AbortController(); setAnalyticsLoading(true); setAnalyticsError(uiError(''));
    setAnalytics(previous => previous && (previous.range !== range || (deviceId && previous.device?.id !== deviceId)) ? null : previous);
    dashboardGet<DashboardAnalytics>('/api/dashboard/analytics', { range, ...(deviceId ? { deviceId } : {}) }, controller.signal)
      .then(data => { if (!controller.signal.aborted) setAnalytics(data); })
      .catch(error => { if (!controller.signal.aborted) setAnalyticsError(uiError(error.message)); })
      .finally(() => { if (!controller.signal.aborted) setAnalyticsLoading(false); });
    return () => controller.abort();
  }, [range, deviceId, refresh]);
  useEffect(() => {
    const update = () => { if (document.visibilityState === 'visible') setRefresh(value => value + 1); };
    const device = (event: Event) => { setDeviceId((event as CustomEvent<{ id: string }>).detail.id); document.getElementById('kaynak-kullanimi')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
    const incident = (event: Event) => setIncidentId((event as CustomEvent<{ id: string }>).detail.id);
    const timer = window.setInterval(update, 60000);
    document.addEventListener('visibilitychange', update); window.addEventListener('dashboard:device', device); window.addEventListener('dashboard:incident', incident);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', update); window.removeEventListener('dashboard:device', device); window.removeEventListener('dashboard:incident', incident); };
  }, []);
  useEffect(() => {
    if (manualRefresh.current && !summaryLoading && !analyticsLoading) {
      setAnnouncement(summaryError || analyticsError ? 'Bazı veriler yenilenemedi.' : 'Dashboard verileri yenilendi.'); manualRefresh.current = false;
    }
  }, [summaryLoading, analyticsLoading, summaryError, analyticsError]);
  const exportCsv = useCallback(() => {
    if (!analytics?.points.some(point => point.samples > 0)) { setAnnouncement('Seçilen zaman aralığında indirilecek ölçüm yok.'); return; }
    const csv = ['Zaman;CPU ortalama (%);CPU zirve (%);Bellek ortalama (%);Bellek zirve (%);Ölçüm sayısı', ...analytics.points.map(point => [point.at, point.cpu, point.cpuPeak, point.memory, point.memoryPeak, point.samples].join(';'))].join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `infrascope-${(analytics.device?.name || 'kaynak').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)}-${analytics.range}.csv`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setAnnouncement('Kaynak kullanım raporu indirildi.');
  }, [analytics]);

  const retry = () => { manualRefresh.current = true; setAnnouncement('Veriler yenileniyor.'); setRefresh(value => value + 1); };
  const nms = summary?.integrations.find(item => item.key === 'NMS');
  const latest = analytics?.latest[metric];
  const hasPoints = analytics?.points.some(point => point[metric] !== null);
  const lastPolled = analytics?.device?.lastPolledAt;
  const fresh = Boolean(lastPolled && Date.now() - new Date(lastPolled).getTime() < 600000);
  const flowLabel = analyticsError ? 'Veri yenilenemedi' : analyticsLoading && !analytics ? 'Yükleniyor' : !analytics?.device ? 'Henüz veri yok' : !analytics.device.pollingEnabled ? 'İzleme kapalı' : fresh ? 'NMS / SNMP veri alıyor' : 'NMS verisi gecikmiş';

  if (summaryLoading && !summary) return <DashboardLoading />;
  if (!summary) return <section className={styles.canvas}><div className={styles.card}><Empty><CircleAlert size={32} /><h1 className="font-semibold">Genel bakış yüklenemedi</h1><p>{summaryError || 'Özet veriler şu anda kullanılamıyor.'}</p><button className={styles.primary} onClick={retry}>Tekrar dene</button></Empty></div></section>;
  const coverage = summary.coverage;

  return <div className={styles.canvas}>
    <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
    <header className={styles.heading}>
      <div><h1 className={styles.title}>Altyapınıza genel bakış</h1><p className={styles.subtitle}>Ağ ve güvenlik hizmetlerinizin güncel durumu, performansı ve önemli olaylar.</p></div>
      <div className={styles.overview}>
        <Link href="/integrations/nms/devices" className={styles.stat}><span className={styles.badgeIcon}><Monitor size={20} /></span><div><strong>{coverage.monitored}<span className="text-[15px] font-medium"> / {coverage.total}</span></strong><small>İzlenen cihaz</small></div></Link>
        <Link href="/dashboard/alerts?status=OPEN%2CACKNOWLEDGED" className={styles.stat}><span className={styles.badgeIcon} style={{ background: '#fff6e7', color: '#bb790f' }}><TriangleAlert size={20} /></span><div><strong>{summary.incidents.total}</strong><small>Açık olay</small></div></Link>
        <Link href="/dashboard/alerts?severity=ALARM_CRITICAL&status=OPEN%2CACKNOWLEDGED" className={styles.stat}><span className={styles.badgeIcon} style={{ background: '#fff0f3', color: '#df4263' }}><CircleAlert size={20} /></span><div><strong>{summary.incidents.critical}</strong><small>Kritik</small></div></Link>
      </div>
      <div className={styles.dateBlock}><div className="flex items-center justify-end gap-2"><time dateTime={summary.generatedAt}>{new Date(summary.generatedAt).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time><button className={styles.more} onClick={retry} disabled={summaryLoading || analyticsLoading} aria-label="Genel bakış verilerini yenile"><RefreshCcw size={14} className={cn((summaryLoading || analyticsLoading) && 'animate-spin motion-reduce:animate-none')} /></button></div><span className={styles.sourcePill}>Veritabanı özeti · {relativeLabel(summary.generatedAt)}</span></div>
    </header>
    {summaryError && <div role="alert" className={styles.error}><span>Özet yenilenemedi. {new Date(summary.generatedAt).toLocaleTimeString('tr-TR')} tarihli son başarılı görünüm gösteriliyor.</span><button onClick={retry}>Tekrar dene</button></div>}
    <div className={styles.hero}>
      <section className={cn(styles.card, styles.resource)} id="kaynak-kullanimi" aria-labelledby="resource-title">
        <div className={styles.cardHeader}><div className={styles.cardHeading}><span className={styles.badgeIcon}><HardDrive size={21} strokeWidth={1.7} /></span><div><h2 id="resource-title" className={styles.cardTitle}>Kaynak kullanımı</h2><p className={styles.cardDescription}>Seçili cihazın kayıtlı kaynak kullanım geçmişi.</p></div></div>
          <div className={styles.chartControls}><div className={styles.segmented} role="group" aria-label="Kaynak ölçümü"><button className={styles.segment} aria-pressed={metric === 'cpu'} onClick={() => setMetric('cpu')}>CPU</button><button className={styles.segment} aria-pressed={metric === 'memory'} onClick={() => setMetric('memory')}>Bellek</button></div><select className={styles.select} aria-label="Grafik zaman aralığı" value={range} onChange={event => setRange(event.target.value as DashboardRange)}><option value="6h">Son 6 saat</option><option value="24h">Son 24 saat</option><option value="7d">Son 7 gün</option></select></div>
        </div>
        {analyticsError && <div role="alert" className={cn(styles.error, 'mt-3')}><span>{uiError(analyticsError)}{analytics ? ` Son başarılı kayıt: ${new Date(analytics.generatedAt).toLocaleTimeString('tr-TR')}.` : ''}</span><button onClick={retry} aria-label="Kaynak verilerini tekrar yükle"><RefreshCcw size={14} /></button></div>}
        {analyticsLoading && !analytics ? <Empty><LoaderCircle size={22} className="animate-spin motion-reduce:animate-none" /><span>Kaynak verileri yükleniyor…</span></Empty> : !analytics?.device ? <Empty><Activity size={30} /><span>{analyticsError ? 'Kaynak verileri kullanılamıyor.' : 'İzlemeye alınmış bir NMS cihazı yok.'}</span><Link href="/integrations/nms/devices" className={styles.textLink}>Cihazları aç <ArrowRight size={14} /></Link></Empty> : <>
          <div className={styles.measurement}><div><strong>{percentLabel(latest?.value)}</strong><p>{metric === 'cpu' ? 'Son CPU ölçümü' : 'Son bellek ölçümü'} · {relativeLabel(latest?.at || null)}</p><select className={styles.deviceSelect} aria-label="Kaynak grafiği cihazı" value={analytics.device.id} onChange={event => setDeviceId(event.target.value)}>{!analytics.devices.some(item => item.id === analytics.device?.id) && <option value={analytics.device.id}>{analytics.device.name}</option>}{analytics.devices.map(item => <option key={item.id} value={item.id}>{item.name}{item.pollingEnabled ? '' : ' · İzleme kapalı'}</option>)}</select></div>
            <button className={styles.more} aria-label="Kaynak kullanım raporunu indir" onClick={exportCsv}><Download size={16} /></button></div>
          {hasPoints ? <ResourceBars analytics={analytics} metric={metric} /> : <Empty>Bu zaman aralığında {metric === 'cpu' ? 'CPU' : 'bellek'} ölçümü yok.</Empty>}
          <div className={styles.chartNote}><span><i className={styles.legendDot} style={{ background: 'var(--dash-green-mid)' }} />Ortalama</span><span><i className={styles.legendDot} style={{ background: 'var(--dash-peak)' }} />Zirve</span><span>Boş aralıklar: veri yok</span></div>
        </>}
      </section>
      <section className={styles.card} aria-labelledby="coverage-title"><div className={styles.cardHeader}><div className={styles.cardHeading}><span className={styles.badgeIcon}><Radio size={21} strokeWidth={1.7} /></span><div><h2 className={styles.cardTitle} id="coverage-title">İzleme kapsamı</h2><p className={styles.cardDescription}>Ağ cihazlarınızın izlenme durumu.</p></div></div><Menu label="İzleme kapsamı seçenekleri"><Link href="/integrations/nms/devices" className="block rounded-lg p-2 hover:bg-muted">NMS cihazlarını aç</Link><Link href="/devices" className="block rounded-lg p-2 hover:bg-muted">Tüm envanteri aç</Link></Menu></div>
        <CoveragePlot monitored={coverage.monitored} total={coverage.total} /><div className={styles.coverageLegend}><div><strong><i className={styles.legendDot} style={{ background: 'var(--dash-green)', width: 13, height: 13, marginRight: 10 }} />{coverage.monitored}</strong><small className="ml-6">İzlenen</small></div><div><strong><i className={styles.legendDot} style={{ background: 'var(--dash-peak)', width: 13, height: 13, marginRight: 10 }} />{coverage.unmonitored}</strong><small className="ml-6">İzleme kapalı</small></div></div>
        {(coverage.stale > 0 || coverage.unknown > 0) && <p className={cn(styles.cardDescription, 'mt-3 text-center')}>{coverage.stale} cihazın verisi gecikmiş · {coverage.unknown} cihazdan henüz veri yok</p>}
      </section>
    </div>
    <div className={styles.secondary}>
      <section className={styles.card} aria-labelledby="incidents-title"><div className={styles.cardHeader}><div className={styles.cardHeading}><span className={styles.badgeIcon} style={{ background: '#fff5e3', color: '#bf8117' }}><TriangleAlert size={22} /></span><div><h2 className={styles.cardTitle} id="incidents-title">Öncelikli olaylar</h2><p className={styles.cardDescription}>Müdahale gerektiren güncel olaylar.</p></div></div><Menu label="Öncelikli olay seçenekleri"><Link href="/dashboard/alerts?status=OPEN%2CACKNOWLEDGED" className="block rounded-lg p-2 hover:bg-muted">Olay yönetimini aç</Link></Menu></div>
        {summary.incidents.items.length === 0 ? <Empty><CheckCheck size={26} className="text-primary" /><span>Öncelikli açık olay yok.</span></Empty> : <div className="overflow-x-auto"><table className={styles.incidentTable}><thead><tr><th scope="col">Cihaz / Kaynak</th><th scope="col">Olay açıklaması</th><th scope="col">Öncelik</th><th scope="col">Durum</th><th scope="col">Son değer</th><th scope="col">İşlem</th></tr></thead><tbody>{summary.incidents.items.map(item => <tr key={item.id}>
          <td><div className="flex items-center gap-2"><TriangleAlert size={16} className="shrink-0 text-amber-600" /><div><p className={styles.incidentDevice} title={item.deviceName || item.title}>{item.deviceName || item.source}</p><p className={cn(styles.cardDescription, 'text-[9px]')}>{item.managementIp || item.code}</p></div></div></td>
          <td>{incidentLabel(item.code, item.title)}</td><td><IncidentSeverityBadge value={item.severity} /></td><td><IncidentStatusBadge value={item.status} /></td><td className="whitespace-nowrap">{percentLabel(item.value)}<span className={styles.cardDescription}> · {item.occurrenceCount} tekrar</span></td><td><button className={styles.primary} onClick={() => setIncidentId(item.id)} aria-label={`${item.deviceName || item.title} olayını incele`}>İncele</button></td>
        </tr>)}</tbody></table></div>}
        <div className={styles.tableFooter}><Link className={styles.textLink} href="/dashboard/alerts?status=OPEN%2CACKNOWLEDGED">Tüm olayları görüntüle <ArrowRight size={16} /></Link></div>
      </section>
      <section className={styles.card} aria-labelledby="flow-title"><div className={styles.cardHeader}><div className={styles.cardHeading}><span className={styles.badgeIcon}><TrendingUp size={21} /></span><div><h2 className={styles.cardTitle} id="flow-title">Veri akışı</h2><p className={styles.cardDescription}>Seçili cihazın kayıtlı CPU ve bellek verisi.</p></div></div><span className={styles.flowStatus} style={!fresh || Boolean(analyticsError) || !analytics?.device?.pollingEnabled ? { background: '#fff5e3', color: '#9a670c' } : undefined}><Activity size={10} aria-hidden="true" />{flowLabel}</span></div>
        {analytics?.device ? (['cpu', 'memory'] as const).map(key => <div className={styles.flowRow} key={key}><div><h3>{key === 'cpu' ? 'CPU' : 'Bellek'}</h3>{analytics.points.some(point => point[key] !== null) ? <ResourceSparkline analytics={analytics} metric={key} /> : <p className={cn(styles.cardDescription, 'py-3')}>Bu aralıkta ölçüm yok.</p>}</div><div className={styles.flowValue}><strong>{percentLabel(analytics.latest[key]?.value)}</strong><small>{relativeLabel(analytics.latest[key]?.at || null)}</small></div></div>) : <Empty>{analyticsLoading ? 'Ölçümler yükleniyor…' : 'Ölçüm verisi kullanılamıyor.'}</Empty>}
        {analyticsError && <p className={cn(styles.cardDescription, 'mt-2 text-amber-700')}>Son başarılı görünüm. Yeni veriler alınamadı.</p>}
      </section>
    </div>
    <section className={cn(styles.card, styles.integrationCard)} aria-labelledby="integrations-title"><div className={styles.cardHeader}><div className={styles.cardHeading}><span className={styles.badgeIcon}><Link2 size={21} /></span><div><h2 className={styles.cardTitle} id="integrations-title">Entegrasyon durumu</h2><p className={styles.cardDescription}>Harici sistemlerinizle entegrasyon durumu.</p></div></div><Link href="/integrations/status" className={styles.textLink}><span className={styles.badgeIcon} style={{ width: 27, height: 27 }}><Plus size={16} /></span><span className="hidden sm:inline">Entegrasyon ekle</span></Link></div>
      <div className={styles.integrations}>{summary.integrations.filter(item => item.key !== 'NMS').map(item => <Link key={item.key} href={item.href} className={styles.integration}><Image src={item.key === 'VMWARE_VCENTER' ? '/images/dashboard/vmware-icon.svg' : '/images/dashboard/fortinet-icon.svg'} alt="" width={32} height={23} className={styles.integrationLogo} /><strong>{item.name}</strong><small><i className={styles.legendDot} style={{ background: item.state === 'healthy' ? 'var(--dash-green)' : item.state === 'unconfigured' ? '#adb6c2' : '#e6a539' }} />{stateLabels[item.state]}</small><ChevronRight size={15} className="shrink-0 text-slate-400" /></Link>)}</div>
    </section>
    <div className={styles.footerNote}><span>{nms?.state === 'healthy' ? 'NMS / SNMP · Son başarılı veri ' : 'NMS / SNMP · '}{relativeLabel(nms?.lastSyncAt || null)} · {coverage.fresh} cihazdan son 10 dakikada veri alındı.</span><button className={styles.textLink} onClick={retry} disabled={summaryLoading || analyticsLoading}><RefreshCcw size={12} />Yenile</button></div>
    <IncidentDetail id={incidentId} onClose={() => setIncidentId(null)} />
  </div>;
}
