'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Plus, Search, Grid, Server, RefreshCw, MoreHorizontal, Pencil, Trash2, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';

interface RackDevice {
  id: string;
  name: string;
  type: string;
  status: string;
  criticality: string;
  rackUnitPosition: number | null;
}

interface RackData {
  id: string;
  name: string;
  type: string;
  maxUnits: number;
  operationalStatus: string;
  position: string | null;
  room: {
    id: string;
    name: string;
    floor?: { building?: { name: string } };
  } | null;
  devices: RackDevice[];
}

interface RoomOption {
  id: string;
  name: string;
  floor?: { building?: { name: string } };
}

const STATUS_MAP: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' | 'outline' }> = {
  OPERATIONAL:    { label: 'Operasyonel', variant: 'success' },
  MAINTENANCE:    { label: 'Bakımda',     variant: 'warning' },
  DECOMMISSIONED: { label: 'Devre Dışı', variant: 'destructive' },
};

function getUsageColor(used: number, max: number) {
  const pct = max > 0 ? (used / max) * 100 : 0;
  if (pct >= 90) return 'bg-red-500';
  if (pct >= 70) return 'bg-orange-500';
  if (pct >= 50) return 'bg-yellow-500';
  return 'bg-green-500';
}

export default function RacksPage() {
  const { toast } = useToast();
  const [racks, setRacks] = useState<RackData[]>([]);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states
  const [addOpen, setAddOpen] = useState(false);
  const [editRack, setEditRack] = useState<RackData | null>(null);
  const [deleteRack, setDeleteRack] = useState<RackData | null>(null);
  const [saving, setSaving] = useState(false);

  const emptyForm = { name: '', roomId: '', maxUnits: '42', type: 'RACK_42U', operationalStatus: 'OPERATIONAL', position: '' };
  const [form, setForm] = useState(emptyForm);

  const loadRacks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/racks');
      const data = await res.json();
      if (data.success) setRacks(data.data || []);
      else toast({ title: 'Hata', description: 'Rack listesi yüklenemedi', variant: 'destructive' });
    } catch {
      toast({ title: 'Hata', description: 'Sunucu bağlantı hatası', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRooms = useCallback(async () => {
    try {
      const res = await fetch('/api/rooms');
      const data = await res.json();
      if (data.success) setRooms(data.data || []);
    } catch {}
  }, []);

  useEffect(() => {
    loadRacks();
    loadRooms();
  }, [loadRacks, loadRooms]);

  const openAdd = () => {
    setForm(emptyForm);
    setAddOpen(true);
  };

  const openEdit = (rack: RackData) => {
    setForm({
      name: rack.name,
      roomId: rack.room?.id || '',
      maxUnits: rack.maxUnits.toString(),
      type: rack.type,
      operationalStatus: rack.operationalStatus,
      position: rack.position || '',
    });
    setEditRack(rack);
  };

  const handleSave = async () => {
    if (!form.name || !form.roomId) {
      toast({ title: 'Hata', description: 'Rack adı ve oda zorunludur', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        roomId: form.roomId,
        maxUnits: parseInt(form.maxUnits) || 42,
        type: form.type,
        operationalStatus: form.operationalStatus,
        position: form.position || null,
      };

      const isEdit = !!editRack;
      const res = await fetch(isEdit ? `/api/racks/${editRack!.id}` : '/api/racks', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        toast({ title: 'Başarılı', description: isEdit ? 'Rack güncellendi.' : 'Rack oluşturuldu.' });
        setAddOpen(false);
        setEditRack(null);
        loadRacks();
      } else {
        toast({ title: 'Hata', description: data.error || 'İşlem başarısız', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Hata', description: 'Bir hata oluştu', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteRack) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/racks/${deleteRack.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Başarılı', description: `${deleteRack.name} silindi.` });
        setDeleteRack(null);
        loadRacks();
      } else {
        toast({ title: 'Hata', description: data.error || 'Silinemedi', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Hata', description: 'Bir hata oluştu', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const filtered = racks.filter(r => {
    const q = searchQuery.toLowerCase();
    const building = r.room?.floor?.building?.name?.toLowerCase() || '';
    return (
      r.name.toLowerCase().includes(q) ||
      (r.room?.name || '').toLowerCase().includes(q) ||
      building.includes(q)
    );
  });

  // Summary stats
  const totalDevices = racks.reduce((s, r) => s + r.devices.length, 0);
  const totalCapacity = racks.reduce((s, r) => s + r.maxUnits, 0);
  const totalUsed = racks.reduce((s, r) => {
    const used = r.devices.filter(d => d.rackUnitPosition != null).length;
    return s + used;
  }, 0);
  const critical = racks.filter(r => {
    const used = r.devices.filter(d => d.rackUnitPosition != null).length;
    return r.maxUnits > 0 && (used / r.maxUnits) * 100 >= 90;
  }).length;

  const FormModal = ({ isEdit }: { isEdit: boolean }) => (
    <Dialog open={isEdit ? !!editRack : addOpen} onOpenChange={(o) => { if (!o) { isEdit ? setEditRack(null) : setAddOpen(false); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Rack Düzenle' : 'Yeni Rack Ekle'}</DialogTitle>
          <DialogDescription>{isEdit ? 'Rack bilgilerini güncelleyin.' : 'Yeni rack kaydı oluşturun.'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Rack Adı *</label>
            <Input placeholder="Kabinet_1" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Oda *</label>
            <Select value={form.roomId} onValueChange={v => setForm({ ...form, roomId: v })}>
              <SelectTrigger><SelectValue placeholder="Oda seçin" /></SelectTrigger>
              <SelectContent>
                {rooms.map(r => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}{r.floor?.building ? ` (${r.floor.building.name})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Tip</label>
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="RACK_42U">42U Rack</SelectItem>
                  <SelectItem value="RACK_45U">45U Rack</SelectItem>
                  <SelectItem value="CUSTOM">Özel</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Max Ünite (U)</label>
              <Input type="number" min={1} max={100} value={form.maxUnits} onChange={e => setForm({ ...form, maxUnits: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Durum</label>
              <Select value={form.operationalStatus} onValueChange={v => setForm({ ...form, operationalStatus: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPERATIONAL">Operasyonel</SelectItem>
                  <SelectItem value="MAINTENANCE">Bakımda</SelectItem>
                  <SelectItem value="DECOMMISSIONED">Devre Dışı</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Konum</label>
              <Input placeholder="Örn: Sıra A" value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => isEdit ? setEditRack(null) : setAddOpen(false)} disabled={saving}>İptal</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}
            {isEdit ? 'Güncelle' : 'Oluştur'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Kabinet Yönetimi</h1>
          <p className="text-muted-foreground">Veri merkezi rack ve kabinet takibi</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={loadRacks} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4 mr-2" />
            Yeni Rack Ekle
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Toplam Rack', value: racks.length, icon: Grid, color: 'blue' },
          { label: 'Toplam Cihaz', value: totalDevices, icon: Server, color: 'green' },
          { label: 'Doluluk Oranı', value: totalCapacity > 0 ? `${Math.round((totalUsed / totalCapacity) * 100)}%` : '0%', icon: Grid, color: 'orange' },
          { label: 'Kritik Doluluk', value: critical, icon: Grid, color: 'red' },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full bg-${color}-500/20`}>
                  <Icon className={`h-5 w-5 text-${color}-500`} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className={cn('text-2xl font-bold', color === 'red' && critical > 0 && 'text-red-500')}>{value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rack veya oda ara..."
          className="pl-10"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-16">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Grid className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="font-medium">{searchQuery ? 'Arama sonucu bulunamadı' : 'Henüz rack kaydı yok'}</p>
          {!searchQuery && (
            <Button className="mt-4" onClick={openAdd}>
              <Plus className="h-4 w-4 mr-2" /> İlk Rack'i Ekle
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(rack => {
            const usedUnits = rack.devices.filter(d => d.rackUnitPosition != null).length;
            const pct = rack.maxUnits > 0 ? Math.round((usedUnits / rack.maxUnits) * 100) : 0;
            const statusCfg = STATUS_MAP[rack.operationalStatus] || { label: rack.operationalStatus, variant: 'outline' as const };
            const location = [rack.room?.name, rack.room?.floor?.building?.name].filter(Boolean).join(' — ');

            return (
              <Card key={rack.id} className="hover:border-primary/50 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">{rack.name}</CardTitle>
                      <CardDescription className="truncate">{location || '—'}</CardDescription>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => openEdit(rack)}
                      >
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => setDeleteRack(rack)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                    <span className="text-sm text-muted-foreground">{rack.devices.length} cihaz</span>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-muted-foreground">Doluluk</span>
                      <span className="font-medium">{usedUnits}/{rack.maxUnits} U ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn('h-full transition-all', getUsageColor(usedUnits, rack.maxUnits))}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  {rack.position && (
                    <p className="text-xs text-muted-foreground">Konum: {rack.position}</p>
                  )}
                  {rack.devices.length > 0 && (
                    <div className="text-xs text-muted-foreground space-y-0.5 border-t pt-2">
                      {rack.devices.slice(0, 3).map(d => (
                        <div key={d.id} className="flex justify-between">
                          <span className="truncate">{d.name}</span>
                          <span className="shrink-0 ml-2 font-mono">{d.type.replace(/_/g, ' ')}</span>
                        </div>
                      ))}
                      {rack.devices.length > 3 && (
                        <p className="text-center text-muted-foreground/60">+{rack.devices.length - 3} daha</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Modal */}
      <FormModal isEdit={false} />

      {/* Edit Modal */}
      <FormModal isEdit={true} />

      {/* Delete Confirmation */}
      <Dialog open={!!deleteRack} onOpenChange={o => { if (!o) setDeleteRack(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rack Sil</DialogTitle>
            <DialogDescription>
              <strong>{deleteRack?.name}</strong> rack'ini silmek istediğinizden emin misiniz?
              {deleteRack && deleteRack.devices.length > 0 && (
                <span className="block mt-2 text-orange-500 font-medium">
                  Bu rack'te {deleteRack.devices.length} cihaz kayıtlı. Silme işlemi bu cihazlardan rack bağlantısını kaldıracak.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRack(null)} disabled={saving}>İptal</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Sil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
