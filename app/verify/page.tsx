'use client';

import { acceptInvitationToken, readInvitationToken, VerificationError, type VerificationData } from '@/lib/invitations/acceptance';
import { uiError, uiLabel } from '@/lib/i18n/tr';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle2, XCircle, Loader2, Mail, Shield } from 'lucide-react';

type PageState = 'loading' | 'valid' | 'invalid' | 'unavailable' | 'submitting' | 'success' | 'error';

function VerifyPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [state, setState] = useState<PageState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [invitationData, setInvitationData] = useState<VerificationData | null>(null);
  const [readAttempt, setReadAttempt] = useState(0);
  const sequence = useRef(0);

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
    sequence.current += 1;
    const controller = new AbortController();
    setState('loading'); setInvitationData(null); setErrorMessage(''); setName(''); setPassword(''); setConfirmPassword('');
    void readInvitationToken(token || '', controller.signal).then(result => {
      if (!controller.signal.aborted) { setInvitationData(result); setState('valid'); }
    }).catch(error => {
      if (!controller.signal.aborted) { setState(error instanceof VerificationError && error.invalid ? 'invalid' : 'unavailable'); setErrorMessage(error instanceof Error ? error.message : 'Davet doğrulanamadı.'); }
    });
    return () => { sequence.current += 1; controller.abort(); };
  }, [token, readAttempt]);

  // Password strength checker
  useEffect(() => {
    setPasswordChecks({
      length: password.length >= 8 && password.length <= 72,
      uppercase: /[A-Z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
    });
  }, [password]);

  const allChecksPass = Object.values(passwordChecks).every(Boolean);
  const passwordsMatch = password === confirmPassword && password.length > 0;

  const handleSubmit = async () => {
    if (state !== 'valid' || !name.trim() || name.trim().length > 100 || !passwordsMatch || !allChecksPass || !token || !invitationData) return;
    const id = sequence.current;
    setState('submitting'); setErrorMessage('');
    try {
      await acceptInvitationToken(token, name, password, invitationData);
      if (id !== sequence.current) return;
      setPassword(''); setConfirmPassword(''); setState('success');
    } catch (error) {
      if (id !== sequence.current) return;
      setState(error instanceof VerificationError && error.uncertain ? 'error' : 'valid');
      setErrorMessage(error instanceof Error ? error.message : 'Hesap oluşturulamadı.');
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

  if (state === 'invalid' || state === 'unavailable') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <XCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
            <h2 className="text-xl font-bold mb-2">{state === 'invalid' ? 'Geçersiz Davet' : 'Davet doğrulanamadı'}</h2>
            <p className="text-muted-foreground mb-6">{uiError(errorMessage)}</p>
            {state === 'unavailable' && <Button className="mb-3 w-full" onClick={() => setReadAttempt(previous => previous + 1)}>Yeniden doğrula</Button>}
            <Button variant="outline" onClick={() => router.push('/login')}>
              Giriş ekranına git
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
            <Button onClick={() => router.push('/login')}>
              Giriş ekranına git
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
            <Button variant="outline" onClick={() => router.push('/login')}>
              Giriş ekranına git
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
            Davet Edilen Rol <span className="font-medium">{uiLabel(invitationData?.role || 'UNKNOWN')}</span>
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {errorMessage && <p role="alert" className="text-sm text-red-500">{errorMessage}</p>}
          <div>
            <label htmlFor="verify-name" className="block text-sm font-medium mb-1">Ad Soyad</label>
            <Input
              id="verify-name" maxLength={100} disabled={state === 'submitting'} autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Adınızı ve soyadınızı girin"
            />
          </div>
          <div>
            <label htmlFor="verify-password" className="block text-sm font-medium mb-1">Parola</label>
            <Input
              type="password"
              id="verify-password" maxLength={72} disabled={state === 'submitting'} autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Parola oluşturun"
            />
            <div className="mt-2 space-y-1">
              <PasswordCheck pass={passwordChecks.length} label="8–72 karakter" />
              <PasswordCheck pass={passwordChecks.uppercase} label="Bir büyük harf" />
              <PasswordCheck pass={passwordChecks.number} label="Bir rakam" />
              <PasswordCheck pass={passwordChecks.special} label="Bir özel karakter" />
            </div>
          </div>
          <div>
            <label htmlFor="verify-confirm" className="block text-sm font-medium mb-1">Parolayı Doğrula</label>
            <Input
              type="password"
              id="verify-confirm" maxLength={72} disabled={state === 'submitting'} autoComplete="new-password"
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
            disabled={!name.trim() || name.trim().length > 100 || !allChecksPass || !passwordsMatch || state === 'submitting'}
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
