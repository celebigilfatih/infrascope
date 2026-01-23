'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { 
  LayoutDashboard, 
  Monitor, 
  MapPin, 
  Settings, 
  Network, 
  User,
  Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';

export const Header: React.FC = () => {
  const pathname = usePathname();

  const navItems = [
    { name: 'Panel', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Cihazlar', href: '/devices', icon: Monitor },
    { name: 'Konumlar', href: '/locations', icon: MapPin },
    { name: 'Servisler', href: '/services', icon: Settings },
    { name: 'Ağ Topolojisi', href: '/network', icon: Network },
  ];

  return (
    <header className="bg-card/80 backdrop-blur-md border-b border-border sticky top-0 z-[1000]">
      <div className="max-w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/dashboard" className="flex-shrink-0 flex items-center group">
              <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-bold shadow-lg group-hover:scale-105 transition-transform">
                <Activity className="h-6 w-6" />
              </div>
              <span className="ml-3 text-xl font-bold tracking-tight text-foreground">
                InfraScope
              </span>
            </Link>
            <nav className="ml-10 flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Button
                    key={item.name}
                    variant={isActive ? "secondary" : "ghost"}
                    size="sm"
                    asChild
                    className={cn(
                      "flex items-center gap-2 px-4 h-9",
                      isActive && "bg-secondary text-secondary-foreground font-semibold"
                    )}
                  >
                    <Link href={item.href}>
                      <Icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
                      <span>{item.name}</span>
                    </Link>
                  </Button>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            <div className="hidden sm:block text-right mr-2">
              <p className="text-sm font-semibold leading-none">Yönetici</p>
              <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider font-medium">Sistem Yöneticisi</p>
            </div>
            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full border border-border bg-muted/50">
              <User className="h-5 w-5 text-foreground" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};
