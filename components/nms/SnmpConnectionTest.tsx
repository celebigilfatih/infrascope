'use client';

import { AlertCircle, CheckCircle2, Clock3, Info, Loader2, Plug, RotateCcw, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import type { SnmpTestResult } from '@/lib/nms/add-device-form';
import styles from './SnmpConnectionTest.module.css';

export interface SnmpTestState { status: 'idle' | 'running' | 'success' | 'failure' | 'stale' | 'cancelled'; result?: SnmpTestResult; error?: string }
export function SnmpConnectionTest({ state, ready, onTest, onCancel }: { state: SnmpTestState; ready: boolean; onTest: () => void; onCancel: () => void }) {
  const time = state.result ? new Date(state.result.checkedAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'medium', timeStyle: 'short' }) : null;
  return <section className={styles.panel} aria-labelledby="snmp-test-heading">
    <header><span className={styles.icon}><Plug size={18} /></span><div><h2 id="snmp-test-heading">SNMP bağlantı testi <span>İsteğe bağlı</span></h2><p>Girilen ayarlarla NMS ajanından cihaza salt okuma isteği gönderilir.</p></div></header>
    <div className={styles.action}><Button type="button" variant="outline" className="gap-2" disabled={!ready && state.status !== 'running'} onClick={state.status === 'running' ? onCancel : onTest}>{state.status === 'running' ? <Loader2 size={16} className="animate-spin" /> : <Plug size={16} />}{state.status === 'running' ? 'Testi iptal et' : 'SNMP bağlantısını test et'}</Button>{!ready && state.status !== 'running' && <p>Önce cihazı, yönetim adresini ve SNMP kimlik bilgilerini tamamlayın.</p>}</div>
    <div role="status" aria-live="polite" aria-atomic="true" className={styles.result}>
      {state.status === 'idle' && <p className={styles.note}><Info size={15} />Henüz test yapılmadı. Alanların tamamlanması bağlantının doğrulandığı anlamına gelmez.</p>}
      {state.status === 'running' && <p className={styles.note}><Clock3 size={15} />Cihaz yanıtı bekleniyor… Testin tamamlanması yaklaşık 10 saniye sürebilir.</p>}
      {state.status === 'cancelled' && <p className={styles.note}>Test iptal edildi. Bir sonuç doğrulanmadı; istediğinizde yeniden deneyebilirsiniz.</p>}
      {state.status === 'stale' && <><SemanticBadge tone="warning" icon={RotateCcw}>Ayarlar değişti</SemanticBadge><p className={styles.note}>Önceki sonuç yeni SNMP ayarları için geçerli değil. Yeniden test edin.</p></>}
      {state.status === 'success' && <><SemanticBadge tone="success" icon={CheckCircle2}>SNMP yanıtı alındı</SemanticBadge><p className={styles.note}>Bu ayarlarla test anında yanıt alındı. İzleme ayarları henüz kaydedilmedi.</p>{state.result?.systemName && <p className={styles.name}><Server size={14} />{state.result.systemName}</p>}</>}
      {state.status === 'failure' && <><SemanticBadge tone="warning" icon={AlertCircle}>{state.result ? 'SNMP yanıtı alınamadı' : 'Test tamamlanamadı'}</SemanticBadge><p className={styles.note}>{state.error || 'Yönetim IP adresini, UDP portunu, SNMP sürümünü ve kimlik bilgilerini kontrol edin. NMS ajanının cihaza erişebildiğinden emin olun.'}</p></>}
      {state.result && (state.status === 'success' || state.status === 'failure') && <p className={styles.time}>Test zamanı: {time} TSİ · {state.result.durationMs.toLocaleString('tr-TR')} ms</p>}
    </div>
    <p className={styles.footer}><Info size={14} />Test cihazı kaydetmez ve izlemeyi başlatmaz. SSH erişimi, portların tamamı ve CPU/bellek ölçümleri bu testin kapsamında değildir.</p>
  </section>;
}
