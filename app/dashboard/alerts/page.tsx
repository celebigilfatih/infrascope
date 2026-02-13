'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertTriangle, AlertCircle, AlertOctagon, CheckCircle, Clock, RefreshCw,
  Search, Play, Shield, Bell,
} from 'lucide-react';

interface AlarmEventData {
  id: string;
  alarmId: string;
  severity: string;
  title: string;
  message: string;
  sourceIp: string | null;
  destIp: string | null;
  deviceName: string | null;
  acknowledged: boolean;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  notifiedAt: string | null;
  notifyChannel: string | null;
  createdAt: string;
  alarm: {
    code: string;
    name: string;
    category: string;
    description: string | null;
  };
}

const SEVERITY_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: typeof AlertOctagon }> = {
  ALARM_CRITICAL: { label: 'Kritik', color: 'text-red-500', bgColor: 'bg-red-500/20', icon: AlertOctagon },
  ALARM_HIGH: { label: 'Yuksek', color: 'text-orange-500', bgColor: 'bg-orange-500/20', icon: AlertTriangle },
  ALARM_MEDIUM: { label: 'Orta', color: 'text-yellow-500', bgColor: 'bg-yellow-500/20', icon: AlertCircle },
  ALARM_LOW: { label: 'Dusuk', color: 'text-blue-500', bgColor: 'bg-blue-500/20', icon: Bell },
  ALARM_INFO: { label: 'Bilgi', color: 'text-gray-400', bgColor: 'bg-gray-400/20', icon: Bell },
};

const CATEGORY_MAP: Record<string, string> = {
  CONFIG_ACCESS: 'Config & Access',
  SECURITY: 'Security',
  RISK_ANOMALY: 'Risk & Anomaly',
  OPERATIONAL: 'Operational',
  SOC_CORRELATION: 'SOC Correlation',
};

export default function AlertsDashboardPage() {
  const [events, setEvents] = useState<AlarmEventData[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (filter === 'unacknowledged') params.set('acknowledged', 'false');
      else if (filter !== 'all') params.set('severity', filter);

      const res = await fetch(`/api/alarms?${params}`);
      const data = await res.json();
      if (data.success) {
        setEvents(data.data || []);
        setStats(data.stats || {});
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error('Fetch events error:', err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // Auto-refresh events every 60 seconds
  useEffect(() => {
    const interval = setInterval(fetchEvents, 60000);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  // Auto-run alarm check every 5 minutes (background)
  useEffect(() => {
    const autoCheck = async () => {
      try {
        await fetch('/api/alarms/check');
        fetchEvents();
      } catch (err) {
        // silent background check
      }
    };
    // Initial check after 10 seconds
    const initialTimeout = setTimeout(autoCheck, 10000);
    // Then every 5 minutes
    const interval = setInterval(autoCheck, 5 * 60 * 1000);
    return () => { clearTimeout(initialTimeout); clearInterval(interval); };
  }, [fetchEvents]);

  const runAlarmCheck = async () => {
    setChecking(true);
    setMessage(null);
    try {
      const res = await fetch('/api/alarms/check', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const s = data.summary;
        setMessage({
          text: `Alarm taramasi tamamlandi: ${s.total} alarm kontrol edildi, ${s.triggered} tetiklendi, ${s.skippedCooldown} cooldown, ${s.errors} hata`,
          type: s.triggered > 0 ? 'error' : 'success',
        });
        fetchEvents();
      } else {
        setMessage({ text: data.error || 'Tarama hatasi', type: 'error' });
      }
    } catch (err) {
      setMessage({ text: 'Alarm tarama hatasi', type: 'error' });
    } finally {
      setChecking(false);
    }
  };

  const acknowledgeEvent = async (id: string) => {
    try {
      const res = await fetch('/api/alarms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id], acknowledged: true }),
      });
      const data = await res.json();
      if (data.success) {
        setEvents((prev: AlarmEventData[]) =>
          prev.map((e: AlarmEventData) =>
            e.id === id ? { ...e, acknowledged: true, acknowledgedAt: new Date().toISOString(), acknowledgedBy: 'admin' } : e
          )
        );
      }
    } catch (err) {
      console.error('Acknowledge error:', err);
    }
  };

  const acknowledgeAll = async () => {
    const unackedIds = events.filter((e: AlarmEventData) => !e.acknowledged).map((e: AlarmEventData) => e.id);
    if (unackedIds.length === 0) return;
    try {
      const res = await fetch('/api/alarms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: unackedIds, acknowledged: true }),
      });
      const data = await res.json();
      if (data.success) fetchEvents();
    } catch (err) {
      console.error('Acknowledge all error:', err);
    }
  };

  const filteredEvents = events.filter((e: AlarmEventData) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      e.title.toLowerCase().includes(term) ||
      (e.message || '').toLowerCase().includes(term) ||
      (e.alarm?.code || '').toLowerCase().includes(term) ||
      (e.sourceIp || '').includes(term) ||
      (e.deviceName || '').toLowerCase().includes(term)
    );
  });

  // Pagination
  const totalPages = Math.ceil(filteredEvents.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedEvents = filteredEvents.slice(startIndex, endIndex);

  const criticalCount = stats['ALARM_CRITICAL'] || 0;
  const highCount = stats['ALARM_HIGH'] || 0;
  const totalUnacked = Object.values(stats).reduce((sum: number, v: number) => sum + v, 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Alarm Merkezi</h1>
          <p className="text-muted-foreground">Sistem uyarilari ve alarm yonetimi</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={runAlarmCheck} disabled={checking}>
            {checking ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            {checking ? 'Taraniyor...' : 'Alarm Tara'}
          </Button>
          <Button variant="outline" size="icon" onClick={fetchEvents} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-lg flex items-center gap-2 text-sm ${message.type === 'success' ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'}`}>
          {message.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertOctagon className="h-4 w-4" />}
          {message.text}
          <Button variant="ghost" size="sm" className="ml-auto h-6" onClick={() => setMessage(null)}>Kapat</Button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {(['ALARM_CRITICAL', 'ALARM_HIGH', 'ALARM_MEDIUM', 'ALARM_LOW'] as const).map((sev) => {
          const cfg = SEVERITY_CONFIG[sev];
          const Icon = cfg.icon;
          const count = stats[sev] || 0;
          return (
            <Card key={sev}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${cfg.bgColor}`}>
                    <Icon className={`h-5 w-5 ${cfg.color}`} />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{cfg.label}</p>
                    <p className="text-2xl font-bold">{count}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filter & Search */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex gap-2">
          {[
            { key: 'all', label: 'Tumu' },
            { key: 'unacknowledged', label: 'Bekleyen' },
            { key: 'ALARM_CRITICAL', label: 'Kritik' },
            { key: 'ALARM_HIGH', label: 'Yuksek' },
            { key: 'ALARM_MEDIUM', label: 'Orta' },
            { key: 'ALARM_LOW', label: 'Dusuk' },
          ].map((f) => (
            <Button key={f.key} variant={filter === f.key ? 'default' : 'outline'} size="sm" onClick={() => setFilter(f.key)}>
              {f.label}
            </Button>
          ))}
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Alarm ara..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        {events.some((e: AlarmEventData) => !e.acknowledged) && (
          <Button variant="outline" size="sm" onClick={acknowledgeAll}>
            <CheckCircle className="h-4 w-4 mr-1" /> Tumunu Onayla
          </Button>
        )}
      </div>

      {/* Alarm Events Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Alarm Olaylari
            <Badge variant="secondary">{total}</Badge>
          </CardTitle>
          <CardDescription>{startIndex + 1}-{Math.min(endIndex, filteredEvents.length)} / {filteredEvents.length} alarm gosteriliyor</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Alarm bulunamadi</p>
              <p className="text-sm mt-1">Alarm taramasi baslatmak icin &quot;Alarm Tara&quot; butonuna tiklayin</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Seviye</TableHead>
                    <TableHead className="whitespace-nowrap">Alarm</TableHead>
                    <TableHead className="whitespace-nowrap">Kategori</TableHead>
                    <TableHead className="whitespace-nowrap">Kaynak IP</TableHead>
                    <TableHead className="whitespace-nowrap">Cihaz</TableHead>
                    <TableHead className="whitespace-nowrap">Zaman</TableHead>
                    <TableHead className="whitespace-nowrap">Durum</TableHead>
                    <TableHead className="whitespace-nowrap">Bildirim</TableHead>
                    <TableHead className="whitespace-nowrap"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedEvents.map((event: AlarmEventData) => {
                    const sev = SEVERITY_CONFIG[event.severity] || SEVERITY_CONFIG['ALARM_INFO'];
                    const Icon = sev.icon;
                    return (
                      <TableRow key={event.id} className={event.acknowledged ? 'opacity-60' : ''}>
                        <TableCell>
                          <Badge className={`${sev.bgColor} ${sev.color} border-0 text-xs`}>
                            <Icon className="h-3 w-3 mr-1" />
                            {sev.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-xs">
                            <p className="font-medium text-sm truncate">{event.title}</p>
                            <p className="text-xs text-muted-foreground font-mono">{event.alarm?.code}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{CATEGORY_MAP[event.alarm?.category] || event.alarm?.category}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{event.sourceIp || '-'}</TableCell>
                        <TableCell className="text-xs">{event.deviceName || '-'}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            {new Date(event.createdAt).toLocaleString('tr-TR')}
                          </div>
                        </TableCell>
                        <TableCell>
                          {event.acknowledged ? (
                            <Badge variant="outline" className="text-green-500 text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Onaylandi
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">Bekliyor</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {event.notifiedAt ? (
                            <Badge variant="outline" className="text-xs">Email</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {!event.acknowledged && (
                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => acknowledgeEvent(event.id)}>
                              Onayla
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
        
        {/* Pagination Controls */}
        {filteredEvents.length > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {startIndex + 1}-{Math.min(endIndex, filteredEvents.length)} / {filteredEvents.length} kayit
              </span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="border rounded px-2 py-1 text-sm"
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
            
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
              >
                Ilk
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Onceki
              </Button>
              <span className="text-sm px-3">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Sonraki
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
              >
                Son
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
