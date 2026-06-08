'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { apiGet, apiPost, apiPut, apiDelete } from '../../lib/api';
import { useToast } from '@/components/ui/use-toast';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

// Dynamically import 3D components with SSR disabled to prevent build errors
const FloorPlanView = dynamic(() => import('@/components/3d/FloorPlanView').then(mod => mod.FloorPlanView), { 
  ssr: false,
  loading: () => <div className="flex-1 flex items-center justify-center bg-muted/20 text-muted-foreground italic">Görünüm yükleniyor...</div>
});

const Room3D = dynamic(() => import('@/components/3d/Room3D').then(mod => mod.Room3D), { 
  ssr: false,
  loading: () => <div className="flex-1 flex items-center justify-center bg-muted/20 text-muted-foreground italic">3D Modül yükleniyor...</div>
});

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2, ChevronRight, ChevronDown, Circle, Edit, Trash2, Plus, Eye, X } from 'lucide-react';

// Simple Error Boundary Component
class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) { 
    return { hasError: true, error }; 
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("3D Room Error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center bg-red-900/20 border border-red-800 rounded-xl">
          <h2 className="text-xl font-bold text-red-400 mb-2">Bileşen Yüklenemedi</h2>
          <p className="text-blue-200 mb-4">3D görünüm yüklenirken bir hata oluştu. Lütfen sayfayı yenileyin.</p>
          <div className="bg-black/40 p-3 rounded mb-4 text-xs text-red-300 font-mono overflow-auto max-h-32 text-left">
            {this.state.error?.message || 'Bilinmeyen hata'}
          </div>
          <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-red-800 text-white rounded-lg">Yenile</button>
        </div>
      );
    }
    return this.props.children;
  }
}


interface Organization {
  id: string;
  name: string;
  code: string;
  description?: string;
  buildings?: Building[];
}

interface Building {
  id: string;
  name: string;
  city?: string;
  country?: string;
  organizationId: string;
  floors?: Floor[];
}

interface Floor {
  id: string;
  name: string;
  floorNumber: number;
  buildingId: string;
  rooms?: Room[];
}

interface Room {
  id: string;
  name: string;
  floorId: string;
  description?: string;
  capacity?: number;
  width?: number | null;
  depth?: number | null;
  height?: number | null;
  racks?: Rack[];
}

interface Device {
  id: string;
  name: string;
  type: string;
  status: string;
  rackUnitPosition: number | null;
  metadata?: any;
}

interface Rack {
  id: string;
  name: string;
  type: string;
  maxUnits: number;
  roomId: string;
  coordX?: number | null;
  coordY?: number | null;
  coordZ?: number | null;
  rotation?: number | null;
  devices?: Device[];
}

// Device interface removed because it was unused
type ModalType = 'org' | 'building' | 'floor' | 'room' | 'rack' | 'device';

export default function LocationsPage() {
  const { toast } = useToast();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [modalType, setModalType] = useState<ModalType>('org');
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [selectedRackId, setSelectedRackId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [viewing3DRoom, setViewing3DRoom] = useState<Room | null>(null);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{type: string, id: string, name: string} | null>(null);

  // Load data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response: any = await apiGet('/api/organizations?fresh=1');
      if (response.success) {
        setOrganizations(response.data);
      } else {
        setError('Veriler yüklenemedi');
      }
    } catch (err: any) {
      setError(err.message || 'Veriler yüklenirken bir hata oluştu');
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id: string) => {
    const newSet = new Set(expandedItems);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedItems(newSet);
  };

  const openAddModal = (type: ModalType, parentId?: string) => {
    setModalType(type);
    setSelectedParentId(parentId || null);
    setShowAddModal(true);
  };

  const openEditModal = (type: ModalType, item: any) => {
    setModalType(type);
    setEditingItem(item);
    setShowEditModal(true);
  };

  const openDeviceModal = (rackId: string) => {
    setSelectedRackId(rackId);
    setModalType('device');
    setShowDeviceModal(true);
  };

  const handleView3DRoom = async (room: Room) => {
    try {
      // Fetch the full room with racks
      const response: any = await apiGet(`/api/rooms/${room.id}`);
      if (response.success && response.data) {
        setViewing3DRoom(response.data);
      } else {
        // Fallback to the room as-is if fetch fails
        setViewing3DRoom(room);
      }
    } catch (err) {
      console.error('Error fetching room:', err);
      // Fallback to the room as-is if fetch fails
      setViewing3DRoom(room);
    }
  };

  const handleAdd = async (formData: any) => {
    try {
      let endpoint = '';
      let payload: any = formData;

      switch (modalType) {
        case 'org':
          endpoint = '/api/organizations';
          break;
        case 'building':
          endpoint = '/api/buildings';
          payload.organizationId = selectedParentId;
          break;
        case 'floor':
          endpoint = '/api/floors';
          payload.buildingId = selectedParentId;
          break;
        case 'room':
          endpoint = '/api/rooms';
          payload.floorId = selectedParentId;
          break;
        case 'rack':
          endpoint = '/api/racks';
          payload.roomId = selectedParentId;
          break;
        case 'device':
          endpoint = '/api/devices';
          payload.rackId = selectedRackId;
          break;
      }

      const response: any = await apiPost(endpoint, payload);
      if (response.success) {
        setShowAddModal(false);
        setShowDeviceModal(false);
        loadData();
        toast({
          title: "Başarılı",
          description: `${modalType.charAt(0).toUpperCase() + modalType.slice(1)} başarıyla eklendi!`,
        });
      } else {
        toast({
          title: "Hata",
          description: response.error || 'İşlem başarısız',
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Hata",
        description: err.message || 'Bir hata oluştu',
        variant: "destructive",
      });
    }
  };

  const handleEdit = async (formData: any) => {
    try {
      let endpoint = '';
      let payload: any = formData;

      switch (modalType) {
        case 'org':
          endpoint = `/api/organizations/${editingItem.id}`;
          break;
        case 'building':
          endpoint = `/api/buildings/${editingItem.id}`;
          break;
        case 'floor':
          endpoint = `/api/floors/${editingItem.id}`;
          break;
        case 'room':
          endpoint = `/api/rooms/${editingItem.id}`;
          break;
        case 'rack':
          endpoint = `/api/racks/${editingItem.id}`;
          break;
        case 'device':
          endpoint = `/api/devices/${editingItem.id}`;
          break;
      }

      const response: any = await apiPut(endpoint, payload);
      if (response.success) {
        setShowEditModal(false);
        loadData();
        toast({
          title: "Başarılı",
          description: `${modalType.charAt(0).toUpperCase() + modalType.slice(1)} başarıyla güncellendi!`,
        });
      } else {
        toast({
          title: "Hata",
          description: response.error || 'Güncelleme başarısız',
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Hata",
        description: err.message || 'Bir hata oluştu',
        variant: "destructive",
      });
    }
  };

  const handleDelete = (type: string, id: string, name: string) => {
    setItemToDelete({ type, id, name });
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;

    try {
      let endpoint = '';
      const { type, id, name } = itemToDelete;

      switch (type) {
        case 'org': endpoint = `/api/organizations/${id}`; break;
        case 'building': endpoint = `/api/buildings/${id}`; break;
        case 'floor': endpoint = `/api/floors/${id}`; break;
        case 'room': endpoint = `/api/rooms/${id}`; break;
        case 'rack': endpoint = `/api/racks/${id}`; break;
        case 'device': endpoint = `/api/devices/${id}`; break;
      }

      const response: any = await apiDelete(endpoint);
      if (response.success) {
        loadData();
        toast({
          title: "Başarılı",
          description: `${name} başarıyla silindi.`,
        });
      } else {
        toast({
          title: "Hata",
          description: response.error || 'Silme işlemi başarısız',
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Hata",
        description: err.message || 'Silme işlemi sırasında hata oluştu',
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    }
  };

  const renderOrganization = (org: Organization) => {
    const isExpanded = expandedItems.has(org.id);
    const hasChildren = org.buildings && org.buildings.length > 0;

    return (
      <Card key={org.id} className="mb-4">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => hasChildren && toggleExpand(org.id)}
                className="h-8 w-8"
              >
                {hasChildren ? (
                  isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                ) : (
                  <Circle className="h-3 w-3" />
                )}
              </Button>
              <div className="flex-1">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  {org.name}
                </CardTitle>
                <CardDescription className="mt-1">
                  Organizasyon • {org.code}
                </CardDescription>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => openEditModal('org', org)}
              >
                <Edit className="h-4 w-4 mr-1" />
                Düzenle
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDelete('org', org.id, org.name)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Sil
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => openAddModal('building', org.id)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Bina
              </Button>
            </div>
          </div>
        </CardHeader>
        {isExpanded && org.buildings && org.buildings.length > 0 && (
          <CardContent className="pt-0">
            <div className="space-y-2">
              {org.buildings.map(building => renderBuilding(building))}
            </div>
          </CardContent>
        )}
      </Card>
    );
  };

  const renderBuilding = (building: Building) => {
    const isExpanded = expandedItems.has(building.id);
    const hasChildren = building.floors && building.floors.length > 0;

    return (
      <Card key={building.id} className="ml-4">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => hasChildren && toggleExpand(building.id)}
                className="h-7 w-7"
              >
                {hasChildren ? (
                  isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
                ) : (
                  <Circle className="h-2 w-2" />
                )}
              </Button>
              <div className="flex-1">
                <p className="font-semibold text-sm">{building.name}</p>
                <p className="text-xs text-muted-foreground">
                  Bina{building.city && ` • ${building.city}`}
                </p>
              </div>
            </div>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => openEditModal('building', building)}
                className="h-8 text-xs"
              >
                <Edit className="h-3 w-3 mr-1" />
                Düzenle
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDelete('building', building.id, building.name)}
                className="h-8 text-xs"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Sil
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => openAddModal('floor', building.id)}
                className="h-8 text-xs"
              >
                <Plus className="h-3 w-3 mr-1" />
                Kat
              </Button>
            </div>
          </div>
        </CardHeader>
        {isExpanded && building.floors && building.floors.length > 0 && (
          <CardContent className="pt-0 pb-3">
            <div className="space-y-2">
              {building.floors.map(floor => renderFloor(floor))}
            </div>
          </CardContent>
        )}
      </Card>
    );
  };

  const renderFloor = (floor: Floor) => {
    const isExpanded = expandedItems.has(floor.id);
    const hasChildren = floor.rooms && floor.rooms.length > 0;

    return (
      <Card key={floor.id} className="ml-4">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => hasChildren && toggleExpand(floor.id)}
                className="h-6 w-6"
              >
                {hasChildren ? (
                  isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
                ) : (
                  <Circle className="h-2 w-2" />
                )}
              </Button>
              <div className="flex-1">
                <p className="font-medium text-sm">{floor.name}</p>
                <p className="text-xs text-muted-foreground">Kat {floor.floorNumber}</p>
              </div>
            </div>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => openEditModal('floor', floor)}
                className="h-7 text-xs"
              >
                <Edit className="h-3 w-3 mr-1" />
                Düzenle
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDelete('floor', floor.id, floor.name)}
                className="h-7 text-xs"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Sil
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => openAddModal('room', floor.id)}
                className="h-7 text-xs"
              >
                <Plus className="h-3 w-3 mr-1" />
                Oda
              </Button>
            </div>
          </div>
        </CardHeader>
        {isExpanded && floor.rooms && floor.rooms.length > 0 && (
          <CardContent className="pt-0 pb-2">
            <div className="space-y-2">
              {floor.rooms.map(room => renderRoom(room))}
            </div>
          </CardContent>
        )}
      </Card>
    );
  };

  const renderRoom = (room: Room) => {
    const isExpanded = expandedItems.has(room.id);
    const hasChildren = room.racks && room.racks.length > 0;

    return (
      <Card key={room.id} className="ml-4">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => hasChildren && toggleExpand(room.id)}
                className="h-6 w-6"
              >
                {hasChildren ? (
                  isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
                ) : (
                  <Circle className="h-2 w-2" />
                )}
              </Button>
              <div className="flex-1">
                <p className="font-medium text-sm">{room.name}</p>
                <p className="text-xs text-muted-foreground">Oda</p>
              </div>
            </div>
            <div className="flex gap-1.5">
              <Button
                variant="default"
                size="sm"
                onClick={() => handleView3DRoom(room)}
                className="h-7 text-xs"
              >
                <Eye className="h-3 w-3 mr-1" />
                3D Görünüm
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openEditModal('room', room)}
                className="h-7 text-xs"
              >
                <Edit className="h-3 w-3 mr-1" />
                Düzenle
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDelete('room', room.id, room.name)}
                className="h-7 text-xs"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Sil
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => openAddModal('rack', room.id)}
                className="h-7 text-xs"
              >
                <Plus className="h-3 w-3 mr-1" />
                Kabinet
              </Button>
            </div>
          </div>
        </CardHeader>
        {isExpanded && room.racks && room.racks.length > 0 && (
          <CardContent className="pt-0 pb-2">
            <div className="space-y-2">
              {room.racks.map(rack => renderRack(rack))}
            </div>
          </CardContent>
        )}
      </Card>
    );
  };

  const renderRack = (rack: Rack) => {
    return (
      <Card key={rack.id} className="ml-4">
        <CardHeader className="py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1">
              <span className="text-lg">📦</span>
              <div className="flex-1">
                <p className="font-medium text-sm">{rack.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="outline" className="text-xs">{rack.type}</Badge>
                  <Badge variant="secondary" className="text-xs">{rack.maxUnits}U</Badge>
                </div>
              </div>
            </div>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => openEditModal('rack', rack)}
                className="h-7 text-xs"
              >
                <Edit className="h-3 w-3 mr-1" />
                Düzenle
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDelete('rack', rack.id, rack.name)}
                className="h-7 text-xs"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Sil
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => openDeviceModal(rack.id)}
                className="h-7 text-xs"
              >
                <Plus className="h-3 w-3 mr-1" />
                Cihaz
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  };

  return (
    <>
      <main className="w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Altyapı Konumları</h1>
            <p className="mt-2 text-muted-foreground">Fiziksel altyapı hiyerarşinizi yönetin</p>
          </div>
          <Button
            onClick={() => openAddModal('org')}
            size="default"
          >
            <Plus className="h-4 w-4 mr-2" />
            Organizasyon Ekle
          </Button>
        </div>

        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
            <p className="mt-4 text-blue-200">Altyapı yükleniyor...</p>
          </div>
        )}

        {error && (
          <Card className="mb-6 border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive">{error}</p>
              <Button 
                variant="outline" 
                onClick={loadData} 
                className="mt-3"
                size="sm"
              >
                Tekrar Dene
              </Button>
            </CardContent>
          </Card>
        )}

        {!loading && !error && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3 space-y-4">
              {organizations.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <p className="text-lg font-medium text-muted-foreground">Henüz organizasyon yok</p>
                    <p className="mt-2 text-sm text-muted-foreground">Başlamak için "Organizasyon Ekle"ye tıklayın</p>
                  </CardContent>
                </Card>
              ) : (
                organizations.map(org => renderOrganization(org))
              )}
            </div>

            <Card className="h-fit">
              <CardHeader>
                <CardTitle>Özet</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Organizasyonlar</p>
                    <p className="text-2xl font-bold">{organizations.length}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Binalar</p>
                    <p className="text-2xl font-bold">
                      {organizations.reduce((sum, org) => sum + (org.buildings?.length || 0), 0)}
                    </p>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Add Modal */}
        {showAddModal && (
          <UniversalAddModal
            type={modalType}
            onClose={() => setShowAddModal(false)}
            onSubmit={handleAdd}
          />
        )}

        {/* Edit Modal */}
        {showEditModal && (
          <UniversalEditModal
            type={modalType}
            item={editingItem}
            onClose={() => setShowEditModal(false)}
            onSubmit={handleEdit}
          />
        )}

        {/* Device Modal */}
        {showDeviceModal && (
          <DeviceModal
            onClose={() => setShowDeviceModal(false)}
            onSubmit={handleAdd}
          />
        )}

        {/* 3D Room View Modal */}
        {viewing3DRoom && (
          <div className="fixed inset-0 bg-gray-200 flex items-center justify-center z-[5000] backdrop-blur-sm">
            <div className="bg-gray-100 w-full h-full flex flex-col">
              <div className="p-4 border-b border-border flex justify-between items-center bg-muted/30">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Building2 className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">{viewing3DRoom.name}</h2>
                    <p className="text-sm text-muted-foreground">Veri Merkezi Görselleştirme</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Tabs defaultValue="2d" className="w-[200px]" onValueChange={(v: string) => setViewMode(v as '2d' | '3d')}>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="2d">Plan</TabsTrigger>
                      <TabsTrigger value="3d">3D</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <Button 
                    variant="ghost"
                    size="icon"
                    onClick={() => setViewing3DRoom(null)}
                    className="rounded-full"
                  >
                    <X className="h-6 w-6" />
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-hidden relative">
                <ErrorBoundary>
                  {viewMode === '2d' ? (
                    <FloorPlanView room={viewing3DRoom} onUpdate={loadData} />
                  ) : (
                    <Room3D room={viewing3DRoom} onRackClick={(rackId) => console.log('Rack clicked:', rackId)} />
                  )}
                </ErrorBoundary>
              </div>
            </div>
          </div>
        )}

        <ConfirmDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          title="Silme İşlemini Onayla"
          description={`${itemToDelete?.name} ögesini silmek istediğinizden emin misiniz? Bu işlem bağlı tüm alt ögeleri de silebilir.`}
          onConfirm={confirmDelete}
          variant="destructive"
          confirmText="Sil"
        />
      </main>
    </>
  );
}

// Universal Add Modal Component
function UniversalAddModal({ type, onClose, onSubmit }: {
  type: ModalType;
  onClose: () => void;
  onSubmit: (data: any) => void;
}) {
  const [formData, setFormData] = useState<any>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const inputClass = "w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:ring-2 focus:ring-primary outline-none transition-all";

  const renderFields = () => {
    switch (type) {
      case 'org':
        return (
          <>
            <input type="text" placeholder="Organizasyon Adı" className={inputClass} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
            <input type="text" placeholder="Kod (örn: TECHCORP)" className={inputClass} onChange={e => setFormData({ ...formData, code: e.target.value })} required />
            <textarea placeholder="Açıklama (isteğe bağlı)" className={inputClass} onChange={e => setFormData({ ...formData, description: e.target.value })} />
          </>
        );
      case 'building':
        return (
          <>
            <input type="text" placeholder="Bina Adı" className={inputClass} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
            <input type="text" placeholder="Adres" className={inputClass} onChange={e => setFormData({ ...formData, address: e.target.value })} />
            <input type="text" placeholder="Şehir" className={inputClass} onChange={e => setFormData({ ...formData, city: e.target.value })} />
            <input type="text" placeholder="Ülke" className={inputClass} onChange={e => setFormData({ ...formData, country: e.target.value })} />
          </>
        );
      case 'floor':
        return (
          <>
            <input type="text" placeholder="Kat Adı" className={inputClass} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
            <input type="number" placeholder="Kat Numarası" className={inputClass} onChange={e => setFormData({ ...formData, floorNumber: parseInt(e.target.value) })} required />
          </>
        );
      case 'room':
        return (
          <>
            <input type="text" placeholder="Oda Adı" className={inputClass} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
            <input type="text" placeholder="Açıklama (isteğe bağlı)" className={inputClass} onChange={e => setFormData({ ...formData, description: e.target.value })} />
            <div className="grid grid-cols-3 gap-2">
              <input type="number" step="0.1" placeholder="Genişlik (m)" className={inputClass} onChange={e => setFormData({ ...formData, width: parseFloat(e.target.value) })} />
              <input type="number" step="0.1" placeholder="Derinlik (m)" className={inputClass} onChange={e => setFormData({ ...formData, depth: parseFloat(e.target.value) })} />
              <input type="number" step="0.1" placeholder="Yükseklik (m)" className={inputClass} onChange={e => setFormData({ ...formData, height: parseFloat(e.target.value) })} />
            </div>
          </>
        );
      case 'rack':
        return (
          <>
            <input type="text" placeholder="Kabinet Adı" className={inputClass} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
            <select className={inputClass} onChange={e => setFormData({ ...formData, type: e.target.value })} required>
              <option value="">Tip Seçin</option>
              <option value="RACK_42U">42U Kabinet</option>
              <option value="RACK_45U">45U Kabinet</option>
              <option value="CUSTOM">Özel</option>
            </select>
            <input type="number" placeholder="Maks Birim (U)" className={inputClass} onChange={e => setFormData({ ...formData, maxUnits: parseInt(e.target.value) })} defaultValue={42} required />
            <div className="grid grid-cols-4 gap-2">
              <input type="number" step="0.1" placeholder="X" title="X Koordinatı" className={inputClass} onChange={e => setFormData({ ...formData, coordX: parseFloat(e.target.value) })} />
              <input type="number" step="0.1" placeholder="Y" title="Y Koordinatı" className={inputClass} onChange={e => setFormData({ ...formData, coordY: parseFloat(e.target.value) })} />
              <input type="number" step="0.1" placeholder="Z" title="Z Koordinatı" className={inputClass} onChange={e => setFormData({ ...formData, coordZ: parseFloat(e.target.value) })} />
              <input type="number" step="1" placeholder="Dönüş°" title="Derece Cinsinden Dönüş" className={inputClass} onChange={e => setFormData({ ...formData, rotation: parseFloat(e.target.value) })} />
            </div>
          </>
        );
      default:
        return null;
    }
  };

  const titles: Record<ModalType, string> = {
    org: 'Organizasyon Ekle',
    building: 'Bina Ekle',
    floor: 'Kat Ekle',
    room: 'Oda Ekle',
    rack: 'Kabinet Ekle',
    device: 'Cihaz Ekle',
  };

  return (
    <div className="fixed inset-0 bg-background/80 flex items-center justify-center z-[6000] p-4 backdrop-blur-sm">
      <div className="bg-card rounded-xl p-6 max-w-md w-full border border-border shadow-2xl">
        <h2 className="text-2xl font-bold mb-6">{titles[type]}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {renderFields()}
          <div className="flex space-x-3 pt-6">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">İptal</Button>
            <Button type="submit" className="flex-1 font-bold shadow-lg">Oluştur</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Universal Edit Modal Component
function UniversalEditModal({ type, item, onClose, onSubmit }: {
  type: ModalType;
  item: any;
  onClose: () => void;
  onSubmit: (data: any) => void;
}) {
  const [formData, setFormData] = useState<any>(item || {});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const inputClass = "w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:ring-2 focus:ring-primary outline-none transition-all";
  const labelClass = "text-[10px] text-muted-foreground ml-1 font-bold uppercase tracking-wider";

  const renderFields = () => {
    switch (type) {
      case 'org':
        return (
          <>
            <div className="space-y-1">
              <label className={labelClass}>Organizasyon Adı</label>
              <input type="text" className={inputClass} value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Kod</label>
              <input type="text" className={inputClass} value={formData.code || ''} onChange={e => setFormData({ ...formData, code: e.target.value })} required />
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Açıklama</label>
              <textarea className={inputClass} value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} />
            </div>
          </>
        );
      case 'building':
        return (
          <>
            <div className="space-y-1">
              <label className={labelClass}>Bina Adı</label>
              <input type="text" className={inputClass} value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Adres</label>
              <input type="text" className={inputClass} value={formData.address || ''} onChange={e => setFormData({ ...formData, address: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Şehir</label>
              <input type="text" className={inputClass} value={formData.city || ''} onChange={e => setFormData({ ...formData, city: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Ülke</label>
              <input type="text" className={inputClass} value={formData.country || ''} onChange={e => setFormData({ ...formData, country: e.target.value })} />
            </div>
          </>
        );
      case 'floor':
        return (
          <>
            <div className="space-y-1">
              <label className={labelClass}>Kat Adı</label>
              <input type="text" className={inputClass} value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Kat Numarası</label>
              <input type="number" className={inputClass} value={formData.floorNumber || ''} onChange={e => setFormData({ ...formData, floorNumber: parseInt(e.target.value) })} required />
            </div>
          </>
        );
      case 'room':
        return (
          <>
            <div className="space-y-1">
              <label className={labelClass}>Oda Adı</label>
              <input type="text" className={inputClass} value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Açıklama</label>
              <input type="text" className={inputClass} value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col">
                <label className={labelClass}>Genişlik (m)</label>
                <input type="number" step="0.1" className={inputClass} value={formData.width ?? ''} onChange={e => setFormData({ ...formData, width: parseFloat(e.target.value) })} />
              </div>
              <div className="flex flex-col">
                <label className={labelClass}>Derinlik (m)</label>
                <input type="number" step="0.1" className={inputClass} value={formData.depth ?? ''} onChange={e => setFormData({ ...formData, depth: parseFloat(e.target.value) })} />
              </div>
              <div className="flex flex-col">
                <label className={labelClass}>Yükseklik (m)</label>
                <input type="number" step="0.1" className={inputClass} value={formData.height ?? ''} onChange={e => setFormData({ ...formData, height: parseFloat(e.target.value) })} />
              </div>
            </div>
          </>
        );
      case 'rack':
        return (
          <>
            <div className="space-y-1">
              <label className={labelClass}>Kabinet Adı</label>
              <input type="text" className={inputClass} value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Tip</label>
              <select className={inputClass} value={formData.type || ''} onChange={e => setFormData({ ...formData, type: e.target.value })} required>
                <option value="">Tip Seçin</option>
                <option value="RACK_42U">42U Kabinet</option>
                <option value="RACK_45U">45U Kabinet</option>
                <option value="CUSTOM">Özel</option>
              </select>
            </div>
            <div className="flex flex-col">
              <label className={labelClass}>Maks Birim (U)</label>
              <input type="number" className={inputClass} value={formData.maxUnits ?? 42} onChange={e => setFormData({ ...formData, maxUnits: parseInt(e.target.value) })} required />
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div className="flex flex-col">
                <label className={labelClass}>X</label>
                <input type="number" step="0.1" className={inputClass} value={formData.coordX ?? ''} onChange={e => setFormData({ ...formData, coordX: parseFloat(e.target.value) })} />
              </div>
              <div className="flex flex-col">
                <label className={labelClass}>Y</label>
                <input type="number" step="0.1" className={inputClass} value={formData.coordY ?? ''} onChange={e => setFormData({ ...formData, coordY: parseFloat(e.target.value) })} />
              </div>
              <div className="flex flex-col">
                <label className={labelClass}>Z</label>
                <input type="number" step="0.1" className={inputClass} value={formData.coordZ ?? ''} onChange={e => setFormData({ ...formData, coordZ: parseFloat(e.target.value) })} />
              </div>
              <div className="flex flex-col">
                <label className={labelClass}>Dönüş°</label>
                <input type="number" step="1" className={inputClass} value={formData.rotation ?? ''} onChange={e => setFormData({ ...formData, rotation: parseFloat(e.target.value) })} />
              </div>
            </div>
          </>
        );
      case 'device':
        return (
          <>
            <div className="space-y-1">
              <label className={labelClass}>Cihaz Adı</label>
              <input type="text" className={inputClass} value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Support Tarihi</label>
              <input 
                type="date" 
                className={inputClass} 
                value={formData.supportDate ? new Date(formData.supportDate).toISOString().split('T')[0] : ''} 
                onChange={e => setFormData({ ...formData, supportDate: e.target.value })} 
              />
            </div>
          </>
        );
      default:
        return null;
    }
  };

  const titles: Record<ModalType, string> = {
    org: 'Organizasyonu Düzenle',
    building: 'Binayı Düzenle',
    floor: 'Katı Düzenle',
    room: 'Odayı Düzenle',
    rack: 'Kabineti Düzenle',
    device: 'Cihazı Düzenle',
  };

  return (
    <div className="fixed inset-0 bg-background/80 flex items-center justify-center z-[6000] p-4 backdrop-blur-sm">
      <div className="bg-card rounded-xl p-6 max-w-md w-full border border-border shadow-2xl overflow-y-auto max-h-[90vh]">
        <h2 className="text-2xl font-bold mb-6">{titles[type]}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {renderFields()}
          <div className="flex space-x-3 pt-6">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">İptal</Button>
            <Button type="submit" className="flex-1 font-bold shadow-lg">Güncelle</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Device Modal Component
function DeviceModal({ onClose, onSubmit }: {
  onClose: () => void;
  onSubmit: (data: any) => void;
}) {
  const [formData, setFormData] = useState<any>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const inputClass = "w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:ring-2 focus:ring-primary outline-none transition-all";
  const labelClass = "text-[10px] text-muted-foreground ml-1 font-bold uppercase tracking-wider";

  return (
    <div className="fixed inset-0 bg-background/80 flex items-center justify-center z-[6000] p-4 backdrop-blur-sm">
      <div className="bg-card rounded-xl p-6 max-w-md w-full border border-border shadow-2xl">
        <h2 className="text-2xl font-bold mb-6">Cihaz Ekle</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className={labelClass}>Cihaz Adı</label>
            <input type="text" placeholder="Cihaz Adı" className={inputClass} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Cihaz Tipi</label>
            <select className={inputClass} onChange={e => setFormData({ ...formData, type: e.target.value })} required>
              <option value="">Cihaz Tipi Seçin</option>
              <option value="PHYSICAL_SERVER">Fiziksel Sunucu</option>
              <option value="VIRTUAL_HOST">Sanal Host</option>
              <option value="VIRTUAL_MACHINE">Sanal Makine</option>
              <option value="FIREWALL">Güvenlik Duvarı</option>
              <option value="SWITCH">Switch</option>
              <option value="ROUTER">Router</option>
              <option value="STORAGE">Depolama</option>
              <option value="PDU">PDU</option>
              <option value="PATCH_PANEL">Patch Panel</option>
              <option value="COMPUTER">Bilgisayar</option>
              <option value="LAPTOP">Dizüstü</option>
              <option value="OTHER">Diğer</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Durum</label>
            <select className={inputClass} onChange={e => setFormData({ ...formData, status: e.target.value })} defaultValue="ACTIVE">
              <option value="ACTIVE">Aktif</option>
              <option value="INACTIVE">Pasif</option>
              <option value="MAINTENANCE">Bakımda</option>
              <option value="DECOMMISSIONED">Devre Dışı</option>
              <option value="UNKNOWN">Bilinmiyor</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Support Tarihi</label>
            <input 
              type="date" 
              className={inputClass} 
              onChange={e => setFormData({ ...formData, supportDate: e.target.value })} 
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Kritiklik</label>
            <select className={inputClass} onChange={e => setFormData({ ...formData, criticality: e.target.value })} defaultValue="MEDIUM">
              <option value="CRITICAL">Kritik</option>
              <option value="HIGH">Yüksek</option>
              <option value="MEDIUM">Orta</option>
              <option value="LOW">Düşük</option>
              <option value="INFORMATIONAL">Bilgi</option>
            </select>
          </div>
          <div className="flex space-x-3 pt-6">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">İptal</Button>
            <Button type="submit" className="flex-1 font-bold shadow-lg">Cihaz Oluştur</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
