'use client';
import { useState } from 'react';
import { BellRing, Clock3, Info, Loader2, Mail, Save, Settings2, SlidersHorizontal } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { IncidentSeverityBadge } from '@/components/dashboard/IncidentVisuals';
import { ruleCondition, ruleCooldown, ruleEmailState, ruleName, rulePatch, ruleSource, requestRuleJson, type AlarmRule, type RuleDraft, type RuleEmailConfig } from '@/lib/alarms/rule-workspace';
import styles from './rule-workspace.module.css';

export function RuleInspector({ rule, email, emailStale, writable, onClose, onSaved }: { rule: AlarmRule; email: RuleEmailConfig | null; emailStale: boolean; writable: boolean; onClose: () => void; onSaved: (rule: AlarmRule) => void }) {
  const [draft, setDraft] = useState<RuleDraft>({ enabled: rule.enabled, notifyEmail: rule.notifyEmail, cooldown: String(rule.cooldownMinutes) });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const condition = ruleCondition(rule), delivery = ruleEmailState(draft, email, emailStale);
  const dirty = draft.enabled !== rule.enabled || draft.notifyEmail !== rule.notifyEmail || draft.cooldown !== String(rule.cooldownMinutes);
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy || !writable) return;
    let patch;
    try { patch = rulePatch(rule, draft); } catch (cause) { setError((cause as Error).message); return; }
    if (!patch) return;
    setBusy(true); setError('');
    try {
      const body = await requestRuleJson('/api/alarms/definitions', 'Kural kaydedilemedi. Kayıtlı durumu kontrol edip tekrar deneyin.', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      if (body.data?.id !== rule.id || typeof body.data.enabled !== 'boolean' || typeof body.data.notifyEmail !== 'boolean' || !Number.isInteger(body.data.cooldownMinutes)) throw new Error('Kaydetme yanıtı doğrulanamadı. Listeyi yenileyip kontrol edin.');
      onSaved({ ...rule, ...body.data });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Kural kaydedilemedi.'); }
    finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><BellRing size={20} className="shrink-0 text-primary" />Kural ayrıntıları</DialogTitle><DialogDescription>{ruleName(rule)}</DialogDescription></DialogHeader>
    <div className={styles.detailIdentity}><IncidentSeverityBadge value={rule.severity} /><SemanticBadge tone="neutral">{ruleSource(rule)}</SemanticBadge><code>{rule.code}</code></div>
    <section className={styles.conditionPanel}><h3><SlidersHorizontal size={16} />Ne zaman alarm oluşur?</h3><strong>{condition.label}</strong><p>{condition.detail}</p><dl className={styles.conditionFacts}><div><dt>Değerlendirme aralığı</dt><dd>{condition.window}</dd></div><div><dt>Kayıtlı olay sayısı</dt><dd>{rule._count?.alarmEvents == null ? 'Bilinmiyor' : rule._count.alarmEvents.toLocaleString('tr-TR')}<small>Geçmişte kaydedilen olaylar; açık olay sayısı değildir.</small></dd></div></dl><p className={styles.help}><Info size={14} />Tetikleme koşulu alarm kataloğunda yönetilir. Bu ekranda kural durumu, tekrar beklemesi ve bildirim tercihi düzenlenir.</p></section>
    <form onSubmit={save} noValidate><fieldset disabled={busy || !writable} className={styles.ruleForm}><legend className="sr-only">Kural ayarları</legend>
      <div className={styles.switchRow}><div><Label htmlFor="rule-enabled">Kuralı etkinleştir</Label><p>Etkin kurallar alarm değerlendirmesine katılır. Kapatmak geçmiş olayları silmez.</p></div><Switch id="rule-enabled" checked={draft.enabled} onCheckedChange={enabled => setDraft({ ...draft, enabled })} /></div>
      <div><Label htmlFor="rule-cooldown" className="flex items-center gap-2"><Clock3 size={15} />Tekrar beklemesi (dakika)</Label><Input id="rule-cooldown" className="mt-2 max-w-xs" type="number" min={0} max={525600} step={1} value={draft.cooldown} onChange={e => setDraft({ ...draft, cooldown: e.target.value })} aria-describedby="rule-cooldown-help" /><p id="rule-cooldown-help" className={styles.help}>Yeni olayların tekrarlarını sınırlar. E-posta gönderim sınırları ayrıca uygulanır.{rule.code === 'NMS_BACKUP_FAILED' && ' Cihaz yedeği kuralında en az 1 dakika uygulanır.'} Kayıtlı değer: {ruleCooldown(rule)}.</p></div>
      <div className={styles.switchRow}><div><Label htmlFor="rule-email">Bu kural için e-posta iste</Label><p>İleti gönderilebilmesi için kuralın ve ortak e-posta kanalının da açık olması gerekir.</p></div><Switch id="rule-email" checked={draft.notifyEmail} onCheckedChange={notifyEmail => setDraft({ ...draft, notifyEmail })} /></div>
    </fieldset><div className="mt-4 flex flex-wrap items-center gap-2"><Mail size={16} className="text-primary" /><SemanticBadge tone={delivery.tone}>{delivery.label}</SemanticBadge><span className="text-xs text-muted-foreground">{dirty ? 'Kaydedilirse uygulanacak durum' : 'Kayıtlı ayarlara göre'} · teslim doğrulaması değildir.</span></div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {!writable && <p className={styles.help}>Salt okunur görünüm. Düzenleme yetkisi veya güncel kural bilgisi gerekiyor.</p>}
      <DialogFooter className="mt-5"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{dirty ? 'Vazgeç' : 'Kapat'}</Button>{writable && <Button type="submit" disabled={busy || !dirty} className="gap-2">{busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{busy ? 'Kaydediliyor…' : 'Değişiklikleri kaydet'}</Button>}</DialogFooter>
    </form>
    <details className={styles.technical}><summary><Settings2 size={15} />Kaynak filtresi ve katalog değerleri</summary><dl className={styles.technicalFields}><div><dt>Kaynak filtresi</dt><dd><code>{typeof rule.detectionLogic?.filter === 'string' && rule.detectionLogic.filter || 'Ek kaynak filtresi kaydedilmemiş'}</code></dd></div><div><dt>Katalog eşiği</dt><dd>{typeof rule.detectionLogic?.threshold === 'number' ? String(rule.detectionLogic.threshold) : 'Kaydedilmemiş'}</dd></div><div><dt>Katalog penceresi</dt><dd>{typeof rule.detectionLogic?.timeWindowMinutes === 'number' ? `${rule.detectionLogic.timeWindowMinutes} dakika` : 'Kaydedilmemiş'}</dd></div></dl>{Boolean(rule.detectionLogic?.correlationRules) && <pre className={styles.raw}>{JSON.stringify(rule.detectionLogic.correlationRules, null, 2)}</pre>}</details>
  </DialogContent></Dialog>;
}
