'use client';

import React, { useState, useEffect } from 'react';
import { apiGet, apiDelete, apiPost, apiPut } from '../../lib/api';
import { Device, ApiResponse } from '../../types';
import { getVendorLogo } from '../../lib/formatting';
import { useToast } from '@/components/ui/use-toast';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Plus, Edit, Trash2, RefreshCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function DevicesPage() {
  const { toast } = useToast();
  const [devices, setDevices] = useState<Device[]>([]);
  const [racks, setRacks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deviceToDelete, setDeviceToDelete] = useState<{id: string, name: string} | null>(null);

  useEffect(() => {
    loadDevices();
    loadRacks();
  }, []);

  const loadDevices = async () => {
    try {
      setLoading(true);
      setError(null);
      const response: ApiResponse<Device[]> = await apiGet('/api/devices');
      if (response.success) {
        setDevices(response.data || []);
      } else {
        setError('Cihazlar yüklenemedi');
      }
    } catch (err: any) {
      setError(err.message || 'Cihazlar yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const loadRacks = async () => {
    try {
      const response: ApiResponse<any[]> = await apiGet('/api/racks');
      if (response.success) {
        setRacks(response.data || []);
      }
    } catch (err) {
      console.error('Error loading racks:', err);
    }
  };

  const handleAdd = async (formData: any) => {
    try {
      const response: any = await apiPost('/api/devices', formData);
      if (response.success) {
        toast({
          title: "Başarılı",
          description: "Cihaz başarıyla eklendi.",
        });
        setShowAddModal(false);
        loadDevices();
      } else {
        toast({
          title: "Hata",
          description: response.error || "Cihaz eklenemedi",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Hata",
        description: "Bir hata oluştu",
        variant: "destructive",
      });
    }
  };

  const handleEdit = async (formData: any) => {
    if (!editingDevice) return;
    try {
      const response: any = await apiPut(`/api/devices/${editingDevice.id}`, formData);
      if (response.success) {
        toast({
          title: "Başarılı",
          description: "Cihaz güncellendi.",
        });
        setShowEditModal(false);
        setEditingDevice(null);
        loadDevices();
      } else {
        toast({
          title: "Hata",
          description: response.error || "Güncelleme başarısız",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Hata",
        description: "Bir hata oluştu",
        variant: "destructive",
      });
    }
  };

  const handleDelete = (id: string, name: string) => {
    setDeviceToDelete({ id, name });
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deviceToDelete) return;
    
    try {
      const response: any = await apiDelete(`/api/devices/${deviceToDelete.id}`);
      if (response.success) {
        toast({
          title: "Başarılı",
          description: `${deviceToDelete.name} cihazı silindi.`,
        });
        loadDevices();
      } else {
        toast({
          title: "Hata",
          description: response.error || 'Cihaz silinemedi',
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Hata",
        description: 'Cihaz silinirken hata oluştu',
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setDeviceToDelete(null);
    }
  };

  const filteredDevices = devices.filter(device => {
    const matchesSearch = device.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         device.serialNumber?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || device.type === filterType;
    return matchesSearch && matchesType;
  });

  const formatDate = (date: string | Date | undefined) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('tr-TR');
  };

  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" | "success" | "warning" => {
    switch (status) {
      case 'ACTIVE': return 'success';
      case 'INACTIVE': return 'outline';
      case 'MAINTENANCE': return 'warning';
      case 'DECOMMISSIONED': return 'destructive';
      default: return 'default';
    }
  };

  return (
    <>
      <main className="w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Cihaz Envanteri</h1>
            <p className="mt-2 text-muted-foreground">Tüm fiziksel ve sanal varlıkları yönetin ve izleyin</p>
          </div>
          <Button 
            size="lg" 
            className="font-bold shadow-lg shadow-primary/20"
            onClick={() => setShowAddModal(true)}
          >
            <Plus className="mr-2 h-5 w-5" />
            Yeni Cihaz Ekle
          </Button>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="p-4 flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="İsim veya seri no ile ara..." 
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Cihaz Tipi" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Cihaz Tipleri</SelectItem>
                <SelectItem value="PHYSICAL_SERVER">Fiziksel Sunucular</SelectItem>
                <SelectItem value="VIRTUAL_MACHINE">Sanal Makineler</SelectItem>
                <SelectItem value="SWITCH">Switchler</SelectItem>
                <SelectItem value="ROUTER">Routerlar</SelectItem>
                <SelectItem value="FIREWALL">Güvenlik Duvarları</SelectItem>
                <SelectItem value="STORAGE">Depolama</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={loadDevices} title="Yenile">
              <RefreshCcw className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex justify-center py-12">
            <RefreshCcw className="h-12 w-12 animate-spin text-primary" />
          </div>
        ) : error ? (
          <Card className="border-destructive bg-destructive/10">
            <CardContent className="p-6 flex items-center justify-between">
              <p className="text-destructive font-medium">{error}</p>
              <Button variant="outline" size="sm" onClick={loadDevices}>Tekrar Dene</Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden shadow-xl border-border w-full">
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="w-[250px]">Cihaz Adı</TableHead>
                    <TableHead>Tip</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead>Support Tarihi</TableHead>
                    <TableHead>Kritiklik</TableHead>
                    <TableHead>Model / Üretici</TableHead>
                    <TableHead className="text-right">İşlemler</TableHead>
                  </TableRow>
                </TableHeader>
              <TableBody>
                {filteredDevices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      Kriterlere uygun cihaz bulunamadı.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDevices.map((device) => (
                    <TableRow key={device.id}>
                      <TableCell className="font-medium">
                        <div className="font-bold">{device.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{device.serialNumber || 'Seri No Yok'}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="uppercase text-[10px]">
                          {device.type.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(device.status)}>
                          {device.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {formatDate(device.supportDate)}
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          "font-bold text-xs uppercase tracking-tight",
                          device.criticality === 'CRITICAL' ? 'text-destructive' : 
                          device.criticality === 'HIGH' ? 'text-orange-500' : 
                          'text-primary'
                        )}>
                          {device.criticality}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <div className="flex items-center gap-2">
                          {getVendorLogo(device.vendor) && (
                            <img 
                              src={getVendorLogo(device.vendor)!} 
                              alt={device.vendor} 
                              className="h-12 w-12 object-contain"
                            />
                          )}
                          <span>{device.vendor} {device.model}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 hover:bg-primary/10 group"
                            onClick={() => {
                              setEditingDevice(device);
                              setShowEditModal(true);
                            }}
                          >
                            <Edit className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 hover:bg-destructive/10 group"
                            onClick={() => handleDelete(device.id, device.name)}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground group-hover:text-destructive transition-colors" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              </Table>
            </div>
          </Card>
        )}

        <ConfirmDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          title="Cihazı Sil"
          description={`${deviceToDelete?.name} cihazını silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`}
          onConfirm={confirmDelete}
          variant="destructive"
          confirmText="Sil"
        />

        {showAddModal && (
          <DeviceModal 
            racks={racks}
            onClose={() => setShowAddModal(false)} 
            onSubmit={handleAdd} 
          />
        )}

        {showEditModal && editingDevice && (
          <DeviceModal 
            device={editingDevice}
            racks={racks}
            onClose={() => {
              setShowEditModal(false);
              setEditingDevice(null);
            }} 
            onSubmit={handleEdit} 
          />
        )}
      </main>
    </>
  );
}

// Device Modal Component
function DeviceModal({ device, racks, onClose, onSubmit }: {
  device?: Device;
  racks: any[];
  onClose: () => void;
  onSubmit: (data: any) => void;
}) {
  const [formData, setFormData] = useState<any>(device || {
    status: 'ACTIVE',
    criticality: 'MEDIUM',
    type: 'PHYSICAL_SERVER'
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const inputClass = "w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:ring-2 focus:ring-primary outline-none transition-all";
  const labelClass = "text-[10px] text-muted-foreground ml-1 font-bold uppercase tracking-wider";

  return (
    <div className="fixed inset-0 bg-background/80 flex items-center justify-center z-[6000] p-4 backdrop-blur-sm">
      <div className="bg-card rounded-xl p-6 max-w-md w-full border border-border shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">{device ? 'Cihazı Düzenle' : 'Yeni Cihaz Ekle'}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className={labelClass}>Cihaz Adı</label>
            <Input 
              placeholder="Cihaz Adı" 
              className={inputClass} 
              value={formData.name || ''} 
              onChange={e => setFormData({ ...formData, name: e.target.value })} 
              required 
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className={labelClass}>Cihaz Tipi</label>
              <select 
                className={inputClass} 
                value={formData.type || ''} 
                onChange={e => setFormData({ ...formData, type: e.target.value })} 
                required
              >
                <option value="PHYSICAL_SERVER">Fiziksel Sunucu</option>
                <option value="VIRTUAL_MACHINE">Sanal Makine</option>
                <option value="SWITCH">Switch</option>
                <option value="ROUTER">Router</option>
                <option value="FIREWALL">Güvenlik Duvarı</option>
                <option value="STORAGE">Depolama</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Durum</label>
              <select 
                className={inputClass} 
                value={formData.status || ''} 
                onChange={e => setFormData({ ...formData, status: e.target.value })}
              >
                <option value="ACTIVE">Aktif</option>
                <option value="INACTIVE">Pasif</option>
                <option value="MAINTENANCE">Bakımda</option>
                <option value="DECOMMISSIONED">Devre Dışı</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className={labelClass}>Üretici</label>
              <Input 
                placeholder="Örn: Dell, HP" 
                className={inputClass} 
                value={formData.vendor || ''} 
                onChange={e => setFormData({ ...formData, vendor: e.target.value })} 
              />
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Model</label>
              <Input 
                placeholder="Örn: R740" 
                className={inputClass} 
                value={formData.model || ''} 
                onChange={e => setFormData({ ...formData, model: e.target.value })} 
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Seri Numarası</label>
            <Input 
              placeholder="Seri No" 
              className={inputClass} 
              value={formData.serialNumber || ''} 
              onChange={e => setFormData({ ...formData, serialNumber: e.target.value })} 
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Support Tarihi</label>
            <Input 
              type="date"
              className={inputClass} 
              value={formData.supportDate ? new Date(formData.supportDate).toISOString().split('T')[0] : ''} 
              onChange={e => setFormData({ ...formData, supportDate: e.target.value })} 
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Kabinet (Opsiyonel)</label>
            <select 
              className={inputClass} 
              value={formData.rackId || ''} 
              onChange={e => setFormData({ ...formData, rackId: e.target.value })}
            >
              <option value="">Seçilmedi</option>
              {racks.map(rack => (
                <option key={rack.id} value={rack.id}>
                  {rack.name} ({rack.room?.name})
                </option>
              ))}
            </select>
          </div>
          <div className="flex space-x-3 pt-6">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">İptal</Button>
            <Button type="submit" className="flex-1 font-bold shadow-lg">
              {device ? 'Güncelle' : 'Oluştur'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
