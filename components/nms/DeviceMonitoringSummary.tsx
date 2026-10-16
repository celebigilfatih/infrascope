'use client';

import Link from 'next/link';
import { Activity, ArrowUpRight, Cable, Clock3, Cpu, Info, Pencil, Radio, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { absoluteTime, pollingSeconds, type NmsDevice } from '@/lib/nms/device-monitoring-view';
import { LastPoll, MonitoringState, PortIssues, Reachability, Resources } from './MonitoringSignals';
import styles from './DeviceMonitoringSummary.module.css';

export function DeviceMonitoringSummary({ device, open, onOpenChange, now, loadedAt, loadFailed }: { device: NmsDevice | null; open: boolean; onOpenChange: (open: boolean) => void; now: number; loadedAt: number | null; loadFailed: boolean }) {
  const threshold = pollingSeconds(device?.pollingInterval ?? null) * 2.5;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-2xl" closeLabel="Ölçüm özetini kapat"><DialogHeader><DialogTitle className="flex items-center gap-2"><span className={styles.icon}><Activity size={19} /></span>Ölçüm özeti</DialogTitle><DialogDescription>Cihaz erişimi, izleme ayarı ve ölçüm zamanlarını birlikte inceleyin.</DialogDescription></DialogHeader>{device ? <>
    <div className={styles.identity}><h3>{device.name}</h3><code>{device.managementIp || 'Yönetim IP’si belirtilmemiş'}</code><small>NMS cihaz kimliği: {device.nmsDeviceId}</small></div>
    {loadFailed && <p role="alert" className={styles.notice}>Son yenileme başarısız. Önceki yüklemede alınan kayıtlar gösteriliyor.</p>}
    <div className={styles.signals}><section><h4><Activity size={15} />Erişim kaydı</h4><Reachability device={device} now={now} /></section><section><h4><Radio size={15} />İzleme ayarı</h4><MonitoringState device={device} /></section><section><h4><Clock3 size={15} />Son veri alımı</h4><LastPoll device={device} now={now} /></section></div>
    <p className={styles.note}><Info size={15} />Erişim göstergesi kayıtlı son veri alımına dayanır. Gecikme, ağ kesintisini tek başına doğrulamaz. İzleme kapalıyken eski ölçümler saklanır.</p>
    <div className={styles.measurements}><section><h4><Cpu size={15} />Son kaynak ölçümü</h4><Resources device={device} now={now} /><p className={styles.note}>CPU ve bellek aynı kaynak ölçümünün zamanıyla değerlendirilir. “—” ölçüm bulunmadığını veya değerin geçersiz olduğunu gösterir.</p></section><section><h4><Cable size={15} />Port kayıtları</h4><PortIssues device={device} /><p className={styles.note}>Kapalı port sayısı alarm sayısı değildir. Kayıt dönmemesi tüm portların açık veya izleniyor olduğu anlamına gelmez.</p></section></div>
    <dl className={styles.facts}><div><dt>Veri gecikmesi eşiği</dt><dd>{threshold >= 60 ? `${(threshold / 60).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} dk` : `${threshold} sn`} <small>(izleme aralığının 2,5 katı)</small></dd></div><div><dt>Listenin son alınma zamanı</dt><dd>{loadedAt ? `${absoluteTime(new Date(loadedAt).toISOString())} TSİ` : 'Bilinmiyor'}</dd></div></dl>
    <footer className={styles.actions}><Button variant="outline" asChild><Link href={`/integrations/nms/devices/${device.id}/edit`}><Pencil size={15} />İzleme ayarları</Link></Button><Button asChild><Link href={`/integrations/nms/devices/${device.id}`}><Server size={15} />Cihaz ayrıntıları<ArrowUpRight size={15} /></Link></Button></footer>
  </> : <p className={styles.note}>Cihaz artık bu listede bulunmuyor. Listeyi yenileyip yeniden seçin.</p>}</DialogContent></Dialog>;
}
