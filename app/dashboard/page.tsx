'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  RefreshCcw,
  AlertTriangle,
  Server,
  Database,
  Monitor,
  Shield,
  Wifi,
  Globe,
  Lock,
  HardDrive,
  ArrowUpRight,
  Layers,
  CheckCircle2,
  XCircle,
  CheckCircle,
  WifiOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface VMwareSummary {
  clusters: number;
  hosts: number;
  hostsOnline: number;
  hostsOffline: number;
  vms: number;
  vmRunning: number;
  vmStopped: number;
  datastores: number;
  totalStorageTB: number;
  usedStorageTB: number;
  totalCpuCores: number;
  totalMemoryGB: number;
}

interface HostInfo {
  id: string;
  name: string;
  status: string;
  cpuCores?: number;
  memoryGB?: number;
}

interface DatastoreInfo {
  id: string;
  name: string;
  capacityGB: number;
  freeGB: number;
  usedPercent: number;
}

interface SnapshotInfo {
  vmName: string;
  name: string;
  ageInDays: number;
  sizeGB: number;
}

interface NmsDevice {
  id: number;
  name: string;
  ip_address: string;
  connection_status: string;
}

interface NmsAlarm {
  id: number;
  device_name: string;
  message: string;
  severity: string;
}

interface IpsecTunnel {
  name: string;
  status: string;
  rgwy: string;
  incoming_bytes: number;
  outgoing_bytes: number;
}

interface SSLUser {
  user_name: string;
  remote_host: string;
  last_login_timestamp: number;
  two_factor_auth: boolean;
  interface: string;
  duration: number;
  aip: string;
  in_bytes: number;
  out_bytes: number;
}

export default function DashboardPage() {
  const [vmware, setVmware] = useState<{
    summary: VMwareSummary;
    hosts: HostInfo[];
    datastores: DatastoreInfo[];
    oldSnapshots: SnapshotInfo[];
  } | null>(null);
  const [vmwareLoading, setVmwareLoading] = useState(true);

  const [firewall, setFirewall] = useState<{
    policies: number;
    addresses: number;
    sslVpnSessions: number;
    ipsecTunnels: IpsecTunnel[];
    quarantineCount: number;
  } | null>(null);
  const [firewallLoading, setFirewallLoading] = useState(true);

  const [sslUsers, setSslUsers] = useState<SSLUser[]>([]);
  const [sslUsersLoading, setSslUsersLoading] = useState(true);

  const [nmsDevices, setNmsDevices] = useState<NmsDevice[]>([]);
  const [nmsAlarms, setNmsAlarms] = useState<NmsAlarm[]>([]);
  const [nmsLoading, setNmsLoading] = useState(true);
  const [nmsReachable, setNmsReachable] = useState<boolean | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = () => {
    loadVmwareData();
    loadFirewallData();
    loadSSLUsers();
    loadNmsData();
  };

  const loadNmsData = async () => {
    try {
      setNmsLoading(true);
      const [devRes, alarmRes] = await Promise.allSettled([
        fetch('/api/integrations/nms/network-devices'),
        fetch('/api/integrations/nms/alarms?status=active'),
      ]);
      if (devRes.status === 'fulfilled' && devRes.value.ok) {
        const data = await devRes.value.json();
        setNmsDevices(data.data || []);
        setNmsReachable(true);
      } else {
        setNmsReachable(false);
      }
      if (alarmRes.status === 'fulfilled' && alarmRes.value.ok) {
        const data = await alarmRes.value.json();
        setNmsAlarms(data.data || []);
      }
    } catch {
      setNmsReachable(false);
    } finally {
      setNmsLoading(false);
    }
  };

  const loadVmwareData = async () => {
    try {
      setVmwareLoading(true);
      const res = await fetch('/api/integrations/vmware?type=dashboard');
      const json = await res.json();
      if (!json.error) setVmware(json);
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
        sslVpnSessions: ssl?.active_sessions || 0,
        ipsecTunnels: Array.isArray(ipsecData) ? ipsecData : [],
        quarantineCount: qData?.count || 0,
      });
    } finally {
      setFirewallLoading(false);
    }
  };

  const loadSSLUsers = async () => {
    try {
      setSslUsersLoading(true);
      const res = await fetch('/api/integrations/fortigate?vpn=ssl');
      const json = await res.json();
      setSslUsers(json.data || []);
    } catch {
      setSslUsers([]);
    } finally {
      setSslUsersLoading(false);
    }
  };

  // Calculations
  const summary = vmware?.summary;
  const storageUsedPct = summary?.totalStorageTB ? Math.round((summary.usedStorageTB / summary.totalStorageTB) * 100) : 0;
  const vmRunPct = summary?.vms ? Math.round(((summary.vmRunning || 0) / summary.vms) * 100) : 0;
  const criticalDatastores = vmware?.datastores.filter((d) => d.usedPercent >= 85) || [];
  const oldSnapshots = vmware?.oldSnapshots || [];
  const ipsecUp = firewall?.ipsecTunnels.filter((t) => t.status === 'up').length || 0;
  const ipsecDown = firewall?.ipsecTunnels.filter((t) => t.status !== 'up') || [];
  const ipsecTotal = firewall?.ipsecTunnels.length || 0;

  const loading = vmwareLoading || firewallLoading || nmsLoading;

  const nmsOnline = nmsDevices.filter(d => d.connection_status === 'online').length;
  const nmsOffline = nmsDevices.filter(d => d.connection_status === 'offline' || d.connection_status === 'unreachable').length;
  const nmsCritical = nmsAlarms.filter(a => a.severity === 'critical').length;

  // Format duration from seconds to readable
  const formatDuration = (seconds: number) => {
    if (!seconds) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}s ${m}d`;
    return `${m}d`;
  };

  // Format bytes to MB/GB
  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B';
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
    return `${(bytes / 1_048_576).toFixed(1)} MB`;
  };

  return (
    <main className="flex-1 overflow-y-auto p-6 custom-scrollbar">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Kontrol Paneli</h1>
          <p className="text-xs text-muted-foreground">VMware ve Güvenlik Duvarı kritik metrikleri</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadAll} disabled={loading}>
          <RefreshCcw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
          Yenile
        </Button>
      </div>

      {/* VMware & Firewall Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
        <Link href="/virtualization/vms">
          <Card className="border-border/50 hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Monitor className="h-4 w-4 text-blue-500" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">VM</span>
              </div>
              <div className="text-2xl font-black">{vmwareLoading ? '...' : summary?.vms || 0}</div>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-[10px] text-emerald-500 font-medium">{summary?.vmRunning || 0} aktif</span>
                <span className="text-[10px] text-muted-foreground">·</span>
                <span className="text-[10px] text-rose-500 font-medium">{summary?.vmStopped || 0} kapalı</span>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/virtualization/hosts">
          <Card className="border-border/50 hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Server className="h-4 w-4 text-violet-500" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Host</span>
              </div>
              <div className="text-2xl font-black">{vmwareLoading ? '...' : summary?.hosts || 0}</div>
              <div className="flex items-center gap-1 mt-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                <span className="text-[10px] text-muted-foreground">{summary?.hostsOnline || 0} online</span>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/virtualization/datastores">
          <Card className={cn('hover:shadow-md transition-shadow cursor-pointer h-full', criticalDatastores.length > 0 ? 'border-amber-500/50' : 'border-border/50')}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Database className={cn('h-4 w-4', criticalDatastores.length > 0 ? 'text-amber-500' : 'text-teal-500')} />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Storage</span>
              </div>
              <div className="text-2xl font-black">{vmwareLoading ? '...' : `${storageUsedPct}%`}</div>
              <Progress value={storageUsedPct} className="h-1.5 mt-2" />
            </CardContent>
          </Card>
        </Link>

        <Link href="/security/policies">
          <Card className="border-border/50 hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-4 w-4 text-blue-500" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Policy</span>
              </div>
              <div className="text-2xl font-black">{firewallLoading ? '...' : firewall?.policies || 0}</div>
              <div className="text-[10px] text-muted-foreground mt-1">{firewall?.addresses || 0} adres nesnesi</div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/network/ipsec">
          <Card className={cn('hover:shadow-md transition-shadow cursor-pointer h-full', ipsecDown.length > 0 ? 'border-rose-500/50' : 'border-border/50')}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Globe className={cn('h-4 w-4', ipsecDown.length > 0 ? 'text-rose-500' : 'text-emerald-500')} />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">IPSec</span>
              </div>
              <div className="text-2xl font-black">
                <span className="text-emerald-500">{ipsecUp}</span>
                <span className="text-muted-foreground text-base">/{ipsecTotal}</span>
              </div>
              <div className="text-[10px] mt-1">
                {ipsecDown.length > 0 ? <span className="text-rose-500 font-medium">{ipsecDown.length} kapalı</span> : <span className="text-emerald-500">Tümü aktif</span>}
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/network/ssl-vpn">
          <Card className="border-border/50 hover:shadow-md transition-shadow cursor-pointer h-full">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Wifi className="h-4 w-4 text-cyan-500" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">SSL-VPN</span>
              </div>
              <div className={cn('text-2xl font-black', (firewall?.sslVpnSessions || 0) > 0 && 'text-emerald-500')}>{firewallLoading ? '...' : firewall?.sslVpnSessions || 0}</div>
              <div className="text-[10px] text-muted-foreground mt-1">aktif oturum</div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Main Grid: 3 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* ESXi Hosts */}
        <Card className="border-border/50 lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-violet-500" />
                <CardTitle className="text-sm font-bold">ESXi Hostlar</CardTitle>
              </div>
              <Link href="/virtualization/hosts">
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">
                  Tümü <ArrowUpRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {vmwareLoading ? (
              <div className="text-xs text-muted-foreground text-center py-6">Yükleniyor...</div>
            ) : (
              <div className="space-y-2">
                {vmware?.hosts.slice(0, 6).map((host) => (
                  <div key={host.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={cn('w-2 h-2 rounded-full shrink-0', host.status === 'connected' ? 'bg-emerald-500' : 'bg-rose-500')} />
                      <span className="text-xs font-medium truncate">{host.name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] text-muted-foreground shrink-0">
                      <span>{host.cpuCores || '—'} CPU</span>
                      <span>{host.memoryGB ? `${host.memoryGB} GB` : '—'}</span>
                      <Badge variant={host.status === 'connected' ? 'success' : 'destructive'} className="text-[9px]">
                        {host.status === 'connected' ? 'Bağlı' : 'Kesik'}
                      </Badge>
                    </div>
                  </div>
                ))}
                {(!vmware?.hosts || vmware.hosts.length === 0) && <div className="text-xs text-muted-foreground text-center py-4">Host bulunamadı</div>}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Snapshots + Quarantine */}
        <div className="space-y-6">
          {/* Old Snapshots */}
          <Card className={cn('border-border/50', oldSnapshots.length > 0 && 'border-orange-500/50')}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HardDrive className={cn('h-4 w-4', oldSnapshots.length > 0 ? 'text-orange-500' : 'text-muted-foreground')} />
                  <CardTitle className="text-sm font-bold">Eski Snapshotlar</CardTitle>
                </div>
                <Badge variant="secondary" className="text-[10px]">{oldSnapshots.length}</Badge>
              </div>
              <CardDescription className="text-[10px]">&gt;7 günlük snapshotlar</CardDescription>
            </CardHeader>
            <CardContent>
              {vmwareLoading ? (
                <div className="text-xs text-muted-foreground text-center py-4">Yükleniyor...</div>
              ) : oldSnapshots.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-emerald-600 py-2">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Eski snapshot yok</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {oldSnapshots.slice(0, 4).map((snap, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <AlertTriangle className={cn('h-3 w-3 shrink-0', snap.ageInDays > 30 ? 'text-rose-500' : 'text-orange-500')} />
                        <span className="truncate font-medium">{snap.vmName}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-muted-foreground">{snap.sizeGB.toFixed(1)} GB</span>
                        <Badge variant="secondary" className="text-[9px]">{snap.ageInDays}g</Badge>
                      </div>
                    </div>
                  ))}
                  {oldSnapshots.length > 4 && (
                    <Link href="/virtualization/snapshots" className="text-[10px] text-primary hover:underline block text-center pt-1">
                      +{oldSnapshots.length - 4} daha
                    </Link>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quarantine */}
          <Card className={cn('border-border/50', (firewall?.quarantineCount || 0) > 0 && 'border-rose-500/50')}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lock className={cn('h-4 w-4', (firewall?.quarantineCount || 0) > 0 ? 'text-rose-500' : 'text-muted-foreground')} />
                  <CardTitle className="text-sm font-bold">Karantina</CardTitle>
                </div>
                <Link href="/security/quarantine">
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">
                    Detay <ArrowUpRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className={cn('text-3xl font-black', (firewall?.quarantineCount || 0) > 0 ? 'text-rose-500' : 'text-muted-foreground')}>
                {firewallLoading ? '...' : firewall?.quarantineCount || 0}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">engellenen IP adresi</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* NMS Stats + Alarms Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* NMS Stats: 2x2 */}
        <div className="grid grid-cols-2 gap-4 content-start">
          <Link href="/integrations/nms">
            <Card className="border-border/50 hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Server className="h-4 w-4 text-blue-500" />
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">SNMP Cihaz</span>
                </div>
                <div className="text-2xl font-black">{nmsLoading ? '...' : nmsDevices.length}</div>
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-[10px] text-emerald-500 font-medium">{nmsOnline} online</span>
                  <span className="text-[10px] text-muted-foreground">·</span>
                  <span className="text-[10px] text-rose-500 font-medium">{nmsOffline} offline</span>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/integrations/nms">
            <Card className={cn('hover:shadow-md transition-shadow cursor-pointer h-full', nmsOffline > 0 ? 'border-rose-500/50' : 'border-border/50')}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  {nmsOffline > 0 ? <XCircle className="h-4 w-4 text-rose-500" /> : <CheckCircle className="h-4 w-4 text-emerald-500" />}
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Offline</span>
                </div>
                <div className={cn('text-2xl font-black', nmsOffline > 0 ? 'text-rose-500' : 'text-emerald-500')}>{nmsLoading ? '...' : nmsOffline}</div>
                <div className="text-[10px] text-muted-foreground mt-1">erişilemeyen cihaz</div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/integrations/nms">
            <Card className={cn('hover:shadow-md transition-shadow cursor-pointer h-full', nmsCritical > 0 ? 'border-rose-500/50' : 'border-border/50')}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className={cn('h-4 w-4', nmsCritical > 0 ? 'text-rose-500' : 'text-muted-foreground')} />
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Kritik Alarm</span>
                </div>
                <div className={cn('text-2xl font-black', nmsCritical > 0 ? 'text-rose-500' : 'text-muted-foreground')}>{nmsLoading ? '...' : nmsCritical}</div>
                <div className="text-[10px] text-muted-foreground mt-1">aktif alarm</div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/integrations/nms">
            <Card className={cn('hover:shadow-md transition-shadow cursor-pointer h-full', nmsReachable === false ? 'border-rose-500/50' : 'border-border/50')}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  {nmsReachable ? <Wifi className="h-4 w-4 text-emerald-500" /> : <WifiOff className="h-4 w-4 text-rose-500" />}
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">NMS Servis</span>
                </div>
                <div className={cn('text-lg font-black', nmsReachable ? 'text-emerald-500' : nmsReachable === false ? 'text-rose-500' : 'text-muted-foreground')}>
                  {nmsLoading ? '...' : nmsReachable ? 'Bağlı' : 'Bağlı Değil'}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">SNMP servisi</div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* NMS Alarms */}
        <Card className={cn('lg:col-span-2 border-border/50', nmsCritical > 0 && 'border-rose-500/50')}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className={cn('h-4 w-4', nmsCritical > 0 ? 'text-rose-500' : 'text-muted-foreground')} />
                <CardTitle className="text-sm font-bold">SNMP Aktif Alarmlar</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">{nmsAlarms.length}</Badge>
                <Link href="/integrations/nms">
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">
                    Tümü <ArrowUpRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {nmsLoading ? (
              <div className="text-xs text-muted-foreground text-center py-4">Yükleniyor...</div>
            ) : nmsAlarms.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-emerald-600 py-2">
                <CheckCircle2 className="h-4 w-4" />
                <span>Aktif SNMP alarmı yok</span>
              </div>
            ) : (
              <div className="space-y-2">
                {nmsAlarms.slice(0, 8).map((alarm) => (
                  <div key={alarm.id} className="flex items-start justify-between gap-2 p-2 rounded-lg border border-border bg-muted/20">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{alarm.device_name}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{alarm.message}</p>
                    </div>
                    <Badge variant={alarm.severity === 'critical' ? 'destructive' : 'secondary'} className="text-[9px] shrink-0">
                      {alarm.severity}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row: Datastores + IPSec + Recent Alarms */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Datastore Usage */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-teal-500" />
                <CardTitle className="text-sm font-bold">Depolama Kullanımı</CardTitle>
              </div>
              <Link href="/virtualization/datastores">
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">
                  Tümü <ArrowUpRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </div>
            <CardDescription className="text-[10px]">
              {summary?.usedStorageTB?.toFixed(1) || 0} / {summary?.totalStorageTB?.toFixed(1) || 0} TB kullanılıyor
            </CardDescription>
          </CardHeader>
          <CardContent>
            {vmwareLoading ? (
              <div className="text-xs text-muted-foreground text-center py-4">Yükleniyor...</div>
            ) : (
              <div className="space-y-3">
                {vmware?.datastores
                  .slice()
                  .sort((a, b) => b.usedPercent - a.usedPercent)
                  .slice(0, 5)
                  .map((ds) => (
                    <div key={ds.id}>
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="truncate font-medium">{ds.name}</span>
                        <span className={cn('font-bold', ds.usedPercent >= 90 ? 'text-rose-500' : ds.usedPercent >= 80 ? 'text-amber-500' : 'text-muted-foreground')}>%{ds.usedPercent}</span>
                      </div>
                      <Progress value={ds.usedPercent} className="h-1.5" />
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* IPSec Tunnels */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-emerald-500" />
                <CardTitle className="text-sm font-bold">IPSec Tünelleri</CardTitle>
              </div>
              <Link href="/network/ipsec">
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">
                  Tümü <ArrowUpRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {firewallLoading ? (
              <div className="text-xs text-muted-foreground text-center py-4">Yükleniyor...</div>
            ) : !firewall?.ipsecTunnels.length ? (
              <div className="text-xs text-muted-foreground text-center py-4">Tünel bulunamadı</div>
            ) : (
              <div className="space-y-2">
                {firewall.ipsecTunnels.slice(0, 5).map((t, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={cn('w-2 h-2 rounded-full shrink-0', t.status === 'up' ? 'bg-emerald-500' : 'bg-rose-500')} />
                      <span className="text-xs font-medium truncate">{t.name}</span>
                    </div>
                    <Badge variant={t.status === 'up' ? 'success' : 'destructive'} className="text-[9px] shrink-0">
                      {t.status === 'up' ? 'Aktif' : 'Kapalı'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* SSL-VPN Connected Users */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wifi className="h-4 w-4 text-cyan-500" />
                <CardTitle className="text-sm font-bold">SSL-VPN Bağlı Kullanıcılar</CardTitle>
              </div>
              <Badge variant="secondary" className="text-[10px]">{sslUsers.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {sslUsersLoading ? (
              <div className="text-xs text-muted-foreground text-center py-4">Yükleniyor...</div>
            ) : sslUsers.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
                <Wifi className="h-4 w-4" />
                <span>Aktif VPN bağlantısı yok</span>
              </div>
            ) : (
              <div className="space-y-2">
                {sslUsers.slice(0, 6).map((user, idx) => (
                  <div key={idx} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{user.user_name || '—'}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{user.remote_host || '—'}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <span className="text-[10px] text-muted-foreground">{formatDuration(user.duration)}</span>
                      <span className="text-[9px] text-muted-foreground">↓{formatBytes(user.in_bytes)} ↑{formatBytes(user.out_bytes)}</span>
                    </div>
                  </div>
                ))}
                {sslUsers.length > 6 && (
                  <Link href="/network/ssl-vpn" className="text-[10px] text-primary hover:underline block text-center pt-1">
                    +{sslUsers.length - 6} daha
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cluster Overview (compact) */}
      <div className="mt-6">
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-indigo-500" />
              <CardTitle className="text-sm font-bold">Kaynak Özeti</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-muted/30 rounded-lg">
                <div className="text-2xl font-black text-blue-500">{vmwareLoading ? '...' : summary?.clusters || 0}</div>
                <div className="text-[10px] text-muted-foreground font-medium">Cluster</div>
              </div>
              <div className="text-center p-3 bg-muted/30 rounded-lg">
                <div className="text-2xl font-black text-violet-500">{vmwareLoading ? '...' : summary?.totalCpuCores || 0}</div>
                <div className="text-[10px] text-muted-foreground font-medium">CPU Çekirdeği</div>
              </div>
              <div className="text-center p-3 bg-muted/30 rounded-lg">
                <div className="text-2xl font-black text-teal-500">{vmwareLoading ? '...' : `${(summary?.totalMemoryGB || 0) / 1024 > 1 ? ((summary?.totalMemoryGB || 0) / 1024).toFixed(1) : summary?.totalMemoryGB || 0}`}</div>
                <div className="text-[10px] text-muted-foreground font-medium">{(summary?.totalMemoryGB || 0) / 1024 > 1 ? 'TB RAM' : 'GB RAM'}</div>
              </div>
              <div className="text-center p-3 bg-muted/30 rounded-lg">
                <div className="text-2xl font-black text-emerald-500">{vmwareLoading ? '...' : `${vmRunPct}%`}</div>
                <div className="text-[10px] text-muted-foreground font-medium">VM Aktiflik</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
