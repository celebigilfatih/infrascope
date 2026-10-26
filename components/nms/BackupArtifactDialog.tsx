'use client';
import { useEffect, useRef, useState } from 'react';
import { Archive, ArrowDownToLine, CheckCircle2, FileCode2, Info, Loader2, RotateCcw, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { backupAge, backupDate, backupDownloadName, backupSize, backupTypeLabel } from '@/lib/nms/backup-view';

export interface BackupArtifact {
  id: string; device_name: string; backup_type: string; file_name: string;
  file_size: number; created_at: string; archived: boolean; description?: string | null;
}
export function BackupArtifactDialog({ backup, canDownload, onClose }: { backup: BackupArtifact | null; canDownload: boolean; onClose: () => void }) {
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => { setState('idle'); setError(''); return () => { request.current?.abort(); request.current = null; }; }, [backup?.id]);
  const download = async () => {
    if (!backup || !canDownload || state === 'loading') return;
    const controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 20000);
    setState('loading'); setError('');
    try {
      const response = await fetch(`/api/integrations/nms/backups/${encodeURIComponent(backup.id)}?action=download`, { signal: controller.signal, cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) {
        const message = response.status === 401 ? 'Oturumunuz sona ermiş. Yeniden giriş yapın.' : response.status === 403 ? 'Yedek indirme yetkiniz yok.' : response.status === 404 ? 'Yedek bulunamadı. Listeyi yenileyin.' : response.status === 409 ? 'Yedeğin şifresi çözülemedi veya bütünlüğü doğrulanamadı.' : 'Dosya indirilemedi. Tekrar deneyin.';
        throw new Error(message);
      }
      if (!response.headers.get('content-type')?.startsWith('text/plain')) throw new Error('Beklenen yapılandırma dosyası alınamadı. Oturumunuzu kontrol edin.');
      const blob = await response.blob();
      if (!blob.size) throw new Error('Yedek dosyası boş. Başka bir yedek seçin.');
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = backupDownloadName(backup.file_name); anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setState('success');
    } catch (cause) {
      if (request.current !== controller) return;
      setError(controller.signal.aborted ? 'İndirme zaman aşımına uğradı. Tekrar deneyin.' : cause instanceof TypeError ? 'Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.' : cause instanceof Error ? cause.message : 'Dosya indirilemedi. Tekrar deneyin.');
      setState('error');
    } finally { clearTimeout(timeout); }
  };
  return <Dialog open={!!backup} onOpenChange={open => { if (!open) { request.current?.abort(); request.current = null; onClose(); } }}>
    <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><FileCode2 size={20} className="text-primary" />Yedek ayrıntıları</DialogTitle><DialogDescription>Dosyayı indirin ve cihazınıza uygun geri yükleme adımlarını inceleyin.</DialogDescription></DialogHeader>
      {backup && <><div className="min-w-0 rounded-xl border border-border bg-muted/20 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="break-all font-semibold">{backup.device_name}</h3><SemanticBadge tone={backup.archived ? 'neutral' : 'info'} icon={backup.archived ? Archive : FileCode2}>{backup.archived ? 'Arşiv yedeği' : 'Kayıtlı yedek'}</SemanticBadge></div><p className="mt-2 break-all font-mono text-xs text-muted-foreground">{backup.file_name}</p><dl className="mt-4 grid gap-4 text-xs sm:grid-cols-2"><div><dt className="text-muted-foreground">Yedek türü</dt><dd className="mt-1">{backupTypeLabel(backup.backup_type)}</dd></div><div><dt className="text-muted-foreground">Dosya boyutu</dt><dd className="mt-1">{backupSize(backup.file_size)}</dd></div><div className="sm:col-span-2"><dt className="text-muted-foreground">Başarılı yedekleme zamanı</dt><dd className="mt-1">{backupDate(backup.created_at)} · {backupAge(backup.created_at)}</dd></div></dl>{backup.description && <p className="mt-4 wrap-break-word text-xs text-muted-foreground">{backup.description}</p>}</div>
      <section aria-labelledby="restore-guide-title" className="space-y-3"><h3 id="restore-guide-title" className="flex items-center gap-2 text-sm font-semibold"><RotateCcw size={16} className="text-primary" />Cihaza geri yükleme</h3><p className="flex items-start gap-2 rounded-lg border border-border bg-muted/20 p-3 text-xs leading-relaxed"><Info size={16} className="mt-0.5 shrink-0 text-primary" />InfraScope otomatik geri yükleme yapmaz. İndirdiğiniz yapılandırma, üreticinin desteklediği yöntemle cihaz üzerinde uygulanır.</p>
      <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer text-xs font-medium text-foreground focus-visible:outline-primary">Geri yükleme adımlarını göster</summary><ol className="ml-5 mt-3 list-decimal space-y-2 text-xs leading-relaxed text-muted-foreground"><li>Cihaz adını, yedek tarihini ve yapılandırma türünü kontrol edin. Model ve yazılım sürümüyle uyumluluğunu doğrulayın.</li><li>Dosyayı indirin; mevcut yapılandırmanın ayrıca yedeğini alın.</li><li>Bakım zamanında üreticinin geri yükleme yönergesini izleyin. Erişim kesintisine karşı konsol erişimini hazır tutun.</li><li>Uyguladıktan sonra bağlantıları ve yapılandırmayı doğrulayın. Bu ekrandaki indirme, geri yüklemenin tamamlandığı anlamına gelmez.</li></ol>
      {backup.archived && <p className="text-xs leading-relaxed text-muted-foreground">Bu cihaz envanterden kaldırılmış. Arşiv dosyasını kullanmadan önce hedef cihazı ayrıca doğrulayın.</p>}</details><p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><ShieldCheck size={14} className="mt-0.5 shrink-0" />İndirme sırasında dosya bütünlüğü sunucuda kontrol edilir. Dosya cihaz erişim bilgileri içerebilir; güvenli bir yerde saklayın. Sertifika ve harici dosyalar ayrıca gerekebilir.</p></section>
      {!canDownload && <p className="text-xs text-muted-foreground">Yedek içeriğini indirmek için yönetici veya operatör yetkisi gerekir.</p>}
      {state === 'error' && <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-xs text-destructive"><TriangleAlert size={16} className="shrink-0" />{error}</p>}
      {state === 'success' && <p role="status" className="flex items-center gap-2 text-xs text-primary"><CheckCircle2 size={16} />Dosya tarayıcıya iletildi. İndirmelerinizi kontrol edin.</p>}
      <DialogFooter><Button variant="outline" onClick={() => { request.current?.abort(); request.current = null; onClose(); }}>Kapat</Button>{canDownload && <Button disabled={state === 'loading'} className="gap-2" onClick={() => void download()}>{state === 'loading' ? <Loader2 size={16} className="animate-spin" /> : <ArrowDownToLine size={16} />}{state === 'loading' ? 'Dosya hazırlanıyor…' : 'Dosyayı indir'}</Button>}</DialogFooter></>}
    </DialogContent>
  </Dialog>;
}
