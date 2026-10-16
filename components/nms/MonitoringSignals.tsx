'use client';

import Link from 'next/link';
import { Cable, CircleHelp, Clock3, Cpu, MemoryStick, PauseCircle, Radio, Wifi, WifiOff, type LucideIcon } from 'lucide-react';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { absoluteTime, dataFreshness, formatInterval, formatRelative, measuredPercent, observationTime, type NmsDevice } from '@/lib/nms/device-monitoring-view';
import styles from './MonitoringSignals.module.css';

export function Reachability({ device, now }: { device: NmsDevice; now: number }) {
  const freshness = dataFreshness(device.lastPolledAt, device.pollingInterval, now);
  if (!device.pollingEnabled) return <div className={styles.signal}><SemanticBadge tone="neutral" icon={CircleHelp}>Doğrulanmıyor</SemanticBadge><small>İzleme kapalı</small></div>;
  return <div className={styles.signal}><SemanticBadge tone={freshness === 'fresh' ? 'success' : freshness === 'delayed' ? 'warning' : 'neutral'} icon={freshness === 'fresh' ? Wifi : freshness === 'delayed' ? WifiOff : CircleHelp}>{freshness === 'fresh' ? 'Yanıt kaydı güncel' : freshness === 'delayed' ? 'Yanıt gecikiyor' : 'Bilinmiyor'}</SemanticBadge><small>{freshness === 'delayed' ? 'Kesinti doğrulanmadı' : freshness === 'future' || freshness === 'invalid' ? 'Ölçüm tarihi doğrulanamıyor' : freshness === 'fresh' ? 'Son veri alımına göre' : 'Henüz geçerli veri yok'}</small></div>;
}
export function MonitoringState({ device }: { device: NmsDevice }) {
  const version = device.snmpVersion?.replace(/^v/i, '');
  return <div className={styles.signal}><SemanticBadge tone={device.pollingEnabled ? 'info' : 'neutral'} icon={device.pollingEnabled ? Radio : PauseCircle}>{device.pollingEnabled ? 'İzleme açık' : 'İzleme kapalı'}</SemanticBadge><small>{formatInterval(device.pollingInterval)}</small><small>{version ? `SNMPv${version} · Port ${device.snmpPort ?? 161}` : 'SNMP sürümü belirtilmemiş'}</small></div>;
}
export function LastPoll({ device, now }: { device: NmsDevice; now: number }) {
  const observation = observationTime(device.lastPolledAt, now);
  return <div className={styles.signal}><span className={styles.relative}>{formatRelative(device.lastPolledAt, now)}</span>{observation.time !== null && <time dateTime={device.lastPolledAt!}>{absoluteTime(device.lastPolledAt)} TSİ</time>}{!device.pollingEnabled && <small>İzleme kapalı · kayıtlı son veri</small>}</div>;
}
export function Resources({ device, now }: { device: NmsDevice; now: number }) {
  const health = device.latestHealth;
  const freshness = dataFreshness(health?.collectedAt, device.pollingInterval, now);
  if (!health) return <span className={styles.empty}>Kaynak ölçümü yok</span>;
  return <div className={styles.resources}><ResourceMeter label="CPU" icon={Cpu} value={health.cpuUsage} /><ResourceMeter label="Bellek" icon={MemoryStick} value={health.memoryUsage} /><small className={styles.measurement}><Clock3 size={12} aria-hidden="true" />{!device.pollingEnabled ? 'İzleme kapalı · son ölçüm' : freshness === 'fresh' ? 'Ölçüm güncel' : freshness === 'delayed' ? 'Ölçüm eski' : 'Ölçüm tarihi belirsiz'}</small><time dateTime={Number.isFinite(Date.parse(health.collectedAt)) ? health.collectedAt : undefined}>{absoluteTime(health.collectedAt)}{Number.isFinite(Date.parse(health.collectedAt)) ? ' TSİ' : ''}</time></div>;
}
export function ResourceMeter({ label, icon: Icon, value }: { label: string; icon: LucideIcon; value: number | null }) {
  const percent = measuredPercent(value);
  return <div className={styles.resourceMeter}><div className={styles.resourceValue}><span><Icon size={13} aria-hidden="true" />{label}</span><strong>{percent !== null ? `%${Math.round(percent)}` : '—'}</strong></div><div aria-hidden="true" className={styles.track}>{percent !== null && <span className={percent >= 90 ? styles.high : percent >= 75 ? styles.elevated : undefined} style={{ width: `${percent}%` }} />}</div></div>;
}
export function PortIssues({ device }: { device: NmsDevice; now?: number }) {
  if (!Number.isInteger(device.portDownCount) || device.portDownCount < 0) return <span className={styles.empty}>Port bilgisi yok</span>;
  if (!device.portDownCount) return <span className={styles.empty}>Kapalı port kaydı yok</span>;
  return <Link href={`/integrations/nms/devices/${device.id}`} className={styles.portLink} aria-label={`${device.name}: ${device.portDownCount} kapalı port kaydını görüntüle`} title="Yönetim durumu açık, çalışma durumu kapalı port kayıtları. Güncellik ve izleme kapsamını cihaz ayrıntılarından kontrol edin."><Cable size={14} aria-hidden="true" />{device.portDownCount} kapalı port</Link>;
}
