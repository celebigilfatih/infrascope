'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Monitor, 
  MapPin, 
  Network, 
  Users,
  Activity,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Shield,
  AlertTriangle,
  Moon,
  Sun,
  Building2,
  Grid,
  Layers,
  Server,
  HardDrive,
  Cpu,
  Database,
  GitBranch,
  Box,
  Puzzle,
  Plug,
  ShieldAlert,
  Globe,
  Lock,
  History,
  Key,
  ExternalLink,
  FileText,
  Mail,
  X
} from 'lucide-react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { UserProfile } from './UserProfile';

interface SidebarItem {
  name: string;
  href: string;
  icon: LucideIcon;
  subItems?: string[];
  hasArrow?: boolean;
  children?: { name: string; href: string; icon: LucideIcon }[];
}

interface SidebarSection {
  title: string;
  items: SidebarItem[];
}

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen = false, onMobileClose }) => {
  const pathname = usePathname();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [licenseServerMode, setLicenseServerMode] = useState<boolean | null>(null);

  useEffect(() => {
    setMounted(true);
    const isDark = document.documentElement.classList.contains('dark');
    setTheme(isDark ? 'dark' : 'light');

    const savedState = localStorage.getItem('sidebarCollapsed');
    if (savedState !== null) setIsCollapsed(savedState === 'true');

    const savedSections = localStorage.getItem('sidebarSections');
    if (savedSections) {
      try { setCollapsedSections(JSON.parse(savedSections)); } catch {}
    }

    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const updateMobileState = () => setIsMobile(mediaQuery.matches);
    updateMobileState();
    mediaQuery.addEventListener('change', updateMobileState);

    return () => mediaQuery.removeEventListener('change', updateMobileState);
  }, []);

  useEffect(() => {
    if (!mounted) return;
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
  }, [mounted]);

  // Auto-expand the section that contains the active page
  useEffect(() => {
    if (!mounted) return;
    sections.forEach((section) => {
      const hasActive = section.items.some((item) => pathname === item.href || pathname.startsWith(item.href + '/'));
      if (hasActive) {
        setCollapsedSections((prev) => {
          if (prev[section.title]) {
            const next = { ...prev, [section.title]: false };
            localStorage.setItem('sidebarSections', JSON.stringify(next));
            return next;
          }
          return prev;
        });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, mounted]);

  const toggleSidebar = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('sidebarCollapsed', String(newState));
  };

  const toggleSection = (title: string) => {
    setCollapsedSections((prev) => {
      const next = { ...prev, [title]: !prev[title] };
      localStorage.setItem('sidebarSections', JSON.stringify(next));
      return next;
    });
  };

  const toggleTheme = () => {
    const html = document.documentElement;
    const isDark = html.classList.contains('dark');
    
    if (isDark) {
      html.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      setTheme('light');
    } else {
      html.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setTheme('dark');
    }
  };

  const customerSections: SidebarSection[] = [
    {
      title: 'Dashboard',
      items: [
        { name: 'Genel Saglik', href: '/dashboard', icon: LayoutDashboard },
        { name: 'Kritik Alarmlar', href: '/dashboard/alerts', icon: AlertTriangle },
        // { name: 'Riskli Assetler', href: '/dashboard/risks', icon: AlertOctagon },
      ]
    },
    {
      title: 'Infrastructure',
      items: [
        { name: 'Locations', href: '/locations', icon: MapPin },
        { name: 'Racks', href: '/racks', icon: Grid },
        { name: 'Devices', href: '/devices', icon: Monitor },
        // { name: 'Power / Capacity', href: '/infrastructure/capacity', icon: Zap },
      ]
    },
    {
      title: 'Virtualization',
      items: [
        { name: 'Clusters', href: '/virtualization/clusters', icon: Layers },
        { name: 'ESXi Hosts', href: '/virtualization/hosts', icon: Server },
        { name: 'Virtual Machines', href: '/virtualization/vms', icon: Cpu },
        { name: 'Datastores', href: '/virtualization/datastores', icon: HardDrive },
        { name: 'Snapshots', href: '/virtualization/snapshots', icon: Database },
      ]
    },
    {
      title: 'Network',
      items: [
        { name: 'Topology', href: '/network', icon: Network },
        { name: 'Switches', href: '/integrations/nms/devices', icon: Server },
        { name: 'Add Device', href: '/integrations/nms/add-device', icon: Plug },
        { name: 'Config Backups', href: '/integrations/nms/backups', icon: Database },
      ]
    },
    {
      title: 'Security',
      items: [
        { name: 'Firewall View', href: '/network/firewall', icon: Lock },
        { name: 'Config Revisions', href: '/network/config-revisions', icon: History },
        { name: 'Virtual IPs', href: '/security/virtual-ips', icon: ExternalLink },
        { name: 'Web Analytics', href: '/security/web-analytics', icon: Globe },
        { name: 'Quarantine', href: '/security/quarantine', icon: Lock },
        { name: 'Firewall Policies', href: '/security/policies', icon: Shield },
        { name: 'IPsec Tunnels', href: '/network/ipsec', icon: Globe },
        { name: 'SSL-VPN', href: '/network/ssl-vpn', icon: Users },
        { name: 'Risky Rules', href: '/security/risks', icon: AlertTriangle },
        // TEMPORARILY DISABLED - IPS / DoS Events page
        // { name: 'IPS / DoS Events', href: '/security/ips', icon: ShieldAlert },
      ]
    },
    {
      title: 'Services',
      items: [
        { name: 'Applications', href: '/services/apps', icon: Box },
        { name: 'Services', href: '/services', icon: Puzzle },
        { name: 'Dependencies', href: '/services/dependencies', icon: GitBranch },
      ]
    },
    // TEMPORARILY DISABLED - Analytics menu
    // {
    //   title: 'Analytics',
    //   items: [
    //     { name: 'Capacity Trends', href: '/analytics/capacity', icon: TrendingUp },
    //     { name: 'Growth Forecast', href: '/analytics/forecast', icon: TrendingUp },
    //     { name: 'VM Sprawl', href: '/analytics/sprawl', icon: Cpu },
    //   ]
    // },
    {
      title: 'Integrations',
      items: [
        { name: 'VMware', href: '/integrations/vmware', icon: Server },
        { name: 'Firewall', href: '/integrations/firewall', icon: Shield },
        { name: 'FortiAnalyzer', href: '/integrations/fortianalyzer', icon: Activity },
        { name: 'Sync Status', href: '/integrations/status', icon: Activity },
      ]
    },
    {
      title: 'Settings',
      items: [
        { name: 'Organizations', href: '/settings/organizations', icon: Building2 },
        { name: 'Users & Roles', href: '/settings/users', icon: Users },
        { name: 'Invitations', href: '/settings/users/invitations', icon: Mail },
        { name: 'Audit Log', href: '/settings/audit', icon: FileText },
        { name: 'Alert Rules', href: '/settings/alerts', icon: AlertTriangle },
        { name: 'API Keys', href: '/settings/keys', icon: Key },
        { name: 'License', href: '/settings/license', icon: Key },
      ]
    },
  ];

  const licenseServerSections: SidebarSection[] = [
    {
      title: 'License Control',
      items: [
        { name: 'License Admin', href: '/license-admin', icon: Key },
        { name: 'Users & Roles', href: '/settings/users', icon: Users },
      ],
    },
  ];

  const sections = licenseServerMode === null
    ? []
    : licenseServerMode ? licenseServerSections : customerSections;
  const homeHref = licenseServerMode ? '/license-admin' : '/dashboard';
  const renderedCollapsed = isCollapsed && !isMobile;

  return (
    <aside className={cn(
      "fixed inset-y-0 left-0 z-[1200] flex h-screen w-72 max-w-[calc(100vw-3rem)] flex-col border-r border-border bg-card shadow-xl transition-transform duration-300 md:sticky md:top-0 md:z-auto md:max-w-none md:translate-x-0 md:shadow-none md:transition-all",
      mobileOpen ? "translate-x-0" : "-translate-x-full",
      renderedCollapsed ? "md:w-20" : "md:w-64"
    )}>
      <div className={cn(
        "p-6 transition-all duration-300 flex items-center justify-between",
        renderedCollapsed ? "px-4" : "px-6"
      )}>
        {!renderedCollapsed && (
          <Link href={homeHref} onClick={onMobileClose} className="flex items-center gap-2 group overflow-hidden">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground shadow-lg transition-colors duration-300 shrink-0">
              <Activity className="h-5 w-5" />
            </div>
            <div className="flex flex-col whitespace-nowrap">
              <span className="text-sm font-bold tracking-tight text-foreground leading-none transition-colors duration-300">
                InfraScope
              </span>
              <span className="text-[10px] text-primary font-bold mt-0.5 uppercase tracking-widest transition-colors duration-300">
                Altyapı Yönetimi
              </span>
            </div>
          </Link>
        )}
        {renderedCollapsed && (
          <Link href={homeHref} className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground shadow-lg mx-auto">
            <Activity className="h-5 w-5" />
          </Link>
        )}
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={toggleSidebar}
          className={cn(
            "hidden h-8 w-8 rounded-full border border-border bg-card shadow-sm transition-all duration-300 md:inline-flex",
            renderedCollapsed ? "absolute -right-4 top-10 z-50" : "shrink-0 ml-2"
          )}
          aria-label={renderedCollapsed ? 'Kenar çubuğunu genişlet' : 'Kenar çubuğunu daralt'}
        >
          {renderedCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 md:hidden"
          aria-label="Gezinme menüsünü kapat"
          onClick={onMobileClose}
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </Button>
      </div>

      <div className={cn(
        "flex-1 overflow-y-auto space-y-6 custom-scrollbar transition-all duration-300",
        renderedCollapsed ? "px-2 py-4" : "px-4 py-2"
      )}>
        {sections.map((section) => (
          <div key={section.title} className="space-y-1">
            {!renderedCollapsed && (
              <button
                onClick={() => toggleSection(section.title)}
                className="w-full flex items-center justify-between px-2 mb-1 group cursor-pointer"
              >
                <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider group-hover:text-foreground transition-colors">
                  {section.title}
                </h3>
                <ChevronDown className={cn(
                  "h-3 w-3 text-muted-foreground/60 transition-transform duration-200 group-hover:text-foreground",
                  collapsedSections[section.title] ? "-rotate-90" : "rotate-0"
                )} />
              </button>
            )}
            {(!collapsedSections[section.title] || renderedCollapsed) && section.items.map((item) => {
              const isActive = pathname === item.href;
              const isParentActive = item.children
                ? pathname.startsWith(item.href)
                : false;
              const Icon = item.icon;
              return (
                <div key={item.name}>
                  <Button
                    variant="ghost"
                    className={cn(
                      "w-full h-9 hover:bg-accent hover:text-accent-foreground flex items-center transition-all relative group",
                      renderedCollapsed ? "justify-center px-0" : "justify-start px-2",
                      (isActive || isParentActive) && "bg-primary/10 text-primary font-semibold border-l-2 border-primary shadow-sm",
                      !isActive && !isParentActive && "border-l-2 border-transparent"
                    )}
                    asChild
                    title={renderedCollapsed ? item.name : undefined}
                  >
                    <Link href={item.href} prefetch={true} onClick={onMobileClose}>
                      <div className={cn("flex items-center", renderedCollapsed ? "justify-center" : "gap-3")}>
                        <Icon className={cn(
                          "h-4 w-4 shrink-0 transition-all", 
                          (isActive || isParentActive) ? "text-primary scale-110" : "text-muted-foreground group-hover:text-foreground"
                        )} />
                        {!renderedCollapsed && <span className={cn("text-xs truncate", (isActive || isParentActive) && "font-semibold")}>{item.name}</span>}
                      </div>
                      {!renderedCollapsed && (item.subItems || item.hasArrow || item.children) && (
                        <ChevronDown className={cn(
                          "h-3 w-3 text-muted-foreground/50 ml-auto transition-transform",
                          isParentActive && "rotate-180"
                        )} />
                      )}
                    </Link>
                  </Button>
                  
                  {!renderedCollapsed && item.subItems && isActive && (
                    <div className="ml-9 mt-1 space-y-1">
                      {item.subItems.map((sub) => (
                        <Link 
                          key={sub} 
                          href="#" 
                          className={cn(
                            "block text-[11px] py-1.5 px-2 rounded-md hover:bg-accent/50 transition-colors",
                            sub === 'Dashboard 1' ? "text-foreground font-semibold bg-accent/30" : "text-muted-foreground"
                          )}
                        >
                          {sub}
                        </Link>
                      ))}
                    </div>
                  )}

                  {!renderedCollapsed && item.children && isParentActive && (
                    <div className="ml-7 mt-0.5 space-y-0.5 border-l border-border/60 pl-3">
                      {item.children.map((child) => {
                        const isChildActive = pathname === child.href;
                        const ChildIcon = child.icon;
                        return (
                          <Button
                            key={child.href}
                            variant="ghost"
                            className={cn(
                              "w-full h-8 justify-start px-2 text-xs transition-all",
                              isChildActive
                                ? "text-primary font-semibold bg-primary/10"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                            asChild
                          >
                            <Link href={child.href} prefetch={true} onClick={onMobileClose}>
                              <ChildIcon className="h-3.5 w-3.5 shrink-0 mr-2" />
                              {child.name}
                            </Link>
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className={cn(
        "p-4 space-y-3 border-t border-border bg-muted/20 transition-all",
        renderedCollapsed ? "items-center" : ""
      )}>
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
          className={cn(
            "w-full h-9 text-xs transition-all",
            renderedCollapsed ? "justify-center px-0" : "justify-start px-2"
          )}
          disabled={!mounted}
          title={renderedCollapsed ? (theme === 'light' ? 'Koyu Mod' : 'Açık Mod') : undefined}
        >
          {mounted ? (
            <div className="flex items-center justify-center gap-2">
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              {!renderedCollapsed && (theme === 'light' ? "Koyu Mod" : "Açık Mod")}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              {!renderedCollapsed && "Tema..."}
            </div>
          )}
        </Button>
        
        <UserProfile collapsed={renderedCollapsed} />
      </div>
    </aside>
  );
};
