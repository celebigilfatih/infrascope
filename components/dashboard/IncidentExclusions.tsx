'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Exclusion {
  id: string;
  alarmCode: string;
  field: string;
  value: string;
  reason: string | null;
  enabled: boolean;
}

export function IncidentExclusions({ onClose, onReturnFocus }: { onClose: () => void; onReturnFocus: () => void }) {
  const [entries, setEntries] = useState<Exclusion[]>([]);
  const [selected, setSelected] = useState<Exclusion | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [accessError, setAccessError] = useState<401 | 403 | null>(null);
  const [canDelete, setCanDelete] = useState(false);
  const inFlight = useRef(false);
  const accessBlocked = useRef(false);

  const rejectAccess = useCallback((status: 401 | 403, operation: 'load' | 'remove') => {
    accessBlocked.current = true;
    setAccessError(status); setCanDelete(false); setEntries([]); setSelected(null); setNotice(null);
    setError(status === 401 ? 'Oturumunuzun süresi doldu veya oturumunuz geçersiz. Tekrar giriş yapın.'
      : operation === 'load' ? 'Hariç tutma kayıtlarını görüntüleme yetkiniz yok.' : 'Hariç tutma kayıtlarını kaldırma yetkiniz yok.');
  }, []);

  useEffect(() => {
    if (accessBlocked.current) return;
    const controller = new AbortController();
    setLoading(true); setError(null);
    void (async () => {
      // Let effect cleanup cancel a superseded load before sending it, including
      // React Strict Mode's development-only setup/cleanup replay.
      await Promise.resolve();
      if (controller.signal.aborted) return;
      try {
        const response = await fetch('/api/alarms/whitelist?includeDisabled=true', { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (response.status === 401 || response.status === 403) {
          rejectAccess(response.status, 'load');
          return;
        }
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || 'Hariç tutma kayıtları yüklenemedi.');
        if (!controller.signal.aborted) { setEntries(result.data); setCanDelete(result.canDelete === true); }
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof TypeError ? 'Bağlantı kurulamadı. Kayıtları yeniden yükleyin.' : cause instanceof Error ? cause.message : 'Hariç tutma kayıtları yüklenemedi.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [attempt, rejectAccess]);

  const remove = async () => {
    if (!selected || !canDelete || accessBlocked.current || inFlight.current) return;
    const target = selected;
    inFlight.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/alarms/whitelist?id=${encodeURIComponent(target.id)}`, { method: 'DELETE' });
      if (response.status === 401 || response.status === 403) {
        rejectAccess(response.status, 'remove');
        return;
      }
      const result = await response.json();
      if (!response.ok || !result.success) {
        setError(result.error || 'Hariç tutma kaydı kaldırılamadı. Tekrar deneyin.');
        return;
      }
      setEntries(current => current.filter(entry => entry.id !== target.id));
      setSelected(null); setNotice('Hariç tutma kaydı kaldırıldı.');
    } catch {
      setError('Bağlantı kurulamadı. Seçiminiz korundu; tekrar deneyebilirsiniz.');
    } finally { inFlight.current = false; setBusy(false); }
  };

  return <Dialog open onOpenChange={open => { if (!open && !inFlight.current) onClose(); }}>
    <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto" closeLabel="Hariç tutma kayıtlarını kapat" onCloseAutoFocus={event => {
      event.preventDefault(); onReturnFocus();
    }}>
      <DialogHeader>
        <DialogTitle>Hariç tutma kayıtları</DialogTitle>
        <DialogDescription>Kaldırdığınız eşleşmeler için yeni alarmlar yeniden değerlendirilir. Mevcut olay geçmişi korunur.</DialogDescription>
      </DialogHeader>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {!loading && !accessError && entries.length > 0 && !canDelete && <p role="status" className="text-sm text-muted-foreground">Hariç tutma kayıtlarını kaldırma yetkiniz yok.</p>}
      {loading ? <p role="status">Kayıtlar yükleniyor…</p> : <>
        {entries.length ? <div className="max-h-[45vh] overflow-auto rounded-lg border">
          <table className="w-full text-left text-sm" aria-label="Hariç tutma listesi">
            <thead><tr className="border-b bg-muted/50"><th className="p-3">Alarm / eşleşme</th><th className="p-3">Açıklama</th><th className="p-3">İşlem</th></tr></thead>
            <tbody>{entries.map(entry => <tr key={entry.id} aria-selected={selected?.id === entry.id} className={selected?.id === entry.id ? 'border-b bg-muted/50' : 'border-b'}>
              <td className="p-3"><p className="font-medium">{entry.alarmCode}</p><p className="break-all text-muted-foreground">{entry.field}: {entry.value}</p>{!entry.enabled && <p className="text-xs text-muted-foreground">Devre dışı</p>}</td>
              <td className="whitespace-pre-wrap wrap-break-word p-3">{entry.reason || '—'}</td>
              <td className="p-3"><Button variant="outline" size="sm" disabled={busy || !canDelete || !!accessError} onClick={() => { if (accessBlocked.current || !canDelete) return; setSelected(entry); setError(null); setNotice(null); }}>Kaldır</Button></td>
            </tr>)}</tbody>
          </table>
        </div> : !error && <p className="text-sm text-muted-foreground">Gösterilecek hariç tutma kaydı yok.</p>}
        {selected && <section aria-label="Kaldırma onayı" className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">Bu hariç tutma kaydı kaldırılsın mı?</p>
          <p>{selected.alarmCode} · {selected.field}: {selected.value}</p>
          <p className="whitespace-pre-wrap">{selected.reason || 'Açıklama yok.'}</p>
          <p>Yalnızca bu kayıt kaldırılır.</p>
        </section>}
      </>}
      <DialogFooter>
        {accessError === 401 && <Button asChild variant="outline"><Link href="/login?next=%2Fdashboard%2Falerts">Tekrar giriş yap</Link></Button>}
        {!loading && error && !selected && !accessError && <Button variant="outline" onClick={() => { if (!accessBlocked.current) setAttempt(current => current + 1); }}>Yeniden yükle</Button>}
        {selected ? <>
          <Button variant="outline" disabled={busy} onClick={() => { setSelected(null); setError(null); }}>Vazgeç</Button>
          <Button variant="destructive" disabled={busy || !canDelete || !!accessError} onClick={() => void remove()}>{busy ? 'Kaldırılıyor…' : 'Kaldırmayı onayla'}</Button>
        </> : <Button variant="outline" onClick={onClose}>Kapat</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
