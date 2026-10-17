'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { Clock3, Info, Mail, RotateCw, Send, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { UserRoleBadge } from '@/components/users/UserVisuals';
import { RoleAccessMatrix } from '@/components/users/RoleAccessMatrix';
import { normalizedRole, roleDescriptions, roleLabels, userDate, userRoles } from '@/lib/users/workspace';
import { canResendInvitation, invitationRemaining, invitationState, InvitationRequestError, parseInvitationResult, requestInvitationJson, type DeliveryStatus, type InvitationRow } from '@/lib/invitations/workspace';
import common from '@/components/users/users-workspace.module.css';
import styles from './invitations.module.css';

export type InvitationDialogMode = 'create' | 'resend' | 'detail';
export const attemptLabels: Record<DeliveryStatus, string> = { submitted: 'E-posta hizmetine iletildi', failed: 'E-posta gönderilemedi', development: 'Geliştirme modu · e-posta gönderilmedi', unknown: 'Gönderim sonucu bilinmiyor' };
interface Props { mode: InvitationDialogMode | null; invitation: InvitationRow | null; now: number; allowed: boolean; attempt?: DeliveryStatus; deliveryMode: string; onClose: () => void; onResend: () => void; onDone: (row: InvitationRow, delivery: DeliveryStatus, resend: boolean) => void; onUncertain: () => void; onBusy: (busy: boolean) => void }
export function InvitationDialog({ mode, invitation, now, allowed, attempt, deliveryMode, onClose, onResend, onDone, onUncertain, onBusy }: Props) {
  const [busy, setBusy] = useState(false), [email, setEmail] = useState(''), [role, setRole] = useState('viewer'), [error, setError] = useState(''), [uncertain, setUncertain] = useState(false);
  useEffect(() => { setEmail(''); setRole('viewer'); setError(''); setUncertain(false); }, [mode, invitation?.id]);
  useEffect(() => { onBusy(busy); return () => onBusy(false); }, [busy, onBusy]);
  if (!mode) return null;
  const state = invitation ? invitationState(invitation, now) : null, resendAllowed = Boolean(invitation && canResendInvitation(invitation, now));
  const selectedRole = normalizedRole(role);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy || !allowed || uncertain || mode === 'detail' || (mode === 'resend' && !resendAllowed)) return;
    if (mode === 'create' && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !selectedRole)) { setError('Geçerli bir e-posta adresi ve rol seçin.'); return; }
    setError(''); setBusy(true);
    try {
      const raw = await requestInvitationJson(mode === 'resend' && invitation ? `/api/users/invite/${encodeURIComponent(invitation.id)}/resend` : '/api/users/invite', { post: true, ...(mode === 'create' ? { body: { email: email.trim().toLowerCase(), role } } : {}) });
      let result; try { result = parseInvitationResult(raw, mode === 'resend' && invitation ? { id: invitation.id, email: invitation.email, role: invitation.role, createdAt: invitation.createdAt, invitedBy: invitation.invitedBy } : { email: email.trim().toLowerCase(), role: selectedRole }); } catch { throw new InvitationRequestError('İşlemin sonucu doğrulanamadı. Yeniden göndermeden önce listeyi yenileyin.', true); }
      onDone(result.invitation, result.delivery, mode === 'resend');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Davet işlemi tamamlanamadı.'); if (failure instanceof InvitationRequestError && failure.uncertain) { setUncertain(true); onUncertain(); } }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className={`${common.modal} ${mode === 'detail' ? '' : common.formModal}`} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onInteractOutside={event => event.preventDefault()}>
    <DialogHeader><DialogTitle>{mode === 'create' ? 'Yeni kullanıcı daveti' : mode === 'resend' ? 'Daveti yeniden gönder' : 'Davet ayrıntıları'}</DialogTitle><DialogDescription>{mode === 'create' ? 'Göndermeden önce alıcıyı ve atanacak rolü kontrol edin.' : mode === 'resend' ? 'Alıcı, korunacak rol ve yenilenecek süreyi kontrol edin.' : 'Kabul durumu, rol ve geçerlilik bilgileri.'}</DialogDescription></DialogHeader>
    {mode === 'detail' && invitation ? <>
      <p className={styles.recordEmail}>{invitation.email}</p><div className={styles.recordHeader}>{state && <SemanticBadge tone={state.tone}>{state.label}</SemanticBadge>}<UserRoleBadge role={invitation.role} /></div>
      <dl className={styles.detailMeta}><div><dt>Geçerlilik sonu</dt><dd>{userDate(invitation.expiresAt)}<small>{invitationRemaining(invitation, now)}</small></dd></div><div><dt>Kabul zamanı</dt><dd>{invitation.acceptedAt ? userDate(invitation.acceptedAt) : state?.state === 'accepted' ? 'Zaman bilgisi bildirilmedi' : 'Henüz kabul edilmedi'}</dd></div><div><dt>İlk oluşturulma</dt><dd>{userDate(invitation.createdAt)}</dd></div><div><dt>Kayıtlı davet eden</dt><dd>{invitation.invitedBy}</dd></div></dl>
      <p className={common.muted}>Tarih ve saatler Türkiye saatine (TSİ) göre gösterilir.</p>
      <div className={common.info}><Mail size={18} aria-hidden="true" /><div><p>{attempt ? `Bu oturumdaki son işlem: ${attemptLabels[attempt]}.` : 'Bu oturumda doğrulanmış gönderim bilgisi yok.'}</p><p>Kalıcı e-posta teslim geçmişi bu ekranda sunulmuyor. Davet durumu, alıcının e-postayı aldığı anlamına gelmez.</p></div></div>
      <details className={common.disclosure}><summary><ShieldCheck size={17} aria-hidden="true" />Atanacak rolün yetkileri</summary><RoleAccessMatrix fixedRole={invitation.role} /></details>
      <div className={common.dialogActions}><Button variant="outline" onClick={onClose}>Kapat</Button><Button disabled={!allowed || !resendAllowed} onClick={onResend}><RotateCw size={16} aria-hidden="true" />Yeniden gönder</Button></div>{!resendAllowed && <p className={common.muted}>{state?.state === 'accepted' ? 'Kabul edilmiş davet yeniden gönderilemez.' : 'Rol ve geçerlilik bilgileri doğrulanmadan yeniden gönderilemez.'}</p>}{!allowed && <p className={common.muted}>İşlem yetkisi ve güncel liste doğrulanmalıdır.</p>}
    </> : <form onSubmit={event => void submit(event)} className={common.userForm}>
      {error && <div className={common.formError} role="alert"><TriangleAlert size={17} aria-hidden="true" /><p>{error}</p></div>}
      <fieldset disabled={busy || !allowed || uncertain}>
        {mode === 'create' ? <><div><label htmlFor="invitation-email">E-posta adresi</label><Input id="invitation-email" autoFocus type="email" required value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" placeholder="ad@kurum.com" /></div><div><label htmlFor="invitation-role">Atanacak rol</label><select id="invitation-role" value={role} onChange={event => setRole(event.target.value)}>{userRoles.map(item => <option key={item} value={item}>{roleLabels[item]}</option>)}</select></div><div className={common.info}><ShieldCheck size={18} aria-hidden="true" /><p>{selectedRole ? roleDescriptions[selectedRole] : 'Rol seçin.'} Bu rol, davet kabul edilerek hesap oluşturulduğunda atanır.</p></div><dl className={styles.review}><div><dt>Alıcı</dt><dd>{email.trim() || 'E-posta adresi girin'}</dd></div><div><dt>Geçerlilik süresi</dt><dd>Oluşturulduktan sonra 7 gün</dd></div></dl></> : invitation && <><dl className={styles.review}><div><dt>Yeniden gönderilecek adres</dt><dd><strong>{invitation.email}</strong></dd></div><div><dt>Korunacak rol</dt><dd><UserRoleBadge role={invitation.role} /></dd></div><div><dt>Mevcut geçerlilik sonu</dt><dd>{userDate(invitation.expiresAt)}</dd></div><div><dt>Yeni geçerlilik süresi</dt><dd>Bu işlemden sonra 7 gün</dd></div></dl><div className={common.info}><Clock3 size={18} aria-hidden="true" /><p>Aynı davet bağlantısı yeniden iletilir ve geçerlilik süresi yenilenir. Önceki e-postadaki bağlantı da yeni bitiş tarihine kadar kullanılabilir. Alıcı ve atanacak rol değişmez.</p></div></>}
        {deliveryMode === 'development' && <div className={common.info}><Info size={18} aria-hidden="true" /><p>Geliştirme modunda gerçek e-posta gönderilmez. Davet kaydı oluşturulur veya yenilenir.</p></div>}
      </fieldset>
      <div className={common.dialogActions}><Button type="button" variant="outline" disabled={busy} onClick={onClose}><X size={16} aria-hidden="true" />Vazgeç</Button><Button type="submit" disabled={busy || !allowed || uncertain || (mode === 'resend' && !resendAllowed)}>{mode === 'resend' ? <RotateCw size={16} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}{busy ? 'İşleniyor…' : mode === 'resend' ? 'Yeniden gönder' : 'Daveti gönder'}</Button></div>
    </form>}
  </DialogContent></Dialog>;
}
