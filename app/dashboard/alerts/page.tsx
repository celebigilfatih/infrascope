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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertTriangle, AlertCircle, AlertOctagon, CheckCircle, Clock, RefreshCw,
  Search, Play, Shield, Bell, Trash2, BarChart3, Eye, User, Router, Monitor,
  ChevronDown, ChevronRight, Code2, MapPin,
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
  rawData: Array<Record<string, unknown>> | null;
  alarm: {
    code: string;
    name: string;
    category: string;
    description: string | null;
    source?: string;
  };
}

const SEVERITY_CONFIG: Record<string, { label: string; color: string; bgColor: string; headerBg: string; icon: typeof AlertOctagon }> = {
  ALARM_CRITICAL: { label: 'Kritik', color: 'text-red-500', bgColor: 'bg-red-500/20', headerBg: 'bg-red-600', icon: AlertOctagon },
  ALARM_HIGH: { label: 'Yuksek', color: 'text-orange-500', bgColor: 'bg-orange-500/20', headerBg: 'bg-orange-500', icon: AlertTriangle },
  ALARM_MEDIUM: { label: 'Orta', color: 'text-yellow-500', bgColor: 'bg-yellow-500/20', headerBg: 'bg-amber-500', icon: AlertCircle },
  ALARM_LOW: { label: 'Dusuk', color: 'text-blue-500', bgColor: 'bg-blue-500/20', headerBg: 'bg-blue-500', icon: Bell },
  ALARM_INFO: { label: 'Bilgi', color: 'text-gray-400', bgColor: 'bg-gray-400/20', headerBg: 'bg-slate-500', icon: Bell },
};

const CATEGORY_MAP: Record<string, string> = {
  CONFIG_ACCESS: 'Config & Access',
  SECURITY: 'Security',
  RISK_ANOMALY: 'Risk & Anomaly',
  OPERATIONAL: 'Operational',
  SOC_CORRELATION: 'SOC Correlation',
};

const CATEGORY_EMOJI: Record<string, string> = {
  CONFIG_ACCESS: '🔧',
  SECURITY: '🛡️',
  RISK_ANOMALY: '⚡',
  OPERATIONAL: '⚙️',
  SOC_CORRELATION: '🔍',
};

type SourceType = 'all' | 'firewall' | 'switch' | 'vmware';

const SOURCE_CONFIG: Record<SourceType, { label: string; color: string; bgActive: string; icon: typeof Shield }> = {
  all:      { label: 'Tümü',    color: 'text-foreground',  bgActive: 'bg-slate-700',    icon: Shield   },
  firewall: { label: 'Firewall', color: 'text-orange-500', bgActive: 'bg-orange-600',   icon: Shield   },
  switch:   { label: 'Switch',   color: 'text-blue-500',   bgActive: 'bg-blue-600',     icon: Router   },
  vmware:   { label: 'VMware',   color: 'text-purple-500', bgActive: 'bg-purple-600',   icon: Monitor  },
};

function getAlarmSource(alarm?: { code: string; source?: string }): 'firewall' | 'switch' | 'vmware' {
  // Prefer explicit source from alarm definition
  if (alarm?.source === 'vmware') return 'vmware';
  if (alarm?.source === 'fortigate-sslvpn' || alarm?.source === 'fortianalyzer') return 'firewall';
  // Fall back to code-prefix matching
  const c = (alarm?.code || '').toUpperCase();
  if (c.startsWith('VM_') || c.startsWith('SNAPSHOT_') || c === 'MULTIPLE_SNAPSHOTS') return 'vmware';
  if (
    c.startsWith('NMS_') ||
    c.startsWith('SNMP_') ||
    c.startsWith('PORT_') ||
    c.startsWith('DEVICE_')
  ) return 'switch';
  return 'firewall';
}

interface ParsedAlarmMessage {
  description: string;
  eventCount: string;
  keyValueRows: { key: string; value: string }[];
  bodySections: { title: string; lines: string[] }[];
  otherEvents: string[];
  recommendedAction: string;
}

function parseAlarmMessage(message: string, alarmDescription?: string): ParsedAlarmMessage {
  const result: ParsedAlarmMessage = {
    description: '',
    eventCount: '',
    keyValueRows: [],
    bodySections: [],
    otherEvents: [],
    recommendedAction: '',
  };
  if (!message) return result;

  const paragraphs = message.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];

    // Skip paragraph that matches the alarm description (already shown separately)
    if (alarmDescription && para.trim() === alarmDescription.trim()) continue;

    if (para.startsWith('Onerilen Aksiyon:')) {
      result.recommendedAction = para.replace(/^Onerilen Aksiyon:\s*/, '').trim();
      continue;
    }
    if (para.match(/^Tespit edilen olay sayisi:/)) {
      result.eventCount = para.trim();
      continue;
    }
    if (para.match(/^Diger (olaylar|kullanicilar|islemler):/)) {
      const lines = para.split('\n').slice(1);
      result.otherEvents = lines.map((l) => l.replace(/^[-•·]\s*/, '').trim()).filter(Boolean);
      continue;
    }

    const lines = para.split('\n');
    // Section with a titled header (first line ends with ':')
    if (lines.length > 1 && lines[0].trim().match(/.*\(.*\):$|.*:$/)) {
      result.bodySections.push({ title: lines[0].trim().replace(/:$/, ''), lines: lines.slice(1) });
      continue;
    }
    // Key-value pairs: majority of lines match "Key: Value"
    const kvLines = lines.filter((l) => { const ci = l.indexOf(': '); return ci > 0 && ci < 35; });
    if (kvLines.length >= 2 && kvLines.length >= lines.length * 0.55) {
      for (const line of lines) {
        const ci = line.indexOf(': ');
        if (ci > 0 && ci < 35) result.keyValueRows.push({ key: line.slice(0, ci).trim(), value: line.slice(ci + 2).trim() });
      }
      continue;
    }
    // Fallback: description
    if (!result.description) result.description = para;
  }
  return result;
}

export default function AlertsDashboardPage() {
  const [events, setEvents] = useState<AlarmEventData[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [filter, setFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState<SourceType>('all');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [rawLogExpanded, setRawLogExpanded] = useState(false);

  // Cleanup states
  const [cleanupStatsOpen, setCleanupStatsOpen] = useState(false);
  const [cleanupStats, setCleanupStats] = useState<any>(null);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupDays, setCleanupDays] = useState(7);
  const [cleanupAcknowledgedOnly, setCleanupAcknowledgedOnly] = useState(true);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupDryRun, setCleanupDryRun] = useState(true);

  // Detail view state
  const [selectedEvent, setSelectedEvent] = useState<AlarmEventData | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  // Policy enrichment for FW_POLICY_CHANGED alarms
  const [policyData, setPolicyData] = useState<{ host: string; policies: any[]; total: number } | null>(null);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [policySearch, setPolicySearch] = useState('');
  const [policyExpanded, setPolicyExpanded] = useState(false);
  // Address object enrichment for ADDRESS_OBJECT_CHANGED alarms
  const [addressData, setAddressData] = useState<{ host: string; addresses: any[]; total: number } | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [addressSearch, setAddressSearch] = useState('');
  const [addressExpanded, setAddressExpanded] = useState(false);
  // Port enrichment for NMS_PORT_DOWN alarms
  const [portData, setPortData] = useState<{ device: any; port: any; neighbors: any[] } | null>(null);
  const [portLoading, setPortLoading] = useState(false);
  const [portError, setPortError] = useState<string | null>(null);
  // Discard/Whitelist dialog state
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discardReason, setDiscardReason] = useState('');
  const [discardLoading, setDiscardLoading] = useState(false);
  // Track which event IDs are currently being acknowledged
  const [acknowledgingIds, setAcknowledgingIds] = useState<Set<string>>(new Set());

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

  // Fetch cleanup statistics
  const fetchCleanupStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/alarms/cleanup?daysOld=${cleanupDays}`, { method: 'GET' });
      const data = await res.json();
      if (data.success) {
        setCleanupStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to fetch cleanup stats:', err);
    }
  }, [cleanupDays]);

  // Run cleanup
  const runCleanup = async () => {
    setCleanupLoading(true);
    try {
      const params = new URLSearchParams({
        daysOld: cleanupDays.toString(),
        acknowledged: cleanupAcknowledgedOnly.toString(),
        dryRun: cleanupDryRun.toString(),
      });

      const res = await fetch(`/api/alarms/cleanup?${params}`, { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        const deletedCount = cleanupDryRun ? data.wouldDelete : data.deleted;
        setMessage({
          text: cleanupDryRun
            ? `Would delete ${deletedCount} alarms (dry run)`
            : `Deleted ${deletedCount} alarms successfully`,
          type: 'success',
        });

        if (!cleanupDryRun) {
          fetchEvents();
          setCleanupOpen(false);
        } else {
          setCleanupStats(data);
        }
      } else {
        setMessage({ text: `Error: ${data.error}`, type: 'error' });
      }
    } catch (err) {
      setMessage({ text: 'Cleanup failed', type: 'error' });
    } finally {
      setCleanupLoading(false);
    }
  };

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
    setAcknowledgingIds(prev => new Set(prev).add(id));
    try {
      const res = await fetch('/api/alarms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id], acknowledged: true, acknowledgedBy: 'admin' }),
      });
      const data = await res.json();
      if (data.success) {
        // Update local state immediately
        setEvents((prev: AlarmEventData[]) =>
          prev.map((e: AlarmEventData) =>
            e.id === id ? { ...e, acknowledged: true, acknowledgedAt: new Date().toISOString(), acknowledgedBy: 'admin' } : e
          )
        );
        setMessage({ text: 'Alarm onaylandi', type: 'success' });
        setTimeout(() => setMessage(null), 3000);
        // Also refresh from server to ensure consistency
        fetchEvents();
      } else {
        setMessage({ text: `Onaylama hatasi: ${data.error || 'Bilinmeyen hata'}`, type: 'error' });
      }
    } catch (err) {
      console.error('Acknowledge error:', err);
      setMessage({ text: 'Onaylama baglanti hatasi', type: 'error' });
    } finally {
      setAcknowledgingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
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

  // Add to whitelist (discard alarm)
  const addToWhitelist = async () => {
    if (!selectedEvent || !discardReason.trim()) return;
    
    setDiscardLoading(true);
    try {
      // Determine which field to whitelist based on alarm code
      let field = 'sourceIp';
      if (selectedEvent.alarm.code === 'SSLVPN_AUTH_FAILED') {
        field = 'user';
      } else if (selectedEvent.destIp && selectedEvent.alarm.code.includes('DNS')) {
        field = 'destIp';
      }
      
      const value = field === 'sourceIp' ? selectedEvent.sourceIp 
                : field === 'destIp' ? selectedEvent.destIp 
                : selectedEvent.deviceName || '';
      
      // Validate value is not null/empty before calling API
      if (!value) {
        setMessage({ text: `Cannot whitelist: No ${field} value available for this alarm`, type: 'error' });
        setDiscardLoading(false);
        return;
      }
      
      const res = await fetch('/api/alarms/whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alarmCode: selectedEvent.alarm.code,
          field,
          value,
          reason: discardReason.trim(),
          createdBy: 'admin',
        }),
      });
      
      const data = await res.json();
      if (data.success) {
        setMessage({ text: 'Alarm whitelisted successfully', type: 'success' });
        setDiscardOpen(false);
        setDiscardReason('');
        fetchEvents();
      } else {
        setMessage({ text: `Error: ${data.error}`, type: 'error' });
      }
    } catch (err) {
      console.error('Whitelist error:', err);
      setMessage({ text: 'Failed to add to whitelist', type: 'error' });
    } finally {
      setDiscardLoading(false);
    }
  };

  const fetchAddresses = async () => {
    setAddressLoading(true);
    setAddressError(null);
    setAddressData(null);
    try {
      const res = await fetch('/api/integrations/fortigate?type=cmdb-addresses');
      const data = await res.json();
      if (data.success) {
        setAddressData(data);
        setAddressExpanded(true);
      } else {
        setAddressError(data.error || 'Adres nesneleri alinamadi');
      }
    } catch (err: any) {
      setAddressError(err.message);
    } finally {
      setAddressLoading(false);
    }
  };

  const fetchPorts = async () => {
    setPortLoading(true);
    setPortError(null);
    setPortData(null);
    try {
      // Extract device name and port name from the alarm message
      // Format: "Port Down: GigabitEthernet1/0/22 on B_BLOK_KAT_1_POE"
      const match = selectedEvent?.title.match(/Port Down:\s+(.+?)\s+on\s+(.+)/);
      if (!match) {
        setPortError('Could not parse port name from alarm');
        setPortLoading(false);
        return;
      }
      const portName = match[1].trim();
      const deviceName = match[2].trim();
      
      // Find device ID by name
      const devRes = await fetch('/api/integrations/nms/devices?enabled=true');
      const devData = await devRes.json();
      const device = devData.devices?.find((d: any) => d.name === deviceName);
      
      if (!device) {
        setPortError(`Device "${deviceName}" not found in NMS`);
        setPortLoading(false);
        return;
      }

      const res = await fetch(`/api/integrations/nms/devices/${device.id}/ports/${encodeURIComponent(portName)}`);
      const data = await res.json();
      if (data.port) {
        setPortData(data);
      } else {
        setPortError(data.error || 'Port details not found');
      }
    } catch (err: any) {
      setPortError(err.message);
    } finally {
      setPortLoading(false);
    }
  };

  const fetchPolicies = async () => {
    setPolicyLoading(true);
    setPolicyError(null);
    setPolicyData(null);
    try {
      const res = await fetch('/api/integrations/fortigate?type=cmdb-policies');
      const data = await res.json();
      if (data.success) {
        setPolicyData(data);
        setPolicyExpanded(true);
      } else {
        setPolicyError(data.error || 'Politika listesi alınamadı');
      }
    } catch {
      setPolicyError('Bağlantı hatası');
    } finally {
      setPolicyLoading(false);
    }
  };

  const filteredEvents = events.filter((e: AlarmEventData) => {
    if (sourceFilter !== 'all' && getAlarmSource(e.alarm) !== sourceFilter) return false;
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Alarm Merkezi</h1>
          <p className="text-muted-foreground">Sistem uyarilari ve alarm yonetimi</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchCleanupStats();
              setCleanupStatsOpen(true);
            }}
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            Cleanup Stats
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCleanupOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Cleanup
          </Button>
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
        {/* Source category filter */}
        <div className="flex gap-2">
          {(['all', 'firewall', 'switch', 'vmware'] as SourceType[]).map((src) => {
            const cfg = SOURCE_CONFIG[src];
            const Icon = cfg.icon;
            const count = src === 'all'
              ? events.length
              : events.filter((e: AlarmEventData) => getAlarmSource(e.alarm) === src).length;
            return (
              <Button
                key={src}
                size="sm"
                variant={sourceFilter === src ? 'default' : 'outline'}
                className={sourceFilter === src ? `${cfg.bgActive} text-white border-0` : ''}
                onClick={() => { setSourceFilter(src); setCurrentPage(1); }}
              >
                <Icon className="h-3.5 w-3.5 mr-1.5" />
                {cfg.label}
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                  sourceFilter === src ? 'bg-white/20' : 'bg-muted'
                }`}>{count}</span>
              </Button>
            );
          })}
        </div>

        {/* Severity filter */}
        <div className="flex gap-2">
          {[
            { key: 'all', label: 'Tumu' },
            { key: 'unacknowledged', label: 'Bekleyen' },
            { key: 'ALARM_CRITICAL', label: 'Kritik' },
            { key: 'ALARM_HIGH', label: 'Yuksek' },
            { key: 'ALARM_MEDIUM', label: 'Orta' },
            { key: 'ALARM_LOW', label: 'Dusuk' },
          ].map((f) => (
            <Button key={f.key} variant={filter === f.key ? 'default' : 'outline'} size="sm" onClick={() => { setFilter(f.key); setCurrentPage(1); }}>
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
                    <TableHead className="whitespace-nowrap">Zaman</TableHead>
                    <TableHead className="whitespace-nowrap">Kaynak</TableHead>
                    <TableHead className="whitespace-nowrap">Alarm</TableHead>
                    <TableHead className="whitespace-nowrap">Kategori</TableHead>
                    <TableHead className="whitespace-nowrap">Seviye</TableHead>
                    <TableHead className="whitespace-nowrap">Kaynak IP</TableHead>
                    <TableHead className="whitespace-nowrap">Cihaz</TableHead>
                    <TableHead className="whitespace-nowrap">Durum</TableHead>
                    <TableHead className="whitespace-nowrap">Onaylayan</TableHead>
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
                        <TableCell className="text-xs whitespace-nowrap">
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {new Date(event.createdAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}
                          </div>
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const src = getAlarmSource(event.alarm);
                            if (src === 'vmware') return <Badge variant="outline" className="text-xs text-purple-500 border-purple-500/40"><Monitor className="h-3 w-3 mr-1" />VMware</Badge>;
                            if (src === 'switch') return <Badge variant="outline" className="text-xs text-blue-500 border-blue-500/40"><Router className="h-3 w-3 mr-1" />Switch</Badge>;
                            return <Badge variant="outline" className="text-xs text-orange-500 border-orange-500/40"><Shield className="h-3 w-3 mr-1" />Firewall</Badge>;
                          })()}
                        </TableCell>
                        <TableCell>
                          <div className="max-w-md">
                            <p className="font-medium text-sm truncate">{event.title}</p>
                            <p className="text-xs text-muted-foreground font-mono">{event.alarm?.code}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{CATEGORY_MAP[event.alarm?.category] || event.alarm?.category}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={`${sev.bgColor} ${sev.color} border-0 text-xs`}>
                            <Icon className="h-3 w-3 mr-1" />
                            {sev.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{event.sourceIp || '-'}</TableCell>
                        <TableCell className="text-xs max-w-[150px] truncate" title={event.deviceName || '-'}>{event.deviceName || '-'}</TableCell>
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
                          {event.acknowledgedBy ? (
                            <div className="flex items-center gap-1 text-xs">
                              <User className="h-3 w-3 text-muted-foreground" />
                              <span>{event.acknowledgedBy}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
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
                          <div className="flex items-center gap-1">
                            {!event.acknowledged && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 w-8 p-0"
                                disabled={acknowledgingIds.has(event.id)}
                                onClick={() => acknowledgeEvent(event.id)}
                                title="Onayla"
                              >
                                {acknowledgingIds.has(event.id) ? (
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                  <CheckCircle className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => {
                                setSelectedEvent(event);
                                setRawLogExpanded(false);
                                setPolicyData(null);
                                setPolicyError(null);
                                setPolicySearch('');
                                setPolicyExpanded(false);
                                setDetailOpen(true);
                              }}
                              title="Detayları Göster"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
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

      {/* Cleanup Statistics Dialog */}
      <Dialog open={cleanupStatsOpen} onOpenChange={setCleanupStatsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Alarm Cleanup Statistics</DialogTitle>
            <DialogDescription>
              Storage and data retention information
            </DialogDescription>
          </DialogHeader>

          {cleanupStats ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
                  <p className="text-xs text-muted-foreground">Total Alarms</p>
                  <p className="text-2xl font-bold">{cleanupStats?.total || 0}</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
                  <p className="text-xs text-muted-foreground">Old Alarms</p>
                  <p className="text-2xl font-bold">{cleanupStats?.old || 0}</p>
                </div>
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
                  <p className="text-xs text-muted-foreground">Acknowledged</p>
                  <p className="text-2xl font-bold text-green-600">{cleanupStats?.oldAcknowledged || 0}</p>
                </div>
                <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20">
                  <p className="text-xs text-muted-foreground">Unacknowledged</p>
                  <p className="text-2xl font-bold text-orange-600">{cleanupStats?.oldUnacknowledged || 0}</p>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
                <p className="text-sm font-medium mb-2">Storage Usage</p>
                <p className="text-2xl font-bold">{cleanupStats?.estimatedStorageMB || '0'} MB</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {cleanupStats?.percentOld || '0'}% of total alarms are older than {cleanupStats?.daysOld || 7} days
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
                <p className="text-sm font-medium mb-2">Breakdown by Severity</p>
                <div className="space-y-1 text-sm">
                  {cleanupStats?.severityBreakdown && Object.entries(cleanupStats.severityBreakdown).map(([severity, count]: [string, any]) => (
                    <div key={severity} className="flex justify-between">
                      <span>{severity}</span>
                      <span className="font-mono font-medium">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCleanupStatsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cleanup Dialog */}
      <Dialog open={cleanupOpen} onOpenChange={setCleanupOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Clean Up Old Alarms</DialogTitle>
            <DialogDescription>
              Remove alarms older than specified days to reclaim storage and improve performance
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Delete alarms older than (days)
              </label>
              <Input
                type="number"
                min="1"
                max="365"
                value={cleanupDays}
                onChange={(e) => setCleanupDays(Math.max(1, parseInt(e.target.value) || 7))}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="ackOnly"
                checked={cleanupAcknowledgedOnly}
                onChange={(e) => setCleanupAcknowledgedOnly(e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="ackOnly" className="text-sm">
                Only delete acknowledged alarms
              </label>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="dryRun"
                checked={cleanupDryRun}
                onChange={(e) => setCleanupDryRun(e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="dryRun" className="text-sm font-medium">
                Dry run (preview what would be deleted)
              </label>
            </div>

            {cleanupStats && cleanupDryRun && (
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-sm">
                <p className="font-medium text-blue-900 dark:text-blue-200 mb-1">Preview</p>
                <p className="text-blue-700 dark:text-blue-300">
                  Would delete {cleanupStats.wouldDelete} alarms
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCleanupOpen(false)}
              disabled={cleanupLoading}
            >
              Cancel
            </Button>
            {cleanupDryRun ? (
              <Button onClick={runCleanup} disabled={cleanupLoading}>
                {cleanupLoading ? 'Previewing...' : 'Preview'}
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={runCleanup}
                disabled={cleanupLoading}
              >
                {cleanupLoading ? 'Deleting...' : 'Confirm Delete'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alarm Detail Dialog — redesigned */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
          {/* Hidden accessible title */}
          <DialogTitle className="sr-only">Alarm Detaylari</DialogTitle>
          <DialogDescription className="sr-only">{selectedEvent?.alarm?.code}</DialogDescription>

          {selectedEvent && (() => {
            const sev = SEVERITY_CONFIG[selectedEvent.severity] || SEVERITY_CONFIG['ALARM_INFO'];
            const Icon = sev.icon;
            const parsed = parseAlarmMessage(selectedEvent.message || '', selectedEvent.alarm?.description || '');
            const emoji = CATEGORY_EMOJI[selectedEvent.alarm?.category] || '🔔';

            return (
              <div>
                {/* Colored header band */}
                <div className={`${sev.headerBg} text-white px-6 py-5 rounded-t-lg`}>
                  <h2 className="text-xl font-bold">{emoji} {selectedEvent.alarm?.name}</h2>
                  <div className="mt-2">
                    <span className="inline-flex items-center gap-1.5 bg-white/25 text-white text-xs font-semibold px-2.5 py-1 rounded">
                      <Icon className="h-3 w-3" />
                      {sev.label} &bull; {CATEGORY_MAP[selectedEvent.alarm?.category] || selectedEvent.alarm?.category}
                    </span>
                  </div>
                </div>

                <div className="px-6 py-5 space-y-5">

                  {/* Alarm Basligı */}
                  <section>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Alarm Başlığı</p>
                    <p className="font-semibold text-sm leading-snug">{selectedEvent.title}</p>
                  </section>

                  {/* Açıklama — first as requested */}
                  {(selectedEvent.alarm?.description || parsed.description) && (
                    <section>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Açıklama</p>
                      <p className="text-sm">{selectedEvent.alarm?.description || parsed.description}</p>
                      {parsed.eventCount && (
                        <p className="text-xs italic text-muted-foreground mt-1">{parsed.eventCount}</p>
                      )}
                    </section>
                  )}

                  {/* Olay Detayları — key-value table */}
                  {parsed.keyValueRows.filter(r => r.key !== 'Giris Zamani' && r.key !== 'Olay Zamani').length > 0 && (
                    <section>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Olay Detayları</p>
                      <div className="rounded-lg border overflow-hidden">
                        <table className="w-full text-sm">
                          <tbody>
                            {parsed.keyValueRows.filter(r => r.key !== 'Giris Zamani' && r.key !== 'Olay Zamani').map(({ key, value }, i) => (
                              <tr key={i} className="border-b last:border-0">
                                <td className="px-4 py-2.5 text-muted-foreground w-[38%] bg-muted/20 align-top">{key}</td>
                                <td className="px-4 py-2.5 break-words">{value}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}

                  {/* Body sections (config change / webfilter structured content) */}
                  {parsed.bodySections.map((section, i) => (
                    <section key={i}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">{section.title}</p>
                      <div className="text-xs leading-relaxed bg-muted/20 rounded-lg px-4 py-3 font-mono whitespace-pre-wrap">
                        {section.lines.join('\n')}
                      </div>
                    </section>
                  ))}

                  {/* Metadata 2x2 grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-muted/30">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Alarm Kodu</p>
                      <p className="font-mono text-sm font-bold">{selectedEvent.alarm?.code}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/30">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Zaman</p>
                      {(() => {
                        // Show actual event time (Giris Zamani / Zaman / Olay Zamani) if available from parsed message
                        const eventTimeRow = parsed.keyValueRows.find(r => 
                          r.key === 'Giris Zamani' || r.key === 'Zaman' || r.key === 'Olay Zamani'
                        );
                        if (eventTimeRow) {
                          return (
                            <>
                              <p className="text-sm font-bold">{eventTimeRow.value}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">Tespit: {new Date(selectedEvent.createdAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}</p>
                            </>
                          );
                        }
                        return <p className="text-sm font-bold">{new Date(selectedEvent.createdAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}</p>;
                      })()}
                    </div>
                    <div className="p-3 rounded-lg bg-muted/30">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Kaynak IP</p>
                      <p className="font-mono text-sm font-bold">{selectedEvent.sourceIp || '-'}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/30">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Cihaz</p>
                      <p className="text-sm font-bold">{selectedEvent.deviceName || '-'}</p>
                    </div>
                  </div>

                  {/* Diger Olaylar */}
                  {parsed.otherEvents.length > 0 && (
                    <section>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Diğer Olaylar</p>
                      <ul className="space-y-1">
                        {parsed.otherEvents.map((evt, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="text-muted-foreground shrink-0 mt-0.5">&bull;</span>
                            <span>{evt}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {/* Bildirim + Onay */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="p-3 rounded-lg bg-muted/30">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Bildirim Durumu</p>
                      {selectedEvent.notifiedAt ? (
                        <div className="space-y-0.5">
                          <p><span className="text-muted-foreground text-xs">Kanal:</span> {selectedEvent.notifyChannel || 'email'}</p>
                          <p><span className="text-muted-foreground text-xs">Zaman:</span> {new Date(selectedEvent.notifiedAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}</p>
                        </div>
                      ) : (
                        <p className="text-muted-foreground text-xs">Bildirim gonderilmedi</p>
                      )}
                    </div>
                    <div className={`p-3 rounded-lg ${
                      selectedEvent.acknowledged ? 'bg-green-50 dark:bg-green-900/20' : 'bg-orange-50 dark:bg-orange-900/20'
                    }`}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Onay Durumu</p>
                      {selectedEvent.acknowledged ? (
                        <div className="space-y-0.5">
                          <p className="text-green-700 dark:text-green-300 text-xs font-semibold">✓ Onaylandi</p>
                          {selectedEvent.acknowledgedBy && (
                            <p className="text-xs"><span className="text-muted-foreground">Onaylayan:</span> {selectedEvent.acknowledgedBy}</p>
                          )}
                          {selectedEvent.acknowledgedAt && (
                            <p className="text-xs"><span className="text-muted-foreground">Zaman:</span> {new Date(selectedEvent.acknowledgedAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-orange-600 text-xs font-semibold">Henuz onaylanmadi</p>
                      )}
                    </div>
                  </div>

                  {/* Onerilen Aksiyon — amber highlight box */}
                  {parsed.recommendedAction && (
                    <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm">⚡</span>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-amber-800 dark:text-amber-300">Önerilen Aksiyon</p>
                      </div>
                      <p className="text-sm text-amber-700 dark:text-amber-200">{parsed.recommendedAction}</p>
                    </div>
                  )}

                  {/* Firewall Policy Enrichment — only for FW_POLICY_CHANGED */}
                  {selectedEvent.alarm?.code === 'FW_POLICY_CHANGED' && (
                    <section className="rounded-lg border overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2.5 bg-orange-50 dark:bg-orange-900/20 border-b">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4 text-orange-500" />
                          <span className="text-xs font-bold uppercase tracking-widest text-orange-700 dark:text-orange-300">
                            Firewall Politika Listesi
                          </span>
                          {policyData && (
                            <span className="text-xs text-muted-foreground">({policyData.host} • {policyData.total} politika)</span>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={policyLoading}
                          onClick={fetchPolicies}
                        >
                          {policyLoading
                            ? <><RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />Yükleniyor...</>
                            : policyData
                            ? <><RefreshCw className="h-3 w-3 mr-1.5" />Yenile</>
                            : <><Eye className="h-3 w-3 mr-1.5" />Politikaları Getir</>}
                        </Button>
                      </div>

                      {policyError && (
                        <div className="px-4 py-3 text-xs text-red-600 bg-red-50 dark:bg-red-900/20">
                          <AlertOctagon className="h-3.5 w-3.5 inline mr-1" />{policyError}
                        </div>
                      )}

                      {policyData && policyExpanded && (
                        <div className="p-3 space-y-2">
                          <Input
                            placeholder="Politika ara... (ID, isim, kaynak, hedef)"
                            value={policySearch}
                            onChange={(e) => setPolicySearch(e.target.value)}
                            className="h-7 text-xs"
                          />
                          <div className="max-h-64 overflow-y-auto">
                            <table className="w-full text-xs border-collapse">
                              <thead>
                                <tr className="bg-muted/40 text-left">
                                  <th className="px-2 py-1.5 font-semibold border-b">#</th>
                                  <th className="px-2 py-1.5 font-semibold border-b">Ad</th>
                                  <th className="px-2 py-1.5 font-semibold border-b">Kaynak Ara./ Adres</th>
                                  <th className="px-2 py-1.5 font-semibold border-b">Hedef Ara./ Adres</th>
                                  <th className="px-2 py-1.5 font-semibold border-b">Servis</th>
                                  <th className="px-2 py-1.5 font-semibold border-b">Aksiyon</th>
                                  <th className="px-2 py-1.5 font-semibold border-b">Durum</th>
                                </tr>
                              </thead>
                              <tbody>
                                {policyData.policies
                                  .filter((p: any) => {
                                    if (!policySearch) return true;
                                    const t = policySearch.toLowerCase();
                                    return (
                                      String(p.policyid).includes(t) ||
                                      (p.name || '').toLowerCase().includes(t) ||
                                      (p.srcintf || []).some((x: any) => x.name?.toLowerCase().includes(t)) ||
                                      (p.dstintf || []).some((x: any) => x.name?.toLowerCase().includes(t)) ||
                                      (p.srcaddr || []).some((x: any) => x.name?.toLowerCase().includes(t)) ||
                                      (p.dstaddr || []).some((x: any) => x.name?.toLowerCase().includes(t)) ||
                                      (p.service || []).some((x: any) => x.name?.toLowerCase().includes(t))
                                    );
                                  })
                                  .map((p: any) => (
                                    <tr key={p.policyid} className="border-b hover:bg-muted/10">
                                      <td className="px-2 py-1.5 font-mono text-muted-foreground">{p.policyid}</td>
                                      <td className="px-2 py-1.5 max-w-[120px] truncate" title={p.name}>{p.name || <span className="text-muted-foreground italic">isimsiz</span>}</td>
                                      <td className="px-2 py-1.5">
                                        <div className="text-[10px] text-muted-foreground">{(p.srcintf || []).map((x: any) => x.name).join(', ')}</div>
                                        <div>{(p.srcaddr || []).map((x: any) => x.name).join(', ')}</div>
                                      </td>
                                      <td className="px-2 py-1.5">
                                        <div className="text-[10px] text-muted-foreground">{(p.dstintf || []).map((x: any) => x.name).join(', ')}</div>
                                        <div>{(p.dstaddr || []).map((x: any) => x.name).join(', ')}</div>
                                      </td>
                                      <td className="px-2 py-1.5 max-w-[100px] truncate">{(p.service || []).map((x: any) => x.name).join(', ')}</td>
                                      <td className="px-2 py-1.5">
                                        <span className={`font-semibold ${
                                          p.action === 'accept' ? 'text-green-600' : 'text-red-500'
                                        }`}>{p.action === 'accept' ? '✓ İzin' : '✕ Engel'}</span>
                                      </td>
                                      <td className="px-2 py-1.5">
                                        <span className={p.status === 'enable' ? 'text-green-600' : 'text-muted-foreground'}>
                                          {p.status === 'enable' ? 'Aktif' : 'Pasif'}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </section>
                  )}

                  {/* Address Object Enrichment — only for ADDRESS_OBJECT_CHANGED */}
                  {selectedEvent.alarm?.code === 'ADDRESS_OBJECT_CHANGED' && (
                    <section className="rounded-lg border overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2.5 bg-purple-50 dark:bg-purple-900/20 border-b">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-purple-500" />
                          <span className="text-xs font-bold uppercase tracking-widest text-purple-700 dark:text-purple-300">
                            Adres Nesne Listesi
                          </span>
                          {addressData && (
                            <span className="text-xs text-muted-foreground">({addressData.host} • {addressData.total} nesne)</span>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={addressLoading}
                          onClick={fetchAddresses}
                        >
                          {addressLoading
                            ? <><RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />Yükleniyor...</>
                            : addressData
                            ? <><RefreshCw className="h-3 w-3 mr-1.5" />Yenile</>
                            : <><Eye className="h-3 w-3 mr-1.5" />Nesneleri Getir</>}
                        </Button>
                      </div>

                      {addressError && (
                        <div className="px-4 py-3 text-xs text-red-600 bg-red-50 dark:bg-red-900/20">
                          <AlertOctagon className="h-3.5 w-3.5 inline mr-1" />{addressError}
                        </div>
                      )}


                      {addressData && addressExpanded && (
                        <div className="p-3 space-y-2">
                          <Input
                            placeholder="Adres ara... (isim, IP, subnet, FQDN)"
                            value={addressSearch}
                            onChange={(e) => setAddressSearch(e.target.value)}
                            className="h-7 text-xs"
                          />
                          <div className="max-h-64 overflow-y-auto">
                            <table className="w-full text-xs border-collapse">
                              <thead>
                                <tr className="bg-muted/40 text-left">
                                  <th className="px-2 py-1.5 font-semibold border-b">İsim</th>
                                  <th className="px-2 py-1.5 font-semibold border-b">Tür</th>
                                  <th className="px-2 py-1.5 font-semibold border-b">Değer (IP/Subnet/FQDN)</th>
                                  <th className="px-2 py-1.5 font-semibold border-b">Arayüz</th>
                                  <th className="px-2 py-1.5 font-semibold border-b">Ülke</th>
                                </tr>
                              </thead>
                              <tbody>
                                {addressData.addresses
                                  .filter((a: any) => {
                                    if (!addressSearch) return true;
                                    const t = addressSearch.toLowerCase();
                                    return (
                                      (a.name || '').toLowerCase().includes(t) ||
                                      (a.subnet || '').toLowerCase().includes(t) ||
                                      (a.fqdn || '').toLowerCase().includes(t) ||
                                      (a.type || '').toLowerCase().includes(t)
                                    );
                                  })
                                  .map((a: any) => (
                                    <tr key={a.name} className="border-b hover:bg-muted/10">
                                      <td className="px-2 py-1.5 max-w-[140px] truncate font-medium" title={a.name}>{a.name || <span className="text-muted-foreground italic">isimsiz</span>}</td>
                                      <td className="px-2 py-1.5">
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                          a.type === 'ipmask' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                                          a.type === 'fqdn' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                                          a.type === 'geography' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' :
                                          'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                                        }`}>{a.type || '—'}</span>
                                      </td>
                                      <td className="px-2 py-1.5 font-mono text-muted-foreground">
                                        {a.subnet || a.fqdn || <span className="text-muted-foreground italic">—</span>}
                                      </td>
                                      <td className="px-2 py-1.5 text-muted-foreground">{a.interface || '—'}</td>
                                      <td className="px-2 py-1.5 text-muted-foreground">{a.country || '—'}</td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </section>
                  )}

                  {/* Port Details Enrichment — only for NMS_PORT_DOWN */}
                  {selectedEvent.alarm?.code === 'NMS_PORT_DOWN' && (
                    <section className="rounded-lg border overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2.5 bg-sky-50 dark:bg-sky-900/20 border-b">
                        <div className="flex items-center gap-2">
                          <Router className="h-4 w-4 text-sky-500" />
                          <span className="text-xs font-bold uppercase tracking-widest text-sky-700 dark:text-sky-300">
                            Port Detaylari
                          </span>
                          {portData && (
                            <span className="text-xs text-muted-foreground">({portData.device.name} • {portData.port.interfaceName})</span>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={portLoading}
                          onClick={fetchPorts}
                        >
                          {portLoading
                            ? <><RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />Yükleniyor...</>
                            : portData
                            ? <><RefreshCw className="h-3 w-3 mr-1.5" />Yenile</>
                            : <><Eye className="h-3 w-3 mr-1.5" />Port Bilgilerini Getir</>}
                        </Button>
                      </div>

                      {portError && (
                        <div className="px-4 py-3 text-xs text-red-600 bg-red-50 dark:bg-red-900/20">
                          <AlertOctagon className="h-3.5 w-3.5 inline mr-1" />{portError}
                        </div>
                      )}

                      {portData && (
                        <div className="p-3 space-y-3">
                          {/* Device Info */}
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">Cihaz:</span>{' '}
                              <span className="font-medium">{portData.device.name}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Vendor:</span>{' '}
                              <span className="font-medium">{portData.device.vendor || '—'}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Management IP:</span>{' '}
                              <span className="font-mono">{portData.device.managementIp || '—'}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Tip:</span>{' '}
                              <span>{portData.device.type || '—'}</span>
                            </div>
                          </div>

                          {/* Port Status */}
                          <div className="rounded-md border p-3 bg-muted/30">
                            <div className="text-xs font-semibold mb-2">Port Durumu</div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                              <div>
                                <span className="text-muted-foreground">Port:</span>{' '}
                                <span className="font-mono font-medium">{portData.port.interfaceName}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Admin Status:</span>{' '}
                                <span className={`font-semibold ${portData.port.adminStatus === 'up' ? 'text-green-600' : 'text-red-500'}`}>
                                  {portData.port.adminStatus === 'up' ? '✓ UP' : '✕ DOWN'}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Oper Status:</span>{' '}
                                <span className={`font-semibold ${portData.port.operStatus === 'up' ? 'text-green-600' : 'text-red-500'}`}>
                                  {portData.port.operStatus === 'up' ? '✓ UP' : '✕ DOWN'}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Speed:</span>{' '}
                                <span className="font-medium">
                                  {portData.port.speed ? `${(Number(portData.port.speed) / 1000000).toFixed(0)} Mbps` : '—'}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">MTU:</span>{' '}
                                <span>{portData.port.mtu || '—'}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Last Polled:</span>{' '}
                                <span className="font-mono text-[10px]">
                                  {portData.port.lastPolledAt ? new Date(portData.port.lastPolledAt).toLocaleString('tr-TR') : '—'}
                                </span>
                              </div>
                              <div className="col-span-2">
                                <span className="text-muted-foreground">Description:</span>{' '}
                                <span className="font-medium">{portData.port.description || '—'}</span>
                              </div>
                            </div>
                          </div>

                          {/* Error Counters */}
                          <div className="rounded-md border p-3 bg-muted/30">
                            <div className="text-xs font-semibold mb-2">Hata Sayaçlari</div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="text-center p-2 rounded bg-red-50 dark:bg-red-900/10">
                                <div className="text-muted-foreground">In Errors</div>
                                <div className="font-mono font-semibold text-red-500 text-sm">
                                  {Number(portData.port.inErrors || 0).toLocaleString()}
                                </div>
                              </div>
                              <div className="text-center p-2 rounded bg-red-50 dark:bg-red-900/10">
                                <div className="text-muted-foreground">Out Errors</div>
                                <div className="font-mono font-semibold text-red-500 text-sm">
                                  {Number(portData.port.outErrors || 0).toLocaleString()}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Traffic Stats */}
                          <div className="rounded-md border p-3 bg-muted/30">
                            <div className="text-xs font-semibold mb-2">Trafik Istatistikleri</div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-muted-foreground">In Octets:</span>{' '}
                                <span className="font-mono">
                                  {portData.port.inOctets ? `${(Number(portData.port.inOctets) / 1048576).toFixed(2)} MB` : '—'}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Out Octets:</span>{' '}
                                <span className="font-mono">
                                  {portData.port.outOctets ? `${(Number(portData.port.outOctets) / 1048576).toFixed(2)} MB` : '—'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Topology Neighbors */}
                          {portData.neighbors && portData.neighbors.length > 0 && (
                            <div className="rounded-md border p-3 bg-muted/30">
                              <div className="text-xs font-semibold mb-2">Komşu Cihazlar (LLDP/CDP)</div>
                              <div className="space-y-1">
                                {portData.neighbors.map((n: any, i: number) => (
                                  <div key={i} className="flex items-center gap-2 text-xs">
                                    <Router className="h-3 w-3 text-muted-foreground" />
                                    <span className="font-medium">{n.remoteDeviceName}</span>
                                    <span className="text-muted-foreground">→</span>
                                    <span className="font-mono text-xs">{n.remoteInterface}</span>
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                      {n.protocol}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </section>
                  )}


                  {/* Ham Log Verisi — expandable */}
                  {selectedEvent.rawData && selectedEvent.rawData.length > 0 && (() => {
                    const SKIP_FIELDS = new Set(['_index', 'esequence', 'logflag', 'checksum']);
                    const logs = selectedEvent.rawData as Array<Record<string, unknown>>;
                    return (
                      <section>
                        <button
                          type="button"
                          className="flex items-center gap-2 w-full text-left group"
                          onClick={() => setRawLogExpanded(v => !v)}
                        >
                          {rawLogExpanded
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          <Code2 className="h-3.5 w-3.5 text-muted-foreground" />
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">
                            Ham Log Verisi
                            <span className="ml-2 text-[9px] font-normal normal-case">({logs.length} kayıt)</span>
                          </p>
                        </button>

                        {rawLogExpanded && (
                          <div className="mt-2 space-y-3">
                            {logs.map((log, logIdx) => {
                              const entries = Object.entries(log).filter(
                                ([k, v]) => !SKIP_FIELDS.has(k) && v !== null && v !== undefined && v !== ''
                              );
                              if (entries.length === 0) return null;
                              return (
                                <div key={logIdx} className="rounded-lg border overflow-hidden">
                                  {logs.length > 1 && (
                                    <div className="px-3 py-1.5 bg-muted/40 text-[10px] font-semibold text-muted-foreground border-b">
                                      Kayıt {logIdx + 1}
                                    </div>
                                  )}
                                  <table className="w-full text-xs">
                                    <tbody>
                                      {entries.map(([k, v]) => (
                                        <tr key={k} className="border-b last:border-0">
                                          <td className="px-3 py-1.5 font-mono text-muted-foreground bg-muted/20 w-[38%] align-top select-all">{k}</td>
                                          <td className="px-3 py-1.5 break-all font-mono select-all">
                                            {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </section>
                    );
                  })()}

                  {/* Footer branding */}
                  <div className="text-center text-xs text-muted-foreground pt-3 border-t">
                    <p>InfraScope Alarm Management System</p>
                    <p>{new Date(selectedEvent.createdAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}</p>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex justify-end gap-2 px-6 pb-5">
                  {!selectedEvent.acknowledged && (
                    <Button
                      onClick={() => {
                        acknowledgeEvent(selectedEvent.id);
                        setSelectedEvent({ ...selectedEvent, acknowledged: true, acknowledgedAt: new Date().toISOString(), acknowledgedBy: 'admin' });
                      }}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Onayla
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => setDiscardOpen(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Discard
                  </Button>
                  <Button variant="outline" onClick={() => setDetailOpen(false)}>Kapat</Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Discard/Whitelist Dialog */}
      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Alarm'i Whitelist'e Ekle
            </DialogTitle>
            <DialogDescription>
              Bu alarm bir daha üretilmeyecek. False positive ise whitelist'e ekleyin.
            </DialogDescription>
          </DialogHeader>
          
          {selectedEvent && (
            <div className="space-y-4 py-4">
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-xs font-semibold mb-1">Alarm:</p>
                <p className="text-sm">{selectedEvent.title}</p>
              </div>
              
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-xs font-semibold mb-1">Whitelist Edilecek:</p>
                <p className="text-sm font-mono">
                  {(() => {
                    let field = 'sourceIp';
                    if (selectedEvent.alarm.code === 'SSLVPN_AUTH_FAILED') field = 'user';
                    else if (selectedEvent.destIp && selectedEvent.alarm.code.includes('DNS')) field = 'destIp';
                    
                    const value = field === 'sourceIp' ? selectedEvent.sourceIp 
                                  : field === 'destIp' ? selectedEvent.destIp 
                                  : selectedEvent.deviceName || '';
                    return `${field}: ${value || 'N/A'}`;
                  })()}
                </p>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Sebep (opsiyonel):</label>
                <textarea
                  className="w-full min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Neden whitelist'e ekliyorsunuz? (örn: Kurum içi DNS sunucusu)"
                  value={discardReason}
                  onChange={(e) => setDiscardReason(e.target.value)}
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscardOpen(false)} disabled={discardLoading}>
              İptal
            </Button>
            <Button
              variant="destructive"
              onClick={addToWhitelist}
              disabled={!discardReason.trim() || discardLoading}
            >
              {discardLoading ? 'Ekleniyor...' : 'Whitelist\'e Ekle'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
