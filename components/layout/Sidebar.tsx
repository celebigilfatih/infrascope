'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, ChevronDown, ChevronLeft, ChevronRight, Moon, Sun, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { UserProfile } from './UserProfile';
import { customerNavigation, licenseNavigation, findNavigationItem, navigationIcon } from './navigation';
import styles from './navigation.module.css';

interface SidebarProps { mobileOpen?: boolean; onMobileClose?: () => void }

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen = false, onMobileClose }) => {
  const pathname = usePathname();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [licenseServerMode, setLicenseServerMode] = useState<boolean | null>(null);
  const sidebar = useRef<HTMLElement>(null);
  const sections = licenseServerMode === null ? [] : licenseServerMode ? licenseNavigation : customerNavigation;
  const activeItem = findNavigationItem(pathname, sections);
  const activeSection = sections.find(section => section.items.some(item => item.href === activeItem?.href))?.id;
  const homeHref = licenseServerMode ? '/license-admin' : '/dashboard';
  const renderedCollapsed = isCollapsed && !isMobile;

  useEffect(() => {
    setMounted(true);
    const readTheme = () => setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    readTheme();
    const observer = new MutationObserver(readTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    const savedState = localStorage.getItem('sidebarCollapsed');
    if (savedState !== null) setIsCollapsed(savedState === 'true');
    const savedSections = localStorage.getItem('sidebarSections');
    if (savedSections) { try { setCollapsedSections(JSON.parse(savedSections)); } catch {} }
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const updateMobileState = () => setIsMobile(mediaQuery.matches);
    updateMobileState();
    mediaQuery.addEventListener('change', updateMobileState);
    return () => { observer.disconnect(); mediaQuery.removeEventListener('change', updateMobileState); };
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/setup/status', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (active) setLicenseServerMode(Boolean(data?.licenseServerMode)); })
      .catch(() => { if (active) setLicenseServerMode(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!mounted || !activeSection) return;
    setCollapsedSections(previous => {
      if (!previous[activeSection]) return previous;
      const next = { ...previous, [activeSection]: false };
      localStorage.setItem('sidebarSections', JSON.stringify(next));
      return next;
    });
  }, [pathname, mounted, activeSection]);

  useEffect(() => {
    if (!isMobile || !mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => sidebar.current?.querySelector<HTMLButtonElement>('[data-mobile-close]')?.focus());
    const keyboard = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') { event.preventDefault(); onMobileClose?.(); }
      if (event.key !== 'Tab') return;
      const controls = Array.from(sidebar.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex="0"]') || []).filter(el => el.getClientRects().length > 0);
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keyboard);
    return () => {
      document.removeEventListener('keydown', keyboard);
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-mobile-menu-trigger]')?.focus({ preventScroll: true }));
    };
  }, [isMobile, mobileOpen, onMobileClose]);

  const toggleSidebar = () => {
    setIsCollapsed(previous => { localStorage.setItem('sidebarCollapsed', String(!previous)); return !previous; });
  };
  const toggleSection = (id: string) => {
    setCollapsedSections(previous => {
      const next = { ...previous, [id]: !previous[id] };
      localStorage.setItem('sidebarSections', JSON.stringify(next));
      return next;
    });
  };
  const toggleTheme = () => {
    const dark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', dark ? 'dark' : 'light');
    setTheme(dark ? 'dark' : 'light');
  };

  return <aside ref={sidebar} id="application-navigation" aria-label="Ana gezinme" role={isMobile && mobileOpen ? 'dialog' : undefined} aria-modal={isMobile && mobileOpen ? true : undefined}
    className={cn(styles.sidebar, renderedCollapsed && styles.collapsed, mobileOpen && styles.mobileOpen)}>
    <div className={styles.brandRow}>
      <Link href={homeHref} onClick={onMobileClose} className={styles.brand} aria-label="InfraScope ana sayfa">
        <span className={styles.brandIcon}><Activity size={22} aria-hidden="true" /></span>
        {!renderedCollapsed && <span className={styles.brandText}><strong>InfraScope</strong><small>Altyapı Yönetimi</small></span>}
      </Link>
      <Button variant="ghost" size="icon" onClick={toggleSidebar} className={styles.collapseButton} aria-controls="application-navigation" aria-expanded={!renderedCollapsed} aria-label={renderedCollapsed ? 'Kenar çubuğunu genişlet' : 'Kenar çubuğunu daralt'}>
        {renderedCollapsed ? <ChevronRight aria-hidden="true" /> : <ChevronLeft aria-hidden="true" />}
      </Button>
      <Button type="button" variant="ghost" size="icon" className={styles.mobileClose} data-mobile-close aria-label="Gezinme menüsünü kapat" onClick={onMobileClose}><X aria-hidden="true" /></Button>
    </div>
    <nav className={cn(styles.navigation, 'custom-scrollbar')} aria-label="Uygulama bölümleri">
      {sections.map(section => <div key={section.id} className={styles.section}>
        {!renderedCollapsed && <button type="button" className={styles.sectionToggle} onClick={() => toggleSection(section.id)} aria-expanded={!collapsedSections[section.id]} aria-controls={`nav-section-${section.id.replace(/\s+/g, '-')}`}>
          <span>{section.title}</span><ChevronDown size={14} aria-hidden="true" className={cn(styles.sectionChevron, collapsedSections[section.id] && styles.sectionClosed)} />
        </button>}
        <div id={`nav-section-${section.id.replace(/\s+/g, '-')}`} hidden={Boolean(collapsedSections[section.id] && !renderedCollapsed)} className={styles.sectionLinks}>
          {section.items.map(item => {
            const active = activeItem?.href === item.href;
            const Icon = navigationIcon(item.section);
            return <Link key={item.href} href={item.href} onClick={onMobileClose} className={cn(styles.navLink, active && styles.navActive)} aria-current={active ? 'page' : undefined} aria-label={renderedCollapsed ? item.name : undefined} title={renderedCollapsed ? item.name : undefined}>
              <span className={styles.navIcon}><Icon size={18} aria-hidden="true" /></span>
              {!renderedCollapsed && <span className={styles.navLabel}>{item.name}</span>}
            </Link>;
          })}
        </div>
      </div>)}
    </nav>
    <div className={styles.sidebarFooter}>
      <Button variant="ghost" onClick={toggleTheme} className={styles.themeButton} disabled={!mounted} aria-label={theme === 'light' ? 'Koyu temaya geç' : 'Açık temaya geç'} title={renderedCollapsed ? (theme === 'light' ? 'Koyu temaya geç' : 'Açık temaya geç') : undefined}>
        {theme === 'light' ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}{!renderedCollapsed && <span>{!mounted ? 'Tema yükleniyor…' : theme === 'light' ? 'Koyu tema' : 'Açık tema'}</span>}
      </Button>
      <UserProfile collapsed={renderedCollapsed} />
    </div>
  </aside>;
};
