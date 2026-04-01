'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Server,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Wifi,
  WifiOff,
  RefreshCw,
  Plus,
  Clock,
} from 'lucide-react';
import Link from 'next/link';

interface NmsDevice {
  id: number;
  name: string;
  ip_address: string;
  vendor: string;
  device_type: string;
  connection_status: string;
  last_polled: string | null;
}

interface NmsAlarm {
  id: number;
  device_id: number;
  device_name: string;
  alarm_code: string;
  message: string;
  severity: string;
  status: string;
  created_at: string;
}

export default function NmsOverviewPage() {
  const [devices, setDevices] = useState<NmsDevice[]>([]);
  const [alarms, setAlarms] = useState<NmsAlarm[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [nmsReachable, setNmsReachable] = useState<boolean | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [devRes, alarmRes] = await Promise.allSettled([
        fetch('/api/integrations/nms/network-devices'),
        fetch('/api/integrations/nms/alarms?status=active'),
      ]);

      if (devRes.status === 'fulfilled' && devRes.value.ok) {
        const data = await devRes.value.json();
        setDevices(data.data || []);
        setNmsReachable(true);
      } else {
        setNmsReachable(false);
      }

      if (alarmRes.status === 'fulfilled' && alarmRes.value.ok) {
        const data = await alarmRes.value.json();
        setAlarms(data.data || []);
      }
    } catch {
      setNmsReachable(false);
    } finally {
      setLoading(false);
      setLastUpdate(new Date());
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onlineCount = devices.filter(d => d.connection_status === 'online').length;
  const offlineCount = devices.filter(d => d.connection_status === 'offline' || d.connection_status === 'unreachable').length;
  const criticalAlarms = alarms.filter(a => a.severity === 'critical').length;

  const formatLastPolled = (ts: string | null) => {
    if (!ts) return 'Never';
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'online': return 'text-green-500';
      case 'offline':
      case 'unreachable': return 'text-red-500';
      default: return 'text-yellow-500';
    }
  };

  const severityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'warning': return 'warning' as any;
      default: return 'secondary';
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">NMS Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Network monitoring overview &bull; Last update:{' '}
            {loading ? 'updating...' : `${lastUpdate.toLocaleTimeString()}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" asChild className="gap-2">
            <Link href="/integrations/nms/add-device">
              <Plus className="h-4 w-4" />
              Add Device
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Devices</p>
                <p className="text-3xl font-bold mt-1">{devices.length}</p>
              </div>
              <Server className="h-8 w-8 text-blue-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Online</p>
                <p className="text-3xl font-bold mt-1 text-green-500">{onlineCount}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Offline</p>
                <p className="text-3xl font-bold mt-1 text-red-500">{offlineCount}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Critical Alarms</p>
                <p className="text-3xl font-bold mt-1 text-red-500">{criticalAlarms}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card className={nmsReachable === false ? 'border-destructive' : ''}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">NMS Service</p>
                <p className={`text-lg font-bold mt-1 ${nmsReachable ? 'text-green-500' : nmsReachable === false ? 'text-red-500' : 'text-muted-foreground'}`}>
                  {nmsReachable === null ? 'Checking...' : nmsReachable ? 'Connected' : 'Disconnected'}
                </p>
              </div>
              {nmsReachable ? (
                <Wifi className="h-8 w-8 text-green-500 opacity-80" />
              ) : (
                <WifiOff className="h-8 w-8 text-red-500 opacity-80" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Connected Devices Table */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Server className="h-4 w-4 text-blue-500" />
                  Connected Devices
                </CardTitle>
                <Badge variant="secondary" className="text-xs">{devices.length} total</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : devices.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Server className="h-12 w-12 opacity-30 mb-3" />
                  <p className="text-sm">No devices found</p>
                  <Button variant="outline" size="sm" className="mt-3" asChild>
                    <Link href="/integrations/nms/add-device">Add first device</Link>
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Device Name</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">IP Address</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Last Polled</th>
                      </tr>
                    </thead>
                    <tbody>
                      {devices.map((device) => (
                        <tr key={device.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-medium">{device.name}</td>
                          <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{device.ip_address}</td>
                          <td className="px-4 py-3">
                            <span className={`flex items-center gap-1.5 text-xs font-medium ${statusColor(device.connection_status)}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${device.connection_status === 'online' ? 'bg-green-500' : 'bg-red-500'}`} />
                              {device.connection_status || 'unknown'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatLastPolled(device.last_polled)}
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

        {/* Recent Alarms */}
        <div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Recent Alarms
              </CardTitle>
            </CardHeader>
            <CardContent>
              {alarms.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <CheckCircle className="h-10 w-10 text-green-500 opacity-60 mb-2" />
                  <p className="text-sm">No active alarms</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {alarms.slice(0, 10).map((alarm) => (
                    <div key={alarm.id} className="p-3 rounded-lg border border-border bg-muted/20">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{alarm.device_name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{alarm.message}</p>
                        </div>
                        <Badge variant={severityColor(alarm.severity)} className="text-[10px] shrink-0">
                          {alarm.severity}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
