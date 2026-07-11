'use client';

import Link from 'next/link';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useBreadcrumbs } from './BreadcrumbProvider';

export function TopbarBreadcrumb() {
  const { items } = useBreadcrumbs();
  if (items.length === 0) return <div className="min-w-0 flex-1" />;

  const current = items[items.length - 1];
  const parent = [...items].reverse().find((item, index) => index > 0 && item.href);

  return (
    <div className="min-w-0 flex-1 pr-3">
      <nav aria-label="Breadcrumb" className="hidden min-w-0 sm:block">
        <ol className="flex min-w-0 items-center gap-1.5 text-sm">
          {items.map((item, index) => {
            const isCurrent = index === items.length - 1;
            return (
              <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
                {index > 0 && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />}
                {item.href && !isCurrent ? (
                  <Link href={item.href} className="max-w-44 truncate text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={item.label}>
                    {item.label}
                  </Link>
                ) : (
                  <span className="max-w-64 truncate font-medium text-foreground" title={item.label} aria-current={isCurrent ? 'page' : undefined}>
                    {item.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="flex min-w-0 items-center gap-2 sm:hidden">
        {parent?.href && (
          <Link href={parent.href} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${parent.label} sayfasına dön`}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
        <span className="truncate text-sm font-medium text-foreground" title={current.label} aria-current="page">
          {current.label}
        </span>
      </div>
    </div>
  );
}
