'use client';

import { uiError } from '@/lib/i18n/tr';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { findNavigationItem } from './navigation';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbContextValue {
  items: BreadcrumbItem[];
  setPageBreadcrumbs: (items: BreadcrumbItem[]) => void;
  clearPageBreadcrumbs: () => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null);

const STATIC_BREADCRUMBS: Record<string, BreadcrumbItem[]> = {
  '/dashboard/alerts': [
    { label: 'Genel Sağlık', href: '/dashboard' },
    { label: 'Olay Merkezi' },
  ],
  '/dashboard/risks': [
    { label: 'Genel Sağlık', href: '/dashboard' },
    { label: 'Riskli Varlıklar' },
  ],
  '/integrations/nms/add-device': [
    { label: 'NMS İzlenen Cihazlar', href: '/integrations/nms/devices' },
    { label: 'İzlemeye Al' },
  ],
  '/integrations/nms/backups': [
    { label: 'NMS İzlenen Cihazlar', href: '/integrations/nms/devices' },
    { label: 'Yapılandırma Yedekleri' },
  ],
  '/network/config-revisions': [
    { label: 'Topoloji', href: '/network' },
    { label: 'Yapılandırma Geçmişi' },
  ],
  '/network/firewall': [
    { label: 'Topoloji', href: '/network' },
    { label: 'Güvenlik Duvarı' },
  ],
  '/network/ipsec': [
    { label: 'Güvenlik Duvarı', href: '/network/firewall' },
    { label: 'IPsec Tünelleri' },
  ],
  '/network/ssl-vpn': [
    { label: 'Güvenlik Duvarı', href: '/network/firewall' },
    { label: 'SSL-VPN Oturumları' },
  ],
  '/services/apps': [
    { label: 'Servisler', href: '/services' },
    { label: 'Uygulamalar' },
  ],
  '/services/dependencies': [
    { label: 'Servisler', href: '/services' },
    { label: 'Bağımlılıklar' },
  ],
  '/settings/users/invitations': [
    { label: 'Kullanıcılar ve Roller', href: '/settings/users' },
    { label: 'Davetler' },
  ],
};

function getRouteBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const staticItems = STATIC_BREADCRUMBS[pathname];
  if (staticItems) return staticItems;

  if (/^\/integrations\/nms\/devices\/[^/]+\/edit$/.test(pathname)) {
    const detailHref = pathname.replace(/\/edit$/, '');
    return [
      { label: 'NMS İzlenen Cihazlar', href: '/integrations/nms/devices' },
      { label: 'Cihaz detayı', href: detailHref },
      { label: 'İzleme Ayarları' },
    ];
  }

  if (/^\/integrations\/nms\/devices\/[^/]+$/.test(pathname)) {
    return [
      { label: 'NMS İzlenen Cihazlar', href: '/integrations/nms/devices' },
      { label: 'Cihaz detayı' },
    ];
  }

  if (/^\/locations\/rooms\/[^/]+$/.test(pathname)) {
    return [
      { label: 'Fiziksel Konumlar', href: '/locations' },
      { label: 'Oda yerleşimi' },
    ];
  }

  const item = findNavigationItem(pathname);
  if (!item) return [];
  if (pathname === item.href) return [{ label: item.name }];
  return [{ label: item.name, href: item.href }, { label: 'Detay' }];
}

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [pageItems, setPageItems] = useState<{ pathname: string; items: BreadcrumbItem[] } | null>(null);

  const setPageBreadcrumbs = useCallback((items: BreadcrumbItem[]) => {
    setPageItems({ pathname, items });
  }, [pathname]);

  const clearPageBreadcrumbs = useCallback(() => {
    setPageItems((current) => current?.pathname === pathname ? null : current);
  }, [pathname]);

  const items = pageItems?.pathname === pathname ? pageItems.items : getRouteBreadcrumbs(pathname);
  const value = useMemo(() => ({ items, setPageBreadcrumbs, clearPageBreadcrumbs }), [items, setPageBreadcrumbs, clearPageBreadcrumbs]);

  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>;
}

export function useBreadcrumbs() {
  const context = useContext(BreadcrumbContext);
  if (!context) throw new Error(uiError('useBreadcrumbs must be used within BreadcrumbProvider'));
  return context;
}

export function usePageBreadcrumb(items: BreadcrumbItem[] | null) {
  const { setPageBreadcrumbs, clearPageBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    if (!items) return;
    setPageBreadcrumbs(items);
    return clearPageBreadcrumbs;
  }, [items, setPageBreadcrumbs, clearPageBreadcrumbs]);
}
