'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { User, LogOut, KeyRound, Mail, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import styles from './navigation.module.css';

interface UserProfileProps { collapsed?: boolean; compact?: boolean }

export function UserProfile({ collapsed = false, compact = false }: UserProfileProps) {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; email: string; role: string } | null>(null);
  const [open, setOpen] = useState(false);
  const firstLink = useRef<HTMLAnchorElement>(null);
  const [licenseServerMode, setLicenseServerMode] = useState<boolean | null>(null);

  useEffect(() => {
    const readUser = () => {
      const stored = localStorage.getItem('user');
      try { setUser(stored ? JSON.parse(stored) : null); } catch { setUser(null); }
    };
    readUser();
    window.addEventListener('storage', readUser);
    return () => window.removeEventListener('storage', readUser);
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/setup/status', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (active) setLicenseServerMode(Boolean(data?.licenseServerMode)); })
      .catch(() => { if (active) setLicenseServerMode(false); });
    return () => { active = false; };
  }, []);

  const handleLogout = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* Clear the local session even if the endpoint is unavailable. */ }
    localStorage.removeItem('user');
    window.dispatchEvent(new Event('storage'));
    router.push('/login');
  };

  if (!user) return <Button variant="outline" size="sm" asChild><Link href="/login" aria-label="Giriş yap"><User size={16} aria-hidden="true" />{!collapsed && 'Giriş yap'}</Link></Button>;

  const initials = user.name.split(' ').map(name => name[0]).join('').toLocaleUpperCase('tr-TR').slice(0, 2);
  const roleLabels: Record<string, string> = { admin: 'Sistem Yöneticisi', editor: 'Editör', viewer: 'İzleyici' };
  const role = roleLabels[user.role] || user.role;
  const avatar = <Avatar className={styles.avatar}><AvatarFallback className={styles.avatarFallback}>{initials}</AvatarFallback></Avatar>;
  const closeMenu = () => setOpen(false);

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" className={cn(styles.accountTrigger, compact && styles.accountCompact)} aria-label={`${user.name}: hesap menüsü`} title={collapsed ? 'Hesap menüsü' : undefined}>
        {avatar}
        {!collapsed && <><span className={styles.accountText}><strong>{user.name}</strong><small>{compact ? role : user.email}</small></span><ChevronDown size={14} aria-hidden="true" className="shrink-0 text-muted-foreground" /></>}
      </button>
    </PopoverTrigger>
    <PopoverContent side={collapsed ? 'right' : compact ? 'bottom' : 'top'} align={compact ? 'end' : 'start'} sideOffset={10} className={styles.accountPopover} aria-label="Hesap menüsü" onOpenAutoFocus={event => { event.preventDefault(); firstLink.current?.focus(); }}>
      <div className={styles.accountSummary}>{avatar}<div className={styles.accountText}><strong>{user.name}</strong><small>{role}</small><small>{user.email}</small></div></div>
      <Separator />
      <nav className={styles.accountMenu} aria-label="Hesap işlemleri">
        <Link ref={firstLink} href="/settings/users" onClick={closeMenu} className={styles.accountAction}><User aria-hidden="true" />Kullanıcı ayarları</Link>
        {licenseServerMode === false && <>
          <Link href="/settings/keys" onClick={closeMenu} className={styles.accountAction}><KeyRound aria-hidden="true" />API anahtarları</Link>
          <Link href="/settings/users/invitations" onClick={closeMenu} className={styles.accountAction}><Mail aria-hidden="true" />Davetler</Link>
        </>}
        <Separator className="my-1" />
        <Button variant="ghost" onClick={handleLogout} className={cn(styles.accountAction, styles.logout)}><LogOut aria-hidden="true" />Çıkış yap</Button>
      </nav>
    </PopoverContent>
  </Popover>;
}
