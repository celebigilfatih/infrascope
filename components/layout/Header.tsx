'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCircle2, Clock, ExternalLink, Menu } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { UserProfile } from './UserProfile';
import { TopbarBreadcrumb } from './TopbarBreadcrumb';

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

const SEVERITY_LABELS: Record<string, string> = {
  ALARM_CRITICAL: 'Kritik',
  ALARM_HIGH: 'Yuksek',
  ALARM_MEDIUM: 'Orta',
  ALARM_LOW: 'Dusuk',
  ALARM_INFO: 'Bilgi',
};

const SEVERITY_BADGES: Record<string, 'destructive' | 'warning' | 'secondary' | 'outline'> = {
  ALARM_CRITICAL: 'destructive',
  ALARM_HIGH: 'warning',
  ALARM_MEDIUM: 'secondary',
  ALARM_LOW: 'outline',
  ALARM_INFO: 'outline',
};

function formatRelativeTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  if (mins < 1) return 'Simdi';
  if (mins < 60) return `${mins} dk once`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} sa once`;
  return `${Math.floor(hours / 24)} gun once`;
}

interface HeaderProps {
  onMobileMenuOpen?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onMobileMenuOpen }) => {
  const [notificationCount, setNotificationCount] = useState(0);
  const [notifications, setNotifications] = useState<AlarmNotification[]>([]);
  const [loading, setLoading] = useState(false);
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
    <header className="bg-card/80 backdrop-blur-md border-b border-border sticky top-0 z-[1000]">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0 md:hidden"
              aria-label="Gezinme menüsünü aç"
              onClick={onMobileMenuOpen}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </Button>
            <TopbarBreadcrumb />
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {licenseServerMode === false && (
              <Popover onOpenChange={(open) => { if (open) loadNotifications(); }}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative h-10 w-10" aria-label="Bildirimler">
                    <Bell className="h-5 w-5" />
                    {notificationCount > 0 && (
                      <Badge
                        variant="destructive"
                        className="absolute -top-1 -right-1 h-5 min-w-5 flex items-center justify-center p-0 px-1 text-xs"
                      >
                        {notificationCount > 99 ? '99+' : notificationCount}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="bottom" align="end" className="w-96 p-0">
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-sm">Bildirimler</h3>
                        <p className="text-xs text-muted-foreground">{notificationCount} bekleyen alarm</p>
                      </div>
                      <Button variant="ghost" size="sm" asChild className="h-8 gap-1">
                        <Link href="/dashboard/alerts?filter=unacknowledged">
                          Tumu
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                  <Separator />
                  <div className="max-h-96 overflow-y-auto p-2">
                    {loading && notifications.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-6">Bildirimler yukleniyor...</p>
                    ) : notifications.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-6">Bekleyen bildirim yok</p>
                    ) : (
                      <div className="space-y-2">
                        {notifications.map((item) => (
                          <div key={item.id} className="rounded-lg border border-border bg-background p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant={SEVERITY_BADGES[item.severity] || 'outline'} className="text-[10px]">
                                    {SEVERITY_LABELS[item.severity] || item.severity}
                                  </Badge>
                                  {item.notifiedAt ? (
                                    <Badge variant="success" className="text-[10px]">Email</Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[10px]">Email yok</Badge>
                                  )}
                                </div>
                                <p className="line-clamp-2 text-sm font-medium">{item.title}</p>
                                <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  {formatRelativeTime(item.createdAt)}
                                  {item.alarm?.code ? ` · ${item.alarm.code}` : ''}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary"
                                title="Okundu / Onaylandi"
                                onClick={() => acknowledgeAlarm(item.id)}
                                disabled={acknowledgingId === item.id}
                              >
                                <CheckCircle2 className="h-4 w-4" />
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
      </div>
    </header>
  );
};
