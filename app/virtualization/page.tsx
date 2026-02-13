'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Activity,
  ArrowUpRight,
  Search,
  RefreshCcw,
  Server,
  Monitor,
  Database,
  Layers,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  HardDrive,
  PanelLeft,
  Bell,
  Sun,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface DashboardData {
  summary: {
    clusters: number;
    hosts: number;
    hostsOnline: number;
    hostsOffline: number;
    vms: number;
    vmRunning: number;
    vmStopped: number;
    vmSuspended: number;
    datastores: number;
    totalCpuCores: number;
    totalMemoryGB: number;
    totalStorageTB: number;
    usedStorageTB: number;
  };
  hosts: Array<{ id: string; name: string; status: string }>;
  datastores: Array<{ id: string; name: string; capacityGB: number; freeGB: number; usedPercent: number }>;
  oldSnapshots?: Array<{ vmName: string; name: string; ageInDays: number; sizeGB: number }>;
}

export default function VirtualizationDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/integrations/vmware?type=dashboard');
      const json = await res.json();
      if (json.error) {
        setError(json.error);
        return;
      }
      setData(json);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 60000);
    return () => clearInterval(interval);
  }, []);

  const storageUsedPercent = data?.summary.totalStorageTB 
    ? Math.round((data.summary.usedStorageTB / data.summary.totalStorageTB) * 100) 
    : 0;

  const criticalDatastores = data?.datastores.filter((d: { usedPercent: number }) => d.usedPercent >= 85) || [];

  const statCards = [
    {
      label: 'Sanal Makineler',
      value: data?.summary.vms || 0,
      subValue: `${data?.summary.vmRunning || 0} çalışıyor, ${data?.summary.vmStopped || 0} kapalı`,
      trend: data?.summary.vms ? `%${Math.round(((data?.summary.vmRunning || 0) / data.summary.vms) * 100)}` : '%0',
      trendType: 'up',
      icon: Monitor,
      href: '/virtualization/vms',
    },
    {
      label: 'ESXi Hostlar',
      value: data?.summary.hosts || 0,
      subValue: `${data?.summary.hostsOnline || 0} çevrimiçi`,
      trend: 'Aktif',
      trendType: 'up',
      icon: Server,
      href: '/virtualization/hosts',
    },
    {
      label: 'Datastore',
      value: data?.summary.datastores || 0,
      subValue: `${data?.summary.totalStorageTB?.toFixed(0) || 0} TB toplam`,
      trend: `%${storageUsedPercent}`,
      trendType: storageUsedPercent > 80 ? 'down' : 'up',
      icon: Database,
      href: '/virtualization/datastores',
    },
    {
      label: 'Cluster',
      value: data?.summary.clusters || 0,
      subValue: 'HA/DRS aktif',
      trend: 'Sağlıklı',
      trendType: 'up',
      icon: Layers,
      href: '/virtualization/clusters',
    },
  ];

  return (
    <>
      {/* Top Header */}
      <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-4 flex-1">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
            <PanelLeft className="h-4 w-4" />
          </Button>
          <div className="relative max-w-md w-full hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input 
              placeholder="Ara..." 
              className="pl-9 h-8 bg-muted/30 border-none focus-visible:ring-1 focus-visible:ring-primary/50 text-xs w-64"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-50">
              <span className="text-[10px] font-bold border rounded px-1">⌘</span>
              <span className="text-[10px] font-bold border rounded px-1">K</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
            <Sun className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
            <Bell className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">vCenter Dashboard</h1>
            <p className="text-sm text-muted-foreground">Sanal altyapı yönetimi ve izleme</p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="bg-card font-bold px-4 h-9 border-border"
              onClick={fetchDashboard}
              disabled={loading}
            >
              <RefreshCcw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
              Yenile
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {error && (
            <Card className="border-destructive/20 bg-destructive/5 shadow-none">
              <CardContent className="p-4 flex items-center gap-3 text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span className="text-xs font-bold">{error}</span>
              </CardContent>
            </Card>
          )}

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 border-b border-border/50 pb-0 mb-2">
            <Button variant="ghost" size="sm" className="h-8 px-4 rounded-none border-b-2 border-primary text-xs font-bold bg-muted/30 flex items-center gap-2">
              <Activity className="h-3.5 w-3.5" /> Genel Bakış
            </Button>
            <Link href="/virtualization/vms">
              <Button variant="ghost" size="sm" className="h-8 px-4 rounded-none border-b-2 border-transparent text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-2">
                <Monitor className="h-3.5 w-3.5" /> VM'ler
              </Button>
            </Link>
            <Link href="/virtualization/hosts">
              <Button variant="ghost" size="sm" className="h-8 px-4 rounded-none border-b-2 border-transparent text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-2">
                <Server className="h-3.5 w-3.5" /> Hostlar
              </Button>
            </Link>
            <Link href="/virtualization/snapshots">
              <Button variant="ghost" size="sm" className="h-8 px-4 rounded-none border-b-2 border-transparent text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-2">
                <HardDrive className="h-3.5 w-3.5" /> Snapshot
              </Button>
            </Link>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {statCards.map((card) => (
              <Link key={card.label} href={card.href}>
                <Card className="border-border/50 shadow-sm overflow-hidden bg-card hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <card.icon className="h-3.5 w-3.5 text-muted-foreground" />
                        <h3 className="text-xs font-bold text-foreground">{card.label}</h3>
                      </div>
                      <Activity className="h-3 w-3 text-muted-foreground/30" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-3xl font-black tracking-tighter">{card.value.toLocaleString()}</span>
                      <p className="text-[11px] text-muted-foreground font-medium">{card.subValue}</p>
                    </div>
                    
                    <div className="mt-6 flex items-end justify-between">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Durum</span>
                        <div className={cn(
                          "text-[10px] font-bold flex items-center gap-1 mt-0.5",
                          card.trendType === 'up' ? 'text-emerald-500' : 'text-rose-500'
                        )}>
                          {card.trend}
                          <ArrowUpRight className={cn("h-3 w-3", card.trendType === 'down' && "rotate-90")} />
                        </div>
                      </div>
                      {/* Simple Sparkline */}
                      <div className="flex items-end gap-1 h-8">
                        {[40, 70, 45, 90, 65, 80].map((h, i) => (
                          <div 
                            key={i} 
                            className={cn(
                              "w-1.5 rounded-t-sm",
                              card.trendType === 'up' ? "bg-primary/20" : "bg-rose-500/20"
                            )} 
                            style={{ height: `${h}%` }}
                          />
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {/* Storage Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 border-border/50 shadow-sm bg-card overflow-hidden">
              <CardHeader className="border-b border-border/50">
                <CardTitle className="text-sm font-bold">Depolama Kullanımı</CardTitle>
                <CardDescription className="text-xs">Toplam kapasite ve kullanım durumu</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <span className="text-2xl font-black">{storageUsedPercent}%</span>
                    <span className="text-sm text-muted-foreground ml-2">kullanılıyor</span>
                  </div>
                  <div className="text-right text-sm">
                    <span className="font-bold">{data?.summary.usedStorageTB?.toFixed(1) || 0} TB</span>
                    <span className="text-muted-foreground"> / {data?.summary.totalStorageTB?.toFixed(0) || 0} TB</span>
                  </div>
                </div>
                <Progress value={storageUsedPercent} className="h-3 mb-6" />
                
                {/* Top Datastores */}
                <div className="space-y-3">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">En Dolu Datastore'lar</span>
                  {data?.datastores
                    .slice()
                    .sort((a: { usedPercent: number }, b: { usedPercent: number }) => b.usedPercent - a.usedPercent)
                    .slice(0, 5)
                    .map((ds: { id: string; name: string; usedPercent: number; capacityGB: number }) => (
                      <div key={ds.id} className="flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-medium truncate">{ds.name}</span>
                            <span className={cn(
                              "font-bold",
                              ds.usedPercent >= 90 ? "text-rose-500" : ds.usedPercent >= 80 ? "text-amber-500" : "text-muted-foreground"
                            )}>%{ds.usedPercent}</span>
                          </div>
                          <Progress value={ds.usedPercent} className="h-1.5" />
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>

            {/* Old Snapshots */}
            <Card className="border-border/50 shadow-sm bg-card">
              <CardHeader>
                <CardTitle className="text-sm font-bold">Eski Snapshotlar</CardTitle>
                <div className="text-2xl font-black mt-2">{data?.oldSnapshots?.length || 0}</div>
                <CardDescription className="text-[10px] font-bold text-orange-500">7 günden eski snapshot</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {data?.oldSnapshots?.slice(0, 6).map((snapshot, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold",
                        snapshot.ageInDays > 30 ? "bg-rose-500/10 text-rose-600" : "bg-orange-500/10 text-orange-600"
                      )}>
                        <AlertTriangle className="h-4 w-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold truncate max-w-[140px]">{snapshot.vmName}</span>
                        <span className="text-[10px] text-muted-foreground font-medium">{snapshot.sizeGB.toFixed(1)} GB</span>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-[9px]">
                      {snapshot.ageInDays} gün
                    </Badge>
                  </div>
                ))}
                {!data?.oldSnapshots || data.oldSnapshots.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Eski snapshot yok</p>
                ) : data.oldSnapshots.length > 6 ? (
                  <Link href="/virtualization/snapshots" className="text-xs text-primary hover:underline block text-center pt-2">
                    +{data.oldSnapshots.length - 6} daha göster
                  </Link>
                ) : null}
              </CardContent>
            </Card>
          </div>

          {/* Critical Datastores Alert */}
          {criticalDatastores.length > 0 && (
            <Card className="border-border/50 shadow-sm overflow-hidden">
              <CardHeader className="border-b border-border/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    <div>
                      <CardTitle className="text-sm font-bold">Yüksek Kullanımlı Datastore'lar</CardTitle>
                      <CardDescription className="text-xs mt-1">%85 üzeri doluluk oranı</CardDescription>
                    </div>
                  </div>
                  <Badge className="bg-amber-500/20 text-amber-700 border-amber-500/50">{criticalDatastores.length}</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {criticalDatastores.slice(0, 4).map((ds: { id: string; name: string; usedPercent: number; capacityGB: number; freeGB: number }) => (
                    <div key={ds.id} className="border border-border/50 rounded-lg p-4 bg-card hover:bg-muted/30 transition-colors">
                      <div className="flex items-start justify-between mb-3">
                        <Database className={cn("h-4 w-4", ds.usedPercent >= 90 ? "text-rose-500" : "text-amber-500")} />
                        <Badge 
                          variant={ds.usedPercent >= 90 ? "destructive" : "secondary"}
                          className="text-[9px] font-bold"
                        >
                          %{ds.usedPercent}
                        </Badge>
                      </div>
                      <h4 className="font-bold text-sm truncate mb-2" title={ds.name}>{ds.name}</h4>
                      <div className="space-y-1 text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Kapasite:</span>
                          <span className="font-medium">{(ds.capacityGB / 1024).toFixed(1)} TB</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Boş:</span>
                          <span className="font-medium">{(ds.freeGB / 1024).toFixed(1)} TB</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </>
  );
}
