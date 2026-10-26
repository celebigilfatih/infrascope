'use client';

import { uiError } from '@/lib/i18n/tr';

import { PageHeading, PageStateFrame } from '@/components/ui/page-heading';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Fingerprint,
  Clock3,
  RefreshCw,
  RotateCcw,
  Loader2,
  Network,
  Radio,
  Save,
  Server,
  ShieldCheck,
  Terminal,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { usePageBreadcrumb } from '@/components/layout/BreadcrumbProvider';
import {
  buildEditPayload,
  createEditForm,
  getEditChanges,
  validateEditForm,
  type EditableNmsDevice as DbDevice,
  type NmsEditForm,
  type SnmpVersion,
  type SnmpV3SecurityLevel,
} from '@/lib/nms/edit-device-form';
import { cn } from '@/lib/utils';
import styles from './page.module.css';

const ValidationContext = createContext<Record<string, string>>({});

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
      const first = document.getElementById(Object.keys(fieldErrors)[0]);
      first?.focus({ preventScroll: true });
      first?.scrollIntoView({ block: 'center' });
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

  return (
    <div className={cn(styles.page, "p-4 sm:p-6 lg:p-8")}>
      <div className="mx-auto max-w-[1320px] space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
          <div className="flex min-w-0 items-start gap-3">
            <Button variant="outline" size="icon" className="mt-1 h-9 w-9 shrink-0" asChild>
              <Link href={`/integrations/nms/devices/${deviceId}`} aria-label="Cihaz detayına dön"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <div className="min-w-0">
              <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary"><Radio className="h-3.5 w-3.5" /> NMS İzleme</p>
              <PageHeading section="nms" showIcon={false} className="text-2xl! font-semibold!">İzleme ayarları</PageHeading>
              <p className="mt-1.5 text-sm text-muted-foreground">Cihaz bağlantısını, veri toplama sıklığını ve erişim bilgilerini yönetin.</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-foreground"><Server className="h-3.5 w-3.5 shrink-0" /><span className="break-all">{initialDevice.name}</span></span>
                <span>{initialDevice.vendor || 'Bilinmeyen üretici'}</span>
                <span>{initialDevice.type?.replace(/_/g, ' ') || 'Bilinmeyen tip'}</span>
                <span className="font-mono">{initialDevice.managementIp || 'IP tanımsız'}</span>
              </div>
            </div>
          </div>
          <Badge variant={initialDevice.pollingEnabled ? 'success' : 'secondary'} className="gap-1.5"><span className={cn('h-1.5 w-1.5 rounded-full', initialDevice.pollingEnabled ? 'bg-emerald-500' : 'bg-muted-foreground')} />{initialDevice.pollingEnabled ? 'İzleme etkin' : 'İzleme kapalı'}</Badge>
        </header>

        <ValidationContext.Provider value={visibleErrors}>
        <form noValidate onSubmit={handleSubmit} className={styles.form} aria-label="NMS cihaz düzenleme" aria-busy={saving}>
          <fieldset disabled={busy} className={styles.fields}>
            <legend className="sr-only">İzleme yapılandırması</legend>
            <div className="flex items-start gap-3 rounded-xl border border-primary/15 bg-primary/5 p-4 text-sm">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div><p className="font-medium">Kayıtlı parolalarınız korunur</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Parola ve community alanları güvenlik için boş gösterilir. Yalnızca değiştirmek istediğiniz alana yeni bir değer girin.</p></div>
            </div>
          <Card id="connection-section" className={styles.section}>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Network className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base">Bağlantı</CardTitle>
                  <CardDescription>Cihazın yönetim adresi ve SNMP bağlantısı.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
              <div className="space-y-2">
                <Label htmlFor="management-ip">Yönetim IP Adresi</Label>
                <Input
                  id="management-ip"                  {...validationFor('management-ip')}
                  className="font-mono"
                  placeholder="192.168.1.1"
                  value={form.managementIp}
                  onChange={(event) => set('managementIp', event.target.value)}
                />
                  <FieldError id="management-ip" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="snmp-port">SNMP Portu</Label>
                <Input
                  id="snmp-port"                  {...validationFor('snmp-port')}
                  type="number"
                  min={1}
                  max={65535}
                  value={form.snmpPort}
                  onChange={(event) => set('snmpPort', Number(event.target.value))}
                />
                  <FieldError id="snmp-port" />
              </div>
            </CardContent>
          </Card>

          <Card id="polling-section" className={styles.section}>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Activity className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base">Veri Toplama</CardTitle>
                  <CardDescription>Periyodik veri toplama davranışı.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex min-h-10 items-center justify-between gap-4 rounded-md border border-border px-3 py-2">
                <div>
                  <Label htmlFor="polling-enabled" className="cursor-pointer">Otomatik veri toplama</Label>
                  <p className="text-xs text-muted-foreground">Port ve sağlık verilerini düzenli olarak toplar.</p>
                </div>
                <Switch
                  id="polling-enabled"
                  checked={form.pollingEnabled}
                  onCheckedChange={(checked) => set('pollingEnabled', checked)}
                />
              </div>
              {!form.pollingEnabled && <p className="rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">Kaydettiğinizde otomatik veri toplama durdurulur. Toplama aralığınız yeniden etkinleştirmek üzere korunur.</p>}
              <div className="space-y-2">
                <Label htmlFor="polling-interval">Veri toplama taban aralığı (saniye)</Label>
                <div className="relative">
                  <Input
                    id="polling-interval"                    {...validationFor('polling-interval')}
                    type="number"
                    min={10}
                    max={86400}
                    className="pr-16"
                    value={form.pollingInterval}
                    onChange={(event) => set('pollingInterval', Number(event.target.value))}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                    saniye
                  </span>
                </div>
                <FieldError id="polling-interval" />
                <div className="flex flex-wrap gap-2" role="group" aria-label="Hazır toplama aralıkları">{[{ value: 30, label: '30 sn' }, { value: 60, label: '1 dk' }, { value: 300, label: '5 dk' }, { value: 900, label: '15 dk' }].map(preset => <Button key={preset.value} type="button" size="sm" variant={form.pollingInterval === preset.value ? 'secondary' : 'outline'} className="h-8 gap-1.5 text-xs" aria-pressed={form.pollingInterval === preset.value} onClick={() => set('pollingInterval', preset.value)}>{form.pollingInterval === preset.value && <Clock3 className="h-3 w-3" />}{preset.label}</Button>)}</div>
                <p className="text-xs leading-relaxed text-muted-foreground">10–86400 saniye. SSH ile toplama veya bağlantı hataları gerçek aralığı uzatabilir; yük dağıtımı için kısa bir gecikme eklenir.</p>
              </div>
            </CardContent>
          </Card>

          <Card id="snmp-section" className={styles.section}>
            <CardHeader className="pb-4">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Radio className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base">SNMP</CardTitle>
                    <CardDescription>Port, trafik ve cihaz sağlık metrikleri.</CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className="shrink-0 text-[11px]">
                  {form.snmpVersion === 'v3'
                    ? form.snmpV3AuthPassword || form.snmpV3PrivacyPassword ? 'Yeni bilgi girildi' : initialDevice.hasSnmpV3AuthPassword ? 'Kayıtlı bilgi var' : 'Bilgi gerekli'
                    : form.snmpCommunity ? 'Yeni bilgi girildi' : initialDevice.hasSnmpCommunity ? 'Kayıtlı bilgi var' : 'Bilgi gerekli'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="snmp-version">SNMP sürümü</Label>
                <select
                  id="snmp-version"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={form.snmpVersion}
                  onChange={(event) => set('snmpVersion', event.target.value as SnmpVersion)}
                >
                  {createEditForm(initialDevice).snmpVersion === 'v1' && <option value="v1">SNMPv1 (eski)</option>}<option value="v2c">SNMPv2c</option>
                  <option value="v3">SNMPv3</option>
                </select>
                {form.snmpVersion !== createEditForm(initialDevice).snmpVersion && <p className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs leading-relaxed text-amber-800 dark:text-amber-200">Sürüm değişikliğini kaydettiğinizde önceki sürümün kayıtlı kimlik bilgileri kaldırılır. Yeni sürümün erişim bilgilerini tamamlayın.</p>}
              </div>
              {form.snmpVersion !== 'v3' ? (
                <div className="space-y-2">
                  <Label htmlFor="snmp-community">Topluluk Adı</Label>
                  <SecretInput id="snmp-community" {...validationFor('snmp-community')} visible={showCommunity} onToggle={() => setShowCommunity((visible) => !visible)} value={form.snmpCommunity} onChange={(value) => set('snmpCommunity', value)} placeholder={initialDevice.hasSnmpCommunity ? 'Değiştirmek için yeni değer girin' : 'Community girin'} label="Topluluk Adı" />
                  <FieldError id="snmp-community" />
                  <p className="text-xs text-muted-foreground">{initialDevice.hasSnmpCommunity ? 'Boş bırakırsanız kayıtlı community değeri korunur.' : 'Bu sürümle veri toplamak için community değeri gereklidir.'}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
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
                  <p className="text-xs leading-relaxed text-muted-foreground">{initialDevice.hasSnmpV3AuthPassword ? 'Kayıtlı doğrulama parolasını korumak için alanı boş bırakın.' : 'Doğrulama parolası gereklidir; 8–255 karakter kullanın.'} {form.snmpV3SecurityLevel === 'authPriv' && (initialDevice.hasSnmpV3PrivacyPassword ? 'Kayıtlı şifreleme parolasını da boş bırakarak koruyabilirsiniz.' : 'Şifreleme parolasını da girin; 8–255 karakter kullanın.')}</p>
                  {form.snmpV3SecurityLevel === 'authNoPriv' && initialDevice.snmpV3SecurityLevel === 'authPriv' && <p className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-200">Kaydettiğinizde SNMP şifrelemesi kapatılır ve kayıtlı şifreleme parolası kaldırılır.</p>}
                </div>
              )}
            </CardContent>
          </Card>

          <Card id="ssh-section" className={styles.section}>
            <CardHeader className="pb-4">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Terminal className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base">SSH</CardTitle>
                    <CardDescription>İsteğe bağlı komut satırı ve yedekleme erişimi.</CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {form.sshPassword ? 'Yeni bilgi girildi' : initialDevice.hasSshPassword ? 'Kayıtlı bilgi var' : 'İsteğe bağlı'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
                <div className="space-y-2">
                  <Label htmlFor="ssh-username">Kullanıcı adı</Label>
                  <Input
                    id="ssh-username"                    {...validationFor('ssh-username')}
                    autoComplete="off"
                    placeholder="admin"
                    value={form.sshUsername}
                    onChange={(event) => set('sshUsername', event.target.value)}
                  />
                  <FieldError id="ssh-username" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ssh-port">SSH Portu</Label>
                  <Input
                    id="ssh-port"                    {...validationFor('ssh-port')}
                    type="number"
                    min={1}
                    max={65535}
                    value={form.sshPort}
                    onChange={(event) => set('sshPort', Number(event.target.value))}
                  />
                  <FieldError id="ssh-port" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ssh-password">Parola</Label>
                <div className="relative">
                  <Input
                    id="ssh-password"
                    type={showSshPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    className="pr-10"
                    placeholder={initialDevice.hasSshPassword ? 'Değiştirmek için yeni parola girin' : 'SSH parolasını girin'}
                    value={form.sshPassword}
                    onChange={(event) => set('sshPassword', event.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-10 w-10"
                    onClick={() => setShowSshPassword((visible) => !visible)}
                    title={showSshPassword ? 'Parolayı gizle' : 'Parolayı göster'}
                    aria-label={showSshPassword ? 'Parolayı gizle' : 'Parolayı göster'}
                    aria-pressed={showSshPassword}
                  >
                    {showSshPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {initialDevice.hasSshPassword ? 'Boş bırakırsanız kayıtlı SSH parolası korunur.' : 'SSH ile yedekleme kullanacaksanız kullanıcı adı ve parola girin.'}
                </p>
              </div>
              <div className="space-y-3 border-t border-border pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Sunucu kimliği</p>
                    <p className="text-xs text-muted-foreground">
                      İlk SSH bağlantısından önce cihazın SHA-256 anahtarını doğrulayın.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={inspectHostKey}
                    disabled={checkingHostKey || trustingHostKey || sshTargetDirty}
                  >
                    {checkingHostKey
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Fingerprint className="h-4 w-4" />}
                    Anahtarı kontrol et
                  </Button>
                </div>
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
            </CardContent>
          </Card>
          </fieldset>
          <aside className={styles.summary} aria-label="Ayar özeti">
            <Card className={styles.section}>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between gap-2"><CardTitle className="text-base">{changes.length ? 'Değişiklik özeti' : 'Mevcut yapılandırma'}</CardTitle><Badge variant={changes.length ? 'default' : 'outline'}>{changes.length ? `${changes.length} değişiklik` : 'Kayıtlı'}</Badge></div>
                <CardDescription>{changes.length ? 'Kaydetmeden önce güncellenecek alanları gözden geçirin.' : 'Bir alanı düzenlediğinizde değişiklikler burada görünür.'}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {changes.length ? <dl className={styles.changeList} aria-live="polite" aria-relevant="additions removals">
                  {changes.map(change => <div key={change.label} className="space-y-1.5 border-b border-border pb-3 last:border-0 last:pb-0"><dt className="text-xs font-medium">{change.label}</dt><dd className="space-y-1 wrap-break-word text-xs"><span className="block text-muted-foreground"><span className="sr-only">Önceki değer: </span>{change.before}</span><span className="flex items-start gap-1.5 font-medium text-primary"><span aria-hidden="true">→</span><span><span className="sr-only">Yeni değer: </span>{change.secret && <ShieldCheck className="mr-1 inline h-3 w-3" />}{change.after}</span></span></dd></div>)}
                </dl> : <dl className="space-y-3 text-sm">
                  <SummaryRow label="Yönetim IP" value={form.managementIp || 'Girilmedi'} mono />
                  <SummaryRow label="SNMP" value={`SNMP${form.snmpVersion} · ${form.snmpPort}`} />
                  <SummaryRow label="Veri toplama" value={form.pollingEnabled ? `${form.pollingInterval} saniye` : 'Kapalı'} />
                  <SummaryRow label="SSH" value={form.sshUsername ? `${form.sshUsername} · ${form.sshPort}` : 'Yapılandırılmadı'} />
                </dl>}
                <div className="space-y-3 border-t border-border pt-4">
                  {submitted && Object.keys(fieldErrors).length > 0 && <p role="alert" className="flex items-start gap-2 text-xs text-destructive"><AlertCircle className="h-4 w-4 shrink-0" />{Object.keys(fieldErrors).length} alanı kontrol edin. Hatalı alanlar formda işaretlendi.</p>}
                  {error && <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-xs text-destructive">{uiError(error)}</p>}
                  {success && <p role="status" className="flex items-start gap-2 text-xs text-primary"><CheckCircle2 className="h-4 w-4 shrink-0" />Ayarlar kaydedildi. Cihaz detayına dönülüyor…</p>}
                  <Button type="submit" className="w-full gap-2" disabled={busy || changes.length === 0}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? 'Kaydediliyor…' : success ? 'Kaydedildi' : 'Değişiklikleri kaydet'}</Button>
                  {changes.length > 0 && <Button type="button" variant="outline" className="w-full gap-2" disabled={busy} onClick={resetForm}><RotateCcw className="h-4 w-4" />Değişiklikleri sıfırla</Button>}
                  <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={() => router.push(`/integrations/nms/devices/${deviceId}`)}>İptal et ve detaya dön</Button>
                </div>
              </CardContent>
            </Card>
            <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />Gizli değerler özette gösterilmez. Değişiklikler kaydettiğinizde uygulanır.</p>
          </aside>
        </form>
        </ValidationContext.Provider>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex items-start justify-between gap-3"><dt className="shrink-0 text-xs text-muted-foreground">{label}</dt><dd className={cn('min-w-0 break-all text-right text-xs font-medium', mono && 'font-mono')}>{value}</dd></div>;
}

function FieldError({ id }: { id: string }) {
  const errors = useContext(ValidationContext);
  return errors[id] ? <p id={`${id}-error`} className="text-xs text-destructive">{errors[id]}</p> : null;
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
        className="absolute right-0 top-0 h-10 w-10"
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
