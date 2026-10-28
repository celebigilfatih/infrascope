'use client';

import { uiError } from '@/lib/i18n/tr';

import { PageHeading, PageStateFrame } from '@/components/ui/page-heading';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2,
  ArrowLeft,
  CheckCircle,
  Clock,
  Cpu,
  Network,
  Activity,
  AlertTriangle,
  Pencil,
  RefreshCw,
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
  Search,
  ShieldCheck,
  PauseCircle,
  MemoryStick,
  Save,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import { usePageBreadcrumb } from '@/components/layout/BreadcrumbProvider';
import { apiGet, apiPost } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { BackupReadiness } from '@/lib/nms/backup-platform';
import styles from './page.module.css';
import { dataFreshness, formatRelative as relativeTime, measuredPercent } from '@/lib/nms/device-monitoring-view';

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
  downSince: string | null;
  operUpSince: string | null;
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

function getConnectionStatus(device: DbDevice, now: number): 'online' | 'offline' | 'disabled' | 'unknown' {
  if (!device.pollingEnabled) return 'disabled';
  const freshness = dataFreshness(device.lastPolledAt, device.pollingInterval, now);
  return freshness === 'fresh' ? 'online' : freshness === 'delayed' ? 'offline' : 'unknown';
}

function StatCard({ icon: Icon, label, value, color }: { icon: LucideIcon; label: string; value: string; color: string }) {
  return (
    <div className={styles.stat}>
      <div className="flex items-center justify-between gap-2"><p className="text-xs font-medium">{label}</p><span className={cn(styles.statIcon, color)}><Icon aria-hidden="true" className="h-4 w-4" /></span></div>
      <p className="mt-1 wrap-break-word text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className={styles.infoRow}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`min-w-0 wrap-break-word text-right text-xs font-medium ${mono ? 'font-mono' : ''}`}>{value || 'Belirtilmedi'}</dd>
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
  const [backupAccess, setBackupAccess] = useState({ create: false, running: false, startup: false });
  const [backupReadiness, setBackupReadiness] = useState<BackupReadiness | null>(null);
  const [activeBackupJob, setActiveBackupJob] = useState<string | null>(null);
  const [triggerResult, setTriggerResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [viewBackup, setViewBackup] = useState<{ id: string; config: string; type: string; createdAt: string } | null>(null);
  const [viewLoading, setViewLoading] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DbNmsBackup | null>(null);
  const [deletingBackup, setDeletingBackup] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [interfaces, setInterfaces] = useState<DbNmsInterface[]>([]);
  const [healthMetrics, setHealthMetrics] = useState<DbNmsHealthMetric[]>([]);
  const [topologyLinks, setTopologyLinks] = useState<DbNmsTopologyLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState<DbDevice | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [portSearch, setPortSearch] = useState('');
  const [portFilter, setPortFilter] = useState('');
  const [portPage, setPortPage] = useState(1);
  const [portMessage, setPortMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [backupsLoaded, setBackupsLoaded] = useState(false);
  const draftRef = useRef(false);
  const deviceRequest = useRef<AbortController | null>(null);
  const backupActionTrigger = useRef<HTMLButtonElement | null>(null);
  const restoreBackupFocus = (event: Event) => {
    event.preventDefault();
    const target = backupActionTrigger.current;
    if (target?.isConnected && !target.disabled) target.focus();
    else document.getElementById('backup-list-refresh')?.focus();
  };

  const breadcrumbItems = useMemo(() => device ? [
    { label: 'NMS İzlenen Cihazlar', href: '/integrations/nms/devices' },
    { label: device.name },
  ] : null, [device]);
  usePageBreadcrumb(breadcrumbItems);

  // Port monitoring state
  const [monitoredIds, setMonitoredIds] = useState<Set<string>>(new Set());
  const [savingMonitored, setSavingMonitored] = useState(false);
  const [monitoredDirty, setMonitoredDirty] = useState(false);

  const loadBackups = useCallback(async () => {
    setBackupsLoading(true);
    setBackupError(null);
    setBackupReadiness(null);
    try {
      const res = await fetch(`/api/integrations/nms/devices/${deviceId}/backups`);
      const data = await res.json();
      if (res.ok) { setBackups(data.backups || []); setBackupAccess(data.permissions || { create: false, running: false, startup: false }); setBackupReadiness(data.readiness || null); setBackupsLoaded(true); }
      else setBackupError(uiError(data.error || 'Yedek listesi yüklenemedi.'));
    } catch (e: unknown) {
      setBackupError(uiError(e instanceof Error ? e.message : 'Yedekleme işlemi başarısız.'));
    } finally {
      setBackupsLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    if (!activeBackupJob) return;
    const timer = setInterval(async () => {
      const result = await apiGet(`/api/integrations/nms/backup-jobs?id=${encodeURIComponent(activeBackupJob)}`);
      const job = result.jobs?.[0];
      if (!job) { setTriggerResult({ ok: false, msg: 'Yedekleme durumu alınamadı. Kontrol yeniden denenecek.' }); return; }
      if (job.status === 'succeeded' || job.status === 'failed') {
        setTriggerResult({ ok: job.status === 'succeeded', msg: job.status === 'succeeded' ? 'Yedekleme tamamlandı.' : job.errorMessage || 'Yedekleme başarısız.' });
        setActiveBackupJob(null); void loadBackups();
      } else setTriggerResult({ ok: true, msg: job.status === 'retrying' ? 'Bağlantı hatası nedeniyle yeniden denenecek.' : 'Yedekleme işi devam ediyor.' });
    }, 3000);
    return () => clearInterval(timer);
  }, [activeBackupJob, deviceId, loadBackups]);

  const triggerBackup = async (backupType: string) => {
    if (triggering || activeBackupJob) return;
    setActiveTab('backups');
    setTriggering(true);
    setTriggerResult(null);
    try {
      const data = await apiPost(`/api/integrations/nms/devices/${deviceId}/backups`, { backupType }, { headers: { 'Idempotency-Key': crypto.randomUUID() } });
      if (data.success && data.job) {
        setTriggerResult({ ok: true, msg: 'Yedekleme işi kuyruğa alındı.' });
        setActiveBackupJob(data.job.id);
      } else {
        setTriggerResult({ ok: false, msg: data.hint || data.error || 'Yedekleme başlatılamadı.' });
      }
    } catch (e: unknown) {
      setTriggerResult({ ok: false, msg: e instanceof Error ? e.message : 'Yedekleme işlemi başarısız.' });
    } finally {
      setTriggering(false);
    }
  };

  const viewBackupConfig = async (backup: DbNmsBackup) => {
    setViewLoading(backup.id);
    try {
      const res = await fetch(`/api/integrations/nms/devices/${deviceId}/backups/${backup.id}`);
      const data = await res.json();
      if (res.ok) setViewBackup({ id: backup.id, config: data.configuration || '', type: backup.backupType, createdAt: backup.createdAt });
      else setBackupError(uiError(data.error || 'Yedek içeriği okunamadı.'));
    } catch (failure) {
      setBackupError(uiError(failure instanceof Error ? failure.message : 'Yedek içeriği okunamadı.'));
    } finally {
      setViewLoading(null);
    }
  };

  const deleteBackup = async (backupId: string) => {
    if (deletingBackup) return;
    setDeletingBackup(true); setDeleteError(null);
    try {
      const response = await fetch(`/api/integrations/nms/devices/${deviceId}/backups/${backupId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(uiError('Yedek silinemedi. Yönetici yetkinizi kontrol edip tekrar deneyin.'));
      setBackups(prev => prev.filter(b => b.id !== backupId)); setDeleteTarget(null);
    } catch (failure) { setDeleteError(uiError(failure instanceof Error ? failure.message : 'Yedek silinemedi.')); }
    finally { setDeletingBackup(false); }
  };

  const downloadConfig = (config: string, filename: string) => {
    const blob = new Blob([config], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const loadDevice = useCallback(async (silent = false) => {
    deviceRequest.current?.abort();
    const controller = new AbortController(); deviceRequest.current = controller;
    if (!silent) setLoading(true);
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`/api/integrations/nms/devices/${deviceId}`, { signal: controller.signal });
      const data = await res.json();
      if (!res.ok) {
        setError(uiError(res.status === 404 ? 'Cihaz bulunamadı veya NMS izleme yapılandırması kaldırılmış.' : 'Cihaz bilgileri yüklenemedi. Bağlantınızı ve erişim yetkinizi kontrol edin.'));
      } else {
        if (controller.signal.aborted) return;
        setDevice(data.device);
        setInterfaces(data.interfaces || []);
        if (!draftRef.current) {
          setMonitoredIds(new Set((data.interfaces || []).filter((i: DbNmsInterface) => i.monitored).map((i: DbNmsInterface) => i.id)));
          setMonitoredDirty(false);
        }
        setNow(Date.now());
        setHealthMetrics(data.healthMetrics || []);
        setTopologyLinks(data.topologyLinks || []);
      }
    } catch {
      if (!controller.signal.aborted) setError(uiError('Cihaz bilgileri yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.'));
    } finally {
      if (!controller.signal.aborted) { setLoading(false); setRefreshing(false); }
    }
  }, [deviceId]);

  useEffect(() => {
    if (deviceId) { loadDevice(); loadBackups(); }
    return () => deviceRequest.current?.abort();
  }, [deviceId, loadDevice, loadBackups]);

  // Auto-refresh every 30s to match SNMP polling interval
  useEffect(() => {
    if (!deviceId || monitoredDirty || savingMonitored || viewBackup || deleteTarget) return;
    const interval = setInterval(() => { if (document.visibilityState === 'visible') void loadDevice(true); }, 30000);
    return () => clearInterval(interval);
  }, [deviceId, loadDevice, monitoredDirty, savingMonitored, viewBackup, deleteTarget]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(timer); }, []);

  const formatDate = (ts: string | null) => {
    if (!ts || !Number.isFinite(Date.parse(ts))) return '—';
    return new Date(ts).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatRelative = (ts: string | null) => relativeTime(ts, now);

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
    if (n >= 1_000_000_000) return `${n / 1_000_000_000} Gbps`;
    if (n >= 1_000_000) return `${n / 1_000_000} Mbps`;
    return `${n} bps`;
  };

  const formatUptime = (seconds: number | null): string => {
    if (seconds == null) return 'Henüz veri yok';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d} gün ${h} sa`;
    if (h > 0) return `${h} sa ${m} dk`;
    return `${m} dk`;
  };

  if (loading && !device) {
    return <PageStateFrame section="nms" title="NMS cihaz detayı">{(
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p role="status" className="text-sm text-muted-foreground">Cihaz bilgileri yükleniyor…</p>
      </div>
    )}</PageStateFrame>;
  }

  if (!device) {
    return <PageStateFrame section="nms" title="NMS cihaz detayı">{(
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          <span role="alert">{error || 'Cihaz bulunamadı.'}</span>
        </div>
        <Button variant="outline" asChild>
          <Link href="/integrations/nms/devices">
            <ArrowLeft className="h-4 w-4 mr-2" />
            İzlenen cihazlara dön
          </Link>
        </Button>
        <Button variant="outline" className="ml-2" onClick={() => void loadDevice()}>Tekrar dene</Button>
      </div>
    )}</PageStateFrame>;
  }

  const status = getConnectionStatus(device, now);
  const isOnline = status === 'online';
  const statusLabel = { online: 'Güncel veri', offline: 'Veri gecikmiş', disabled: 'İzleme kapalı', unknown: 'Veri bekleniyor' }[status];
  const StatusIcon = isOnline ? CheckCircle : status === 'disabled' ? PauseCircle : status === 'unknown' ? Clock : AlertTriangle;
  const statusTone = isOnline ? styles.online : status === 'offline' ? styles.warning : styles.muted;
  const latestHealth = healthMetrics[0] ?? null;
  const healthFreshness = dataFreshness(latestHealth?.collectedAt, device.pollingInterval, now);
  const healthState = !latestHealth ? 'Kaynak ölçümü yok' : !device.pollingEnabled ? 'İzleme kapalı · son ölçüm' : healthFreshness === 'fresh' ? '' : healthFreshness === 'delayed' ? 'Ölçüm eski' : 'Ölçüm tarihi belirsiz';
  const cpuUsage = measuredPercent(latestHealth?.cpuUsage);
  const memoryUsage = measuredPercent(latestHealth?.memoryUsage);

  const activeInterfaces = interfaces.filter(i => i.operStatus === 'up').length;
  const downInterfaces = interfaces.filter(i => i.adminStatus === 'up' && i.operStatus === 'down').length;
  const filteredInterfaces = interfaces.filter(iface => {
    const query = portSearch.trim().toLocaleLowerCase('tr');
    if (query && ![iface.interfaceName, iface.description].some(value => value?.toLocaleLowerCase('tr').includes(query))) return false;
    if (portFilter === 'up') return iface.operStatus === 'up';
    if (portFilter === 'issues') return iface.adminStatus === 'up' && iface.operStatus === 'down';
    if (portFilter === 'disabled') return iface.adminStatus === 'down';
    if (portFilter === 'monitored') return monitoredIds.has(iface.id);
    return true;
  }).sort((a, b) => a.interfaceName.localeCompare(b.interfaceName, 'tr', { numeric: true }));
  const portPages = Math.max(1, Math.ceil(filteredInterfaces.length / 25));
  const currentPortPage = Math.min(portPage, portPages);
  const shownInterfaces = filteredInterfaces.slice((currentPortPage - 1) * 25, currentPortPage * 25);
  function updateMonitored(next: Set<string>) {
    const dirty = interfaces.some(iface => iface.monitored !== next.has(iface.id));
    draftRef.current = dirty; setMonitoredIds(next); setMonitoredDirty(dirty); setPortMessage(null);
  }
  function discardMonitored() { draftRef.current = false; setMonitoredDirty(false); setPortMessage(null); setMonitoredIds(new Set(interfaces.filter(iface => iface.monitored).map(iface => iface.id))); }

  const toggleMonitored = (id: string) => {
    const next = new Set(monitoredIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    updateMonitored(next);
  };

  const saveMonitored = async () => {
    if (!device || savingMonitored || !monitoredDirty) return;
    setSavingMonitored(true);
    setPortMessage(null);
    try {
      // Determine which changed: enable newly monitored, disable removed
      const original = new Set(interfaces.filter(i => i.monitored).map(i => i.id));
      const toEnable = interfaces.filter(i => monitoredIds.has(i.id) && !original.has(i.id)).map(i => i.id);
      const toDisable = interfaces.filter(i => !monitoredIds.has(i.id) && original.has(i.id)).map(i => i.id);

      const responses = await Promise.all([
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
      if (responses.some(response => !response.ok)) throw new Error(uiError('Port ayarları tamamen kaydedilemedi. Seçimleriniz korunuyor; tekrar deneyin.'));

      // Update local state to reflect saved
      setInterfaces(prev => prev.map(i => ({ ...i, monitored: monitoredIds.has(i.id) })));
      draftRef.current = false;
      setMonitoredDirty(false);
      setPortMessage({ ok: true, text: 'Port alarm izleme ayarları kaydedildi.' });
    } catch (failure) {
      setPortMessage({ ok: false, text: failure instanceof Error ? failure.message : 'Port ayarları kaydedilemedi. Seçimleriniz korunuyor.' });
      void loadDevice(true);
    } finally {
      setSavingMonitored(false);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <Button variant="outline" size="icon" asChild className="h-8 w-8 shrink-0" aria-label="İzlenen cihazlara dön"><Link href="/integrations/nms/devices"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <div className="min-w-0">
            <PageHeading section="nms" compact showIcon={false} className="text-base sm:text-lg">{device.name}</PageHeading>
            <div className={styles.identity}><span className="font-mono">{device.managementIp || 'IP girilmedi'}</span><span>{[device.vendor, device.type === 'SWITCH' ? 'Switch' : device.type === 'ROUTER' ? 'Router' : device.type === 'FIREWALL' ? 'Güvenlik duvarı' : device.type?.replace(/_/g, ' ')].filter(Boolean).join(' · ')}</span><span className={cn(styles.statusBadge, statusTone)}><StatusIcon aria-hidden="true" className="h-3.5 w-3.5" />{statusLabel}</span><span>Son veri: <time dateTime={device.lastPolledAt || undefined} title={formatDate(device.lastPolledAt)}>{formatRelative(device.lastPolledAt)}</time></span></div>
          </div>
        </div>
        <div className={styles.headerActions}><Button variant="outline" size="sm" onClick={() => void loadDevice(true)} disabled={refreshing || savingMonitored}><RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />{refreshing ? 'Yenileniyor…' : 'Yenile'}</Button><Button asChild size="sm"><Link href={`/integrations/nms/devices/${device.id}/edit`}><Pencil className="h-3.5 w-3.5" />İzleme ayarları</Link></Button></div>
      </header>
      {error && <div role="alert" className={styles.feedback}><AlertTriangle className="h-4 w-4 shrink-0" /><p>{uiError(error)} Son yüklenen bilgiler gösteriliyor.</p></div>}
      <section aria-label="Kaynak ölçümleri" className={styles.measurements}>
        <div className={styles.measurementMeta}><h2>Son ölçümler</h2><div role="status" className={styles.measurementState}>{healthState && <span className={cn(styles.statusBadge, latestHealth && healthFreshness !== 'fresh' ? styles.warning : styles.muted)}>{healthState}</span>}{latestHealth && (healthFreshness === 'fresh' || healthFreshness === 'delayed') && <time dateTime={latestHealth.collectedAt} title={formatDate(latestHealth.collectedAt)}>{formatRelative(latestHealth.collectedAt)}</time>}</div></div>
        <div className={styles.stats}>
          <StatCard icon={Cpu} label="CPU kullanımı" value={cpuUsage !== null ? `%${cpuUsage.toFixed(1)}` : '—'} color="bg-primary/10 text-primary" />
          <StatCard icon={MemoryStick} label="Bellek kullanımı" value={memoryUsage !== null ? `%${memoryUsage.toFixed(1)}` : '—'} color="bg-primary/10 text-primary" />
          <StatCard icon={Thermometer} label="Sıcaklık" value={latestHealth?.temperature != null ? `${latestHealth.temperature.toFixed(0)} °C` : '—'} color="bg-primary/10 text-primary" />
          <StatCard icon={Clock} label="Çalışma süresi" value={latestHealth?.uptimeSeconds != null ? formatUptime(latestHealth.uptimeSeconds) : '—'} color="bg-primary/10 text-primary" />
        </div>
      </section>
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className={styles.tabs}>
        <TabsList aria-label="Cihaz detay bölümleri" className={styles.tabList}>
          <TabsTrigger value="overview" className="gap-2">
            <Activity className="h-4 w-4" />
            Genel bakış
          </TabsTrigger>
          <TabsTrigger value="ports" className="gap-2">
            <Plug className="h-4 w-4" />
            Portlar
          </TabsTrigger>
          <TabsTrigger value="snmp" className="gap-2">
            <Network className="h-4 w-4" />
            SNMP
          </TabsTrigger>
          <TabsTrigger value="topology" className="gap-2">
            <Link2 className="h-4 w-4" />
            Topoloji
          </TabsTrigger>
          <TabsTrigger value="backups" className="gap-2" onClick={() => backups.length === 0 && loadBackups()}>
            <HardDrive className="h-4 w-4" />
            Yedekler
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          {interfaces.length > 0 ? <Card>
            <CardHeader className={styles.compactCardHeader}><CardTitle className="flex items-center gap-2 text-sm"><Plug size={15} className="text-primary" />Port durumu</CardTitle></CardHeader>
            <CardContent className={styles.compactCardContent}>
                <div className={styles.portSummary}>{[
                  { label: 'Bağlı port', count: activeInterfaces, filter: 'up', icon: CheckCircle, tone: styles.online },
                  { label: 'Bağlantı uyarısı', count: downInterfaces, filter: 'issues', icon: AlertTriangle, tone: styles.warning },
                  { label: 'Yönetimsel kapalı', count: interfaces.filter(iface => iface.adminStatus === 'down').length, filter: 'disabled', icon: PauseCircle, tone: styles.muted },
                  { label: 'Alarm izlenen', count: interfaces.filter(iface => iface.monitored).length, filter: 'monitored', icon: ShieldCheck, tone: styles.online },
                ].map(({ label, count, filter, icon: Icon, tone }) => <button key={label} className={styles.portStat} onClick={() => { setPortFilter(filter); setPortPage(1); setActiveTab('ports'); }}><span className={cn(styles.statIcon, tone)}><Icon aria-hidden="true" className="h-4 w-4" /></span><span><strong className="block text-xl font-semibold tabular-nums">{count}</strong><span className="text-xs text-muted-foreground">{label}</span></span><ChevronRight aria-hidden="true" className="ml-auto h-4 w-4 text-muted-foreground" /></button>)}</div>
            </CardContent>
          </Card> : <div className={styles.empty}><Plug size={24} className="mb-2 text-muted-foreground" /><p className="text-sm text-muted-foreground">Henüz port verisi yok</p></div>}
        </TabsContent>

        <TabsContent value="ports" className="space-y-3">
          <Card className={styles.portSection}>
            <CardContent className="p-0">
              <div className={styles.toolbar}><div className="relative min-w-0 flex-1"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Port ara" placeholder="Port adı veya açıklama ara…" value={portSearch} onChange={event => { setPortSearch(event.target.value); setPortPage(1); }} className="pl-9" /></div><select aria-label="Port durumu" className={styles.select} value={portFilter} onChange={event => { setPortFilter(event.target.value); setPortPage(1); }}><option value="">Tüm portlar</option><option value="up">Bağlı</option><option value="issues">Bağlantı uyarısı</option><option value="disabled">Yönetimsel kapalı</option><option value="monitored">Alarm izlenen</option></select></div>
              <div className={styles.selectionBar}><label className="flex items-center gap-2 text-xs"><input type="checkbox" aria-label="Bu sayfadaki portları seç" className={styles.checkbox} checked={shownInterfaces.length > 0 && shownInterfaces.every(iface => monitoredIds.has(iface.id))} ref={element => { if (element) element.indeterminate = shownInterfaces.some(iface => monitoredIds.has(iface.id)) && !shownInterfaces.every(iface => monitoredIds.has(iface.id)); }} disabled={!shownInterfaces.length || savingMonitored} onChange={event => { const next = new Set(monitoredIds); shownInterfaces.forEach(iface => event.target.checked ? next.add(iface.id) : next.delete(iface.id)); updateMonitored(next); }} />Bu sayfadaki portları seç</label><span className="text-xs text-muted-foreground">{monitoredIds.size} port alarm izlemesinde</span></div>
              {monitoredDirty && <div className={styles.draftBar} role="status"><p className="text-sm">Kaydedilmemiş port seçimleri var.</p><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={discardMonitored} disabled={savingMonitored}>Vazgeç</Button><Button size="sm" className="gap-2" onClick={() => void saveMonitored()} disabled={savingMonitored}>{savingMonitored ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Değişiklikleri kaydet</Button></div></div>}
              {portMessage && <div role={portMessage.ok ? 'status' : 'alert'} className={styles.feedback}><span>{portMessage.text}</span></div>}
              {!shownInterfaces.length ? <div className={styles.empty}><span className={styles.emptyIcon}><Search className="h-6 w-6" /></span><h3 className="text-sm font-semibold">{interfaces.length ? 'Filtreye uygun port bulunamadı' : 'Henüz port verisi yok'}</h3><p className="mt-2 text-xs leading-6 text-muted-foreground">{interfaces.length ? 'Aramayı veya durum filtresini değiştirin.' : 'Cihazdan port bilgileri toplandığında burada listelenir.'}</p>{interfaces.length > 0 && <Button variant="outline" size="sm" className="mt-4" onClick={() => { setPortSearch(''); setPortFilter(''); setPortPage(1); }}>Filtreleri temizle</Button>}</div> : <>
                <div className={styles.portTable}><table className={styles.table}><caption className="sr-only">Port durumları, veri sayaçları ve alarm izleme seçimleri</caption><thead><tr>{['İzle', 'Port / açıklama', 'Bağlantı', 'Hız', 'Gelen / giden', 'Hata sayacı', 'Son veri'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{shownInterfaces.map(iface => {
                  const up = iface.operStatus === 'up', adminDown = iface.adminStatus === 'down';
                  return <tr key={iface.id} className={monitoredIds.has(iface.id) ? styles.selectedRow : undefined}><td><input type="checkbox" aria-label={`${iface.interfaceName}: alarm izlemesi`} className={styles.checkbox} checked={monitoredIds.has(iface.id)} onChange={() => toggleMonitored(iface.id)} disabled={savingMonitored} /></td><td><p className="font-mono text-xs font-medium">{iface.interfaceName}</p>{iface.description && <p className="mt-1 max-w-64 wrap-break-word text-xs text-muted-foreground">{iface.description}</p>}</td><td><span className={cn(styles.statusBadge, up ? styles.online : adminDown ? styles.muted : styles.warning)}>{up ? 'Bağlı' : adminDown ? 'Yönetimsel kapalı' : iface.operStatus === 'down' ? 'Bağlantı yok' : iface.operStatus}</span><p className="mt-1 text-xs text-muted-foreground">Yönetim: {iface.adminStatus === 'up' ? 'açık' : iface.adminStatus === 'down' ? 'kapalı' : iface.adminStatus}</p></td><td className="whitespace-nowrap text-xs">{formatSpeed(iface.speed)}</td><td><p className="flex items-center gap-1 text-xs"><ArrowDown aria-hidden="true" className="h-3 w-3 text-muted-foreground" />{formatBytes(iface.inOctets)}</p><p className="mt-1 flex items-center gap-1 text-xs"><ArrowUp aria-hidden="true" className="h-3 w-3 text-muted-foreground" />{formatBytes(iface.outOctets)}</p></td><td className="text-xs tabular-nums">{(iface.inErrors || 0) + (iface.outErrors || 0)}</td><td className="whitespace-nowrap text-xs text-muted-foreground" title={formatDate(iface.lastPolledAt)}>{formatRelative(iface.lastPolledAt)}</td></tr>;
                })}</tbody></table></div>
                <div className={styles.portCards}>{shownInterfaces.map(iface => <article className={cn(styles.portCard, monitoredIds.has(iface.id) && styles.selectedRow)} key={iface.id}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="wrap-break-word font-mono text-xs font-semibold">{iface.interfaceName}</p>{iface.description && <p className="mt-1 wrap-break-word text-xs text-muted-foreground">{iface.description}</p>}</div><label className="flex shrink-0 items-center gap-2 text-xs">İzle<input type="checkbox" aria-label={`${iface.interfaceName}: alarm izlemesi`} className={styles.checkbox} checked={monitoredIds.has(iface.id)} onChange={() => toggleMonitored(iface.id)} disabled={savingMonitored} /></label></div><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className={cn(styles.statusBadge, iface.operStatus === 'up' ? styles.online : iface.adminStatus === 'down' ? styles.muted : styles.warning)}>{iface.operStatus === 'up' ? 'Bağlı' : iface.adminStatus === 'down' ? 'Yönetimsel kapalı' : iface.operStatus === 'down' ? 'Bağlantı yok' : iface.operStatus}</span><span className="text-xs text-muted-foreground">{formatSpeed(iface.speed)}</span></div><dl className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><dt className="text-muted-foreground">Gelen / giden</dt><dd className="mt-1">{formatBytes(iface.inOctets)} / {formatBytes(iface.outOctets)}</dd></div><div><dt className="text-muted-foreground">Hata sayacı</dt><dd className="mt-1">{(iface.inErrors || 0) + (iface.outErrors || 0)}</dd></div></dl><p className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">Son veri: {formatRelative(iface.lastPolledAt)}</p></article>)}</div>
              </>}
              <footer className={styles.pagination}><p className="text-xs text-muted-foreground">{filteredInterfaces.length} / {interfaces.length} port</p><nav aria-label="Port sayfaları" className="flex items-center gap-2"><Button variant="outline" size="icon" className="h-8 w-8" aria-label="Önceki port sayfası" disabled={currentPortPage === 1} onClick={() => setPortPage(currentPortPage - 1)}><ChevronLeft className="h-4 w-4" /></Button><span className="text-xs tabular-nums">{currentPortPage} / {portPages}</span><Button variant="outline" size="icon" className="h-8 w-8" aria-label="Sonraki port sayfası" disabled={currentPortPage === portPages} onClick={() => setPortPage(currentPortPage + 1)}><ChevronRight className="h-4 w-4" /></Button></nav></footer>
            </CardContent>
          </Card>
        </TabsContent>
        {/* SNMP Tab */}
        <TabsContent value="snmp" className="space-y-3">
          <Card>
            <CardHeader className={styles.compactCardHeader}><CardTitle className="flex items-center gap-2 text-sm"><Network size={15} className="text-primary" />SNMP yapılandırması</CardTitle></CardHeader>
            <CardContent className={styles.compactCardContent}><dl className={styles.configGrid}>
              <InfoRow label="NMS ID" value={`#${device.nmsDeviceId}`} />
              <InfoRow label="SNMP sürümü" value={device.snmpVersion ? `SNMPv${device.snmpVersion.replace(/^v/i, '')}` : 'Belirtilmedi'} />
              <InfoRow label="SNMP portu" value={`${device.snmpPort ?? 161}`} />
              <InfoRow label="Veri toplama" value={device.pollingEnabled ? 'Etkin' : 'Kapalı'} />
              <InfoRow label="Toplama aralığı" value={`${device.pollingInterval ?? 300} saniye`} />
            </dl></CardContent>
          </Card>

          {/* Health History */}
          {healthMetrics.length > 0 && (
            <Card>
              <CardHeader className={styles.compactCardHeader}>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  Kaynak ölçüm geçmişi · {healthMetrics.length} kayıt
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-2 text-muted-foreground">Zaman</th>
                        <th className="text-left px-4 py-2 text-muted-foreground">CPU</th>
                        <th className="text-left px-4 py-2 text-muted-foreground">Bellek</th>
                        <th className="text-left px-4 py-2 text-muted-foreground">Sıcaklık</th>
                        <th className="text-left px-4 py-2 text-muted-foreground">Çalışma süresi</th>
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
        <TabsContent value="backups" className="space-y-3">
          {/* Trigger buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground" onClick={() => triggerBackup('Running Config')} aria-describedby="backup-readiness" disabled={triggering || !!activeBackupJob || backupsLoading || !backupReadiness?.ready || !backupsLoaded || !backupAccess.create || !backupAccess.running}>
              {triggering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Çalışan yapılandırmayı yedekle
            </Button>
            <Button size="sm" variant="outline" className="gap-2" onClick={() => triggerBackup('Startup Config')} aria-describedby="backup-readiness" disabled={triggering || !!activeBackupJob || backupsLoading || !backupReadiness?.ready || !backupsLoaded || !backupAccess.create || !backupAccess.startup}>
              {triggering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Başlangıç yapılandırmasını yedekle
            </Button>
            <Button id="backup-list-refresh" size="sm" variant="ghost" className="gap-2" aria-label="Yedek listesini yenile" onClick={loadBackups} disabled={backupsLoading}>
              <RefreshCw className={`h-4 w-4 ${backupsLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {/* Trigger result */}
          <div id="backup-readiness" role="status" className="space-y-2 rounded-lg border border-border bg-muted/30 p-4 text-sm leading-6">
            {backupReadiness?.platform && <p className="font-medium">Seçili platform: {backupReadiness.platform.label}</p>}
            {!backupReadiness ? <p>{backupsLoading ? 'Yedekleme ön koşulları kontrol ediliyor…' : 'Yedekleme ön koşulları doğrulanamadı. Listeyi yeniden yükleyin.'}</p> : <>
              {backupReadiness.blockers.length > 0 ? <ul className="list-disc space-y-1 pl-5">{backupReadiness.blockers.map(blocker => <li key={blocker.code}>{blocker.message}</li>)}</ul> : <p>Ön koşullar tamam. SSH erişimi ve yapılandırma çıktısı yedekleme sırasında doğrulanır.</p>}
              {backupReadiness.blockers.some(blocker => blocker.action === 'platform') && <p><Link className="font-medium text-primary underline underline-offset-4" href="/integrations/nms/backups">Platform ayarlarını aç</Link><span className="text-muted-foreground"> · Zamanlama bölümünden cihazı ve işletim sistemi platformunu seçin. Elle yedek için zamanlamayı etkinleştirmek gerekmez.</span></p>}
              {backupReadiness.blockers.some(blocker => blocker.action === 'ssh') && <p><Link className="font-medium text-primary underline underline-offset-4" href={`/integrations/nms/devices/${deviceId}/edit#ssh-section`}>SSH ayarlarını aç</Link><span className="text-muted-foreground"> · Bağlantı bilgilerini ve cihaz anahtarını doğrulayın.</span></p>}
              {backupReadiness.platform && !backupAccess.startup && <p>Bu platform başlangıç yapılandırması yedeğini desteklemiyor.</p>}
            </>}
          </div>
          {triggerResult && (
            <div role={triggerResult.ok ? 'status' : 'alert'} className={`flex items-start gap-2 p-3 rounded-lg text-sm border ${
              triggerResult.ok
                ? 'bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400'
                : 'bg-destructive/10 border-destructive/30 text-destructive'
            }`}>
              {triggerResult.ok ? <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" /> : <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />}
              <span>{triggerResult.msg}</span>
              {!activeBackupJob && <button aria-label="Yedekleme bildirimini kapat" className="ml-auto opacity-60 hover:opacity-100" onClick={() => setTriggerResult(null)}><X className="h-3.5 w-3.5" /></button>}
            </div>
          )}

          {/* Backup error */}
          {backupError && (
            <div role="alert" className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4" />{uiError(backupError)}<Button variant="outline" size="sm" disabled={backupsLoading} onClick={() => void loadBackups()}>Tekrar dene</Button>
            </div>
          )}

          {/* Backup list */}
          {backupsLoading && !backupsLoaded ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : !backupsLoaded && backupError ? (<Card><CardContent className="py-10 text-center"><p className="text-sm font-medium">Yedek geçmişi yüklenemedi</p><Button className="mt-4" variant="outline" onClick={() => void loadBackups()}>Tekrar dene</Button></CardContent></Card>) : backups.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <HardDrive className="h-10 w-10 opacity-30 mb-3" />
                <p className="text-sm">Henüz yapılandırma yedeği yok</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className={styles.compactCardHeader}>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                  Yedek geçmişi
                  <span className="ml-auto text-xs font-normal text-muted-foreground">{backups.length} kayıt</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className={styles.backupCards}>{backups.map(b => <article key={b.id} className={styles.backupRow}>
                  <span className={styles.statIcon}><HardDrive aria-hidden="true" className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1"><h3 className="text-sm font-medium">{b.backupType === 'Running Config' ? 'Çalışan yapılandırma' : b.backupType === 'Startup Config' ? 'Başlangıç yapılandırması' : b.backupType}</h3><p className="mt-1 text-xs text-muted-foreground"><time dateTime={b.createdAt}>{formatDate(b.createdAt)}</time> · {formatBytes(b.sizeBytes)}</p>{b.description && <p className="mt-1 wrap-break-word text-xs text-muted-foreground">{b.description}</p>}</div>
                  <div className="flex shrink-0 gap-1"><Button variant="outline" size="icon" className="h-9 w-9" aria-label={`${formatDate(b.createdAt)} tarihli yedeği görüntüle`} disabled={!!viewLoading} onClick={event => { backupActionTrigger.current = event.currentTarget; void viewBackupConfig(b); }}>{viewLoading === b.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}</Button><Button variant="ghost" size="icon" className="h-9 w-9 text-destructive" aria-label={`${formatDate(b.createdAt)} tarihli yedeği sil`} onClick={event => { backupActionTrigger.current = event.currentTarget; setDeleteError(null); setDeleteTarget(b); }}><Trash2 className="h-4 w-4" /></Button></div>
                </article>)}</div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Topology Tab */}
        <TabsContent value="topology" className="space-y-3">
          {topologyLinks.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Link2 className="h-10 w-10 opacity-30 mb-3" />
                <p className="text-sm">LLDP/CDP komşu bilgisi bulunamadı</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className={styles.compactCardHeader}>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-muted-foreground" />
                  LLDP / CDP komşuları
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Yerel port</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Komşu cihaz</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Komşu port</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Protokol</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Son görülme</th>
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

      <Dialog open={!!viewBackup} onOpenChange={open => { if (!open) setViewBackup(null); }}>
        <DialogContent onCloseAutoFocus={restoreBackupFocus} className="flex max-h-[85dvh] w-[calc(100vw-2rem)] max-w-4xl flex-col overflow-hidden">
          <DialogHeader className="pr-6"><DialogTitle>{viewBackup?.type === 'Running Config' ? 'Çalışan yapılandırma' : viewBackup?.type === 'Startup Config' ? 'Başlangıç yapılandırması' : 'Yedek yapılandırma'}</DialogTitle><DialogDescription>{viewBackup ? `${device.name} · ${formatDate(viewBackup.createdAt)}` : ''}</DialogDescription></DialogHeader>
          <Button variant="outline" size="sm" className="w-fit gap-2" onClick={() => { if (viewBackup) downloadConfig(viewBackup.config, `${device.name}-${viewBackup.type.replace(/ /g, '-')}-${viewBackup.createdAt.slice(0,10)}.txt`); }}><Download className="h-3.5 w-3.5" />Yapılandırmayı indir</Button>
          <pre tabIndex={0} aria-label="Yedek yapılandırma içeriği" className="min-h-24 min-w-0 flex-1 overflow-auto rounded-lg border border-border bg-muted/20 p-4 font-mono text-xs leading-6">{viewBackup?.config || 'Bu kayıtta yapılandırma içeriği bulunmuyor.'}</pre>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open && !deletingBackup) setDeleteTarget(null); }}><AlertDialogContent onCloseAutoFocus={restoreBackupFocus} className="max-w-[calc(100vw-2rem)] sm:max-w-lg"><AlertDialogHeader><AlertDialogTitle>Yapılandırma yedeği silinsin mi?</AlertDialogTitle><AlertDialogDescription>{deleteTarget ? `${deleteTarget.backupType} · ${formatDate(deleteTarget.createdAt)}. ` : ''}Bu yedek kalıcı olarak silinir. Cihazın mevcut yapılandırması değişmez.</AlertDialogDescription></AlertDialogHeader>{deleteError && <p role="alert" className="text-sm text-destructive">{uiError(deleteError)}</p>}<AlertDialogFooter><AlertDialogCancel disabled={deletingBackup}>Vazgeç</AlertDialogCancel><Button variant="destructive" className="gap-2" disabled={deletingBackup} onClick={() => { if (deleteTarget) void deleteBackup(deleteTarget.id); }}>{deletingBackup ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Yedeği sil</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}
