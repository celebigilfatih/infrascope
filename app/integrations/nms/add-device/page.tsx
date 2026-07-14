'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  Loader2,
  Network,
  Plug,
  Server,
  ShieldCheck,
  Terminal,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { notifyDeviceInventoryChanged } from '@/lib/device-inventory-events';

type SnmpVersion = 'v2c' | 'v3';
type SnmpV3SecurityLevel = 'authNoPriv' | 'authPriv';

interface InventoryDevice {
  id: string;
  name: string;
  type: string;
  vendor?: string | null;
  model?: string | null;
  managementIp?: string | null;
  nmsDeviceId?: number | null;
}

const pollingPresets = [30, 60, 300, 900];

function deviceTypeLabel(type: string) {
  return type.replace(/_/g, ' ');
}

export default function AddNmsDevicePage() {
  const router = useRouter();
  const [inventoryDevices, setInventoryDevices] = useState<InventoryDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
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
    sshUsername: '',
    sshPassword: '',
    sshPort: 22,
  });

  const availableDevices = useMemo(
    () => inventoryDevices.filter((device) => device.nmsDeviceId == null),
    [inventoryDevices]
  );
  const selectedDevice = useMemo(
    () => inventoryDevices.find((device) => device.id === form.deviceId) ?? null,
    [form.deviceId, inventoryDevices]
  );

  const set = <Key extends keyof typeof form>(key: Key, value: (typeof form)[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  useEffect(() => {
    let cancelled = false;

    async function loadInventoryDevices() {
      setLoadingDevices(true);
      setError(null);
      try {
        const response = await fetch('/api/devices?filterType=all&mode=minimal&limit=200');
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Envanter cihazları yüklenemedi');
        if (!cancelled) setInventoryDevices(data.data || []);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Envanter cihazları yüklenemedi');
      } finally {
        if (!cancelled) setLoadingDevices(false);
      }
    }

    loadInventoryDevices();
    return () => { cancelled = true; };
  }, []);

  function selectDevice(deviceId: string) {
    const device = inventoryDevices.find((item) => item.id === deviceId);
    setForm((current) => ({
      ...current,
      deviceId,
      managementIp: device?.managementIp || current.managementIp,
    }));
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.deviceId) { setError('İzlemeye alınacak cihazı seçin.'); return; }
    if (!form.managementIp.trim()) { setError('Management IP zorunludur.'); return; }
    if (form.snmpVersion === 'v2c' && !form.snmpCommunity) { setError('SNMP community değeri zorunludur.'); return; }
    if (form.snmpVersion === 'v3' && !form.snmpV3Username.trim()) { setError('SNMPv3 kullanıcı adı zorunludur.'); return; }
    if (form.snmpVersion === 'v3' && form.snmpV3AuthPassword.length < 8) { setError('SNMPv3 doğrulama parolası en az 8 karakter olmalıdır.'); return; }
    if (form.snmpVersion === 'v3' && form.snmpV3SecurityLevel === 'authPriv' && form.snmpV3PrivacyPassword.length < 8) { setError('SNMPv3 şifreleme parolası en az 8 karakter olmalıdır.'); return; }
    if (!Number.isInteger(form.snmpPort) || form.snmpPort < 1 || form.snmpPort > 65535) { setError('SNMP portu 1 ile 65535 arasında olmalıdır.'); return; }
    if (!Number.isInteger(form.pollingInterval) || form.pollingInterval < 30) { setError('Polling aralığı en az 30 saniye olmalıdır.'); return; }
    if (sshEnabled && !form.sshUsername.trim()) { setError('SSH erişimi etkinse kullanıcı adı zorunludur.'); return; }

    setError(null);
    setSaving(true);
    try {
      const response = await fetch('/api/integrations/nms/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: form.deviceId,
          managementIp: form.managementIp.trim(),
          snmpPort: form.snmpPort,
          snmpVersion: form.snmpVersion,
          ...(form.snmpVersion === 'v2c'
            ? { snmpCommunity: form.snmpCommunity }
            : {
              snmpV3Username: form.snmpV3Username.trim(),
              snmpV3SecurityLevel: form.snmpV3SecurityLevel,
              snmpV3AuthProtocol: form.snmpV3AuthProtocol,
              snmpV3AuthPassword: form.snmpV3AuthPassword,
              ...(form.snmpV3SecurityLevel === 'authPriv'
                ? {
                  snmpV3PrivacyProtocol: form.snmpV3PrivacyProtocol,
                  snmpV3PrivacyPassword: form.snmpV3PrivacyPassword,
                }
                : {}),
            }),
          pollingInterval: form.pollingInterval,
          pollingEnabled: true,
          sshUsername: sshEnabled ? form.sshUsername.trim() || null : null,
          sshPassword: sshEnabled ? form.sshPassword || null : null,
          sshPort: sshEnabled ? form.sshPort : 22,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Cihaz NMS izlemeye alınamadı.');

      setSuccess(true);
      notifyDeviceInventoryChanged({ action: 'update', deviceId: form.deviceId, source: 'nms-add-device' });
      window.setTimeout(() => router.push('/integrations/nms/devices'), 900);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Beklenmeyen hata oluştu.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">
      <header className="mb-7 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Button variant="outline" size="icon" asChild className="mt-0.5 shrink-0" aria-label="NMS izlenen cihazlara dön">
            <Link href="/integrations/nms/devices"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Network className="h-4 w-4" />NMS İzleme</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal">Cihazı izlemeye al</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Envanterdeki cihaz için SNMP polling ve isteğe bağlı SSH erişimini yapılandırın.</p>
          </div>
        </div>
        <Badge variant="outline" className="w-fit gap-1.5 px-2.5 py-1 text-xs"><ShieldCheck className="h-3.5 w-3.5 text-primary" />Envanter korunur</Badge>
      </header>

      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]" noValidate>
        <Card className="rounded-lg border-border shadow-sm">
          <CardContent className="p-0">
            <section className="p-5 sm:p-6" aria-labelledby="inventory-heading">
              <SectionHeading id="inventory-heading" icon={Server} title="Envanter cihazı" description="İzleme yalnızca mevcut bir envanter kaydına eklenir." />
              {loadingDevices ? (
                <div className="flex min-h-24 items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Envanter cihazları yükleniyor...</div>
              ) : availableDevices.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-4">
                  <p className="text-sm font-medium">İzlemeye alınabilecek cihaz yok</p>
                  <Button variant="outline" size="sm" className="mt-3" asChild><Link href="/devices">Envantere cihaz ekle</Link></Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="device">Cihaz <span className="text-destructive">*</span></Label>
                    <div className="relative">
                      <select id="device" required value={form.deviceId} onChange={(event) => selectDevice(event.target.value)} className="h-11 w-full appearance-none rounded-md border border-input bg-background px-3 pr-10 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                        <option value="">Envanterden cihaz seçin</option>
                        {availableDevices.map((device) => <option key={device.id} value={device.id}>{device.name} · {deviceTypeLabel(device.type)}{device.vendor ? ` · ${device.vendor}` : ''}</option>)}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    </div>
                  </div>
                  {selectedDevice && <SelectedDevice device={selectedDevice} />}
                </div>
              )}
            </section>

            <section className="border-t border-border p-5 sm:p-6" aria-labelledby="connection-heading">
              <SectionHeading id="connection-heading" icon={Plug} title="Polling bağlantısı" description="Cihazın yönetim adresi ve veri toplama sıklığı." />
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8.5rem]">
                <Field label="Management IP" htmlFor="managementIp" required>
                  <Input id="managementIp" inputMode="decimal" autoComplete="off" placeholder="10.10.10.15" value={form.managementIp} onChange={(event) => set('managementIp', event.target.value)} aria-describedby="managementIp-hint" />
                  <p id="managementIp-hint" className="mt-1.5 text-xs text-muted-foreground">SNMP isteğinin gönderileceği adres.</p>
                </Field>
                <Field label="SNMP portu" htmlFor="snmpPort">
                  <Input id="snmpPort" type="number" min={1} max={65535} value={form.snmpPort} onChange={(event) => set('snmpPort', Number(event.target.value))} />
                </Field>
              </div>
              <div className="mt-5">
                <Field label="Polling aralığı" htmlFor="pollingInterval" required>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Polling aralığı önayarları">
                    {pollingPresets.map((seconds) => <Button key={seconds} type="button" size="sm" variant={form.pollingInterval === seconds ? 'secondary' : 'outline'} onClick={() => set('pollingInterval', seconds)}>{seconds < 60 ? `${seconds} sn` : `${seconds / 60} dk`}</Button>)}
                    <div className="relative w-28"><Input id="pollingInterval" type="number" min={30} step={30} value={form.pollingInterval} onChange={(event) => set('pollingInterval', Number(event.target.value))} className="pr-9" /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">sn</span></div>
                  </div>
                </Field>
              </div>
            </section>

            <section className="border-t border-border p-5 sm:p-6" aria-labelledby="snmp-heading">
              <SectionHeading id="snmp-heading" icon={Network} title="SNMP kimlik bilgileri" description="Polling için zorunlu erişim bilgileri." />
              <div className="grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
                <Field label="SNMP sürümü" htmlFor="snmpVersion">
                  <div className="relative"><select id="snmpVersion" value={form.snmpVersion} onChange={(event) => set('snmpVersion', event.target.value as SnmpVersion)} className="h-10 w-full appearance-none rounded-md border border-input bg-background px-3 pr-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><option value="v2c">SNMPv2c</option><option value="v3">SNMPv3</option></select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /></div>
                </Field>
                {form.snmpVersion === 'v2c' && (
                  <Field label="Community" htmlFor="snmpCommunity" required>
                    <div className="relative"><Input id="snmpCommunity" type={showCommunity ? 'text' : 'password'} autoComplete="new-password" placeholder="Community değerini girin" value={form.snmpCommunity} onChange={(event) => set('snmpCommunity', event.target.value)} className="pr-10" /><PasswordToggle visible={showCommunity} onClick={() => setShowCommunity((visible) => !visible)} label="Gizli community değerini göster veya gizle" /></div>
                  </Field>
                )}
              </div>
              {form.snmpVersion === 'v3' && (
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <Field label="Kullanıcı adı" htmlFor="snmpV3Username" required>
                    <Input id="snmpV3Username" autoComplete="off" placeholder="infrascope-monitor" value={form.snmpV3Username} onChange={(event) => set('snmpV3Username', event.target.value)} />
                  </Field>
                  <Field label="Güvenlik seviyesi" htmlFor="snmpV3SecurityLevel" required>
                    <select id="snmpV3SecurityLevel" value={form.snmpV3SecurityLevel} onChange={(event) => set('snmpV3SecurityLevel', event.target.value as SnmpV3SecurityLevel)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><option value="authPriv">Doğrulama + şifreleme</option><option value="authNoPriv">Yalnızca doğrulama</option></select>
                  </Field>
                  <Field label="Doğrulama protokolü" htmlFor="snmpV3AuthProtocol">
                    <select id="snmpV3AuthProtocol" value={form.snmpV3AuthProtocol} onChange={(event) => set('snmpV3AuthProtocol', event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><option value="SHA">SHA</option><option value="SHA-256">SHA-256</option></select>
                  </Field>
                  <Field label="Doğrulama parolası" htmlFor="snmpV3AuthPassword" required>
                    <div className="relative"><Input id="snmpV3AuthPassword" type={showSnmpAuthPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} value={form.snmpV3AuthPassword} onChange={(event) => set('snmpV3AuthPassword', event.target.value)} className="pr-10" /><PasswordToggle visible={showSnmpAuthPassword} onClick={() => setShowSnmpAuthPassword((visible) => !visible)} label="SNMPv3 doğrulama parolasını göster veya gizle" /></div>
                  </Field>
                  {form.snmpV3SecurityLevel === 'authPriv' && (
                    <>
                      <Field label="Şifreleme protokolü" htmlFor="snmpV3PrivacyProtocol">
                        <select id="snmpV3PrivacyProtocol" value={form.snmpV3PrivacyProtocol} onChange={(event) => set('snmpV3PrivacyProtocol', event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><option value="AES">AES-128</option></select>
                      </Field>
                      <Field label="Şifreleme parolası" htmlFor="snmpV3PrivacyPassword" required>
                        <div className="relative"><Input id="snmpV3PrivacyPassword" type={showSnmpPrivacyPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} value={form.snmpV3PrivacyPassword} onChange={(event) => set('snmpV3PrivacyPassword', event.target.value)} className="pr-10" /><PasswordToggle visible={showSnmpPrivacyPassword} onClick={() => setShowSnmpPrivacyPassword((visible) => !visible)} label="SNMPv3 şifreleme parolasını göster veya gizle" /></div>
                      </Field>
                    </>
                  )}
                  <p className="sm:col-span-2 text-xs text-muted-foreground">SNMPv3 parolaları şifreli saklanır ve bu ekrana geri gönderilmez.</p>
                </div>
              )}
            </section>

            <section className="border-t border-border p-5 sm:p-6" aria-labelledby="ssh-heading">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div><SectionHeading id="ssh-heading" icon={Terminal} title="SSH erişimi" description="İsteğe bağlı yapılandırma ve yedek erişimi." compact /></div>
                <div className="flex items-center gap-3"><Label htmlFor="sshEnabled" className="text-sm">Etkin</Label><Switch id="sshEnabled" checked={sshEnabled} onCheckedChange={setSshEnabled} aria-label="SSH erişimini etkinleştir" /></div>
              </div>
              {sshEnabled && <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_8.5rem]">
                <Field label="Kullanıcı adı" htmlFor="sshUsername" required><Input id="sshUsername" autoComplete="username" value={form.sshUsername} onChange={(event) => set('sshUsername', event.target.value)} /></Field>
                <Field label="SSH portu" htmlFor="sshPort"><Input id="sshPort" type="number" min={1} max={65535} value={form.sshPort} onChange={(event) => set('sshPort', Number(event.target.value))} /></Field>
                <div className="sm:col-span-2"><Field label="Parola" htmlFor="sshPassword"><div className="relative"><Input id="sshPassword" type={showSshPassword ? 'text' : 'password'} autoComplete="new-password" value={form.sshPassword} onChange={(event) => set('sshPassword', event.target.value)} className="pr-10" /><PasswordToggle visible={showSshPassword} onClick={() => setShowSshPassword((visible) => !visible)} label="Gizli SSH değerini göster veya gizle" /></div></Field></div>
              </div>}
            </section>

            <footer className="flex flex-col-reverse gap-3 border-t border-border bg-muted/20 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <p className="text-xs text-muted-foreground">Parolalar yalnızca kaydetme sırasında gönderilir.</p>
              <div className="flex gap-3"><Button type="button" variant="outline" onClick={() => router.push('/integrations/nms/devices')} disabled={saving}>İptal</Button><Button type="submit" disabled={saving || success || loadingDevices || availableDevices.length === 0}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plug className="mr-2 h-4 w-4" />}{saving ? 'Kaydediliyor' : 'İzlemeye al'}</Button></div>
            </footer>
          </CardContent>
        </Card>

        <aside className="h-fit lg:sticky lg:top-6" aria-label="İzleme özeti">
          <div className="rounded-lg border border-border bg-muted/20 p-5">
            <div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-primary" /><h2 className="font-semibold">İzleme özeti</h2></div>
            <dl className="mt-5 space-y-4 text-sm">
              <SummaryRow label="Cihaz" value={selectedDevice?.name || 'Seçilmedi'} />
              <SummaryRow label="Management IP" value={form.managementIp || 'Girilmedi'} mono />
              <SummaryRow label="SNMP" value={form.snmpVersion === 'v2c' ? `v2c · ${form.snmpPort}` : `v3 · ${form.snmpV3SecurityLevel} · ${form.snmpPort}`} />
              <SummaryRow label="Polling" value={`${form.pollingInterval} saniye`} />
              <SummaryRow label="SSH" value={sshEnabled ? 'Etkin' : 'Kapalı'} />
            </dl>
          </div>
        </aside>

        {error && <div role="alert" aria-live="assertive" className="lg:col-span-2 flex items-start gap-2 rounded-md border border-destructive/35 bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
        {success && <div role="status" aria-live="polite" className="lg:col-span-2 flex items-start gap-2 rounded-md border border-primary/30 bg-primary/10 p-3 text-sm text-primary"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />Cihaz NMS izlemeye alındı. Cihaz listesine yönlendiriliyorsunuz.</div>}
      </form>
    </main>
  );
}

function SectionHeading({ id, icon: Icon, title, description, compact = false }: { id: string; icon: typeof Server; title: string; description: string; compact?: boolean }) {
  return <div className={cn('flex items-start gap-3', compact ? '' : 'mb-5')}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span><div><h2 id={id} className="text-base font-semibold">{title}</h2><p className="mt-0.5 text-sm text-muted-foreground">{description}</p></div></div>;
}

function Field({ label, htmlFor, required, children }: { label: string; htmlFor: string; required?: boolean; children: React.ReactNode }) {
  return <div className="space-y-2"><Label htmlFor={htmlFor}>{label}{required && <span className="ml-1 text-destructive">*</span>}</Label>{children}</div>;
}

function PasswordToggle({ visible, onClick, label }: { visible: boolean; onClick: () => void; label: string }) {
  return <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2" aria-label={label} title={label} onClick={onClick}>{visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>;
}

function SelectedDevice({ device }: { device: InventoryDevice }) {
  return <div className="flex items-start gap-3 rounded-md border border-primary/25 bg-primary/5 p-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-background text-primary"><Server className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate text-sm font-medium">{device.name}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{deviceTypeLabel(device.type)}{device.vendor ? ` · ${device.vendor}` : ''}{device.model ? ` · ${device.model}` : ''}</p></div></div>;
}

function SummaryRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex items-start justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className={cn('max-w-[62%] text-right font-medium', mono && 'font-mono text-xs')}>{value}</dd></div>;
}
