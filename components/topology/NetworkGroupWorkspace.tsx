'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Cloud, EthernetPort, Building2, Plus, Pencil, Trash2, ArrowLeft, Router } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NETWORK_GROUP_KINDS, networkGroupKindLabel, type NetworkGroup } from '@/lib/topology/network-groups';
import { networkGroupRequest } from './useNetworkGroups';
interface Options { organizations: { id: string; name: string; buildings: { id: string; name: string }[] }[]; devices: { id: string; name: string; managementIp: string | null; buildingId: string | null }[]; memberships: { groupId: string; buildingId: string }[] }
export function NetworkGroupWorkspace({ groups, canManage, initialId, initialSource, onClose, onRefresh, onFocusMember, onToggle, expanded, devices }: {
  groups: NetworkGroup[]; canManage: boolean; initialId?: string; initialSource?: { deviceId: string; portId?: string }; onClose: () => void; onRefresh: () => Promise<void>; onFocusMember: (id: string) => void; onToggle: (id: string) => void; expanded: ReadonlySet<string>; devices: { id: string; buildingId?: string | null; status: string }[];
}) {
  const [selectedId, setSelectedId] = useState(initialId || ''), [form, setForm] = useState(!!initialSource), [editingId, setEditingId] = useState('');
  const group = groups.find(g => g.id === selectedId);
  const [options, setOptions] = useState<Options | null>(null), [ports, setPorts] = useState<{ id: string; name: string }[]>([]);
  const [name, setName] = useState(''), [kind, setKind] = useState('WAN'), [organizationId, setOrganizationId] = useState(''), [sourceDeviceId, setSourceDeviceId] = useState(initialSource?.deviceId || ''), [sourcePortId, setSourcePortId] = useState(initialSource?.portId || '');
  const [members, setMembers] = useState<Set<string>>(new Set()), [query, setQuery] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [confirmDelete, setConfirmDelete] = useState(false), [optionsRevision, setOptionsRevision] = useState(0);
  const formVersion = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!form) return;
    let live = true;
    void networkGroupRequest<Options>('/api/network/groups?options=1').then(data => {
      if (!live) return; setOptions(data);
      setOrganizationId(old => old || data.organizations.find(o => o.buildings.some(b => data.devices.find(d => d.id === sourceDeviceId)?.buildingId === b.id))?.id || data.organizations[0]?.id || '');
    }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [form, sourceDeviceId, optionsRevision]);
  useEffect(() => {
    let live = true; setPorts([]);
    if (form && sourceDeviceId) void networkGroupRequest<{ ports: { id: string; name: string }[] }>(`/api/network/groups?options=1&sourceDeviceId=${encodeURIComponent(sourceDeviceId)}`).then(data => { if (live) setPorts(data.ports); }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [form, sourceDeviceId]);
  const organization = options?.organizations.find(o => o.id === organizationId);
  const availableDevices = options?.devices.filter(d => organization?.buildings.some(b => b.id === d.buildingId)) || [];
  const sourceBuildingId = options?.devices.find(d => d.id === sourceDeviceId)?.buildingId;
  const memberDevices = useMemo(() => devices.filter(d => group?.members.some(m => m.buildingId === d.buildingId)), [devices, group]);
  const active = memberDevices.filter(d => d.status.toUpperCase() === 'ACTIVE').length;
  const inactive = memberDevices.filter(d => ['INACTIVE','ERROR','DECOMMISSIONED'].includes(d.status.toUpperCase())).length;
  const begin = (g?: NetworkGroup) => {
    setError(''); setConfirmDelete(false); setEditingId(g?.id || ''); formVersion.current = g?.version;
    setName(g?.name || ''); setKind(g?.kind || 'WAN'); setOrganizationId(g?.organizationId || ''); setSourceDeviceId(g?.sourceDeviceId || ''); setSourcePortId(g?.sourcePortId || ''); setMembers(new Set(g?.members.map(m => m.buildingId) || [])); setQuery(''); setForm(true);
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const result = await networkGroupRequest<{ id: string }>(`/api/network/groups${editingId ? `/${editingId}` : ''}`, { method: editingId ? 'PATCH' : 'POST', body: JSON.stringify({ name, kind, organizationId, sourceDeviceId, sourcePortId: sourcePortId || null, memberBuildingIds: [...members], ...(editingId ? { version: formVersion.current } : {}) }) });
      await onRefresh(); setSelectedId(result.id); setForm(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Grup kaydedilemedi.'); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!group) return; setBusy(true); setError('');
    try { await networkGroupRequest(`/api/network/groups/${group.id}`, { method: 'DELETE', body: JSON.stringify({ version: group.version }) }); await onRefresh(); setSelectedId(''); setConfirmDelete(false); }
    catch (e) { setError(e instanceof Error ? e.message : 'Grup silinemedi.'); } finally { setBusy(false); }
  };
  const selectClass = 'mt-1 h-10 w-full min-w-0 rounded-md border bg-background px-2 text-sm';
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent closeButtonText="Kapat" className="max-h-[90dvh] w-[calc(100%-1rem)] max-w-3xl overflow-y-auto p-5 sm:p-6"><DialogHeader><DialogTitle className="flex items-center gap-2"><Cloud className="text-primary" size={22} />{form ? editingId ? 'Ağ grubunu düzenle' : 'Ağ grubu oluştur' : group?.name || 'Ağ grupları'}</DialogTitle><DialogDescription>Ortak hat veya merkez cihaz altında konumları toplayın. Fiziksel bağlantılar ve bina atamaları korunur.</DialogDescription></DialogHeader>
    {error && <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}<Button size="sm" variant="outline" onClick={() => { void onRefresh(); setOptionsRevision(v => v+1); if (editingId) { setForm(false); setSelectedId(editingId); } }}>Bilgileri yenile</Button></div>}
    {form ? <form onSubmit={e => void save(e)}><fieldset disabled={busy} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="group-name">Grup adı</Label><Input id="group-name" required maxLength={100} value={name} onChange={e => setName(e.target.value)} placeholder="Örn. BUSKİ TT-VPN" /></div><div><Label htmlFor="group-kind">Ağ türü</Label><select id="group-kind" className={selectClass} value={kind} onChange={e => setKind(e.target.value)}>{NETWORK_GROUP_KINDS.map(k => <option key={k} value={k}>{k === 'OTHER' ? 'Diğer' : k}</option>)}</select></div>
      <div><Label htmlFor="group-org">Organizasyon</Label><select required id="group-org" className={selectClass} value={organizationId} onChange={e => { setOrganizationId(e.target.value); setSourceDeviceId(''); setSourcePortId(''); setMembers(new Set()); }}><option value="">Organizasyon seçin</option>{options?.organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
      <div><Label htmlFor="group-source">Merkez cihaz</Label><select required id="group-source" className={selectClass} value={sourceDeviceId} onChange={e => { setSourceDeviceId(e.target.value); setSourcePortId(''); const building = options?.devices.find(d => d.id === e.target.value)?.buildingId; setMembers(previous => new Set([...previous].filter(id => id !== building))); }}><option value="">Cihaz seçin</option>{availableDevices.map(d => <option key={d.id} value={d.id}>{d.name}{d.managementIp ? ` · ${d.managementIp}` : ''}</option>)}</select></div></div>
      <div><Label htmlFor="group-port">Merkez arayüzü <span className="font-normal text-muted-foreground">(isteğe bağlı)</span></Label><select id="group-port" className={selectClass} value={sourcePortId} onChange={e => setSourcePortId(e.target.value)} disabled={!sourceDeviceId}><option value="">Bilinmiyor / daha sonra seçilecek</option>{ports.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><p className="mt-1 text-xs text-muted-foreground">Bu seçim mantıksal referanstır; fiziksel portu ayırmaz. Yalnız seçilen cihazın arayüzleri listelenir.</p></div>
      <fieldset className="rounded-lg border p-3"><legend className="px-1 text-sm font-semibold">Üye konumlar · {members.size} seçili</legend><Input aria-label="Gruba eklenecek konumlarda ara" placeholder="Konum adıyla ara…" value={query} onChange={e => setQuery(e.target.value)} /><div className="mt-2 max-h-52 space-y-1 overflow-y-auto">{organization?.buildings.filter(b => b.name.toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr'))).map(b => { const membership = options?.memberships.find(m => m.buildingId === b.id); const disabled = b.id === sourceBuildingId || !!membership && membership.groupId !== editingId; return <label key={b.id} className="flex min-h-10 items-center gap-2 rounded-md px-2 text-sm hover:bg-muted"><input type="checkbox" disabled={disabled} checked={members.has(b.id)} onChange={e => setMembers(previous => { const next = new Set(previous); if (e.target.checked) next.add(b.id); else next.delete(b.id); return next; })} /><span className="min-w-0 wrap-break-word">{b.name}{disabled && <small className="ml-2 text-muted-foreground">{b.id === sourceBuildingId ? 'Merkez konum' : 'Başka grupta'}</small>}</span></label>; })}{!options && <p role="status" className="p-2 text-sm text-muted-foreground">Konumlar yükleniyor…</p>}</div></fieldset>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setForm(false)}>Vazgeç</Button><Button type="submit" disabled={busy || !options || !members.size || !sourceDeviceId}>{busy ? 'Kaydediliyor…' : 'Grubu kaydet'}</Button></div>
    </fieldset></form> : group ? <div className="space-y-4"><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => { setSelectedId(''); setConfirmDelete(false); }}><ArrowLeft size={15} className="mr-1" />Tüm gruplar</Button><Button size="sm" variant="outline" onClick={() => onToggle(group.id)}>{expanded.has(group.id) ? 'Grubu kapat' : 'Grubu aç'}</Button>{canManage && <Button size="sm" variant="outline" onClick={() => begin(group)}><Pencil size={14} className="mr-1" />Düzenle</Button>}</div>
      <div className="grid gap-3 sm:grid-cols-2"><article className="rounded-lg border p-3"><h3 className="flex items-center gap-2 text-sm font-semibold"><Router size={16} />Merkez cihaz</h3><p className="mt-2 text-sm">{group.sourceDevice.name}</p><code className="text-xs text-muted-foreground">{group.sourceDevice.managementIp || 'IP belirtilmemiş'}</code></article><article className="rounded-lg border p-3"><h3 className="flex items-center gap-2 text-sm font-semibold"><EthernetPort size={16} />Hat / merkez arayüzü</h3><p className="mt-2 text-sm">{group.sourcePort?.name || 'Arayüz belirtilmemiş'}</p><p className="text-xs text-muted-foreground">Hat durumu: {group.lineStatus.status === 'UP' ? 'Açık' : group.lineStatus.status === 'DOWN' ? 'Kapalı' : 'Bilinmiyor'}</p>{group.lineStatus.lastPolledAt && <p className="text-xs text-muted-foreground">Son ölçüm: {new Date(group.lineStatus.lastPolledAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}</p>}</article></div>
      <p className="rounded-lg bg-muted p-3 text-sm">Üye cihazların envanter durumu: {active} aktif · {inactive} kapalı/hatalı · {memberDevices.length-active-inactive} diğer/bilinmiyor. Hat durumu bu sayılardan türetilmez.</p>
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Building2 size={16} />Üye konumlar · {group.members.length}</h3><div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">{group.members.map(m => <button key={m.buildingId} className="min-h-11 rounded-lg border px-3 py-2 text-left text-sm hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { onFocusMember(m.buildingId); onClose(); }}>{m.name}<small className="block text-xs text-muted-foreground">Haritada göster ve cihazları incele</small></button>)}</div>
      {canManage && (confirmDelete ? <div role="group" aria-label="Ağ grubunu silme onayı" className="rounded-lg border border-destructive/40 p-3"><p className="text-sm">Yalnız ağ grubu silinecek. Konumlar, cihazlar ve bağlantılar korunacak.</p><div className="mt-3 flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmDelete(false)}>Vazgeç</Button><Button size="sm" variant="destructive" disabled={busy} onClick={() => void remove()}>Evet, grubu sil</Button></div></div> : <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}><Trash2 size={15} className="mr-1" />Grubu sil</Button>)}
    </div> : <div className="space-y-3">{canManage && <Button className="gap-2" onClick={() => begin()}><Plus size={16} />Ağ grubu oluştur</Button>}{!groups.length ? <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Henüz ağ grubu yok.</p> : groups.map(g => <button key={g.id} onClick={() => setSelectedId(g.id)} className="flex min-h-14 w-full items-center gap-3 rounded-lg border p-3 text-left hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"><Cloud size={22} className="shrink-0 text-teal-600" /><span><strong className="block text-sm">{g.name}</strong><small className="text-muted-foreground">{networkGroupKindLabel(g.kind)} · {g.members.length} konum · {g.sourceDevice.name}</small></span></button>)}</div>}
  </DialogContent></Dialog>;
}
