'use client';

import { uiError } from '@/lib/i18n/tr';

import { useEffect, useRef, useState } from 'react';
import { RefreshCw, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import styles from './incident-operations.module.css';

export interface IncidentBulkAssignmentResult { success: boolean; error?: string }

export function IncidentBulkAssignment({ count, disabled, onAssign }: {
  count: number; disabled: boolean; onAssign: (assigneeId: string) => Promise<IncidentBulkAssignmentResult>;
}) {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [assigneeId, setAssigneeId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true); setPeopleError(null); setCanManage(false);
    void (async () => {
      try {
        const response = await fetch('/api/alarm-incidents/assignees', { signal: controller.signal, cache: 'no-store' });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(uiError(result.error || 'Sorumlu listesi alınamadı.'));
        if (!controller.signal.aborted) { setPeople(result.data); setCanManage(result.canManage === true); }
      } catch (cause) {
        if (!controller.signal.aborted) setPeopleError(uiError(cause instanceof Error ? cause.message : 'Sorumlu listesi alınamadı.'));
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [open, revision]);
  const submit = async () => {
    if (!assigneeId || disabled || loading || !canManage || inFlight.current) return;
    inFlight.current = true; setSaving(true); setError(null);
    try {
      const result = await onAssign(assigneeId);
      if (result.success) setOpen(false);
      else setError(uiError(result.error || 'Atama yapılamadı. Seçiminiz korundu; tekrar deneyebilirsiniz.'));
    } catch { setError(uiError('Atama sırasında bağlantı hatası oluştu. Seçiminiz korundu.')); }
    finally { inFlight.current = false; setSaving(false); }
  };
  return <Popover open={open} onOpenChange={value => {
    if (saving) return;
    setOpen(value);
    if (value) { setAssigneeId(''); setError(null); }
  }}>
    <PopoverTrigger asChild><Button variant="outline" className={styles.bulkAssignTrigger} disabled={disabled || saving}><UserRound size={16} aria-hidden="true" />Sorumlu ata</Button></PopoverTrigger>
    <PopoverContent aria-label="Toplu sorumlu atama" align="end" collisionPadding={12} className="pointer-events-auto z-[1050] max-h-[var(--radix-popover-content-available-height)] w-[min(340px,calc(100vw-32px))] overflow-y-auto p-5" onEscapeKeyDown={event => { if (saving) event.preventDefault(); }} onInteractOutside={event => { if (saving) event.preventDefault(); }}>
      <h2 className="text-sm font-semibold">Toplu sorumlu atama</h2>
      <p className={styles.bulkAssignHint}>{count} olay seçili. Mevcut sorumlular seçtiğiniz kullanıcıyla değiştirilecek.</p>
      {peopleError ? <div role="alert" className={styles.bulkAssignError}><p>{uiError(peopleError)}</p><Button variant="outline" size="sm" disabled={saving} onClick={() => setRevision(value => value + 1)}>Tekrar dene</Button></div> : <>
        <label className={styles.filterLabel}>Atanacak sorumlu<select value={assigneeId} onChange={event => { setAssigneeId(event.target.value); setError(null); }} className={styles.select} disabled={disabled || saving || loading || !canManage} aria-describedby="bulk-assignment-help">
          <option value="">Kullanıcı seçin</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select></label>
        <p id="bulk-assignment-help" className={styles.peopleHint} role={loading ? 'status' : undefined}>{loading ? 'Kullanıcılar yükleniyor…' : !canManage ? 'Atama için yönetici veya editör yetkisi gerekiyor.' : people.length === 0 ? 'Atanabilecek aktif kullanıcı bulunmuyor.' : 'Aktif yönetici ve editörler atanabilir.'}</p>
      </>}
      {error && <p role="alert" className={styles.bulkAssignError}>{uiError(error)}</p>}
      <div className={styles.bulkAssignFooter}><Button variant="outline" size="sm" disabled={saving} onClick={() => setOpen(false)}>İptal</Button><Button size="sm" disabled={disabled || saving || loading || !canManage || Boolean(peopleError) || !assigneeId} onClick={() => void submit()}>{saving ? <RefreshCw size={14} className="animate-spin motion-reduce:animate-none" /> : <UserRound size={14} />}{saving ? 'Atanıyor…' : 'Atamayı uygula'}</Button></div>
    </PopoverContent>
  </Popover>;
}
