'use client';

import React, { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { BreadcrumbProvider } from './BreadcrumbProvider';
import dashboardStyles from '@/components/dashboard/dashboard.module.css';

// Pages that should not show sidebar/header
const AUTH_ROUTES = ['/login', '/logout', '/verify', '/reset-password', '/setup'];

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const content = useRef<HTMLElement>(null);
  const isAuthPage = AUTH_ROUTES.some(route => pathname.startsWith(route));
  const isDashboard = pathname === '/dashboard';

  useEffect(() => {
    setMobileNavigationOpen(false);
  }, [pathname]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const element = content.current;
    const update = () => {
      element?.toggleAttribute('inert', mobileNavigationOpen && media.matches);
      if (!media.matches) setMobileNavigationOpen(false);
    };
    update();
    media.addEventListener('change', update);
    return () => { media.removeEventListener('change', update); element?.removeAttribute('inert'); };
  }, [mobileNavigationOpen]);

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <BreadcrumbProvider>
      <div className={isDashboard ? dashboardStyles.shell : 'flex min-h-screen bg-background text-foreground transition-colors duration-300'}>
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
        <main ref={content} className={`flex-1 flex flex-col min-w-0 overflow-hidden${isDashboard ? ` ${dashboardStyles.content}` : ''}`}>
          <Header mobileMenuOpen={mobileNavigationOpen} onMobileMenuOpen={() => setMobileNavigationOpen(true)} />
          <div className="flex-1 overflow-y-auto">
            {children}
          </div>
        </main>
      </div>
    </BreadcrumbProvider>
  );
}
