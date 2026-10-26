'use client';

import { uiError } from '@/lib/i18n/tr';

import { ActionIcon } from '@/components/ui/action-icon';
import { PageHeading } from '@/components/ui/page-heading';
import { createContext, FormEvent, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Activity,
  Cable,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Database,
  Eye,
  EyeOff,
  Loader2,
  KeyRound,
  LockKeyhole,
  MapPin,
  Monitor,
  Network,
  Plug,
  RefreshCw,
  Search,
  Server,
  Router,
  ShieldCheck,
  Terminal,
  UserRound,
  type LucideIcon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { notifyDeviceInventoryChanged } from '@/lib/device-inventory-events';
import styles from './page.module.css';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { SnmpConnectionTest, type SnmpTestState } from '@/components/nms/SnmpConnectionTest';
import { addNmsPayload, affectsSnmpTest, parseSnmpTestResult, snmpTestPayload, validateAddNmsForm } from '@/lib/nms/add-device-form';

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
const ValidationContext = createContext<Record<string, string>>({});
const fieldIcons: Record<string, LucideIcon> = {
  device: Server, managementIp: MapPin, snmpPort: Cable, pollingInterval: Clock3,
  snmpVersion: Network, snmpCommunity: KeyRound, snmpV3Username: UserRound,
  snmpV3SecurityLevel: ShieldCheck, snmpV3AuthProtocol: ShieldCheck,
  snmpV3AuthPassword: KeyRound, snmpV3PrivacyProtocol: LockKeyhole,
  snmpV3PrivacyPassword: KeyRound, sshUsername: UserRound, sshPort: Cable,
  sshPassword: KeyRound,
};

function deviceTypeIcon(type: string): LucideIcon {
  if (type === 'SWITCH') return Network;
  if (type === 'ROUTER') return Router;
  if (type === 'FIREWALL') return ShieldCheck;
  if (type === 'STORAGE') return Database;
  if (type === 'VIRTUAL_MACHINE') return Monitor;
  return Server;
}

function deviceTypeLabel(type: string) {
  const labels: Record<string, string> = { SWITCH: 'Ağ anahtarı', ROUTER: 'Yönlendirici', FIREWALL: 'Güvenlik duvarı', PHYSICAL_SERVER: 'Fiziksel sunucu', VIRTUAL_HOST: 'Sanal sunucu', VIRTUAL_MACHINE: 'Sanal makine', STORAGE: 'Depolama', OTHER: 'Diğer' };
  return labels[type] || type.replace(/_/g, ' ');
}

export default function AddNmsDevicePage() {
  const router = useRouter();
  const [inventoryDevices, setInventoryDevices] = useState<InventoryDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [deviceSearch, setDeviceSearch] = useState('');
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
  const filteredDevices = availableDevices.filter((device) =>
    [device.name, device.managementIp, device.vendor, device.model, deviceTypeLabel(device.type)].some((value) => value?.toLocaleLowerCase('tr').includes(deviceSearch.trim().toLocaleLowerCase('tr')))
  );
  const validationErrors = validateAddNmsForm(form, sshEnabled);
  if (selectedDevice?.nmsDeviceId != null) validationErrors.device = 'Bu cihaz zaten izleniyor. Başka bir cihaz seçin.';
  const visibleErrors = submitted ? validationErrors : {};
  const validationFor = (id: string) => ({ 'aria-invalid': !!visibleErrors[id], 'aria-describedby': visibleErrors[id] ? `${id}-error` : undefined });
  const connectionReady = !!selectedDevice && !validationErrors.managementIp && !validationErrors.snmpPort && !validationErrors.pollingInterval;
  const credentialsReady = !!selectedDevice && !Object.keys(validationErrors).some((key) => (key.startsWith('snmp') && key !== 'snmpPort') || key.startsWith('ssh'));
  const completedSteps = [!!selectedDevice, connectionReady, credentialsReady].filter(Boolean).length;

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
        const devices: InventoryDevice[] = [];
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
    }));
    setError(null);
  }

  const testErrors = validateAddNmsForm(form, false);
  const testReady = !!selectedDevice && selectedDevice.nmsDeviceId == null && !Object.keys(testErrors).some(key => key === 'device' || key === 'managementIp' || key.startsWith('snmp'));
  const testSummary = { idle: 'Henüz yapılmadı', running: 'Test sürüyor', success: 'Yanıt alındı', failure: 'Doğrulanamadı', stale: 'Yeniden test gerekli', cancelled: 'İptal edildi' }[testState.status];
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
      const firstInvalidField = document.getElementById(Object.keys(validationErrors)[0]);
      firstInvalidField?.focus({ preventScroll: true });
      firstInvalidField?.scrollIntoView({ block: 'center' });
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

  return (
    <div className={cn(styles.page, 'mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8')}>
      <header className={cn(styles.header, 'mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between')}>
        <div className="flex min-w-0 items-start gap-3">
          <Button variant="outline" size="icon" asChild className="mt-0.5 shrink-0" aria-label="NMS izlenen cihazlara dön">
            <Link href="/integrations/nms/devices"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-primary"><Activity aria-hidden="true" className="h-4 w-4" />NMS İzleme</div>
            <PageHeading section="addDevice" description={<>Cihazı seçin, SNMP ayarlarını tamamlayın ve bağlantıyı kontrol ederek izlemeyi yapılandırın.</>}>Cihazı izlemeye al</PageHeading>
          </div>
        </div>
        <Badge variant="outline" className="w-fit gap-1.5 px-2.5 py-1 text-xs"><ShieldCheck className="h-3.5 w-3.5 text-primary" />Envanter korunur</Badge>
      </header>

      <ol aria-label="Yapılandırma durumu" className={styles.steps}>
        {[
          { title: 'Cihaz seçimi', detail: 'Envanterden seçin', done: !!selectedDevice, icon: Server },
          { title: 'Adres ve izleme', detail: 'Yönetim adresi ve sıklık', done: connectionReady, icon: Plug },
          { title: 'Erişim ayarları', detail: 'SNMP ve isteğe bağlı SSH', done: credentialsReady, icon: ShieldCheck },
        ].map((step, index) => {
          const Icon = step.done ? CheckCircle2 : step.icon;
          const active = !step.done && index === (!selectedDevice ? 0 : !connectionReady ? 1 : 2);
          return <li key={step.title} className={cn(styles.step, step.done && styles.stepDone, active && styles.stepActive)} aria-current={active ? 'step' : undefined}>
            <span className={styles.stepIcon}><Icon aria-hidden="true" className="h-4 w-4" /></span>
            <div className="min-w-0"><span className="block text-xs font-semibold sm:text-sm">{step.title}<span className="sr-only">{step.done ? ': tamamlandı' : ': bekliyor'}</span></span><span className="mt-0.5 hidden text-xs text-muted-foreground sm:block">{step.detail}</span></div>
            <span aria-hidden="true" className={styles.stepNumber}>{String(index + 1).padStart(2, '0')}</span>
          </li>;
        })}
      </ol>

      <ValidationContext.Provider value={visibleErrors}>
      <form onSubmit={handleSubmit} className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] lg:grid-cols-[minmax(0,1fr)_18rem]" noValidate>
        <Card className="min-w-0 border-0 bg-transparent shadow-none">
          <CardContent className="space-y-5 p-0">
            <section className="rounded-xl border border-border bg-card p-5 sm:p-6" aria-labelledby="inventory-heading">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <SectionHeading id="inventory-heading" icon={Server} title="Envanter cihazı" description="İzlemeye almak istediğiniz cihazı seçin." compact />
                {!loadingDevices && !inventoryError && <Badge variant="outline" className="gap-1.5 font-normal"><Activity aria-hidden="true" className="h-3.5 w-3.5 text-primary" />{inventoryDevices.length - availableDevices.length} izleniyor</Badge>}
              </div>
              {loadingDevices ? (
                <div role="status" className="flex min-h-24 items-center justify-center gap-2 rounded-lg bg-muted/30 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Envanter cihazları yükleniyor...</div>
              ) : inventoryError ? (
                <div role="alert" className="rounded-lg border border-destructive/25 bg-destructive/5 p-4"><p className="text-sm font-medium">Envantere ulaşılamadı</p><p className="mt-1 text-sm text-muted-foreground">{uiError(inventoryError)}</p><Button type="button" variant="outline" size="sm" className="mt-4 gap-2" onClick={() => setRetryCount((value) => value + 1)}><RefreshCw className="h-3.5 w-3.5" />Tekrar dene</Button></div>
              ) : availableDevices.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-muted/20 px-5 py-8 text-center">
                  <span className={styles.emptyIcon}>{inventoryDevices.length ? <CheckCircle2 aria-hidden="true" className="h-7 w-7" /> : <Server aria-hidden="true" className="h-7 w-7" />}</span>
                  <p className="text-sm font-semibold">{inventoryDevices.length ? 'Tüm cihazlar zaten izleniyor' : 'Önce envantere bir cihaz ekleyin'}</p>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{inventoryDevices.length ? 'Mevcut cihazların izleme ayarlarını cihaz listesinden yönetebilir veya envantere yeni bir cihaz ekleyebilirsiniz.' : 'NMS izleme, mevcut envanter kaydına eklenir. Cihazı oluşturduktan sonra bu ekrandan devam edebilirsiniz.'}</p>
                  <Button size="sm" className="mt-5 gap-2" asChild><Link href={inventoryDevices.length ? '/integrations/nms/devices' : '/devices'}>{inventoryDevices.length ? <Activity aria-hidden="true" className="h-4 w-4" /> : <Server aria-hidden="true" className="h-4 w-4" />}{inventoryDevices.length ? 'İzlenen cihazlara git' : 'Envantere git'}<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link></Button>
                  {inventoryDevices.length > 0 && <div className="mt-3"><Button asChild variant="ghost" size="sm" className="gap-2 text-muted-foreground"><Link href="/devices"><Server aria-hidden="true" className="h-4 w-4" />Envantere cihaz ekle</Link></Button></div>}
                </div>
              ) : (
                <div className="space-y-3">
                  {availableDevices.length > 8 && <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Envanterde cihaz ara" placeholder="Cihaz adı, IP adresi veya üretici ara…" value={deviceSearch} onChange={(event) => setDeviceSearch(event.target.value)} className="pl-9" /></div>}
                  <Field label="Cihaz" htmlFor="device" required>
                    <div className="relative">
                      <select id="device" {...validationFor('device')} required disabled={saving || success} value={form.deviceId} onChange={(event) => selectDevice(event.target.value)} className="h-11 w-full appearance-none rounded-md border border-input bg-background px-3 pr-10 text-sm outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-invalid:border-destructive">
                        <option value="">Envanterden cihaz seçin</option>
                        {selectedDevice && !filteredDevices.some((device) => device.id === selectedDevice.id) && <option value={selectedDevice.id}>{selectedDevice.name} · {deviceTypeLabel(selectedDevice.type)}</option>}
                        {filteredDevices.map((device) => <option key={device.id} value={device.id}>{device.name}{device.managementIp ? ` · ${device.managementIp}` : ''} · {deviceTypeLabel(device.type)}</option>)}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    </div>
                  </Field>
                  <p className="text-xs text-muted-foreground" role="status">{deviceSearch ? `${filteredDevices.length} sonuç · ` : ''}{availableDevices.length} cihaz izlemeye alınabilir{inventoryDevices.length > availableDevices.length ? ` · ${inventoryDevices.length - availableDevices.length} cihaz zaten izleniyor` : ''}</p>
                  {selectedDevice && <SelectedDevice device={selectedDevice} />}
                </div>
              )}
            </section>

            {(loadingDevices || (!inventoryError && availableDevices.length > 0)) && <fieldset disabled={saving || success || !selectedDevice} className="min-w-0 space-y-5 disabled:opacity-60">
            <legend className="sr-only">İzleme yapılandırması</legend>
            <section className="rounded-xl border border-border bg-card p-5 sm:p-6" aria-labelledby="connection-heading">
              <SectionHeading id="connection-heading" icon={Plug} title="Yönetim bağlantısı" description="NMS ajanının SNMP isteği göndereceği cihaz adresi ve portu." />
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8.5rem]">
                <Field label="Yönetim IP adresi" htmlFor="managementIp" required>
                  <Input id="managementIp" {...validationFor('managementIp')} required autoComplete="off" placeholder="Örn. 10.10.10.15" value={form.managementIp} onChange={(event) => set('managementIp', event.target.value)} aria-describedby={visibleErrors.managementIp ? 'managementIp-hint managementIp-error' : 'managementIp-hint'} />
                  <p id="managementIp-hint" className="mt-1.5 text-xs text-muted-foreground">IPv4 veya IPv6 adresi. Bağlantı testi NMS ajanından bu adrese gönderilir.</p>
                </Field>
                <Field label="SNMP portu" htmlFor="snmpPort">
                  <Input id="snmpPort" {...validationFor('snmpPort')} required type="number" min={1} max={65535} value={form.snmpPort} onChange={(event) => set('snmpPort', Number(event.target.value))} />
                </Field>
              </div>

            </section>

            <section className="rounded-xl border border-border bg-card p-5 sm:p-6" aria-labelledby="snmp-heading">
              <SectionHeading id="snmp-heading" icon={ShieldCheck} title="SNMP erişim ayarları" description="Sürümü ve kimlik bilgilerini cihazın mevcut SNMP yapılandırmasıyla eşleştirin." />
              <div className="grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
                <Field label="SNMP sürümü" htmlFor="snmpVersion">
                  <div className="relative"><select id="snmpVersion" value={form.snmpVersion} onChange={(event) => set('snmpVersion', event.target.value as SnmpVersion)} className="h-10 w-full appearance-none rounded-md border border-input bg-background px-3 pr-9 text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><option value="v2c">SNMPv2c</option><option value="v3">SNMPv3</option></select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /></div>
                </Field>
                {form.snmpVersion === 'v2c' && (
                  <Field label="Topluluk adı (community)" htmlFor="snmpCommunity" required>
                    <div className="relative"><Input id="snmpCommunity" {...validationFor('snmpCommunity')} required type={showCommunity ? 'text' : 'password'} autoComplete="new-password" placeholder="Cihazdaki topluluk adını girin" value={form.snmpCommunity} onChange={(event) => set('snmpCommunity', event.target.value)} className="pr-10" /><PasswordToggle visible={showCommunity} onClick={() => setShowCommunity((visible) => !visible)} label="Gizli community değerini göster veya gizle" /></div>
                  </Field>
                )}
              </div>
              <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground"><ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />{form.snmpVersion === 'v3' ? 'SNMPv3, kullanıcı doğrulaması ve isteğe bağlı şifreleme sağlar.' : 'SNMPv2c topluluk adıyla erişir. SNMPv3 ile kullanıcı doğrulaması ve şifreleme seçenekleri kullanılabilir.'}</p>
              {form.snmpVersion === 'v3' && (
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
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
                  <p className="sm:col-span-2 text-xs text-muted-foreground">Doğrulama ve şifreleme parolaları 8–255 karakter olmalıdır. Kullanıcı adı 1–64 karakter olmalı; boşluk ve Türkçe karakter içermemelidir.</p>
                </div>
              )}
            </section>

            <section className="rounded-xl border border-border bg-card p-5 sm:p-6" aria-labelledby="ssh-heading">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div><SectionHeading id="ssh-heading" icon={Terminal} title="SSH erişimi" description="İsteğe bağlı yapılandırma ve yedek erişimi." compact /></div>
                <div className="flex items-center gap-3"><Label htmlFor="sshEnabled" className="text-sm text-muted-foreground">{sshEnabled ? 'Etkin' : 'Kapalı'}</Label><Switch id="sshEnabled" checked={sshEnabled} onCheckedChange={setSshEnabled} aria-label="SSH erişimini etkinleştir" /></div>
              </div>
              {!sshEnabled && <p className="mt-4 flex items-start gap-2 rounded-lg bg-muted/40 p-3 text-xs leading-5 text-muted-foreground"><Database aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />Yapılandırma yedekleri için SSH erişimini etkinleştirin ve cihazın giriş bilgilerini ekleyin. SNMP bağlantı testi SSH girişini doğrulamaz.</p>}
              {sshEnabled && <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_8.5rem]">
                <Field label="Kullanıcı adı" htmlFor="sshUsername" required><Input id="sshUsername" {...validationFor('sshUsername')} required autoComplete="username" value={form.sshUsername} onChange={(event) => set('sshUsername', event.target.value)} /></Field>
                <Field label="SSH portu" htmlFor="sshPort"><Input id="sshPort" {...validationFor('sshPort')} required type="number" min={1} max={65535} value={form.sshPort} onChange={(event) => set('sshPort', Number(event.target.value))} /></Field>
                <div className="sm:col-span-2"><Field label="Parola" htmlFor="sshPassword"><div className="relative"><Input id="sshPassword" type={showSshPassword ? 'text' : 'password'} autoComplete="new-password" value={form.sshPassword} onChange={(event) => set('sshPassword', event.target.value)} className="pr-10" /><PasswordToggle visible={showSshPassword} onClick={() => setShowSshPassword((visible) => !visible)} label="Gizli SSH değerini göster veya gizle" /></div></Field></div>
              </div>}
            </section>
            <section className="rounded-xl border border-border bg-card p-5 sm:p-6" aria-labelledby="monitoring-heading">
              <SectionHeading id="monitoring-heading" icon={Activity} title="Veri toplama seçenekleri" description="Kaydettikten sonra izlemenin başlayıp başlamayacağını ve ölçüm sıklığını belirleyin." />
              <div className={styles.monitoringToggle}><div><Label htmlFor="pollingEnabled" className="font-medium">Kaydettikten sonra veri toplamayı başlat</Label><p>{form.pollingEnabled ? 'NMS ajanı yapılandırmayı aldıktan sonra düzenli veri toplamayı dener.' : 'Ayarlar kaydedilir; veri toplama kapalı kalır. Daha sonra izleme ayarlarından açabilirsiniz.'}</p></div><Switch id="pollingEnabled" checked={form.pollingEnabled} onCheckedChange={value => set('pollingEnabled', value)} aria-label="Kaydettikten sonra veri toplamayı başlat" /></div>
              <div className="mt-5">
                <Field label="Veri toplama aralığı" htmlFor="pollingInterval" required>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Veri toplama aralığı önayarları">
                    {pollingPresets.map((seconds) => <Button key={seconds} type="button" size="sm" aria-pressed={form.pollingInterval === seconds} className={cn(form.pollingInterval === seconds && 'border-primary/40 bg-primary/10 text-foreground hover:bg-primary/15')} variant="outline" onClick={() => set('pollingInterval', seconds)}>{seconds < 60 ? `${seconds} sn` : `${seconds / 60} dk`}</Button>)}
                    <div className="relative w-28"><Input id="pollingInterval" {...validationFor('pollingInterval')} required type="number" min={30} max={86400} step={1} value={form.pollingInterval} onChange={(event) => set('pollingInterval', Number(event.target.value))} className="pr-9" /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">sn</span></div>
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">Varsayılan aralık 5 dakikadır. 30 saniye–24 saat arasında seçim yapabilirsiniz. Daha kısa aralık daha sık SNMP isteği üretir.</p>
                </Field>
              </div>
            </section>
            <SnmpConnectionTest state={testState} ready={testReady} onTest={() => void testConnection()} onCancel={cancelTest} />
            </fieldset>}
          </CardContent>
        </Card>

        <aside className={styles.summary} aria-label="İzleme özeti">
          <div className={cn(styles.summaryCard, "overflow-hidden rounded-xl border border-border bg-card shadow-xs")}>
            <div className="border-b border-border bg-muted/25 p-5">
              <div className="flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-semibold"><ClipboardCheck aria-hidden="true" className="h-4 w-4 text-primary" />İzleme özeti</h2><Badge variant="outline" className="bg-background text-xs">{completedSteps}/3 alan grubu hazır</Badge></div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{selectedDevice ? 'Kaydetmeden önce yapılandırmayı kontrol edin.' : 'Başlamak için envanterden bir cihaz seçin.'}</p>
              <div role="progressbar" aria-label="İzleme yapılandırması" aria-valuemin={0} aria-valuemax={3} aria-valuenow={completedSteps} className="mt-4 flex gap-1.5">{[1, 2, 3].map((step) => <span key={step} className={cn('h-1 flex-1 rounded-full transition-colors', completedSteps >= step ? 'bg-primary' : 'bg-border')} />)}</div>
            </div>
            <div className={styles.summaryScroll}><dl className="space-y-4 p-5 text-sm">
              <SummaryRow icon={selectedDevice ? deviceTypeIcon(selectedDevice.type) : Server} label="Cihaz" value={selectedDevice?.name || 'Seçilmedi'} />
              <SummaryRow icon={MapPin} label="Yönetim IP" value={form.managementIp || 'Girilmedi'} mono />
              <SummaryRow icon={ShieldCheck} label="SNMP" value={`${form.snmpVersion === 'v2c' ? 'v2c' : 'v3'} · Port ${form.snmpPort}`} />
              <SummaryRow icon={Clock3} label="Ölçüm aralığı" value={Number.isInteger(form.pollingInterval) && form.pollingInterval >= 30 && form.pollingInterval <= 86400 ? (form.pollingInterval % 60 === 0 ? `${form.pollingInterval / 60} dakikada bir` : `${form.pollingInterval} saniyede bir`) : 'Geçerli aralık girin'} />
              <SummaryRow icon={Activity} label="Veri toplama" value={form.pollingEnabled ? 'Kayıttan sonra açık' : 'Kapalı kaydedilecek'} />
              <SummaryRow icon={Plug} label="SNMP testi" value={testSummary} />
              <SummaryRow icon={Terminal} label="SSH" value={sshEnabled ? 'Etkin' : 'Kapalı'} />
            </dl>
            <div className="space-y-4 border-t border-border p-5">
              <SemanticBadge tone={testState.status === 'success' ? 'success' : testState.status === 'failure' || testState.status === 'stale' ? 'warning' : 'neutral'} icon={Plug}>SNMP testi: {testSummary}</SemanticBadge>
              <p className="text-xs leading-5 text-muted-foreground">Test isteğe bağlıdır. Kaydetmek ayarları cihaza ekler; ilk ölçümün alınması NMS ajanının erişimine bağlıdır.</p>
              <div className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><p>Mevcut envanter kaydı korunur. İzleme ayarları bu cihaza eklenir.</p></div>
              {submitted && Object.keys(validationErrors).length > 0 && <p role="alert" className="text-sm text-destructive">İşaretli alanları kontrol edin. {Object.keys(validationErrors).length} alan eksik veya geçersiz.</p>}
              {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>{uiError(error)}</p></div>}
              {success && <div role="status" className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><p>{form.pollingEnabled ? 'İzleme ayarları kaydedildi. Veri toplama açık.' : 'İzleme ayarları kaydedildi. Veri toplama kapalı.'} Cihaz listesine yönlendiriliyorsunuz.</p></div>}
            </div></div><div className={styles.summaryActions}>
              <Button className="w-full gap-2" type="submit" disabled={saving || success || testState.status === 'running' || loadingDevices || !!inventoryError || availableDevices.length === 0}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : success ? <CheckCircle2 className="h-4 w-4" /> : <Activity className="h-4 w-4" />}{saving ? 'Kaydediliyor…' : success ? 'Ayarlar kaydedildi' : form.pollingEnabled ? 'Kaydet ve izlemeyi başlat' : 'İzleme ayarlarını kaydet'}</Button>
              <Button className="w-full" type="button" variant="outline" onClick={() => router.push('/integrations/nms/devices')} disabled={saving || success || testState.status === 'running'}><ActionIcon action="cancel" />Vazgeç</Button>
              <p className="text-center text-xs leading-5 text-muted-foreground">{loadingDevices ? 'Cihaz listesi yükleniyor.' : inventoryError ? 'Devam etmek için envanteri tekrar yükleyin.' : availableDevices.length === 0 ? 'İzleme için uygun bir envanter cihazı gerekli.' : '* işaretli alanlar zorunludur.'}</p>
            </div>
          </div>
        </aside>
      </form>
      </ValidationContext.Provider>
    </div>
  );
}

function SectionHeading({ id, icon: Icon, title, description, compact = false }: { id: string; icon: typeof Server; title: string; description: string; compact?: boolean }) {
  return <div className={cn('flex items-start gap-3', compact ? '' : 'mb-5')}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span><div><h2 id={id} className="text-base font-semibold">{title}</h2><p className="mt-0.5 text-sm text-muted-foreground">{description}</p></div></div>;
}

function Field({ label, htmlFor, required, children }: { label: string; htmlFor: string; required?: boolean; children: React.ReactNode }) {
  const errors = useContext(ValidationContext);
  const Icon = fieldIcons[htmlFor];
  return <div className="space-y-2 [&_input[aria-invalid=true]]:border-destructive"><Label htmlFor={htmlFor} className="flex items-center gap-1.5">{Icon && <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}{label}{required && <span className="text-destructive" aria-hidden="true">*</span>}</Label>{children}{errors[htmlFor] && <p id={`${htmlFor}-error`} className="flex items-start gap-1.5 text-xs text-destructive"><AlertCircle aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />{errors[htmlFor]}</p>}</div>;
}

function PasswordToggle({ visible, onClick, label }: { visible: boolean; onClick: () => void; label: string }) {
  return <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2" aria-label={label} aria-pressed={visible} title={label} onClick={onClick}>{visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>;
}

function SelectedDevice({ device }: { device: InventoryDevice }) {
  const Icon = deviceTypeIcon(device.type);
  return <div className="flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/5 p-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-background text-primary"><Icon aria-hidden="true" className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="wrap-break-word text-sm font-medium">{device.name}</p><p className="mt-0.5 wrap-break-word text-xs text-muted-foreground">{deviceTypeLabel(device.type)}{device.vendor ? ` · ${device.vendor}` : ''}{device.model ? ` · ${device.model}` : ''}</p></div><CheckCircle2 aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-primary" /></div>;
}

function SummaryRow({ icon: Icon, label, value, mono = false }: { icon: LucideIcon; label: string; value: string; mono?: boolean }) {
  return <div className="flex items-start justify-between gap-3"><dt className="flex shrink-0 items-center gap-2 text-muted-foreground"><Icon aria-hidden="true" className="mt-0.5 h-3.5 w-3.5" />{label}</dt><dd className={cn('min-w-0 wrap-break-word text-right font-medium', mono && 'break-all font-mono text-xs')}>{value}</dd></div>;
}
