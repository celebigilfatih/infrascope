'use client';

import { useRef, useState } from 'react';
import { CheckCircle2, FileUp, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import type { FirewallDetail } from './types';

type Props = {
  connectorId: string;
  tls: FirewallDetail['tls'];
  onUpdated: () => Promise<void> | void;
};

async function readJson(response: Response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  return data;
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' }).format(new Date(value));
}

export function FirewallTrustedCaCard({ connectorId, tls, onUpdated }: Props) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function upload() {
    if (!selectedFile) return;
    setBusy(true);
    try {
      const formData = new FormData();
      formData.set('certificate', selectedFile);
      await fetch(`/api/firewalls/${connectorId}/tls-ca`, { method: 'POST', body: formData }).then(readJson);
      setSelectedFile(null);
      if (inputRef.current) inputRef.current.value = '';
      await onUpdated();
      toast({ title: 'CA zinciri kaydedildi', description: 'FortiGate REST bağlantısı otomatik olarak yeniden kontrol edildi.' });
    } catch (error) {
      toast({ title: 'CA dosyası yüklenemedi', description: error instanceof Error ? error.message : 'Bilinmeyen hata.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await fetch(`/api/firewalls/${connectorId}/tls-ca`, { method: 'DELETE' }).then(readJson);
      setConfirmOpen(false);
      await onUpdated();
      toast({ title: 'Özel CA zinciri kaldırıldı', description: 'Sistem sertifika güvenini yeniden değerlendirdi.' });
    } catch (error) {
      toast({ title: 'CA zinciri kaldırılamadı', description: error instanceof Error ? error.message : 'Bilinmeyen hata.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="p-4" aria-labelledby="firewall-ca-title">
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"><ShieldCheck className="h-5 w-5" aria-hidden="true" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="firewall-ca-title" className="text-sm font-semibold">FortiGate REST sertifika güveni</h2>
            {tls.configured && <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" />Özel CA kayıtlı</span>}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">FortiGate HTTPS sertifikasını imzalayan kök veya ara CA zincirini yükleyin. Dosya yalnız bu firewall için saklanır; global TLS bypass kullanılmaz.</p>

          {tls.configured && (
            <div className="mt-3 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <p>{tls.summary ? `${tls.summary.certificateCount} CA sertifikası · En yakın bitiş: ${formatDate(tls.summary.validUntil)}` : 'CA zinciri kayıtlı; sertifika özeti doğrulanamadı.'}</p>
              {tls.updatedAt && <p className="mt-1">Son güncelleme: {formatDate(tls.updatedAt)}</p>}
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              ref={inputRef}
              id="fortigate-ca-file"
              type="file"
              accept=".pem,.crt,application/x-pem-file,application/pkix-cert"
              aria-label="FortiGate CA sertifika zinciri dosyası"
              className="h-10 text-xs"
              disabled={busy}
              onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
            />
            <Button type="button" size="sm" onClick={upload} disabled={!selectedFile || busy} className="shrink-0">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" /> : <FileUp className="mr-2 h-4 w-4" />}
              CA yükle ve kontrol et
            </Button>
            {tls.configured && <Button type="button" size="sm" variant="outline" onClick={() => setConfirmOpen(true)} disabled={busy} aria-label="Özel CA zincirini kaldır"><Trash2 className="h-4 w-4" /></Button>}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">PEM veya CRT biçiminde en fazla 10 CA sertifikası yükleyin. Özel anahtar ve cihaz sertifikası kabul edilmez.</p>
        </div>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Özel CA zinciri kaldırılsın mı?"
        description="Bu işlem yalnızca bu FortiGate için kaydedilen CA zincirini kaldırır. REST erişimi sistem sertifika deposuna göre yeniden değerlendirilir."
        confirmText="CA zincirini kaldır"
        variant="destructive"
        onConfirm={() => void remove()}
      />
    </section>
  );
}
