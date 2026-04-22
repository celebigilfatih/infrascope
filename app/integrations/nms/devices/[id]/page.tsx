'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2,
  ArrowLeft,
  CheckCircle,
  XCircle,
  Wifi,
  WifiOff,
  Clock,
  Server,
  Cpu,
  Network,
  Activity,
  AlertTriangle,
  Pencil,
  RefreshCw,
  Monitor,
  Plug,
  ArrowDown,
  ArrowUp,
  Thermometer,
  Link2,
  HardDrive,
  Download,
  Trash2,
  Plus,
  Eye,
  X,
} from 'lucide-react';
import Link from 'next/link';

interface DbNmsBackup {
  id: string;
  backupType: string;
  backupFile: string | null;
  description: string | null;
  sizeBytes: string;
  checksum: string | null;
  createdAt: string;
}

interface DbNmsInterface {
  id: string;
  interfaceIndex: number;
  interfaceName: string;
  description: string | null;
  adminStatus: string;
  operStatus: string;
  speed: string | number;     // BigInt serialized as string
  inOctets: string | number;
  outOctets: string | number;
  inErrors: number;
  outErrors: number;
  mtu: number;
  lastPolledAt: string | null;
  monitored: boolean;
}

interface DbNmsHealthMetric {
  id: string;
  cpuUsage: number | null;
  memoryUsage: number | null;
  temperature: number | null;
  uptimeSeconds: number | null;
  collectedAt: string;
}

interface DbNmsTopologyLink {
  id: string;
  localInterface: string;
  remoteDeviceName: string;
  remoteInterface: string;
  protocol: string;
  lastSeenAt: string;
}

interface DbDevice {
  id: string;
  name: string;
  type: string | null;
  vendor: string | null;
  nmsDeviceId: number;
  managementIp: string | null;
  snmpVersion: string | null;
  snmpPort: number | null;
  pollingEnabled: boolean;
  pollingInterval: number | null;
  lastPolledAt: string | null;
}

function getConnectionStatus(device: DbDevice): 'online' | 'offline' | 'disabled' | 'unknown' {
  if (!device.pollingEnabled) return 'disabled';
  if (!device.lastPolledAt) return 'unknown';
  const diffMs = Date.now() - new Date(device.lastPolledAt).getTime();
  // Allow 2.5x the polling interval as grace period (default 5 min → 12.5 min threshold)
  const intervalMs = (device.pollingInterval ?? 300) * 1000;
  return diffMs < intervalMs * 2.5 ? 'online' : 'offline';
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-card border border-border">
      <div className={`p-2.5 rounded-lg ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="text-sm font-bold">{value}</p>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  if (!value || value === '-' || value === '—') return null;
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/60 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

export default function ViewNmsDevicePage() {
  const params = useParams();
  const deviceId = params.id as string;

  const [backups, setBackups] = useState<DbNmsBackup[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [viewBackup, setViewBackup] = useState<{ id: string; config: string; type: string; createdAt: string } | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  const [interfaces, setInterfaces] = useState<DbNmsInterface[]>([]);
  const [healthMetrics, setHealthMetrics] = useState<DbNmsHealthMetric[]>([]);
  const [topologyLinks, setTopologyLinks] = useState<DbNmsTopologyLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState<DbDevice | null>(null);

  // Port monitoring state
  const [monitoredIds, setMonitoredIds] = useState<Set<string>>(new Set());
  const [savingMonitored, setSavingMonitored] = useState(false);
  const [monitoredDirty, setMonitoredDirty] = useState(false);

  const loadBackups = async () => {
    setBackupsLoading(true);
    setBackupError(null);
    try {
      const res = await fetch(`/api/integrations/nms/devices/${deviceId}/backups`);
      const data = await res.json();
      if (res.ok) setBackups(data.backups || []);
      else setBackupError(data.error || 'Failed to load backups');
    } catch (e: any) {
      setBackupError(e.message);
    } finally {
      setBackupsLoading(false);
    }
  };

  const triggerBackup = async (backupType: string) => {
    setTriggering(true);
    setTriggerResult(null);
    try {
      const res = await fetch(`/api/integrations/nms/devices/${deviceId}/backups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupType }),
      });
      const data = await res.json();
      if (res.ok) {
        setTriggerResult({ ok: true, msg: 'Backup started successfully.' });
        setTimeout(loadBackups, 3000);
      } else {
        setTriggerResult({ ok: false, msg: data.hint || data.error || 'Failed to trigger backup' });
      }
    } catch (e: any) {
      setTriggerResult({ ok: false, msg: e.message });
    } finally {
      setTriggering(false);
    }
  };

  const viewBackupConfig = async (backup: DbNmsBackup) => {
    setViewLoading(true);
    try {
      const res = await fetch(`/api/integrations/nms/devices/${deviceId}/backups/${backup.id}`);
      const data = await res.json();
      if (res.ok) setViewBackup({ id: backup.id, config: data.configuration || '', type: backup.backupType, createdAt: backup.createdAt });
    } finally {
      setViewLoading(false);
    }
  };

  const deleteBackup = async (backupId: string) => {
    if (!confirm('Bu backup silinsin mi?')) return;
    await fetch(`/api/integrations/nms/devices/${deviceId}/backups/${backupId}`, { method: 'DELETE' });
    setBackups(prev => prev.filter(b => b.id !== backupId));
  };

  const downloadConfig = (config: string, filename: string) => {
    const blob = new Blob([config], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const loadDevice = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/integrations/nms/devices/${deviceId}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to load device');
      } else {
        setDevice(data.device);
        setInterfaces(data.interfaces || []);
        setMonitoredIds(new Set((data.interfaces || []).filter((i: DbNmsInterface) => i.monitored).map((i: DbNmsInterface) => i.id)));
        setMonitoredDirty(false);
        setHealthMetrics(data.healthMetrics || []);
        setTopologyLinks(data.topologyLinks || []);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (deviceId) { loadDevice(); loadBackups(); }
  }, [deviceId]);

  const formatDate = (ts: string | null) => {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatRelative = (ts: string | null) => {
    if (!ts) return '—';
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const formatBytes = (val: string | number | null): string => {
    if (val == null) return '—';
    const n = typeof val === 'string' ? parseInt(val) : Number(val);
    if (isNaN(n)) return '—';
    if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(2)} GB`;
    if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
    if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${n} B`;
  };

  const formatSpeed = (val: string | number | null): string => {
    if (val == null) return '—';
    const n = typeof val === 'string' ? parseInt(val) : Number(val);
    if (isNaN(n) || n === 0) return '—';
    if (n >= 1_000_000_000) return `${n / 1_000_000_000}G`;
    if (n >= 1_000_000) return `${n / 1_000_000}M`;
    return `${n}`;
  };

  const formatUptime = (seconds: number | null): string => {
    if (!seconds) return '—';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading device...</p>
      </div>
    );
  }

  if (error || !device) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          <span>{error || 'Device not found'}</span>
        </div>
        <Button variant="outline" asChild>
          <Link href="/integrations/nms/devices">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Devices
          </Link>
        </Button>
      </div>
    );
  }

  const status = getConnectionStatus(device);
  const isOnline = status === 'online';
  const StatusIcon = isOnline ? Wifi : WifiOff;
  const latestHealth = healthMetrics[0] ?? null;

  const vendorColor = device.vendor?.toLowerCase() === 'cisco'
    ? 'bg-blue-500/20 text-blue-500'
    : device.vendor?.toLowerCase() === 'hp'
    ? 'bg-purple-500/20 text-purple-500'
    : 'bg-gray-500/20 text-gray-500';

  const activeInterfaces = interfaces.filter(i => i.operStatus === 'up').length;
  const downInterfaces = interfaces.filter(i => i.adminStatus === 'up' && i.operStatus === 'down').length;

  const toggleMonitored = (id: string) => {
    setMonitoredIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setMonitoredDirty(true);
  };

  const saveMonitored = async () => {
    if (!device) return;
    setSavingMonitored(true);
    try {
      // Determine which changed: enable newly monitored, disable removed
      const original = new Set(interfaces.filter(i => i.monitored).map(i => i.id));
      const toEnable = interfaces.filter(i => monitoredIds.has(i.id) && !original.has(i.id)).map(i => i.id);
      const toDisable = interfaces.filter(i => !monitoredIds.has(i.id) && original.has(i.id)).map(i => i.id);

      await Promise.all([
        ...(toEnable.length > 0 ? [fetch(`/api/integrations/nms/devices/${device.id}/ports/monitored`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ interfaceIds: toEnable, monitored: true }),
        })] : []),
        ...(toDisable.length > 0 ? [fetch(`/api/integrations/nms/devices/${device.id}/ports/monitored`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ interfaceIds: toDisable, monitored: false }),
        })] : []),
      ]);

      // Update local state to reflect saved
      setInterfaces(prev => prev.map(i => ({ ...i, monitored: monitoredIds.has(i.id) })));
      setMonitoredDirty(false);
    } finally {
      setSavingMonitored(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/integrations/nms" className="hover:text-foreground transition-colors">NMS</Link>
        <span>/</span>
        <Link href="/integrations/nms/devices" className="hover:text-foreground transition-colors">Devices</Link>
        <span>/</span>
        <span className="text-foreground font-medium">{device.name}</span>
      </div>

      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card to-muted/30">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,var(--primary)/5%,transparent_70%)]" />
        <div className="relative p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className={`p-4 rounded-2xl ${isOnline ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                  <Server className={`h-10 w-10 ${isOnline ? 'text-green-500' : 'text-red-500'}`} />
                </div>
                <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-card ${
                  isOnline ? 'bg-green-500' : status === 'disabled' ? 'bg-gray-400' : 'bg-red-500'
                }`} />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{device.name}</h1>
                <div className="flex items-center gap-3 mt-1">
                  <span className="font-mono text-sm text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">
                    {device.managementIp || 'No IP'}
                  </span>
                  <Badge className={`gap-1 ${isOnline ? 'bg-green-500/20 text-green-500 hover:bg-green-500/30 border-0' : 'bg-red-500/20 text-red-500 hover:bg-red-500/30 border-0'}`}>
                    <StatusIcon className="h-3 w-3" />
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={loadDevice} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
              <Button size="sm" variant="outline" className="gap-2" onClick={() => triggerBackup('Running Config')} disabled={triggering}>
                {triggering ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
                Backup Al
              </Button>
              <Button size="sm" asChild className="gap-2 bg-orange-500 hover:bg-orange-600 text-white border-0">
                <Link href={`/integrations/nms/devices/${device.id}/edit`}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={isOnline ? CheckCircle : XCircle}
          label="Status"
          value={status.charAt(0).toUpperCase() + status.slice(1)}
          color={isOnline ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}
        />
        <StatCard
          icon={Server}
          label="Vendor"
          value={device.vendor || '—'}
          color={vendorColor}
        />
        <StatCard
          icon={Monitor}
          label="Type"
          value={device.type || '—'}
          color="bg-blue-500/20 text-blue-500"
        />
        <StatCard
          icon={Clock}
          label="Last Polled"
          value={formatRelative(device.lastPolledAt)}
          color="bg-yellow-500/20 text-yellow-500"
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid grid-cols-5 w-fit">
          <TabsTrigger value="overview" className="gap-2">
            <Activity className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="ports" className="gap-2">
            <Plug className="h-4 w-4" />
            Portlar
            {interfaces.length > 0 && (
              <span className="ml-1 text-[10px] bg-muted rounded px-1">{interfaces.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="snmp" className="gap-2">
            <Network className="h-4 w-4" />
            SNMP
          </TabsTrigger>
          <TabsTrigger value="topology" className="gap-2">
            <Link2 className="h-4 w-4" />
            Topoloji
            {topologyLinks.length > 0 && (
              <span className="ml-1 text-[10px] bg-muted rounded px-1">{topologyLinks.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="backups" className="gap-2" onClick={() => backups.length === 0 && loadBackups()}>
            <HardDrive className="h-4 w-4" />
            Backups
            {backups.length > 0 && (
              <span className="ml-1 text-[10px] bg-muted rounded px-1">{backups.length}</span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Identity */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Server className="h-4 w-4 text-muted-foreground" />
                  Device Identity
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5">
                <InfoRow label="NMS ID" value={`#${device.nmsDeviceId}`} />
                <InfoRow label="Vendor" value={device.vendor || '—'} />
                <InfoRow label="Device Type" value={device.type || '—'} />
                <InfoRow label="Management IP" value={device.managementIp || '—'} mono />
              </CardContent>
            </Card>

            {/* Connection Status */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  Connection Status
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5">
                <div className="flex items-center justify-between py-2.5 border-b border-border/60">
                  <span className="text-sm text-muted-foreground">Connection</span>
                  <Badge className={`gap-1 ${isOnline ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                    <StatusIcon className="h-3 w-3" />
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </Badge>
                </div>
                <InfoRow label="Last Polled" value={formatDate(device.lastPolledAt)} />
                <div className="flex items-center justify-between py-2.5 border-b border-border/60">
                  <span className="text-sm text-muted-foreground">Polling</span>
                  <Badge variant={device.pollingEnabled ? 'success' : 'secondary'} className="text-xs">
                    {device.pollingEnabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
                <InfoRow label="Poll Interval" value={`${device.pollingInterval ?? 30}s`} />
              </CardContent>
            </Card>
          </div>

          {/* Health Metrics */}
          {latestHealth && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-muted-foreground" />
                  Latest Health Metrics
                  <span className="text-xs font-normal text-muted-foreground ml-auto">
                    {formatRelative(latestHealth.collectedAt)}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {latestHealth.cpuUsage != null && (
                    <div className="text-center p-3 rounded-lg bg-muted/30">
                      <Cpu className="h-5 w-5 mx-auto mb-1 text-blue-500" />
                      <p className="text-lg font-bold">{latestHealth.cpuUsage.toFixed(1)}%</p>
                      <p className="text-xs text-muted-foreground">CPU</p>
                    </div>
                  )}
                  {latestHealth.memoryUsage != null && (
                    <div className="text-center p-3 rounded-lg bg-muted/30">
                      <Activity className="h-5 w-5 mx-auto mb-1 text-green-500" />
                      <p className="text-lg font-bold">{latestHealth.memoryUsage.toFixed(1)}%</p>
                      <p className="text-xs text-muted-foreground">Memory</p>
                    </div>
                  )}
                  {latestHealth.temperature != null && (
                    <div className="text-center p-3 rounded-lg bg-muted/30">
                      <Thermometer className="h-5 w-5 mx-auto mb-1 text-orange-500" />
                      <p className="text-lg font-bold">{latestHealth.temperature.toFixed(0)}°C</p>
                      <p className="text-xs text-muted-foreground">Temp</p>
                    </div>
                  )}
                  {latestHealth.uptimeSeconds != null && (
                    <div className="text-center p-3 rounded-lg bg-muted/30">
                      <Clock className="h-5 w-5 mx-auto mb-1 text-purple-500" />
                      <p className="text-lg font-bold">{formatUptime(latestHealth.uptimeSeconds)}</p>
                      <p className="text-xs text-muted-foreground">Uptime</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Interface Summary */}
          {interfaces.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Plug className="h-4 w-4 text-muted-foreground" />
                  Interface Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5">
                <div className="flex gap-6">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                    <span className="text-sm">{activeInterfaces} aktif</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    <span className="text-sm">{downInterfaces} sorunlu</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-gray-400" />
                    <span className="text-sm">{interfaces.length - activeInterfaces - downInterfaces} pasif</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Ports Tab */}
        <TabsContent value="ports" className="space-y-4">
          {interfaces.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Plug className="h-10 w-10 opacity-30 mb-3" />
                <p className="text-sm">Port bilgisi bulunamadı</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Plug className="h-4 w-4 text-muted-foreground" />
                    Port / Arayüz Listesi
                  </CardTitle>
                  <div className="flex items-center gap-4">
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                        {activeInterfaces} aktif
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                        {downInterfaces} kapalı
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
                        {monitoredIds.size} izleniyor
                      </span>
                    </div>
                    {monitoredDirty && (
                      <Button
                        size="sm"
                        className="h-7 text-xs gap-1 bg-orange-500 hover:bg-orange-600 text-white"
                        onClick={saveMonitored}
                        disabled={savingMonitored}
                      >
                        {savingMonitored ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                        Kaydet
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide w-10">
                          <input
                            type="checkbox"
                            className="rounded"
                            checked={monitoredIds.size === interfaces.filter(i => i.adminStatus === 'up').length}
                            onChange={(e) => {
                              const adminUpIds = interfaces.filter(i => i.adminStatus === 'up').map(i => i.id);
                              setMonitoredIds(e.target.checked ? new Set(adminUpIds) : new Set());
                              setMonitoredDirty(true);
                            }}
                            title="Tüm aktif portları seç"
                          />
                        </th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Port</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Admin</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Oper</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Hız</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          <span className="flex items-center gap-1"><ArrowDown className="h-3 w-3 text-blue-500" />Gelen</span>
                        </th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          <span className="flex items-center gap-1"><ArrowUp className="h-3 w-3 text-orange-500" />Giden</span>
                        </th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Hatalar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {interfaces
                        .slice()
                        .sort((a, b) => {
                          // Monitored first, then by oper status, then name
                          const aM = monitoredIds.has(a.id) ? 0 : 1;
                          const bM = monitoredIds.has(b.id) ? 0 : 1;
                          if (aM !== bM) return aM - bM;
                          if (a.operStatus === 'up' && b.operStatus !== 'up') return -1;
                          if (a.operStatus !== 'up' && b.operStatus === 'up') return 1;
                          return a.interfaceName.localeCompare(b.interfaceName);
                        })
                        .map((iface) => {
                          const totalErrors = (iface.inErrors || 0) + (iface.outErrors || 0);
                          const isUp = iface.operStatus === 'up';
                          const isMonitored = monitoredIds.has(iface.id);
                          return (
                            <tr key={iface.id} className={`border-b border-border/50 transition-colors ${
                              isMonitored ? 'bg-orange-500/5 hover:bg-orange-500/10' :
                              isUp ? 'hover:bg-muted/20' : 'opacity-50 hover:bg-muted/10'
                            }`}>
                              <td className="px-4 py-2.5">
                                <input
                                  type="checkbox"
                                  className="rounded"
                                  checked={isMonitored}
                                  onChange={() => toggleMonitored(iface.id)}
                                />
                              </td>
                              <td className="px-4 py-2.5 font-mono text-xs font-semibold">
                                <span className="flex items-center gap-1.5">
                                  {isMonitored && <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" title="İzleniyor" />}
                                  {iface.interfaceName}
                                </span>
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`flex items-center gap-1 text-xs ${iface.adminStatus === 'up' ? 'text-green-500' : 'text-muted-foreground'}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${iface.adminStatus === 'up' ? 'bg-green-500' : 'bg-gray-400'}`} />
                                  {iface.adminStatus}
                                </span>
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`flex items-center gap-1 text-xs font-semibold ${isUp ? 'text-green-500' : 'text-red-500'}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${isUp ? 'bg-green-500' : 'bg-red-500'}`} />
                                  {iface.operStatus}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatSpeed(iface.speed)}</td>
                              <td className="px-4 py-2.5 text-xs text-muted-foreground">{iface.description || '—'}</td>
                              <td className="px-4 py-2.5 text-xs text-blue-500">{formatBytes(iface.inOctets)}</td>
                              <td className="px-4 py-2.5 text-xs text-orange-500">{formatBytes(iface.outOctets)}</td>
                              <td className="px-4 py-2.5 text-xs">
                                {totalErrors > 0 ? (
                                  <span className="text-red-500 font-semibold">{totalErrors}</span>
                                ) : (
                                  <span className="text-muted-foreground">0</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* SNMP Tab */}
        <TabsContent value="snmp" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Network className="h-4 w-4 text-muted-foreground" />
                  SNMP Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5">
                <InfoRow label="SNMP Version" value={device.snmpVersion || 'v2c'} />
                <InfoRow label="SNMP Port" value={`${device.snmpPort ?? 161}`} />
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-muted-foreground">Community String</span>
                  <span className="font-mono text-sm font-semibold">••••••••</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-muted-foreground" />
                  Polling Details
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5">
                <InfoRow label="Polling Interval" value={`${device.pollingInterval ?? 30} seconds`} />
                <InfoRow label="Polling Status" value={device.pollingEnabled ? 'Active' : 'Disabled'} />
                <InfoRow label="Last Poll" value={formatDate(device.lastPolledAt)} />
                <InfoRow label="Last Poll (Relative)" value={formatRelative(device.lastPolledAt)} />
              </CardContent>
            </Card>
          </div>

          {/* Health History */}
          {healthMetrics.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  Health History (last {healthMetrics.length} readings)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-2 text-muted-foreground">Time</th>
                        <th className="text-left px-4 py-2 text-muted-foreground">CPU</th>
                        <th className="text-left px-4 py-2 text-muted-foreground">Memory</th>
                        <th className="text-left px-4 py-2 text-muted-foreground">Temp</th>
                        <th className="text-left px-4 py-2 text-muted-foreground">Uptime</th>
                      </tr>
                    </thead>
                    <tbody>
                      {healthMetrics.map((m) => (
                        <tr key={m.id} className="border-b border-border/50 hover:bg-muted/20">
                          <td className="px-4 py-2 text-muted-foreground">{formatDate(m.collectedAt)}</td>
                          <td className="px-4 py-2">{m.cpuUsage != null ? `${m.cpuUsage.toFixed(1)}%` : '—'}</td>
                          <td className="px-4 py-2">{m.memoryUsage != null ? `${m.memoryUsage.toFixed(1)}%` : '—'}</td>
                          <td className="px-4 py-2">{m.temperature != null ? `${m.temperature.toFixed(0)}°C` : '—'}</td>
                          <td className="px-4 py-2">{formatUptime(m.uptimeSeconds)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Backups Tab */}
        <TabsContent value="backups" className="space-y-4">
          {/* Trigger buttons */}
          <div className="flex items-center gap-3">
            <Button size="sm" className="gap-2 bg-orange-500 hover:bg-orange-600 text-white" onClick={() => triggerBackup('Running Config')} disabled={triggering}>
              {triggering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Running Config Backup
            </Button>
            <Button size="sm" variant="outline" className="gap-2" onClick={() => triggerBackup('Startup Config')} disabled={triggering}>
              {triggering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Startup Config Backup
            </Button>
            <Button size="sm" variant="ghost" className="gap-2" onClick={loadBackups} disabled={backupsLoading}>
              <RefreshCw className={`h-4 w-4 ${backupsLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {/* Trigger result */}
          {triggerResult && (
            <div className={`flex items-start gap-2 p-3 rounded-lg text-sm border ${
              triggerResult.ok
                ? 'bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400'
                : 'bg-destructive/10 border-destructive/30 text-destructive'
            }`}>
              {triggerResult.ok ? <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" /> : <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />}
              <span>{triggerResult.msg}</span>
              <button className="ml-auto opacity-60 hover:opacity-100" onClick={() => setTriggerResult(null)}><X className="h-3.5 w-3.5" /></button>
            </div>
          )}

          {/* Backup error */}
          {backupError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4" />{backupError}
            </div>
          )}

          {/* Backup list */}
          {backupsLoading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : backups.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <HardDrive className="h-10 w-10 opacity-30 mb-3" />
                <p className="text-sm">Henüz backup alınmamış</p>
                <p className="text-xs mt-1 opacity-60">Yukarıdaki butonlardan backup alabilirsiniz</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                  Config Backups
                  <span className="ml-auto text-xs font-normal text-muted-foreground">{backups.length} kayıt</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Tür</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Boyut</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Açıklama</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Tarih</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backups.map((b) => {
                      const sizeNum = parseInt(b.sizeBytes || '0');
                      const sizeLabel = sizeNum >= 1024 ? `${(sizeNum/1024).toFixed(1)} KB` : `${sizeNum} B`;
                      return (
                        <tr key={b.id} className="border-b border-border/50 hover:bg-muted/20">
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="text-xs">{b.backupType}</Badge>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{sizeLabel}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{b.description || '—'}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(b.createdAt)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Görüntüle"
                                onClick={() => viewBackupConfig(b)} disabled={viewLoading}>
                                {viewLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Sil"
                                onClick={() => deleteBackup(b.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Topology Tab */}
        <TabsContent value="topology" className="space-y-4">
          {topologyLinks.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Link2 className="h-10 w-10 opacity-30 mb-3" />
                <p className="text-sm">LLDP/CDP komşu bilgisi bulunamadı</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-muted-foreground" />
                  LLDP/CDP Neighbors
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Local Port</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Remote Device</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Remote Port</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Protocol</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Last Seen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topologyLinks.map((link) => (
                        <tr key={link.id} className="border-b border-border/50 hover:bg-muted/20">
                          <td className="px-4 py-2.5 font-mono text-xs">{link.localInterface}</td>
                          <td className="px-4 py-2.5 font-semibold">{link.remoteDeviceName}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{link.remoteInterface}</td>
                          <td className="px-4 py-2.5">
                            <Badge variant="outline" className="text-xs uppercase">{link.protocol}</Badge>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatRelative(link.lastSeenAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Backup Config Viewer Modal */}
      {viewBackup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <h2 className="font-semibold">{viewBackup.type}</h2>
                <p className="text-xs text-muted-foreground">{formatDate(viewBackup.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1" onClick={() =>
                  downloadConfig(viewBackup.config, `${device?.name}-${viewBackup.type.replace(/ /g,'-')}-${viewBackup.createdAt.slice(0,10)}.txt`)
                }>
                  <Download className="h-3.5 w-3.5" />Download
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setViewBackup(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <pre className="text-xs font-mono whitespace-pre-wrap text-foreground leading-relaxed">
                {viewBackup.config || 'No configuration content stored.'}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
