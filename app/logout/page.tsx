'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { LogOut, Activity } from 'lucide-react';

export default function LogoutPage() {
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem('user');
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 flex items-center justify-center p-6">
      <div className="text-center space-y-6">
        <div className="mx-auto w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
          <LogOut className="h-10 w-10 text-red-600 dark:text-red-400" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Çıkış Yap</h1>
        <p className="text-muted-foreground max-w-md">
          Oturumu kapatmak istediğinize emin misiniz?
        </p>
        <div className="flex gap-3 justify-center">
          <Button
            variant="outline"
            onClick={() => router.back()}
          >
            İptal
          </Button>
          <Button
            onClick={handleLogout}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Çıkış Yap
          </Button>
        </div>
      </div>
    </div>
  );
}
