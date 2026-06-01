'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle2, XCircle, Loader2, KeyRound } from 'lucide-react';

type PageState = 'loading' | 'valid' | 'invalid' | 'submitting' | 'success' | 'error';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [state, setState] = useState<PageState>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [passwordChecks, setPasswordChecks] = useState({
    length: false,
    uppercase: false,
    number: false,
    special: false,
  });

  useEffect(() => {
    if (!token) {
      setState('invalid');
      setErrorMessage('No reset token provided');
      return;
    }

    fetch(`/api/users/reset-password?token=${token}`)
      .then((res) => res.json())
      .then((result) => {
        if (result.success && result.valid) {
          setState('valid');
        } else {
          setState('invalid');
          setErrorMessage(result.error || 'Invalid or expired token');
        }
      })
      .catch(() => {
        setState('invalid');
        setErrorMessage('Failed to validate token');
      });
  }, [token]);

  useEffect(() => {
    setPasswordChecks({
      length: newPassword.length >= 8,
      uppercase: /[A-Z]/.test(newPassword),
      number: /[0-9]/.test(newPassword),
      special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword),
    });
  }, [newPassword]);

  const allChecksPass = Object.values(passwordChecks).every(Boolean);
  const passwordsMatch = newPassword === confirmPassword && newPassword.length > 0;

  const handleSubmit = async () => {
    if (!allChecksPass || !passwordsMatch || !token) return;

    setState('submitting');
    try {
      const response = await fetch('/api/users/reset-password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });

      const result = await response.json();
      if (result.success) {
        setState('success');
      } else {
        setState('error');
        setErrorMessage(result.error || 'Failed to reset password');
      }
    } catch {
      setState('error');
      setErrorMessage('An unexpected error occurred');
    }
  };

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Verifying reset link...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state === 'invalid' || state === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <XCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
            <h2 className="text-xl font-bold mb-2">
              {state === 'error' ? 'Error' : 'Invalid Link'}
            </h2>
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
            <h2 className="text-xl font-bold mb-2">Password Reset!</h2>
            <p className="text-muted-foreground mb-6">
              Your password has been changed successfully.
            </p>
            <Button onClick={() => router.push('/dashboard')}>
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
            <KeyRound className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl">Reset Your Password</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Enter your new password below.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">New Password</label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
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
              placeholder="Confirm new password"
            />
            {confirmPassword && !passwordsMatch && (
              <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
            )}
          </div>
          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={!allChecksPass || !passwordsMatch || state === 'submitting'}
          >
            {state === 'submitting' ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Resetting...
              </>
            ) : (
              'Reset Password'
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

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
