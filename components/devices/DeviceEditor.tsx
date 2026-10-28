'use client';

import { useState } from 'react';
import { AlertTriangle, Check, CircleHelp, Database, Layers3, MapPin, RefreshCw, Search, Server, Unplug } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RackElevation } from '@/components/racks/RackElevation';
import type { RackRecord } from '@/components/racks/types';
import { availableUnitRanges, deviceUnitHeight, firstAvailableUnit, placementIssue } from '@/lib/racks/device-placement';
import { uiError, uiLabel } from '@/lib/i18n/tr';
import type { DeviceFormValues, InventoryDevice } from './types';
import { INVENTORY_TYPES } from './types';
import styles from './DeviceEditor.module.css';

export function DeviceEditor({ device, initialTab = 'details', racks, racksLoading, racksError, onRefreshRacks, onClose, onSave }: {
  device?: InventoryDevice; initialTab?: 'details' | 'placement'; racks: RackRecord[]; racksLoading: boolean; racksError: string | null;
  onRefreshRacks: () => void; onClose: () => void; onSave: (values: DeviceFormValues) => Promise<void>;
}) {
  const [tab, setTab] = useState(initialTab);
  const [form, setForm] = useState(() => ({ name: device?.name || '', type: device?.type || 'PHYSICAL_SERVER', vendor: device?.vendor || '', model: device?.model || '', serialNumber: device?.serialNumber || '', supportDate: device?.supportDate?.slice(0, 10) || '', criticality: device?.criticality || 'MEDIUM', status: device?.status || 'ACTIVE', rackId: device?.rackId || '', start: !device?.rackId || device.rackUnitPosition == null ? '' : String(device.rackUnitPosition), height: String(deviceUnitHeight(device?.metadata)) }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const height = Number(form.height);
  const start = form.start === '' ? null : Number(form.start);
  const rack = racks.find(candidate => candidate.id === form.rackId) || null;
  const issue = placementIssue({ rackId: form.rackId || null, rack, start: form.rackId ? start : null, height, deviceId: device?.id });
  const ranges = rack ? availableUnitRanges(rack, device?.id) : [];
  const freeStart = rack ? firstAvailableUnit(rack, height, device?.id) : null;
  const candidateId = device?.id || 'device-placement-preview';
  const candidate = { id: candidateId, name: form.name || 'Yeni cihaz', type: form.type, status: form.status, rackUnitPosition: start, metadata: { unitHeight: height } };
  const previewRack = rack ? { ...rack, devices: [...rack.devices.filter(item => item.id !== device?.id), ...(!issue ? [candidate] : [])] } : null;
  const field = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(null);
    if (!form.name.trim()) { setError('Cihaz adı zorunludur.'); setTab('details'); return; }
    if (issue) { setError(issue); setTab('placement'); return; }
    if (form.rackId && (racksLoading || racksError)) { setError('Kaydetmeden önce kabinet bilgilerini tekrar yükleyin.'); setTab('placement'); return; }
    setSaving(true);
    try { await onSave({ name: form.name.trim(), type: form.type, vendor: form.vendor.trim(), model: form.model.trim(), serialNumber: form.serialNumber.trim(), supportDate: form.supportDate || null, criticality: form.criticality, status: form.status, rackId: form.rackId || null, rackUnitPosition: form.rackId ? start : null, unitHeight: height }); }
    catch (saveError) { setError(uiError(saveError, 'Cihaz kaydedilemedi.')); }
    finally { setSaving(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}><DialogContent className={styles.dialog} aria-describedby={undefined}><DialogHeader><DialogTitle className={styles.title}>{device ? 'Cihazı düzenle' : 'Cihaz ekle'}</DialogTitle></DialogHeader>
    <form onSubmit={submit} className={styles.form}>
      <Tabs value={tab} onValueChange={value => setTab(value as 'details' | 'placement')}><TabsList aria-label="Cihaz düzenleme bölümleri" className={styles.tabs}><TabsTrigger value="details"><Server size={16} />Cihaz bilgileri</TabsTrigger><TabsTrigger value="placement"><Layers3 size={16} />Kabinet ve U yerleşimi</TabsTrigger></TabsList>
        <TabsContent value="details" className={styles.details}>
          <div className={styles.twoColumns}><label htmlFor="device-name">Cihaz adı <span>*</span><Input id="device-name" required maxLength={255} value={form.name} onChange={event => field('name', event.target.value)} placeholder="Örn. Uygulama Sunucusu 01" /></label><label htmlFor="device-type">Cihaz tipi<select id="device-type" value={form.type} onChange={event => field('type', event.target.value)}>{!INVENTORY_TYPES.includes(form.type) && <option value={form.type}>{uiLabel(form.type)}</option>}{INVENTORY_TYPES.map(type => <option key={type} value={type}>{uiLabel(type)}</option>)}</select></label></div>
          <div className={styles.twoColumns}><label htmlFor="device-vendor">Üretici<Input id="device-vendor" value={form.vendor} onChange={event => field('vendor', event.target.value)} placeholder="Örn. Dell" /></label><label htmlFor="device-model">Model<Input id="device-model" value={form.model} onChange={event => field('model', event.target.value)} placeholder="Örn. PowerEdge R750" /></label></div>
          <div className={styles.twoColumns}><label htmlFor="device-serial">Seri numarası<Input id="device-serial" value={form.serialNumber} onChange={event => field('serialNumber', event.target.value)} /></label><label htmlFor="device-support">Destek bitiş tarihi<Input id="device-support" type="date" value={form.supportDate} onChange={event => field('supportDate', event.target.value)} /></label></div>
          <div className={styles.twoColumns}><label htmlFor="device-status">Çalışma durumu<select id="device-status" value={form.status} onChange={event => field('status', event.target.value)}>{['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'DECOMMISSIONED', 'UNKNOWN'].map(status => <option key={status} value={status}>{uiLabel(status)}</option>)}</select></label><label htmlFor="device-priority">Kritiklik<select id="device-priority" value={form.criticality} onChange={event => field('criticality', event.target.value)}>{['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'].map(value => <option key={value} value={value}>{uiLabel(value)}</option>)}</select></label></div>
        </TabsContent>
        <TabsContent value="placement" className={styles.placement}>
          <div className={styles.controls}>
            <label htmlFor="device-rack">Kabinet<select id="device-rack" value={form.rackId} disabled={racksLoading} onChange={event => setForm(current => ({ ...current, rackId: event.target.value, start: '' }))}><option value="">Kabinet atanmamış</option>{device?.rackId && !racks.some(item => item.id === device.rackId) && <option value={device.rackId}>{device.rack?.name || 'Mevcut kabinet'} · Bilgi yüklenemedi</option>}{racks.map(item => <option key={item.id} value={item.id}>{item.name} · {item.room?.name || 'Oda yok'} · {item.maxUnits} U</option>)}</select></label>
            {racksLoading && <p className={styles.help} role="status"><RefreshCw size={14} className="animate-spin" />Güncel kabinet bilgileri yükleniyor…</p>}
            {racksError && <div className={styles.warning} role="alert"><AlertTriangle size={16} /><div><p>{racksError}</p><Button type="button" variant="outline" size="sm" onClick={onRefreshRacks}>Kabinetleri tekrar yükle</Button></div></div>}
            {rack && <p className={styles.help}><MapPin size={14} aria-hidden="true" />{[rack.room?.floor?.building?.name, rack.room?.name].filter(Boolean).join(' / ')} · {rack.maxUnits} U kapasite</p>}
            <div className={styles.twoColumns}><label htmlFor="device-start">Başlangıç U konumu<Input id="device-start" type="number" min={1} max={rack?.maxUnits || 100} step={1} disabled={!form.rackId} value={form.start} onChange={event => field('start', event.target.value)} placeholder="Atanmamış" /></label><label htmlFor="device-height">Cihaz yüksekliği (U) <span>*</span><Input id="device-height" type="number" required min={1} max={100} step={1} value={form.height} onChange={event => field('height', event.target.value)} /></label></div>
            <details className={styles.placementHelp}><summary><CircleHelp size={14} aria-hidden="true" />U konumu yardımı</summary><p>U 1 en alttaki birimdir; 1 U ≈ 4,45 cm. Başlangıç U 5 ve yükseklik 2 U ise cihaz U 5–6 aralığını kaplar.</p></details>
            {rack && <><Button type="button" variant="outline" size="sm" disabled={racksLoading || freeStart == null} onClick={() => field('start', String(freeStart))}><Search size={15} />Uygun boş konum bul</Button><p className={styles.help}>{freeStart == null ? 'Bu yükseklikte ardışık boş alan bulunamadı.' : `İlk uygun başlangıç: U ${freeStart}. Düğmeye basarak önizlemeye alın.`}</p><div className={styles.ranges}><span>Kayıtlı cihazlara göre boş aralıklar</span><p>{ranges.length ? ranges.map(range => range.start === range.end ? `U ${range.start}` : `U ${range.start}–${range.end}`).join(' · ') : 'Boş aralık yok'}</p><small>Konumu atanmamış diğer cihazlar bu aralıkları rezerve etmez.</small></div></>}
            {issue ? <div className={styles.warning} role="alert"><AlertTriangle size={17} /><p>{issue}</p></div> : <div className={styles.outcome} role="status"><Check size={17} /><p>{!form.rackId ? 'Kaydedildiğinde cihazın kabinet bağlantısı ve U konumu boş olacak.' : start == null ? `${rack?.name} kabinetine atanacak; U konumu bekleyecek.` : `${rack?.name} · U ${start}${height > 1 ? `–${start + height - 1}` : ''} · ${height} U. Seçilen aralık uygun.`}</p></div>}
            {form.rackId && <Button type="button" variant="ghost" size="sm" className={styles.remove} onClick={() => setForm(current => ({ ...current, rackId: '', start: '' }))}><Unplug size={15} />Kabinet atamasını kaldır</Button>}
          </div>
          <div className={styles.preview}><div className={styles.previewTitle}><Layers3 size={16} aria-hidden="true" /><h3>Yerleşim önizlemesi</h3></div>{previewRack ? <RackElevation rack={previewRack} selectedDeviceId={!issue ? candidateId : null} onSelectDevice={() => {}} preview /> : <div className={styles.previewEmpty}><Database size={24} /><h4>Bir kabinet seçin</h4></div>}</div>
        </TabsContent>
      </Tabs>
      {issue && tab === 'details' && <div className={styles.warning} role="alert"><AlertTriangle size={16} /><div><p>{issue}</p><Button type="button" variant="outline" size="sm" onClick={() => setTab('placement')}>Yerleşimi kontrol et</Button></div></div>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <DialogFooter className={styles.footer}><Button type="button" size="sm" variant="outline" disabled={saving} onClick={onClose}>Vazgeç</Button><Button type="submit" size="sm" disabled={saving || Boolean(issue) || Boolean(form.rackId) && (racksLoading || Boolean(racksError))}>{saving ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}{saving ? 'Kaydediliyor…' : 'Kaydet'}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}
