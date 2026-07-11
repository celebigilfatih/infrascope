'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  ChevronDown, ChevronRight, Code2, MapPin, Globe, Archive, CircleCheckBig, Download, LockKeyhole,
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
  incident?: {
    id: string;
    status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'CLOSED';
    archiveState: 'HOT' | 'ARCHIVED';
    occurrenceCount: number;
    firstSeenAt: string;
    lastSeenAt: string;
    reopenCount: number;
    assignedTo: string | null;
    resolvedAt: string | null;
    closedAt: string | null;
    legalHold: boolean;
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

// Config change alarm codes that should show structured change details
const CONFIG_CHANGE_CODES = new Set([
  'CORE_CONFIG_CHANGE', 'FW_POLICY_CHANGED', 'INTERFACE_CONFIG_CHANGED',
  'CONFIG_CHANGE_AFTER_HOURS', 'ADDRESS_OBJECT_CHANGED', 'NEW_ADDRESS_OBJECT',
  'NEW_SERVICE_OBJECT', 'ADDRESS_GROUP_CHANGED', 'ROUTE_TABLE_CHANGED',
  'AUTH_SERVER_CHANGED', 'ADMIN_PRIVILEGE_CHANGE', 'ADMIN_PASSWORD_CHANGED',
  'NEW_ADMIN_USER', 'SERVICE_GROUP_CHANGED', 'NAT_POLICY_CHANGED',
  'SNAT_POOL_CHANGED', 'IPSEC_TUNNEL_CHANGED', 'SSL_VPN_SETTINGS_CHANGED',
  'SCHEDULE_OBJECT_CHANGED',
]);

// Map FortiGate attribute names to Turkish labels
const ATTR_LABELS: Record<string, string> = {
  status: 'Durum', name: 'Isim', action: 'Aksiyon', srcintf: 'Kaynak Arayuzu',
  dstintf: 'Hedef Arayuzu', srcaddr: 'Kaynak Adresi', dstaddr: 'Hedef Adresi',
  service: 'Servis', schedule: 'Zamanlama', logtraffic: 'Log Trafigi',
  nat: 'NAT', comments: 'Aciklama', groups: 'Gruplar', password: 'Sifre',
  mode: 'Mod', type: 'Tip', interface: 'Arayuz', ip: 'IP Adresi',
  allowaccess: 'Izin Verilen Erisim', mtu: 'MTU', vlanid: 'VLAN ID',
  member: 'Uye', dst: 'Hedef', src: 'Kaynak', protocol: 'Protokol',
  port: 'Port', policyid: 'Politika ID', scope: 'Kapsam', subnet: 'Alt Ag',
  fqdn: 'FQDN', primary: 'Birincil', secondary: 'Ikincil', server: 'Sunucu',
  key: 'Anahtar', secret: 'Gizli Anahtar', source_ip: 'Kaynak IP',
  auth_type: 'Kimlik Dogrulama Tipi', profile: 'Profil',
  webfilter_profile: 'Web Filtre Profili', av_profile: 'Antivirus Profili',
  ips_sensor: 'IPS Sensor', application_list: 'Uygulama Listesi',
  ssl_ssh_profile: 'SSL/SSH Profili', deep_packet_inspection: 'Derin Paket Incelemesi',
  gateway: 'Gateway', distance: 'Mesafe', device: 'Cihaz', 'sdwan-zone': 'SD-WAN Bolgesi',
  'net-device': 'Ag Cihazi', 'remote-gw': 'Uzak Gateway', 'local-gw': 'Yerel Gateway',
  proposal: 'Oneri', psksecret: 'PSK Sifresi', dhgrp: 'DH Grubu', keylifeseconds: 'Anahtar Omru',
  dpd: 'Dead Peer Detection', network: 'Ag', 'auto-negotiate': 'Otomatik Pazarlik',
  authmethod: 'Kimlik Dogrulama Metodu', peertype: 'Es Tipi', xauthtype: 'XAuth Tipi',
  peerid: 'Es ID', localid: 'Yerel ID', phase1name: 'Phase 1 Adi', seq_num: 'Sira Numarasi',
  priority: 'Oncelik', weight: 'Agirlik', bfd: 'BFD', ike_version: 'IKE Versiyon',
  interface_: 'Arayuz',
};

// Map common FortiGate values to Turkish labels
const VALUE_LABELS: Record<string, string> = {
  enable: 'Aktif', disable: 'Pasif', accept: 'Izin Ver', deny: 'Reddet',
  drop: 'Birak', reset: 'Sifirla', all: 'Tumu', utm: 'UTM', local: 'Yerel',
  any: 'Herhangi', none: 'Yok',
};

function getAttrLabel(attr: string): string { return ATTR_LABELS[attr] || attr; }
function getValueLabel(value: string): string { return VALUE_LABELS[String(value).trim().toLowerCase()] || String(value); }

// Parse cfgattr for before→after:
//   Colon format:  "status:enable->disable" or "status:value"
//   Bracket format: "gateway[1.2.1.2]" or "net-device[disable->disable]" or "sdwan-zone[]"
//   Mixed:          concatenated brackets "gateway[1.2.1.2]distance[1]device[...]"
function parseCfgAttr(cfgattr: string): Array<{ attr: string; oldVal: string | null; newVal: string | null }> {
  const decoded = (() => { try { return decodeURIComponent(cfgattr); } catch { return cfgattr; } })();
  const results: Array<{ attr: string; oldVal: string | null; newVal: string | null }> = [];

  // Try bracket format first: attr[value] or attr[value->value]
  const bracketMatches = Array.from(decoded.matchAll(/([\w-]+)\[([^\]]*)\]/g));
  if (bracketMatches.length > 0) {
    for (const m of bracketMatches) {
      const attr = m[1];
      const inner = m[2];
      const arrowMatch = inner.match(/^(.+?)->(.+)$/);
      if (arrowMatch) {
        results.push({ attr, oldVal: arrowMatch[1], newVal: arrowMatch[2] });
      } else {
        results.push({ attr, oldVal: null, newVal: inner || null });
      }
    }
    return results;
  }

  // Fallback to colon/space format
  for (const part of decoded.split(/\s+/)) {
    if (!part) continue;
    const colonArrow = part.match(/^(\w+):(.+?)->(.+)$/);
    if (colonArrow) { results.push({ attr: colonArrow[1], oldVal: colonArrow[2], newVal: colonArrow[3] }); continue; }
    results.push({ attr: part, oldVal: null, newVal: null });
  }
  return results;
}

// Extract new value from msg: "set status disable in firewall.policy 42"
function extractNewValueFromMsg(msg: string, attr: string): string | null {
  const decoded = (() => { try { return decodeURIComponent(msg); } catch { return msg; } })();
  const setMatch = decoded.match(new RegExp(`(?:set|edit)\\s+${attr}\\s+(\\S+)`, 'i'));
  return setMatch ? setMatch[1] : null;
}

// Map cfgpath to Turkish label
const CFGPATH_LABELS: Record<string, string> = {
  'firewall.policy': 'Guvenlik Duvari Politikasi',
  'firewall.address': 'Adres Nesnesi',
  'firewall.addrgrp': 'Adres Grubu',
  'firewall.service': 'Servis Nesnesi',
  'firewall.service.group': 'Servis Grubu',
  'firewall.vip': 'Virtual IP (VIP)',
  'firewall.schedule': 'Zamanlama Nesnesi',
  'firewall.ippool': 'IP Havuzu',
  'firewall.central-snat': 'Merkezi SNAT',
  'router.static': 'Statik Rota',
  'system.admin': 'Sistem Yoneticisi',
  'system.interface': 'Arayuz Konfigurasyonu',
  'system.accprofile': 'Erisim Profili',
  'vpn.ipsec.phase1-interface': 'IPsec Phase 1',
  'vpn.ipsec.phase2-interface': 'IPsec Phase 2',
  'vpn.ssl.settings': 'SSL-VPN Ayarlari',
  'user.ldap': 'LDAP Sunucusu',
  'user.radius': 'RADIUS Sunucusu',
  'user.tacacs+': 'TACACS+ Sunucusu',
};

function getCfgPathLabel(path: string): string {
  return CFGPATH_LABELS[path] || path;
}

// Action label mapping
const ACTION_LABELS: Record<string, string> = {
  add: 'Ekleme', delete: 'Silme', edit: 'Duzenleme', set: 'Guncelleme',
};

interface ConfigChangeEntry {
  time: string;
  action: string;
  cfgpath: string;
  cfgobj: string;
  attrs: Array<{ attr: string; label: string; oldVal: string | null; newVal: string | null }>;
  msg: string;
}

function buildConfigChangeEntries(rawData: Array<Record<string, unknown>>): ConfigChangeEntry[] {
  return rawData.slice(0, 10).map((log) => {
    const cfgattr = (log.cfgattr as string) || '';
    const msg = (log.msg as string) || '';
    const parsedAttrs = cfgattr ? parseCfgAttr(cfgattr) : [];
    const attrs = parsedAttrs.map(pa => {
      const extracted = (pa.oldVal === null && pa.newVal === null && msg)
        ? extractNewValueFromMsg(msg, pa.attr) : null;
      const oldVal = pa.oldVal;
      const newVal = pa.newVal ?? extracted;
      return { attr: pa.attr, label: getAttrLabel(pa.attr), oldVal, newVal };
    });
    return {
      time: (log.time as string) || '',
      action: (log.action as string) || 'edit',
      cfgpath: (log.cfgpath as string) || '',
      cfgobj: (log.cfgobj as string) || '',
      attrs,
      msg: (() => { try { return decodeURIComponent(msg); } catch { return msg; } })(),
    };
  });
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
  const [refreshing, setRefreshing] = useState(false); // silent background refresh
  const [filter, setFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState<SourceType>('all');
  const [search, setSearch] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [archiveFilter, setArchiveFilter] = useState<'HOT' | 'ARCHIVED'>('HOT');
  const [sourceStats, setSourceStats] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [rawLogExpanded, setRawLogExpanded] = useState(false);

  // Cleanup states
  const [cleanupStatsOpen, setCleanupStatsOpen] = useState(false);
  const [cleanupStats, setCleanupStats] = useState<any>(null);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupHours, setCleanupHours] = useState(168); // 7 days default
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupDryRun, setCleanupDryRun] = useState(true);

  // Detail view state
  const [selectedEvent, setSelectedEvent] = useState<AlarmEventData | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [incidentDetail, setIncidentDetail] = useState<any>(null);
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
  // Device-ports enrichment for NMS_DEVICE_UNREACHABLE alarms
  const [devicePortsData, setDevicePortsData] = useState<{ deviceName: string; total: number; monitoredCount: number; interfaces: any[] } | null>(null);
  const [devicePortsLoading, setDevicePortsLoading] = useState(false);
  const [devicePortsError, setDevicePortsError] = useState<string | null>(null);
  // Discard/Whitelist dialog state
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discardReason, setDiscardReason] = useState('');
  const [discardLoading, setDiscardLoading] = useState(false);
  // Track which event IDs are currently being acknowledged
  const [acknowledgingIds, setAcknowledgingIds] = useState<Set<string>>(new Set());

  const PAGE_SIZE = 25;

  useEffect(() => {
    const requestedFilter = new URLSearchParams(window.location.search).get('filter');
    const allowedFilters = new Set([
      'all', 'unacknowledged', 'ACKNOWLEDGED', 'RESOLVED', 'CLOSED',
      'ALARM_CRITICAL', 'ALARM_HIGH', 'ALARM_MEDIUM', 'ALARM_LOW',
    ]);
    if (requestedFilter && allowedFilters.has(requestedFilter)) {
      setFilter(requestedFilter);
    }
  }, []);

  const fetchEvents = useCallback(async (silent = false, appendCursor: string | null = null) => {
    const isAppend = Boolean(appendCursor);
    if (isAppend) setLoadingMore(true);
    else if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const params = new URLSearchParams({ limit: PAGE_SIZE.toString(), archiveState: archiveFilter });
      if (appendCursor) params.set('cursor', appendCursor);
      if (filter === 'unacknowledged') params.set('status', 'OPEN');
      else if (['ACKNOWLEDGED', 'RESOLVED', 'CLOSED'].includes(filter)) params.set('status', filter);
      else if (filter !== 'all') params.set('severity', filter);
      if (sourceFilter !== 'all') params.set('source', sourceFilter);
      if (search) params.set('search', search);

      const res = await fetch(`/api/alarm-incidents?${params}`);
      const data = await res.json();
      if (data.success) {
        const newEvents = (data.data || []).map((incident: any) => {
          const occurrence = incident.occurrences?.[0] || {};
          const acknowledged = incident.status !== 'OPEN';
          return {
            ...occurrence,
            id: occurrence.id || incident.id,
            alarmId: incident.alarmId,
            severity: incident.severity,
            title: incident.title,
            message: incident.message,
            sourceIp: occurrence.sourceIp || null,
            destIp: occurrence.destIp || null,
            deviceName: occurrence.deviceName || incident.entityId || null,
            acknowledged,
            acknowledgedBy: incident.acknowledgedBy,
            acknowledgedAt: incident.acknowledgedAt,
            notifiedAt: occurrence.notifiedAt || null,
            notifyChannel: occurrence.notifyChannel || null,
            createdAt: occurrence.createdAt || incident.firstSeenAt,
            rawData: occurrence.rawData || null,
            alarm: {
              ...incident.alarm,
              category: incident.category,
              source: incident.source,
            },
            incident,
          } as AlarmEventData;
        });
        if (isAppend) {
          setEvents((prev: AlarmEventData[]) => [...prev, ...newEvents]);
        } else {
          setEvents(newEvents);
        }
        setStats(data.stats?.severity || {});
        setSourceStats(data.stats?.source || {});
        setTotal(data.total || 0);
        setNextCursor(data.nextCursor || null);
        setHasMore(Boolean(data.nextCursor));
      }
    } catch (err) {
      console.error('Fetch events error:', err);
    } finally {
      if (isAppend) setLoadingMore(false);
      else if (!silent) setLoading(false);
      setRefreshing(false);
    }
  }, [filter, sourceFilter, search, archiveFilter]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  useEffect(() => {
    const incidentId = selectedEvent?.incident?.id;
    if (!detailOpen || !incidentId) {
      setIncidentDetail(null);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/alarm-incidents/${incidentId}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((data) => { if (data.success) setIncidentDetail(data.data); })
      .catch((error) => { if (error.name !== 'AbortError') console.error('Incident detail error:', error); });
    return () => controller.abort();
  }, [detailOpen, selectedEvent?.incident?.id]);

  // Reset offset when filters change
  useEffect(() => {
    setNextCursor(null);
    setHasMore(true);
  }, [filter, sourceFilter, search, archiveFilter]);

  // Infinite scroll observer
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    if (!nextCursor) return;
    fetchEvents(false, nextCursor);
  }, [loadingMore, hasMore, nextCursor, fetchEvents]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  // Fetch cleanup statistics
  const fetchCleanupStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/alarms/cleanup?hoursOld=${cleanupHours}`, { method: 'GET' });
      const data = await res.json();
      if (data.success) {
        setCleanupStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to fetch cleanup stats:', err);
    }
  }, [cleanupHours]);

  // Run cleanup
  const runCleanup = async () => {
    setCleanupLoading(true);
    try {
      const params = new URLSearchParams({
        hoursOld: cleanupHours.toString(),
        dryRun: cleanupDryRun.toString(),
      });

      const res = await fetch(`/api/alarms/cleanup?${params}`, { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        const archivedCount = cleanupDryRun ? data.wouldArchive : data.archived;
        setMessage({
          text: cleanupDryRun
            ? `${archivedCount} kapatılmış alarm arşivlenecek`
            : `${archivedCount} alarm arşivlendi; olay kanıtları korunuyor`,
          type: 'success',
        });

        if (!cleanupDryRun) {
          fetchEvents(true);
          setCleanupOpen(false);
        } else {
          setCleanupStats(data);
        }
      } else {
        setMessage({ text: `Error: ${data.error}`, type: 'error' });
      }
    } catch (err) {
      setMessage({ text: 'Arşivleme işlemi başarısız', type: 'error' });
    } finally {
      setCleanupLoading(false);
    }
  };

  // Auto-refresh events silently every 2 minutes (no loading spinner)
  useEffect(() => {
    const interval = setInterval(() => fetchEvents(true), 120000);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  // Reset all per-alarm enrichment state whenever the selected alarm changes.
  // This is a belt-and-suspenders safeguard: the click handler that opens the
  // detail dialog also resets state, but any other code path that reassigns
  // `selectedEvent` (e.g. acknowledge button, future features) must not leak
  // stale device / port / policy / address data from a previous alarm into the
  // currently opened alarm.
  useEffect(() => {
    setPortData(null);
    setPortError(null);
    setPolicyData(null);
    setPolicyError(null);
    setPolicySearch('');
    setPolicyExpanded(false);
    setAddressData(null);
    setAddressError(null);
    setAddressSearch('');
    setAddressExpanded(false);
    setDevicePortsData(null);
    setDevicePortsError(null);
    setRawLogExpanded(false);
    // Intentionally depend on the alarm event id only. Mutating the rest of
    // the selectedEvent object (e.g. marking it acknowledged) must NOT wipe
    // the user's already-loaded enrichment panels.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEvent?.id]);

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
        fetchEvents(true);
      } else {
        setMessage({ text: data.error || 'Tarama hatasi', type: 'error' });
      }
    } catch (err) {
      setMessage({ text: 'Alarm tarama hatasi', type: 'error' });
    } finally {
      setChecking(false);
    }
  };

  const transitionIncident = async (
    event: AlarmEventData,
    action: 'ACKNOWLEDGE' | 'RESOLVE' | 'CLOSE' | 'ARCHIVE' | 'RESTORE' | 'SET_LEGAL_HOLD' | 'RELEASE_LEGAL_HOLD',
  ) => {
    const incidentId = event.incident?.id;
    if (!incidentId) {
      setMessage({ text: 'Bu eski alarm henüz bir incident ile ilişkilendirilmemiş', type: 'error' });
      return false;
    }
    setAcknowledgingIds(prev => new Set(prev).add(incidentId));
    try {
      const res = await fetch('/api/alarm-incidents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [incidentId], action }),
      });
      const data = await res.json();
      if (data.success) {
        const labels = {
          ACKNOWLEDGE: 'Alarm onaylandı',
          RESOLVE: 'Alarm çözüldü',
          CLOSE: 'Alarm kapatıldı',
          ARCHIVE: 'Alarm arşivlendi',
          RESTORE: 'Alarm arşivden çıkarıldı',
          SET_LEGAL_HOLD: 'Alarm için legal hold etkinleştirildi',
          RELEASE_LEGAL_HOLD: 'Alarm legal hold korumasından çıkarıldı',
        };
        setMessage({ text: labels[action], type: 'success' });
        setTimeout(() => setMessage(null), 3000);
        setDetailOpen(false);
        fetchEvents(true);
        return true;
      } else {
        setMessage({ text: `İşlem hatası: ${data.error || 'Bilinmeyen hata'}`, type: 'error' });
      }
    } catch (err) {
      console.error('Incident transition error:', err);
      setMessage({ text: 'Incident güncellenirken bağlantı hatası oluştu', type: 'error' });
    } finally {
      setAcknowledgingIds(prev => {
        const next = new Set(prev);
        next.delete(incidentId);
        return next;
      });
    }
    return false;
  };

  const acknowledgeEvent = async (event: AlarmEventData) => {
    await transitionIncident(event, 'ACKNOWLEDGE');
  };

  const acknowledgeAll = async () => {
    const unackedIds = events
      .filter((event: AlarmEventData) => event.incident?.status === 'OPEN')
      .map((event: AlarmEventData) => event.incident!.id);
    if (unackedIds.length === 0) return;
    try {
      const res = await fetch('/api/alarm-incidents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: unackedIds, action: 'ACKNOWLEDGE' }),
      });
      const data = await res.json();
      if (data.success) fetchEvents(true);
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
      } else if (selectedEvent.alarm.code.startsWith('NMS_') || selectedEvent.alarm.code.startsWith('VM_')) {
        // NMS and VMware alarms use deviceName instead of sourceIp
        field = 'deviceName';
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
        fetchEvents(true);
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

  const fetchDevicePorts = async () => {
    setDevicePortsLoading(true);
    setDevicePortsError(null);
    setDevicePortsData(null);
    try {
      // Extract device name from alarm title: "Device Unreachable: ISLETMELER_SW1"
      const match = selectedEvent?.title.match(/Device Unreachable:\s+(.+)/);
      const deviceName = match?.[1]?.trim() || selectedEvent?.deviceName;
      if (!deviceName) {
        setDevicePortsError('Could not parse device name from alarm');
        setDevicePortsLoading(false);
        return;
      }

      const devRes = await fetch('/api/integrations/nms/devices?enabled=true');
      const devData = await devRes.json();
      const device = devData.devices?.find((d: any) => d.name === deviceName);

      if (!device) {
        setDevicePortsError(`Device "${deviceName}" not found in NMS`);
        setDevicePortsLoading(false);
        return;
      }

      const res = await fetch(`/api/integrations/nms/devices/${device.id}/ports/monitored`);
      const data = await res.json();
      if (data.interfaces) {
        setDevicePortsData(data);
      } else {
        setDevicePortsError(data.error || 'Port list not found');
      }
    } catch (err: any) {
      setDevicePortsError(err.message);
    } finally {
      setDevicePortsLoading(false);
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

  // Filtering is now server-side; events array is the filtered result

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
            Retention Durumu
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCleanupOpen(true)}
          >
            <Archive className="h-4 w-4 mr-2" />
            Arşivle
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const params = new URLSearchParams({ archiveState: archiveFilter });
              if (filter === 'unacknowledged') params.set('status', 'OPEN');
              else if (['ACKNOWLEDGED', 'RESOLVED', 'CLOSED'].includes(filter)) params.set('status', filter);
              window.location.href = `/api/alarm-incidents/export?${params}`;
            }}
          >
            <Download className="h-4 w-4 mr-2" />
            CSV
          </Button>
          <Button variant="outline" onClick={runAlarmCheck} disabled={checking}>
            {checking ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            {checking ? 'Taraniyor...' : 'Alarm Tara'}
          </Button>
          <Button variant="outline" size="icon" onClick={() => fetchEvents()} disabled={loading || refreshing}>
            <RefreshCw className={`h-4 w-4 ${loading || refreshing ? 'animate-spin' : ''}`} />
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
              ? total
              : src === 'firewall'
                ? (sourceStats.fortianalyzer || 0) + (sourceStats['fortigate-sslvpn'] || 0)
                : src === 'switch'
                  ? sourceStats.nms || 0
                  : sourceStats.vmware || 0;
            return (
              <Button
                key={src}
                size="sm"
                variant={sourceFilter === src ? 'default' : 'outline'}
                className={sourceFilter === src ? `${cfg.bgActive} text-white border-0` : ''}
                onClick={() => { setSourceFilter(src); }}
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
            { key: 'ACKNOWLEDGED', label: 'Onaylandı' },
            { key: 'RESOLVED', label: 'Çözüldü' },
            { key: 'CLOSED', label: 'Kapatıldı' },
            { key: 'ALARM_CRITICAL', label: 'Kritik' },
            { key: 'ALARM_HIGH', label: 'Yuksek' },
            { key: 'ALARM_MEDIUM', label: 'Orta' },
            { key: 'ALARM_LOW', label: 'Dusuk' },
          ].map((f) => (
            <Button key={f.key} variant={filter === f.key ? 'default' : 'outline'} size="sm" onClick={() => { setFilter(f.key); }}>
              {f.label}
            </Button>
          ))}
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant={archiveFilter === 'HOT' ? 'default' : 'outline'} onClick={() => setArchiveFilter('HOT')}>
            Aktif kayıtlar
          </Button>
          <Button size="sm" variant={archiveFilter === 'ARCHIVED' ? 'default' : 'outline'} onClick={() => setArchiveFilter('ARCHIVED')}>
            <Archive className="h-3.5 w-3.5 mr-1.5" /> Arşiv
          </Button>
        </div>

        {/* Action buttons */}
        {events.some((e: AlarmEventData) => !e.acknowledged) && (
          <Button variant="outline" size="sm" onClick={acknowledgeAll}>
            <CheckCircle className="h-4 w-4 mr-1" /> Tumunu Onayla
          </Button>
        )}

        {/* Search - at the end */}
        <div className="relative ml-auto max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Alarm ara..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
      </div>

      {/* Alarm Events Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Alarm Olaylari
            <Badge variant="secondary">{total}</Badge>
          </CardTitle>
          <CardDescription>{events.length} / {total} alarm gosteriliyor</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : events.length === 0 ? (
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
                  {events.map((event: AlarmEventData) => {
                    const sev = SEVERITY_CONFIG[event.severity] || SEVERITY_CONFIG['ALARM_INFO'];
                    const Icon = sev.icon;
                    return (
                      <TableRow key={event.id} className={event.incident?.status === 'CLOSED' ? 'opacity-60' : ''}>
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
                        <TableCell>
                          {event.sourceIp ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-medium ${
                              event.sourceIp.startsWith('10.') || 
                              event.sourceIp.startsWith('172.16.') || 
                              event.sourceIp.startsWith('192.168.') ||
                              event.sourceIp.startsWith('127.')
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                            }`} title={event.sourceIp}>
                              <Globe className="h-3 w-3 mr-1 opacity-60" />
                              {event.sourceIp.length > 12 ? event.sourceIp.slice(0, 12) + '...' : event.sourceIp}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs max-w-[150px] truncate" title={event.deviceName || '-'}>{event.deviceName || '-'}</TableCell>
                        <TableCell>
                          {event.incident?.status === 'OPEN' && <Badge variant="destructive" className="text-xs">Bekliyor</Badge>}
                          {event.incident?.status === 'ACKNOWLEDGED' && <Badge variant="outline" className="text-amber-600 text-xs">Onaylandı</Badge>}
                          {event.incident?.status === 'RESOLVED' && <Badge variant="outline" className="text-green-600 text-xs"><CircleCheckBig className="h-3 w-3 mr-1" />Çözüldü</Badge>}
                          {event.incident?.status === 'CLOSED' && <Badge variant="secondary" className="text-xs">Kapatıldı</Badge>}
                          {!event.incident && <Badge variant="outline" className="text-xs">Eski kayıt</Badge>}
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
                            {event.incident?.status === 'OPEN' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 w-8 p-0"
                                disabled={acknowledgingIds.has(event.incident.id)}
                                onClick={() => acknowledgeEvent(event)}
                                title="Onayla"
                              >
                                {acknowledgingIds.has(event.incident.id) ? (
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
                                setDevicePortsData(null);
                                setDevicePortsError(null);
                                // Reset all per-alarm enrichment state to prevent
                                // stale data leaking between different alarms.
                                setPortData(null);
                                setPortError(null);
                                setAddressData(null);
                                setAddressError(null);
                                setAddressSearch('');
                                setAddressExpanded(false);
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
        
        {/* Infinite scroll sentinel */}
        {events.length > 0 && (
          <div className="flex items-center justify-center px-6 py-4 border-t">
            <div ref={loadMoreRef} className="text-sm text-muted-foreground">
              {loadingMore ? (
                <span className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Yükleniyor...
                </span>
              ) : hasMore ? (
                <span>{events.length} / {total} kayit — daha fazla icin kaydir</span>
              ) : (
                <span>{events.length} / {total} kayit (tumu yuklendi)</span>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Retention Statistics Dialog */}
      <Dialog open={cleanupStatsOpen} onOpenChange={setCleanupStatsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Alarm Retention Durumu</DialogTitle>
            <DialogDescription>
              Alarm incident yaşam döngüsü ve arşiv politikası
            </DialogDescription>
          </DialogHeader>

          {cleanupStats ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
                  <p className="text-xs text-muted-foreground">Aktif</p>
                  <p className="text-2xl font-bold">{cleanupStats?.counts?.active || 0}</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
                  <p className="text-xs text-muted-foreground">Çözüldü</p>
                  <p className="text-2xl font-bold">{cleanupStats?.counts?.resolved || 0}</p>
                </div>
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
                  <p className="text-xs text-muted-foreground">Kapatıldı</p>
                  <p className="text-2xl font-bold text-green-600">{cleanupStats?.counts?.closed || 0}</p>
                </div>
                <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20">
                  <p className="text-xs text-muted-foreground">Arşivlendi</p>
                  <p className="text-2xl font-bold text-orange-600">{cleanupStats?.counts?.archived || 0}</p>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
                <p className="text-sm font-medium mb-2">Retention Politikası</p>
                <p className="text-sm font-medium">Ham veri: {cleanupStats?.config?.rawPayloadDays || 90} gün</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Kapatılmış incident: {cleanupStats?.config?.incidentArchiveDays || 365} gün hot storage, bildirim denemeleri: {cleanupStats?.config?.notificationAttemptDays || 730} gün.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
                <p className="text-sm font-medium mb-2">Korunan kayıtlar</p>
                <div className="flex justify-between text-sm"><span>Legal hold</span><span className="font-mono font-medium">{cleanupStats?.counts?.legalHold || 0}</span></div>
                <div className="flex justify-between text-sm"><span>Sıkıştırılmış payload</span><span className="font-mono font-medium">{cleanupStats?.counts?.compressedPayloads || 0}</span></div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCleanupStatsOpen(false)}>
              Kapat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual archive dialog */}
      <Dialog open={cleanupOpen} onOpenChange={setCleanupOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Kapatılmış Alarmları Arşivle</DialogTitle>
            <DialogDescription>
              Yalnızca CLOSED durumundaki incident kayıtları arşivlenir. Olay geçmişi ve audit izi silinmez.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Şu kadar süreden eski kapatılmış alarmları arşivle
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: '4 Saat',   hours: 4   },
                  { label: '12 Saat',  hours: 12  },
                  { label: '1 Gün',    hours: 24  },
                  { label: '3 Gün',    hours: 72  },
                  { label: '7 Gün',    hours: 168 },
                  { label: '30 Gün',   hours: 720 },
                  { label: '90 Gün',   hours: 2160 },
                ].map(({ label, hours }) => (
                  <button
                    key={hours}
                    type="button"
                    onClick={() => setCleanupHours(hours)}
                    className={`px-3 py-1.5 rounded text-sm font-medium border transition-colors ${
                      cleanupHours === hours
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-foreground border-border hover:bg-muted'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Seçili: <span className="font-medium">{cleanupHours < 24 ? `${cleanupHours} saat` : `${cleanupHours / 24} gün`}</span> öncesi
              </p>
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
                Önizleme modu
              </label>
            </div>

            {cleanupStats && cleanupDryRun && (
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-sm">
                <p className="font-medium text-blue-900 dark:text-blue-200 mb-1">Preview</p>
                <p className="text-blue-700 dark:text-blue-300">
                  {cleanupStats.wouldArchive || 0} kapatılmış alarm arşivlenecek
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
              Vazgeç
            </Button>
            {cleanupDryRun ? (
              <Button onClick={runCleanup} disabled={cleanupLoading}>
                {cleanupLoading ? 'Hesaplanıyor...' : 'Önizle'}
              </Button>
            ) : (
              <Button
                variant="default"
                onClick={runCleanup}
                disabled={cleanupLoading}
              >
                {cleanupLoading ? 'Arşivleniyor...' : 'Arşivlemeyi Onayla'}
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

                  {/* Structured Config Change Detail — reads directly from rawData */}
                  {CONFIG_CHANGE_CODES.has(selectedEvent.alarm?.code || '') && selectedEvent.rawData && selectedEvent.rawData.length > 0 && (() => {
                    const entries = buildConfigChangeEntries(selectedEvent.rawData);
                    if (entries.length === 0) return null;
                    return (
                      <section>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                          Degisiklik Detaylari
                        </p>
                        <div className="space-y-2">
                          {entries.map((entry, idx) => (
                            <div key={idx} className="rounded-lg border bg-muted/10 overflow-hidden">
                              {/* Change header */}
                              <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b text-xs">
                                {entry.time && <span className="font-mono text-muted-foreground">{entry.time}</span>}
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  entry.action === 'add' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                                  entry.action === 'delete' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                                  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                }`}>
                                  {ACTION_LABELS[entry.action] || entry.action}
                                </span>
                                {entry.cfgpath && (
                                  <span className="text-muted-foreground">
                                    {getCfgPathLabel(entry.cfgpath)}
                                    {entry.cfgobj && <span className="font-mono ml-1">#{entry.cfgobj}</span>}
                                  </span>
                                )}
                              </div>
                              {/* Attribute changes table */}
                              {entry.attrs.length > 0 ? (
                                <table className="w-full text-xs">
                                  <tbody>
                                    {entry.attrs.map((a, ai) => (
                                      <tr key={ai} className="border-b last:border-0">
                                        <td className="px-3 py-1.5 text-muted-foreground w-[30%] bg-muted/10 align-top font-medium">
                                          {a.label}
                                          {a.label !== a.attr && <span className="ml-1 opacity-50 font-normal">({a.attr})</span>}
                                        </td>
                                        <td className="px-3 py-1.5 align-top">
                                          {a.oldVal !== null && a.newVal !== null ? (
                                            <span className="flex items-center gap-1.5">
                                              <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300 line-through font-mono text-[11px]">
                                                {getValueLabel(a.oldVal)}
                                              </span>
                                              <span className="text-muted-foreground">→</span>
                                              <span className="px-1.5 py-0.5 rounded bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300 font-mono text-[11px] font-medium">
                                                {getValueLabel(a.newVal)}
                                              </span>
                                            </span>
                                          ) : a.newVal !== null ? (
                                            <span className="flex items-center gap-1.5">
                                              <span className="text-muted-foreground">→</span>
                                              <span className="px-1.5 py-0.5 rounded bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300 font-mono text-[11px] font-medium">
                                                {getValueLabel(a.newVal)}
                                              </span>
                                            </span>
                                          ) : (
                                            <span className="text-muted-foreground italic">degistirildi</span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              ) : entry.msg && entry.msg !== 'Object attribute configured' ? (
                                <div className="px-3 py-2 text-xs text-muted-foreground">{entry.msg}</div>
                              ) : null}
                            </div>
                          ))}
                          {selectedEvent.rawData!.length > 10 && (
                            <p className="text-xs text-muted-foreground italic text-center">
                              ... ve {selectedEvent.rawData!.length - 10} degisiklik daha
                            </p>
                          )}
                        </div>
                      </section>
                    );
                  })()}

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
                      {selectedEvent.sourceIp ? (
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-mono font-semibold ${
                            selectedEvent.sourceIp.startsWith('10.') || 
                            selectedEvent.sourceIp.startsWith('172.16.') || 
                            selectedEvent.sourceIp.startsWith('192.168.') ||
                            selectedEvent.sourceIp.startsWith('127.')
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                          }`}>
                            <Globe className="h-3 w-3 mr-1.5 opacity-70" />
                            {selectedEvent.sourceIp}
                          </span>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">-</p>
                      )}
                    </div>
                    <div className="p-3 rounded-lg bg-muted/30">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Cihaz</p>
                      <p className="text-sm font-bold">{selectedEvent.deviceName || '-'}</p>
                    </div>
                  </div>

                  {/* Config Change Extra Metadata — from rawData */}
                  {CONFIG_CHANGE_CODES.has(selectedEvent.alarm?.code || '') && selectedEvent.rawData && selectedEvent.rawData.length > 0 && (() => {
                    const firstLog = selectedEvent.rawData[0] as Record<string, unknown>;
                    const ui = (firstLog.ui as string) || '';
                    const vd = (firstLog.vd as string) || '';
                    const devid = (firstLog.devid as string) || '';
                    const logdesc = (firstLog.logdesc as string) || '';
                    const msgRaw = (firstLog.msg as string) || '';
                    const msgDecoded = (() => { try { return decodeURIComponent(msgRaw); } catch { return msgRaw; } })();
                    if (!ui && !vd && !devid && !logdesc && !msgDecoded) return null;
                    return (
                      <section>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Islem Detaylari</p>
                        <div className="grid grid-cols-2 gap-3">
                          {ui && (
                            <div className="p-3 rounded-lg bg-muted/30">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Erisim Yontemi</p>
                              <p className="text-sm font-medium">{ui}</p>
                            </div>
                          )}
                          {vd && (
                            <div className="p-3 rounded-lg bg-muted/30">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">VDOM</p>
                              <p className="text-sm font-medium">{vd}</p>
                            </div>
                          )}
                          {devid && (
                            <div className="p-3 rounded-lg bg-muted/30">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Cihaz ID</p>
                              <p className="text-xs font-mono">{devid}</p>
                            </div>
                          )}
                          {logdesc && (
                            <div className="p-3 rounded-lg bg-muted/30">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Log Aciklamasi</p>
                              <p className="text-sm font-medium">{logdesc}</p>
                            </div>
                          )}
                        </div>
                        {msgDecoded && msgDecoded !== logdesc && (
                          <div className="mt-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-700 dark:text-blue-300 mb-1">Islem Ozeti</p>
                            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">{msgDecoded}</p>
                          </div>
                        )}
                      </section>
                    );
                  })()}

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
                    <div className="p-3 rounded-lg bg-muted/30">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Incident Durumu</p>
                      <p className="text-sm font-semibold">{selectedEvent.incident?.status || 'LEGACY'}</p>
                      {selectedEvent.incident && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {selectedEvent.incident.occurrenceCount} oluşum, {selectedEvent.incident.reopenCount} yeniden açılma
                        </p>
                      )}
                      {selectedEvent.acknowledgedBy && (
                        <p className="text-xs mt-1"><span className="text-muted-foreground">Onaylayan:</span> {selectedEvent.acknowledgedBy}</p>
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


                  {/* Etkilenen Portlar — only for NMS_DEVICE_UNREACHABLE */}
                  {selectedEvent.alarm?.code === 'NMS_DEVICE_UNREACHABLE' && (
                    <section className="rounded-lg border overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2.5 bg-rose-50 dark:bg-rose-900/20 border-b">
                        <div className="flex items-center gap-2">
                          <Router className="h-4 w-4 text-rose-500" />
                          <span className="text-xs font-bold uppercase tracking-widest text-rose-700 dark:text-rose-300">
                            Etkilenen Portlar
                          </span>
                          {devicePortsData && (
                            <span className="text-xs text-muted-foreground">
                              ({devicePortsData.deviceName} • {devicePortsData.monitoredCount}/{devicePortsData.total} izleniyor)
                            </span>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={devicePortsLoading}
                          onClick={fetchDevicePorts}
                        >
                          {devicePortsLoading
                            ? <><RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />Yükleniyor...</>
                            : devicePortsData
                            ? <><RefreshCw className="h-3 w-3 mr-1.5" />Yenile</>
                            : <><Eye className="h-3 w-3 mr-1.5" />Port Listesini Getir</>}
                        </Button>
                      </div>

                      {devicePortsError && (
                        <div className="px-4 py-3 text-xs text-red-600 bg-red-50 dark:bg-red-900/20">
                          <AlertOctagon className="h-3.5 w-3.5 inline mr-1" />{devicePortsError}
                        </div>
                      )}

                      {devicePortsData && devicePortsData.interfaces.length > 0 && (() => {
                        const ifs = devicePortsData.interfaces;
                        const upCount = ifs.filter((i: any) => i.operStatus === 'up').length;
                        const downCount = ifs.filter((i: any) => i.operStatus === 'down').length;
                        const monitoredDown = ifs.filter((i: any) => i.monitored && i.operStatus === 'down');
                        return (
                          <div className="p-3 space-y-3">
                            {/* Summary */}
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div className="text-center p-2 rounded bg-green-50 dark:bg-green-900/10">
                                <div className="text-muted-foreground">Up</div>
                                <div className="font-mono font-bold text-green-600 text-sm">{upCount}</div>
                              </div>
                              <div className="text-center p-2 rounded bg-red-50 dark:bg-red-900/10">
                                <div className="text-muted-foreground">Down</div>
                                <div className="font-mono font-bold text-red-500 text-sm">{downCount}</div>
                              </div>
                              <div className="text-center p-2 rounded bg-sky-50 dark:bg-sky-900/10">
                                <div className="text-muted-foreground">İzlenen</div>
                                <div className="font-mono font-bold text-sky-600 text-sm">{devicePortsData.monitoredCount}</div>
                              </div>
                            </div>

                            {/* Monitored DOWN ports first (most relevant) */}
                            {monitoredDown.length > 0 && (
                              <div>
                                <div className="text-xs font-semibold mb-2 text-red-600 dark:text-red-400">
                                  ⚠️ İzlenen &amp; Down Portlar ({monitoredDown.length})
                                </div>
                                <div className="rounded-md border overflow-hidden">
                                  <table className="w-full text-xs">
                                    <thead className="bg-muted/40">
                                      <tr>
                                        <th className="px-3 py-1.5 text-left font-semibold">Port</th>
                                        <th className="px-3 py-1.5 text-left font-semibold">Açıklama</th>
                                        <th className="px-3 py-1.5 text-center font-semibold">Admin</th>
                                        <th className="px-3 py-1.5 text-center font-semibold">Oper</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {monitoredDown.map((iface: any) => (
                                        <tr key={iface.id} className="border-t">
                                          <td className="px-3 py-1.5 font-mono font-medium">{iface.interfaceName}</td>
                                          <td className="px-3 py-1.5 text-muted-foreground">{(iface.description && iface.description !== 'None') ? iface.description : '—'}</td>
                                          <td className="px-3 py-1.5 text-center">
                                            <span className={`font-semibold ${iface.adminStatus === 'up' ? 'text-green-600' : 'text-red-500'}`}>
                                              {iface.adminStatus === 'up' ? '✓ UP' : '✕ DOWN'}
                                            </span>
                                          </td>
                                          <td className="px-3 py-1.5 text-center">
                                            <span className={`font-semibold ${iface.operStatus === 'up' ? 'text-green-600' : 'text-red-500'}`}>
                                              {iface.operStatus === 'up' ? '✓ UP' : '✕ DOWN'}
                                            </span>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            {/* All ports (collapsed table) */}
                            <details className="rounded-md border">
                              <summary className="px-3 py-2 text-xs font-semibold cursor-pointer hover:bg-muted/30">
                                Tüm Portlar ({ifs.length})
                              </summary>
                              <div className="max-h-64 overflow-y-auto">
                                <table className="w-full text-xs">
                                  <thead className="bg-muted/40 sticky top-0">
                                    <tr>
                                      <th className="px-3 py-1.5 text-left font-semibold">Port</th>
                                      <th className="px-3 py-1.5 text-left font-semibold">Açıklama</th>
                                      <th className="px-3 py-1.5 text-center font-semibold">Admin</th>
                                      <th className="px-3 py-1.5 text-center font-semibold">Oper</th>
                                      <th className="px-3 py-1.5 text-center font-semibold">İzleniyor</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {ifs.map((iface: any) => (
                                      <tr key={iface.id} className="border-t">
                                        <td className="px-3 py-1.5 font-mono">{iface.interfaceName}</td>
                                        <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[180px]">{(iface.description && iface.description !== 'None') ? iface.description : '—'}</td>
                                        <td className="px-3 py-1.5 text-center">
                                          <span className={iface.adminStatus === 'up' ? 'text-green-600' : 'text-red-500'}>
                                            {iface.adminStatus === 'up' ? 'UP' : 'DOWN'}
                                          </span>
                                        </td>
                                        <td className="px-3 py-1.5 text-center">
                                          <span className={iface.operStatus === 'up' ? 'text-green-600' : 'text-red-500'}>
                                            {iface.operStatus === 'up' ? 'UP' : 'DOWN'}
                                          </span>
                                        </td>
                                        <td className="px-3 py-1.5 text-center">
                                          {iface.monitored ? <span className="text-sky-600">✓</span> : <span className="text-muted-foreground">—</span>}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </details>
                          </div>
                        );
                      })()}

                      {devicePortsData && devicePortsData.interfaces.length === 0 && (
                        <div className="px-4 py-4 text-xs text-muted-foreground text-center">
                          Bu cihaz için port bilgisi bulunamadı.
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

                  {incidentDetail?.transitions?.length > 0 && (
                    <section>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Yaşam Döngüsü</p>
                      <div className="space-y-2">
                        {incidentDetail.transitions.slice(0, 8).map((transition: any) => (
                          <div key={transition.id} className="flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-xs">
                            <div>
                              <p className="font-semibold">{transition.type}</p>
                              <p className="text-muted-foreground">
                                {transition.fromStatus || '—'} → {transition.toStatus || '—'} · {transition.actorName || transition.actorType}
                              </p>
                              {transition.reason && <p className="mt-1">{transition.reason}</p>}
                            </div>
                            <span className="text-muted-foreground whitespace-nowrap">
                              {new Date(transition.createdAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Footer branding */}
                  <div className="text-center text-xs text-muted-foreground pt-3 border-t">
                    <p>InfraScope Alarm Management System</p>
                    <p>{new Date(selectedEvent.createdAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}</p>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex justify-end gap-2 px-6 pb-5">
                  {selectedEvent.incident?.status === 'OPEN' && (
                    <Button
                      onClick={() => acknowledgeEvent(selectedEvent)}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Onayla
                    </Button>
                  )}
                  {selectedEvent.incident && ['OPEN', 'ACKNOWLEDGED'].includes(selectedEvent.incident.status) && (
                    <Button variant="outline" onClick={() => transitionIncident(selectedEvent, 'RESOLVE')}>
                      <CircleCheckBig className="h-4 w-4 mr-2" />
                      Çözüldü
                    </Button>
                  )}
                  {selectedEvent.incident?.status === 'RESOLVED' && (
                    <Button variant="outline" onClick={() => transitionIncident(selectedEvent, 'CLOSE')}>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Kapat
                    </Button>
                  )}
                  {selectedEvent.incident?.status === 'CLOSED' && selectedEvent.incident.archiveState === 'HOT' && (
                    <Button variant="outline" onClick={() => transitionIncident(selectedEvent, 'ARCHIVE')}>
                      <Archive className="h-4 w-4 mr-2" />
                      Arşivle
                    </Button>
                  )}
                  {selectedEvent.incident?.archiveState === 'ARCHIVED' && (
                    <Button variant="outline" onClick={() => transitionIncident(selectedEvent, 'RESTORE')}>
                      Arşivden Çıkar
                    </Button>
                  )}
                  {selectedEvent.incident && (
                    <Button
                      variant="outline"
                      onClick={() => transitionIncident(
                        selectedEvent,
                        selectedEvent.incident!.legalHold ? 'RELEASE_LEGAL_HOLD' : 'SET_LEGAL_HOLD',
                      )}
                      title="Legal hold retention işlemlerini durdurur"
                    >
                      <LockKeyhole className="h-4 w-4 mr-2" />
                      {selectedEvent.incident.legalHold ? 'Hold Kaldır' : 'Legal Hold'}
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
                    else if (selectedEvent.alarm.code.startsWith('NMS_') || selectedEvent.alarm.code.startsWith('VM_')) field = 'deviceName';
                    
                    const value = field === 'sourceIp' ? selectedEvent.sourceIp 
                                  : field === 'destIp' ? selectedEvent.destIp 
                                  : field === 'deviceName' ? selectedEvent.deviceName
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
