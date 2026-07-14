'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { BreadcrumbProvider } from './BreadcrumbProvider';

// Pages that should not show sidebar/header
const AUTH_ROUTES = ['/login', '/logout', '/verify', '/reset-password', '/setup'];

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const isAuthPage = AUTH_ROUTES.some(route => pathname.startsWith(route));

  useEffect(() => {
    setMobileNavigationOpen(false);
  }, [pathname]);

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <BreadcrumbProvider>
      <div className="flex min-h-screen bg-background text-foreground transition-colors duration-300">
        {mobileNavigationOpen && (
          <button
            type="button"
            className="fixed inset-0 z-[1100] bg-black/40 backdrop-blur-[1px] md:hidden"
            aria-label="Gezinme menüsünü kapat"
            onClick={() => setMobileNavigationOpen(false)}
          />
        )}
        <Sidebar
          mobileOpen={mobileNavigationOpen}
          onMobileClose={() => setMobileNavigationOpen(false)}
        />
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header onMobileMenuOpen={() => setMobileNavigationOpen(true)} />
          <div className="flex-1 overflow-y-auto">
            {children}
          </div>
        </main>
      </div>
    </BreadcrumbProvider>
  );
}
