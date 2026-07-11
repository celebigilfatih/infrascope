'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
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

type SnmpVersion = 'v2c' | 'v3';

interface DbDevice {
  id: string;
  name: string;
  type: string | null;
  vendor: string | null;
  managementIp: string | null;
  snmpVersion: string | null;
  snmpPort: number | null;
  pollingEnabled: boolean;
  pollingInterval: number | null;
  sshUsername: string | null;
  sshPort: number | null;
  hasSnmpCommunity: boolean;
  hasSshPassword: boolean;
}

function toFormSnmpVersion(value: string | null): SnmpVersion {
  return value === '3' || value === 'v3' ? 'v3' : 'v2c';
}

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
  const [showSshPassword, setShowSshPassword] = useState(false);

  const [form, setForm] = useState({
    managementIp: '',
    snmpPort: 161,
    snmpVersion: 'v2c' as SnmpVersion,
    snmpCommunity: '',
    pollingEnabled: true,
    pollingInterval: 30,
    sshUsername: '',
    sshPassword: '',
    sshPort: 22,
  });

  const breadcrumbItems = useMemo(() => initialDevice ? [
    { label: 'NMS İzlenen Cihazlar', href: '/integrations/nms/devices' },
    { label: initialDevice.name, href: `/integrations/nms/devices/${deviceId}` },
    { label: 'İzleme Ayarları' },
  ] : null, [deviceId, initialDevice?.name]);
  usePageBreadcrumb(breadcrumbItems);

  useEffect(() => {
    let cancelled = false;

    async function loadDevice() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/integrations/nms/devices/${deviceId}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Cihaz bilgileri yüklenemedi');
        if (cancelled) return;

        const device = data.device as DbDevice;
        setInitialDevice(device);
        setForm({
          managementIp: device.managementIp || '',
          snmpPort: device.snmpPort ?? 161,
          snmpVersion: toFormSnmpVersion(device.snmpVersion),
          snmpCommunity: '',
          pollingEnabled: device.pollingEnabled ?? true,
          pollingInterval: device.pollingInterval ?? 30,
          sshUsername: device.sshUsername || '',
          sshPassword: '',
          sshPort: device.sshPort ?? 22,
        });
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Cihaz bilgileri yüklenemedi');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (deviceId) loadDevice();
    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  const set = (key: string, value: unknown) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!form.managementIp.trim()) {
      setError('Management IP zorunludur');
      return;
    }
    if (!Number.isInteger(form.snmpPort) || form.snmpPort < 1 || form.snmpPort > 65535) {
      setError('SNMP portu 1 ile 65535 arasında olmalıdır');
      return;
    }
    if (!Number.isInteger(form.sshPort) || form.sshPort < 1 || form.sshPort > 65535) {
      setError('SSH portu 1 ile 65535 arasında olmalıdır');
      return;
    }
    if (!Number.isInteger(form.pollingInterval) || form.pollingInterval < 30) {
      setError('Polling aralığı en az 30 saniye olmalıdır');
      return;
    }

    setError(null);
    setSaving(true);

    try {
      const payload: Record<string, unknown> = {
        managementIp: form.managementIp.trim(),
        snmpPort: form.snmpPort,
        snmpVersion: form.snmpVersion,
        pollingEnabled: form.pollingEnabled,
        pollingInterval: form.pollingInterval,
        sshUsername: form.sshUsername,
        sshPort: form.sshPort,
      };
      if (form.snmpCommunity) payload.snmpCommunity = form.snmpCommunity;
      if (form.sshPassword) payload.sshPassword = form.sshPassword;

      const response = await fetch(`/api/integrations/nms/devices/${deviceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'İzleme ayarları güncellenemedi');

      setSuccess(true);
      setTimeout(() => router.push(`/integrations/nms/devices/${deviceId}`), 900);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Beklenmeyen bir hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <p className="text-sm">İzleme ayarları yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!initialDevice) {
    return (
      <div className="p-4 sm:p-6">
        <div className="mx-auto max-w-xl space-y-4 rounded-lg border border-destructive/30 bg-destructive/5 p-5">
          <div className="flex items-start gap-3 text-destructive">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">Cihaz ayarları açılamadı</p>
              <p className="mt-1 text-sm">{error || 'Cihaz bulunamadı'}</p>
            </div>
          </div>
          <Button variant="outline" asChild>
            <Link href="/integrations/nms/devices">
              <ArrowLeft className="mr-2 h-4 w-4" />
              NMS cihazlarına dön
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" asChild>
              <Link href={`/integrations/nms/devices/${deviceId}`} aria-label="Cihaz detayına dön">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold sm:text-2xl">NMS İzleme Ayarları</h1>
                <Badge variant={form.pollingEnabled ? 'success' : 'secondary'} className="h-6">
                  {form.pollingEnabled ? 'Polling aktif' : 'Polling kapalı'}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {initialDevice.name} için SNMP, SSH ve polling bağlantısını yönetin.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2.5">
                  <Server className="h-3.5 w-3.5" />
                  {initialDevice.vendor || 'Bilinmeyen üretici'}
                </span>
                <span className="inline-flex h-7 items-center rounded-md border border-border bg-muted/30 px-2.5">
                  {initialDevice.type?.replace(/_/g, ' ') || 'Bilinmeyen tip'}
                </span>
                <span className="inline-flex h-7 items-center font-mono rounded-md border border-border bg-muted/30 px-2.5">
                  {initialDevice.managementIp || 'IP tanımsız'}
                </span>
              </div>
            </div>
          </div>
        </header>

        <div className="grid items-stretch gap-4 lg:grid-cols-2">
          <Card className="h-full">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-500/10 text-blue-500">
                  <Network className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base">Bağlantı</CardTitle>
                  <CardDescription>Switch’in yönetim adresi ve SNMP portu.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
              <div className="space-y-2">
                <Label htmlFor="management-ip">Management IP</Label>
                <Input
                  id="management-ip"
                  className="font-mono"
                  placeholder="192.168.1.1"
                  value={form.managementIp}
                  onChange={(event) => set('managementIp', event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="snmp-port">SNMP Portu</Label>
                <Input
                  id="snmp-port"
                  type="number"
                  min={1}
                  max={65535}
                  value={form.snmpPort}
                  onChange={(event) => set('snmpPort', Number(event.target.value))}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="h-full">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-500">
                  <Activity className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base">Polling</CardTitle>
                  <CardDescription>Periyodik veri toplama davranışı.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex min-h-10 items-center justify-between gap-4 rounded-md border border-border px-3 py-2">
                <div>
                  <Label htmlFor="polling-enabled" className="cursor-pointer">Polling durumu</Label>
                  <p className="text-xs text-muted-foreground">Port ve sağlık verilerini düzenli olarak toplar.</p>
                </div>
                <Switch
                  id="polling-enabled"
                  checked={form.pollingEnabled}
                  onCheckedChange={(checked) => set('pollingEnabled', checked)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="polling-interval">Polling aralığı</Label>
                <div className="relative">
                  <Input
                    id="polling-interval"
                    type="number"
                    min={30}
                    className="pr-16"
                    value={form.pollingInterval}
                    onChange={(event) => set('pollingInterval', Number(event.target.value))}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                    saniye
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="h-full">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-violet-500/10 text-violet-500">
                    <Radio className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base">SNMP</CardTitle>
                    <CardDescription>Port, trafik ve cihaz sağlık metrikleri.</CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {initialDevice.hasSnmpCommunity ? 'Credential kayıtlı' : 'Credential eksik'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="snmp-version">SNMP sürümü</Label>
                <select
                  id="snmp-version"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={form.snmpVersion}
                  onChange={(event) => set('snmpVersion', event.target.value as SnmpVersion)}
                >
                  <option value="v2c">SNMPv2c</option>
                  <option value="v3">SNMPv3</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="snmp-community">Community string</Label>
                <div className="relative">
                  <Input
                    id="snmp-community"
                    type={showCommunity ? 'text' : 'password'}
                    autoComplete="new-password"
                    className="pr-10"
                    placeholder={initialDevice.hasSnmpCommunity ? 'Değiştirmek için yeni değer girin' : 'Community string girin'}
                    value={form.snmpCommunity}
                    onChange={(event) => set('snmpCommunity', event.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-10 w-10"
                    onClick={() => setShowCommunity((visible) => !visible)}
                    title={showCommunity ? 'Community değerini gizle' : 'Community değerini göster'}
                    aria-label={showCommunity ? 'Community değerini gizle' : 'Community değerini göster'}
                  >
                    {showCommunity ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Boş bırakırsanız kayıtlı community değeri korunur.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="h-full">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-orange-500/10 text-orange-500">
                    <Terminal className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base">SSH</CardTitle>
                    <CardDescription>CLI erişimi ve konfigürasyon yedeği.</CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {initialDevice.hasSshPassword ? 'Credential kayıtlı' : 'Credential eksik'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
                <div className="space-y-2">
                  <Label htmlFor="ssh-username">Kullanıcı adı</Label>
                  <Input
                    id="ssh-username"
                    autoComplete="off"
                    placeholder="admin"
                    value={form.sshUsername}
                    onChange={(event) => set('sshUsername', event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ssh-port">SSH Portu</Label>
                  <Input
                    id="ssh-port"
                    type="number"
                    min={1}
                    max={65535}
                    value={form.sshPort}
                    onChange={(event) => set('sshPort', Number(event.target.value))}
                  />
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
                  >
                    {showSshPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Boş bırakırsanız kayıtlı SSH parolası korunur.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="font-medium">Credential güvenliği</p>
            <p className="mt-1 text-muted-foreground">
              Kayıtlı community ve parola değerleri ekrana geri gönderilmez. Yalnızca yeni bir değer girdiğinizde güncellenir.
            </p>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Ayarlar kaydedildi. Cihaz detayına dönülüyor...
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            className="sm:min-w-28"
            onClick={() => router.push(`/integrations/nms/devices/${deviceId}`)}
            disabled={saving}
          >
            İptal
          </Button>
          <Button
            className="gap-2 sm:min-w-40"
            onClick={handleSubmit}
            disabled={saving || success}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Kaydediliyor...' : 'Ayarları Kaydet'}
          </Button>
        </div>
      </div>
    </div>
  );
}
