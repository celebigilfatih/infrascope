'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Server,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  Wifi,
  Eye,
  Pencil,
} from 'lucide-react';
import Link from 'next/link';

interface NmsDevice {
  id: string;          // InfraScope CUID
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
  latestHealth: {
    cpuUsage: number | null;
    memoryUsage: number | null;
    temperature: number | null;
    collectedAt: string;
  } | null;
  portDownCount: number;
}

export default function NmsDevicesPage() {
  const [devices, setDevices] = useState<NmsDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/integrations/nms/devices');
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to load devices');
      } else {
        setDevices(data.devices || []);
      }
    } catch (e: any) {
      setError('Failed to load NMS devices: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remove "${name}" from NMS monitoring?`)) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/integrations/nms/devices/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setDevices(prev => prev.filter(d => d.id !== id));
      }
    } finally {
      setDeleting(null);
    }
  };

  const formatLastPolled = (ts: string | null) => {
    if (!ts) return 'Never';
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const getConnectionStatus = (device: NmsDevice): string => {
    if (!device.pollingEnabled) return 'disabled';
    if (!device.lastPolledAt) return 'unknown';
    const diffMs = Date.now() - new Date(device.lastPolledAt).getTime();
    return diffMs < 3 * 60 * 1000 ? 'online' : 'offline';
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'online':
        return <Badge variant="success" className="gap-1 text-xs"><CheckCircle className="h-3 w-3" />Online</Badge>;
      case 'offline':
        return <Badge variant="destructive" className="gap-1 text-xs"><XCircle className="h-3 w-3" />Offline</Badge>;
      case 'disabled':
        return <Badge variant="outline" className="gap-1 text-xs text-muted-foreground"><XCircle className="h-3 w-3" />Disabled</Badge>;
      default:
        return <Badge variant="secondary" className="gap-1 text-xs"><Wifi className="h-3 w-3" />Unknown</Badge>;
    }
  };

  const filtered = devices.filter(d => {
    const status = getConnectionStatus(d);
    if (filterStatus && status !== filterStatus) return false;
    if (search && !d.name.toLowerCase().includes(search.toLowerCase()) &&
        !(d.managementIp || '').includes(search)) return false;
    return true;
  });

  const online = devices.filter(d => getConnectionStatus(d) === 'online').length;
  const offline = devices.filter(d => getConnectionStatus(d) !== 'online').length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Switches</h1>
          <p className="text-muted-foreground text-sm">
            {devices.length} devices &bull;{' '}
            <span className="text-green-500">{online} online</span>{' '}&bull;{' '}
            <span className="text-red-500">{offline} offline</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadDevices} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" asChild className="gap-2 bg-orange-500 hover:bg-orange-600 text-white">
            <Link href="/integrations/nms/add-device">
              <Plus className="h-4 w-4" />
              Add Device
            </Link>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name or IP..."
            className="pl-8"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="h-9 px-3 rounded-md border border-input bg-background text-sm"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="">All Status</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Server className="h-14 w-14 opacity-25 mb-4" />
              <p className="font-medium">No devices found</p>
              <Button variant="outline" size="sm" className="mt-3" asChild>
                <Link href="/integrations/nms/add-device">Add first device</Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">IP Address</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Vendor</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Last Polled</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">CPU / Mem</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Port Issues</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(device => (
                    <tr key={device.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Server className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="font-medium">{device.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{device.managementIp || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{device.vendor || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{device.type || '—'}</td>
                      <td className="px-4 py-3">{statusBadge(getConnectionStatus(device))}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatLastPolled(device.lastPolledAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {device.latestHealth ? (
                          <span className="text-muted-foreground">
                            {device.latestHealth.cpuUsage != null ? `CPU ${device.latestHealth.cpuUsage.toFixed(0)}%` : '—'}
                            {device.latestHealth.memoryUsage != null ? ` / Mem ${device.latestHealth.memoryUsage.toFixed(0)}%` : ''}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {device.portDownCount > 0 ? (
                          <Badge variant="destructive" className="gap-1 text-xs">
                            <AlertTriangle className="h-3 w-3" />
                            {device.portDownCount} down
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 w-[120px]">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-primary"
                            asChild
                            title="View device"
                          >
                            <Link href={`/integrations/nms/devices/${device.id}`}>
                              <Eye className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-primary"
                            asChild
                            title="Edit device"
                          >
                            <Link href={`/integrations/nms/devices/${device.id}/edit`}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(device.id, device.name)}
                            disabled={deleting === device.id}
                            title="Delete device"
                          >
                            {deleting === device.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
