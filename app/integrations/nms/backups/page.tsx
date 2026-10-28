'use client';

import { uiError } from '@/lib/i18n/tr';

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Archive, ArrowLeft, ArrowRight, CheckCircle2,
  ChevronDown, Clock3, DatabaseBackup, FileCode2, HardDrive, History, Loader2, Plus,
  RefreshCw, Search, Server, Settings2, ShieldCheck, Trash2, TriangleAlert, X,
} from 'lucide-react';
import { PageHeading } from '@/components/ui/page-heading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { SemanticBadge, type SemanticTone } from '@/components/ui/semantic-badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { BACKUP_PROFILES, type BackupPlatform } from '@/lib/nms/backup-platform';
import { cn } from '@/lib/utils';
import { BackupCoverage } from '@/components/nms/BackupCoverage';
import { BackupArtifactDialog } from '@/components/nms/BackupArtifactDialog';
import { backupAge, backupCoverage, backupDate as date, backupSize as sizeLabel, backupTypeLabel as typeLabel } from '@/lib/nms/backup-view';
import styles from './page.module.css';

interface Backup {
  id: string; device_id: number | null; inventory_device_id?: string; device_name: string;
  backup_type: string; file_name: string; file_size: number; created_at: string;
  archived: boolean; description?: string | null;
}
interface Job {
  id: string; deviceName: string; backupType: string; status: string; attempts: number;
  errorMessage: string | null; createdAt: string; backupId: string | null;
}
interface Policy {
  enabled: boolean; backupType: string; intervalHours: number; retentionDays: number;
  keepLast: number; staleAfterHours: number; nextRunAt: string;
}
interface Device { id: number; name: string; platform: BackupPlatform | null; policy: Policy | null; lastSuccessAt: string | null; lastPolicySuccessAt?: string | null }
const jobStates: Record<string, { label: string; tone: SemanticTone }> = {
  queued: { label: 'Kuyrukta', tone: 'neutral' }, running: { label: 'Çalışıyor', tone: 'info' },
  retrying: { label: 'Yeniden denenecek', tone: 'warning' }, succeeded: { label: 'Başarılı', tone: 'success' },
  failed: { label: 'Başarısız', tone: 'danger' },
};
const policyFields = [
  { key: 'interval_hours', label: 'Yedekleme aralığı', unit: 'saat', max: 8760 },
  { key: 'stale_after_hours', label: 'Gecikme alarmı eşiği', unit: 'saat', max: 17520 },
  { key: 'retention_days', label: 'Saklama süresi', unit: 'gün', max: 3650 },
  { key: 'keep_last', label: 'Korunacak en az yedek', unit: 'adet', max: 10000 },
] as const;
function settingsFor(device?: Device) {
  const policy = device?.policy;
  return {
    platform: device?.platform || '', enabled: policy?.enabled ?? false,
    backup_type: policy?.backupType || 'Running Config', interval_hours: policy?.intervalHours ?? 24,
    retention_days: policy?.retentionDays ?? 90, keep_last: policy?.keepLast ?? 10,
    stale_after_hours: policy?.staleAfterHours ?? 48,
  };
}

export default function NmsBackupsPage() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [permissions, setPermissions] = useState({ create: false, content: false, delete: false });
  const [canEdit, setCanEdit] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<'create' | 'policy' | 'delete' | null>(null);
  const [tab, setTab] = useState('coverage');
  const [selectedBackup, setSelectedBackup] = useState<Backup | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [search, setSearch] = useState('');
  const [serverSearch, setServerSearch] = useState('');
  const [filterDevice, setFilterDevice] = useState('');
  const [filterType, setFilterType] = useState('');
  const [jobFilter, setJobFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Backup | null>(null);
  const [deviceId, setDeviceId] = useState('');
  const [backupType, setBackupType] = useState('Running Config');
  const [description, setDescription] = useState('');
  const [policyDeviceId, setPolicyDeviceId] = useState('');
  const [settings, setSettings] = useState(settingsFor);
  const [originalSettings, setOriginalSettings] = useState('');
  const [policySubmitted, setPolicySubmitted] = useState(false);
  const [policyAdvanced, setPolicyAdvanced] = useState(false);
  const requestKey = useRef('');
  const requestSequence = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setRefreshing(true);
    try {
      const options = { timeout: 10000, signal: controller.signal };
      const [list, work, configuration] = await Promise.all([
        apiGet('/api/integrations/nms/backups', { limit: pageSize, offset: page * pageSize, search: serverSearch || undefined, device_id: filterDevice || undefined, backup_type: filterType || undefined }, options),
        apiGet('/api/integrations/nms/backup-jobs', undefined, options),
        apiGet('/api/integrations/nms/backup-policies', undefined, options),
      ]);
      if (sequence !== requestSequence.current || controller.signal.aborted) return;
      const errors: Record<string, string> = {};
      if (list.error) errors.backups = list.error;
      else {
        setBackups(list.data); setTotal(list.total); setPermissions(list.permissions);
        if (page > 0 && page * pageSize >= list.total) setPage(Math.max(0, Math.ceil(list.total / pageSize) - 1));
      }
      if (work.error) errors.jobs = work.error;
      else setJobs(work.jobs);
      if (configuration.error) errors.policies = configuration.error;
      else { setDevices(configuration.devices); setCanEdit(configuration.canEdit); }
      setLoadErrors(errors);
    } catch {
      if (sequence === requestSequence.current && !controller.signal.aborted) setLoadErrors({ backups: 'Yedekleme bilgileri yüklenemedi.' });
    } finally {
      if (sequence === requestSequence.current && !controller.signal.aborted) { setLoading(false); setRefreshing(false); }
    }
  }, [page, pageSize, serverSearch, filterDevice, filterType]);

  const cancelRequest = useCallback(() => {
    requestSequence.current += 1;
    activeRequest.current?.abort();
  }, []);
  useEffect(() => {
    setLoading(true);
    void load();
    const timer = setInterval(() => void load(), 10000);
    return () => { clearInterval(timer); cancelRequest(); };
  }, [load, cancelRequest]);
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const result = await apiGet('/api/integrations/nms/backups/health', undefined, { timeout: 5000 });
      if (!cancelled) { setHealthError(!!result.error || typeof result.available !== 'boolean'); setAvailable(typeof result.available === 'boolean' ? result.available : null); }
    };
    void check();
    const timer = setInterval(() => void check(), 30000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);
  useEffect(() => { requestKey.current = crypto.randomUUID(); }, [deviceId, backupType, description]);

  const sortedDevices = [...devices].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const selectedDevice = devices.find(device => String(device.id) === deviceId);
  const selectedProfile = selectedDevice?.platform ? BACKUP_PROFILES[selectedDevice.platform] : null;
  const policyDevice = devices.find(device => String(device.id) === policyDeviceId);
  const effectivePlatform = settings.platform || policyDevice?.platform;
  const policyProfile = effectivePlatform ? BACKUP_PROFILES[effectivePlatform as BackupPlatform] : null;
  const policyDirty = !!policyDeviceId && JSON.stringify(settings) !== originalSettings;
  const policyErrors: Record<string, string> = {};
  for (const field of policyFields) {
    const value = settings[field.key];
    if (!Number.isInteger(value) || value < 1 || value > field.max) policyErrors[field.key] = `1–${field.max} arasında bir tam sayı girin.`;
  }
  if (!policyErrors.stale_after_hours && settings.stale_after_hours < settings.interval_hours) policyErrors.stale_after_hours = 'Alarm eşiği yedekleme aralığından kısa olamaz.';
  const activeJobs = jobs.filter(job => ['queued', 'running', 'retrying'].includes(job.status));
  const failedJobs = jobs.filter(job => job.status === 'failed');
  const visibleJobs = jobs.filter(job => jobFilter === 'all' || (jobFilter === 'active' ? ['queued', 'running', 'retrying'].includes(job.status) : job.status === jobFilter));
  const filtered = !!(serverSearch || filterDevice || filterType);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const choosePolicy = (id: string) => {
    setPolicyDeviceId(id);
    const next = settingsFor(devices.find(device => String(device.id) === id));
    setSettings(next); setOriginalSettings(JSON.stringify(next)); setPolicySubmitted(false); setPolicyAdvanced(false); setActionError(uiError(''));
  };
  const clearFilters = () => { setSearch(''); setServerSearch(''); setFilterDevice(''); setFilterType(''); setPage(0); };
  const openCreate = () => { setActionError(uiError('')); setCreateOpen(true); };
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !permissions.create || !selectedProfile) return;
    setBusy('create'); setActionError(uiError('')); setNotice('');
    try {
      const result = await apiPost('/api/integrations/nms/backups', { device_id: Number(deviceId), backup_type: backupType, description: description.trim() || null }, { headers: { 'Idempotency-Key': requestKey.current }, timeout: 10000 });
      if (!result.success) throw new Error(uiError(result.error || 'Yedekleme işi kaydedilemedi.'));
      setNotice(`Yedekleme işi ${result.reused ? 'zaten kuyrukta' : 'kuyruğa alındı'}. Sonucunu İşler sekmesinden takip edebilirsiniz.`);
      requestKey.current = crypto.randomUUID();
      setCreateOpen(false); setDeviceId(''); setDescription(''); setBackupType('Running Config');
      setJobFilter('all'); setTab('jobs'); await load();
    } catch (err) { setActionError(uiError(err instanceof Error ? err.message : 'Yedekleme işi kaydedilemedi.')); }
    finally { setBusy(null); }
  };
  const savePolicy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !canEdit || !policyDirty) return;
    setPolicySubmitted(true); setActionError(uiError(''));
    const firstError = Object.keys(policyErrors)[0];
    if (firstError) {
      if (policyErrors.retention_days || policyErrors.keep_last) setPolicyAdvanced(true);
      requestAnimationFrame(() => {
        const field = document.getElementById(firstError);
        field?.focus({ preventScroll: true }); field?.scrollIntoView({ block: 'center' });
      });
      return;
    }
    setBusy('policy'); setNotice('');
    try {
      const result = await apiPut('/api/integrations/nms/backup-policies', { ...settings, platform: settings.platform || null, device_id: Number(policyDeviceId) });
      if (!result.success) throw new Error(uiError(result.error || 'Ayarlar kaydedilemedi.'));
      setOriginalSettings(JSON.stringify(settings));
      setNotice('Yedekleme ayarları kaydedildi. Zamanlama açıksa ilk iş seçilen aralık sonunda çalışır.');
      await load();
    } catch (err) { setActionError(uiError(err instanceof Error ? err.message : 'Ayarlar kaydedilemedi.')); }
    finally { setBusy(null); }
  };
  const remove = async () => {
    if (!pendingDelete || busy || !permissions.delete) return;
    setBusy('delete'); setActionError(uiError('')); setNotice('');
    try {
      const result = await apiDelete(`/api/integrations/nms/backups/${pendingDelete.id}`);
      if (!result.success) throw new Error(uiError(result.error || 'Yedek silinemedi.'));
      setPendingDelete(null); setNotice('Yapılandırma yedeği silindi.');
      if (backups.length === 1 && page > 0) setPage(page - 1); else await load();
    } catch (err) { setActionError(uiError(err instanceof Error ? err.message : 'Yedek silinemedi.')); }
    finally { setBusy(null); }
  };
  const renderPolicyField = (field: typeof policyFields[number]) => <div key={field.key} className={styles.policyField}>
    <Label htmlFor={field.key}>{field.label}</Label><div className="relative"><Input id={field.key} type="number" min={1} max={field.max} step={1} className="pr-14" value={settings[field.key]} onChange={event => setSettings({ ...settings, [field.key]: Number(event.target.value) })} aria-invalid={policySubmitted && !!policyErrors[field.key]} aria-describedby={policySubmitted && policyErrors[field.key] ? `${field.key}-error` : undefined} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{field.unit}</span></div>
    {policySubmitted && policyErrors[field.key] && <p id={`${field.key}-error`} className="text-xs text-destructive">{policyErrors[field.key]}</p>}
  </div>;
  const backupActions = (backup: Backup) => <div className="flex items-center justify-end gap-1">
    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setSelectedBackup(backup)} aria-label={`${backup.device_name} yedek ayrıntıları ve indirme`}><FileCode2 className="h-3.5 w-3.5" />İncele</Button>
    {permissions.delete && <Button size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground hover:text-destructive" disabled={!!busy} onClick={() => { setActionError(uiError('')); setPendingDelete(backup); }} aria-label={`${backup.device_name} yedeğini sil`}><Trash2 className="h-4 w-4" /></Button>}
    {!permissions.content && <span className="text-xs text-muted-foreground">Salt okunur</span>}
  </div>;

  return <div className={styles.page}>
    <div className={styles.workspace}>
      <header className={styles.header}>
        <div className={styles.titleGroup}><PageHeading section="backups" compact showIcon={false} className="text-base sm:text-lg">Yapılandırma yedekleri</PageHeading><SemanticBadge tone={available === null ? 'neutral' : available ? 'success' : 'warning'} icon={available === null ? Clock3 : undefined}>{healthError ? 'Servis durumu doğrulanamadı' : available === null ? 'Servis kontrol ediliyor' : available ? 'Yedekleme servisi hazır' : 'Servise ulaşılamıyor'}</SemanticBadge></div>
        <div className={styles.headerActions}>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={refreshing}><RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />{refreshing ? 'Yenileniyor' : 'Yenile'}</Button>
          {permissions.create && <Button size="sm" onClick={openCreate} disabled={!!busy}><Plus className="h-3.5 w-3.5" />Yedek oluştur</Button>}
        </div>
      </header>
      {available === false && <Message tone="warning">Kayıtlı yedekleri görüntüleyebilirsiniz. Yeni işler, yedekleme servisi yeniden hazır olduğunda çalışır.</Message>}
      {Object.keys(loadErrors).length > 0 && <Message tone="danger"><span className="font-medium">Bazı bilgiler yenilenemedi.</span> {Object.keys(loadErrors).map(key => key === 'backups' ? 'Yedek dosyaları' : key === 'jobs' ? 'Yedekleme işleri' : 'Cihazların yedek durumu ve zamanlama').join(', ')} yüklenemedi. Önceki bilgiler güncel olmayabilir.</Message>}
      {notice && <div role="status" className={styles.notice}><CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /><p className="flex-1 text-sm">{notice}</p><Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setNotice('')} aria-label="Bildirimi kapat"><X className="h-4 w-4" /></Button></div>}
      <section className={styles.stats} aria-label="Yedekleme özeti">
        <Stat icon={<HardDrive />} label="Yedekli cihaz" value={(loading || !!loadErrors.policies) && !devices.length ? '—' : String(devices.filter(device => device.lastSuccessAt).length)} />
        <Stat icon={<TriangleAlert />} label="Kontrol gerektiren" value={loadErrors.policies || loading ? '—' : String(devices.filter(device => backupCoverage(device).attention).length)} warning={!loadErrors.policies && devices.some(device => backupCoverage(device).attention)} />
        <Stat icon={<Clock3 />} label="Devam eden iş" value={(loading || !!loadErrors.jobs) && !jobs.length ? '—' : String(activeJobs.length)} />
        <Stat icon={<History />} label="Başarısız iş" value={(loading || !!loadErrors.jobs) && !jobs.length ? '—' : String(failedJobs.length)} warning={failedJobs.length > 0} />
      </section>
      <Tabs value={tab} onValueChange={value => { setTab(value); setActionError(uiError('')); }}>
        <TabsList aria-label="Yedekleme bölümleri" className={styles.tabs}>
          <TabsTrigger value="coverage"><Server className="h-4 w-4" />Cihaz durumu</TabsTrigger>
          <TabsTrigger value="backups"><Archive className="h-4 w-4" />Yedekler</TabsTrigger>
          <TabsTrigger value="jobs"><History className="h-4 w-4" />İşler</TabsTrigger>
          <TabsTrigger value="policies"><Settings2 className="h-4 w-4" />Zamanlama</TabsTrigger>
        </TabsList>
        <TabsContent value="coverage" className="mt-3"><BackupCoverage devices={sortedDevices} loading={loading} stale={!!loadErrors.policies} onFiles={id => { clearFilters(); setFilterDevice(String(id)); setTab('backups'); }} onPolicy={id => { choosePolicy(String(id)); setTab('policies'); }} /></TabsContent>
        <TabsContent value="backups" className="mt-3">
          <section className={styles.collection} aria-labelledby="backups-heading" aria-busy={loading}>
            <h2 id="backups-heading" className="sr-only">Kayıtlı yedekler</h2>
            <form className={styles.toolbar} onSubmit={event => { event.preventDefault(); setPage(0); setServerSearch(search.trim()); }}>
              <div className={styles.search}><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Yedek ara" placeholder="Cihaz veya dosya adıyla ara…" className="pl-9 pr-9" value={search} onChange={event => setSearch(event.target.value)} />{search && <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-10 w-9" aria-label="Aramayı temizle" onClick={() => { setSearch(''); setServerSearch(''); setPage(0); }}><X className="h-3.5 w-3.5" /></Button>}</div>
              <Button type="submit" variant="outline">Ara</Button>
              <select aria-label="Cihaza göre filtrele" className={cn(styles.select, styles.filterSelect)} value={filterDevice} onChange={event => { setFilterDevice(event.target.value); setPage(0); }}><option value="">Tüm cihazlar</option>{sortedDevices.map(device => <option key={device.id} value={device.id}>{device.name}</option>)}</select>
              <select aria-label="Yedek türüne göre filtrele" className={cn(styles.select, styles.filterSelect)} value={filterType} onChange={event => { setFilterType(event.target.value); setPage(0); }}><option value="">Tüm yedek türleri</option><option value="Running Config">Çalışan yapılandırma</option><option value="Startup Config">Başlangıç yapılandırması</option></select>
              {filtered && <Button type="button" size="sm" variant="ghost" onClick={clearFilters}><X size={14} />Filtreleri temizle</Button>}
            </form>
            {loading ? <Loading /> : loadErrors.backups && !backups.length ? <Empty icon={<TriangleAlert />} title="Yedekler yüklenemedi" description="Bağlantınızı kontrol edip tekrar deneyin."><Button variant="outline" onClick={() => void load()}>Tekrar dene</Button></Empty> : !backups.length ? <Empty icon={<Archive />} title={filtered ? 'Aramanıza uygun yedek bulunamadı' : 'Henüz yapılandırma yedeği yok'} description={filtered ? 'Arama ifadesini değiştirin veya filtreleri temizleyin.' : 'Bir cihaz seçip ilk yapılandırma yedeğinizi oluşturun.'}>{filtered ? <Button variant="outline" onClick={clearFilters}>Filtreleri temizle</Button> : permissions.create && <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" />Yedek oluştur</Button>}</Empty> : <>
              <div className={styles.tableWrap}><table className={styles.table}><caption className="sr-only">Kayıtlı yapılandırma yedekleri</caption><thead><tr><th scope="col">Cihaz / dosya</th><th scope="col">Tür</th><th scope="col">Boyut</th><th scope="col">Yedekleme zamanı</th><th scope="col" className="text-right">İşlemler</th></tr></thead><tbody>{backups.map(backup => <tr key={backup.id}><td><BackupIdentity backup={backup} /></td><td><span className="text-xs">{typeLabel(backup.backup_type)}</span></td><td className="whitespace-nowrap font-mono text-xs">{sizeLabel(backup.file_size)}</td><td className="text-xs"><time dateTime={backup.created_at} title={date(backup.created_at)}>{backupAge(backup.created_at)}</time></td><td>{backupActions(backup)}</td></tr>)}</tbody></table></div>
              <div className={styles.mobileList}>{backups.map(backup => <article key={backup.id} className={styles.record}><BackupIdentity backup={backup} /><dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="mb-1 text-muted-foreground">Yedek türü</dt><dd>{typeLabel(backup.backup_type)}</dd></div><div><dt className="mb-1 text-muted-foreground">Boyut</dt><dd>{sizeLabel(backup.file_size)}</dd></div><div className="col-span-2"><dt className="mb-1 text-muted-foreground">Yedekleme zamanı</dt><dd><time dateTime={backup.created_at} title={date(backup.created_at)}>{backupAge(backup.created_at)}</time></dd></div></dl><div className="mt-4 border-t border-border pt-3">{backupActions(backup)}</div></article>)}</div>
            </>}
            <div className={styles.pagination}><p className="text-xs text-muted-foreground" role="status">{loading ? 'Yedekler yükleniyor…' : total ? `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, total)} / ${total} yedek` : loadErrors.backups ? 'Yedek sayısı bilinmiyor' : '0 yedek'}</p><div className="flex flex-wrap items-center gap-2"><select className={cn(styles.select, 'h-8! w-auto! text-xs!')} aria-label="Sayfa başına yedek" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(0); }}>{[25, 50, 100].map(size => <option key={size} value={size}>{size} / sayfa</option>)}</select><Button size="icon" variant="outline" className="h-8 w-8" aria-label="Önceki sayfa" disabled={loading || page === 0} onClick={() => setPage(page - 1)}><ArrowLeft className="h-4 w-4" /></Button><span className="px-1 text-xs text-muted-foreground">{page + 1} / {pageCount}</span><Button size="icon" variant="outline" className="h-8 w-8" aria-label="Sonraki sayfa" disabled={loading || (page + 1) * pageSize >= total} onClick={() => setPage(page + 1)}><ArrowRight className="h-4 w-4" /></Button></div></div>
          </section>
        </TabsContent>
        <TabsContent value="jobs" className="mt-3">
          <section className={styles.collection} aria-labelledby="jobs-heading" title="Son 100 iş">
            <div className={styles.collectionHeader}><h2 id="jobs-heading" className="sr-only">Son yedekleme işleri</h2><select aria-label="İş durumuna göre filtrele" className={cn(styles.select, 'w-auto!')} value={jobFilter} onChange={event => setJobFilter(event.target.value)}><option value="all">Tüm durumlar</option><option value="active">Devam eden işler</option><option value="succeeded">Başarılı</option><option value="failed">Başarısız</option></select></div>
            {loading && !jobs.length ? <Loading /> : !visibleJobs.length ? <Empty icon={<History />} title={loadErrors.jobs && !jobs.length ? 'İşler yüklenemedi' : jobFilter !== 'all' ? 'Bu durumda yedekleme işi yok' : 'Henüz yedekleme işi yok'} description={loadErrors.jobs ? 'İşler yenilenemedi. Tekrar yenilemeyi deneyin.' : 'Oluşturulan yedekleme işlerinin durumu burada gösterilir.'}>{jobFilter !== 'all' && <Button variant="outline" onClick={() => setJobFilter('all')}>Tüm işleri göster</Button>}</Empty> : <>
              <div className={styles.tableWrap}><table className={styles.table}><caption className="sr-only">Son yedekleme işleri</caption><thead><tr><th scope="col">Cihaz</th><th scope="col">Yedek türü</th><th scope="col">Durum</th><th scope="col">Deneme</th><th scope="col">Oluşturulma</th></tr></thead><tbody>{visibleJobs.map(job => <tr key={job.id}><td><span className="text-sm font-medium">{job.deviceName}</span>{job.errorMessage && <p className="mt-1 wrap-break-word text-xs text-destructive">{job.errorMessage}</p>}</td><td className="text-xs">{typeLabel(job.backupType)}</td><td><JobStatus status={job.status} /></td><td className="font-mono text-xs">{job.attempts}</td><td className="whitespace-nowrap text-xs text-muted-foreground"><time dateTime={job.createdAt} title={date(job.createdAt)}>{backupAge(job.createdAt)}</time></td></tr>)}</tbody></table></div>
              <div className={styles.mobileList}>{visibleJobs.map(job => <article key={job.id} className={styles.record}><div className="flex flex-wrap items-center justify-between gap-2"><p className="break-all text-sm font-medium">{job.deviceName}</p><JobStatus status={job.status} /></div><p className="mt-3 text-xs text-muted-foreground">{typeLabel(job.backupType)} · {job.attempts} deneme</p><p className="mt-1 text-xs text-muted-foreground" title={date(job.createdAt)}>{backupAge(job.createdAt)}</p>{job.errorMessage && <p className="mt-3 wrap-break-word text-xs text-destructive">{job.errorMessage}</p>}</article>)}</div>
            </>}
          </section>
        </TabsContent>
        <TabsContent value="policies" className="mt-3">
          <section className={styles.collection} aria-labelledby="policy-heading">
            <h2 id="policy-heading" className="sr-only">Platform ve zamanlama</h2>
            <div className={styles.policyBody}>
              <div className={styles.policySelection}><div className={styles.policyField}><Label htmlFor="policy-device">Yapılandırılacak cihaz</Label><select id="policy-device" className={styles.select} value={policyDeviceId} onChange={event => choosePolicy(event.target.value)} disabled={!!busy || !devices.length}><option value="">Cihaz seçin</option>{sortedDevices.map(device => <option key={device.id} value={device.id}>{device.name}</option>)}</select></div>{!canEdit && <SemanticBadge tone="neutral" icon={ShieldCheck}>Salt okunur</SemanticBadge>}</div>
              {policyDevice && <form noValidate onSubmit={savePolicy} className={styles.policyGrid}>
                <div className={styles.policyTiming}><span>Son yedek: <span title={date(policyDevice.lastSuccessAt)}>{backupAge(policyDevice.lastSuccessAt)}</span></span>{policyDevice.policy?.enabled && <span>Kayıtlı sonraki çalışma: <time dateTime={policyDevice.policy.nextRunAt}>{date(policyDevice.policy.nextRunAt)}</time></span>}</div>
                <fieldset disabled={!canEdit || !!busy} className={styles.policyFields}><legend className="sr-only">Yedekleme politikası</legend>
                  <div className={styles.policyColumns}>
                    <div className={styles.policyField}><Label htmlFor="policy-platform">İşletim sistemi platformu</Label><select id="policy-platform" className={styles.select} value={settings.platform} onChange={event => { setSettings({ ...settings, platform: event.target.value, backup_type: 'Running Config' }); setActionError(uiError('')); }}><option value="">Envanter bilgisinden otomatik belirle</option>{Object.entries(BACKUP_PROFILES).map(([key, profile]) => <option key={key} value={key}>{profile.label}</option>)}</select></div>
                    <div className={styles.policyField}><Label htmlFor="policy-type">Zamanlanmış yedek türü</Label><select id="policy-type" className={styles.select} value={settings.backup_type} onChange={event => setSettings({ ...settings, backup_type: event.target.value })}><option value="Running Config">Çalışan yapılandırma</option>{(policyProfile?.startup || settings.backup_type === 'Startup Config') && <option value="Startup Config">Başlangıç yapılandırması</option>}</select></div>
                    {policyFields.slice(0, 2).map(field => renderPolicyField(field))}
                  </div>
                </fieldset>
                <section className={styles.policyAdvanced}>
                  <button type="button" aria-expanded={policyAdvanced} aria-controls="policy-advanced-fields" disabled={!!busy} className={styles.advancedToggle} onClick={() => setPolicyAdvanced(value => !value)}><Settings2 size={15} />Gelişmiş ayarlar<ChevronDown size={15} className={cn(styles.chevron, policyAdvanced && styles.chevronOpen)} /></button>
                  <div id="policy-advanced-fields" hidden={!policyAdvanced}><fieldset disabled={!canEdit || !!busy} className={styles.policyFields}><legend className="sr-only">Saklama ayarları</legend><div className={styles.policyColumns}>{policyFields.slice(2).map(field => renderPolicyField(field))}</div></fieldset></div>
                </section>
                {actionError && <Message tone="danger">{uiError(actionError)}</Message>}
                <div className={styles.policyActions}><div className={styles.policyEnabled}><Switch id="policy-enabled" checked={settings.enabled} disabled={!canEdit || !!busy} onCheckedChange={enabled => setSettings({ ...settings, enabled })} /><Label htmlFor="policy-enabled">Zamanlanmış yedekleme</Label></div>{canEdit && <div className="flex items-center gap-2">{policyDirty && <Button type="button" size="sm" variant="outline" aria-label="Değişiklikleri sıfırla" title="Değişiklikleri sıfırla" disabled={!!busy} onClick={() => choosePolicy(policyDeviceId)}><RefreshCw size={15} /></Button>}<Button type="submit" size="sm" disabled={!!busy || !policyDirty}>{busy === 'policy' ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}{busy === 'policy' ? 'Kaydediliyor…' : 'Ayarları kaydet'}</Button></div>}</div>
              </form>}
            </div>
          </section>
        </TabsContent>
      </Tabs>
      <footer className={styles.auditFooter}><Link href="/settings/audit" className="inline-flex items-center gap-1.5 underline underline-offset-4 hover:text-foreground"><History size={13} />Denetim kayıtları</Link></footer>
    </div>
    <BackupArtifactDialog backup={selectedBackup} canDownload={permissions.content} onClose={() => setSelectedBackup(null)} />
    <Dialog open={createOpen} onOpenChange={open => { if (!busy) { setCreateOpen(open); setActionError(uiError('')); } }}>
      <DialogContent className={styles.createDialog} aria-describedby={undefined}><DialogHeader><DialogTitle className={styles.createTitle}><DatabaseBackup size={17} className="text-primary" />Yeni yedek oluştur</DialogTitle></DialogHeader>
        <form onSubmit={create} className={styles.createForm}><fieldset disabled={!!busy} className={styles.createFields}><legend className="sr-only">Yeni yedek bilgileri</legend>
          <div className={styles.createField}><Label htmlFor="backup-device">Cihaz</Label><select id="backup-device" required className={styles.select} value={deviceId} onChange={event => { setDeviceId(event.target.value); setBackupType('Running Config'); setActionError(uiError('')); }}><option value="">Cihaz seçin</option>{sortedDevices.map(device => <option key={device.id} value={device.id}>{device.name}{device.platform ? '' : ' — platform seçilmeli'}</option>)}</select></div>
          {selectedDevice && !selectedProfile && <div role="status" className={styles.platformWarning}><p>Yedek oluşturmadan önce işletim sistemi platformunu seçin.{!canEdit && ' Bir yöneticiyle iletişime geçin.'}</p>{canEdit && <Button type="button" variant="outline" size="sm" onClick={() => { setCreateOpen(false); choosePolicy(deviceId); setTab('policies'); }}>Platform ayarlarına git</Button>}</div>}
          <div className={styles.createField}><Label htmlFor="backup-type">Yedek türü</Label><select id="backup-type" className={styles.select} value={backupType} onChange={event => setBackupType(event.target.value)}><option value="Running Config">Çalışan yapılandırma</option>{selectedProfile?.startup && <option value="Startup Config">Başlangıç yapılandırması</option>}</select></div>
          <div className={styles.createField}><Label htmlFor="backup-note">Açıklama <span className="font-normal text-muted-foreground">(isteğe bağlı)</span></Label><Input id="backup-note" maxLength={1000} placeholder="Örn. Bakım öncesi" value={description} onChange={event => setDescription(event.target.value)} /></div>
        </fieldset>
        {available === false && <Message tone="warning">Servis şu anda hazır değil. İş kuyruğa alınır ve servis hazır olduğunda çalışır.</Message>}
        {actionError && <Message tone="danger">{uiError(actionError)}</Message>}
        <DialogFooter className={styles.createActions}><Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={() => setCreateOpen(false)}>Vazgeç</Button><Button type="submit" size="sm" disabled={!!busy || !selectedProfile} className="gap-2">{busy === 'create' ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}{busy === 'create' ? 'Kuyruğa ekleniyor…' : 'Kuyruğa ekle'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <AlertDialog open={!!pendingDelete} onOpenChange={open => { if (!open && !busy) { setPendingDelete(null); setActionError(uiError('')); } }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle className="flex items-center gap-2"><TriangleAlert className="h-5 w-5 text-destructive" />Yapılandırma yedeği silinsin mi?</AlertDialogTitle><AlertDialogDescription>Seçili yedek kalıcı olarak silinir. Bu işlem geri alınamaz.</AlertDialogDescription></AlertDialogHeader>
        {pendingDelete && <div className="min-w-0 space-y-1 rounded-lg border border-border bg-muted/30 p-4"><p className="break-all text-sm font-semibold">{pendingDelete.device_name}</p><p className="break-all font-mono text-xs text-muted-foreground">{pendingDelete.file_name}</p><p className="text-xs text-muted-foreground">{date(pendingDelete.created_at)} · {sizeLabel(pendingDelete.file_size)}</p></div>}
        {actionError && <Message tone="danger">{uiError(actionError)}</Message>}
        <AlertDialogFooter><AlertDialogCancel disabled={!!busy}>Vazgeç</AlertDialogCancel><Button variant="destructive" disabled={!!busy} className="gap-2" onClick={() => void remove()}>{busy === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}{busy === 'delete' ? 'Siliniyor…' : 'Yedeği kalıcı olarak sil'}</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}

function Stat({ icon, label, value, warning = false }: { icon: ReactNode; label: string; value: string; warning?: boolean }) {
  return <div className={styles.stat}><div className="flex items-center justify-between gap-3"><span className="text-xs font-medium text-muted-foreground">{label}</span><span className={cn(styles.statIcon, warning && 'bg-amber-500/10! text-amber-600! dark:text-amber-300!')}>{icon}</span></div><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p></div>;
}
function BackupIdentity({ backup }: { backup: Backup }) {
  return <div className="flex min-w-0 items-start gap-3"><span className={styles.fileIcon}><FileCode2 className="h-4 w-4" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2">{backup.inventory_device_id && !backup.archived ? <Link className="break-all text-sm font-semibold underline-offset-4 hover:text-primary hover:underline" href={`/integrations/nms/devices/${backup.inventory_device_id}`}>{backup.device_name}</Link> : <span className="break-all text-sm font-semibold">{backup.device_name}</span>}{backup.archived && <Badge variant="secondary" icon={null} className="text-[10px]">Arşiv</Badge>}</div><p title={backup.file_name} className={styles.fileName}>{backup.file_name}</p>{backup.description && <p className="mt-1 wrap-break-word text-xs text-muted-foreground">{backup.description}</p>}</div></div>;
}
function JobStatus({ status }: { status: string }) {
  const state = jobStates[status];
  return <SemanticBadge tone={state?.tone || 'neutral'} icon={status === 'running' ? Loader2 : status === 'queued' ? Clock3 : undefined}>{state?.label || 'Durum bilinmiyor'}</SemanticBadge>;
}
function Message({ children, tone }: { children: ReactNode; tone: 'danger' | 'warning' }) {
  return <div role={tone === 'danger' ? 'alert' : 'status'} className={cn(styles.message, tone === 'danger' ? 'border-destructive/25 bg-destructive/5 text-destructive' : 'border-amber-500/25 bg-amber-500/5 text-amber-800 dark:text-amber-200')}><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /><p className="min-w-0 wrap-break-word text-xs leading-relaxed">{children}</p></div>;
}
function Empty({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children?: ReactNode }) {
  return <div className={styles.empty}><span className={styles.emptyIcon}>{icon}</span><h3 className="text-sm font-semibold">{title}</h3><p className="mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</p>{children && <div className="mt-5">{children}</div>}</div>;
}
function Loading() {
  return <div role="status" className="flex min-h-36 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-primary" />Yedekler yükleniyor…</div>;
}
