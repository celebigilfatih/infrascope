'use client';

import React, { useState, useEffect } from 'react';
import { apiGet } from '../../lib/api';
import { Device, Service, ApiResponse } from '../../types';
import { getVendorLogo } from '../../lib/formatting';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Activity, 
  ArrowUpRight,
  Search,
  Download,
  Calendar,
  PanelLeft,
  Bell,
  Sun,
  Monitor,
  Settings,
  Building2,
  RefreshCcw,
  CheckCircle2,
  AlertCircle,
  Clock,
  AlertTriangle
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalDevices: 0,
    activeDevices: 0,
    totalServices: 0,
    runningServices: 0,
    totalBuildings: 0,
    criticalIssues: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const [data, setData] = useState<{
    devices: Device[];
    services: Service[];
    buildings: any[];
  }>({
    devices: [],
    services: [],
    buildings: [],
  });

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [devicesRes, servicesRes, buildingsRes]: [ApiResponse<Device[]>, ApiResponse<Service[]>, ApiResponse<any[]>] = await Promise.all([
        apiGet('/api/devices'),
        apiGet('/api/services'),
        apiGet('/api/buildings'),
      ]);

      if (devicesRes.success && servicesRes.success && buildingsRes.success) {
        const devices = devicesRes.data || [];
        const services = servicesRes.data || [];
        const buildings = buildingsRes.data || [];

        setData({ devices, services, buildings });
        
        setStats({
          totalDevices: devices.length,
          activeDevices: devices.filter(d => d.status === 'ACTIVE').length,
          totalServices: services.length,
          runningServices: services.filter(s => s.status === 'RUNNING').length,
          totalBuildings: buildings.length,
          criticalIssues: devices.filter(d => d.criticality === 'CRITICAL' && d.status !== 'ACTIVE').length,
        });
      } else {
        setError('Panel istatistikleri yüklenemedi');
      }
    } catch (err: any) {
      setError(err.message || 'Veri yüklenirken bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const getExpiringDevices = () => {
    const today = new Date();
    const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
    
    return data.devices
      .filter(device => {
        if (!device.supportDate) return false;
        const supportDate = new Date(device.supportDate);
        // Show devices that are expired or expiring within 30 days (or have already been expired for less than 90 days)
        return (supportDate >= ninetyDaysAgo && supportDate <= thirtyDaysFromNow);
      })
      .sort((a, b) => new Date(a.supportDate || 0).getTime() - new Date(b.supportDate || 0).getTime())
      .slice(0, 4);
  };

  const getDaysUntilExpiration = (supportDate: string | Date | null | undefined) => {
    if (!supportDate) return null;
    const today = new Date();
    const expDate = supportDate instanceof Date ? supportDate : new Date(supportDate);
    const diffTime = expDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getExpirationColor = (days: number | null) => {
    if (!days) return 'text-muted-foreground';
    if (days <= 7) return 'text-rose-500';
    if (days <= 14) return 'text-amber-500';
    return 'text-yellow-500';
  };

  const expiringDevices = getExpiringDevices();

  const statCards = [ 
    { 
      label: 'Altyapı Düğümleri', 
      value: stats.totalDevices.toLocaleString(), 
      subValue: 'Toplam fiziksel/sanal', 
      trend: `%${((stats.activeDevices / (stats.totalDevices || 1)) * 100).toFixed(1)}`, 
      trendType: 'up', 
      icon: Monitor 
    },
    { 
      label: 'Çalışan Servisler', 
      value: stats.runningServices.toLocaleString(), 
      subValue: `${stats.totalServices} servis arasından aktif`, 
      trend: stats.runningServices > 0 ? '+%100' : '%0', 
      trendType: 'up', 
      icon: Settings 
    },
    { 
      label: 'Yönetilen Binalar', 
      value: stats.totalBuildings.toLocaleString(), 
      subValue: 'Organizasyonlardaki sahalar', 
      trend: 'Aktif', 
      trendType: 'up', 
      icon: Building2 
    }
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
              <h1 className="text-2xl font-bold tracking-tight">Kontrol Paneli</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" className="bg-foreground text-background hover:bg-foreground/90 font-bold px-4 h-9">
                <Download className="mr-2 h-4 w-4" />
                İndir
              </Button>
              <Button variant="outline" size="sm" className="bg-card font-bold px-4 h-9 border-border">
                <Calendar className="mr-2 h-4 w-4" />
                Tarih Seç
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
            {/* Navigation Tabs Mock */}
            <div className="flex items-center gap-1 border-b border-border/50 pb-0 mb-2">
              <Button variant="ghost" size="sm" className="h-8 px-4 rounded-none border-b-2 border-primary text-xs font-bold bg-muted/30 flex items-center gap-2">
                <Activity className="h-3.5 w-3.5" /> Genel Bakış
              </Button>
              <Button variant="ghost" size="sm" className="h-8 px-4 rounded-none border-b-2 border-transparent text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-2">
                <Activity className="h-3.5 w-3.5" /> Analitik
              </Button>
              <Button variant="ghost" size="sm" className="h-8 px-4 rounded-none border-b-2 border-transparent text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-2">
                <Activity className="h-3.5 w-3.5" /> Raporlar
              </Button>
              <Button variant="ghost" size="sm" className="h-8 px-4 rounded-none border-b-2 border-transparent text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-2">
                <Activity className="h-3.5 w-3.5" /> Bildirimler
              </Button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {statCards.map((card) => (
                <Card key={card.label} className="border-border/50 shadow-sm overflow-hidden bg-card">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <card.icon className="h-3.5 w-3.5 text-muted-foreground" />
                        <h3 className="text-xs font-bold text-foreground">{card.label}</h3>
                      </div>
                      <Activity className="h-3 w-3 text-muted-foreground/30" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-3xl font-black tracking-tighter">{card.value}</span>
                      <p className="text-[11px] text-muted-foreground font-medium">{card.subValue}</p>
                    </div>
                    
                    <div className="mt-6 flex items-end justify-between">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Detaylar</span>
                        <div className={cn(
                          "text-[10px] font-bold flex items-center gap-1 mt-0.5",
                          card.trendType === 'up' ? 'text-emerald-500' : 'text-rose-500'
                        )}>
                          {card.trend}
                          <ArrowUpRight className={cn("h-3 w-3", card.trendType === 'down' && "rotate-90")} />
                        </div>
                      </div>
                      {/* Simple Sparkline Mock */}
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
              ))}

              {/* Total Revenue Card -> Infrastructure Health */}
              <Card className="border-border/50 shadow-sm bg-card lg:col-span-1">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Altyapı Sağlığı</CardTitle>
                </CardHeader>
                <CardContent className="p-6 pt-0">
                  <div className="flex flex-col gap-1 mb-6">
                    <span className="text-2xl font-black tracking-tighter">{stats.criticalIssues} Kritik</span>
                    <p className="text-[10px] text-rose-500 font-bold">Acil müdahale gerektiren sorunlar</p>
                  </div>
                  {/* Revenue Curve Mock -> Health Chart */}
                  <div className="h-24 w-full relative mt-4">
                    <svg className="w-full h-full" viewBox="0 0 200 60">
                      <path 
                        d="M0,30 Q40,32 60,28 T100,35 T140,30 T180,33 T200,30" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2"
                        className={cn(stats.criticalIssues > 0 ? "text-rose-500" : "text-emerald-500")}
                      />
                      <circle cx="10" cy="30" r="1.5" fill="currentColor" />
                      <circle cx="50" cy="32" r="1.5" fill="currentColor" />
                      <circle cx="90" cy="28" r="1.5" fill="currentColor" />
                      <circle cx="130" cy="35" r="1.5" fill="currentColor" />
                      <circle cx="170" cy="30" r="1.5" fill="currentColor" />
                      <circle cx="195" cy="30" r="1.5" fill="currentColor" />
                    </svg>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Support Expiration Alert Section */}
            {expiringDevices.length > 0 && (
              <Card className="border-border/50 shadow-sm overflow-hidden">
                <CardHeader className="border-b border-border/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="h-5 w-5 text-rose-500" />
                      <div>
                        <CardTitle className="text-sm font-bold">Support Tarihi Uyarısı</CardTitle>
                        <CardDescription className="text-xs mt-1">30 gün içinde sonu çalan destekler</CardDescription>
                      </div>
                    </div>
                    <Badge className="bg-rose-500/20 text-rose-700 border-rose-500/50">{expiringDevices.length}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {expiringDevices.map((device) => {
                      const daysLeft = getDaysUntilExpiration(device.supportDate);
                      return (
                        <div key={device.id} className="border border-border/50 rounded-lg p-4 bg-white hover:bg-slate-50 transition-colors">
                          {/* Header with Icon and Status */}
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <Clock className={cn("h-4 w-4", getExpirationColor(daysLeft))} />
                              <Badge 
                                variant="destructive"
                                className="text-[9px] font-bold"
                              >
                                {daysLeft} gün
                              </Badge>
                            </div>
                          </div>

                          {/* Device Name */}
                          <div className="flex items-center gap-2 mb-2">
                            {getVendorLogo(device.vendor) && (
                              <img 
                                src={getVendorLogo(device.vendor)!} 
                                alt={device.vendor} 
                                className="h-5 w-5 object-contain"
                              />
                            )}
                            <h4 className="font-bold text-sm line-clamp-2">{device.name}</h4>
                          </div>

                          {/* Device Details */}
                          <div className="space-y-2 mb-3">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-muted-foreground">Tip:</span>
                              <span className="font-medium">{device.type.replace(/_/g, ' ')}</span>
                            </div>
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-muted-foreground">Durum:</span>
                              <Badge 
                                variant={device.status === 'ACTIVE' ? 'success' : 'secondary'} 
                                className="text-[8px]"
                              >
                                {device.status}
                              </Badge>
                            </div>
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-muted-foreground">Bitiş Tarihi:</span>
                              <span className={cn("font-bold", getExpirationColor(daysLeft))}>
                                {device.supportDate ? new Date(device.supportDate).toLocaleDateString('tr-TR') : 'N/A'}
                              </span>
                            </div>
                          </div>

                          {/* Criticality */}
                          {device.criticality && (
                            <div className="pt-3 border-t border-border/30">
                              <Badge variant="destructive" className="text-[8px] w-full justify-center">
                                {device.criticality === 'CRITICAL' && '🔴 Kritik'}
                                {device.criticality === 'HIGH' && '🔴 Yüksek'}
                                {device.criticality === 'MEDIUM' && '🔴 Orta'}
                                {device.criticality === 'LOW' && '🔴 Düşük'}
                              </Badge>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Sale Activity Large Card -> Inventory Distribution */}
              <Card className="lg:col-span-2 border-border/50 shadow-sm bg-card overflow-hidden">
                <CardHeader className="border-b border-border/50">
                  <CardTitle className="text-sm font-bold">Envanter Hareketliliği - Cihazlar & Servisler</CardTitle>
                  <CardDescription className="text-xs">Veri merkezleri genelinde çalışma süresi ve dağıtım büyümesi</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="h-64 w-full relative bg-muted/10">
                    {/* Activity Area Chart Mock */}
                    <svg className="w-full h-full" viewBox="0 0 500 200" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="grad1" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" style={{ stopColor: 'oklch(0.646 0.222 41.116)', stopOpacity: 0.2 }} />
                          <stop offset="100%" style={{ stopColor: 'oklch(0.646 0.222 41.116)', stopOpacity: 0 }} />
                        </linearGradient>
                        <linearGradient id="grad2" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" style={{ stopColor: 'oklch(0.6 0.118 184.704)', stopOpacity: 0.2 }} />
                          <stop offset="100%" style={{ stopColor: 'oklch(0.6 0.118 184.704)', stopOpacity: 0 }} />
                        </linearGradient>
                      </defs>
                      <path d="M0,150 Q100,100 200,120 T400,110 T500,115 V200 H0 Z" fill="url(#grad1)" />
                      <path d="M0,150 Q100,100 200,120 T400,110 T500,115" fill="none" stroke="oklch(0.646 0.222 41.116)" strokeWidth="2" />
                      
                      <path d="M0,180 Q100,160 200,170 T400,140 T500,145 V200 H0 Z" fill="url(#grad2)" />
                      <path d="M0,180 Q100,160 200,170 T400,140 T500,145" fill="none" stroke="oklch(0.6 0.118 184.704)" strokeWidth="2" />
                    </svg>
                    <div className="absolute bottom-4 left-0 right-0 px-8 flex justify-between text-[10px] text-muted-foreground font-bold">
                      <span>Oca</span>
                      <span>Şub</span>
                      <span>Mar</span>
                      <span>Nis</span>
                      <span>May</span>
                      <span>Haz</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Subscriptions Bar Chart -> Location Breakdown */}
              <Card className="border-border/50 shadow-sm bg-card">
                <CardHeader>
                  <CardTitle className="text-sm font-bold">Altyapı Yükü</CardTitle>
                  <div className="text-2xl font-black mt-2">{(stats.totalDevices + stats.totalServices).toLocaleString()}</div>
                  <CardDescription className="text-[10px] font-bold text-emerald-500">Toplam takip edilen varlık</CardDescription>
                </CardHeader>
                <CardContent className="h-48 flex items-end justify-between gap-2 px-6">
                  {[30, 60, 45, 90, 70, 50, 80, 100, 60, 40, 75, 55].map((h, i) => (
                    <div 
                      key={i} 
                      className={cn(
                        "flex-1 rounded-sm transition-all hover:opacity-80",
                        i % 2 === 0 ? "bg-chart-1" : "bg-chart-2"
                      )} 
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Inventory Table */}
              <Card className="lg:col-span-2 border-border/50 shadow-sm bg-card overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-bold">Son Envanter Hareketleri</CardTitle>
                    <CardDescription className="text-xs">Sisteme en son eklenen cihazlar.</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" className="h-8 text-xs font-bold" onClick={loadDashboardData}>Yenile <RefreshCcw className={cn("ml-1 h-3 w-3", loading && "animate-spin")} /></Button>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="px-6 pb-4">
                    <Input placeholder="Envanterde ara..." className="h-8 bg-muted/20 border-border text-xs max-w-sm" />
                  </div>
                  <div className="table-responsive">
                    <table className="table">
                      <thead>
                        <tr>
                          <th className="w-12"><div className="w-4 h-4 border border-border rounded" /></th>
                          <th>Cihaz Adı</th>
                          <th>Tip</th>
                          <th className="text-right">Durum</th>
                          <th className="w-12"></th>
                        </tr>
                      </thead>
                      <tbody className="text-xs font-medium">
                        {data.devices
                          .slice()
                          .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
                          .slice(0, 5)
                          .map((device) => (
                          <tr key={device.id}>
                            <td><div className="w-4 h-4 border border-border rounded" /></td>
                            <td className="font-bold">{device.name}</td>
                            <td><Badge variant="outline" className="text-[10px]">{device.type.replace(/_/g, ' ')}</Badge></td>
                            <td className="text-right">
                              <Badge 
                                variant={device.status === 'ACTIVE' ? 'success' : 'secondary'}
                                className="text-[9px]"
                              >
                                {device.status}
                              </Badge>
                            </td>
                            <td><Activity className="h-3 w-3 text-muted-foreground opacity-30" /></td>
                          </tr>
                        ))}
                        {data.devices.length === 0 && (
                          <tr>
                            <td colSpan={5} className="text-center py-8 text-muted-foreground">Cihaz bulunamadı</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Running Services List */}
              <Card className="border-border/50 shadow-sm bg-card">
                <CardHeader>
                  <CardTitle className="text-sm font-bold">Aktif Servisler</CardTitle>
                  <CardDescription className="text-xs">Kritik servislerin durumunu izleyin.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {data.services.slice(0, 5).map((service) => (
                    <div key={service.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold",
                          service.status === 'RUNNING' ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"
                        )}>
                          {service.status === 'RUNNING' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold">{service.name}</span>
                          <span className="text-[10px] text-muted-foreground font-medium uppercase">{service.type.replace(/_/g, ' ')}</span>
                        </div>
                      </div>
                      <Badge variant={service.status === 'RUNNING' ? 'success' : 'secondary'} className="text-[9px]">
                        {service.status === 'RUNNING' ? 'ÇALIŞIYOR' : 'DURDU'}
                      </Badge>
                    </div>
                  ))}
                  {data.services.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-xs">Takip edilen servis yok</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
    </>
  );
}
