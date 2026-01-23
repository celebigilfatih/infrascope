'use client';

import React, { useState, useEffect } from 'react';
import { apiGet, apiDelete } from '../../lib/api';
import { Device, ApiResponse } from '../../types';
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
import { Search, Plus, Edit, Trash2, RefreshCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function DevicesPage() {
  const { toast } = useToast();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  
  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deviceToDelete, setDeviceToDelete] = useState<{id: string, name: string} | null>(null);

  useEffect(() => {
    loadDevices();
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
          <Button size="lg" className="font-bold shadow-lg shadow-primary/20">
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
                        {device.vendor} {device.model}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary/10 group">
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
      </main>
    </>
  );
}
