'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BellRing, CheckCircle2, Info, Clock3, Eye, Filter, Mail, RefreshCw, Search, ShieldCheck, SlidersHorizontal, TriangleAlert, X } from 'lucide-react';
import { PageHeading } from '@/components/ui/page-heading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { IncidentSeverityBadge, incidentAlarmIcon } from '@/components/dashboard/IncidentVisuals';
import { RuleInspector } from '@/components/alarms/RuleInspector';
import { RuleEmailSettings } from '@/components/alarms/RuleEmailSettings';
import { canAccessSync } from '@/lib/auth/permission-policy';
import { isAlarmRule, isRuleEmailConfig, requestRuleJson, ruleCategories, ruleCondition, ruleCooldown, ruleEmailState, ruleName, ruleSearchText, ruleSource, type AlarmRule, type RuleEmailConfig } from '@/lib/alarms/rule-workspace';
import styles from '@/components/alarms/rule-workspace.module.css';

interface Catalog { expected: number; installed: number; missing: string[]; synchronized: boolean }
export default function AlertSettingsPage() {
  const [rules, setRules] = useState<AlarmRule[] | null>(null);
  const [email, setEmail] = useState<RuleEmailConfig | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [writable, setWritable] = useState(false), [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({}), [notice, setNotice] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null), [selected, setSelected] = useState<AlarmRule | null>(null);
  const [search, setSearch] = useState(''), [category, setCategory] = useState('all'), [state, setState] = useState('all'), [severity, setSeverity] = useState('all');
  const [tab, setTab] = useState('rules'), [emailDirty, setEmailDirty] = useState(false);
  const sequence = useRef(0), active = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    const requestId = ++sequence.current; active.current?.abort(); const controller = new AbortController(); active.current = controller;
    setLoading(true);
    const results = await Promise.allSettled([
      requestRuleJson('/api/alarms/definitions', 'Alarm kuralları alınamadı.', { signal: controller.signal }),
      requestRuleJson('/api/alarms/notification', 'E-posta kanalı bilgileri alınamadı.', { signal: controller.signal }),
      requestRuleJson('/api/auth/me', 'Düzenleme yetkisi doğrulanamadı.', { signal: controller.signal }),
    ]);
    if (requestId !== sequence.current || controller.signal.aborted) return;
    const nextErrors: Record<string, string> = {};
    const [definitions, notification, actor] = results;
    if (definitions.status === 'fulfilled' && Array.isArray(definitions.value.data) && definitions.value.data.every(isAlarmRule)) { setRules(definitions.value.data); setCatalog(definitions.value.catalog ?? null); }
    else nextErrors.rules = definitions.status === 'rejected' ? definitions.reason.message : 'Alarm kuralları beklenen biçimde alınamadı.';
    if (notification.status === 'fulfilled' && isRuleEmailConfig(notification.value.data)) setEmail(notification.value.data);
    else nextErrors.email = notification.status === 'rejected' ? notification.reason.message : 'E-posta ayarları beklenen biçimde alınamadı.';
    if (actor.status === 'fulfilled' && typeof actor.value.user?.role === 'string') setWritable(canAccessSync(actor.value.user.role, 'alarms', 'write'));
    else { setWritable(false); nextErrors.permission = 'Düzenleme yetkisi doğrulanamadı. Salt okunur görünüm kullanılıyor.'; }
    setErrors(nextErrors); setLoading(false);
    if (!Object.keys(nextErrors).length) setUpdatedAt(new Date().toISOString());
  }, []);
  useEffect(() => { void load(); return () => { sequence.current += 1; active.current?.abort(); }; }, [load]);
  const all = rules || [];
  const term = ruleSearchText(search.trim());
  const filtered = all.filter(rule => (!term || ruleSearchText([rule.code, ruleName(rule), rule.description || '', ruleCategories[rule.category] || rule.category, ruleSource(rule)].join(' ')).includes(term)) && (category === 'all' || rule.category === category) && (state === 'all' || rule.enabled === (state === 'enabled')) && (severity === 'all' || rule.severity === severity));
  const categories = [...new Set(all.map(rule => rule.category))].sort((a, b) => {
    const order = Object.keys(ruleCategories), left = order.indexOf(a), right = order.indexOf(b);
    return (left === -1 ? 99 : left) - (right === -1 ? 99 : right) || a.localeCompare(b, 'tr');
  });
  const stats = [
    { icon: BellRing, label: 'Toplam kural', value: rules?.length, hint: 'Kayıtlı alarm tanımları' },
    { icon: ShieldCheck, label: 'Etkin kural', value: rules ? all.filter(rule => rule.enabled).length : undefined, hint: 'Alarm değerlendirmesine katılır' },
    { icon: Mail, label: 'E-posta seçili', value: rules ? all.filter(rule => rule.enabled && rule.notifyEmail).length : undefined, hint: 'Etkin kurallarda · kanal ayrıca gerekir' },
    { icon: TriangleAlert, label: 'Kritik kural', value: rules ? all.filter(rule => rule.enabled && rule.severity === 'ALARM_CRITICAL').length : undefined, hint: 'Etkin ve kritik öncelikte' },
  ];
  const hasFilter = !!term || category !== 'all' || state !== 'all' || severity !== 'all';
  const clearFilters = () => { setSearch(''); setCategory('all'); setState('all'); setSeverity('all'); };
  const inspect = (rule: AlarmRule) => <Button variant="outline" size="sm" className="gap-1.5" disabled={loading} aria-label={`${rule.code} kuralını incele`} onClick={() => setSelected(rule)}><Eye size={14} />İncele</Button>;
  const identity = (rule: AlarmRule) => { const Icon = incidentAlarmIcon(rule.code); return <div className={styles.ruleIdentity}><span><Icon size={18} /></span><div><h3>{ruleName(rule)}</h3><code>{rule.code}</code><p>{ruleSource(rule)}</p><IncidentSeverityBadge value={rule.severity} /></div></div>; };
  const delivery = (rule: AlarmRule) => { const value = ruleEmailState(rule, email, !!errors.email); return <SemanticBadge tone={value.tone} icon={Mail} className={styles.wrapBadge}>{value.label}</SemanticBadge>; };
  return <div className={styles.page}><div className={styles.workspace}>
    <header className={styles.header}><div><p className={styles.eyebrow}><SlidersHorizontal size={14} />Alarm yönetimi</p><PageHeading section="alerts" showIcon={false} className="text-2xl! font-semibold!">Alarm kuralları</PageHeading><p className="mt-2 text-sm text-muted-foreground">Tetikleme koşullarını inceleyin; kural durumunu, tekrar beklemesini ve e-posta tercihlerini yönetin.</p></div><Button variant="outline" className="gap-2" disabled={loading || emailDirty} onClick={() => void load()}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />{loading ? 'Yenileniyor…' : 'Yenile'}</Button></header>
    <div className={styles.serviceBar}><div className="flex flex-wrap items-center gap-2"><SemanticBadge tone="neutral" icon={ShieldCheck}>{writable && !errors.permission ? 'Düzenleme yetkisi var' : 'Salt okunur görünüm'}</SemanticBadge><SemanticBadge tone={!email || errors.email ? 'neutral' : !email.enabled ? 'neutral' : email.isConfigured ? 'info' : 'warning'} icon={Mail}>{!email || errors.email ? 'E-posta durumu bilinmiyor' : !email.enabled ? 'Ortak e-posta kapalı' : email.isConfigured ? 'E-posta kanalı açık' : 'E-posta ayarları eksik'}</SemanticBadge>{catalog && <SemanticBadge tone={errors.rules ? 'neutral' : catalog.synchronized ? 'info' : 'warning'}>Katalog {catalog.installed}/{catalog.expected}</SemanticBadge>}</div><span>{updatedAt ? `${Object.keys(errors).length ? 'Son tam güncelleme' : 'Son güncelleme'}: ${new Date(updatedAt).toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' })} TSİ` : 'Kaynak bilgileri yükleniyor veya doğrulanmayı bekliyor.'}</span></div>
    {Object.keys(errors).length > 0 && <div role="alert" className={styles.error}><TriangleAlert size={18} /><div>{Object.values(errors).map(value => <p key={value}>{value}</p>)}{rules && <p className="mt-1">Son alınan bilgiler gösteriliyor; güncellikleri doğrulanamadı.</p>}</div></div>}
    {notice && <div role="status" className={styles.notice}><CheckCircle2 size={16} /><p>{notice}</p><Button size="icon" variant="ghost" className="ml-auto h-7 w-7" aria-label="Bildirimi kapat" onClick={() => setNotice('')}><X size={14} /></Button></div>}
    <section className={styles.stats} aria-label="Kural özeti">{stats.map(({ icon: Icon, label, value, hint }) => <div className={styles.stat} key={label}><div><span>{label}</span><i><Icon size={17} /></i></div><strong>{value === undefined ? '—' : value}</strong><small>{hint}{errors.rules && rules ? ' · son alınan veri' : ''}</small></div>)}</section>
    <Tabs value={tab} onValueChange={setTab}><TabsList aria-label="Alarm ayarı bölümleri" className={styles.tabs}><TabsTrigger value="rules"><BellRing size={16} />Alarm kuralları</TabsTrigger><TabsTrigger value="email"><Mail size={16} />E-posta kanalı{emailDirty && <span className="h-2 w-2 rounded-full bg-amber-500" aria-label="Kaydedilmemiş değişiklikler" />}</TabsTrigger></TabsList>
      <TabsContent value="rules" className="mt-4 space-y-4"><div className={styles.toolbar}><div className={styles.search}><Search size={16} className="absolute left-3 top-3 text-muted-foreground" aria-hidden="true" /><Input aria-label="Kural ara" placeholder="Kural adı, kodu veya veri kaynağı…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} /></div><select aria-label="Kural kategorisi" value={category} onChange={e => setCategory(e.target.value)}><option value="all">Tüm kategoriler</option>{categories.map(value => <option key={value} value={value}>{ruleCategories[value] || value}</option>)}</select><select aria-label="Kural durumu" value={state} onChange={e => setState(e.target.value)}><option value="all">Tüm durumlar</option><option value="enabled">Etkin kurallar</option><option value="disabled">Kapalı kurallar</option></select><select aria-label="Kural önceliği" value={severity} onChange={e => setSeverity(e.target.value)}><option value="all">Tüm öncelikler</option><option value="ALARM_CRITICAL">Kritik</option><option value="ALARM_HIGH">Yüksek</option><option value="ALARM_MEDIUM">Orta</option><option value="ALARM_LOW">Düşük</option><option value="ALARM_INFO">Bilgi</option></select></div>
        <div className={styles.resultBar}><p role="status">{rules ? `${filtered.length} / ${rules.length} kural${errors.rules ? ' · son alınan veri' : ''}` : 'Kural sayısı bilinmiyor'}</p>{hasFilter && <Button variant="ghost" size="sm" className="gap-1.5" onClick={clearFilters}><X size={13} />Filtreleri temizle</Button>}</div>
        {!rules ? <div className={styles.empty}><BellRing size={28} /><h2>{loading ? 'Alarm kuralları yükleniyor…' : 'Kurallar yüklenemedi'}</h2><p>{loading ? 'Kayıtlı tanımlar hazırlanıyor.' : 'Bağlantınızı kontrol edip yeniden deneyin.'}</p>{!loading && <Button variant="outline" onClick={() => void load()}>Tekrar dene</Button>}</div> : !filtered.length ? <div className={styles.empty}><Filter size={28} /><h2>{hasFilter ? 'Bu filtrelerde kural bulunamadı' : 'Kayıtlı alarm kuralı yok'}</h2><p>{hasFilter ? 'Aramayı değiştirin veya filtreleri temizleyin.' : 'Alarm kataloğunun sunucuda hazırlanması gerekiyor.'}</p>{hasFilter && <Button variant="outline" onClick={clearFilters}>Filtreleri temizle</Button>}</div> : categories.map(value => {
          const group = filtered.filter(rule => rule.category === value); if (!group.length) return null;
          return <section key={value} className={styles.collection} aria-label={ruleCategories[value] || value}><div className={styles.sectionHeader}><h2><BellRing size={17} />{ruleCategories[value] || value}<span className="text-xs font-normal text-muted-foreground">{group.length} kural</span></h2></div><div className={styles.tableWrap}><table className={styles.table}><caption className="sr-only">{ruleCategories[value] || value} alarm kuralları</caption><thead><tr><th scope="col">Kural / öncelik</th><th scope="col">Durum</th><th scope="col">Koşul ve tekrar beklemesi</th><th scope="col">E-posta bildirimi</th><th scope="col">Ayrıntılar</th></tr></thead><tbody>{group.map(rule => { const condition = ruleCondition(rule); return <tr key={rule.id}><td>{identity(rule)}</td><td><SemanticBadge tone={rule.enabled ? 'info' : 'neutral'}>{rule.enabled ? 'Etkin' : 'Kapalı'}</SemanticBadge></td><td><p className="text-xs font-medium">{condition.label}</p><p className={styles.help}>{condition.window}</p><p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground"><Clock3 size={13} className="mt-0.5 shrink-0" />{ruleCooldown(rule)}</p></td><td>{delivery(rule)}</td><td>{inspect(rule)}</td></tr>; })}</tbody></table></div><div className={styles.mobileList}>{group.map(rule => { const condition = ruleCondition(rule); return <article key={rule.id} className={styles.record}>{identity(rule)}<div className="mt-4 flex flex-wrap gap-2"><SemanticBadge tone={rule.enabled ? 'info' : 'neutral'}>{rule.enabled ? 'Etkin' : 'Kapalı'}</SemanticBadge>{delivery(rule)}</div><dl className={styles.cardFacts}><div><dt>Koşul / eşik</dt><dd>{condition.label}<small>{condition.window}</small></dd></div><div><dt>Tekrar beklemesi</dt><dd>{ruleCooldown(rule)}</dd></div></dl><div className="mt-4 flex justify-end border-t border-border pt-3">{inspect(rule)}</div></article>; })}</div></section>;
        })}
        <p className={styles.help}><Info size={14} className="mr-1 inline text-primary" />Etkin kural sayısı veri kaynağının sağlığını göstermez. Bildirim etiketleri kayıtlı ayarlardır; e-posta teslim durumunu göstermez.</p>
      </TabsContent>
      <TabsContent value="email" forceMount className={tab === 'email' ? 'mt-4' : 'hidden'}>{email ? <RuleEmailSettings config={email} writable={writable && !errors.email && !errors.permission} refreshing={loading} onDirty={setEmailDirty} onSaved={config => setEmail(config)} /> : <div className={styles.empty}><Mail size={28} /><h2>{loading ? 'E-posta ayarları yükleniyor…' : 'E-posta ayarları yüklenemedi'}</h2>{!loading && <Button variant="outline" onClick={() => void load()}>Tekrar dene</Button>}</div>}</TabsContent>
    </Tabs>
    {emailDirty && tab !== 'email' && <p className={styles.help}>E-posta kanalında kaydedilmemiş değişiklikler var. Yenilemek için önce kaydedin veya değişiklikleri sıfırlayın.</p>}
  </div>{selected && <RuleInspector key={selected.id} rule={selected} email={email} emailStale={!!errors.email} writable={writable && !errors.rules && !errors.permission && !loading} onClose={() => setSelected(null)} onSaved={updated => { setRules(previous => previous?.map(rule => rule.id === updated.id ? { ...rule, ...updated } : rule) || null); setSelected(null); setNotice(`${ruleName(updated)} kuralı kaydedildi.`); }} />}</div>;
}
