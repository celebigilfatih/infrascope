'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Info, Loader2, Mail, Plus, RotateCcw, Save, Send, Server, ShieldCheck, UsersRound, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { notificationConfigSchema } from '@/lib/validators/alarms';
import { requestRuleJson, type RuleEmailConfig } from '@/lib/alarms/rule-workspace';
import styles from './rule-workspace.module.css';

function emailForm(config: RuleEmailConfig) {
  return { enabled: config.enabled, smtpHost: config.config.smtpHost, smtpPort: String(config.config.smtpPort), smtpUser: config.config.smtpUser, smtpPass: '', smtpSecure: config.config.smtpSecure, recipients: [...config.config.recipients] };
}
export function RuleEmailSettings({ config, writable, refreshing, onDirty, onSaved }: { config: RuleEmailConfig; writable: boolean; refreshing: boolean; onDirty: (dirty: boolean) => void; onSaved: (config: RuleEmailConfig) => void }) {
  const [draft, setDraft] = useState(() => emailForm(config));
  const [recipient, setRecipient] = useState(''), [recipientError, setRecipientError] = useState('');
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false), [testing, setTesting] = useState(false), [testOpen, setTestOpen] = useState(false);
  const baseline = emailForm(config);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline) || !!recipient.trim();
  const hasPassword = !!config.config.smtpPass;
  const blocked = saving || testing || refreshing || !writable;
  useEffect(() => { setDraft(emailForm(config)); setRecipient(''); setError(''); setRecipientError(''); }, [config]);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);

  const addRecipient = () => {
    if (blocked) return;
    const email = recipient.trim();
    if (!notificationConfigSchema.shape.recipients.element.safeParse(email).success) { setRecipientError('Geçerli bir e-posta adresi yazın.'); return; }
    if (draft.recipients.some(value => value.toLowerCase() === email.toLowerCase())) { setRecipientError('Bu alıcı zaten listede.'); return; }
    setDraft({ ...draft, recipients: [...draft.recipients, email] }); setRecipient(''); setRecipientError(''); setNotice('');
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (blocked || !dirty) return;
    setError(''); setNotice('');
    if (recipient.trim()) { setRecipientError('Adresi listeye ekleyin veya giriş alanını temizleyin.'); return; }
    if (!/^\d+$/.test(draft.smtpPort)) { setError('SMTP portu 1–65.535 arasında tam sayı olmalıdır.'); return; }
    const parsed = notificationConfigSchema.safeParse({ ...draft, smtpHost: draft.smtpHost.trim(), smtpUser: draft.smtpUser.trim(), smtpPort: Number(draft.smtpPort) });
    if (!parsed.success) { setError(parsed.error.issues.map(issue => issue.message).join(' ')); return; }
    if (!hasPassword && !draft.smtpPass) { setError('İlk yapılandırma için SMTP parolası girin.'); return; }
    setSaving(true);
    try {
      const result = await requestRuleJson('/api/alarms/notification', 'E-posta ayarları kaydedilemedi. Sunucu, port ve alıcıları kontrol edip tekrar deneyin.', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed.data) });
      if (result.data?.channel !== 'email' || typeof result.data.enabled !== 'boolean') throw new Error('Kaydetme sonucu doğrulanamadı. Ayarları yenileyip kontrol edin.');
      onSaved({ channel: 'email', enabled: result.data.enabled, isConfigured: true, config: { ...parsed.data, smtpPass: '********', smtpSecure: parsed.data.smtpSecure ?? false } });
      setNotice('E-posta ayarları kaydedildi. Bağlantıyı doğrulamak için kayıtlı alıcılara test iletisi gönderebilirsiniz.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'E-posta ayarları kaydedilemedi.'); }
    finally { setSaving(false); }
  };
  const test = async () => {
    if (blocked || dirty || !config.enabled || !config.isConfigured) return;
    setTesting(true); setError(''); setNotice('');
    try {
      await requestRuleJson('/api/alarms/notification', 'Test iletisi gönderilemedi. Kayıtlı SMTP sunucusunu, erişim bilgilerini ve alıcıları kontrol edin.', { method: 'POST' }, 30000);
      setNotice('E-posta sunucusu test iletisini kabul etti. Alıcıların gelen kutusunu ve istenmeyen posta klasörünü kontrol edin.'); setTestOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Test iletisi gönderilemedi.'); setTestOpen(false); }
    finally { setTesting(false); }
  };
  return <div className={styles.emailLayout}><section className={styles.collection} aria-labelledby="rule-email-heading"><div className={styles.sectionHeader}><div><h2 id="rule-email-heading"><Server size={18} />Ortak e-posta kanalı</h2><p>Bu kanal, e-posta tercihi açık olan tüm kurallarda kullanılır.</p></div><SemanticBadge tone={!config.enabled ? 'neutral' : config.isConfigured ? 'info' : 'warning'}>{!config.enabled ? 'Kayıtlı kanal kapalı' : config.isConfigured ? 'Kayıtlı ayarlar mevcut' : 'Kayıtlı ayarlar eksik'}</SemanticBadge></div>
    <form className={styles.emailForm} onSubmit={save} noValidate><fieldset disabled={blocked} className="min-w-0 space-y-5"><legend className="sr-only">E-posta sunucusu ayarları</legend>
      <div className={styles.switchRow}><div><Label htmlFor="email-enabled">Ortak e-posta kanalını aç</Label><p>Tüm alarm kurallarının e-posta gönderimini ortak olarak kontrol eder.</p></div><Switch id="email-enabled" checked={draft.enabled} onCheckedChange={enabled => setDraft({ ...draft, enabled })} /></div>
      <div className={styles.emailFields}><div><Label htmlFor="smtp-host">SMTP sunucusu</Label><Input id="smtp-host" className="mt-2" value={draft.smtpHost} onChange={e => setDraft({ ...draft, smtpHost: e.target.value })} placeholder="smtp.ornek.com" autoComplete="off" /></div><div><Label htmlFor="smtp-port">SMTP portu</Label><Input id="smtp-port" className="mt-2" type="text" inputMode="numeric" value={draft.smtpPort} onChange={e => setDraft({ ...draft, smtpPort: e.target.value })} aria-describedby="smtp-port-help" /><p id="smtp-port-help" className={styles.help}>Yaygın değerler: 587 (STARTTLS), 465 (doğrudan TLS).</p></div><div><Label htmlFor="smtp-user">SMTP kullanıcı adı / gönderen</Label><Input id="smtp-user" className="mt-2" value={draft.smtpUser} onChange={e => setDraft({ ...draft, smtpUser: e.target.value })} autoComplete="off" placeholder="bildirim@ornek.com" /></div><div><Label htmlFor="smtp-password">SMTP parolası</Label><Input id="smtp-password" className="mt-2" type="password" value={draft.smtpPass} onChange={e => setDraft({ ...draft, smtpPass: e.target.value })} autoComplete="new-password" placeholder={hasPassword ? 'Kayıtlı parolayı korumak için boş bırakın' : 'SMTP hesabının parolası'} aria-describedby="smtp-password-help" /><p id="smtp-password-help" className={styles.help}>{hasPassword ? 'Kayıtlı parola gösterilmez. Boş bırakırsanız korunur.' : 'Henüz kayıtlı bir SMTP parolası yok.'}</p></div></div>
      <div className={styles.switchRow}><div><Label htmlFor="smtp-secure">Doğrudan TLS bağlantısı</Label><p>Genellikle 465 portunda açılır. 587 portunda kapalı seçenek kullanılır; bağlantı sunucunun STARTTLS desteğine göre yükseltilir.</p></div><Switch id="smtp-secure" checked={draft.smtpSecure} onCheckedChange={smtpSecure => setDraft({ ...draft, smtpSecure })} /></div>
      <section aria-labelledby="email-recipients-heading"><h3 id="email-recipients-heading" className="flex items-center gap-2 text-sm font-semibold"><UsersRound size={16} className="text-primary" />Bildirim alıcıları <span className="text-muted-foreground">({draft.recipients.length})</span></h3><div className={styles.recipients}>{draft.recipients.map(email => <span key={email}><Mail size={13} /><span>{email}</span><button type="button" aria-label={`${email} alıcısını kaldır`} onClick={() => setDraft({ ...draft, recipients: draft.recipients.filter(value => value !== email) })}><X size={14} /></button></span>)}</div><Label htmlFor="new-rule-recipient">Yeni alıcı e-posta adresi</Label><div className="mt-2 flex items-start gap-2"><Input id="new-rule-recipient" type="email" value={recipient} onChange={e => { setRecipient(e.target.value); setRecipientError(''); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRecipient(); } }} placeholder="alici@ornek.com" aria-invalid={!!recipientError} aria-describedby={recipientError ? 'rule-recipient-error' : 'rule-recipient-help'} /><Button type="button" variant="outline" onClick={addRecipient} className="gap-1.5"><Plus size={16} />Ekle</Button></div>{recipientError ? <p id="rule-recipient-error" role="alert" className="mt-2 text-xs text-destructive">{recipientError}</p> : <p id="rule-recipient-help" className={styles.help}>Adresi yazıp Ekle veya Enter ile listeye alın. Alıcı değişiklikleri kaydedilene kadar uygulanmaz.</p>}</section>
    </fieldset>
    {error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status" className={styles.notice}><CheckCircle2 size={16} />{notice}</p>}
    <div className={styles.emailActions}>{writable && <Button type="submit" disabled={blocked || !dirty} className="gap-2">{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{saving ? 'Kaydediliyor…' : 'Ayarları kaydet'}</Button>}{dirty && <Button type="button" variant="outline" disabled={blocked} className="gap-2" onClick={() => { setDraft(emailForm(config)); setRecipient(''); setRecipientError(''); setError(''); setNotice(''); }}><RotateCcw size={15} />Değişiklikleri sıfırla</Button>}<Button type="button" variant="outline" className="gap-2" disabled={blocked || dirty || !config.enabled || !config.isConfigured} onClick={() => { setError(''); setNotice(''); setTestOpen(true); }}>{testing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}Test iletisi gönder</Button></div><p className={styles.help}>{dirty ? 'Kaydedilmemiş değişiklikler var. Test iletisi için önce kaydedin veya değişiklikleri sıfırlayın.' : !writable ? 'Salt okunur görünüm. Düzenleme ve test için alarm yazma yetkisi gerekir.' : 'Test, kayıtlı ve açık kanalın alıcılarına gerçek e-posta gönderir. Kaydetmek bağlantının çalıştığını doğrulamaz.'}</p>
    </form></section>
    <aside className={styles.emailAside}><h3><ShieldCheck size={18} />Bildirim nasıl çalışır?</h3><ol><li>Kuralın etkin olması gerekir.</li><li>Kuralın e-posta tercihi açık olmalıdır.</li><li>Ortak kanal açık, sunucu ve alıcı ayarları tamamlanmış olmalıdır.</li></ol><p><Info size={15} />Ayarların uygun olması teslim garantisi değildir. Tekrar beklemesi ve gönderim sınırları uygulanabilir.</p><dl><div><dt>Kayıtlı kanal</dt><dd>{config.enabled ? 'Açık' : 'Kapalı'}</dd></div><div><dt>Kayıtlı alıcı</dt><dd>{config.config.recipients.length}</dd></div><div><dt>Bağlantı durumu</dt><dd>Bu ekrandan sürekli izlenmez</dd></div></dl>{dirty && <SemanticBadge tone="warning">Kaydedilmemiş değişiklikler</SemanticBadge>}</aside>
    <Dialog open={testOpen} onOpenChange={open => { if (!testing) setTestOpen(open); }}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle className="flex items-center gap-2"><Send size={19} className="text-primary" />Test iletisi gönderilsin mi?</DialogTitle><DialogDescription>Kayıtlı SMTP ayarlarıyla aşağıdaki alıcılara gerçek bir test e-postası gönderilir.</DialogDescription></DialogHeader><ul className="max-h-48 space-y-2 overflow-auto rounded-lg border border-border bg-muted/20 p-4 text-xs">{config.config.recipients.map(email => <li className="break-all" key={email}>{email}</li>)}</ul><p className="text-xs text-muted-foreground">Sunucu: {config.config.smtpHost}:{config.config.smtpPort}</p><DialogFooter><Button variant="outline" disabled={testing} onClick={() => setTestOpen(false)}>Vazgeç</Button><Button disabled={blocked || dirty} className="gap-2" onClick={() => void test()}>{testing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}{testing ? 'Gönderiliyor…' : 'Kayıtlı alıcılara gönder'}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
