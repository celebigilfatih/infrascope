'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Bell,
  ShieldCheck,
  Clock,
} from 'lucide-react';

interface NmsAlarm {
  id: number;
  device_id: number;
  device_name: string;
  alarm_code: string;
  message: string;
  severity: string;
  status: string;
  created_at: string;
  acknowledged_at?: string | null;
  resolved_at?: string | null;
}

type StatusFilter = 'active' | 'acknowledged' | 'resolved' | 'all';
type SeverityFilter = 'all' | 'critical' | 'warning' | 'info';

export default function NmsAlarmsPage() {
  const [alarms, setAlarms] = useState<NmsAlarm[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');

  const loadAlarms = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: statusFilter === 'all' ? '' : statusFilter });
      const res = await fetch(`/api/integrations/nms/alarms?${params}`);
      if (res.ok) {
        const data = await res.json();
        setAlarms(data.data || []);
      }
    } catch {
      setAlarms([]);
    } finally {
      setLoading(false);
      setLastUpdate(new Date());
    }
  }, [statusFilter]);

  useEffect(() => {
    loadAlarms();
  }, [loadAlarms]);

  const handleAction = async (id: number, action: 'acknowledge' | 'resolve') => {
    setActionLoading(id);
    try {
      await fetch('/api/integrations/nms/alarms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      await loadAlarms();
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = alarms.filter(a =>
    severityFilter === 'all' ? true : a.severity === severityFilter
  );

  const critical = alarms.filter(a => a.severity === 'critical').length;
  const warning = alarms.filter(a => a.severity === 'warning').length;

  const severityBadge = (s: string) => {
    switch (s) {
      case 'critical': return 'destructive';
      case 'warning': return 'warning' as any;
      default: return 'secondary';
    }
  };

  const formatDate = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const statusBadge = (s: string) => {
    switch (s) {
      case 'active': return <Badge variant="destructive" className="text-[10px]">Aktif</Badge>;
      case 'acknowledged': return <Badge variant="secondary" className="text-[10px]">Onaylandı</Badge>;
      case 'resolved': return <Badge variant="success" className="text-[10px]">Çözüldü</Badge>;
      default: return <Badge variant="secondary" className="text-[10px]">{s}</Badge>;
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">SNMP Alarmları</h1>
          <p className="text-muted-foreground text-sm">
            Son güncelleme: {loading ? 'yükleniyor...' : lastUpdate.toLocaleTimeString('tr-TR')}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadAlarms} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Kritik</p>
              <p className="text-3xl font-bold mt-1 text-red-500">{critical}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-red-500 opacity-70" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Uyarı</p>
              <p className="text-3xl font-bold mt-1 text-yellow-500">{warning}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-yellow-500 opacity-70" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Toplam</p>
              <p className="text-3xl font-bold mt-1">{alarms.length}</p>
            </div>
            <Bell className="h-8 w-8 text-muted-foreground opacity-70" />
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            Alarm Listesi
            <Badge variant="secondary" className="ml-auto">{filtered.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Filter bar */}
          <div className="flex items-center gap-2 px-4 pb-3 border-b border-border flex-wrap">
            <span className="text-xs text-muted-foreground mr-1">Durum:</span>
            {(['active', 'acknowledged', 'resolved', 'all'] as StatusFilter[]).map(s => (
              <Button
                key={s}
                size="sm"
                variant={statusFilter === s ? 'default' : 'outline'}
                className="h-7 text-xs px-3"
                onClick={() => setStatusFilter(s)}
              >
                {s === 'active' ? 'Aktif' : s === 'acknowledged' ? 'Onaylandı' : s === 'resolved' ? 'Çözüldü' : 'Tümü'}
              </Button>
            ))}
            <span className="text-xs text-muted-foreground ml-3 mr-1">Şiddet:</span>
            {(['all', 'critical', 'warning', 'info'] as SeverityFilter[]).map(s => (
              <Button
                key={s}
                size="sm"
                variant={severityFilter === s ? 'default' : 'outline'}
                className="h-7 text-xs px-3"
                onClick={() => setSeverityFilter(s)}
              >
                {s === 'all' ? 'Tümü' : s === 'critical' ? 'Kritik' : s === 'warning' ? 'Uyarı' : 'Bilgi'}
              </Button>
            ))}
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <CheckCircle className="h-12 w-12 text-green-500 opacity-40 mb-3" />
              <p className="text-sm">Alarm bulunamadı</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Cihaz</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Mesaj</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Şiddet</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Durum</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Tarih</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((alarm) => (
                    <tr key={alarm.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-xs">{alarm.device_name}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs max-w-xs truncate">{alarm.message}</td>
                      <td className="px-4 py-3">
                        <Badge variant={severityBadge(alarm.severity)} className="text-[10px]">
                          {alarm.severity === 'critical' ? 'Kritik' : alarm.severity === 'warning' ? 'Uyarı' : 'Bilgi'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">{statusBadge(alarm.status)}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(alarm.created_at)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {alarm.status === 'active' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-[10px] px-2 gap-1"
                              disabled={actionLoading === alarm.id}
                              onClick={() => handleAction(alarm.id, 'acknowledge')}
                            >
                              {actionLoading === alarm.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                              Onayla
                            </Button>
                          )}
                          {alarm.status !== 'resolved' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-[10px] px-2 gap-1 text-green-600 border-green-500/50 hover:bg-green-50"
                              disabled={actionLoading === alarm.id}
                              onClick={() => handleAction(alarm.id, 'resolve')}
                            >
                              {actionLoading === alarm.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                              Çöz
                            </Button>
                          )}
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
