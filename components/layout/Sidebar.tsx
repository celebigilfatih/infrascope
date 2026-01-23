'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Monitor, 
  MapPin, 
  Settings, 
  Network, 
  Users,
  Activity,
  ChevronDown,
  Shield,
  AlertTriangle,
  FileText,
  Code,
  Moon,
  Sun
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

  useEffect(() => {
    setMounted(true);
    // Check if dark mode is enabled
    const isDark = document.documentElement.classList.contains('dark');
    setTheme(isDark ? 'dark' : 'light');
  }, []);

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
      title: 'Genel',
      items: [
        { name: 'Kontrol Paneli', href: '/dashboard', icon: LayoutDashboard },
      ]
    },
    {
      title: 'Envanter',
      items: [
        { name: 'Cihazlar', href: '/devices', icon: Monitor },
        { name: 'Konumlar', href: '/locations', icon: MapPin },
      ]
    },
    {
      title: 'Ağ & Servisler',
      items: [
        { name: 'Ağ Topolojisi', href: '/network', icon: Network },
        { name: 'Servisler', href: '/services', icon: Settings },
      ]
    }
  ];

  return (
    <aside className="w-64 border-r border-border bg-card flex flex-col h-screen sticky top-0 transition-colors duration-300">
      <div className="p-6 transition-colors duration-300">
        <Link href="/dashboard" className="flex items-center gap-2 group">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground shadow-lg transition-colors duration-300">
            <Activity className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight text-foreground leading-none transition-colors duration-300">
              InfraScope
            </span>
            <span className="text-[10px] text-primary font-bold mt-0.5 uppercase tracking-widest transition-colors duration-300">
              Altyapı Yönetimi
            </span>
          </div>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-6 custom-scrollbar transition-colors duration-300">
        {sections.map((section) => (
          <div key={section.title} className="space-y-1">
            <h3 className="px-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
              {section.title}
            </h3>
            {section.items.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <div key={item.name}>
                  <Button
                    variant="ghost"
                    className={cn(
                      "w-full justify-between h-9 px-2 hover:bg-accent hover:text-accent-foreground",
                      isActive && "bg-accent text-accent-foreground font-bold"
                    )}
                    asChild
                  >
                    <Link href={item.href}>
                      <div className="flex items-center gap-3">
                        <Icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
                        <span className="text-xs">{item.name}</span>
                      </div>
                      {(item.subItems || item.hasArrow) && (
                        <ChevronDown className="h-3 w-3 text-muted-foreground/50" />
                      )}
                    </Link>
                  </Button>
                  
                  {item.subItems && isActive && (
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

      <div className="p-4 space-y-3 border-t border-border bg-muted/20">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
          className="w-full justify-start h-9 px-2 text-xs"
          disabled={!mounted}
        >
          {mounted ? (
            <>
              {theme === 'light' ? (
                <>
                  <Moon className="h-4 w-4 mr-2" />
                  Koyu Mod
                </>
              ) : (
                <>
                  <Sun className="h-4 w-4 mr-2" />
                  Açık Mod
                </>
              )}
            </>
          ) : (
            <span>Tema...</span>
          )}
        </Button>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center border border-primary/10">
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold truncate">Yönetici</span>
            <span className="text-[10px] text-muted-foreground truncate font-medium">admin@infrascope.io</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
