'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, ArrowRight, CheckCircle2, KeyRound, Loader2, ShieldCheck, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

type SetupStatus = {
  setupRequired: boolean;
  hasAdmin: boolean;
  licenseConfigured: boolean;
  licenseServerMode: boolean;
};

type LicenseInfo = {
  tier: string;
  maxDevices: number;
  maxUsers: number;
  daysRemaining: number;
  licenseKey: string;
};

export default function SetupPage() {
  const router = useRouter();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [license, setLicense] = useState<LicenseInfo | null>(null);

  const [licenseKey, setLicenseKey] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      try {
        const res = await fetch('/api/setup/status', { cache: 'no-store' });
        const data = await res.json();
        if (cancelled) return;

        if (!data.setupRequired) {
          router.replace('/login');
          return;
        }

        if (data.licenseServerMode) {
          setStep(2);
        }
        setStatus(data);
      } catch {
        setError('Kurulum durumu okunamadı.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadStatus();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const activateLicense = async () => {
    setError('');
    if (status?.licenseConfigured && !licenseKey.trim()) {
      setStep(2);
      return;
    }
    if (!licenseKey.trim()) {
      setError('Lisans anahtarı gerekli.');
      return;
    }

    setWorking(true);
    try {
      const res = await fetch('/api/setup/license', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: licenseKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Lisans aktivasyonu başarısız.');
        return;
      }

      setLicense(data.license);
      setStep(2);
    } catch {
      setError('Lisans sunucusuna ulaşılamadı.');
    } finally {
      setWorking(false);
    }
  };

  const createAdmin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setWorking(true);

    try {
      const res = await fetch('/api/setup/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: adminName,
          email: adminEmail,
          password: adminPassword,
          companyName,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        const details = Array.isArray(data.details) ? ` ${data.details.join(', ')}` : '';
        setError(`${data.error || 'İlk admin oluşturulamadı.'}${details}`);
        return;
      }

      setStep(3);
    } catch {
      setError('İlk admin oluşturulamadı.');
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-950 text-white">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  const isLicenseServerMode = Boolean(status?.licenseServerMode);
  const progressValue = isLicenseServerMode ? (step === 2 ? 50 : 100) : step === 1 ? 33 : step === 2 ? 66 : 100;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-emerald-500">
              <Activity className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">InfraScope</h1>
              <p className="text-sm text-slate-400">İlk kurulum</p>
            </div>
          </div>
          <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
            {isLicenseServerMode ? 'License Server' : 'On-Prem Docker'}
          </Badge>
        </div>

        <div className="grid flex-1 items-center gap-8 py-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-6">
            <div>
              <h2 className="text-4xl font-bold leading-tight">Kurulumu güvenli şekilde tamamlayın.</h2>
              <p className="mt-4 max-w-lg text-slate-400">
                {isLicenseServerMode
                  ? 'Merkezi lisans sunucusu için şirket kaydı ve ilk admin hesabı burada oluşturulur. Varsayılan admin şifresi yoktur.'
                  : 'Lisans doğrulaması, şirket kaydı ve ilk admin hesabı burada oluşturulur. Varsayılan admin şifresi yoktur.'}
              </p>
            </div>

            <div className="space-y-3">
              <Progress value={progressValue} className="h-2 bg-slate-800" />
              <div className={`grid gap-2 text-xs text-slate-400 ${isLicenseServerMode ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {!isLicenseServerMode && (
                  <span className={step >= 1 ? 'text-emerald-300' : ''}>Lisans</span>
                )}
                <span className={step >= 2 ? 'text-emerald-300' : ''}>Admin</span>
                <span className={step >= 3 ? 'text-emerald-300' : ''}>Tamamlandı</span>
              </div>
            </div>
          </div>

          <Card className="border-slate-800 bg-white text-slate-950 shadow-2xl">
            {step === 1 && (
              <>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <KeyRound className="h-5 w-5 text-emerald-600" />
                    Lisans aktivasyonu
                  </CardTitle>
                  <CardDescription>
                    Kurulum script'i lisans anahtarını .env dosyasına yazdıysa bu adımı geçebilirsiniz.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {status?.licenseConfigured && (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                      .env içinde lisans anahtarı bulundu.
                    </div>
                  )}
                  {license && (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                      {license.tier} lisans aktif. Cihaz limiti: {license.maxDevices}, kullanıcı limiti: {license.maxUsers}.
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="licenseKey">Lisans anahtarı</Label>
                    <Input
                      id="licenseKey"
                      value={licenseKey}
                      onChange={(event) => setLicenseKey(event.target.value)}
                      placeholder="IS-2026-XXXX-XXXX"
                    />
                  </div>
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <Button className="w-full gap-2" onClick={activateLicense} disabled={working}>
                    {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                    {status?.licenseConfigured && !licenseKey.trim() ? 'Devam Et' : 'Lisansı Aktive Et'}
                  </Button>
                </CardContent>
              </>
            )}

            {step === 2 && (
              <form onSubmit={createAdmin}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserPlus className="h-5 w-5 text-emerald-600" />
                    İlk admin hesabı
                  </CardTitle>
                  <CardDescription>
                    Bu hesap sistemin ilk ve tam yetkili kullanıcısı olacak.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Şirket adı</Label>
                    <Input
                      id="companyName"
                      value={companyName}
                      onChange={(event) => setCompanyName(event.target.value)}
                      placeholder="Acme Teknoloji"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="adminName">Ad soyad</Label>
                      <Input
                        id="adminName"
                        value={adminName}
                        onChange={(event) => setAdminName(event.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="adminEmail">E-posta</Label>
                      <Input
                        id="adminEmail"
                        type="email"
                        value={adminEmail}
                        onChange={(event) => setAdminEmail(event.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="adminPassword">Şifre</Label>
                    <Input
                      id="adminPassword"
                      type="password"
                      value={adminPassword}
                      onChange={(event) => setAdminPassword(event.target.value)}
                      required
                    />
                    <p className="text-xs text-slate-500">
                      En az 8 karakter, bir büyük harf, bir sayı ve bir özel karakter içermeli.
                    </p>
                  </div>
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <Button className="w-full gap-2" disabled={working}>
                    {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    İlk Admini Oluştur
                  </Button>
                </CardContent>
              </form>
            )}

            {step === 3 && (
              <>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    Kurulum tamamlandı
                  </CardTitle>
                  <CardDescription>
                    Artık oluşturduğunuz admin hesabı ile giriş yapabilirsiniz.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full gap-2" onClick={() => router.replace('/login')}>
                    Login Ekranına Git
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
