'use client';
import { useState } from 'react';
import { Archive, CalendarClock, Clock3, Search, Server, Settings2 } from 'lucide-react';
import { backupAge, backupCoverage, backupDate, backupTypeLabel, type BackupCoverageDevice } from '@/lib/nms/backup-view';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import styles from './BackupCoverage.module.css';

export function BackupCoverage({ devices, loading, stale, onFiles, onPolicy }: {
  devices: BackupCoverageDevice[]; loading: boolean; stale: boolean;
  onFiles: (id: number) => void; onPolicy: (id: number) => void;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [limit, setLimit] = useState(12);
  const now = Date.now();
  const matches = devices.filter(device => device.name.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR')) && (filter !== 'attention' || backupCoverage(device, now).attention));
  return <section aria-labelledby="coverage-heading" className={styles.coverage}>
    <header className={styles.header}><div><h2 id="coverage-heading"><Server size={18} />Cihazların yedek durumu</h2><p>Son başarılı yedek, tüm kayıtlar üzerinden gösterilir. Güncellik, zamanlamadaki yedek türüne ve gecikme eşiğine göre değerlendirilir.</p></div><span className="text-xs text-muted-foreground">{stale ? 'Son alınan bilgiler · güncelliği doğrulanamadı' : `${devices.length} cihaz`}</span></header>
    <div className={styles.toolbar}><div className="relative flex-1"><Search size={16} className="absolute left-3 top-3 text-muted-foreground" aria-hidden="true" /><Input aria-label="Yedek durumu için cihaz ara" className="pl-9" placeholder="Cihaz adıyla ara…" value={search} onChange={e => { setSearch(e.target.value); setLimit(12); }} /></div><select aria-label="Yedek durumunu filtrele" value={filter} onChange={e => { setFilter(e.target.value); setLimit(12); }}><option value="all">Tüm cihazlar</option><option value="attention">Kontrol gerektirenler</option></select></div>
    {loading && !devices.length ? <p className={styles.empty} role="status">Cihazların yedek durumu yükleniyor…</p> : !matches.length ? <p className={styles.empty}>{stale ? 'Cihazların yedek durumu yüklenemedi. Yenilemeyi deneyin.' : devices.length ? 'Bu filtreye uygun cihaz yok.' : 'Yedekleme için kayıtlı cihaz yok.'}</p> : <div className={styles.grid}>{matches.slice(0, limit).map(device => {
      const status = backupCoverage(device, now);
      return <article key={device.id} className={styles.device}><div className={styles.title}><span className={styles.icon}><Server size={18} /></span><h3>{device.name}</h3><SemanticBadge tone={stale ? 'neutral' : status.tone}>{stale ? 'Güncellik bilinmiyor' : status.label}</SemanticBadge></div><dl><div><dt><Clock3 size={14} />Son başarılı yedek (tüm türler)</dt><dd>{backupDate(device.lastSuccessAt)}<small>{backupAge(device.lastSuccessAt, now)}</small></dd></div><div><dt><CalendarClock size={14} />Otomatik yedekleme</dt><dd>{device.policy?.enabled ? `Açık · gecikme eşiği ${device.policy.staleAfterHours} saat` : 'Kapalı · elle yedek alınabilir'}{device.policy?.enabled && <small>{backupTypeLabel(device.policy.backupType || '')}</small>}</dd></div>{device.policy?.enabled && device.lastPolicySuccessAt !== device.lastSuccessAt && <div><dt><Clock3 size={14} />Zamanlanan türün son yedeği</dt><dd>{device.lastPolicySuccessAt === undefined ? 'Bilgi alınamadı' : backupDate(device.lastPolicySuccessAt)}{device.lastPolicySuccessAt && <small>{backupAge(device.lastPolicySuccessAt, now)}</small>}</dd></div>}</dl><div className={styles.actions}><Button size="sm" variant="outline" onClick={() => onFiles(device.id)}><Archive size={14} className="mr-1.5" />Yedekleri gör</Button><Button size="sm" variant="ghost" onClick={() => onPolicy(device.id)}><Settings2 size={14} className="mr-1.5" />Zamanlama</Button></div></article>;
    })}</div>}
    <footer className={styles.footer}><p role="status">{stale && !devices.length ? 'Cihaz sayısı bilinmiyor' : `${Math.min(limit, matches.length)} / ${matches.length} cihaz gösteriliyor`}</p>{matches.length > limit && <Button variant="outline" size="sm" onClick={() => setLimit(limit + 12)}>12 cihaz daha göster</Button>}</footer>
  </section>;
}
