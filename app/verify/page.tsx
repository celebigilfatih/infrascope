'use client';

import { uiError } from '@/lib/i18n/tr';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle2, XCircle, Loader2, Mail, Shield } from 'lucide-react';

type PageState = 'loading' | 'valid' | 'invalid' | 'submitting' | 'success' | 'error';

function VerifyPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [state, setState] = useState<PageState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [invitationData, setInvitationData] = useState<{
    email: string;
    role: string;
    invitedBy: string;
  } | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Password validation
  const [passwordChecks, setPasswordChecks] = useState({
    length: false,
    uppercase: false,
    number: false,
    special: false,
  });

  useEffect(() => {
    if (!token) {
      setState('invalid');
      setErrorMessage(uiError("Davet bağlantısında doğrulama kodu yok."));
      return;
    }

    // Validate token
    fetch(`/api/users/verify?token=${token}`)
      .then((res) => res.json())
      .then((result) => {
        if (result.success && result.valid) {
          setInvitationData(result.data);
          setState('valid');
        } else {
          setState('invalid');
          setErrorMessage(uiError(result.error || 'Invalid invitation'));
        }
      })
      .catch(() => {
        setState('invalid');
        setErrorMessage(uiError("Davet doğrulanamadı."));
      });
  }, [token]);

  // Password strength checker
  useEffect(() => {
    setPasswordChecks({
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
    });
  }, [password]);

  const allChecksPass = Object.values(passwordChecks).every(Boolean);
  const passwordsMatch = password === confirmPassword && password.length > 0;

  const handleSubmit = async () => {
    if (!name || !password || !passwordsMatch || !allChecksPass || !token) return;

    setState('submitting');
    try {
      const response = await fetch('/api/users/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name, password }),
      });

      const result = await response.json();
      if (result.success) {
        setState('success');
      } else {
        setState('error');
        setErrorMessage(uiError(result.error || 'Failed to create account'));
      }
    } catch {
      setState('error');
      setErrorMessage(uiError("Beklenmeyen bir hata oluştu."));
    }
  };

  // --- Render States ---

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Davet doğrulanıyor…</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <XCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
            <h2 className="text-xl font-bold mb-2">Geçersiz Davet</h2>
            <p className="text-muted-foreground mb-6">{uiError(errorMessage)}</p>
            <Button variant="outline" onClick={() => router.push('/dashboard')}>
              Genel bakışa git
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
            <h2 className="text-xl font-bold mb-2">Hesap Oluşturuldu</h2>
            <p className="text-muted-foreground mb-6">
              Hesabınız oluşturuldu. Şimdi giriş yapabilirsiniz.
            </p>
            <Button onClick={() => router.push('/dashboard')}>
              Genel bakışa git
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <XCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
            <h2 className="text-xl font-bold mb-2">Hata</h2>
            <p className="text-muted-foreground mb-6">{uiError(errorMessage)}</p>
            <Button variant="outline" onClick={() => router.push('/dashboard')}>
              Genel bakışa git
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Valid invitation - show form
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl">Hesabınızı Oluşturun</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            <Mail className="h-3.5 w-3.5 inline mr-1" />
            {invitationData?.email}
          </p>
          <p className="text-xs text-muted-foreground">
            Davet Edilen Rol <span className="capitalize font-medium">{invitationData?.role}</span>
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Ad Soyad</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Adınızı ve soyadınızı girin"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Parola</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Parola oluşturun"
            />
            <div className="mt-2 space-y-1">
              <PasswordCheck pass={passwordChecks.length} label="En az 8 karakter" />
              <PasswordCheck pass={passwordChecks.uppercase} label="Bir büyük harf" />
              <PasswordCheck pass={passwordChecks.number} label="Bir rakam" />
              <PasswordCheck pass={passwordChecks.special} label="Bir özel karakter" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Parolayı Doğrula</label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Parolanızı doğrulayın"
            />
            {confirmPassword && !passwordsMatch && (
              <p className="text-xs text-red-500 mt-1">Parolalar eşleşmiyor</p>
            )}
          </div>
          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={!name || !allChecksPass || !passwordsMatch || state === 'submitting'}
          >
            {state === 'submitting' ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Hesap oluşturuluyor…
              </>
            ) : (
              "Hesap Oluştur"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function PasswordCheck({ pass, label }: { pass: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {pass ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-gray-300" />
      )}
      <span className={pass ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}>
        {label}
      </span>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <VerifyPageContent />
    </Suspense>
  );
}
