'use client';

import React, { useState, useEffect } from 'react';
import { apiGet } from '../../lib/api';
import { Device } from '../../types';
import { getVendorLogo } from '../../lib/formatting';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Activity,
  ArrowUpRight,
  Search,
  PanelLeft,
  Bell,
  Sun,
  Monitor,
  Server,
  Database,
  Layers,
  RefreshCcw,
  AlertCircle,
  AlertTriangle,
  HardDrive,
  Clock,
  Shield,
  Wifi,
  Lock,
  Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface VMwareDashboardData {
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
  hosts: Array<{
    id: string;
    name: string;
    status: string;
    cpuCores?: number;
    memoryGB?: number;
  }>;
  datastores: Array<{
    id: string;
    name: string;
    capacityGB: number;
    freeGB: number;
    usedPercent: number;
    accessible: boolean;
  }>;
  vmsByCluster: Array<{ name: string; vmCount: number }>;
  oldSnapshots: Array<{ vmName: string; name: string; ageInDays: number; sizeGB: number }>;
}

interface FirewallData {
  policies: number;
  addresses: number;
  interfaces: number;
  vlans: number;
  lastSync: string | null;
  sslVpnSessions: number;
  sslInBytes: number;
  sslOutBytes: number;
  ipsecTunnels: Array<{ name: string; status: string; rgwy: string; incoming_bytes: number; outgoing_bytes: number }>;
  quarantineCount: number;
}

export default function DashboardPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [coreLoading, setCoreLoading] = useState(true);

  const [vmware, setVmware] = useState<VMwareDashboardData | null>(null);
  const [vmwareLoading, setVmwareLoading] = useState(true);
  const [vmwareError, setVmwareError] = useState<string | null>(null);
  const [coreError, setCoreError] = useState<string | null>(null);

  const [firewall, setFirewall] = useState<FirewallData | null>(null);
  const [firewallLoading, setFirewallLoading] = useState(true);

  useEffect(() => {
    loadCoreData();
    loadVmwareData();
    loadFirewallData();
  }, []);

  const loadCoreData = async () => {
    try {
      setCoreLoading(true);
      setCoreError(null);
      const res = await apiGet('/api/devices?limit=200&filterType=manual&mode=minimal').catch(() => ({
        success: false,
        data: [],
      }));
      if (res.success) setDevices(res.data || []);
    } catch {
      setCoreError('Cihaz verileri yüklenemedi');
    } finally {
      setCoreLoading(false);
    }
  };

  const loadVmwareData = async () => {
    try {
      setVmwareLoading(true);
      setVmwareError(null);
      const res = await fetch('/api/integrations/vmware?type=dashboard');
      const json = await res.json();
      if (json.error) {
        setVmwareError(json.error);
        return;
      }
      setVmware(json);
    } catch (err) {
      setVmwareError((err as Error).message);
    } finally {
      setVmwareLoading(false);
    }
  };

  const loadFirewallData = async () => {
    try {
      setFirewallLoading(true);
      const [syncRes, sslRes, ipsecRes, quarantineRes] = await Promise.allSettled([
        fetch('/api/integrations/fortigate?type=sync-status').then((r) => r.json()),
        fetch('/api/integrations/fortigate?vpn=ssl-summary').then((r) => r.json()),
        fetch('/api/integrations/fortigate?vpn=ipsec').then((r) => r.json()),
        fetch('/api/security/quarantine').then((r) => r.json()),
      ]);
      const sync = syncRes.status === 'fulfilled' ? syncRes.value?.data : null;
      const ssl = sslRes.status === 'fulfilled' ? sslRes.value?.data : null;
      const ipsecData = ipsecRes.status === 'fulfilled' ? ipsecRes.value?.data : [];
      const qData = quarantineRes.status === 'fulfilled' ? quarantineRes.value : null;
      setFirewall({
        policies: sync?.policiesProcessed || 0,
        addresses: sync?.addressesProcessed || 0,
        interfaces: sync?.interfacesProcessed || 0,
        vlans: sync?.vlansProcessed || 0,
        lastSync: sync?.lastSync || null,
        sslVpnSessions: ssl?.active_sessions || 0,
        sslInBytes: ssl?.total_in_bytes || 0,
        sslOutBytes: ssl?.total_out_bytes || 0,
        ipsecTunnels: Array.isArray(ipsecData) ? ipsecData : [],
        quarantineCount: qData?.count || 0,
      });
    } finally {
      setFirewallLoading(false);
    }
  };

  /* ── Support expiration helpers ─────────────────────────── */
  const getExpiringDevices = () => {
    const today = new Date();
    const in30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const ago90 = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
    return devices
      .filter((d) => {
        if (!d.supportDate) return false;
        const sd = new Date(d.supportDate);
        return sd >= ago90 && sd <= in30;
      })
      .sort((a, b) => new Date(a.supportDate || 0).getTime() - new Date(b.supportDate || 0).getTime())
      .slice(0, 4);
  };

  const getDaysLeft = (sd: string | Date | null | undefined) => {
    if (!sd) return null;
    return Math.ceil((new Date(sd).getTime() - Date.now()) / 86_400_000);
  };

  const expirationColor = (days: number | null) => {
    if (!days) return 'text-muted-foreground';
    if (days <= 7) return 'text-rose-500';
    if (days <= 14) return 'text-amber-500';
    return 'text-yellow-500';
  };

  /* ── Derived VMware values ──────────────────────────────── */
  const summary = vmware?.summary;
  const storageUsedPct = summary?.totalStorageTB
    ? Math.round((summary.usedStorageTB / summary.totalStorageTB) * 100)
    : 0;
  const vmRunPct = summary?.vms
    ? Math.round(((summary.vmRunning || 0) / summary.vms) * 100)
    : 0;
  const criticalDatastores = vmware?.datastores.filter((d) => d.usedPercent >= 85) || [];
  const expiringDevices = getExpiringDevices();

  /* ── Stat cards ─────────────────────────────────────────── */
  const statCards = [
    {
      label: 'Sanal Makineler',
      value: vmwareLoading ? '...' : (summary?.vms || 0).toLocaleString(),
      subValue: vmwareLoading
        ? 'Yükleniyor...'
        : `${summary?.vmRunning || 0} çalışıyor · ${summary?.vmStopped || 0} kapalı`,
      trend: vmwareLoading ? '—' : `%${vmRunPct} aktif`,
      trendType: vmRunPct >= 80 ? 'up' : 'down',
      icon: Monitor,
      href: '/virtualization/vms',
    },
    {
      label: 'ESXi Hostlar',
      value: vmwareLoading ? '...' : (summary?.hosts || 0).toLocaleString(),
      subValue: vmwareLoading
        ? 'Yükleniyor...'
        : `${summary?.hostsOnline || 0} çevrimiçi · ${summary?.hostsOffline || 0} çevrimdışı`,
      trend: vmwareLoading
        ? '—'
        : (summary?.hostsOffline ?? 0) === 0
        ? 'Tümü Aktif'
        : `${summary?.hostsOffline} Offline`,
      trendType: (summary?.hostsOffline ?? 0) === 0 ? 'up' : 'down',
      icon: Server,
      href: '/virtualization/hosts',
    },
    {
      label: 'Datastore',
      value: vmwareLoading ? '...' : (summary?.datastores || 0).toLocaleString(),
      subValue: vmwareLoading
        ? 'Yükleniyor...'
        : `${summary?.totalStorageTB?.toFixed(1) || 0} TB toplam · %${storageUsedPct} dolu`,
      trend: vmwareLoading ? '—' : `%${storageUsedPct} kullanım`,
      trendType: storageUsedPct > 80 ? 'down' : 'up',
      icon: Database,
      href: '/virtualization/datastores',
    },
    {
      label: 'Cluster',
      value: vmwareLoading ? '...' : (summary?.clusters || 0).toLocaleString(),
      subValue: vmwareLoading
        ? 'Yükleniyor...'
        : `${summary?.totalCpuCores || 0} CPU çekirdeği · ${summary?.totalMemoryGB?.toFixed(0) || 0} GB RAM`,
      trend: vmwareLoading ? '—' : 'Sağlıklı',
      trendType: 'up',
      icon: Layers,
      href: '/virtualization',
    },
  ];

  return (
    <>
      {/* ── Top Header ─────────────────────────────────────── */}
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

      {/* ── Main Content ────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Kontrol Paneli</h1>
            <p className="text-sm text-muted-foreground">VMware altyapısı kritik metrikler</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="bg-card font-bold px-4 h-9 border-border"
            onClick={() => {
              loadCoreData();
              loadVmwareData();
              loadFirewallData();
            }}
            disabled={vmwareLoading || firewallLoading}
          >
            <RefreshCcw className={cn('mr-2 h-4 w-4', vmwareLoading && 'animate-spin')} />
            Yenile
          </Button>
        </div>

        <div className="flex flex-col gap-6">
          {/* Error banners */}
          {(coreError || vmwareError) && (
            <Card className="border-destructive/20 bg-destructive/5 shadow-none">
              <CardContent className="p-4 flex items-center gap-3 text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="text-xs font-bold">{coreError || vmwareError}</span>
              </CardContent>
            </Card>
          )}

          {/* Critical datastore inline alert */}
          {criticalDatastores.length > 0 && (
            <Card className="border-amber-500/30 bg-amber-500/5 shadow-none">
              <CardContent className="p-3 flex flex-wrap items-center gap-3">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                <span className="text-xs font-bold text-amber-700">
                  {criticalDatastores.length} datastore %85 üzerinde kapasite kullanıyor
                </span>
                <div className="flex gap-1 flex-wrap">
                  {criticalDatastores.slice(0, 4).map((d) => (
                    <Badge
                      key={d.id}
                      className="bg-amber-500/20 text-amber-700 border-amber-500/40 text-[9px]"
                    >
                      {d.name} %{d.usedPercent}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Stat Cards ─────────────────────────────────── */}
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
                      <span className="text-3xl font-black tracking-tighter">{card.value}</span>
                      <p className="text-[11px] text-muted-foreground font-medium">{card.subValue}</p>
                    </div>
                    <div className="mt-6 flex items-end justify-between">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                          Durum
                        </span>
                        <div
                          className={cn(
                            'text-[10px] font-bold flex items-center gap-1 mt-0.5',
                            card.trendType === 'up' ? 'text-emerald-500' : 'text-rose-500'
                          )}
                        >
                          {card.trend}
                          <ArrowUpRight
                            className={cn('h-3 w-3', card.trendType === 'down' && 'rotate-90')}
                          />
                        </div>
                      </div>
                      <div className="flex items-end gap-1 h-8">
                        {[40, 70, 45, 90, 65, 80].map((h, i) => (
                          <div
                            key={i}
                            className={cn(
                              'w-1.5 rounded-t-sm',
                              card.trendType === 'up' ? 'bg-primary/20' : 'bg-rose-500/20'
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

          {/* ── ESXi Hosts + Old Snapshots ─────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* ESXi Hosts table */}
            <Card className="lg:col-span-2 border-border/50 shadow-sm bg-card overflow-hidden">
              <CardHeader className="border-b border-border/50">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-bold">ESXi Hostlar</CardTitle>
                    <CardDescription className="text-xs">Bağlantı ve kaynak durumu</CardDescription>
                  </div>
                  <Link href="/virtualization/hosts">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[10px] font-bold text-muted-foreground"
                    >
                      Tümünü Gör <ArrowUpRight className="h-3 w-3 ml-1" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {vmwareLoading ? (
                  <div className="p-8 text-xs text-muted-foreground text-center">Yükleniyor...</div>
                ) : (
                  <div className="table-responsive">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Host</th>
                          <th>CPU Çekirdeği</th>
                          <th>Bellek</th>
                          <th className="text-right">Durum</th>
                        </tr>
                      </thead>
                      <tbody className="text-xs font-medium">
                        {vmware?.hosts.slice(0, 10).map((host) => (
                          <tr key={host.id}>
                            <td className="font-bold">
                              <div className="flex items-center gap-2">
                                <div
                                  className={cn(
                                    'w-1.5 h-1.5 rounded-full shrink-0',
                                    host.status === 'connected'
                                      ? 'bg-emerald-500'
                                      : 'bg-rose-500'
                                  )}
                                />
                                <span className="truncate max-w-[200px]">{host.name}</span>
                              </div>
                            </td>
                            <td className="text-muted-foreground">{host.cpuCores ?? '—'}</td>
                            <td className="text-muted-foreground">
                              {host.memoryGB ? `${host.memoryGB} GB` : '—'}
                            </td>
                            <td className="text-right">
                              <Badge
                                variant={
                                  host.status === 'connected' ? 'success' : 'destructive'
                                }
                                className="text-[9px]"
                              >
                                {host.status === 'connected'
                                  ? 'Bağlı'
                                  : host.status === 'disconnected'
                                  ? 'Bağlantı Kesik'
                                  : host.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                        {(!vmware?.hosts || vmware.hosts.length === 0) && (
                          <tr>
                            <td colSpan={4} className="text-center py-8 text-muted-foreground">
                              Host bulunamadı
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Old Snapshots */}
            <Card className="border-border/50 shadow-sm bg-card">
              <CardHeader>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-orange-500" />
                  Eski Snapshotlar
                </CardTitle>
                <div className="text-2xl font-black mt-2">
                  {vmwareLoading ? '...' : vmware?.oldSnapshots?.length || 0}
                </div>
                <CardDescription className="text-[10px] font-bold text-orange-500">
                  7 günden eski snapshot
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {vmwareLoading ? (
                  <div className="text-xs text-muted-foreground text-center py-4">
                    Yükleniyor...
                  </div>
                ) : (
                  <>
                    {vmware?.oldSnapshots?.slice(0, 6).map((snap, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className={cn(
                              'w-7 h-7 rounded-full flex items-center justify-center shrink-0',
                              snap.ageInDays > 30
                                ? 'bg-rose-500/10 text-rose-600'
                                : 'bg-orange-500/10 text-orange-600'
                            )}
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold truncate">{snap.vmName}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {snap.sizeGB.toFixed(1)} GB
                            </p>
                          </div>
                        </div>
                        <Badge variant="secondary" className="text-[9px] shrink-0">
                          {snap.ageInDays}g
                        </Badge>
                      </div>
                    ))}
                    {(!vmware?.oldSnapshots || vmware.oldSnapshots.length === 0) && (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        Eski snapshot yok ✓
                      </p>
                    )}
                    {vmware?.oldSnapshots && vmware.oldSnapshots.length > 6 && (
                      <Link
                        href="/virtualization/snapshots"
                        className="text-xs text-primary hover:underline block text-center pt-2"
                      >
                        +{vmware.oldSnapshots.length - 6} daha göster
                      </Link>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Datastore Capacity (full width) ─────────── */}
          <Card className="border-border/50 shadow-sm bg-card overflow-hidden">
              <CardHeader className="border-b border-border/50">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-bold">Depolama Kapasitesi</CardTitle>
                    <CardDescription className="text-xs">
                      {vmwareLoading
                        ? 'Yükleniyor...'
                        : `${summary?.usedStorageTB?.toFixed(1) || 0} TB kullanılan / ${
                            summary?.totalStorageTB?.toFixed(1) || 0
                          } TB toplam`}
                    </CardDescription>
                  </div>
                  <Link href="/virtualization/datastores">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[10px] font-bold text-muted-foreground"
                    >
                      Detay <ArrowUpRight className="h-3 w-3 ml-1" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                {vmwareLoading ? (
                  <div className="text-xs text-muted-foreground text-center py-8">
                    Yükleniyor...
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-2xl font-black">{storageUsedPct}%</span>
                      <span className="text-xs text-muted-foreground">toplam kullanım</span>
                    </div>
                    <Progress value={storageUsedPct} className="h-2 mb-6" />
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-8 gap-y-3">
                      {vmware?.datastores
                        .slice()
                        .sort((a, b) => b.usedPercent - a.usedPercent)
                        .map((ds) => (
                          <div key={ds.id} className="flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between text-[11px] mb-1">
                                <span className="font-medium truncate">{ds.name}</span>
                                <span
                                  className={cn(
                                    'font-bold shrink-0 ml-2',
                                    ds.usedPercent >= 90
                                      ? 'text-rose-500'
                                      : ds.usedPercent >= 80
                                      ? 'text-amber-500'
                                      : 'text-muted-foreground'
                                  )}
                                >
                                  %{ds.usedPercent}
                                </span>
                              </div>
                              <Progress value={ds.usedPercent} className="h-1.5" />
                            </div>
                            <span className="text-[10px] text-muted-foreground shrink-0 w-14 text-right">
                              {(ds.capacityGB / 1024).toFixed(1)} TB
                            </span>
                          </div>
                        ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

          {/* ── Güvenlik Duvarı (Firewall) ───────────────────── */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Shield className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-bold tracking-tight">Güvenlik Duvarı</h2>
              {!firewallLoading && firewall?.lastSync && (
                <span className="text-[10px] text-muted-foreground">
                  Son sync: {new Date(firewall.lastSync).toLocaleString('tr-TR')}
                </span>
              )}
            </div>

            {/* Firewall stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {[
                {
                  label: 'Güvenlik Kuralları',
                  value: firewallLoading ? '...' : (firewall?.policies || 0).toLocaleString(),
                  sub: firewallLoading ? '' : `${firewall?.addresses || 0} adres nesnesi`,
                  icon: Shield,
                  href: '/security/policies',
                  color: 'text-blue-500',
                  bg: 'bg-blue-500/10',
                },
                {
                  label: 'SSL-VPN Oturumu',
                  value: firewallLoading ? '...' : (firewall?.sslVpnSessions || 0).toLocaleString(),
                  sub: firewallLoading
                    ? ''
                    : firewall?.sslVpnSessions
                    ? `${((firewall.sslInBytes + firewall.sslOutBytes) / 1_073_741_824).toFixed(1)} GB trafik`
                    : 'Aktif oturum yok',
                  icon: Wifi,
                  href: '/network/ssl-vpn',
                  color: 'text-emerald-500',
                  bg: 'bg-emerald-500/10',
                },
                {
                  label: 'IPSec Tüneli',
                  value: firewallLoading
                    ? '...'
                    : (() => {
                        const up = firewall?.ipsecTunnels.filter((t) => t.status === 'up').length || 0;
                        const total = firewall?.ipsecTunnels.length || 0;
                        return `${up} / ${total}`;
                      })(),
                  sub: firewallLoading
                    ? ''
                    : (() => {
                        const down = (firewall?.ipsecTunnels || []).filter((t) => t.status !== 'up').length;
                        return down > 0 ? `${down} tünel kapalı` : 'Tüm tüneller aktif';
                      })(),
                  icon: Globe,
                  href: '/network/ipsec',
                  color:
                    (firewall?.ipsecTunnels || []).some((t) => t.status !== 'up')
                      ? 'text-rose-500'
                      : 'text-emerald-500',
                  bg:
                    (firewall?.ipsecTunnels || []).some((t) => t.status !== 'up')
                      ? 'bg-rose-500/10'
                      : 'bg-emerald-500/10',
                },
                {
                  label: 'Karantina',
                  value: firewallLoading ? '...' : (firewall?.quarantineCount || 0).toLocaleString(),
                  sub: firewallLoading
                    ? ''
                    : firewall?.quarantineCount
                    ? 'Engellenen IP adresi'
                    : 'Karantinada IP yok',
                  icon: Lock,
                  href: '/security/quarantine',
                  color: (firewall?.quarantineCount || 0) > 0 ? 'text-rose-500' : 'text-muted-foreground',
                  bg: (firewall?.quarantineCount || 0) > 0 ? 'bg-rose-500/10' : 'bg-muted',
                },
              ].map((card) => (
                <Link key={card.label} href={card.href}>
                  <Card className="border-border/50 shadow-sm bg-card hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', card.bg)}>
                          <card.icon className={cn('h-4 w-4', card.color)} />
                        </div>
                        <span className="text-xs font-bold text-muted-foreground">{card.label}</span>
                      </div>
                      <div className="text-2xl font-black tracking-tighter">{card.value}</div>
                      <p className="text-[10px] text-muted-foreground mt-1">{card.sub}</p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>

            {/* IPSec tunnel list + VPN/Interfaces detail */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* IPSec tunnels */}
              <Card className="lg:col-span-2 border-border/50 shadow-sm bg-card overflow-hidden">
                <CardHeader className="border-b border-border/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-bold">IPSec Tünelleri</CardTitle>
                      <CardDescription className="text-xs">Site-to-site VPN tünel durumları</CardDescription>
                    </div>
                    <Link href="/network/ipsec">
                      <Button variant="ghost" size="sm" className="h-7 text-[10px] font-bold text-muted-foreground">
                        Tümünü Gör <ArrowUpRight className="h-3 w-3 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {firewallLoading ? (
                    <div className="p-8 text-xs text-muted-foreground text-center">Yükleniyor...</div>
                  ) : !firewall?.ipsecTunnels.length ? (
                    <div className="p-8 text-xs text-muted-foreground text-center">IPSec tünel bulunamadı</div>
                  ) : (
                    <div className="table-responsive">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Tünel Adı</th>
                            <th>Uzak Gateway</th>
                            <th>Gelen / Giden</th>
                            <th className="text-right">Durum</th>
                          </tr>
                        </thead>
                        <tbody className="text-xs font-medium">
                          {firewall.ipsecTunnels.slice(0, 10).map((tunnel, idx) => (
                            <tr key={idx}>
                              <td className="font-bold">
                                <div className="flex items-center gap-2">
                                  <div
                                    className={cn(
                                      'w-1.5 h-1.5 rounded-full shrink-0',
                                      tunnel.status === 'up' ? 'bg-emerald-500' : 'bg-rose-500'
                                    )}
                                  />
                                  <span className="truncate max-w-[180px]">{tunnel.name}</span>
                                </div>
                              </td>
                              <td className="text-muted-foreground truncate max-w-[120px]">{tunnel.rgwy || '—'}</td>
                              <td className="text-muted-foreground">
                                {tunnel.incoming_bytes || tunnel.outgoing_bytes
                                  ? `${(tunnel.incoming_bytes / 1_048_576).toFixed(1)} / ${(tunnel.outgoing_bytes / 1_048_576).toFixed(1)} MB`
                                  : '—'}
                              </td>
                              <td className="text-right">
                                <Badge
                                  variant={tunnel.status === 'up' ? 'success' : 'destructive'}
                                  className="text-[9px]"
                                >
                                  {tunnel.status === 'up' ? 'Aktif' : 'Kapalı'}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Firewall overview card */}
              <Card className="border-border/50 shadow-sm bg-card">
                <CardHeader>
                  <CardTitle className="text-sm font-bold">Firewall Özeti</CardTitle>
                  <CardDescription className="text-xs">Senkronizasyon ve arayüz bilgileri</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {firewallLoading ? (
                    <div className="text-xs text-muted-foreground text-center py-4">Yükleniyor...</div>
                  ) : (
                    <>
                      {[
                        { label: 'Güvenlik Kuralı', value: firewall?.policies || 0, icon: Shield, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                        { label: 'Adres Nesnesi', value: firewall?.addresses || 0, icon: Globe, color: 'text-violet-500', bg: 'bg-violet-500/10' },
                        { label: 'Ağ Arayüzü', value: firewall?.interfaces || 0, icon: Server, color: 'text-teal-500', bg: 'bg-teal-500/10' },
                        { label: 'VLAN', value: firewall?.vlans || 0, icon: Layers, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
                        { label: 'SSL-VPN Oturumu', value: firewall?.sslVpnSessions || 0, icon: Wifi, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                        { label: 'Karantina IP', value: firewall?.quarantineCount || 0, icon: Lock, color: (firewall?.quarantineCount || 0) > 0 ? 'text-rose-500' : 'text-muted-foreground', bg: (firewall?.quarantineCount || 0) > 0 ? 'bg-rose-500/10' : 'bg-muted' },
                      ].map((item) => (
                        <div key={item.label} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={cn('w-7 h-7 rounded-md flex items-center justify-center', item.bg)}>
                              <item.icon className={cn('h-3.5 w-3.5', item.color)} />
                            </div>
                            <span className="text-xs font-medium">{item.label}</span>
                          </div>
                          <span className="text-sm font-bold">{item.value.toLocaleString()}</span>
                        </div>
                      ))}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* ── Support Expiration Alert ────────────────────── */}
          {!coreLoading && expiringDevices.length > 0 && (
            <Card className="border-border/50 shadow-sm overflow-hidden">
              <CardHeader className="border-b border-border/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5 text-rose-500" />
                    <div>
                      <CardTitle className="text-sm font-bold">Support Tarihi Uyarısı</CardTitle>
                      <CardDescription className="text-xs mt-1">
                        30 gün içinde sonu çalan destekler
                      </CardDescription>
                    </div>
                  </div>
                  <Badge className="bg-rose-500/20 text-rose-700 border-rose-500/50">
                    {expiringDevices.length}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {expiringDevices.map((device) => {
                    const daysLeft = getDaysLeft(device.supportDate);
                    return (
                      <div
                        key={device.id}
                        className="border border-border/50 rounded-lg p-4 bg-white hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Clock className={cn('h-4 w-4', expirationColor(daysLeft))} />
                            <Badge variant="destructive" className="text-[9px] font-bold">
                              {daysLeft} gün
                            </Badge>
                          </div>
                        </div>
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
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">Tip:</span>
                            <span className="font-medium">
                              {device.type.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">Bitiş:</span>
                            <span className={cn('font-bold', expirationColor(daysLeft))}>
                              {device.supportDate
                                ? new Date(device.supportDate).toLocaleDateString('tr-TR')
                                : 'N/A'}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </>
  );
}
