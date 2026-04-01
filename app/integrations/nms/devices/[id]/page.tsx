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
  MapPin,
  Settings2,
  Network,
  Activity,
  AlertTriangle,
  Pencil,
  RefreshCw,
  Monitor,
} from 'lucide-react';
import Link from 'next/link';

interface NmsDevice {
  id: number;
  name: string;
  ip_address: string;
  vendor: string | null;
  device_type: string | null;
  snmp_version: string;
  snmp_port: number;
  snmp_community: string;
  ssh_username: string | null;
  ssh_password: string | null;
  polling_enabled: boolean;
  polling_interval: number;
  connection_status: string;
  last_polled: string | null;
  last_online: string | null;
  location: string | null;
  notes: string | null;
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
  if (!value || value === '-') return null;
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

  const [device, setDevice] = useState<NmsDevice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDevice = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/integrations/nms/network-devices/${deviceId}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to load device');
      } else {
        setDevice(data.data);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (deviceId) loadDevice();
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

  const isOnline = device?.connection_status === 'online';
  const StatusIcon = isOnline ? Wifi : WifiOff;
  const vendorColor = device?.vendor?.toLowerCase() === 'cisco'
    ? 'bg-blue-500/20 text-blue-500'
    : device?.vendor?.toLowerCase() === 'hp'
    ? 'bg-purple-500/20 text-purple-500'
    : 'bg-gray-500/20 text-gray-500';

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
              {/* Device Icon */}
              <div className={`relative`}>
                <div className={`p-4 rounded-2xl ${isOnline ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                  <Server className={`h-10 w-10 ${isOnline ? 'text-green-500' : 'text-red-500'}`} />
                </div>
                {/* Status dot */}
                <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-card ${
                  isOnline ? 'bg-green-500' : 'bg-red-500'
                }`} />
              </div>

              <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{device.name}</h1>
                <div className="flex items-center gap-3 mt-1">
                  <span className="font-mono text-sm text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">
                    {device.ip_address}
                  </span>
                  <Badge className={`gap-1 ${isOnline ? 'bg-green-500/20 text-green-500 hover:bg-green-500/30 border-0' : 'bg-red-500/20 text-red-500 hover:bg-red-500/30 border-0'}`}>
                    <StatusIcon className="h-3 w-3" />
                    {device.connection_status || 'Unknown'}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={loadDevice} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Refresh
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
          value={isOnline ? 'Online' : 'Offline'}
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
          value={device.device_type || '—'}
          color="bg-blue-500/20 text-blue-500"
        />
        <StatCard
          icon={Clock}
          label="Last Polled"
          value={formatRelative(device.last_polled)}
          color="bg-yellow-500/20 text-yellow-500"
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid grid-cols-3 w-fit">
          <TabsTrigger value="overview" className="gap-2">
            <Activity className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="snmp" className="gap-2">
            <Network className="h-4 w-4" />
            SNMP
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings2 className="h-4 w-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Location & Identity */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  Location & Identity
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5">
                <InfoRow label="Location" value={device.location || '—'} />
                <InfoRow label="Device ID" value={`#${device.id}`} />
                <InfoRow label="Vendor" value={device.vendor || '—'} />
                <InfoRow label="Device Type" value={device.device_type || '—'} />
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
                    {device.connection_status || 'Unknown'}
                  </Badge>
                </div>
                <InfoRow label="Last Polled" value={formatDate(device.last_polled)} />
                <InfoRow label="Last Online" value={formatDate(device.last_online)} />
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-muted-foreground">Polling</span>
                  <Badge variant={device.polling_enabled ? 'success' : 'secondary'} className="text-xs">
                    {device.polling_enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Notes */}
          {device.notes && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{device.notes}</p>
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
                <InfoRow label="SNMP Version" value={device.snmp_version || 'v2c'} />
                <InfoRow label="SNMP Port" value={`${device.snmp_port || 161}`} />
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-muted-foreground">Community String</span>
                  <span className="font-mono text-sm font-semibold">
                    {device.snmp_community ? '••••••••' : '—'}
                  </span>
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
                <InfoRow label="Polling Interval" value={`${device.polling_interval || 300} seconds`} />
                <InfoRow label="Polling Status" value={device.polling_enabled ? 'Active' : 'Disabled'} />
                <InfoRow label="Last Poll" value={formatDate(device.last_polled)} />
                <InfoRow label="Last Poll (Relative)" value={formatRelative(device.last_polled)} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Device Configuration</CardTitle>
            </CardHeader>
            <CardContent className="px-5">
              <InfoRow label="Device ID" value={`#${device.id}`} />
              <InfoRow label="Device Name" value={device.name} />
              <InfoRow label="IP Address" value={device.ip_address} mono />
              <InfoRow label="Vendor" value={device.vendor || '—'} />
              <InfoRow label="Device Type" value={device.device_type || '—'} />
              <InfoRow label="Location" value={device.location || '—'} />
              <InfoRow label="SNMP Version" value={device.snmp_version || 'v2c'} />
              <InfoRow label="SNMP Port" value={`${device.snmp_port || 161}`} />
              <InfoRow label="Polling Enabled" value={device.polling_enabled ? 'Yes' : 'No'} />
              <InfoRow label="Polling Interval" value={`${device.polling_interval || 300}s`} />
              {(device.ssh_username || device.ssh_password) && (
                <>
                  <div className="py-2.5 border-b border-border/60">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">SSH Credentials</p>
                    <InfoRow label="SSH Username" value={device.ssh_username || '—'} />
                    <InfoRow label="SSH Password" value={device.ssh_password ? '••••••••' : '—'} />
                  </div>
                </>
              )}
              {device.notes && <InfoRow label="Notes" value={device.notes} />}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
