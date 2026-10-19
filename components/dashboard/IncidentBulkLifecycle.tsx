'use client';

import { uiError } from '@/lib/i18n/tr';
import Link from 'next/link';

import { useEffect, useId, useRef, useState } from 'react';
import { CircleCheck, RefreshCw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { INCIDENT_BULK_REASON_MAX_LENGTH, incidentBulkLifecycleExclusionReason, type IncidentBulkLifecycleAction, type IncidentBulkLifecycleResult } from '@/lib/alarms/incident-bulk-lifecycle';
import type { IncidentStatus } from '@/lib/alarms/incident-detail-presentation';
import styles from './incident-operations.module.css';
import { IncidentStatusBadge } from './IncidentVisuals';

interface BulkIncidentPreview { id: string; title: string; status: IncidentStatus }
interface BulkConfirmation { count: number; total: number; reason: string; incidents: BulkIncidentPreview[]; excludedIncidents: BulkIncidentPreview[]; incidentKey: string }
interface PrunedSelection { selectionKey: string; confirmation: BulkConfirmation; prunedSelectionKey: string; prunedIncidentKey: string }

export function IncidentBulkLifecycle({ action, incidents, excludedIncidents, selectionKey, disabled, onApply, onKeepEligible, onRestoreSelection }: {
  action: IncidentBulkLifecycleAction; incidents: BulkIncidentPreview[]; excludedIncidents: BulkIncidentPreview[]; selectionKey: string; disabled: boolean;
  onApply: (action: IncidentBulkLifecycleAction, reason: string) => Promise<IncidentBulkLifecycleResult>;
  onKeepEligible: () => void;
  onRestoreSelection: (ids: string[]) => string[] | null;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState<BulkConfirmation | null>(null);
  const [undoSelection, setUndoSelection] = useState<PrunedSelection | null>(null);
  const [authStatus, setAuthStatus] = useState<401 | 403 | null>(null);
  const inFlight = useRef(false);
  const previousSelectionKey = useRef(selectionKey);
  const pendingPrune = useRef<{ selectionKey: string; incidentKey: string; confirmation?: BulkConfirmation } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const fieldId = useId();
  const count = incidents.length;
  const total = count + excludedIncidents.length;
  const incidentKey = JSON.stringify({ action, incidents: [...incidents].sort((a, b) => a.id.localeCompare(b.id)), excludedIncidents: [...excludedIncidents].sort((a, b) => a.id.localeCompare(b.id)) });
  const confirmationCurrent = confirmation?.incidentKey === incidentKey;
  const canUndoSelection = undoSelection?.prunedSelectionKey === selectionKey && undoSelection?.prunedIncidentKey === incidentKey;
  const resolving = action === 'RESOLVE';
  const title = confirmation ? (resolving ? 'Toplu çözümü onayla' : 'Toplu kapatmayı onayla') : (resolving ? 'Toplu çözüm açıklaması' : 'Toplu kapatma açıklaması');
  const Icon = resolving ? CircleCheck : XCircle;
  useEffect(() => {
    const selectionChanged = previousSelectionKey.current !== selectionKey;
    previousSelectionKey.current = selectionKey;
    const expectedPrune = pendingPrune.current;
    pendingPrune.current = null;
    if (selectionChanged && expectedPrune?.selectionKey === selectionKey && expectedPrune.incidentKey === incidentKey && count > 0) {
      setConfirmation(previous => previous ? expectedPrune.confirmation ?? { ...previous, total: count, excludedIncidents: [], incidentKey } : null);
      setError(null);
      return;
    }
    setUndoSelection(null);
    if (selectionChanged && expectedPrune?.confirmation) {
      setConfirmation(null);
      setError(uiError('Seçim geri yüklendi. Güncel durumları kontrol edip yeniden onaylayın.'));
      if (count === 0) setOpen(false);
      return;
    }
    if (selectionChanged) { setReason(''); setOpen(false); setError(null); }
    setConfirmation(null);
    if (count === 0) setOpen(false);
  }, [count, total, incidentKey, selectionKey]);
  useEffect(() => { if (confirmation) headingRef.current?.focus(); else reasonRef.current?.focus(); }, [confirmation]);
  const review = () => {
    if (disabled || saving || count === 0 || !reason.trim() || reason.trim().length > INCIDENT_BULK_REASON_MAX_LENGTH || inFlight.current) return;
    setError(null);
    setConfirmation({ count, total, reason: reason.trim(), incidents: incidents.map(incident => ({ ...incident })), excludedIncidents: excludedIncidents.map(incident => ({ ...incident })), incidentKey });
  };
  const removeExcluded = () => {
    if (disabled || saving || inFlight.current || pendingPrune.current || !confirmation || !confirmationCurrent || count === 0 || excludedIncidents.length === 0) return;
    pendingPrune.current = {
      selectionKey: JSON.stringify(incidents.map(incident => incident.id).sort()),
      incidentKey: JSON.stringify({ action, incidents: [...incidents].sort((a, b) => a.id.localeCompare(b.id)), excludedIncidents: [] }),
    };
    setUndoSelection({
      selectionKey: JSON.stringify([...confirmation.incidents, ...confirmation.excludedIncidents].map(incident => incident.id).sort()),
      confirmation,
      prunedSelectionKey: pendingPrune.current.selectionKey,
      prunedIncidentKey: pendingPrune.current.incidentKey,
    });
    setError(null);
    onKeepEligible();
  };
  const undoPrune = () => {
    if (disabled || saving || inFlight.current || pendingPrune.current || !confirmation || !confirmationCurrent || !undoSelection || !canUndoSelection) return;
    pendingPrune.current = { selectionKey: undoSelection.selectionKey, incidentKey: undoSelection.confirmation.incidentKey, confirmation: { ...undoSelection.confirmation, reason: reason.trim() } };
    const ids = [...undoSelection.confirmation.incidents, ...undoSelection.confirmation.excludedIncidents].map(incident => incident.id);
    const currentSelectionKey = selectionKey;
    setError(null);
    const restoredIds = onRestoreSelection(ids);
    if (restoredIds === null) { pendingPrune.current = null; setError(uiError('Seçim geri yüklenemedi. Yeniden deneyin.')); return; }
    setUndoSelection(null);
    if (JSON.stringify([...restoredIds].sort()) === currentSelectionKey) {
      pendingPrune.current = null;
      setConfirmation(null);
      setError(uiError("Önceki seçimdeki diğer olaylar artık bu listede bulunmuyor. Açıklamanız korundu."));
    }
  };
  const submit = async () => {
    if (disabled || count === 0 || !reason.trim() || reason.trim().length > INCIDENT_BULK_REASON_MAX_LENGTH || inFlight.current || !confirmation || !confirmationCurrent || confirmation.count !== count || confirmation.total !== total || confirmation.reason !== reason.trim()) return;
    inFlight.current = true; setSaving(true); setError(null); setAuthStatus(null);
    try {
      const result = await onApply(action, confirmation.reason);
      if (result.success) { setReason(''); setConfirmation(null); setUndoSelection(null); setOpen(false); }
      else { setError(uiError(result.error || 'İşlem tamamlanamadı. Açıklamanız ve seçiminiz korundu.')); setAuthStatus(result.authStatus ?? null); }
    } catch { setError(uiError('Bağlantı hatası oluştu. Açıklamanız ve seçiminiz korundu.')); }
    finally { inFlight.current = false; setSaving(false); }
  };
  return <Popover open={open} onOpenChange={value => { if (!saving) { setOpen(value); setConfirmation(null); if (value) { setError(null); setAuthStatus(null); } } }}>
    <PopoverTrigger asChild><Button variant="outline" className={styles.bulkLifecycleButton} disabled={disabled || saving || count === 0} title={resolving ? "Seçili açık ve onaylanmış olayları çözer" : "Yalnızca seçili çözümlenmiş olayları kapatır"}><Icon size={16} aria-hidden="true" />{resolving ? `Çözüldü işaretle (${count})` : `Kapat (${count})`}</Button></PopoverTrigger>
    <PopoverContent aria-label={title} align="end" collisionPadding={12} className="pointer-events-auto z-[1050] max-h-[var(--radix-popover-content-available-height)] w-[min(380px,calc(100vw-32px))] overflow-y-auto p-5" onEscapeKeyDown={event => { if (saving) event.preventDefault(); }} onInteractOutside={event => { if (saving) event.preventDefault(); }}>
      <h2 ref={headingRef} tabIndex={-1} className="text-sm font-semibold">{title}</h2>
      {confirmation ? <>
        <p className={styles.bulkAssignHint}>İşlemi uygulamadan önce seçiminizi ve olay geçmişine kaydedilecek açıklamayı kontrol edin.</p>
        <dl className={styles.bulkReviewCounts} aria-live="polite">
          <div><dt>Seçili olay</dt><dd>{confirmation.total}</dd></div>
          <div><dt>{resolving ? 'Çözüldü işaretlenecek' : 'Kapatılacak'}</dt><dd>{confirmation.count}</dd></div>
        </dl>
        {undoSelection && canUndoSelection && <div className={styles.bulkUndoSelection}>
          <p role="status">{undoSelection.confirmation.excludedIncidents.length} olay seçimden çıkarıldı.</p>
          <Button type="button" variant="outline" size="sm" disabled={disabled || saving || !confirmationCurrent} onClick={undoPrune}>Geri al</Button>
        </div>}
        {confirmation.total > confirmation.count && <p className={styles.peopleHint}>Durumu uygun olmayan {confirmation.total - confirmation.count} seçili olay değiştirilmeyecek.</p>}
        <h3 id={`${fieldId}-incidents`} className={styles.bulkReviewLabel}>İşlem uygulanacak olaylar</h3>
        <ul aria-labelledby={`${fieldId}-incidents`} tabIndex={0} className={styles.bulkReviewIncidents}>
          {confirmation.incidents.map(incident => <li key={incident.id}>
            <p className={styles.bulkReviewIncidentTitle}>{incident.title}</p>
            <div className={styles.bulkReviewIncidentMeta}><span>INC-{incident.id.slice(-8).toUpperCase()}</span><span><span className="sr-only">Mevcut durum: </span><IncidentStatusBadge value={incident.status} /></span></div>
          </li>)}
        </ul>
        {confirmation.excludedIncidents.length > 0 && <>
          <h3 id={`${fieldId}-excluded`} className={styles.bulkReviewLabel}>İşlem dışında kalacak olaylar ({confirmation.excludedIncidents.length})</h3>
          <ul aria-labelledby={`${fieldId}-excluded`} tabIndex={0} className={styles.bulkReviewIncidents}>
            {confirmation.excludedIncidents.map(incident => <li key={incident.id}>
              <p className={styles.bulkReviewIncidentTitle}>{incident.title}</p>
              <div className={styles.bulkReviewIncidentMeta}><span>INC-{incident.id.slice(-8).toUpperCase()}</span><span><span className="sr-only">Mevcut durum: </span><IncidentStatusBadge value={incident.status} /></span></div>
              <p className={styles.bulkReviewExclusion}>İşleme alınmama nedeni: {incidentBulkLifecycleExclusionReason(incident.status, action)}</p>
            </li>)}
          </ul>
          <Button type="button" variant="outline" size="sm" className={styles.bulkPruneButton} disabled={disabled || saving || !confirmationCurrent} onClick={removeExcluded}>İşlem dışında kalanları seçimden çıkar</Button>
        </>}
        <p className={styles.peopleHint}>Durumlar listedeki son bilgilere aittir. İşlem sırasında uygunluk yeniden kontrol edilir.</p>
        <h3 className={styles.bulkReviewLabel}>İşlem açıklaması</h3>
        <p className={styles.bulkReviewReason}>{confirmation.reason}</p>
        <p className={styles.peopleHint}>Onayınızla birlikte açıklama, işlem uygulanan her olayın geçmişine adınız ve zaman bilgisiyle kaydedilir.</p>
        {error && <p role="alert" className={styles.bulkAssignError}>{uiError(error)}</p>}
        {authStatus === 401 && !saving && <Button asChild variant="outline" size="sm"><Link href="/login?next=%2Fdashboard%2Falerts" target="_blank" rel="noopener noreferrer">Yeni sekmede giriş yap</Link></Button>}
        <div className={styles.bulkAssignFooter}>
          <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => { setConfirmation(null); setError(null); }}>Geri dön</Button>
          <Button type="button" size="sm" disabled={disabled || saving || count === 0 || !confirmationCurrent || confirmation.count !== count || confirmation.total !== total || confirmation.reason !== reason.trim()} onClick={() => void submit()}>{saving ? <RefreshCw size={14} className="animate-spin motion-reduce:animate-none" /> : <Icon size={14} />}{saving ? 'Kaydediliyor…' : resolving ? 'Onayla ve çöz' : 'Onayla ve kapat'}</Button>
        </div>
      </> : <>
      <p className={styles.bulkAssignHint}>{count} olay {resolving ? 'çözüldü olarak işaretlenecek' : 'kapatılacak'}.{total > count ? ` Diğer ${total - count} seçili kayıt değiştirilmeyecek.` : ''}</p>
      <form onSubmit={event => { event.preventDefault(); review(); }}>
        <label htmlFor={fieldId} className={styles.filterLabel}>İşlem açıklaması (zorunlu)</label>
        <textarea ref={reasonRef} id={fieldId} className={styles.bulkReason} rows={4} required aria-required="true" maxLength={INCIDENT_BULK_REASON_MAX_LENGTH} value={reason} onChange={event => { setReason(event.target.value); setError(null); }} disabled={disabled || saving} placeholder={resolving ? 'Uygulanan çözümü ve kontrol sonucunu yazın…' : 'Kapatma nedenini ve son kontrolü yazın…'} aria-describedby={`${fieldId}-help`} />
        <p id={`${fieldId}-help`} className={styles.peopleHint}>Açıklama, işlem uygulanan her olayın geçmişine adınız ve zaman bilgisiyle kaydedilir.<span className={styles.reasonCount}>{reason.length} / {INCIDENT_BULK_REASON_MAX_LENGTH}</span></p>
        {error && <p role="alert" className={styles.bulkAssignError}>{uiError(error)}</p>}
        {authStatus === 401 && !saving && <Button asChild variant="outline" size="sm"><Link href="/login?next=%2Fdashboard%2Falerts" target="_blank" rel="noopener noreferrer">Yeni sekmede giriş yap</Link></Button>}
        <div className={styles.bulkAssignFooter}><Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => setOpen(false)}>İptal</Button><Button type="submit" size="sm" disabled={disabled || saving || count === 0 || !reason.trim() || reason.trim().length > INCIDENT_BULK_REASON_MAX_LENGTH}>Onay ekranına geç</Button></div>
      </form>
      </>}
    </PopoverContent>
  </Popover>;
}
