'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check, Clock3, Info, KeyRound, Pencil, Save, ShieldCheck, Trash2, TriangleAlert, UserPlus, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RoleAccessMatrix } from './RoleAccessMatrix';
import { UserRoleBadge, UserStateBadge } from './UserVisuals';
import { initials, parseActivities, verifyUserWrite, passwordChecks, requestUsersJson, roleDescriptions, roleLabels, statusLabels, userChanges, userDate, userPatch, userRoles, userStatuses, validateUserDraft, normalizedRole, type UserDraft, type WorkspaceActivity, type WorkspaceUser } from '@/lib/users/workspace';
import styles from './users-workspace.module.css';

export type UserDialogMode = 'detail' | 'create' | 'edit' | 'password' | 'delete';
interface DialogProps { mode: UserDialogMode | null; user: WorkspaceUser | null; canWrite: boolean; canDelete: boolean; lastAdmin: boolean; onClose: () => void; onMode: (mode: UserDialogMode) => void; onSaved: (message: string) => void; onUncertain: () => void; onBusy: (busy: boolean) => void }
const activityLabels: Record<string, string> = { login: 'Oturum açma kaydı', edit_user: 'Hesap bilgileri güncellendi', delete_user: 'Hesap silindi', create_user: 'Hesap oluşturuldu', account_created: 'Hesap oluşturuldu', password_change: 'Parola değiştirildi', password_set: 'Parola oluşturuldu', password_reset: 'Parola sıfırlandı', delete_alarm: 'Alarm silme kaydı', edit_settings: 'Ayar değişikliği kaydı' };

function UserDetail({ user, canWrite, canDelete, lastAdmin, onMode }: Pick<DialogProps, 'canWrite' | 'canDelete' | 'lastAdmin' | 'onMode'> & { user: WorkspaceUser }) {
  const [activities, setActivities] = useState<WorkspaceActivity[] | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const active = useRef<AbortController | null>(null), sequence = useRef(0);
  useEffect(() => () => { sequence.current += 1; active.current?.abort(); }, []);
  async function loadActivities() {
    const id = ++sequence.current; active.current?.abort(); const controller = new AbortController(); active.current = controller; setLoading(true); setError('');
    try { const value = parseActivities(await requestUsersJson(`/api/users/activities?userId=${encodeURIComponent(user.id)}&limit=5`, 'Hesap kayıtları alınamadı.', { signal: controller.signal })); if (id === sequence.current && !controller.signal.aborted) setActivities(value); }
    catch (failure) { if (id === sequence.current && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Hesap kayıtları alınamadı.'); }
    finally { if (id === sequence.current && !controller.signal.aborted) setLoading(false); }
  }
  return <>
    <div className={styles.detailIdentity}><span className={styles.avatar}>{initials(user)}</span><div><strong>{user.name || 'Adsız kullanıcı'}</strong><p>{user.email}</p><div><UserStateBadge status={user.status} /><UserRoleBadge role={user.role} /></div></div></div>
    <dl className={styles.detailGrid}><div><dt>Hesap durumu</dt><dd>{user.status === 'active' ? 'Hesap etkin' : user.status ? 'Yeni oturum açması engellenir' : 'Durum bilgisi alınamadı'}<small>Hesap durumu, çevrimiçi olmayı göstermez.</small></dd></div><div><dt>Son giriş kaydı</dt><dd>{user.lastLoginAt === null ? 'Giriş kaydı yok' : userDate(user.lastLoginAt)}{user.lastLoginAt && <small>Türkiye saati (TSİ)</small>}</dd></div><div><dt>Oluşturulma</dt><dd>{userDate(user.createdAt)}</dd></div><div><dt>Rol kapsamı</dt><dd>{user.role ? roleDescriptions[user.role] : 'Rol bilgisi alınamadı.'}</dd></div></dl>
    <details className={styles.disclosure}><summary><ShieldCheck size={17} aria-hidden="true" />Bu kullanıcının rol yetkileri</summary><RoleAccessMatrix fixedRole={user.role} /></details>
    <details className={styles.disclosure} onToggle={event => { if (event.currentTarget.open && activities === null && !loading && !error) void loadActivities(); }}><summary><Clock3 size={17} aria-hidden="true" />Hesaba yazılan son 5 kayıt</summary><div className={styles.activityBody}><p className={styles.muted}>Bu hesaba bağlı kayıtlar gösterilir. Kaydı oluşturan kişi, bu hesabın sahibiyle aynı kişi olmayabilir.</p>{loading || (activities === null && !error) ? <p role="status">Kayıtlar yükleniyor…</p> : error ? <div role="alert" className={styles.formError}>{error}<Button variant="outline" size="sm" onClick={() => void loadActivities()}>Yeniden dene</Button></div> : activities?.length ? <ol className={styles.activities}>{activities.map(activity => <li key={activity.id}><span>{activityLabels[activity.action] || 'Hesap işlemi'}</span><time dateTime={activity.occurredAt ?? undefined}>{userDate(activity.occurredAt)}{activity.occurredAt ? ' · TSİ' : ''}</time></li>)}</ol> : <p>Bu hesap için kayıt bulunamadı.</p>}</div></details>
    <div className={styles.dialogActions}><Button variant="outline" disabled={!canWrite} onClick={() => onMode('edit')}><Pencil size={16} aria-hidden="true" />Hesabı düzenle</Button><Button variant="outline" disabled={!canWrite} onClick={() => onMode('password')}><KeyRound size={16} aria-hidden="true" />Parolayı değiştir</Button><Button variant="outline" disabled={!canDelete || lastAdmin} onClick={() => onMode('delete')} title={lastAdmin ? 'Son yönetici hesabı silinemez.' : undefined}><Trash2 size={16} aria-hidden="true" />Hesabı sil</Button></div>
    {lastAdmin && <p className={styles.muted}>Son yönetici hesabı silinemez.</p>}{!canWrite && <p className={styles.muted}>Bu görünüm salt okunur. İşlem yetkisi ve güncel liste doğrulanmalıdır.</p>}
  </>;
}

function PasswordRequirements({ value }: { value: string }) { return <ul className={styles.passwordChecks} aria-label="Parola koşulları">{passwordChecks(value).map(check => <li key={check.label} className={check.valid ? styles.passed : undefined}>{check.valid ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}<span>{check.label}<span className="sr-only">{check.valid ? ': karşılandı' : ': karşılanmadı'}</span></span></li>)}</ul>; }

function UserForm({ mode, user, canWrite, canDelete, lastAdmin, busy, setBusy, onSaved, onClose, onUncertain }: DialogProps & { mode: Exclude<UserDialogMode, 'detail'>; busy: boolean; setBusy: (busy: boolean) => void }) {
  const [draft, setDraft] = useState<UserDraft>({ name: user?.name || '', email: user?.email || '', role: mode === 'create' ? 'viewer' : user?.role || '', status: mode === 'create' ? 'active' : user?.status || '' });
  const [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [current, setCurrent] = useState(''), [error, setError] = useState(''), [uncertain, setUncertain] = useState(false);
  const changes = mode === 'edit' && user ? userChanges(user, draft) : [], role = normalizedRole(draft.role);
  const allowed = mode === 'delete' ? canDelete && !lastAdmin : canWrite;
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy || !allowed || uncertain) return; setError('');
    if ((mode === 'edit' || mode === 'create') && validateUserDraft(draft)) { setError(validateUserDraft(draft)!); return; }
    if ((mode === 'password' || mode === 'create') && (!passwordChecks(password).every(check => check.valid) || password !== confirm)) { setError('Parola koşullarını ve parola doğrulamasını kontrol edin.'); return; }
    if (mode === 'password' && !current) { setError('Seçili hesabın mevcut parolasını girin.'); return; }
    if (mode === 'edit' && !changes.length) return;
    setBusy(true);
    try {
      if (mode === 'create') {
        const expected = { name: draft.name.trim(), email: draft.email.trim().toLowerCase(), role: draft.role, status: 'active' };
        verifyUserWrite(await requestUsersJson('/api/users', 'Kullanıcı oluşturulamadı.', { method: 'POST', body: { ...expected, password } }), expected);
      }
      else if (mode === 'edit' && user) {
        const patch = userPatch(user, draft);
        verifyUserWrite(await requestUsersJson('/api/users', 'Kullanıcı güncellenemedi.', { method: 'PATCH', body: patch }), patch);
      }
      else if (mode === 'password' && user) await requestUsersJson('/api/users/password', 'Parola değiştirilemedi.', { method: 'PATCH', body: { userId: user.id, currentPassword: current, newPassword: password } });
      else if (mode === 'delete' && user) await requestUsersJson(`/api/users?id=${encodeURIComponent(user.id)}`, 'Kullanıcı silinemedi.', { method: 'DELETE' });
      else throw new Error('Seçili kullanıcı bulunamadı.');
      setPassword(''); setCurrent(''); setConfirm(''); onSaved(mode === 'create' ? 'Kullanıcı oluşturuldu.' : mode === 'edit' ? 'Kullanıcı bilgileri güncellendi.' : mode === 'password' ? 'Parola değiştirildi.' : 'Kullanıcı silindi.');
    } catch (failure) { const message = failure instanceof Error ? failure.message : 'İşlem tamamlanamadı.'; setError(message); if (message.startsWith('İşlemin sonucu')) { setUncertain(true); onUncertain(); } }
    finally { setBusy(false); }
  }
  return <form onSubmit={event => void submit(event)} className={styles.userForm}>
    {error && <div className={styles.formError} role="alert"><TriangleAlert size={17} aria-hidden="true" /><p>{error}{uncertain && ' Bu pencereyi kapatıp listeyi yenileyin.'}</p></div>}
    <fieldset disabled={busy || !allowed || uncertain}>
      {(mode === 'create' || mode === 'edit') && <><div className={styles.formGrid}><div><label htmlFor="workspace-user-name">Ad soyad</label><Input id="workspace-user-name" autoFocus value={draft.name} maxLength={100} required onChange={event => setDraft({ ...draft, name: event.target.value })} autoComplete="name" /></div><div><label htmlFor="workspace-user-email">E-posta adresi</label><Input id="workspace-user-email" type="email" required value={draft.email} onChange={event => setDraft({ ...draft, email: event.target.value })} autoComplete="email" /></div><div><label htmlFor="workspace-user-role">Rol</label><select id="workspace-user-role" required value={draft.role} onChange={event => setDraft({ ...draft, role: event.target.value })}>{!draft.role && <option value="" disabled>Rol seçin</option>}{userRoles.map(item => <option key={item} value={item}>{roleLabels[item]}</option>)}</select></div>{mode === 'edit' && <div><label htmlFor="workspace-user-status">Hesap durumu</label><select id="workspace-user-status" required value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value })}>{!draft.status && <option value="" disabled>Durum seçin</option>}{userStatuses.map(item => <option key={item} value={item}>{statusLabels[item]}</option>)}</select></div>}</div><div className={styles.info}><ShieldCheck size={18} aria-hidden="true" /><p>{role ? roleDescriptions[role] : 'Rol seçin.'}{mode === 'create' && ' Yeni hesap aktif durumda oluşturulur.'}</p></div></>}
      {mode === 'password' && <><div className={styles.info}><Info size={18} aria-hidden="true" /><p><strong>{user?.email}</strong> hesabının parolası değiştirilecek. Bu işlem seçili hesabın mevcut parolasını gerektirir.</p></div><div><label htmlFor="workspace-current-password">Seçili hesabın mevcut parolası</label><Input id="workspace-current-password" autoFocus type="password" autoComplete="current-password" value={current} required onChange={event => setCurrent(event.target.value)} /></div></>}
      {(mode === 'create' || mode === 'password') && <><div><label htmlFor="workspace-new-password">{mode === 'create' ? 'Parola' : 'Yeni parola'}</label><Input id="workspace-new-password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={password} onChange={event => setPassword(event.target.value)} aria-describedby="workspace-password-help" /><p id="workspace-password-help" className="sr-only">8–72 karakter, en az bir büyük harf, rakam ve özel karakter.</p><PasswordRequirements value={password} /></div><div><label htmlFor="workspace-confirm-password">Parolayı doğrulayın</label><Input id="workspace-confirm-password" type="password" autoComplete="new-password" required value={confirm} onChange={event => setConfirm(event.target.value)} aria-invalid={Boolean(confirm && confirm !== password)} />{confirm && confirm !== password && <p className={styles.fieldError}>Parolalar eşleşmiyor.</p>}</div></>}
      {mode === 'edit' && <section className={styles.review} aria-label="Değişiklik özeti"><h3>Kaydedilecek değişiklikler</h3>{changes.length ? <ul>{changes.map(change => <li key={change.field}><strong>{change.field}</strong><span>{change.before || 'Boş'}<ArrowRight size={14} aria-label="yerine" />{change.after || 'Boş'}</span></li>)}</ul> : <p>Henüz değişiklik yapılmadı.</p>}</section>}
      {mode === 'delete' && <div className={styles.deleteReview}><Trash2 size={22} aria-hidden="true" /><h3>{user?.name || 'Seçili kullanıcı'}</h3><p>{user?.email}</p><p>Hesap ve bu hesaba bağlı etkinlik kayıtları silinir. Bu işlem geri alınamaz.</p></div>}
    </fieldset>
    <div className={styles.dialogActions}><Button type="button" autoFocus={mode === 'delete'} variant="outline" disabled={busy} onClick={onClose}><X size={16} aria-hidden="true" />Vazgeç</Button><Button type="submit" variant={mode === 'delete' ? 'destructive' : 'default'} disabled={busy || !allowed || uncertain || (mode === 'edit' && !changes.length)}>{mode === 'delete' ? <Trash2 size={16} aria-hidden="true" /> : mode === 'create' ? <UserPlus size={16} aria-hidden="true" /> : mode === 'password' ? <KeyRound size={16} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}{busy ? 'İşleniyor…' : mode === 'create' ? 'Kullanıcı oluştur' : mode === 'edit' ? 'Değişiklikleri kaydet' : mode === 'password' ? 'Parolayı değiştir' : 'Hesabı kalıcı olarak sil'}</Button></div>
  </form>;
}

export function UserWorkspaceDialog(props: DialogProps) {
  const [busy, setBusy] = useState(false);
  const { onBusy } = props;
  useEffect(() => { onBusy(busy); return () => onBusy(false); }, [busy, onBusy]);
  if (!props.mode) return null;
  const title = { detail: 'Kullanıcı ayrıntıları', create: 'Yeni kullanıcı', edit: 'Hesabı düzenle', password: 'Parolayı değiştir', delete: 'Hesabı sil' }[props.mode];
  return <Dialog open onOpenChange={open => { if (!open && !busy) props.onClose(); }}><DialogContent className={`${styles.modal} ${props.mode === 'detail' ? '' : styles.formModal}`} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onInteractOutside={event => event.preventDefault()}>
    <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{props.mode === 'detail' ? 'Hesap durumu, rol kapsamı ve giriş kayıtları.' : props.mode === 'create' ? 'Hesap bilgilerini ve atanacak rolü kontrol ederek oluşturun.' : 'Kaydetmeden önce seçili hesabı ve işlem kapsamını kontrol edin.'}</DialogDescription></DialogHeader>
    {props.mode === 'detail' && props.user ? <UserDetail key={props.user.id} {...props} user={props.user} /> : props.mode !== 'detail' ? <UserForm key={`${props.mode}-${props.user?.id || 'new'}`} {...props} mode={props.mode} busy={busy} setBusy={setBusy} /> : <p>Seçili kullanıcı bulunamadı.</p>}
  </DialogContent></Dialog>;
}
