'use client';

import { useState } from 'react';
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (connectorId: string) => void;
};

const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

export function FirewallOnboardingDialog({ open, onOpenChange, onCreated }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'password' | 'token'>('password');
  const [showSecrets, setShowSecrets] = useState(false);
  const [snmpEnabled, setSnmpEnabled] = useState(false);
  const [snmpVersion, setSnmpVersion] = useState<'2c' | '3'>('2c');
  const [securityLevel, setSecurityLevel] = useState<'authNoPriv' | 'authPriv'>('authPriv');
  const [sshEnabled, setSshEnabled] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const snmp = snmpEnabled
      ? snmpVersion === '3'
        ? {
            version: '3',
            username: form.get('snmpV3Username'),
            securityLevel,
            authProtocol: form.get('snmpV3AuthProtocol'),
            authPassword: form.get('snmpV3AuthPassword'),
            privacyProtocol: securityLevel === 'authPriv' ? 'AES' : undefined,
            privacyPassword: securityLevel === 'authPriv' ? form.get('snmpV3PrivacyPassword') : undefined,
            port: Number(form.get('snmpPort')),
            pollingInterval: Number(form.get('pollingInterval')),
          }
        : {
            version: snmpVersion,
            community: form.get('snmpCommunity'),
            port: Number(form.get('snmpPort')),
            pollingInterval: Number(form.get('pollingInterval')),
          }
      : undefined;
    const ssh = sshEnabled
      ? {
          username: form.get('sshUsername'),
          password: form.get('sshPassword'),
          port: Number(form.get('sshPort')),
        }
      : undefined;
    try {
      const response = await fetch('/api/firewalls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.get('name'),
          model: form.get('model'),
          host: form.get('host'),
          vdom: form.get('vdom'),
          username: authMode === 'password' ? form.get('username') : undefined,
          password: authMode === 'password' ? form.get('password') : undefined,
          accessToken: authMode === 'token' ? form.get('accessToken') : undefined,
          snmp,
          ssh,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Firewall kaydedilemedi.');
      onOpenChange(false);
      onCreated(data.data.connector.id);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Firewall kaydedilemedi.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto p-0">
        <form onSubmit={submit}>
          <DialogHeader className="border-b px-6 py-5 pr-12">
            <DialogTitle>FortiGate ekle</DialogTitle>
            <DialogDescription>
              REST kullanılamasa bile cihaz kaydedilir. SNMP veya SSH hazırsa kısıtlı izleme devam eder.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-7 px-6 py-6">
            <section aria-labelledby="firewall-identity-title">
              <h2 id="firewall-identity-title" className="text-sm font-semibold">Cihaz ve yönetim adresi</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Cihaz adı" name="name" placeholder="Merkez FortiGate" required />
                <Field label="Model" name="model" placeholder="FortiGate 100F" />
                <Field label="Yönetim IP / hostname" name="host" placeholder="10.10.10.1" required />
                <Field label="VDOM" name="vdom" defaultValue="root" required />
              </div>
            </section>

            <section aria-labelledby="firewall-rest-title" className="border-t pt-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 id="firewall-rest-title" className="text-sm font-semibold">FortiGate REST erişimi</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Salt okunur yönetici veya API token kullanın.</p>
                </div>
                <div className="inline-flex rounded-md bg-muted p-1" aria-label="REST kimlik doğrulama yöntemi">
                  {(['password', 'token'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setAuthMode(mode)}
                      className={cn('h-8 rounded-sm px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', authMode === mode && 'bg-background shadow-sm')}
                      aria-pressed={authMode === mode}
                    >
                      {mode === 'password' ? 'Kullanıcı / parola' : 'API token'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {authMode === 'password' ? (
                  <>
                    <Field label="Kullanıcı adı" name="username" autoComplete="username" required />
                    <SecretField label="Parola" name="password" visible={showSecrets} required />
                  </>
                ) : (
                  <div className="sm:col-span-2">
                    <SecretField label="API token" name="accessToken" visible={showSecrets} required />
                  </div>
                )}
              </div>
            </section>

            <FallbackSection
              title="SNMP fallback"
              description="REST sertifikası sorunluysa sağlık ve port verilerini toplamaya devam eder."
              checked={snmpEnabled}
              onCheckedChange={setSnmpEnabled}
            >
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="snmpVersion">SNMP sürümü</Label>
                  <select id="snmpVersion" className={selectClass} value={snmpVersion} onChange={(event) => setSnmpVersion(event.target.value as '2c' | '3')}>
                    <option value="2c">SNMPv2c</option>
                    <option value="3">SNMPv3</option>
                  </select>
                </div>
                <Field label="SNMP portu" name="snmpPort" type="number" defaultValue="161" min="1" max="65535" required />
                <Field label="Polling aralığı (sn)" name="pollingInterval" type="number" defaultValue="300" min="10" max="86400" required />
              </div>
              {snmpVersion === '2c' ? (
                <SecretField label="Community" name="snmpCommunity" visible={showSecrets} required />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="SNMPv3 kullanıcı adı" name="snmpV3Username" required />
                  <div className="space-y-2">
                    <Label htmlFor="snmpV3SecurityLevel">Güvenlik seviyesi</Label>
                    <select id="snmpV3SecurityLevel" className={selectClass} value={securityLevel} onChange={(event) => setSecurityLevel(event.target.value as 'authNoPriv' | 'authPriv')}>
                      <option value="authPriv">Kimlik doğrulama + şifreleme</option>
                      <option value="authNoPriv">Yalnız kimlik doğrulama</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="snmpV3AuthProtocol">Kimlik doğrulama</Label>
                    <select id="snmpV3AuthProtocol" name="snmpV3AuthProtocol" className={selectClass} defaultValue="SHA-256">
                      <option value="SHA-256">SHA-256</option>
                      <option value="SHA">SHA</option>
                    </select>
                  </div>
                  <SecretField label="Kimlik doğrulama parolası" name="snmpV3AuthPassword" visible={showSecrets} required />
                  {securityLevel === 'authPriv' && (
                    <div className="sm:col-span-2">
                      <SecretField label="Şifreleme parolası (AES)" name="snmpV3PrivacyPassword" visible={showSecrets} required />
                    </div>
                  )}
                </div>
              )}
            </FallbackSection>

            <FallbackSection
              title="SSH fallback"
              description="Salt okunur durum ve konfigürasyon yedeği için kullanılır. Host key ayrıca onaylanır."
              checked={sshEnabled}
              onCheckedChange={setSshEnabled}
            >
              <div className="grid gap-4 sm:grid-cols-[1fr_1fr_120px]">
                <Field label="SSH kullanıcı adı" name="sshUsername" required />
                <SecretField label="SSH parolası" name="sshPassword" visible={showSecrets} required />
                <Field label="SSH portu" name="sshPort" type="number" defaultValue="22" min="1" max="65535" required />
              </div>
            </FallbackSection>

            <button type="button" onClick={() => setShowSecrets((value) => !value)} className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {showSecrets ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              {showSecrets ? 'Gizli alanları maskele' : 'Gizli alanları göster'}
            </button>

            {error && <p role="alert" className="border-l-2 border-red-500 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-300">{error}</p>}

            <div className="flex gap-3 rounded-md border border-emerald-500/25 bg-emerald-500/5 p-4 text-sm">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
              <p><span className="font-semibold">Güvenli başlangıç:</span> TLS doğrulaması kapatılmaz, tüm credential alanları şifreli saklanır ve write yeteneği kapalıdır.</p>
            </div>
          </div>

          <DialogFooter className="border-t px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Vazgeç</Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              Firewall ekle
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, name, ...props }: React.ComponentProps<typeof Input> & { label: string; name: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} {...props} />
    </div>
  );
}

function SecretField({ label, name, visible, ...props }: React.ComponentProps<typeof Input> & { label: string; name: string; visible: boolean }) {
  return <Field label={label} name={name} type={visible ? 'text' : 'password'} autoComplete="new-password" {...props} />;
}

function FallbackSection({ title, description, checked, onCheckedChange, children }: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t pt-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={`${title} ${checked ? 'aktif' : 'pasif'}`} />
      </div>
      {checked && <div className="mt-5 space-y-4">{children}</div>}
    </section>
  );
}
