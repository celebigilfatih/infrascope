'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function routeFromSetupState() {
      try {
        const res = await fetch('/api/setup/status', { cache: 'no-store' });
        const data = await res.json();
        if (!cancelled) {
          const target = data.licenseServerMode ? '/license-admin' : '/dashboard';
          router.push(data.setupRequired ? '/setup' : target);
        }
      } catch {
        if (!cancelled) router.push('/dashboard');
      }
    }

    routeFromSetupState();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
