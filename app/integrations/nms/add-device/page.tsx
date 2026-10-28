'use client';

import { createContext, FormEvent, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Activity, AlertCircle, ArrowLeft, ArrowRight, Cable, CheckCircle2, ChevronDown, Clock3, Eye, EyeOff, KeyRound, Loader2, LockKeyhole, MapPin, Network, RefreshCw, Server, Settings2, ShieldCheck, Terminal, UserRound, type LucideIcon } from 'lucide-react';
import { ActionIcon } from '@/components/ui/action-icon';
import { PageHeading } from '@/components/ui/page-heading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { InventoryDevicePicker, type InventoryDeviceOption } from '@/components/nms/InventoryDevicePicker';
import { SnmpConnectionTest, type SnmpTestState } from '@/components/nms/SnmpConnectionTest';
import { uiError } from '@/lib/i18n/tr';
import { cn } from '@/lib/utils';
import { notifyDeviceInventoryChanged } from '@/lib/device-inventory-events';
import { addNmsPayload, affectsSnmpTest, parseSnmpTestResult, snmpTestPayload, validateAddNmsForm } from '@/lib/nms/add-device-form';
import { BACKUP_PROFILES } from '@/lib/nms/backup-platform';
import styles from './page.module.css';

type SnmpVersion = 'v2c' | 'v3';
type SnmpV3SecurityLevel = 'authNoPriv' | 'authPriv';
const ValidationContext = createContext<Record<string, string>>({});
const fieldIcons: Record<string, LucideIcon> = {
  managementIp: MapPin, snmpPort: Cable, pollingInterval: Clock3, snmpVersion: Network,
  snmpCommunity: KeyRound, snmpV3Username: UserRound, snmpV3SecurityLevel: ShieldCheck,
  snmpV3AuthProtocol: ShieldCheck, snmpV3AuthPassword: KeyRound, snmpV3PrivacyProtocol: LockKeyhole,
  snmpV3PrivacyPassword: KeyRound, sshUsername: UserRound, sshPort: Cable, sshPassword: KeyRound, backupPlatform: Terminal,
};

export default function AddNmsDevicePage() {
  const router = useRouter();
  const [inventoryDevices, setInventoryDevices] = useState<InventoryDeviceOption[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [customPolling, setCustomPolling] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showCommunity, setShowCommunity] = useState(false);
  const [showSnmpAuthPassword, setShowSnmpAuthPassword] = useState(false);
  const [showSnmpPrivacyPassword, setShowSnmpPrivacyPassword] = useState(false);
  const [showSshPassword, setShowSshPassword] = useState(false);
  const [sshEnabled, setSshEnabled] = useState(false);
  const [form, setForm] = useState({
    deviceId: '',
    managementIp: '',
    snmpPort: 161,
    snmpVersion: 'v2c' as SnmpVersion,
    snmpCommunity: '',
    snmpV3Username: '',
    snmpV3SecurityLevel: 'authPriv' as SnmpV3SecurityLevel,
    snmpV3AuthProtocol: 'SHA',
    snmpV3AuthPassword: '',
    snmpV3PrivacyProtocol: 'AES',
    snmpV3PrivacyPassword: '',
    pollingInterval: 300,
    pollingEnabled: true,
    sshUsername: '',
    sshPassword: '',
    sshPort: 22,
    backupPlatform: '',
  });

  const [testState, setTestState] = useState<SnmpTestState>({ status: 'idle' });
  const testController = useRef<AbortController | null>(null);
  const testRevision = useRef(0);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { testRevision.current += 1; testController.current?.abort(); if (successTimer.current) clearTimeout(successTimer.current); }, []);
  const invalidateTest = () => {
    testRevision.current += 1;
    testController.current?.abort();
    setTestState(current => current.status === 'idle' ? current : { status: 'stale' });
  };

  const availableDevices = useMemo(
    () => inventoryDevices.filter((device) => device.nmsDeviceId == null),
    [inventoryDevices]
  );
  const selectedDevice = useMemo(
    () => inventoryDevices.find((device) => device.id === form.deviceId) ?? null,
    [form.deviceId, inventoryDevices]
  );
  const validationErrors = validateAddNmsForm(form, sshEnabled);
  if (selectedDevice?.nmsDeviceId != null) validationErrors.device = 'Bu cihaz zaten izleniyor. Başka bir cihaz seçin.';
  const visibleErrors = submitted ? validationErrors : {};
  const validationFor = (id: string) => ({ 'aria-invalid': !!visibleErrors[id], 'aria-describedby': visibleErrors[id] ? `${id}-error` : undefined });
  const inventoryUnavailable = !loadingDevices && !inventoryError && availableDevices.length === 0;

  const set = <Key extends keyof typeof form>(key: Key, value: (typeof form)[Key]) => {
    if (affectsSnmpTest(key)) invalidateTest();
    setForm((current) => ({ ...current, [key]: value }));
    setError(null);
  };

  useEffect(() => {
    let cancelled = false;

    async function loadInventoryDevices() {
      setLoadingDevices(true);
      setInventoryError(null);
      try {
        const devices: InventoryDeviceOption[] = [];
        let page = 1;
        let totalPages = 1;
        do {
          const response = await fetch(`/api/devices?filterType=all&mode=minimal&limit=200&page=${page}`);
          const data = await response.json();
          if (!response.ok || !data.success) throw new Error(uiError('Envanter cihazları yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.'));
          devices.push(...(data.data || []));
          totalPages = data.totalPages || 1;
          page += 1;
        } while (page <= totalPages && !cancelled);
        if (!cancelled) setInventoryDevices(devices);
      } catch (loadError) {
        if (!cancelled) setInventoryError(uiError(loadError instanceof Error ? loadError.message : 'Envanter cihazları yüklenemedi'));
      } finally {
        if (!cancelled) setLoadingDevices(false);
      }
    }

    loadInventoryDevices();
    return () => { cancelled = true; };
  }, [retryCount]);

  function selectDevice(deviceId: string) {
    invalidateTest();
    const device = inventoryDevices.find((item) => item.id === deviceId);
    setForm((current) => ({
      ...current,
      deviceId,
      managementIp: device?.managementIp || '',
      backupPlatform: '',
    }));
    setError(null);
  }

  const testErrors = validateAddNmsForm(form, false);
  const testReady = !!selectedDevice && selectedDevice.nmsDeviceId == null && !Object.keys(testErrors).some(key => key === 'device' || key === 'managementIp' || key.startsWith('snmp'));

  async function testConnection() {
    if (!testReady || testState.status === 'running' || saving || success) return;
    testController.current?.abort();
    const controller = new AbortController(); testController.current = controller;
    const revision = ++testRevision.current;
    const timer = setTimeout(() => controller.abort(), 15000);
    setTestState({ status: 'running' });
    try {
      const response = await fetch('/api/integrations/nms/test-connection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snmpTestPayload(form)), signal: controller.signal });
      const data = await response.json();
      if (revision !== testRevision.current) return;
      if (!response.ok) throw new Error(uiError(typeof data.error === 'string' ? data.error : 'Test hizmetinden sonuç alınamadı.'));
      const result = parseSnmpTestResult(data.result);
      if (!result) throw new Error('Test hizmetinden geçerli bir sonuç alınamadı.');
      setTestState({ status: result.reachable ? 'success' : 'failure', result });
    } catch (failure) {
      if (revision === testRevision.current) setTestState({ status: 'failure', error: controller.signal.aborted ? 'Test süresi doldu. NMS ajanının ve cihazın erişilebilirliğini kontrol edip tekrar deneyin.' : uiError(failure instanceof Error ? failure.message : 'Test tamamlanamadı.') });
    } finally { clearTimeout(timer); }
  }
  function cancelTest() { testRevision.current += 1; testController.current?.abort(); setTestState({ status: 'cancelled' }); }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || success || testState.status === 'running' || loadingDevices || inventoryError || availableDevices.length === 0) return;
    setSubmitted(true);
    if (Object.keys(validationErrors).length) {
      const focusInvalid = () => {
        const firstInvalidField = document.getElementById(Object.keys(validationErrors)[0]);
        firstInvalidField?.focus({ preventScroll: true });
        firstInvalidField?.scrollIntoView({ block: 'center' });
      };
      if (['snmpPort', 'sshPort', 'pollingInterval'].some(key => validationErrors[key])) {
        setAdvancedOpen(true);
        if (validationErrors.pollingInterval) setCustomPolling(true);
        requestAnimationFrame(focusInvalid);
      } else focusInvalid();
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const response = await fetch('/api/integrations/nms/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addNmsPayload(form, sshEnabled)),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(uiError(data.error || 'Cihaz NMS izlemeye alınamadı.'));

      setSuccess(true);
      notifyDeviceInventoryChanged({ action: 'update', deviceId: form.deviceId, source: 'nms-add-device' });
      successTimer.current = setTimeout(() => router.push('/integrations/nms/devices'), 900);
    } catch (saveError) {
      setError(uiError(saveError instanceof Error ? saveError.message : 'Beklenmeyen hata oluştu.'));
    } finally {
      setSaving(false);
    }
  }

  const busy = saving || success;
  return <div className={styles.page}>
    <header className={styles.header}>
      <Button variant="outline" size="icon" asChild className="h-8 w-8 shrink-0" aria-label="NMS izlenen cihazlara dön" title="İzlenen cihazlara dön"><Link href="/integrations/nms/devices"><ArrowLeft className="h-4 w-4" /></Link></Button>
      <PageHeading section="addDevice" compact showIcon={false} className="min-w-0 text-base sm:text-lg">Cihazı izlemeye al</PageHeading>
    </header>
    <ValidationContext.Provider value={visibleErrors}>
    <form onSubmit={handleSubmit} className={styles.form} noValidate>
      <div className={styles.card}>
        <section className={styles.section} aria-label="Envanter cihazı">
          {loadingDevices ? <div role="status" className={styles.loading}><Loader2 className="h-4 w-4 animate-spin" />Envanter cihazları yükleniyor…</div>
          : inventoryError ? <div role="alert" className={styles.inventoryError}><p>Envantere ulaşılamadı</p><p className="text-xs text-muted-foreground">{inventoryError}</p><Button type="button" variant="outline" size="sm" onClick={() => setRetryCount(value => value + 1)}><RefreshCw className="mr-2 h-3.5 w-3.5" />Tekrar dene</Button></div>
          : inventoryUnavailable ? <div className={styles.empty}>
            {inventoryDevices.length ? <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-primary" /> : <Server className="mx-auto mb-3 h-8 w-8 text-primary" />}
            <h2 className="text-sm font-semibold">{inventoryDevices.length ? 'Tüm cihazlar zaten izleniyor' : 'Önce envantere bir cihaz ekleyin'}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{inventoryDevices.length ? 'İzleme ayarlarını cihaz listesinden yönetin veya envantere cihaz ekleyin.' : 'İzlemeye almak için envanterde bir cihaz oluşturun.'}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2"><Button size="sm" asChild><Link href={inventoryDevices.length ? '/integrations/nms/devices' : '/devices'}>{inventoryDevices.length ? 'İzlenen cihazlara git' : 'Envantere git'}<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>{inventoryDevices.length > 0 && <Button size="sm" variant="outline" asChild><Link href="/devices">Envantere cihaz ekle</Link></Button>}</div>
          </div> : <Field label="Cihaz" htmlFor="device" required>
            <InventoryDevicePicker devices={availableDevices} value={selectedDevice} onSelect={selectDevice} disabled={busy} invalid={!!visibleErrors.device} describedBy={visibleErrors.device ? 'device-error' : undefined} />
          </Field>}
        </section>
        {selectedDevice && !inventoryError && <fieldset disabled={busy} className={styles.fields}>
          <legend className="sr-only">İzleme yapılandırması</legend>
          <section className={styles.section} aria-labelledby="snmp-heading">
            <h2 id="snmp-heading" className={styles.sectionTitle}><ShieldCheck size={16} />SNMP erişimi</h2>
            <div className={styles.connectionGrid}>
              <Field label="Yönetim IP adresi" htmlFor="managementIp" required><Input id="managementIp" {...validationFor('managementIp')} required autoComplete="off" placeholder="Örn. 10.10.10.15" value={form.managementIp} onChange={event => set('managementIp', event.target.value)} /></Field>
              <Field label="SNMP sürümü" htmlFor="snmpVersion"><select id="snmpVersion" value={form.snmpVersion} onChange={event => set('snmpVersion', event.target.value as SnmpVersion)}><option value="v2c">SNMPv2c</option><option value="v3">SNMPv3</option></select></Field>
              {form.snmpVersion === 'v2c' && <Field label="Topluluk adı (community)" htmlFor="snmpCommunity" required><div className="relative"><Input id="snmpCommunity" {...validationFor('snmpCommunity')} required type={showCommunity ? 'text' : 'password'} autoComplete="new-password" maxLength={255} value={form.snmpCommunity} onChange={event => set('snmpCommunity', event.target.value)} className="pr-10" /><PasswordToggle visible={showCommunity} onClick={() => setShowCommunity(value => !value)} label="Gizli community değerini göster veya gizle" /></div></Field>}
            </div>
              {form.snmpVersion === 'v3' && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Kullanıcı adı" htmlFor="snmpV3Username" required>
                    <Input id="snmpV3Username" {...validationFor('snmpV3Username')} required autoComplete="off" placeholder="infrascope-monitor" value={form.snmpV3Username} onChange={(event) => set('snmpV3Username', event.target.value)} />
                  </Field>
                  <Field label="Güvenlik seviyesi" htmlFor="snmpV3SecurityLevel" required>
                    <select id="snmpV3SecurityLevel" value={form.snmpV3SecurityLevel} onChange={(event) => set('snmpV3SecurityLevel', event.target.value as SnmpV3SecurityLevel)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><option value="authPriv">Doğrulama + şifreleme</option><option value="authNoPriv">Yalnızca doğrulama</option></select>
                  </Field>
                  <Field label="Doğrulama protokolü" htmlFor="snmpV3AuthProtocol">
                    <select id="snmpV3AuthProtocol" value={form.snmpV3AuthProtocol} onChange={(event) => set('snmpV3AuthProtocol', event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><option value="SHA">SHA</option><option value="SHA-256">SHA-256</option></select>
                  </Field>
                  <Field label="Doğrulama parolası" htmlFor="snmpV3AuthPassword" required>
                    <div className="relative"><Input id="snmpV3AuthPassword" {...validationFor('snmpV3AuthPassword')} required type={showSnmpAuthPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} maxLength={255} value={form.snmpV3AuthPassword} onChange={(event) => set('snmpV3AuthPassword', event.target.value)} className="pr-10" /><PasswordToggle visible={showSnmpAuthPassword} onClick={() => setShowSnmpAuthPassword((visible) => !visible)} label="SNMPv3 doğrulama parolasını göster veya gizle" /></div>
                  </Field>
                  {form.snmpV3SecurityLevel === 'authPriv' && (
                    <>
                      <Field label="Şifreleme protokolü" htmlFor="snmpV3PrivacyProtocol">
                        <select id="snmpV3PrivacyProtocol" value={form.snmpV3PrivacyProtocol} onChange={(event) => set('snmpV3PrivacyProtocol', event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><option value="AES">AES-128</option></select>
                      </Field>
                      <Field label="Şifreleme parolası" htmlFor="snmpV3PrivacyPassword" required>
                        <div className="relative"><Input id="snmpV3PrivacyPassword" {...validationFor('snmpV3PrivacyPassword')} required type={showSnmpPrivacyPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} maxLength={255} value={form.snmpV3PrivacyPassword} onChange={(event) => set('snmpV3PrivacyPassword', event.target.value)} className="pr-10" /><PasswordToggle visible={showSnmpPrivacyPassword} onClick={() => setShowSnmpPrivacyPassword((visible) => !visible)} label="SNMPv3 şifreleme parolasını göster veya gizle" /></div>
                      </Field>
                    </>
                  )}
                </div>
              )}
          </section>
          <section className={styles.section} aria-labelledby="ssh-heading">
            <div className={styles.toggleRow}><h2 id="ssh-heading" className={styles.inlineTitle}><Terminal size={16} />SSH erişimi <span className="text-xs font-normal text-muted-foreground">İsteğe bağlı</span></h2><Switch id="sshEnabled" checked={sshEnabled} onCheckedChange={setSshEnabled} aria-label="SSH erişimini etkinleştir" /></div>
            {sshEnabled && <div className={styles.sshGrid}>
              <Field label="İşletim sistemi (yedekleme)" htmlFor="backupPlatform" required><select id="backupPlatform" {...validationFor('backupPlatform')} required value={form.backupPlatform} onChange={event => set('backupPlatform', event.target.value)}><option value="">İşletim sistemi seçin</option>{Object.entries(BACKUP_PROFILES).map(([key, profile]) => <option key={key} value={key}>{profile.label}</option>)}</select></Field>
              <Field label="Kullanıcı adı" htmlFor="sshUsername" required><Input id="sshUsername" {...validationFor('sshUsername')} required autoComplete="username" value={form.sshUsername} onChange={event => set('sshUsername', event.target.value)} /></Field>
              <Field label="Parola" htmlFor="sshPassword"><div className="relative"><Input id="sshPassword" type={showSshPassword ? 'text' : 'password'} autoComplete="new-password" value={form.sshPassword} onChange={event => set('sshPassword', event.target.value)} className="pr-10" /><PasswordToggle visible={showSshPassword} onClick={() => setShowSshPassword(value => !value)} label="Gizli SSH değerini göster veya gizle" /></div></Field>
            </div>}
          </section>
          <section className={styles.advanced}>
            <button type="button" className={styles.advancedToggle} aria-expanded={advancedOpen} aria-controls="advanced-settings" onClick={() => setAdvancedOpen(value => !value)}><Settings2 size={16} /><span>Gelişmiş ayarlar</span><ChevronDown size={16} className={cn(styles.chevron, advancedOpen && styles.chevronOpen)} /></button>
            <div id="advanced-settings" hidden={!advancedOpen}>
              <div className={styles.advancedGrid}>
                <Field label="SNMP portu" htmlFor="snmpPort"><Input id="snmpPort" {...validationFor('snmpPort')} type="number" min={1} max={65535} value={form.snmpPort} onChange={event => set('snmpPort', Number(event.target.value))} /></Field>
                {sshEnabled && <Field label="SSH portu" htmlFor="sshPort"><Input id="sshPort" {...validationFor('sshPort')} type="number" min={1} max={65535} value={form.sshPort} onChange={event => set('sshPort', Number(event.target.value))} /></Field>}
                <Field label="Ölçüm aralığı" htmlFor="pollingPreset"><select id="pollingPreset" value={customPolling ? 'custom' : String(form.pollingInterval)} onChange={event => { const custom = event.target.value === 'custom'; setCustomPolling(custom); if (!custom) set('pollingInterval', Number(event.target.value)); }}><option value="30">30 saniye</option><option value="60">1 dakika</option><option value="300">5 dakika</option><option value="900">15 dakika</option><option value="custom">Özel</option></select></Field>
                {customPolling && <Field label="Ölçüm aralığı (saniye)" htmlFor="pollingInterval" required><Input id="pollingInterval" {...validationFor('pollingInterval')} type="number" min={30} max={86400} value={form.pollingInterval} onChange={event => set('pollingInterval', Number(event.target.value))} /></Field>}
              </div>
            </div>
          </section>
          <SnmpConnectionTest compact state={testState} ready={testReady && !busy} onTest={() => void testConnection()} onCancel={cancelTest} />
        </fieldset>}
      </div>
      {!inventoryUnavailable && !inventoryError && selectedDevice && <div className={styles.actions} role="group" aria-label="Kayıt işlemleri">
        {(submitted && Object.keys(validationErrors).length > 0 || error || success) && <div className={styles.feedback}>
          {submitted && Object.keys(validationErrors).length > 0 && <p role="alert" className="text-destructive">İşaretli alanları kontrol edin.</p>}
          {error && <p role="alert" className="text-destructive">{uiError(error)}</p>}
          {success && <p role="status" className="text-primary">İzleme ayarları kaydedildi. Cihaz listesine yönlendiriliyorsunuz.</p>}
        </div>}
        <div className={styles.actionRow}>
          <div className={styles.startToggle}><Switch id="pollingEnabled" checked={form.pollingEnabled} onCheckedChange={value => set('pollingEnabled', value)} disabled={busy} aria-label="Kaydettikten sonra veri toplamayı başlat" /><Label htmlFor="pollingEnabled">Kaydederken izlemeyi başlat</Label></div>
          <div className={styles.buttons}><Button size="sm" type="button" variant="outline" onClick={() => router.push('/integrations/nms/devices')} disabled={busy || testState.status === 'running'}><ActionIcon action="cancel" />Vazgeç</Button><Button size="sm" type="submit" disabled={busy || testState.status === 'running'}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : success ? <CheckCircle2 className="h-4 w-4" /> : <Activity className="h-4 w-4" />}{saving ? 'Kaydediliyor…' : success ? 'Kaydedildi' : form.pollingEnabled ? 'Kaydet ve izlemeyi başlat' : 'İzleme ayarlarını kaydet'}</Button></div>
        </div>
      </div>}
    </form>
    </ValidationContext.Provider>
  </div>;
}

function Field({ label, htmlFor, children, required }: { label: string; htmlFor: string; children: React.ReactNode; required?: boolean }) {
  const errors = useContext(ValidationContext);
  const Icon = fieldIcons[htmlFor];
  return <div className={styles.field}><Label htmlFor={htmlFor}>{Icon && <Icon aria-hidden="true" size={13} />}{label}{required && <span className="text-destructive" aria-hidden="true">*</span>}</Label>{children}{errors[htmlFor] && <p id={`${htmlFor}-error`} className={styles.fieldError}><AlertCircle aria-hidden="true" size={13} />{errors[htmlFor]}</p>}</div>;
}

function PasswordToggle({ visible, onClick, label }: { visible: boolean; onClick: () => void; label: string }) {
  return <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2" aria-label={label} aria-pressed={visible} title={label} onClick={onClick}>{visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>;
}
