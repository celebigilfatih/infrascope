'use client';
import { FileClock, FileText, Globe, KeyRound, Pencil, Plus, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { uiLabel } from '@/lib/i18n/tr';
import { auditFieldLabels, auditKind, auditTime, auditTitle, auditValue, type AuditEntry } from '@/lib/audit/view';
import styles from './AuditEntryDetail.module.css';

export function AuditAction({ action }: { action: string }) {
  const { tone, kind } = auditKind(action);
  const Icon = { delete: Trash2, create: Plus, update: Pencil, access: KeyRound, other: FileClock }[kind];
  return <SemanticBadge tone={tone} icon={Icon} className={styles.actionBadge}>{auditTitle(action)}</SemanticBadge>;
}
export function AuditActor({ entry }: { entry: AuditEntry }) {
  return <div className="flex min-w-0 items-start gap-2.5"><span className={styles.actorIcon}><UserRound size={16} /></span><div className="min-w-0"><p className="break-words text-sm font-medium">{entry.userName === 'System' ? 'Sistem' : entry.userName || (entry.userId ? 'Silinmiş kullanıcı' : 'Sistem')}</p>{entry.userEmail && <p className="mt-0.5 break-all text-xs text-muted-foreground">{entry.userEmail}</p>}{entry.userRole && <span className="mt-1 inline-block text-[11px] text-muted-foreground">{uiLabel(entry.userRole)}</span>}{!entry.userId && <p className="mt-0.5 text-xs text-muted-foreground">Kullanıcı atanmadı</p>}</div></div>;
}
function DetailValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value && typeof value === 'object') {
    if (depth >= 5) return <pre className={styles.raw}>{JSON.stringify(value, null, 2)}</pre>;
    const fields = Object.entries(value);
    if (!fields.length) return <span className="text-muted-foreground">Ek bilgi yok</span>;
    return <dl className={styles.fields}>{fields.map(([key, child]) => <div key={key} className={child && typeof child === 'object' ? styles.group : undefined}><dt>{Array.isArray(value) ? `Öğe ${Number(key) + 1}` : auditFieldLabels[key] || key}</dt><dd><DetailValue value={child} depth={depth + 1} /></dd></div>)}</dl>;
  }
  return <span className="whitespace-pre-wrap break-words">{auditValue(value)}</span>;
}
export function AuditEntryDetail({ entry, onClose, onUserFilter }: { entry: AuditEntry | null; onClose: () => void; onUserFilter: (id: string, name: string) => void }) {
  return <Dialog open={!!entry} onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><FileClock size={20} className="text-primary" />İşlem ayrıntıları</DialogTitle><DialogDescription>İşlemi yapan kullanıcı, etkilenen kaynak ve kaydedilen bilgiler.</DialogDescription></DialogHeader>{entry && <>
    <div className={styles.summary}><AuditAction action={entry.action} /><time dateTime={entry.timestamp}>{auditTime(entry.timestamp)}</time><p className="break-all font-mono text-[11px] text-muted-foreground">{entry.action}</p></div>
    <div className={styles.context}><section><h3><UserRound size={16} />İşlemi yapan</h3><AuditActor entry={entry} />{entry.userId && <p className={styles.identifier}>Kullanıcı kimliği: {entry.userId}</p>}</section><section><h3><FileText size={16} />Etkilenen kaynak</h3><p className="text-sm font-medium">{entry.resource ? uiLabel(entry.resource) : 'Kaynak belirtilmemiş'}</p><p className={styles.identifier}>Kaynak kimliği: {entry.resourceId || 'Kaydedilmemiş'}</p></section></div>
    <section className={styles.section} aria-labelledby="audit-change-heading"><h3 id="audit-change-heading"><Pencil size={16} />Kaydedilen ayrıntılar</h3>{entry.details !== null && entry.details !== undefined ? <DetailValue value={entry.details} /> : <p className="text-xs text-muted-foreground">Bu işlem için ek ayrıntı kaydedilmemiş.</p>}</section>
    <details className={styles.technical}><summary><Globe size={15} />Bağlantı ve kayıt bilgileri</summary><dl className={styles.fields}><div><dt>IP adresi</dt><dd>{entry.ipAddress || 'Kaydedilmemiş'}</dd></div><div><dt>Tarayıcı / istemci bilgisi</dt><dd className="break-all">{entry.userAgent || 'Kaydedilmemiş'}</dd></div><div><dt>Kayıt kimliği</dt><dd className="break-all font-mono">{entry.id}</dd></div></dl></details>
    <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><ShieldCheck size={14} className="mt-0.5 shrink-0" />Denetim kayıtları salt okunurdur. Buradaki işlem türü, tek başına işlemin başarıyla tamamlandığını göstermez; sonucu kaydedilen ayrıntılardan inceleyin.</p>
    <DialogFooter>{entry.userId && <Button variant="outline" className="gap-2" onClick={() => onUserFilter(entry.userId!, entry.userName)}><UserRound size={15} />Bu kullanıcının işlemleri</Button>}<Button onClick={onClose}>Kapat</Button></DialogFooter>
    </>}</DialogContent></Dialog>;
}
