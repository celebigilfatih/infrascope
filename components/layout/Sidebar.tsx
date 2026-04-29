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
  ExternalLink
} from 'lucide-react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

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

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

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
  }, []);

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

  const sections: SidebarSection[] = [
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
        { name: 'Alert Rules', href: '/settings/alerts', icon: AlertTriangle },
        { name: 'API Keys', href: '/settings/keys', icon: Key },
      ]
    },
  ];

  return (
    <aside className={cn(
      "border-r border-border bg-card flex flex-col h-screen sticky top-0 transition-all duration-300",
      isCollapsed ? "w-20" : "w-64"
    )}>
      <div className={cn(
        "p-6 transition-all duration-300 flex items-center justify-between",
        isCollapsed ? "px-4" : "px-6"
      )}>
        {!isCollapsed && (
          <Link href="/dashboard" className="flex items-center gap-2 group overflow-hidden">
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
        {isCollapsed && (
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground shadow-lg mx-auto">
            <Activity className="h-5 w-5" />
          </div>
        )}
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={toggleSidebar}
          className={cn(
            "h-8 w-8 rounded-full border border-border shadow-sm transition-all duration-300 bg-card",
            isCollapsed ? "absolute -right-4 top-10 z-50" : "shrink-0 ml-2"
          )}
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      <div className={cn(
        "flex-1 overflow-y-auto space-y-6 custom-scrollbar transition-all duration-300",
        isCollapsed ? "px-2 py-4" : "px-4 py-2"
      )}>
        {sections.map((section) => (
          <div key={section.title} className="space-y-1">
            {!isCollapsed && (
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
            {(!collapsedSections[section.title] || isCollapsed) && section.items.map((item) => {
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
                      isCollapsed ? "justify-center px-0" : "justify-start px-2",
                      (isActive || isParentActive) && "bg-primary/10 text-primary font-semibold border-l-2 border-primary shadow-sm",
                      !isActive && !isParentActive && "border-l-2 border-transparent"
                    )}
                    asChild
                    title={isCollapsed ? item.name : undefined}
                  >
                    <Link href={item.href} prefetch={true}>
                      <div className={cn("flex items-center", isCollapsed ? "justify-center" : "gap-3")}>
                        <Icon className={cn(
                          "h-4 w-4 shrink-0 transition-all", 
                          (isActive || isParentActive) ? "text-primary scale-110" : "text-muted-foreground group-hover:text-foreground"
                        )} />
                        {!isCollapsed && <span className={cn("text-xs truncate", (isActive || isParentActive) && "font-semibold")}>{item.name}</span>}
                      </div>
                      {!isCollapsed && (item.subItems || item.hasArrow || item.children) && (
                        <ChevronDown className={cn(
                          "h-3 w-3 text-muted-foreground/50 ml-auto transition-transform",
                          isParentActive && "rotate-180"
                        )} />
                      )}
                    </Link>
                  </Button>
                  
                  {!isCollapsed && item.subItems && isActive && (
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

                  {!isCollapsed && item.children && isParentActive && (
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
                            <Link href={child.href} prefetch={true}>
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
        isCollapsed ? "items-center" : ""
      )}>
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
          className={cn(
            "w-full h-9 text-xs transition-all",
            isCollapsed ? "justify-center px-0" : "justify-start px-2"
          )}
          disabled={!mounted}
          title={isCollapsed ? (theme === 'light' ? 'Koyu Mod' : 'Açık Mod') : undefined}
        >
          {mounted ? (
            <div className="flex items-center justify-center gap-2">
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              {!isCollapsed && (theme === 'light' ? "Koyu Mod" : "Açık Mod")}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              {!isCollapsed && "Tema..."}
            </div>
          )}
        </Button>
        
        <div className={cn(
          "flex items-center transition-all",
          isCollapsed ? "justify-center" : "gap-3"
        )}>
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center border border-primary/10 shrink-0">
            <Users className="h-4 w-4 text-primary" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold truncate">Yönetici</span>
              <span className="text-[10px] text-muted-foreground truncate font-medium">admin@infrascope.io</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
