'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { AlertTriangle, Building2, Database, Info, Layers3, MapPin, Plus, RefreshCw, Search, Server, Trash2, X } from 'lucide-react';
import { PageHeading } from '@/components/ui/page-heading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { RackDetails } from '@/components/racks/RackDetails';
import { RackStatus } from '@/components/racks/RackStatus';
import type { RackRecord, RackRoom } from '@/components/racks/types';
import { presentRack } from '@/lib/racks/presentation';
import { uiError } from '@/lib/i18n/tr';
import { cn } from '@/lib/utils';
import styles from './page.module.css';

const EMPTY_FORM = { name: '', roomId: '', maxUnits: '42', type: 'RACK_42U', operationalStatus: 'OPERATIONAL', position: '' };
const number = (value: number) => value.toLocaleString('tr-TR');

export default function RacksPage() {
  const { toast } = useToast();
  const [racks, setRacks] = useState<RackRecord[]>([]);
  const [rooms, setRooms] = useState<RackRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roomFilter, setRoomFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [capacityFilter, setCapacityFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [editor, setEditor] = useState<'add' | 'edit' | null>(null);
  const [editRack, setEditRack] = useState<RackRecord | null>(null);
  const [deleteRack, setDeleteRack] = useState<RackRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadRacks = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else { setLoading(true); setError(null); }
    try {
      const response = await fetch('/api/racks?fresh=1', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(uiError(body.error || 'Kabinetler yüklenemedi.'));
      setRacks(body.data || []); setError(null);
    } catch (loadError) {
      const message = uiError(loadError, 'Kabinetler yüklenemedi.');
      if (silent) toast({ title: 'Kabinetler yenilenemedi', description: message, variant: 'destructive' });
      else setError(message);
    } finally { setLoading(false); setRefreshing(false); }
  }, [toast]);
  const loadRooms = useCallback(async () => {
    setRoomsLoading(true); setRoomsError(null);
    try {
      const response = await fetch('/api/rooms');
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(uiError(body.error || 'Oda listesi yüklenemedi.'));
      setRooms(body.data || []);
    } catch (loadError) { setRoomsError(uiError(loadError, 'Oda listesi yüklenemedi.')); }
    finally { setRoomsLoading(false); }
  }, []);
  useEffect(() => { loadRacks(); loadRooms(); }, [loadRacks, loadRooms]);

  const presentations = useMemo(() => new Map(racks.map(rack => [rack.id, presentRack(rack.maxUnits, rack.devices)])), [racks]);
  const filterRooms = useMemo(() => [...new Map(racks.filter(rack => rack.room).map(rack => [rack.room!.id, rack.room!])).values()], [racks]);
  const filtered = useMemo(() => racks.filter(rack => {
    const query = search.trim().toLocaleLowerCase('tr-TR');
    const haystack = [rack.name, rack.room?.name, rack.room?.floor?.name, rack.room?.floor?.building?.name, rack.position, ...rack.devices.map(device => device.name)].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR');
    const capacity = presentations.get(rack.id)!.capacity;
    return (!query || haystack.includes(query)) && (roomFilter === 'all' || (roomFilter === 'unassigned' ? !rack.room : rack.room?.id === roomFilter)) && (statusFilter === 'all' || rack.operationalStatus === statusFilter) && (capacityFilter === 'all' || capacityFilter === 'high' && capacity.utilization >= 85 || capacityFilter === 'available' && capacity.availableUnits > 0 || capacityFilter === 'attention' && (capacity.unpositionedDevices > 0 || capacity.conflictDevices > 0));
  }), [racks, presentations, search, roomFilter, statusFilter, capacityFilter]);
  const selectedRack = filtered.find(rack => rack.id === selectedId) || filtered[0] || null;
  const hasFilters = Boolean(search) || roomFilter !== 'all' || statusFilter !== 'all' || capacityFilter !== 'all';
  const clearFilters = () => { setSearch(''); setRoomFilter('all'); setStatusFilter('all'); setCapacityFilter('all'); };
  const totals = [...presentations.values()].reduce((total, { capacity }) => ({ used: total.used + capacity.usedUnits, units: total.units + capacity.totalUnits, available: total.available + capacity.availableUnits, unassigned: total.unassigned + capacity.unpositionedDevices, conflicts: total.conflicts + capacity.conflictDevices }), { used: 0, units: 0, available: 0, unassigned: 0, conflicts: 0 });
  const totalDevices = racks.reduce((total, rack) => total + rack.devices.length, 0);
  const metrics = [
    { label: 'Kabinet', value: number(racks.length), detail: `${filterRooms.length} sistem odasında`, icon: Database },
    { label: 'Cihaz', value: number(totalDevices), detail: totals.unassigned ? `${totals.unassigned} cihazın konumu atanmamış` : 'Kabinetlere bağlı cihazlar', icon: Server },
    { label: 'Hesaplanan doluluk', value: `%${totals.units ? Math.round(totals.used / totals.units * 100) : 0}`, detail: `${number(totals.used)} / ${number(totals.units)} U kullanılıyor`, icon: Layers3 },
    { label: 'Boş kapasite', value: `${number(totals.available)} U`, detail: 'Tüm kabinetlerdeki toplam boş alan', icon: Building2 },
  ];

  const openAdd = () => { setEditRack(null); setForm({ ...EMPTY_FORM }); setFormError(null); setEditor('add'); };
  const openEdit = (rack: RackRecord) => { setEditRack(rack); setForm({ name: rack.name, roomId: rack.room?.id || '', maxUnits: String(rack.maxUnits), type: rack.type, operationalStatus: rack.operationalStatus, position: rack.position || '' }); setFormError(null); setEditor('edit'); };
  const openDelete = (rack: RackRecord) => { setDeleteRack(rack); setDeleteError(null); };
  const handleSave = async (event: FormEvent) => {
    event.preventDefault(); setFormError(null);
    const maxUnits = Number(form.maxUnits);
    if (!form.name.trim() || editor === 'add' && !form.roomId) { setFormError('Kabinet adı ve oda zorunludur.'); return; }
    if (!Number.isInteger(maxUnits) || maxUnits < 1 || maxUnits > 100) { setFormError('Kabinet kapasitesi 1–100 arasında bir tam sayı olmalıdır.'); return; }
    if (editRack && maxUnits < editRack.maxUnits && presentRack(editRack.maxUnits, editRack.devices).resolved.some(item => !item.isAutoPositioned && Number(item.device.rackUnitPosition) + item.unitHeight - 1 > maxUnits)) { setFormError('Kapasite küçültülemiyor. Bazı cihazların konumları yeni sınırı aşıyor. Önce cihaz yerleşimini güncelleyin.'); return; }
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), maxUnits, type: form.type, operationalStatus: form.operationalStatus, position: form.position.trim() || null, ...(editor === 'add' ? { roomId: form.roomId } : {}) };
      const response = await fetch(editRack ? `/api/racks/${editRack.id}` : '/api/racks', { method: editRack ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(uiError(body.error || 'Kabinet kaydedilemedi.'));
      if (body.data?.id) setSelectedId(body.data.id);
      setEditor(null); setEditRack(null);
      toast({ title: 'Kabinet kaydedildi', description: `${payload.name} bilgileri güncellendi.` });
      await loadRacks(true);
    } catch (saveError) { setFormError(uiError(saveError, 'Kabinet kaydedilemedi.')); }
    finally { setSaving(false); }
  };
  const handleDelete = async () => {
    if (!deleteRack || deleteRack.devices.length > 0) return;
    setSaving(true); setDeleteError(null);
    try {
      const response = await fetch(`/api/racks/${deleteRack.id}`, { method: 'DELETE' });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(uiError(body.error || 'Kabinet silinemedi.'));
      setDeleteRack(null); toast({ title: 'Kabinet silindi', description: `${deleteRack.name} kaldırıldı.` }); await loadRacks(true);
    } catch (removeError) { setDeleteError(uiError(removeError, 'Kabinet silinemedi.')); }
    finally { setSaving(false); }
  };

  return <div className={styles.page}>
    <header className={styles.header}><PageHeading section="racks" description="Kabinetleri, cihazların U konumlarını ve kapasiteyi birlikte inceleyin.">Kabinetler ve Cihaz Yerleşimi</PageHeading><div className={styles.headerActions}><Button variant="outline" onClick={() => { loadRacks(true); loadRooms(); }} disabled={loading || refreshing}><RefreshCw size={16} className={cn(refreshing && 'animate-spin')} />Yenile</Button><Button onClick={openAdd}><Plus size={16} />Kabinet ekle</Button></div></header>
    <section className={styles.metrics} aria-label="Kabinet özeti" aria-busy={loading}>{metrics.map(({ label, value, detail, icon: Icon }) => <div key={label}><span className={styles.summaryIcon}><Icon size={19} aria-hidden="true" /></span><div><p>{label}</p><strong>{loading || error ? '—' : value}</strong><small>{loading ? 'Veriler yükleniyor…' : error ? 'Veri alınamadı' : detail}</small></div></div>)}</section>
    {!loading && !error && (totals.unassigned > 0 || totals.conflicts > 0) && <div className={styles.notice}><AlertTriangle size={18} aria-hidden="true" /><p>{totals.unassigned} cihazın konumu atanmamış; {totals.conflicts} cihazda yerleşim uyarısı var. Hesaplanan doluluk, atanmamış cihazların tahmini kullanımını da içerir.</p><Button variant="ghost" size="sm" onClick={() => setCapacityFilter('attention')}>Uyarılı kabinetleri göster</Button></div>}
    {loading ? <div className={styles.pageState} role="status"><RefreshCw size={26} className="animate-spin text-primary" /><p>Kabinetler yükleniyor…</p></div> : error ? <div className={styles.pageState} role="alert"><AlertTriangle size={28} className="text-destructive" /><h2>Kabinetler yüklenemedi</h2><p>{error}</p><Button onClick={() => loadRacks()}><RefreshCw size={16} />Tekrar dene</Button></div> : <>
      <div className={styles.toolbar}><div className={styles.search}><Search size={17} aria-hidden="true" /><Input aria-label="Kabinet, oda veya cihaz ara" placeholder="Kabinet, oda veya cihaz ara…" value={search} onChange={event => setSearch(event.target.value)} className="pl-10" /></div><select className={styles.select} aria-label="Odaya göre filtrele" value={roomFilter} onChange={event => setRoomFilter(event.target.value)}><option value="all">Tüm odalar</option>{filterRooms.map(room => <option key={room.id} value={room.id}>{room.name}{room.floor?.building?.name ? ` · ${room.floor.building.name}` : ''}</option>)}<option value="unassigned">Oda atanmamış</option></select><select className={styles.select} aria-label="Kabinet durumu" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">Tüm durumlar</option><option value="OPERATIONAL">Çalışıyor</option><option value="MAINTENANCE">Bakımda</option><option value="DECOMMISSIONED">Devre dışı</option></select><select className={styles.select} aria-label="Kapasiteye göre filtrele" value={capacityFilter} onChange={event => setCapacityFilter(event.target.value)}><option value="all">Tüm kapasiteler</option><option value="available">Boş kapasitesi olanlar</option><option value="high">Doluluk %85 ve üzeri</option><option value="attention">Yerleşim uyarısı olanlar</option></select>{hasFilters && <Button variant="ghost" size="sm" onClick={clearFilters}><X size={15} />Temizle</Button>}</div>
      <div className={styles.listHeading}><h2>Kabinet seçimi</h2><p aria-live="polite">{filtered.length} / {racks.length} kabinet gösteriliyor</p></div>
      {filtered.length === 0 ? <div className={styles.pageState}><Database size={34} className="text-primary" aria-hidden="true" /><h3>{racks.length === 0 ? 'Henüz kabinet eklenmemiş' : 'Filtreye uygun kabinet bulunamadı'}</h3><p>{racks.length === 0 ? 'Bir odaya kabinet ekleyerek kapasite ve cihaz yerleşimini takip etmeye başlayın.' : 'Arama metnini veya filtreleri değiştirin.'}</p>{hasFilters ? <Button variant="outline" onClick={clearFilters}>Filtreleri temizle</Button> : <Button onClick={openAdd}><Plus size={16} />Kabinet ekle</Button>}</div> : <div className={styles.workspace}>
        <aside className={styles.browser} aria-label="Kabinet seçimi"><div className={styles.mobileSelect}><label htmlFor="rack-selection">Kabinet seçin</label><select id="rack-selection" className={styles.select} value={selectedRack?.id || ''} onChange={event => setSelectedId(event.target.value)}>{filtered.map(rack => <option key={rack.id} value={rack.id}>{rack.name} · {rack.room?.name || 'Oda yok'}</option>)}</select><button onClick={() => setListOpen(!listOpen)} aria-expanded={listOpen} aria-controls="rack-list">Kabinet listesini {listOpen ? 'gizle' : 'göster'}</button></div><div id="rack-list" className={cn(styles.rackList, listOpen && styles.rackListOpen)}>{filtered.map(rack => { const capacity = presentations.get(rack.id)!.capacity; return <button key={rack.id} type="button" className={cn(styles.rackButton, selectedRack?.id === rack.id && styles.rackSelected)} aria-pressed={selectedRack?.id === rack.id} aria-label={`${rack.name}: yerleşim ve kapasiteyi göster`} onClick={() => setSelectedId(rack.id)}><span className={styles.rackName}><Database size={16} aria-hidden="true" /><strong>{rack.name}</strong></span><span className={styles.rackLocation}><MapPin size={11} aria-hidden="true" />{rack.room?.name || 'Oda atanmamış'}</span><RackStatus status={rack.operationalStatus} /><span className={styles.rackNumbers}><span>{rack.devices.length} cihaz</span><span>%{capacity.utilization} dolu</span></span><span className={styles.progress} aria-hidden="true"><i style={{ width: `${capacity.utilization}%` }} /></span><span className={styles.rackUnits}>{capacity.usedUnits} / {capacity.totalUnits} U kullanılıyor</span>{(capacity.unpositionedDevices > 0 || capacity.conflictDevices > 0) && <span className={styles.rackWarning}><AlertTriangle size={12} aria-hidden="true" />Yerleşimi kontrol edin</span>}</button>; })}</div></aside>
        {selectedRack && <RackDetails key={selectedRack.id} rack={selectedRack} onEdit={() => openEdit(selectedRack)} onDelete={() => openDelete(selectedRack)} />}
      </div>}
    </>}
    <Dialog open={Boolean(editor)} onOpenChange={open => { if (!open && !saving) { setEditor(null); setEditRack(null); } }}><DialogContent className={styles.editorDialog} aria-describedby={undefined}><DialogHeader><DialogTitle className={styles.editorTitle}>{editor === 'edit' ? 'Kabineti düzenle' : 'Kabinet ekle'}</DialogTitle></DialogHeader><form onSubmit={handleSave} className={styles.form}>
      <label htmlFor="rack-name">Kabinet adı <span>*</span><Input id="rack-name" required maxLength={255} value={form.name} placeholder="Örn. Kabinet A-01" onChange={event => setForm({ ...form, name: event.target.value })} /></label>
      <label htmlFor="rack-room">Sistem odası <span>*</span><select id="rack-room" className={styles.select} required={editor === 'add'} disabled={editor === 'edit' || roomsLoading || Boolean(roomsError)} value={form.roomId} onChange={event => setForm({ ...form, roomId: event.target.value })}><option value="">{roomsLoading ? 'Odalar yükleniyor…' : 'Oda seçin'}</option>{rooms.map(room => <option key={room.id} value={room.id}>{room.name}{room.floor?.building?.name ? ` · ${room.floor.building.name}` : ''}</option>)}{editRack?.room && !rooms.some(room => room.id === editRack.room?.id) && <option value={editRack.room.id}>{editRack.room.name}</option>}</select>{editor === 'edit' && <small>Oda, kabinet oluşturulurken belirlenir.</small>}</label>
      {roomsError && editor === 'add' && <div className={styles.formNotice} role="alert"><p>{roomsError}</p><Button type="button" variant="outline" size="sm" onClick={loadRooms}><RefreshCw size={14} />Odaları tekrar yükle</Button></div>}
      {!roomsLoading && !roomsError && rooms.length === 0 && editor === 'add' && <p className={styles.formNotice}>Önce <Link href="/locations">Konumlar ve Odalar</Link> ekranından bir sistem odası oluşturun.</p>}
      <div className={styles.formGrid}><label htmlFor="rack-type">Kabinet tipi<select id="rack-type" className={styles.select} value={form.type} onChange={event => setForm({ ...form, type: event.target.value, ...(event.target.value !== 'CUSTOM' ? { maxUnits: event.target.value === 'RACK_45U' ? '45' : '42' } : {}) })}><option value="RACK_42U">42 U kabinet</option><option value="RACK_45U">45 U kabinet</option><option value="CUSTOM">Özel</option></select></label><label htmlFor="rack-capacity">Kapasite (U) <span>*</span><Input id="rack-capacity" required type="number" min={1} max={100} step={1} value={form.maxUnits} onChange={event => setForm({ ...form, maxUnits: event.target.value })} /></label></div>
      <div className={styles.formGrid}><label htmlFor="rack-status">Çalışma durumu<select id="rack-status" className={styles.select} value={form.operationalStatus} onChange={event => setForm({ ...form, operationalStatus: event.target.value })}><option value="OPERATIONAL">Çalışıyor</option><option value="MAINTENANCE">Bakımda</option><option value="DECOMMISSIONED">Devre dışı</option></select></label><label htmlFor="rack-position">Konum notu<Input id="rack-position" maxLength={100} placeholder="Örn. A sırası, 3. kabinet" value={form.position} onChange={event => setForm({ ...form, position: event.target.value })} /></label></div>
      {formError && <p className={styles.formError} role="alert">{formError}</p>}<DialogFooter className={styles.editorActions}><Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => { setEditor(null); setEditRack(null); }}>Vazgeç</Button><Button type="submit" size="sm" disabled={saving || editor === 'add' && (roomsLoading || Boolean(roomsError) || rooms.length === 0)}>{saving ? <RefreshCw size={16} className="animate-spin" /> : <Database size={16} />}{saving ? 'Kaydediliyor…' : editor === 'edit' ? 'Değişiklikleri kaydet' : 'Kabinet oluştur'}</Button></DialogFooter>
    </form></DialogContent></Dialog>
    <Dialog open={Boolean(deleteRack)} onOpenChange={open => { if (!open && !saving) setDeleteRack(null); }}><DialogContent className="max-w-md"><DialogHeader><DialogTitle className="flex items-center gap-2"><Trash2 size={19} className="text-destructive" />Kabineti sil</DialogTitle><DialogDescription>{deleteRack?.name} kabinetini silmek istediğinizden emin misiniz?</DialogDescription></DialogHeader>{Boolean(deleteRack?.devices.length) && <p className={styles.formNotice}>Bu kabinete {deleteRack?.devices.length} cihaz bağlı. Silmeden önce cihazları başka bir kabinete taşıyın veya kabinet bağlantısını kaldırın.</p>}{deleteError && <p role="alert" className={styles.formError}>{deleteError}</p>}<DialogFooter><Button variant="outline" onClick={() => setDeleteRack(null)} disabled={saving}>Vazgeç</Button><Button variant="destructive" onClick={handleDelete} disabled={saving || Boolean(deleteRack?.devices.length)}>{saving ? <RefreshCw size={16} className="animate-spin" /> : <Trash2 size={16} />}{saving ? 'Siliniyor…' : 'Kabineti sil'}</Button></DialogFooter></DialogContent></Dialog>
    <p className={styles.pageNote}><Info size={14} aria-hidden="true" />Yerleşim görünümü kayıtlı U konumlarını gösterir. Cihazları kabinetlere atamak için Cihaz Envanteri ekranını kullanabilirsiniz.</p>
  </div>;
}
