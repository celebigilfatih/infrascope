'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCircle2, Clock, ArrowUpRight, MailCheck, MailX, Menu } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SeverityBadge } from '@/components/ui/severity-badge';
import { cn } from '@/lib/utils';
import styles from './navigation.module.css';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { UserProfile } from './UserProfile';
import { TopbarBreadcrumb } from './TopbarBreadcrumb';
import { usePathname } from 'next/navigation';
import { DashboardSearch } from '@/components/dashboard/DashboardSearch';
import { incidentLabel } from '@/lib/dashboard/presentation';

interface AlarmNotification {
  id: string;
  severity: string;
  title: string;
  createdAt: string;
  notifiedAt: string | null;
  alarm?: {
    code: string;
    name: string;
    category: string;
  };
}

function formatRelativeTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  if (mins < 1) return 'Şimdi';
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} sa önce`;
  return `${Math.floor(hours / 24)} gün önce`;
}

interface HeaderProps {
  onMobileMenuOpen?: () => void;
  mobileMenuOpen?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onMobileMenuOpen, mobileMenuOpen = false }) => {
  const isDashboard = usePathname() === '/dashboard';
  const [notificationCount, setNotificationCount] = useState(0);
  const [notifications, setNotifications] = useState<AlarmNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const notificationHeading = useRef<HTMLHeadingElement>(null);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [licenseServerMode, setLicenseServerMode] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;

    fetch('/api/setup/status', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (active) setLicenseServerMode(Boolean(data?.licenseServerMode));
      })
      .catch(() => {
        if (active) setLicenseServerMode(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/alarms?acknowledged=false&limit=5', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && data.success) {
        setNotifications(data.data || []);
        setNotificationCount(data.total || 0);
      }
    } catch (error) {
      console.error('[Header] Failed to load notifications:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (licenseServerMode !== false) return;

    loadNotifications();
    const interval = window.setInterval(loadNotifications, 60_000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') loadNotifications();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', loadNotifications);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', loadNotifications);
    };
  }, [licenseServerMode, loadNotifications]);

  const acknowledgeAlarm = async (id: string) => {
    setAcknowledgingId(id);
    try {
      const res = await fetch('/api/alarms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id], acknowledged: true }),
      });

      if (res.ok) {
        await loadNotifications();
      }
    } catch (error) {
      console.error('[Header] Failed to acknowledge alarm:', error);
    } finally {
      setAcknowledgingId(null);
    }
  };

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
          <div className={styles.headerLeft}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(styles.headerIconButton, styles.menuButton)}
              aria-controls="application-navigation"
              data-mobile-menu-trigger
              aria-expanded={mobileMenuOpen}
              aria-label="Gezinme menüsünü aç"
              onClick={onMobileMenuOpen}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </Button>
            {isDashboard ? <DashboardSearch /> : <TopbarBreadcrumb />}
          </div>

          <div className={styles.headerActions}>
            {licenseServerMode === false && (
              <Popover onOpenChange={(open) => { if (open) loadNotifications(); }}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className={cn(styles.headerIconButton, styles.notificationButton)} aria-label={`Bildirimler, ${notificationCount} bekleyen alarm`}>
                    <Bell aria-hidden="true" className="h-5 w-5" />
                    {notificationCount > 0 && (
                      <Badge
                        icon={null}
                        variant="destructive"
                        className={styles.notificationCount}
                      >
                        {notificationCount > 99 ? '99+' : notificationCount}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="bottom" align="end" className={styles.notificationPopover} aria-label="Bildirimler" onOpenAutoFocus={event => { event.preventDefault(); notificationHeading.current?.focus(); }}>
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className={styles.notificationHeading}>
                        <span><Bell size={17} aria-hidden="true" /></span><div>
                        <h3 ref={notificationHeading} tabIndex={-1} className="font-semibold text-sm outline-none">Bildirimler</h3>
                        <p className="text-xs text-muted-foreground">{notificationCount} bekleyen alarm</p>
                      </div></div>
                      <Button variant="ghost" size="sm" asChild className="h-8 gap-1">
                        <Link href="/dashboard/alerts?filter=unacknowledged">
                          Tümünü gör
                          <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                  <Separator />
                  <div className={styles.notificationList}>
                    {loading && notifications.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-6">Bildirimler yükleniyor…</p>
                    ) : notifications.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-6">Bekleyen bildirim yok</p>
                    ) : (
                      <div className="space-y-2">
                        {notifications.map((item) => (
                          <div key={item.id} className="rounded-lg border border-border bg-background p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <SeverityBadge severity={item.severity} />
                                  {item.notifiedAt ? (
                                    <Badge icon={MailCheck} variant="success" className="text-[10px]">E-posta gönderildi</Badge>
                                  ) : (
                                    <Badge icon={MailX} variant="outline" className="text-[10px]">E-posta gönderilmedi</Badge>
                                  )}
                                </div>
                                <p className="line-clamp-2 text-sm font-medium">{incidentLabel(item.alarm?.code || '', item.title)}</p>
                                <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                  <Clock aria-hidden="true" className="h-3 w-3" />
                                  {formatRelativeTime(item.createdAt)}
                                  {item.alarm?.code ? ` · ${item.alarm.code}` : ''}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary"
                                title="Alarmı onayla"
                                aria-label={`${item.title} alarmını onayla`}
                                onClick={() => acknowledgeAlarm(item.id)}
                                disabled={acknowledgingId === item.id}
                              >
                                <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            )}

            <UserProfile compact />
          </div>
      </div>
    </header>
  );
};
