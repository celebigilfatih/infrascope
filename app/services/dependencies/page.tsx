'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ChevronLeft, ChevronRight, RefreshCw, Search, GitBranch, Link, AlertTriangle, CheckCircle, Plus, Edit, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface ServiceDependency {
  id: string;
  sourceServiceId: string;
  targetDeviceId: string;
  type: string;
  criticality: string;
  description: string | null;
  sourceService: {
    id: string;
    name: string;
    type: string;
  };
  targetDevice: {
    id: string;
    name: string;
    type: string;
  };
  createdAt: string;
}

interface Service {
  id: string;
  name: string;
  type: string;
}

interface Device {
  id: string;
  name: string;
  type: string;
}

const ITEMS_PER_PAGE = 10;

export default function DependenciesPage() {
  const [dependencies, setDependencies] = useState<ServiceDependency[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDep, setEditingDep] = useState<ServiceDependency | null>(null);
  const [formData, setFormData] = useState({
    sourceServiceId: '',
    targetDeviceId: '',
    type: 'DEPENDS_ON',
    criticality: 'MEDIUM',
    description: '',
  });
  const { toast } = useToast();

  const fetchDependencies = async () => {
    try {
      const response = await fetch('/api/services/dependencies');
      const data = await response.json();
      if (data.success) {
        setDependencies(data.dependencies || []);
      }
    } catch (error) {
      console.error('Error fetching dependencies:', error);
      toast({
        title: 'Hata',
        description: 'Bağımlılıklar yüklenemedi',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchServices = async () => {
    try {
      const response = await fetch('/api/services');
      const data = await response.json();
      if (data.success) {
        setServices(data.services || []);
      }
    } catch (error) {
      console.error('Error fetching services:', error);
    }
  };

  const fetchDevices = async () => {
    try {
      const response = await fetch('/api/devices');
      const data = await response.json();
      if (data.success) {
        setDevices(data.devices || []);
      }
    } catch (error) {
      console.error('Error fetching devices:', error);
    }
  };

  useEffect(() => {
    fetchDependencies();
    fetchServices();
    fetchDevices();
  }, []);

  const handleCreate = async () => {
    try {
      const response = await fetch('/api/services/dependencies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: 'Başarılı',
          description: 'Bağımlılık oluşturuldu',
        });
        setIsDialogOpen(false);
        resetForm();
        fetchDependencies();
      } else {
        toast({
          title: 'Hata',
          description: data.error || 'Bağımlılık oluşturulamadı',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Hata',
        description: 'Bağımlılık oluşturulamadı',
        variant: 'destructive',
      });
    }
  };

  const handleUpdate = async () => {
    if (!editingDep) return;
    
    try {
      const response = await fetch('/api/services/dependencies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, id: editingDep.id }),
      });
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: 'Başarılı',
          description: 'Bağımlılık güncellendi',
        });
        setIsDialogOpen(false);
        resetForm();
        fetchDependencies();
      } else {
        toast({
          title: 'Hata',
          description: 'Bağımlılık güncellenemedi',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Hata',
        description: 'Bağımlılık güncellenemedi',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bu bağımlılığı silmek istediğinizden emin misiniz?')) return;
    
    try {
      const response = await fetch(`/api/services/dependencies?id=${id}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: 'Başarılı',
          description: 'Bağımlılık silindi',
        });
        fetchDependencies();
      } else {
        toast({
          title: 'Hata',
          description: 'Bağımlılık silinemedi',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Hata',
        description: 'Bağımlılık silinemedi',
        variant: 'destructive',
      });
    }
  };

  const openCreateDialog = () => {
    resetForm();
    setEditingDep(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (dep: ServiceDependency) => {
    setEditingDep(dep);
    setFormData({
      sourceServiceId: dep.sourceServiceId,
      targetDeviceId: dep.targetDeviceId,
      type: dep.type,
      criticality: dep.criticality,
      description: dep.description || '',
    });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      sourceServiceId: '',
      targetDeviceId: '',
      type: 'DEPENDS_ON',
      criticality: 'MEDIUM',
      description: '',
    });
  };

  const filteredDeps = useMemo(() => {
    if (!searchTerm) return dependencies;
    const term = searchTerm.toLowerCase();
    return dependencies.filter(dep => 
      dep.sourceService.name.toLowerCase().includes(term) || 
      dep.targetDevice.name.toLowerCase().includes(term)
    );
  }, [dependencies, searchTerm]);

  const totalPages = Math.ceil(filteredDeps.length / ITEMS_PER_PAGE);
  const paginatedDeps = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredDeps.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredDeps, currentPage]);

  useEffect(() => { if (currentPage > totalPages && totalPages > 0) setCurrentPage(1); }, [totalPages, currentPage]);

  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = 5;
    if (totalPages <= maxVisible) { for (let i = 1; i <= totalPages; i++) pages.push(i); }
    else {
      pages.push(1);
      if (currentPage > 3) pages.push('ellipsis');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  };

  const healthyCount = dependencies.filter(d => d.criticality === 'LOW').length;
  const criticalCount = dependencies.filter(d => d.criticality === 'CRITICAL').length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Service Dependencies</h1>
          <p className="text-muted-foreground">Servis bağımlılıkları ve iletişim haritası</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={fetchDependencies}><RefreshCw className="h-4 w-4" /></Button>
          <Button onClick={openCreateDialog}><Plus className="h-4 w-4 mr-2" />Yeni Bağımlılık</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-500/20"><GitBranch className="h-5 w-5 text-blue-500" /></div>
              <div><p className="text-sm text-muted-foreground">Toplam Bağımlılık</p><p className="text-2xl font-bold">{dependencies.length}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-500/20"><CheckCircle className="h-5 w-5 text-green-500" /></div>
              <div><p className="text-sm text-muted-foreground">Düşük Kritiklik</p><p className="text-2xl font-bold">{healthyCount}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-red-500/20"><AlertTriangle className="h-5 w-5 text-red-500" /></div>
              <div><p className="text-sm text-muted-foreground">Yüksek Kritiklik</p><p className="text-2xl font-bold">{criticalCount}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-500/20"><Link className="h-5 w-5 text-blue-500" /></div>
              <div><p className="text-sm text-muted-foreground">Toplam Servis</p><p className="text-2xl font-bold">{services.length}</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Servis ara..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} className="pl-9" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><GitBranch className="h-5 w-5" />Service Dependencies<Badge variant="secondary">{filteredDeps.length}</Badge></CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kaynak Servis</TableHead>
                    <TableHead>Hedef Cihaz/Servis</TableHead>
                    <TableHead>Tip</TableHead>
                    <TableHead>Kritiklik</TableHead>
                    <TableHead>Açıklama</TableHead>
                    <TableHead className="text-right">İşlemler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedDeps.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sonuç bulunamadı</TableCell></TableRow>
                  ) : (
                    paginatedDeps.map((dep) => (
                      <TableRow key={dep.id}>
                        <TableCell className="font-medium">{dep.sourceService.name}</TableCell>
                        <TableCell className="font-medium">{dep.targetDevice.name}</TableCell>
                        <TableCell><Badge>{dep.type}</Badge></TableCell>
                        <TableCell>
                          {dep.criticality === 'CRITICAL' && <Badge>Kritik</Badge>}
                          {dep.criticality === 'HIGH' && <Badge>Yüksek</Badge>}
                          {dep.criticality === 'MEDIUM' && <Badge>Orta</Badge>}
                          {dep.criticality === 'LOW' && <Badge>Düşük</Badge>}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{dep.description || '-'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="outline" size="icon" onClick={() => openEditDialog(dep)}><Edit className="h-4 w-4" /></Button>
                            <Button variant="outline" size="icon" onClick={() => handleDelete(dep.id)}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">Sayfa {currentPage} / {totalPages}</p>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft className="h-4 w-4" /></Button>
                    {getPageNumbers().map((page, idx) => (
                      <React.Fragment key={idx}>
                        {page === 'ellipsis' ? <span className="px-2 text-muted-foreground">...</span> : (
                          <Button variant={currentPage === page ? 'default' : 'outline'} size="sm" onClick={() => setCurrentPage(page)} className="w-9">{page}</Button>
                        )}
                      </React.Fragment>
                    ))}
                    <Button variant="outline" size="icon" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight className="h-4 w-4" /></Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingDep ? 'Bağımlılık Düzenle' : 'Yeni Bağımlılık Ekle'}</DialogTitle>
            <DialogDescription>
              Servis bağımlılıklarını tanımlayın
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="sourceService">Kaynak Servis</Label>
              <Select 
                value={formData.sourceServiceId} 
                onValueChange={(value) => setFormData({ ...formData, sourceServiceId: value })}
                disabled={!!editingDep}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Servis seçin" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="targetDevice">Hedef Cihaz/Servis</Label>
              <Select 
                value={formData.targetDeviceId} 
                onValueChange={(value) => setFormData({ ...formData, targetDeviceId: value })}
                disabled={!!editingDep}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Cihaz seçin" />
                </SelectTrigger>
                <SelectContent>
                  {devices.map((device) => (
                    <SelectItem key={device.id} value={device.id}>
                      {device.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="type">Bağımlılık Tipi</Label>
              <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DEPENDS_ON">Bağımlı</SelectItem>
                  <SelectItem value="REQUIRES">Gerektirir</SelectItem>
                  <SelectItem value="PROVIDES">Sağlar</SelectItem>
                  <SelectItem value="COMMUNICATES_WITH">İletişim</SelectItem>
                  <SelectItem value="DEPLOYED_ON">Deploy Edildi</SelectItem>
                  <SelectItem value="HOSTED_ON">Host Ediliyor</SelectItem>
                  <SelectItem value="CONNECTED_TO">Bağlı</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="criticality">Kritiklik</Label>
              <Select value={formData.criticality} onValueChange={(value) => setFormData({ ...formData, criticality: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CRITICAL">Kritik</SelectItem>
                  <SelectItem value="HIGH">Yüksek</SelectItem>
                  <SelectItem value="MEDIUM">Orta</SelectItem>
                  <SelectItem value="LOW">Düşük</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Açıklama</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Bağımlılık hakkında açıklama..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>İptal</Button>
            <Button onClick={editingDep ? handleUpdate : handleCreate}>
              {editingDep ? 'Güncelle' : 'Oluştur'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
