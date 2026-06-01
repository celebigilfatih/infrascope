'use client';

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
      setErrorMessage('No invitation token provided');
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
          setErrorMessage(result.error || 'Invalid invitation');
        }
      })
      .catch(() => {
        setState('invalid');
        setErrorMessage('Failed to validate invitation');
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
        setErrorMessage(result.error || 'Failed to create account');
      }
    } catch {
      setState('error');
      setErrorMessage('An unexpected error occurred');
    }
  };

  // --- Render States ---

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Verifying invitation...</p>
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
            <h2 className="text-xl font-bold mb-2">Invalid Invitation</h2>
            <p className="text-muted-foreground mb-6">{errorMessage}</p>
            <Button variant="outline" onClick={() => router.push('/dashboard')}>
              Go to Dashboard
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
            <h2 className="text-xl font-bold mb-2">Account Created!</h2>
            <p className="text-muted-foreground mb-6">
              Your account has been set up successfully. You can now log in.
            </p>
            <Button onClick={() => router.push('/dashboard')}>
              Go to Dashboard
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
            <h2 className="text-xl font-bold mb-2">Error</h2>
            <p className="text-muted-foreground mb-6">{errorMessage}</p>
            <Button variant="outline" onClick={() => router.push('/dashboard')}>
              Go to Dashboard
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
          <CardTitle className="text-xl">Set Up Your Account</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            <Mail className="h-3.5 w-3.5 inline mr-1" />
            {invitationData?.email}
          </p>
          <p className="text-xs text-muted-foreground">
            Invited as <span className="capitalize font-medium">{invitationData?.role}</span>
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Full Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your full name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a password"
            />
            <div className="mt-2 space-y-1">
              <PasswordCheck pass={passwordChecks.length} label="At least 8 characters" />
              <PasswordCheck pass={passwordChecks.uppercase} label="One uppercase letter" />
              <PasswordCheck pass={passwordChecks.number} label="One number" />
              <PasswordCheck pass={passwordChecks.special} label="One special character" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Confirm Password</label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
            />
            {confirmPassword && !passwordsMatch && (
              <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
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
                Creating Account...
              </>
            ) : (
              'Create Account'
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
