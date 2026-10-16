'use client';

import { uiError } from '@/lib/i18n/tr';
import { incidentExclusionTarget } from '@/lib/alarms/incident-exclusion';

import { ActionIcon } from '@/components/ui/action-icon';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Device, NmsInterface, NmsTopologyLink } from '@prisma/client';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertOctagon, CheckCircle, RefreshCw,
  Play, Shield, BarChart3, Eye, Router,
  ChevronDown, ChevronRight, Code2, MapPin, Globe, Archive, Download,
  MoreHorizontal, Info, ArrowRight, BellRing,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import incidentStyles from '@/components/dashboard/incident-operations.module.css';
import detailStyles from '@/components/dashboard/incident-detail.module.css';
import { IncidentDetailWorkspace } from '@/components/dashboard/IncidentDetailWorkspace';
import { IncidentExclusions } from '@/components/dashboard/IncidentExclusions';
import type { IncidentBulkAssignmentResult } from '@/components/dashboard/IncidentBulkAssignment';
import { isIncidentBulkLifecycleEligible, type IncidentBulkLifecycleAction, type IncidentBulkLifecycleResult } from '@/lib/alarms/incident-bulk-lifecycle';
import { incidentStatusLabels, type IncidentActionPayload, type IncidentDetailAction, type IncidentDetailData } from '@/lib/alarms/incident-detail-presentation';
import {
  IncidentFilters,
  IncidentList,
  IncidentOverview,
  type IncidentArchiveFilter,
  type IncidentListItem,
  type IncidentSourceFilter,
  type IncidentStatusFilter,
  type IncidentSort,
  type IncidentSortDirection,
} from '@/components/dashboard/IncidentOperations';
import { cn } from '@/lib/utils';
import type { FortiGatePolicy, FortiGateAddress } from '@/lib/integrations/fortigate';
import type { getAlarmRetentionStats } from '@/lib/alarms/retention-service';

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
    assignedToId?: string | null;
    resolvedAt: string | null;
    closedAt: string | null;
    legalHold: boolean;
  };
}

interface NmsPipelineHealth {
  state: 'healthy' | 'degraded' | 'not_configured';
  pollingDevices: number;
  registeredDevices: number;
  monitoredPorts: number;
  freshInterfaces: number;
  freshHealthMetrics: number;
  lastSuccessfulPollAt: string | null;
  lastAlarmCheckAt: string | null;
  blockingReasons: string[];
}

interface AlarmIncidentListRecord extends NonNullable<AlarmEventData['incident']>, Pick<AlarmEventData, 'alarmId' | 'severity' | 'title' | 'message' | 'acknowledgedBy' | 'acknowledgedAt'> {
  category: string;
  source: string;
  entityId: string | null;
  alarm: Pick<AlarmEventData['alarm'], 'code' | 'name' | 'description'>;
  occurrences: Array<Partial<Omit<AlarmEventData, 'alarm' | 'incident'>>>;
}

type CleanupStats = Partial<Pick<Awaited<ReturnType<typeof getAlarmRetentionStats>>, 'counts' | 'config'>> & { wouldArchive?: number };

interface PortDetails {
  device: Pick<Device, 'name' | 'vendor' | 'type' | 'managementIp'>;
  port: Pick<NmsInterface, 'id' | 'interfaceName' | 'description' | 'adminStatus' | 'operStatus' | 'mtu' | 'inErrors' | 'outErrors'> & {
    // The port API serializes BigInt counters and dates before returning JSON.
    speed: string;
    inOctets: string;
    outOctets: string;
    lastPolledAt: string;
  };
  neighbors: Array<Pick<NmsTopologyLink, 'remoteDeviceName' | 'remoteInterface' | 'protocol'>>;
}

interface DevicePorts {
  deviceName: string;
  total: number;
  monitoredCount: number;
  interfaces: Array<Pick<NmsInterface, 'id' | 'interfaceName' | 'description' | 'adminStatus' | 'operStatus' | 'monitored'>>;
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
  nat: 'NAT', comments: "Açıklama", groups: 'Gruplar', password: "Parola",
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
  proposal: "Öneri", psksecret: 'PSK Sifresi', dhgrp: 'DH Grubu', keylifeseconds: 'Anahtar Omru',
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
  const [statusFilter, setStatusFilter] = useState<IncidentStatusFilter>('ACTIVE');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState<IncidentSourceFilter>('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [filtersReady, setFiltersReady] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [ordering, setOrdering] = useState<{ sort: IncidentSort; direction: IncidentSortDirection }>({ sort: 'severity', direction: 'asc' });
  const [pagination, setPagination] = useState<{ key: string; cursors: Array<string | null>; index: number }>({ key: '', cursors: [null], index: 0 });
  const [selection, setSelection] = useState<{ key: string; ids: Set<string> }>({ key: '', ids: new Set() });
  const [actionsOpen, setActionsOpen] = useState(false);
  const [exclusionsOpen, setExclusionsOpen] = useState(false);
  const pendingExclusions = useRef(false);
  const actionsTrigger = useRef<HTMLButtonElement>(null);
  const [archiveFilter, setArchiveFilter] = useState<IncidentArchiveFilter>('HOT');
  const [statusStats, setStatusStats] = useState<Record<string, number>>({});
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error'; incidentId?: string; authStatus?: 401 | 403; authAction?: 'ADD_NOTE' | 'ASSIGN' } | null>(null);
  const [rawLogExpanded, setRawLogExpanded] = useState(false);
  const [nmsPipeline, setNmsPipeline] = useState<NmsPipelineHealth | null>(null);

  // Cleanup states
  const [cleanupStatsOpen, setCleanupStatsOpen] = useState(false);
  const [cleanupStats, setCleanupStats] = useState<CleanupStats | null>(null);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupHours, setCleanupHours] = useState(168); // 7 days default
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupDryRun, setCleanupDryRun] = useState(true);

  // Detail view state
  const [selectedEvent, setSelectedEvent] = useState<AlarmEventData | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [incidentDetail, setIncidentDetail] = useState<IncidentDetailData | null>(null);
  const [incidentDetailLoading, setIncidentDetailLoading] = useState(false);
  const [incidentDetailError, setIncidentDetailError] = useState<string | null>(null);
  const [incidentDetailRevision, setIncidentDetailRevision] = useState(0);
  // Policy enrichment for FW_POLICY_CHANGED alarms
  const [policyData, setPolicyData] = useState<{ host: string; policies: FortiGatePolicy[]; total: number } | null>(null);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [policySearch, setPolicySearch] = useState('');
  const [policyExpanded, setPolicyExpanded] = useState(false);
  // Address object enrichment for ADDRESS_OBJECT_CHANGED alarms
  const [addressData, setAddressData] = useState<{ host: string; addresses: FortiGateAddress[]; total: number } | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [addressSearch, setAddressSearch] = useState('');
  const [addressExpanded, setAddressExpanded] = useState(false);
  // Port enrichment for NMS_PORT_DOWN alarms
  const [portData, setPortData] = useState<PortDetails | null>(null);
  const [portLoading, setPortLoading] = useState(false);
  const [portError, setPortError] = useState<string | null>(null);
  // Device-ports enrichment for NMS_DEVICE_UNREACHABLE alarms
  const [devicePortsData, setDevicePortsData] = useState<DevicePorts | null>(null);
  const [devicePortsLoading, setDevicePortsLoading] = useState(false);
  const [devicePortsError, setDevicePortsError] = useState<string | null>(null);
  // Discard/Whitelist dialog state
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discardReason, setDiscardReason] = useState('');
  const [discardLoading, setDiscardLoading] = useState(false);
  const [discardAccessError, setDiscardAccessError] = useState<401 | 403 | null>(null);
  const exclusionInFlight = useRef(false);
  // Track which event IDs are currently being acknowledged
  const [acknowledgingIds, setAcknowledgingIds] = useState<Set<string>>(new Set());

  const PAGE_SIZE = 25;
  const eventRequestSequence = useRef(0);
  const detailReturnFocus = useRef<HTMLElement | null>(null);
  const bulkOperationInFlight = useRef(false);
  const filterKey = JSON.stringify([statusFilter, severityFilter, sourceFilter, assigneeFilter, debouncedSearch, archiveFilter, ordering]);
  const page = pagination.key === filterKey ? pagination.index : 0;
  const pageCursor = pagination.key === filterKey ? pagination.cursors[page] : null;
  const viewKey = `${filterKey}:${page}`;
  const selectedIds = selection.key === viewKey ? selection.ids : new Set<string>();
  useEffect(() => { setSelection({ key: viewKey, ids: new Set() }); }, [viewKey]);

  const fetchAlarmHealth = useCallback(async () => {
    try {
      const response = await fetch('/api/health/alarms', { cache: 'no-store' });
      const data = await response.json();
      setNmsPipeline(data.components?.nmsPipeline ?? null);
    } catch {
      setNmsPipeline(null);
    }
  }, []);

  useEffect(() => {
    void fetchAlarmHealth();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void fetchAlarmHealth();
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [fetchAlarmHealth]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedFilter = params.get('filter');
    const requestedStatus = params.get('status');
    const requestedSearch = params.get('search');
    const requestedSeverity = params.get('severity');
    if (requestedSeverity && ['ALARM_CRITICAL', 'ALARM_HIGH', 'ALARM_MEDIUM', 'ALARM_LOW', 'ALARM_INFO'].includes(requestedSeverity)) setSeverityFilter(requestedSeverity);
    if (requestedStatus === 'all') setStatusFilter('ALL');
    else if (requestedStatus === 'OPEN,ACKNOWLEDGED') setStatusFilter('ACTIVE');
    else if (requestedStatus && ['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'CLOSED'].includes(requestedStatus)) setStatusFilter(requestedStatus as IncidentStatusFilter);
    else if (requestedFilter === 'unacknowledged') setStatusFilter('OPEN');
    else if (requestedFilter && ['ACKNOWLEDGED', 'RESOLVED', 'CLOSED'].includes(requestedFilter)) setStatusFilter(requestedFilter as IncidentStatusFilter);
    else if (requestedFilter?.startsWith('ALARM_')) setSeverityFilter(requestedFilter);
    if (requestedSearch) setSearch(requestedSearch);
    const requestedAssignee = params.get('assignee');
    if (requestedAssignee) setAssigneeFilter(requestedAssignee);
    setFiltersReady(true);
  }, []);

  useEffect(() => {
    if (!filtersReady) return;
    const url = new URL(window.location.href);
    if (assigneeFilter === 'all') url.searchParams.delete('assignee');
    else url.searchParams.set('assignee', assigneeFilter);
    window.history.replaceState(window.history.state, '', url);
  }, [assigneeFilter, filtersReady]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const fetchEvents = useCallback(async (silent = false) => {
    if (!filtersReady) return;
    const requestSequence = ++eventRequestSequence.current;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setFetchError(null);
    try {
      const params = new URLSearchParams({ limit: PAGE_SIZE.toString(), archiveState: archiveFilter });
      if (pageCursor) params.set('cursor', pageCursor);
      params.set('sort', ordering.sort);
      params.set('direction', ordering.direction);
      if (statusFilter === 'ACTIVE') params.set('status', 'OPEN,ACKNOWLEDGED');
      else if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (severityFilter !== 'all') params.set('severity', severityFilter);
      if (sourceFilter !== 'all') params.set('source', sourceFilter);
      if (assigneeFilter !== 'all') params.set('assignee', assigneeFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);

      const res = await fetch(`/api/alarm-incidents?${params}`);
      const data = await res.json();
      if (requestSequence !== eventRequestSequence.current) return;
      if (res.ok && data.success) {
        const newEvents: AlarmEventData[] = (data.data || []).map((incident: AlarmIncidentListRecord) => {
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
          };
        });
        setEvents(newEvents);
        setSelection(previous => ({ ...previous, ids: new Set([...previous.ids].filter(id => newEvents.some(event => event.incident?.id === id))) }));
        if (newEvents.length === 0 && page > 0) {
          setPagination(previous => ({ ...previous, index: Math.max(0, previous.index - 1) }));
        }
        setStats(data.overview?.activeSeverity || data.overview?.severity || data.stats?.severity || {});
        setStatusStats(data.overview?.status || data.stats?.status || {});
        setTotal(data.total || 0);
        setNextCursor(data.nextCursor || null);
        setHasMore(Boolean(data.nextCursor));
      } else {
        setFetchError(uiError(data.error || "Olay kayıtları alınamadı."));
      }
    } catch (err) {
      if (requestSequence !== eventRequestSequence.current) return;
      console.error('Fetch events error:', err);
      setFetchError(uiError("Olay kayıtları alınamadı. Bağlantınızı kontrol edip tekrar deneyin."));
    } finally {
      if (requestSequence === eventRequestSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [statusFilter, severityFilter, sourceFilter, assigneeFilter, filtersReady, debouncedSearch, archiveFilter, ordering, pageCursor, page]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  useEffect(() => {
    const incidentId = selectedEvent?.incident?.id;
    setIncidentDetail(null);
    setIncidentDetailError(null);
    if (!detailOpen || !incidentId) {
      setIncidentDetailLoading(false);
      return;
    }
    const controller = new AbortController();
    setIncidentDetailLoading(true);
    fetch(`/api/alarm-incidents/${encodeURIComponent(incidentId)}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok || !payload.success || payload.data?.id !== incidentId) throw new Error(uiError(payload.error || "Olay ayrıntıları alınamadı."));
        if (!controller.signal.aborted) setIncidentDetail(payload.data as IncidentDetailData);
      })
      .catch(error => { if (!controller.signal.aborted) setIncidentDetailError(uiError(error instanceof Error ? error.message : "Olay ayrıntıları alınamadı.")); })
      .finally(() => { if (!controller.signal.aborted) setIncidentDetailLoading(false); });
    return () => controller.abort();
  }, [detailOpen, selectedEvent?.incident?.id, incidentDetailRevision]);

  const changeSort = (sort: IncidentSort) => setOrdering(previous => ({
    sort,
    direction: previous.sort === sort ? previous.direction === 'asc' ? 'desc' : 'asc' : sort === 'severity' ? 'asc' : 'desc',
  }));
  const nextPage = () => {
    if (!nextCursor || loading || refreshing) return;
    const cursors = pagination.key === filterKey ? pagination.cursors.slice(0, page + 1) : [null];
    setPagination({ key: filterKey, cursors: [...cursors, nextCursor], index: page + 1 });
  };
  const previousPage = () => setPagination(previous => ({ ...previous, index: Math.max(0, previous.index - 1) }));

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
    } catch {
      setMessage({ text: 'Arşivleme işlemi başarısız', type: 'error' });
    } finally {
      setCleanupLoading(false);
    }
  };

  // Auto-refresh events silently every 2 minutes (no loading spinner)
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') fetchEvents(true);
    }, 120000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchEvents(true);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
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
    } catch {
      setMessage({ text: 'Alarm tarama hatasi', type: 'error' });
    } finally {
      setChecking(false);
    }
  };

  const transitionIncident = async (
    event: AlarmEventData,
    action: IncidentDetailAction,
    payload: IncidentActionPayload = {},
  ) => {
    const incidentId = event.incident?.id;
    if (!incidentId) {
      setMessage({ text: "Bu eski alarm henüz bir olay ile ilişkilendirilmemiş", type: 'error' });
      return false;
    }
    if (acknowledgingIds.has(incidentId)) return false;
    setAcknowledgingIds(prev => new Set(prev).add(incidentId));
    try {
      const res = await fetch('/api/alarm-incidents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [incidentId], action, ...payload }),
      });
      if ((action === 'ADD_NOTE' || action === 'ASSIGN') && (res.status === 401 || res.status === 403)) {
        const text = action === 'ASSIGN' ? (res.status === 401
          ? 'Oturumunuzun süresi doldu veya oturumunuz geçersiz. Tekrar giriş yapın. Sorumlu seçiminiz bu pencerede korunuyor.'
          : payload.assigneeId === null ? 'Sorumlu atamasını kaldırma yetkiniz yok. Sorumlu seçiminiz korundu.' : 'Sorumlu değiştirme yetkiniz yok. Sorumlu seçiminiz korundu.') : (res.status === 401
          ? 'Oturumunuzun süresi doldu veya oturumunuz geçersiz. Tekrar giriş yapın. Not taslağınız bu pencerede korunuyor.'
          : 'Operasyon notu ekleme yetkiniz yok. Not taslağınız korundu.');
        setMessage({ text, type: 'error', incidentId, authStatus: res.status, authAction: action });
        return false;
      }
      const data = await res.json();
      if (res.ok && data.success) {
        const labels = {
          ACKNOWLEDGE: 'Alarm onaylandı',
          UNACKNOWLEDGE: 'Onay geri alındı',
          RESOLVE: 'Alarm çözüldü',
          CLOSE: 'Alarm kapatıldı',
          ARCHIVE: 'Alarm arşivlendi',
          RESTORE: 'Alarm arşivden çıkarıldı',
          SET_LEGAL_HOLD: 'Alarm için legal hold etkinleştirildi',
          RELEASE_LEGAL_HOLD: 'Alarm legal hold korumasından çıkarıldı',
          ASSIGN: payload.assigneeId ? "Olay sorumlusu güncellendi" : 'Sorumlu ataması kaldırıldı',
          ADD_NOTE: 'Operasyon notu eklendi',
        };
        setMessage({ text: labels[action], type: 'success', incidentId });
        const updated = data.data?.[0];
        if (updated?.id === incidentId) setSelectedEvent(previous => previous?.incident?.id === incidentId ? { ...previous, incident: { ...previous.incident, ...updated } } : previous);
        setIncidentDetailRevision(value => value + 1);
        void fetchEvents(true);
        return true;
      } else {
        setMessage({ text: `İşlem hatası: ${data.error || 'Bilinmeyen hata'}`, type: 'error', incidentId });
      }
    } catch (err) {
      console.error("Olay transition error:", err);
      setMessage({ text: "Olay güncellenirken bağlantı hatası oluştu", type: 'error', incidentId });
    } finally {
      setAcknowledgingIds(prev => {
        const next = new Set(prev);
        next.delete(incidentId);
        return next;
      });
    }
    return false;
  };

  const assignSelected = async (assigneeId: string): Promise<IncidentBulkAssignmentResult> => {
    if (bulkOperationInFlight.current || acknowledgingIds.size > 0 || loading || refreshing) return { success: false, error: uiError('Devam eden işlemin tamamlanmasını bekleyin.') };
    const ids = events.filter(event => event.incident && selectedIds.has(event.incident.id)).map(event => event.incident!.id);
    if (ids.length === 0 || !assigneeId) return { success: false, error: uiError("Olay ve sorumlu seçin.") };
    bulkOperationInFlight.current = true;
    setAcknowledgingIds(new Set(ids)); setMessage(null);
    try {
      const response = await fetch('/api/alarm-incidents', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action: 'ASSIGN', assigneeId }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(uiError(result.error || 'Toplu atama yapılamadı.'));
      const updated: NonNullable<AlarmEventData['incident']>[] = result.data || [];
      setSelectedEvent(previous => {
        const match = updated.find(incident => incident.id === previous?.incident?.id);
        return previous?.incident && match ? { ...previous, incident: { ...previous.incident, ...match } } : previous;
      });
      setIncidentDetailRevision(value => value + 1);
      setSelection({ key: viewKey, ids: new Set() });
      setMessage({ text: `${result.updated ?? ids.length} olay için sorumlu ataması kaydedildi.`, type: 'success' });
      await fetchEvents(true);
      return { success: true };
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : 'Toplu atama sırasında bağlantı hatası oluştu.';
      setMessage({ text: error, type: 'error' });
      return { success: false, error };
    } finally {
      setAcknowledgingIds(new Set()); bulkOperationInFlight.current = false;
    }
  };

  const transitionSelected = async (action: IncidentBulkLifecycleAction, reason: string): Promise<IncidentBulkLifecycleResult> => {
    if (bulkOperationInFlight.current || acknowledgingIds.size > 0 || loading || refreshing) return { success: false, error: uiError('Devam eden işlemin tamamlanmasını bekleyin.') };
    if (!reason?.trim()) return { success: false, error: uiError('İşlem açıklaması zorunludur.') };
    const selected = events.filter(event => event.incident && selectedIds.has(event.incident.id));
    if (!selected.some(event => isIncidentBulkLifecycleEligible(event.incident!.status, action))) return { success: false, error: uiError('Bu işlem için uygun durumda seçili kayıt kalmadı.') };
    const ids = selected.map(event => event.incident!.id);
    bulkOperationInFlight.current = true;
    setAcknowledgingIds(new Set(ids)); setMessage(null);
    try {
      const response = await fetch('/api/alarm-incidents', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action, bulk: true, reason }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(uiError(result.error || 'Toplu durum işlemi yapılamadı.'));
      if (result.updated === 0) throw new Error(uiError('İşlem uygulanabilecek kayıt kalmadı. Önceki isteğin sonucu sunucuda kaydedilmiş olabilir. Listeyi yenileyerek olay geçmişini kontrol edin; seçiminiz ve açıklamanız korundu.'));
      const updated: NonNullable<AlarmEventData['incident']>[] = result.data || [];
      setSelectedEvent(previous => {
        const match = updated.find(incident => incident.id === previous?.incident?.id);
        return previous?.incident && match ? { ...previous, incident: { ...previous.incident, ...match } } : previous;
      });
      setIncidentDetailRevision(value => value + 1);
      setSelection({ key: viewKey, ids: new Set() });
      const count = result.updated ?? updated.length;
      const skipped = result.skipped || 0;
      setMessage({ text: `${count} olay ${action === 'RESOLVE' ? 'çözüldü olarak işaretlendi' : 'kapatıldı'}.${skipped ? ` ${skipped} uygun olmayan kayıt değiştirilmedi.` : ''}`, type: 'success' });
      await fetchEvents(true);
      return { success: true };
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : 'Toplu durum işlemi sırasında bağlantı hatası oluştu.';
      setMessage({ text: error, type: 'error' });
      return { success: false, error };
    } finally { setAcknowledgingIds(new Set()); bulkOperationInFlight.current = false; }
  };

  const acknowledgeSelected = async () => {
    if (acknowledgingIds.size > 0 || loading || refreshing) return;
    const unackedIds = events
      .filter((event: AlarmEventData) => event.incident?.status === 'OPEN' && selectedIds.has(event.incident.id))
      .map((event: AlarmEventData) => event.incident!.id);
    if (unackedIds.length === 0) return;
    setAcknowledgingIds(new Set(unackedIds));
    try {
      const res = await fetch('/api/alarm-incidents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: unackedIds, action: 'ACKNOWLEDGE' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(uiError(data.error || 'Incident’lar onaylanamadı.'));
      setSelection({ key: viewKey, ids: new Set() });
      setMessage({ text: `${data.updated ?? unackedIds.length} olay onaylandı.`, type: 'success' });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Onaylama sırasında bağlantı hatası oluştu.', type: 'error' });
    } finally {
      // The API may have applied part of a batch before returning an error.
      await fetchEvents(true);
      setAcknowledgingIds(new Set());
    }
  };

  // Add to whitelist (discard alarm)
  const addToWhitelist = async () => {
    if (!selectedEvent || !discardReason.trim() || exclusionInFlight.current) return;
    const noticeId = selectedEvent.incident?.id || selectedEvent.id;
    exclusionInFlight.current = true;
    setDiscardLoading(true);
    setDiscardAccessError(null);
    try {
      const { field, value } = incidentExclusionTarget(selectedEvent);

      // Validate value is not null/empty before calling API
      if (!value) {
        setMessage({ text: 'Hariç tutulacak kaynak bilgisi bulunamadı.', type: 'error', incidentId: noticeId });
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
        }),
      });
      
      if (res.status === 401 || res.status === 403) {
        setDiscardAccessError(res.status);
        setMessage({ text: res.status === 401
          ? 'Oturumunuzun süresi doldu veya oturumunuz geçersiz. Tekrar giriş yapın. Açıklamanız bu pencerede korunuyor.'
          : 'Bu alarmı hariç tutma yetkiniz yok. Açıklamanız korundu.', type: 'error', incidentId: noticeId });
        return;
      }
      const data = await res.json();
      if (res.ok && data.success) {
        setMessage({ text: 'Alarm yok sayma listesine eklendi.', type: 'success', incidentId: noticeId });
        setDiscardOpen(false);
        setDiscardReason('');
        fetchEvents(true);
      } else {
        setMessage({ text: data.error || 'Alarm hariç tutulamadı.', type: 'error', incidentId: noticeId });
      }
    } catch (err) {
      console.error('Whitelist error:', err);
      setMessage({ text: 'Alarm hariç tutulurken bağlantı hatası oluştu.', type: 'error', incidentId: noticeId });
    } finally {
      exclusionInFlight.current = false;
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
        setAddressError(uiError(data.error || 'Adres nesneleri alinamadi'));
      }
    } catch (err) {
      setAddressError(uiError(err instanceof Error ? err.message : 'Adres nesneleri alinamadi'));
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
        setDevicePortsError(uiError('Could not parse device name from alarm'));
        setDevicePortsLoading(false);
        return;
      }

      const devRes = await fetch('/api/integrations/nms/devices?enabled=true');
      const devData: { devices?: Array<Pick<Device, 'id' | 'name'>> } = await devRes.json();
      const device = devData.devices?.find(d => d.name === deviceName);

      if (!device) {
        setDevicePortsError(uiError(`Device "${deviceName}" not found in NMS`));
        setDevicePortsLoading(false);
        return;
      }

      const res = await fetch(`/api/integrations/nms/devices/${device.id}/ports/monitored`);
      const data = await res.json();
      if (data.interfaces) {
        setDevicePortsData(data);
      } else {
        setDevicePortsError(uiError(data.error || 'Port list not found'));
      }
    } catch (err) {
      setDevicePortsError(uiError(err instanceof Error ? err.message : "Port listesi bulunamadı."));
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
        setPortError(uiError('Could not parse port name from alarm'));
        setPortLoading(false);
        return;
      }
      const portName = match[1].trim();
      const deviceName = match[2].trim();
      
      // Find device ID by name
      const devRes = await fetch('/api/integrations/nms/devices?enabled=true');
      const devData: { devices?: Array<Pick<Device, 'id' | 'name'>> } = await devRes.json();
      const device = devData.devices?.find(d => d.name === deviceName);
      
      if (!device) {
        setPortError(uiError(`Device "${deviceName}" not found in NMS`));
        setPortLoading(false);
        return;
      }

      const res = await fetch(`/api/integrations/nms/devices/${device.id}/ports/${encodeURIComponent(portName)}`);
      const data = await res.json();
      if (data.port) {
        setPortData(data);
      } else {
        setPortError(uiError(data.error || 'Port details not found'));
      }
    } catch (err) {
      setPortError(uiError(err instanceof Error ? err.message : "Port detayları bulunamadı."));
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
        setPolicyError(uiError(data.error || 'Politika listesi alınamadı'));
      }
    } catch {
      setPolicyError(uiError('Bağlantı hatası'));
    } finally {
      setPolicyLoading(false);
    }
  };

  // Filtering is now server-side; events array is the filtered result

  const openEventDetail = (event: AlarmEventData) => {
    setMessage(null);
    setSelectedEvent(event);
    setRawLogExpanded(false);
    setPolicyData(null);
    setPolicyError(null);
    setPolicySearch('');
    setPolicyExpanded(false);
    setDevicePortsData(null);
    setDevicePortsError(null);
    setPortData(null);
    setPortError(null);
    setAddressData(null);
    setAddressError(null);
    setAddressSearch('');
    setAddressExpanded(false);
    setDetailOpen(true);
  };

  const exportIncidents = () => {
    const params = new URLSearchParams({ archiveState: archiveFilter });
    if (statusFilter === 'ACTIVE') params.set('status', 'OPEN,ACKNOWLEDGED');
    else if (statusFilter !== 'ALL') params.set('status', statusFilter);
    if (severityFilter !== 'all') params.set('severity', severityFilter);
    if (sourceFilter !== 'all') params.set('source', sourceFilter);
    if (assigneeFilter !== 'all') params.set('assignee', assigneeFilter);
    if (debouncedSearch) params.set('search', debouncedSearch);
    params.set('sort', ordering.sort);
    params.set('direction', ordering.direction);
    window.location.href = `/api/alarm-incidents/export?${params}`;
  };

  return (
    <div className={incidentStyles.workspace}>
      <div className="w-full">
        <header className={incidentStyles.heading}>
          <div className={incidentStyles.headingGroup}>
            <span className={incidentStyles.titleIcon}><BellRing size={24} aria-hidden="true" /></span>
            <div><h1 className={incidentStyles.title}>Olay Merkezi</h1>
            <p className={incidentStyles.subtitle}>Olayları önceliklendirin ve çözüm sürecini takip edin.</p></div>
          </div>
          <div className={incidentStyles.utilities}>
            <div className={incidentStyles.actions}>
            <Button variant="outline" onClick={runAlarmCheck} disabled={checking || acknowledgingIds.size > 0}>
              {checking ? <RefreshCw size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
              {checking ? 'Taranıyor' : 'Alarm tara'}
            </Button>
            <Popover open={actionsOpen} onOpenChange={setActionsOpen}>
              <PopoverTrigger asChild><Button ref={actionsTrigger} variant="outline" disabled={acknowledgingIds.size > 0}><MoreHorizontal size={17} aria-hidden="true" />İşlemler<ChevronDown size={14} aria-hidden="true" /></Button></PopoverTrigger>
              <PopoverContent align="end" className="z-[1050] w-60 p-1.5" aria-label="Olay işlemleri" onCloseAutoFocus={event => {
                if (pendingExclusions.current) {
                  event.preventDefault(); pendingExclusions.current = false; setExclusionsOpen(true);
                }
              }}>
                <Button variant="ghost" className="w-full justify-start gap-3" disabled={loading || refreshing} onClick={() => { setActionsOpen(false); void fetchEvents(); }}><RefreshCw size={16} />Listeyi yenile</Button>
                <Button variant="ghost" className="w-full justify-start gap-3" onClick={() => { setActionsOpen(false); exportIncidents(); }}><Download size={16} />CSV olarak indir</Button>
                <div className="my-1 border-t" />
                <Button variant="ghost" className="w-full justify-start gap-3" onClick={() => { pendingExclusions.current = true; setActionsOpen(false); }}><Shield size={16} />Hariç tutma kayıtları</Button>
                <Button variant="ghost" className="w-full justify-start gap-3" onClick={() => { setActionsOpen(false); void fetchCleanupStats(); setCleanupStatsOpen(true); }}><BarChart3 size={16} />Saklama ayarları</Button>
                <Button variant="ghost" className="w-full justify-start gap-3" onClick={() => { setActionsOpen(false); setCleanupOpen(true); }}><Archive size={16} />Arşivleme işlemleri</Button>
              </PopoverContent>
            </Popover>
            </div>
            {nmsPipeline && nmsPipeline.state !== 'healthy' && <div className={incidentStyles.health}>
              <Popover><PopoverTrigger asChild><button type="button"><Info size={16} aria-hidden="true" />İzleme kapsamı eksik</button></PopoverTrigger>
                <PopoverContent align="end" className="z-[1050] w-[min(350px,calc(100vw-32px))] p-5">
                  <h2 className="text-sm font-semibold">NMS izleme kapsamı</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{nmsPipeline.blockingReasons.join(' ') || 'Switch alarm izlemesi için yapılandırmayı kontrol edin.'}</p>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-muted-foreground">Cihaz</dt><dd className="mt-1 font-medium">{nmsPipeline.registeredDevices}/{nmsPipeline.pollingDevices}</dd></div><div><dt className="text-muted-foreground">İzlenen port</dt><dd className="mt-1 font-medium">{nmsPipeline.monitoredPorts}</dd></div><div><dt className="text-muted-foreground">Taze arayüz</dt><dd className="mt-1 font-medium">{nmsPipeline.freshInterfaces}</dd></div><div><dt className="text-muted-foreground">Taze metrik</dt><dd className="mt-1 font-medium">{nmsPipeline.freshHealthMetrics}</dd></div></dl>
                </PopoverContent>
              </Popover>
              <Link href={nmsPipeline.pollingDevices === 0 ? '/integrations/nms/add-device' : '/integrations/nms/devices'}>NMS ayarları<ArrowRight size={14} aria-hidden="true" /></Link>
            </div>}
          </div>
        </header>

        <IncidentOverview status={statusStats} severity={stats} archive={archiveFilter} loading={loading} />

        {message && (
          <div role={message.type === 'error' ? 'alert' : 'status'} className={cn('mb-4 flex items-center gap-2 border-l-2 px-4 py-3 text-sm', message.type === 'success' ? 'border-emerald-500 bg-emerald-500/5 text-emerald-700 dark:text-emerald-200' : 'border-rose-500 bg-rose-500/5 text-rose-700 dark:text-rose-200')}>
            {message.type === 'success' ? <CheckCircle className="h-4 w-4 shrink-0" aria-hidden="true" /> : <AlertOctagon className="h-4 w-4 shrink-0" aria-hidden="true" />}
            <span className="flex-1">{uiError(message.text)}</span>
            <Button variant="ghost" size="sm" className="h-8" onClick={() => setMessage(null)}><ActionIcon action="cancel" />Kapat</Button>
          </div>
        )}

        <IncidentFilters
          status={statusFilter}
          severity={severityFilter}
          source={sourceFilter}
          assignee={assigneeFilter}
          archive={archiveFilter}
          search={search}
          counts={statusStats}
          disabled={acknowledgingIds.size > 0}
          onStatus={setStatusFilter}
          onSeverity={setSeverityFilter}
          onSource={setSourceFilter}
          onAssignee={setAssigneeFilter}
          onArchive={setArchiveFilter}
          onSearch={setSearch}
        />

        <IncidentList
          events={events as IncidentListItem[]}
          total={total}
          loading={loading}
          refreshing={refreshing}
          hasMore={hasMore}
          error={fetchError}
          acknowledgingIds={acknowledgingIds}
          selectedIds={selectedIds}
          onSelection={(ids) => setSelection({ key: viewKey, ids })}
          page={page}
          sort={ordering.sort}
          direction={ordering.direction}
          onSort={changeSort}
          onPrevious={previousPage}
          onNext={nextPage}
          onOpen={(event) => openEventDetail(event as AlarmEventData)}
          onAcknowledgeSelected={acknowledgeSelected}
          onAssignSelected={assignSelected}
          onTransitionSelected={transitionSelected}
          onRetry={() => void fetchEvents()}
        />
      </div>

      {/* Retention Statistics Dialog */}
      {exclusionsOpen && <IncidentExclusions onClose={() => setExclusionsOpen(false)} onReturnFocus={() => actionsTrigger.current?.focus()} />}
      <Dialog open={cleanupStatsOpen} onOpenChange={setCleanupStatsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Alarm Saklama Durumu</DialogTitle>
            <DialogDescription>
              Alarm olay yaşam döngüsü ve arşiv politikası
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
                <div className="flex justify-between text-sm"><span>Yasal Saklama</span><span className="font-mono font-medium">{cleanupStats?.counts?.legalHold || 0}</span></div>
                <div className="flex justify-between text-sm"><span>Sıkıştırılmış payload</span><span className="font-mono font-medium">{cleanupStats?.counts?.compressedPayloads || 0}</span></div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCleanupStatsOpen(false)}><ActionIcon action="cancel" />
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
              Yalnızca CLOSED durumundaki olay kayıtları arşivlenir. Olay geçmişi ve audit izi silinmez.
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
                <p className="font-medium text-blue-900 dark:text-blue-200 mb-1">Önizleme</p>
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
            ><ActionIcon action="cancel" />
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

      {/* Incident workspace: overview, history and preserved source-specific technical details. */}
      <Dialog open={detailOpen} onOpenChange={open => { if (exclusionInFlight.current) return; if (!open && discardOpen) setDiscardOpen(false); else setDetailOpen(open); }}>
        <DialogContent className={discardOpen ? 'max-w-md' : detailStyles.dialog} closeLabel={discardOpen ? 'Hariç tutmayı iptal et' : 'Detayı kapat'} onOpenAutoFocus={event => {
          detailReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          if (!discardOpen && event.target instanceof HTMLElement) {
            const heading = event.target.querySelector<HTMLElement>('[data-incident-heading]');
            if (heading) { event.preventDefault(); heading.focus({ preventScroll: true }); }
          }
        }} onCloseAutoFocus={event => {
          if (detailReturnFocus.current?.isConnected) { event.preventDefault(); detailReturnFocus.current.focus({ preventScroll: true }); }
        }}>
          {discardOpen ? <>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Alarmı hariç tut
            </DialogTitle>
            <DialogDescription>
              Seçilen değerle eşleşen alarmlar yok sayma listesine eklenir. Yanlış pozitif olduğundan emin olduğunuz kayıtlar için kullanın.
            </DialogDescription>
          </DialogHeader>

          {selectedEvent && (
            <div className="space-y-4 py-4">
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-xs font-semibold mb-1">Alarm:</p>
                <p className="text-sm">{selectedEvent.title}</p>
              </div>

              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-xs font-semibold mb-1">Hariç tutulacak değer:</p>
                <p className="text-sm font-mono">
                  {(() => {
                    const { field, value } = incidentExclusionTarget(selectedEvent);
                    return `${field}: ${value || 'N/A'}`;
                  })()}
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="incident-exclusion-reason" className="text-sm font-medium">Hariç tutma nedeni (zorunlu)</label>
                <textarea
                  id="incident-exclusion-reason"
                  required
                  autoFocus
                  className="w-full min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Hariç tutma nedeni (örn. kurum içi DNS sunucusu)"
                  value={discardReason}
                  disabled={discardLoading}
                  onChange={(e) => setDiscardReason(e.target.value)}
                />
              </div>
            </div>
          )}
          {message?.type === 'error' && message.incidentId === (selectedEvent?.incident?.id || selectedEvent?.id) && <p role="alert" className="text-sm text-destructive">{uiError(message.text)}</p>}

          <DialogFooter>
            {discardAccessError === 401 && !discardLoading && <Button asChild variant="outline"><Link href="/login?next=%2Fdashboard%2Falerts" target="_blank" rel="noopener noreferrer">Yeni sekmede giriş yap</Link></Button>}
            <Button variant="outline" onClick={() => setDiscardOpen(false)} disabled={discardLoading}>
              İptal
            </Button>
            <Button
              variant="destructive"
              onClick={addToWhitelist}
              disabled={!discardReason.trim() || discardLoading}
            >
              {discardLoading ? 'Ekleniyor…' : 'Hariç tut'}
            </Button>
          </DialogFooter>
</> : selectedEvent && (() => {
            const parsed = parseAlarmMessage(selectedEvent.message || '', selectedEvent.alarm?.description || '');
            return <IncidentDetailWorkspace
              key={selectedEvent.incident?.id || selectedEvent.id}
              event={selectedEvent}
              detail={incidentDetail}
              loading={incidentDetailLoading}
              error={incidentDetailError}
              busy={Boolean(selectedEvent.incident && acknowledgingIds.has(selectedEvent.incident.id))}
              notice={message?.incidentId === (selectedEvent.incident?.id || selectedEvent.id) ? message : null}
              description={selectedEvent.alarm.description || parsed.description}
              recommendedAction={parsed.recommendedAction}
              onRetry={() => setIncidentDetailRevision(value => value + 1)}
              onAction={(action, payload) => transitionIncident(selectedEvent, action, payload)}
              onDiscard={() => { setMessage(null); setDiscardReason(''); setDiscardAccessError(null); setDiscardOpen(true); }}
            >
              <div className={detailStyles.technical}>
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
                          Değişiklik Detayları
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
                                            <span className="text-muted-foreground italic">değiştirildi</span>
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
                              ... ve {selectedEvent.rawData!.length - 10} değişiklik daha
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
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">İşlem Detayları</p>
                        <div className="grid grid-cols-2 gap-3">
                          {ui && (
                            <div className="p-3 rounded-lg bg-muted/30">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Erişim Yöntemi</p>
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
                              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Günlük Açıklaması</p>
                              <p className="text-sm font-medium">{logdesc}</p>
                            </div>
                          )}
                        </div>
                        {msgDecoded && msgDecoded !== logdesc && (
                          <div className="mt-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-700 dark:text-blue-300 mb-1">İşlem Özeti</p>
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
                        <p className="text-muted-foreground text-xs">Bildirim gönderilmedi</p>
                      )}
                    </div>
                    <div className="p-3 rounded-lg bg-muted/30">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Olay Durumu</p>
                      <p className="text-sm font-semibold">{selectedEvent.incident ? incidentStatusLabels[selectedEvent.incident.status] : 'Eski alarm kaydı'}</p>
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

                  {/* Firewall Policy Enrichment — only for FW_POLICY_CHANGED */}
                  {selectedEvent.alarm?.code === 'FW_POLICY_CHANGED' && (
                    <section className="rounded-lg border overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2.5 bg-orange-50 dark:bg-orange-900/20 border-b">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4 text-orange-500" />
                          <span className="text-xs font-bold uppercase tracking-widest text-orange-700 dark:text-orange-300">
                            Güvenlik Politikaları
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
                          <AlertOctagon className="h-3.5 w-3.5 inline mr-1" />{uiError(policyError)}
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
                                  <th className="px-2 py-1.5 font-semibold border-b">Kaynak Arayüz / Adres</th>
                                  <th className="px-2 py-1.5 font-semibold border-b">Hedef Arayüz / Adres</th>
                                  <th className="px-2 py-1.5 font-semibold border-b">Servis</th>
                                  <th className="px-2 py-1.5 font-semibold border-b">Aksiyon</th>
                                  <th className="px-2 py-1.5 font-semibold border-b">Durum</th>
                                </tr>
                              </thead>
                              <tbody>
                                {policyData.policies
                                  .filter((p) => {
                                    if (!policySearch) return true;
                                    const t = policySearch.toLowerCase();
                                    return (
                                      String(p.policyid).includes(t) ||
                                      (p.name || '').toLowerCase().includes(t) ||
                                      (p.srcintf || []).some((x) => x.name?.toLowerCase().includes(t)) ||
                                      (p.dstintf || []).some((x) => x.name?.toLowerCase().includes(t)) ||
                                      (p.srcaddr || []).some((x) => x.name?.toLowerCase().includes(t)) ||
                                      (p.dstaddr || []).some((x) => x.name?.toLowerCase().includes(t)) ||
                                      (p.service || []).some((x) => x.name?.toLowerCase().includes(t))
                                    );
                                  })
                                  .map((p) => (
                                    <tr key={p.policyid} className="border-b hover:bg-muted/10">
                                      <td className="px-2 py-1.5 font-mono text-muted-foreground">{p.policyid}</td>
                                      <td className="px-2 py-1.5 max-w-[120px] truncate" title={p.name}>{p.name || <span className="text-muted-foreground italic">isimsiz</span>}</td>
                                      <td className="px-2 py-1.5">
                                        <div className="text-[10px] text-muted-foreground">{(p.srcintf || []).map((x) => x.name).join(', ')}</div>
                                        <div>{(p.srcaddr || []).map((x) => x.name).join(', ')}</div>
                                      </td>
                                      <td className="px-2 py-1.5">
                                        <div className="text-[10px] text-muted-foreground">{(p.dstintf || []).map((x) => x.name).join(', ')}</div>
                                        <div>{(p.dstaddr || []).map((x) => x.name).join(', ')}</div>
                                      </td>
                                      <td className="px-2 py-1.5 max-w-[100px] truncate">{(p.service || []).map((x) => x.name).join(', ')}</td>
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
                          <AlertOctagon className="h-3.5 w-3.5 inline mr-1" />{uiError(addressError)}
                        </div>
                      )}


                      {addressData && addressExpanded && (
                        <div className="p-3 space-y-2">
                          <Input
                            placeholder="Adres ara… (ad, IP, alt ağ, FQDN)"
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
                                  .filter((a) => {
                                    if (!addressSearch) return true;
                                    const t = addressSearch.toLowerCase();
                                    return (
                                      (a.name || '').toLowerCase().includes(t) ||
                                      (a.subnet || '').toLowerCase().includes(t) ||
                                      (a.fqdn || '').toLowerCase().includes(t) ||
                                      (a.type || '').toLowerCase().includes(t)
                                    );
                                  })
                                  .map((a) => (
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
                            Port Detayları
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
                          <AlertOctagon className="h-3.5 w-3.5 inline mr-1" />{uiError(portError)}
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
                              <span className="text-muted-foreground">Üretici:</span>{' '}
                              <span className="font-medium">{portData.device.vendor || '—'}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Yönetim IP Adresi:</span>{' '}
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
                                <span className="text-muted-foreground">Yönetim Durumu:</span>{' '}
                                <span className={`font-semibold ${portData.port.adminStatus === 'up' ? 'text-green-600' : 'text-red-500'}`}>
                                  {portData.port.adminStatus === 'up' ? "✓ Açık" : "✕ Kapalı"}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Çalışma Durumu:</span>{' '}
                                <span className={`font-semibold ${portData.port.operStatus === 'up' ? 'text-green-600' : 'text-red-500'}`}>
                                  {portData.port.operStatus === 'up' ? "✓ Açık" : "✕ Kapalı"}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Hız:</span>{' '}
                                <span className="font-medium">
                                  {portData.port.speed ? `${(Number(portData.port.speed) / 1000000).toFixed(0)} Mbps` : '—'}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">MTU:</span>{' '}
                                <span>{portData.port.mtu || '—'}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Son Veri Toplama:</span>{' '}
                                <span className="font-mono text-[10px]">
                                  {portData.port.lastPolledAt ? new Date(portData.port.lastPolledAt).toLocaleString('tr-TR') : '—'}
                                </span>
                              </div>
                              <div className="col-span-2">
                                <span className="text-muted-foreground">Açıklama:</span>{' '}
                                <span className="font-medium">{portData.port.description || '—'}</span>
                              </div>
                            </div>
                          </div>

                          {/* Error Counters */}
                          <div className="rounded-md border p-3 bg-muted/30">
                            <div className="text-xs font-semibold mb-2">Hata Sayaçlari</div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="text-center p-2 rounded bg-red-50 dark:bg-red-900/10">
                                <div className="text-muted-foreground">Gelen Hatalar</div>
                                <div className="font-mono font-semibold text-red-500 text-sm">
                                  {Number(portData.port.inErrors || 0).toLocaleString('tr-TR')}
                                </div>
                              </div>
                              <div className="text-center p-2 rounded bg-red-50 dark:bg-red-900/10">
                                <div className="text-muted-foreground">Giden Hatalar</div>
                                <div className="font-mono font-semibold text-red-500 text-sm">
                                  {Number(portData.port.outErrors || 0).toLocaleString('tr-TR')}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Traffic Stats */}
                          <div className="rounded-md border p-3 bg-muted/30">
                            <div className="text-xs font-semibold mb-2">Trafik İstatistikleri</div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-muted-foreground">Gelen Bayt:</span>{' '}
                                <span className="font-mono">
                                  {portData.port.inOctets ? `${(Number(portData.port.inOctets) / 1048576).toFixed(2)} MB` : '—'}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Giden Bayt:</span>{' '}
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
                                {portData.neighbors.map((n, i) => (
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
                          <AlertOctagon className="h-3.5 w-3.5 inline mr-1" />{uiError(devicePortsError)}
                        </div>
                      )}

                      {devicePortsData && devicePortsData.interfaces.length > 0 && (() => {
                        const ifs = devicePortsData.interfaces;
                        const upCount = ifs.filter((i) => i.operStatus === 'up').length;
                        const downCount = ifs.filter((i) => i.operStatus === 'down').length;
                        const monitoredDown = ifs.filter((i) => i.monitored && i.operStatus === 'down');
                        return (
                          <div className="p-3 space-y-3">
                            {/* Summary */}
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div className="text-center p-2 rounded bg-green-50 dark:bg-green-900/10">
                                <div className="text-muted-foreground">Açık</div>
                                <div className="font-mono font-bold text-green-600 text-sm">{upCount}</div>
                              </div>
                              <div className="text-center p-2 rounded bg-red-50 dark:bg-red-900/10">
                                <div className="text-muted-foreground">Kapalı</div>
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
                                        <th className="px-3 py-1.5 text-center font-semibold">Yönetici</th>
                                        <th className="px-3 py-1.5 text-center font-semibold">Oper</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {monitoredDown.map((iface) => (
                                        <tr key={iface.id} className="border-t">
                                          <td className="px-3 py-1.5 font-mono font-medium">{iface.interfaceName}</td>
                                          <td className="px-3 py-1.5 text-muted-foreground">{(iface.description && iface.description !== 'None') ? iface.description : '—'}</td>
                                          <td className="px-3 py-1.5 text-center">
                                            <span className={`font-semibold ${iface.adminStatus === 'up' ? 'text-green-600' : 'text-red-500'}`}>
                                              {iface.adminStatus === 'up' ? "✓ Açık" : "✕ Kapalı"}
                                            </span>
                                          </td>
                                          <td className="px-3 py-1.5 text-center">
                                            <span className={`font-semibold ${iface.operStatus === 'up' ? 'text-green-600' : 'text-red-500'}`}>
                                              {iface.operStatus === 'up' ? "✓ Açık" : "✕ Kapalı"}
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
                                      <th className="px-3 py-1.5 text-center font-semibold">Yönetici</th>
                                      <th className="px-3 py-1.5 text-center font-semibold">Oper</th>
                                      <th className="px-3 py-1.5 text-center font-semibold">İzleniyor</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {ifs.map((iface) => (
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
                            Ham Günlük Verisi
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

              </div>
            </IncidentDetailWorkspace>;
          })()}
        </DialogContent>
      </Dialog>


    </div>
  );
}
