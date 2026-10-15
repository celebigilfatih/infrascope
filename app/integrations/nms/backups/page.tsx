'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { BACKUP_PROFILES, type BackupPlatform } from '@/lib/nms/backup-platform';

interface Backup { id: string; device_id: number | null; device_name: string; backup_type: string; file_name: string; file_size: number; created_at: string; archived: boolean }
interface Job { id: string; deviceName: string; backupType: string; status: string; attempts: number; errorMessage: string | null; createdAt: string; backupId: string | null }
interface Policy { enabled: boolean; backupType: string; intervalHours: number; retentionDays: number; keepLast: number; staleAfterHours: number; nextRunAt: string }
interface Device { id: number; name: string; platform: BackupPlatform | null; policy: Policy | null; lastSuccessAt: string | null }
const states: Record<string, string> = { queued: 'Bekliyor', running: 'Çalışıyor', retrying: 'Tekrar denenecek', succeeded: 'Başarılı', failed: 'Başarısız' };
const fieldClass = 'w-full rounded border bg-background p-2 text-sm';
const date = (value: string | null) => value ? new Date(value).toLocaleString('tr-TR') : 'Henüz yok';

export default function NmsBackupsPage() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [permissions, setPermissions] = useState({ create: false, content: false, delete: false });
  const [canEdit, setCanEdit] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [serverSearch, setServerSearch] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [deviceId, setDeviceId] = useState('');
  const [backupType, setBackupType] = useState('Running Config');
  const [description, setDescription] = useState('');
  const [policyDeviceId, setPolicyDeviceId] = useState('');
  const [settings, setSettings] = useState({ platform: '', enabled: false, backup_type: 'Running Config', interval_hours: 24, retention_days: 90, keep_last: 10, stale_after_hours: 48 });
  const requestKey = useRef('');
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    try {
      const [list, work, configuration] = await Promise.all([
        apiGet('/api/integrations/nms/backups', { limit: 100, offset: page * 100, search: serverSearch }, { timeout: 10000 }),
        apiGet('/api/integrations/nms/backup-jobs', undefined, { timeout: 10000 }),
        apiGet('/api/integrations/nms/backup-policies', undefined, { timeout: 10000 }),
      ]);
      if (sequence !== requestSequence.current) return;
      if (list.error || work.error || configuration.error) throw new Error(list.error || work.error || configuration.error);
      setBackups(list.data); setTotal(list.total); setPermissions(list.permissions); setJobs(work.jobs); setDevices(configuration.devices); setCanEdit(configuration.canEdit); setError('');
    } catch (err) { if (sequence === requestSequence.current) setError(err instanceof Error ? err.message : 'Yedekleme bilgileri yüklenemedi.'); }
    finally { if (sequence === requestSequence.current) setLoading(false); }
  }, [page, serverSearch]);

  useEffect(() => { void load(); const timer = setInterval(load, 10000); return () => clearInterval(timer); }, [load]);
  useEffect(() => {
    const check = async () => { const result = await apiGet('/api/integrations/nms/backups/health'); setAvailable(result.available === true); };
    void check(); const timer = setInterval(check, 30000); return () => clearInterval(timer);
  }, []);
  useEffect(() => { requestKey.current = crypto.randomUUID(); }, [deviceId, backupType, description]);

  const selectedDevice = devices.find(device => String(device.id) === deviceId);
  const selectedProfile = selectedDevice?.platform ? BACKUP_PROFILES[selectedDevice.platform] : null;
  const choosePolicy = (id: string) => {
    setPolicyDeviceId(id);
    const device = devices.find(item => String(item.id) === id);
    const policy = device?.policy;
    setSettings({ platform: device?.platform || '', enabled: policy?.enabled || false, backup_type: policy?.backupType || 'Running Config',
      interval_hours: policy?.intervalHours || 24, retention_days: policy?.retentionDays || 90, keep_last: policy?.keepLast || 10, stale_after_hours: policy?.staleAfterHours || 48 });
  };
  const create = async () => {
    setBusy(true); setNotice('');
    try {
      const result = await apiPost('/api/integrations/nms/backups', { device_id: Number(deviceId), backup_type: backupType, description: description || null }, { headers: { 'Idempotency-Key': requestKey.current }, timeout: 10000 });
      if (!result.success) throw new Error(result.error || 'İş kaydedilemedi.');
      setNotice(`Yedekleme işi ${result.reused ? 'zaten kayıtlı' : 'kuyruğa alındı'}. Sonuç aşağıdaki iş listesinde gösterilir.`);
      requestKey.current = crypto.randomUUID();
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'İş kaydedilemedi.'); }
    finally { setBusy(false); }
  };
  const savePolicy = async () => {
    setBusy(true); setNotice('');
    try {
      const result = await apiPut('/api/integrations/nms/backup-policies', { ...settings, platform: settings.platform || null, device_id: Number(policyDeviceId) });
      if (!result.success) throw new Error(result.error || 'Ayarlar kaydedilemedi.');
      setNotice('Yedekleme ayarları kaydedildi. Zamanlama açıksa ilk iş seçilen aralık sonunda çalışır.'); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Ayarlar kaydedilemedi.'); }
    finally { setBusy(false); }
  };
  const remove = async (backup: Backup) => {
    if (!confirm(`${backup.device_name} cihazının bu yedeği kalıcı olarak silinsin mi?`)) return;
    setBusy(true);
    try { const result = await apiDelete(`/api/integrations/nms/backups/${backup.id}`); if (!result.success) setError(result.error); else await load(); }
    finally { setBusy(false); }
  };

  return <div className="p-6 space-y-6">
    <div className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-bold">Konfigürasyon yedekleri</h1><p className="text-sm text-muted-foreground">Cihaz yedekleri, işler ve zamanlama</p></div><Button variant="outline" onClick={load}>Yenile</Button></div>
    <p role="status" className={available === false ? 'text-amber-600' : 'text-muted-foreground'}>{available === null ? 'Yedekleme servisi kontrol ediliyor…' : available ? 'Yedekleme servisi hazır.' : 'Yedekleme servisine ulaşılamıyor. Kayıtlı yedekler okunabilir; yeni işler servisi bekler.'}</p>
    {error && <p role="alert" className="rounded border border-destructive p-3 text-destructive">{error} Önceki bilgiler güncel olmayabilir.</p>}
    {notice && <p role="status" className="rounded border p-3">{notice}</p>}

    {permissions.create && <Card><CardContent className="p-4 space-y-3">
      <h2 className="font-semibold">Yedek oluştur</h2>
      <div className="grid gap-3 md:grid-cols-3"><div><Label htmlFor="backup-device">Cihaz</Label><select id="backup-device" className={fieldClass} value={deviceId} onChange={event => { setDeviceId(event.target.value); setBackupType('Running Config'); }}><option value="">Cihaz seçin</option>{devices.map(device => <option key={device.id} value={device.id}>{device.name}{device.platform ? '' : ' — platform seçilmeli'}</option>)}</select></div>
      <div><Label htmlFor="backup-type">Yedek türü</Label><select id="backup-type" className={fieldClass} value={backupType} onChange={event => setBackupType(event.target.value)}><option value="Running Config">Çalışan yapılandırma</option>{selectedProfile?.startup && <option value="Startup Config">Başlangıç yapılandırması</option>}</select></div>
      <div><Label htmlFor="backup-note">Açıklama</Label><Input id="backup-note" maxLength={1000} value={description} onChange={event => setDescription(event.target.value)} /></div></div>
      <p className="text-sm text-muted-foreground">{selectedDevice ? selectedProfile?.label || 'Aşağıdaki ayarlardan cihazın işletim sistemi platformunu seçin.' : 'Yapılandırma SSH üzerinden okunur ve şifreli saklanır.'}</p>
      <Button disabled={busy || !selectedProfile} onClick={create}>{busy ? 'Kaydediliyor…' : 'Kuyruğa ekle'}</Button>
    </CardContent></Card>}

    <Card><CardContent className="p-4 space-y-3"><h2 className="font-semibold">Son yedekleme işleri</h2>
      {loading ? <p>Yükleniyor…</p> : !jobs.length ? <p className="text-sm text-muted-foreground">Kayıtlı iş yok.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Cihaz</th><th>Tür</th><th>Durum</th><th>Deneme</th><th>Açıklama</th><th>Oluşturulma</th></tr></thead><tbody>{jobs.map(job => <tr key={job.id} className="border-b"><td className="p-2">{job.deviceName}</td><td>{job.backupType === 'Startup Config' ? 'Başlangıç' : 'Çalışan'}</td><td className={job.status === 'failed' ? 'text-destructive' : ''}>{states[job.status] || job.status}</td><td>{job.attempts}</td><td>{job.errorMessage || '—'}</td><td>{date(job.createdAt)}</td></tr>)}</tbody></table></div>}
      <p className="text-xs text-muted-foreground">Son 100 iş gösterilir. Sayfa 10 saniyede bir yenilenir.</p>
    </CardContent></Card>

    <Card><CardContent className="p-4 space-y-3"><h2 className="font-semibold">Kayıtlı yedekler ({total})</h2><form className="flex gap-2" onSubmit={event => { event.preventDefault(); setPage(0); setServerSearch(search); }}><Input aria-label="Yedek ara" placeholder="Cihaz veya dosya adıyla ara" value={search} onChange={event => setSearch(event.target.value)} /><Button type="submit" variant="outline">Ara</Button></form>
      {loading ? <p>Yükleniyor…</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Cihaz</th><th>Tür</th><th>Boyut</th><th>Tarih</th><th>İşlemler</th></tr></thead><tbody>{backups.map(backup => <tr key={backup.id} className="border-b"><td className="p-2">{backup.device_name}{backup.archived && <span className="ml-2 text-muted-foreground">(arşiv)</span>}<div className="text-xs text-muted-foreground">{backup.file_name}</div></td><td>{backup.backup_type === 'Startup Config' ? 'Başlangıç' : 'Çalışan'}</td><td>{(backup.file_size / 1024).toFixed(1)} KiB</td><td>{date(backup.created_at)}</td><td className="space-x-2">{permissions.content && <a className="underline" href={`/api/integrations/nms/backups/${backup.id}?action=download`}>İndir</a>}{permissions.delete && <Button size="sm" variant="ghost" disabled={busy} onClick={() => remove(backup)}>Sil</Button>}</td></tr>)}</tbody></table>{!backups.length && <p className="p-3 text-muted-foreground">Kayıtlı yedek yok.</p>}</div>}
      <div className="flex items-center gap-3"><Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Önceki</Button><span className="text-sm">{page + 1}. sayfa</span><Button variant="outline" disabled={(page + 1) * 100 >= total} onClick={() => setPage(page + 1)}>Sonraki</Button></div>
    </CardContent></Card>

    <Card><CardContent className="p-4 space-y-4"><h2 className="font-semibold">Platform ve zamanlama ayarları</h2><p className="text-sm text-muted-foreground">Zamanlama açıkça etkinleştirilmelidir. İzleme kapalıyken de SSH yedekleme çalışır.</p>
      <Label htmlFor="policy-device">Cihaz</Label><select id="policy-device" className={fieldClass} value={policyDeviceId} onChange={event => choosePolicy(event.target.value)}><option value="">Cihaz seçin</option>{devices.map(device => <option key={device.id} value={device.id}>{device.name} — son yedek: {date(device.lastSuccessAt)}</option>)}</select>
      {policyDeviceId && <fieldset disabled={!canEdit || busy} className="space-y-4">
        <div><Label htmlFor="policy-platform">İşletim sistemi platformu</Label><select id="policy-platform" className={fieldClass} value={settings.platform} onChange={event => setSettings({ ...settings, platform: event.target.value, backup_type: 'Running Config' })}><option value="">Envanter bilgisinden otomatik belirle</option>{Object.entries(BACKUP_PROFILES).map(([key, profile]) => <option key={key} value={key}>{profile.label}</option>)}</select></div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={settings.enabled} onChange={event => setSettings({ ...settings, enabled: event.target.checked })} /> Zamanlanmış yedeklemeyi etkinleştir</label>
        <div><Label htmlFor="policy-type">Zamanlanmış yedek türü</Label><select id="policy-type" className={fieldClass} value={settings.backup_type} onChange={event => setSettings({ ...settings, backup_type: event.target.value })}><option value="Running Config">Çalışan yapılandırma</option>{settings.platform && BACKUP_PROFILES[settings.platform as BackupPlatform]?.startup && <option value="Startup Config">Başlangıç yapılandırması</option>}</select></div>
        <div className="grid gap-3 md:grid-cols-4">{([['interval_hours', 'Aralık (saat)'], ['stale_after_hours', 'Gecikme alarmı (saat)'], ['retention_days', 'Saklama süresi (gün)'], ['keep_last', 'Korunacak en az yedek']] as const).map(([key, label]) => <div key={key}><Label htmlFor={key}>{label}</Label><Input id={key} type="number" min={1} value={settings[key]} onChange={event => setSettings({ ...settings, [key]: Number(event.target.value) })} /></div>)}</div>
        {canEdit && <Button onClick={savePolicy}>Ayarları kaydet</Button>}
      </fieldset>}
      {!canEdit && <p className="text-sm text-muted-foreground">Ayarları yalnızca yönetici değiştirebilir.</p>}
      <p className="text-sm text-muted-foreground">Cihaz yedeği, uygulama veritabanının felaket kurtarma yedeğinin yerine geçmez. <Link className="underline" href="/settings/audit">Denetim kayıtları</Link></p>
    </CardContent></Card>
  </div>;
}
