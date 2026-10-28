'use client';

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, CheckCircle2, ChevronDown, Eye, EyeOff, Fingerprint, Loader2, RefreshCw, RotateCcw, Save, Settings2, ShieldCheck, Terminal } from 'lucide-react';
import { PageHeading, PageStateFrame } from '@/components/ui/page-heading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { usePageBreadcrumb } from '@/components/layout/BreadcrumbProvider';
import { buildEditPayload, createEditForm, getEditChanges, validateEditForm, type EditableNmsDevice as DbDevice, type NmsEditForm, type SnmpVersion, type SnmpV3SecurityLevel } from '@/lib/nms/edit-device-form';
import { uiError } from '@/lib/i18n/tr';
import { cn } from '@/lib/utils';
import { BACKUP_PROFILES } from '@/lib/nms/backup-platform';
import sharedStyles from '../../../add-device/page.module.css';
import editStyles from './page.module.css';

const styles = { ...sharedStyles, ...editStyles };
const ValidationContext = createContext<Record<string, string>>({});
const pollingPresets = [30, 60, 300, 900];
type HostKeyState = {
  observed: { algorithm: string; fingerprint: string; observed_at: string };
  trusted: { algorithm: string | null; fingerprint: string; matches: boolean } | null;
};

export default function EditNmsDevicePage() {
  const params = useParams();
  const router = useRouter();
  const deviceId = params.id as string;

  const [initialDevice, setInitialDevice] = useState<DbDevice | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showCommunity, setShowCommunity] = useState(false);
  const [showSnmpAuthPassword, setShowSnmpAuthPassword] = useState(false);
  const [showSnmpPrivacyPassword, setShowSnmpPrivacyPassword] = useState(false);
  const [showSshPassword, setShowSshPassword] = useState(false);
  const [hostKey, setHostKey] = useState<HostKeyState | null>(null);
  const [checkingHostKey, setCheckingHostKey] = useState(false);
  const [trustingHostKey, setTrustingHostKey] = useState(false);

  const [form, setForm] = useState(createEditForm);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [sshOpen, setSshOpen] = useState(false);
  const [customPolling, setCustomPolling] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [hostKeyError, setHostKeyError] = useState<string | null>(null);
  const [hostKeyNotice, setHostKeyNotice] = useState('');
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hostKeyRequest = useRef<AbortController | null>(null);
  const fieldErrors = initialDevice ? validateEditForm(form, initialDevice) : {};
  const visibleErrors = submitted ? fieldErrors : {};
  const changes = initialDevice ? getEditChanges(form, initialDevice) : [];
  const busy = saving || success || checkingHostKey || trustingHostKey;
  const validationFor = (id: string) => ({
    'aria-invalid': !!visibleErrors[id],
    'aria-describedby': visibleErrors[id] ? `${id}-error` : undefined,
  });
  const breadcrumbItems = useMemo(() => initialDevice ? [
    { label: 'NMS İzlenen Cihazlar', href: '/integrations/nms/devices' },
    { label: initialDevice.name, href: `/integrations/nms/devices/${deviceId}` },
    { label: 'İzleme Ayarları' },
  ] : null, [deviceId, initialDevice]);
  usePageBreadcrumb(breadcrumbItems);
  const sshTargetDirty = Boolean(
    initialDevice
    && (
      form.managementIp.trim() !== (initialDevice.managementIp || '')
      || form.sshPort !== (initialDevice.sshPort ?? 22)
    )
  );

  useEffect(() => {
    let cancelled = false;

    async function loadDevice() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/integrations/nms/devices/${deviceId}`);
        const data = await response.json();
        if (!response.ok || !data.device) throw new Error(uiError('Cihaz ayarları yüklenemedi. Bağlantınızı ve erişim yetkinizi kontrol edip tekrar deneyin.'));
        if (cancelled) return;

        const device = data.device as DbDevice;
        setInitialDevice(device);
        setForm(createEditForm(device));
        setAdvancedOpen(false);
        setSshOpen(false);
        setCustomPolling(!pollingPresets.includes(device.pollingInterval ?? 300));
      } catch (loadError) {
        if (!cancelled) {
          setError(uiError(loadError instanceof Error ? loadError.message : 'Cihaz bilgileri yüklenemedi'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (deviceId) loadDevice();
    return () => {
      cancelled = true;
    };
  }, [deviceId, retryCount]);

  useEffect(() => () => {
    hostKeyRequest.current?.abort();
    if (redirectTimer.current) clearTimeout(redirectTimer.current);
  }, []);

  const set = <Key extends keyof NmsEditForm>(key: Key, value: NmsEditForm[Key]) => {
    if (key === 'managementIp' || key === 'sshPort') {
      hostKeyRequest.current?.abort();
      setCheckingHostKey(false);
      setHostKey(null);
      setHostKeyError(null);
      setHostKeyNotice('');
    }
    setError(null);
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const resetForm = () => {
    if (!initialDevice || busy) return;
    hostKeyRequest.current?.abort();
    setForm(createEditForm(initialDevice));
    setAdvancedOpen(false);
    setSshOpen(false);
    setCustomPolling(!pollingPresets.includes(initialDevice.pollingInterval ?? 300));
    setSubmitted(false);
    setError(null);
    setHostKey(null);
    setHostKeyError(null);
    setHostKeyNotice('');
    setShowCommunity(false);
    setShowSnmpAuthPassword(false);
    setShowSnmpPrivacyPassword(false);
    setShowSshPassword(false);
  };

  const inspectHostKey = async () => {
    if (busy || sshTargetDirty) return;
    const controller = new AbortController();
    hostKeyRequest.current?.abort();
    hostKeyRequest.current = controller;
    setCheckingHostKey(true);
    setHostKeyError(null);
    setHostKeyNotice('');
    try {
      const response = await fetch(`/api/integrations/nms/devices/${deviceId}/ssh-host-key`, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(uiError(data.error || 'SSH anahtarı okunamadı'));
      if (!controller.signal.aborted) setHostKey(data.data as HostKeyState);
    } catch (hostKeyError) {
      if (!controller.signal.aborted) setHostKeyError(uiError(hostKeyError instanceof Error ? hostKeyError.message : 'SSH anahtarı okunamadı'));
    } finally {
      if (!controller.signal.aborted) setCheckingHostKey(false);
    }
  };

  const trustHostKey = async () => {
    if (!hostKey || busy || sshTargetDirty) return;
    setTrustingHostKey(true);
    setHostKeyError(null);
    setHostKeyNotice('');
    try {
      const response = await fetch(`/api/integrations/nms/devices/${deviceId}/ssh-host-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint: hostKey.observed.fingerprint }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(uiError(data.error || 'SSH anahtarı onaylanamadı'));
      setHostKey((current) => current ? {
        ...current,
        trusted: {
          algorithm: current.observed.algorithm,
          fingerprint: current.observed.fingerprint,
          matches: true,
        },
      } : null);
      setInitialDevice((current) => current ? {
        ...current,
        sshHostKeyAlgorithm: hostKey.observed.algorithm,
        sshHostKeyFingerprint: hostKey.observed.fingerprint,
      } : null);
      setHostKeyNotice('SSH anahtarı onaylandı ve kaydedildi.');
    } catch (hostKeyError) {
      setHostKeyError(uiError(hostKeyError instanceof Error ? hostKeyError.message : 'SSH anahtarı onaylanamadı'));
    } finally {
      setTrustingHostKey(false);
    }
  };

  const handleSubmit = async (event: React.SyntheticEvent) => {
    event.preventDefault();
    if (!initialDevice || busy || changes.length === 0) return;
    setSubmitted(true);
    if (Object.keys(fieldErrors).length) {
      if (['operating-system', 'snmp-port', 'ssh-port', 'polling-interval'].some(key => fieldErrors[key])) setAdvancedOpen(true);
      if (fieldErrors['polling-interval']) setCustomPolling(true);
      if (['backup-platform', 'ssh-username'].some(key => fieldErrors[key])) setSshOpen(true);
      requestAnimationFrame(() => {
        const first = document.getElementById(Object.keys(fieldErrors)[0]);
        first?.focus({ preventScroll: true });
        first?.scrollIntoView({ block: 'center' });
      });
      return;
    }
    setError(null);
    setSaving(true);

    try {
      const payload = buildEditPayload(form);
      const response = await fetch(`/api/integrations/nms/devices/${deviceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(uiError(data.error || 'İzleme ayarları güncellenemedi'));

      setSuccess(true);
      redirectTimer.current = setTimeout(() => router.push(`/integrations/nms/devices/${deviceId}`), 900);
    } catch (saveError) {
      setError(uiError(saveError instanceof Error ? saveError.message : 'Beklenmeyen bir hata oluştu'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <PageStateFrame section="nms" title="NMS İzleme Ayarları">{(
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <p className="text-sm">İzleme ayarları yükleniyor...</p>
        </div>
      </div>
    )}</PageStateFrame>;
  }

  if (!initialDevice) {
    return <PageStateFrame section="nms" title="NMS İzleme Ayarları">{(
      <div className="p-4 sm:p-6">
        <div className="mx-auto max-w-xl space-y-4 rounded-lg border border-destructive/30 bg-destructive/5 p-5">
          <div className="flex items-start gap-3 text-destructive">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">Cihaz ayarları açılamadı</p>
              <p className="mt-1 text-sm">{error || 'Cihaz bulunamadı'}</p>
            </div>
          </div>
          <Button className="mr-2 gap-2" onClick={() => setRetryCount(count => count + 1)}><RefreshCw className="h-4 w-4" />Tekrar dene</Button>
          <Button variant="outline" asChild>
            <Link href="/integrations/nms/devices">
              <ArrowLeft className="mr-2 h-4 w-4" />
              NMS cihazlarına dön
            </Link>
          </Button>
        </div>
      </div>
    )}</PageStateFrame>;
  }

  return <div className={styles.page}>
    <header className={styles.header}>
      <Button variant="outline" size="icon" asChild className="h-8 w-8 shrink-0"><Link href={`/integrations/nms/devices/${deviceId}`} aria-label="Cihaz detayına dön"><ArrowLeft className="h-4 w-4" /></Link></Button>
      <div className={styles.headingText}><PageHeading section="nms" compact showIcon={false} className="text-base sm:text-lg">İzleme ayarları</PageHeading><p className={styles.deviceName}>{initialDevice.name}</p></div>
    </header>
    <ValidationContext.Provider value={visibleErrors}>
    <form noValidate onSubmit={handleSubmit} className={styles.form} aria-label="NMS cihaz düzenleme" aria-busy={saving}>
      <div className={styles.card}>
        <fieldset disabled={busy} className={styles.fields}>
          <legend className="sr-only">İzleme yapılandırması</legend>
          <section className={styles.section} aria-labelledby="edit-snmp-heading">
            <h2 id="edit-snmp-heading" className={styles.sectionTitle}><ShieldCheck size={16} />SNMP erişimi</h2>
            <div className={styles.connectionGrid}>
              <Field label="Yönetim IP adresi" id="management-ip"><Input id="management-ip" {...validationFor('management-ip')} autoComplete="off" value={form.managementIp} onChange={event => set('managementIp', event.target.value)} /></Field>
              <Field label="SNMP sürümü" id="snmp-version"><select id="snmp-version" value={form.snmpVersion} onChange={event => set('snmpVersion', event.target.value as SnmpVersion)}>{createEditForm(initialDevice).snmpVersion === 'v1' && <option value="v1">SNMPv1 (eski)</option>}<option value="v2c">SNMPv2c</option><option value="v3">SNMPv3</option></select></Field>
              {form.snmpVersion !== 'v3' && <Field label="Topluluk adı (community)" id="snmp-community"><SecretInput id="snmp-community" {...validationFor('snmp-community')} visible={showCommunity} onToggle={() => setShowCommunity(value => !value)} value={form.snmpCommunity} onChange={value => set('snmpCommunity', value)} placeholder={initialDevice.hasSnmpCommunity ? 'Kayıtlı değeri korumak için boş bırakın' : 'Community girin'} label="Topluluk adı" /></Field>}
            </div>
            {form.snmpVersion !== createEditForm(initialDevice).snmpVersion && <p className={styles.warning}>Sürüm değişikliğinde önceki sürümün kimlik bilgileri kaldırılır. Yeni sürümün erişim bilgilerini tamamlayın.</p>}
            {form.snmpVersion === 'v3' && <div className="mt-3">                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="snmp-v3-username">Kullanıcı adı</Label>
                      <Input id="snmp-v3-username" {...validationFor('snmp-v3-username')} autoComplete="off" value={form.snmpV3Username} onChange={(event) => set('snmpV3Username', event.target.value)} />
                  <FieldError id="snmp-v3-username" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="snmp-v3-security">Güvenlik seviyesi</Label>
                      <select id="snmp-v3-security" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" value={form.snmpV3SecurityLevel} onChange={(event) => set('snmpV3SecurityLevel', event.target.value as SnmpV3SecurityLevel)}><option value="authPriv">Doğrulama + şifreleme</option><option value="authNoPriv">Yalnızca doğrulama</option></select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="snmp-v3-auth-protocol">Doğrulama protokolü</Label>
                      <select id="snmp-v3-auth-protocol" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" value={form.snmpV3AuthProtocol} onChange={(event) => set('snmpV3AuthProtocol', event.target.value)}><option value="SHA">SHA</option><option value="SHA-256">SHA-256</option></select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="snmp-v3-auth-password">Doğrulama parolası</Label>
                      <SecretInput id="snmp-v3-auth-password" {...validationFor('snmp-v3-auth-password')} visible={showSnmpAuthPassword} onToggle={() => setShowSnmpAuthPassword((visible) => !visible)} value={form.snmpV3AuthPassword} onChange={(value) => set('snmpV3AuthPassword', value)} placeholder={initialDevice.hasSnmpV3AuthPassword ? 'Değiştirmek için yeni parola girin' : 'En az 8 karakter'} label="SNMPv3 doğrulama parolası" />
                  <FieldError id="snmp-v3-auth-password" />
                    </div>
                    {form.snmpV3SecurityLevel === 'authPriv' && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="snmp-v3-privacy-protocol">Şifreleme protokolü</Label>
                          <select id="snmp-v3-privacy-protocol" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" value={form.snmpV3PrivacyProtocol} onChange={(event) => set('snmpV3PrivacyProtocol', event.target.value)}><option value="AES">AES-128</option></select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="snmp-v3-privacy-password">Şifreleme parolası</Label>
                          <SecretInput id="snmp-v3-privacy-password" {...validationFor('snmp-v3-privacy-password')} visible={showSnmpPrivacyPassword} onToggle={() => setShowSnmpPrivacyPassword((visible) => !visible)} value={form.snmpV3PrivacyPassword} onChange={(value) => set('snmpV3PrivacyPassword', value)} placeholder={initialDevice.hasSnmpV3PrivacyPassword ? 'Değiştirmek için yeni parola girin' : 'En az 8 karakter'} label="SNMPv3 şifreleme parolası" />
                  <FieldError id="snmp-v3-privacy-password" />
                        </div>
                      </>
                    )}
                  </div>
                  {form.snmpV3SecurityLevel === 'authNoPriv' && initialDevice.snmpV3SecurityLevel === 'authPriv' && <p className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-200">Kaydettiğinizde SNMP şifrelemesi kapatılır ve kayıtlı şifreleme parolası kaldırılır.</p>}
                </div></div>}
            <p className={styles.credentialNote}>Boş bırakılan parola ve community alanlarında kayıtlı değerler korunur.</p>
          </section>
          <section className={styles.sshSection}>
            <button type="button" className={styles.advancedToggle} aria-label="SSH erişimi" aria-expanded={sshOpen} aria-controls="edit-ssh-settings" onClick={() => setSshOpen(value => !value)}><Terminal size={16} /><span className="font-medium text-foreground">SSH erişimi</span><span className="text-xs">{initialDevice.sshUsername || initialDevice.hasSshPassword ? 'Kayıtlı' : 'İsteğe bağlı'}</span><ChevronDown size={16} className={cn(styles.chevron, sshOpen && styles.chevronOpen)} /></button>
            <div id="edit-ssh-settings" hidden={!sshOpen} className={styles.sshContent}>
              <div className={styles.sshGrid}>
                <Field label="İşletim sistemi (yedekleme)" id="backup-platform"><select id="backup-platform" {...validationFor('backup-platform')} value={form.backupPlatform} onChange={event => set('backupPlatform', event.target.value)}><option value="">İşletim sistemi seçin</option>{Object.entries(BACKUP_PROFILES).map(([key, profile]) => <option key={key} value={key}>{profile.label}</option>)}</select></Field>
                <Field label="Kullanıcı adı" id="ssh-username"><Input id="ssh-username" {...validationFor('ssh-username')} autoComplete="off" value={form.sshUsername} onChange={event => set('sshUsername', event.target.value)} /></Field>
                <Field label="Parola" id="ssh-password"><SecretInput id="ssh-password" visible={showSshPassword} onToggle={() => setShowSshPassword(value => !value)} value={form.sshPassword} onChange={value => set('sshPassword', value)} placeholder={initialDevice.hasSshPassword ? 'Kayıtlı parolayı korumak için boş bırakın' : 'SSH parolasını girin'} label="SSH parolası" /></Field>
              </div>
              <div className={styles.hostKey}>
                <div className={styles.hostKeyHeader}><h3><Fingerprint size={15} />SSH cihaz anahtarı</h3><Button type="button" variant="outline" size="sm" onClick={inspectHostKey} disabled={checkingHostKey || trustingHostKey || sshTargetDirty}>{checkingHostKey ? <Loader2 size={15} className="animate-spin" /> : <Fingerprint size={15} />}Anahtarı kontrol et</Button></div>
                {sshTargetDirty && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Yeni IP veya port için önce ayarları kaydedin, ardından anahtarı kontrol edin.
                  </p>
                )}
                {!hostKey && initialDevice.sshHostKeyFingerprint && (
                  <div className="rounded-md border border-emerald-500/25 bg-emerald-500/5 p-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                      <ShieldCheck className="h-4 w-4" />
                      {sshTargetDirty ? 'Kayıtlı adresin SSH anahtarı' : 'SSH anahtarı onaylı'}
                    </div>
                    <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                      {initialDevice.sshHostKeyFingerprint}
                    </p>
                  </div>
                )}
                {hostKey && (
                  <div className={`rounded-md border p-3 ${
                    hostKey.trusted?.matches
                      ? 'border-emerald-500/25 bg-emerald-500/5'
                      : hostKey.trusted
                        ? 'border-destructive/30 bg-destructive/5'
                        : 'border-amber-500/30 bg-amber-500/5'
                  }`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {hostKey.trusted?.matches
                            ? 'Anahtar eşleşiyor'
                            : hostKey.trusted
                              ? 'Anahtar değişmiş'
                              : 'Onay bekliyor'}
                        </p>
                        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                          {hostKey.observed.fingerprint}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">Algoritma: {hostKey.observed.algorithm}</p>
                        {hostKey.trusted && !hostKey.trusted.matches && <p className="mt-2 break-all text-xs text-destructive">Önceki anahtar: <span className="font-mono">{hostKey.trusted.fingerprint}</span></p>}
                      </div>
                      {!hostKey.trusted?.matches && (
                        <Button
                          type="button"
                          size="sm"
                          className="gap-2"
                          onClick={trustHostKey}
                          disabled={trustingHostKey || sshTargetDirty}
                        >
                          {trustingHostKey
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <ShieldCheck className="h-4 w-4" />}
                          Bu anahtara güven
                        </Button>
                      )}
                    </div>
                  </div>
                )}
                {hostKey && !hostKey.trusted?.matches && <p className="text-xs leading-relaxed text-muted-foreground">Parmak izini güvenilir bir kaynaktan doğrulayın. Anahtar onayı hemen kaydedilir ve formdaki diğer değişikliklerden bağımsızdır.</p>}
                {hostKeyError && <p role="alert" className="text-xs text-destructive">{uiError(hostKeyError)}</p>}
                {hostKeyNotice && <p role="status" className="text-xs text-primary">{hostKeyNotice}</p>}
              </div>
            </div>
          </section>
          <section className={styles.advanced}>
            <button type="button" className={styles.advancedToggle} aria-expanded={advancedOpen} aria-controls="edit-advanced-settings" onClick={() => setAdvancedOpen(value => !value)}><Settings2 size={16} /><span>Gelişmiş ayarlar</span><ChevronDown size={16} className={cn(styles.chevron, advancedOpen && styles.chevronOpen)} /></button>
            <div id="edit-advanced-settings" hidden={!advancedOpen}>
              <div className={styles.advancedGrid}>
                <Field label="SNMP portu" id="snmp-port"><Input id="snmp-port" {...validationFor('snmp-port')} type="number" min={1} max={65535} value={form.snmpPort} onChange={event => set('snmpPort', Number(event.target.value))} /></Field>
                <Field label="SSH portu" id="ssh-port"><Input id="ssh-port" {...validationFor('ssh-port')} type="number" min={1} max={65535} value={form.sshPort} onChange={event => set('sshPort', Number(event.target.value))} /></Field>
                <Field label="Ölçüm aralığı" id="polling-preset"><select id="polling-preset" value={customPolling || !pollingPresets.includes(form.pollingInterval) ? 'custom' : String(form.pollingInterval)} onChange={event => { const custom = event.target.value === 'custom'; setCustomPolling(custom); if (!custom) set('pollingInterval', Number(event.target.value)); }}><option value="30">30 saniye</option><option value="60">1 dakika</option><option value="300">5 dakika</option><option value="900">15 dakika</option><option value="custom">Özel</option></select></Field>
                {(customPolling || !pollingPresets.includes(form.pollingInterval)) && <Field label="Ölçüm aralığı (saniye)" id="polling-interval"><Input id="polling-interval" {...validationFor('polling-interval')} type="number" min={10} max={86400} value={form.pollingInterval} onChange={event => set('pollingInterval', Number(event.target.value))} /></Field>}
                <div className={styles.fullWidth}><Field label="İşletim sistemi" id="operating-system"><Input id="operating-system" {...validationFor('operating-system')} maxLength={255} placeholder="Örn. Cisco IOS XE 17.12" value={form.operatingSystem} onChange={event => set('operatingSystem', event.target.value)} /><p className="text-xs text-muted-foreground">Envanterdeki sistem ve sürüm bilgisi.</p></Field></div>
              </div>
            </div>
          </section>
        </fieldset>
      </div>
      <div className={styles.actions} role="group" aria-label="Kayıt işlemleri">
        {(submitted && Object.keys(fieldErrors).length > 0 || error || success) && <div className={styles.feedback}>
          {submitted && Object.keys(fieldErrors).length > 0 && <p role="alert" className="text-destructive">İşaretli alanları kontrol edin.</p>}
          {error && <p role="alert" className="text-destructive">{uiError(error)}</p>}
          {success && <p role="status" className="text-primary">Ayarlar kaydedildi. Cihaz detayına dönülüyor…</p>}
        </div>}
        <div className={styles.actionRow}>
          <div className={styles.startToggle}><Switch id="polling-enabled" checked={form.pollingEnabled} onCheckedChange={checked => set('pollingEnabled', checked)} disabled={busy} /><Label htmlFor="polling-enabled">Otomatik veri toplama</Label></div>
          <div className={styles.buttons}>
            {changes.length > 0 && <Button type="button" size="sm" variant="outline" aria-label="Değişiklikleri sıfırla" title="Değişiklikleri sıfırla" disabled={busy} onClick={resetForm}><RotateCcw size={16} /></Button>}
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => router.push(`/integrations/nms/devices/${deviceId}`)}>Vazgeç</Button>
            <Button type="submit" size="sm" disabled={busy || changes.length === 0}>{saving ? <Loader2 size={16} className="animate-spin" /> : success ? <CheckCircle2 size={16} /> : <Save size={16} />}{saving ? 'Kaydediliyor…' : success ? 'Kaydedildi' : 'Değişiklikleri kaydet'}</Button>
          </div>
        </div>
      </div>
    </form>
    </ValidationContext.Provider>
  </div>;
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return <div className={styles.field}><Label htmlFor={id}>{label}</Label>{children}<FieldError id={id} /></div>;
}

function FieldError({ id }: { id: string }) {
  const errors = useContext(ValidationContext);
  return errors[id] ? <p id={`${id}-error`} className={styles.fieldError}>{errors[id]}</p> : null;
}

function SecretInput({
  id,
  visible,
  onToggle,
  value,
  onChange,
  placeholder,
  label,
  ...validationProps
}: {
  id: string;
  visible: boolean;
  onToggle: () => void;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
} & Pick<React.InputHTMLAttributes<HTMLInputElement>, 'aria-invalid' | 'aria-describedby'>) {
  return (
    <div className="relative">
      <Input
        id={id}
        {...validationProps}
        type={visible ? 'text' : 'password'}
        autoComplete="new-password"
        className="pr-10"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
        onClick={onToggle}
        title={visible ? `${label} değerini gizle` : `${label} değerini göster`}
        aria-label={visible ? `${label} değerini gizle` : `${label} değerini göster`}
        aria-pressed={visible}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
    </div>
  );
}
