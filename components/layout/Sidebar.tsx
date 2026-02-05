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
  Zap,
  Server,
  HardDrive,
  Cpu,
  Database,
  GitBranch,
  Box,
  Puzzle,
  ClipboardList,
  Clock,
  TrendingUp,
  BarChart3,
  Plug,
  RefreshCw,
  ShieldAlert,
  Globe,
  Lock,
  Eye,
  AlertOctagon,
  Target,
  History,
  Key
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface SidebarItem {
  name: string;
  href: string;
  icon: any;
  subItems?: string[];
  hasArrow?: boolean;
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

  useEffect(() => {
    setMounted(true);
    // Check if dark mode is enabled
    const isDark = document.documentElement.classList.contains('dark');
    setTheme(isDark ? 'dark' : 'light');
    
    // Load sidebar state from localStorage if available
    const savedState = localStorage.getItem('sidebarCollapsed');
    if (savedState !== null) {
      setIsCollapsed(savedState === 'true');
    }
  }, []);

  const toggleSidebar = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('sidebarCollapsed', String(newState));
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
        { name: 'Riskli Assetler', href: '/dashboard/risks', icon: AlertOctagon },
        { name: 'Son Degisiklikler', href: '/dashboard/changes', icon: History },
      ]
    },
    {
      title: 'Infrastructure',
      items: [
        { name: 'Locations', href: '/locations', icon: MapPin },
        { name: 'Racks', href: '/racks', icon: Grid },
        { name: 'Devices', href: '/devices', icon: Monitor },
        { name: 'Power / Capacity', href: '/infrastructure/capacity', icon: Zap },
      ]
    },
    {
      title: 'Virtualization',
      items: [
        { name: 'Clusters', href: '/virtualization/clusters', icon: Layers },
        { name: 'Hosts', href: '/virtualization/hosts', icon: Server },
        { name: 'Virtual Machines', href: '/virtualization/vms', icon: Cpu },
        { name: 'Datastores', href: '/virtualization/datastores', icon: HardDrive },
        { name: 'Snapshots', href: '/virtualization/snapshots', icon: Database },
      ]
    },
    {
      title: 'Network',
      items: [
        { name: 'Topology', href: '/network', icon: Network },
        { name: 'Switches', href: '/network/switches', icon: Globe },
        { name: 'Ports', href: '/network/ports', icon: Plug },
        { name: 'VLANs', href: '/network/vlans', icon: Shield },
        { name: 'IPAM', href: '/network/ipam', icon: Target },
        { name: 'Firewall View', href: '/network/firewall', icon: Lock },
      ]
    },
    {
      title: 'Security',
      items: [
        { name: 'Firewall Policies', href: '/security/policies', icon: Shield },
        { name: 'IPsec Tunnels', href: '/network/ipsec', icon: Globe },
        { name: 'Risky Rules', href: '/security/risks', icon: AlertTriangle },
        { name: 'IPS / DoS Events', href: '/security/ips', icon: ShieldAlert },
        { name: 'Public Exposed Assets', href: '/security/exposed', icon: Eye },
        { name: 'Asset Risk Scores', href: '/security/scores', icon: Target },
      ]
    },
    {
      title: 'Services',
      items: [
        { name: 'Applications', href: '/services/apps', icon: Box },
        { name: 'Services', href: '/services', icon: Puzzle },
        { name: 'Dependencies', href: '/services/dependencies', icon: GitBranch },
        { name: 'Impact Analysis', href: '/services/impact', icon: BarChart3 },
      ]
    },
    {
      title: 'Changes & Audit',
      items: [
        { name: 'Change Log', href: '/audit/changes', icon: ClipboardList },
        { name: 'Configuration Drift', href: '/audit/drift', icon: History },
        { name: 'Timeline View', href: '/audit/timeline', icon: Clock },
      ]
    },
    {
      title: 'Analytics',
      items: [
        { name: 'Capacity Trends', href: '/analytics/capacity', icon: TrendingUp },
        { name: 'Growth Forecast', href: '/analytics/forecast', icon: TrendingUp },
        { name: 'Network Utilization', href: '/analytics/network', icon: BarChart3 },
        { name: 'VM Sprawl', href: '/analytics/sprawl', icon: Cpu },
      ]
    },
    {
      title: 'Integrations',
      items: [
        { name: 'Zabbix', href: '/integrations/zabbix', icon: RefreshCw },
        { name: 'VMware', href: '/integrations/vmware', icon: Server },
        { name: 'Firewall', href: '/integrations/firewall', icon: Shield },
        { name: 'Sync Status', href: '/integrations/status', icon: Activity },
      ]
    },
    {
      title: 'Settings',
      items: [
        { name: 'Organizations', href: '/settings/organizations', icon: Building2 },
        { name: 'Users & Roles', href: '/settings/users', icon: Users },
        { name: 'Alert Rules', href: '/settings/alerts', icon: AlertTriangle },
        { name: 'Thresholds', href: '/settings/thresholds', icon: Target },
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
              <h3 className="px-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                {section.title}
              </h3>
            )}
            {section.items.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <div key={item.name}>
                  <Button
                    variant="ghost"
                    className={cn(
                      "w-full h-9 hover:bg-accent hover:text-accent-foreground flex items-center transition-all",
                      isCollapsed ? "justify-center px-0" : "justify-start px-2",
                      isActive && "bg-accent text-accent-foreground font-bold"
                    )}
                    asChild
                    title={isCollapsed ? item.name : undefined}
                  >
                    <Link href={item.href}>
                      <div className={cn("flex items-center", isCollapsed ? "justify-center" : "gap-3")}>
                        <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                        {!isCollapsed && <span className="text-xs truncate">{item.name}</span>}
                      </div>
                      {!isCollapsed && (item.subItems || item.hasArrow) && (
                        <ChevronDown className="h-3 w-3 text-muted-foreground/50 ml-auto" />
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
