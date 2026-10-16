'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useBreadcrumbs } from './BreadcrumbProvider';
import { findNavigationItem, navigationIcon } from './navigation';
import styles from './navigation.module.css';

export function TopbarBreadcrumb() {
  const { items } = useBreadcrumbs();
  const pathname = usePathname();
  if (items.length === 0) return <div className="min-w-0 flex-1" />;
  const current = items[items.length - 1];
  const Icon = navigationIcon(findNavigationItem(pathname)?.section);

  return <nav aria-label="Sayfa yolu" className={styles.breadcrumb}>
    <span className={styles.breadcrumbIcon}><Icon size={18} aria-hidden="true" /></span>
    <div className={styles.desktopBreadcrumb}>
      <ol>{items.map((item, index) => {
        const isCurrent = index === items.length - 1;
        return <li key={`${item.label}-${index}`}>
          {index > 0 && <ChevronRight size={14} aria-hidden="true" className="shrink-0 text-muted-foreground" />}
          {item.href && !isCurrent ? <Link href={item.href} title={item.label}>{item.label}</Link> : <span className={styles.breadcrumbCurrent} title={item.label} aria-current={isCurrent ? 'page' : undefined}>{item.label}</span>}
        </li>;
      })}</ol>
    </div>
    <div className={styles.mobileBreadcrumb}><span className={styles.breadcrumbCurrent} title={current.label} aria-current="page">{current.label}</span></div>
  </nav>;
}
