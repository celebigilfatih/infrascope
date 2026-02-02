'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Plus, Building2, Users, Edit, Trash2, Eye } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';

interface Organization {
  id: string;
  name: string;
  description: string;
  userCount?: number;
  status: 'active' | 'inactive';
  createdAt: string;
  contactEmail?: string;
  address?: string;
  code?: string;
}

export default function OrganizationsPage() {
  const { toast } = useToast();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    contactEmail: string;
    address: string;
    status: 'active' | 'inactive';
    code: string;
  }>({
    name: '',
    description: '',
    contactEmail: '',
    address: '',
    status: 'active',
    code: '',
  });
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch organizations from API
  const fetchOrganizations = useCallback(async () => {
    try {
      const response = await apiGet('/api/organizations');
      if (response.success && response.data) {
        // Transform Prisma data to our interface
        const transformedOrgs = response.data.map((org: any) => ({
          id: org.id,
          name: org.name,
          description: org.description || '',
          userCount: org._count?.users || org.userCount || 0,
          status: org.status || 'active',
          createdAt: org.createdAt ? new Date(org.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          contactEmail: org.contactEmail || '',
          address: org.address || '',
          code: org.code || '',
        }));
        setOrgs(transformedOrgs);
      }
    } catch (error) {
      console.error('Error fetching organizations:', error);
      toast({ title: 'Hata', description: 'Organizasyonlar yüklenemedi', variant: 'destructive' });
    }
  }, [toast]);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  const filteredOrgs = orgs.filter(org =>
    org.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    org.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openAddModal = () => {
    setSelectedOrg(null);
    setFormData({ name: '', description: '', contactEmail: '', address: '', status: 'active', code: '' });
    setIsModalOpen(true);
  };

  const openEditModal = (org: Organization) => {
    setSelectedOrg(org);
    setFormData({
      name: org.name,
      description: org.description || '',
      contactEmail: org.contactEmail || '',
      address: org.address || '',
      status: org.status,
      code: org.code || '',
    });
    setIsModalOpen(true);
  };

  const openViewModal = (org: Organization) => {
    setSelectedOrg(org);
    setIsViewModalOpen(true);
  };

  const openDeleteModal = (org: Organization) => {
    setSelectedOrg(org);
    setIsDeleteModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({ title: 'Hata', description: 'Organizasyon adı zorunludur', variant: 'destructive' });
      return;
    }

    if (selectedOrg) {
      // Edit existing - call API
      const response = await apiPut(`/api/organizations/${selectedOrg.id}`, {
        name: formData.name,
        description: formData.description,
        status: formData.status,
        contactEmail: formData.contactEmail,
        address: formData.address,
      });
      
      if (response.success) {
        toast({ title: 'Başarılı', description: `${formData.name} organizasyonu güncellendi`, variant: 'default' });
        fetchOrganizations(); // Refresh from API
      } else {
        toast({ title: 'Hata', description: response.error || 'Güncelleme başarısız', variant: 'destructive' });
      }
    } else {
      // Add new - call API
      const response = await apiPost('/api/organizations', {
        name: formData.name,
        code: formData.code || formData.name.substring(0, 10).toUpperCase().replace(/\s/g, ''),
        description: formData.description,
        status: formData.status,
        contactEmail: formData.contactEmail,
        address: formData.address,
      });
      
      if (response.success) {
        toast({ title: 'Başarılı', description: `${formData.name} organizasyonu oluşturuldu`, variant: 'default' });
        fetchOrganizations(); // Refresh from API
      } else {
        toast({ title: 'Hata', description: response.error || 'Oluşturma başarısız', variant: 'destructive' });
      }
    }
    setIsModalOpen(false);
  };

  const handleDelete = async () => {
    if (selectedOrg) {
      const response = await apiDelete(`/api/organizations/${selectedOrg.id}`);
      
      if (response.success) {
        toast({ title: 'Başarılı', description: `${selectedOrg.name} organizasyonu silindi`, variant: 'default' });
        fetchOrganizations(); // Refresh from API
      } else {
        toast({ title: 'Hata', description: response.error || 'Silme başarısız', variant: 'destructive' });
      }
    }
    setIsDeleteModalOpen(false);
  };

  const handleStatusToggle = async (org: Organization) => {
    const newStatus = org.status === 'active' ? 'inactive' : 'active';
    
    // Call API to update status
    const response = await apiPut(`/api/organizations/${org.id}`, {
      status: newStatus,
    });
    
    if (response.success) {
      toast({ title: 'Başarılı', description: `${org.name} durumu ${newStatus} olarak güncellendi`, variant: 'default' });
      fetchOrganizations(); // Refresh from API
    } else {
      toast({ title: 'Hata', description: response.error || 'Durum güncelleme başarısız', variant: 'destructive' });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Organizations</h1>
          <p className="text-muted-foreground">Organizasyon yönetimi</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => {
            setOrgs(orgs);
            toast({ title: 'Yenilendi', description: 'Organizasyon listesi yenilendi', variant: 'default' });
          }}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={openAddModal}>
            <Plus className="h-4 w-4 mr-2" />
            Yeni Organizasyon
          </Button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Input 
          placeholder="Organizasyon ara..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredOrgs.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              Organizasyon bulunamadı
            </CardContent>
          </Card>
        ) : (
          filteredOrgs.map((org) => (
            <Card key={org.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{org.name}</p>
                        <Badge 
                          variant={org.status === 'active' ? 'success' : 'secondary'}
                          className="cursor-pointer"
                          onClick={() => handleStatusToggle(org)}
                        >
                          {org.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{org.description}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {org.userCount} kullanıcı
                        </div>
                        <span>•</span>
                        <span>{org.createdAt}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openViewModal(org)} title="Görüntüle">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEditModal(org)} title="Düzenle">
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openDeleteModal(org)} title="Sil" className="text-red-500 hover:text-red-600 hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Add/Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{selectedOrg ? 'Organizasyon Düzenle' : 'Yeni Organizasyon'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Organizasyon Adı *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Organizasyon adını girin"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Açıklama</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Kısa açıklama girin"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">İletişim E-posta</Label>
              <Input
                id="email"
                type="email"
                value={formData.contactEmail}
                onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                placeholder="email@organizasyon.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="address">Adres</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Organizasyon adresi"
              />
            </div>
            <div className="grid gap-2">
              <Label>Durum</Label>
              <div className="flex gap-2">
                <Button
                  variant={formData.status === 'active' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFormData({ ...formData, status: 'active' })}
                >
                  Aktif
                </Button>
                <Button
                  variant={formData.status === 'inactive' ? 'destructive' : 'outline'}
                  size="sm"
                  onClick={() => setFormData({ ...formData, status: 'inactive' })}
                >
                  Pasif
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>İptal</Button>
            <Button onClick={handleSave}>{selectedOrg ? 'Güncelle' : 'Oluştur'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Modal */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {selectedOrg?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedOrg && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-3 gap-4 py-2">
                <span className="text-sm text-muted-foreground">Durum:</span>
                <Badge variant={selectedOrg.status === 'active' ? 'success' : 'secondary'} className="col-span-2 w-fit">
                  {selectedOrg.status}
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-4 py-2">
                <span className="text-sm text-muted-foreground">Açıklama:</span>
                <span className="col-span-2">{selectedOrg.description}</span>
              </div>
              <div className="grid grid-cols-3 gap-4 py-2">
                <span className="text-sm text-muted-foreground">Kullanıcı Sayısı:</span>
                <span className="col-span-2">{selectedOrg.userCount}</span>
              </div>
              <div className="grid grid-cols-3 gap-4 py-2">
                <span className="text-sm text-muted-foreground">E-posta:</span>
                <span className="col-span-2">{selectedOrg.contactEmail || '-'}</span>
              </div>
              <div className="grid grid-cols-3 gap-4 py-2">
                <span className="text-sm text-muted-foreground">Adres:</span>
                <span className="col-span-2">{selectedOrg.address || '-'}</span>
              </div>
              <div className="grid grid-cols-3 gap-4 py-2">
                <span className="text-sm text-muted-foreground">Oluşturulma:</span>
                <span className="col-span-2">{selectedOrg.createdAt}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewModalOpen(false)}>Kapat</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-500">
              <Trash2 className="h-5 w-5" />
              Organizasyon Sil
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p>{selectedOrg?.name} organizasyonunu silmek istediğinizden emin misiniz?</p>
            <p className="text-sm text-muted-foreground mt-2">Bu işlem geri alınamaz ve organizasyona bağlı tüm veriler silinecektir.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>İptal</Button>
            <Button variant="destructive" onClick={handleDelete}>Sil</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
