'use client';

import { Header } from '../../components/layout/Header';
import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../../lib/api';
import { toast } from 'react-toastify';
import { FloorPlanView } from '@/components/3d/FloorPlanView';

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
}

// Device interface removed because it was unused
type ModalType = 'org' | 'building' | 'floor' | 'room' | 'rack' | 'device';

export default function LocationsPage() {
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

  // Load data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response: any = await apiGet('/api/organizations');
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
        toast.success(`${modalType.charAt(0).toUpperCase() + modalType.slice(1)} başarıyla eklendi!`);
      } else {
        toast.error(`Error: ${response.error || 'Failed to add item'}`);
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message || 'Failed to add item'}`);
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
        toast.success(`${modalType.charAt(0).toUpperCase() + modalType.slice(1)} updated successfully!`);
      } else {
        toast.error(`Error: ${response.error || 'Failed to update item'}`);
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message || 'Failed to update item'}`);
    }
  };

  const handleDelete = async (type: string, id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;

    try {
      let endpoint = '';

      switch (type) {
        case 'org':
          endpoint = `/api/organizations/${id}`;
          break;
        case 'building':
          endpoint = `/api/buildings/${id}`;
          break;
        case 'floor':
          endpoint = `/api/floors/${id}`;
          break;
        case 'room':
          endpoint = `/api/rooms/${id}`;
          break;
        case 'rack':
          endpoint = `/api/racks/${id}`;
          break;
        case 'device':
          endpoint = `/api/devices/${id}`;
          break;
      }

      const response: any = await apiDelete(endpoint);
      if (response.success) {
        loadData();
        toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} deleted successfully!`);
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message || 'Failed to delete item'}`);
    }
  };

  const renderOrganization = (org: Organization) => {
    const isExpanded = expandedItems.has(org.id);
    const hasChildren = org.buildings && org.buildings.length > 0;

    return (
      <div key={org.id} className="border-b border-blue-900 last:border-b-0">
        <div className="py-4 px-4 hover:bg-blue-800/30 flex items-center justify-between bg-[#000044] transition-colors">
          <div className="flex items-center space-x-3 flex-1">
            <button
              onClick={() => hasChildren && toggleExpand(org.id)}
              className="text-blue-300 hover:text-white w-6 h-6 flex items-center justify-center transition-colors"
            >
              {hasChildren ? (isExpanded ? '▼' : '▶') : '○'}
            </button>
            <div>
              <p className="font-bold text-lg text-white">{org.name}</p>
              <p className="text-sm text-blue-300">Organizasyon • {org.code}</p>
            </div>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => openEditModal('org', org)}
              className="px-3 py-1 text-sm bg-blue-800 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Düzenle
            </button>
            <button
              onClick={() => handleDelete('org', org.id, org.name)}
              className="px-3 py-1 text-sm bg-red-800 text-white rounded hover:bg-red-700 transition-colors"
            >
              Sil
            </button>
            <button
              onClick={() => openAddModal('building', org.id)}
              className="px-3 py-1 text-sm bg-green-700 text-white rounded hover:bg-green-600 transition-colors"
            >
              + Bina
            </button>
          </div>
        </div>
        {isExpanded && org.buildings && org.buildings.map(building => renderBuilding(building))}
      </div>
    );
  };

  const renderBuilding = (building: Building) => {
    const isExpanded = expandedItems.has(building.id);
    const hasChildren = building.floors && building.floors.length > 0;

    return (
      <div key={building.id} className="pl-6 bg-[#000033]/30">
        <div className="py-4 px-4 hover:bg-blue-800/30 flex items-center justify-between border-l border-blue-800 transition-colors">
          <div className="flex items-center space-x-3 flex-1">
            <button
              onClick={() => hasChildren && toggleExpand(building.id)}
              className="text-blue-300 hover:text-white w-6 h-6 flex items-center justify-center transition-colors"
            >
              {hasChildren ? (isExpanded ? '▼' : '▶') : '○'}
            </button>
            <div>
              <p className="font-semibold text-white">{building.name}</p>
              <p className="text-sm text-blue-300">
                Bina {building.city && ` • ${building.city}`}
              </p>
            </div>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => openEditModal('building', building)}
              className="px-3 py-1 text-sm bg-blue-800 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Düzenle
            </button>
            <button
              onClick={() => handleDelete('building', building.id, building.name)}
              className="px-3 py-1 text-sm bg-red-800 text-white rounded hover:bg-red-700 transition-colors"
            >
              Sil
            </button>
            <button
              onClick={() => openAddModal('floor', building.id)}
              className="px-3 py-1 text-sm bg-green-700 text-white rounded hover:bg-green-600 transition-colors"
            >
              + Kat
            </button>
          </div>
        </div>
        {isExpanded && building.floors && building.floors.map(floor => renderFloor(floor))}
      </div>
    );
  };

  const renderFloor = (floor: Floor) => {
    const isExpanded = expandedItems.has(floor.id);
    const hasChildren = floor.rooms && floor.rooms.length > 0;

    return (
      <div key={floor.id} className="pl-6 bg-[#000033]/30">
        <div className="py-4 px-4 hover:bg-blue-800/30 flex items-center justify-between border-l border-blue-800 transition-colors">
          <div className="flex items-center space-x-3 flex-1">
            <button
              onClick={() => hasChildren && toggleExpand(floor.id)}
              className="text-blue-300 hover:text-white w-6 h-6 flex items-center justify-center transition-colors"
            >
              {hasChildren ? (isExpanded ? '▼' : '▶') : '○'}
            </button>
            <div>
              <p className="font-medium text-white">{floor.name}</p>
              <p className="text-sm text-blue-300">Kat {floor.floorNumber}</p>
            </div>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => openEditModal('floor', floor)}
              className="px-3 py-1 text-sm bg-blue-800 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Düzenle
            </button>
            <button
              onClick={() => handleDelete('floor', floor.id, floor.name)}
              className="px-3 py-1 text-sm bg-red-800 text-white rounded hover:bg-red-700 transition-colors"
            >
              Sil
            </button>
            <button
              onClick={() => openAddModal('room', floor.id)}
              className="px-3 py-1 text-sm bg-purple-700 text-white rounded hover:bg-purple-600 transition-colors"
            >
              + Oda
            </button>
          </div>
        </div>
        {isExpanded && floor.rooms && floor.rooms.map(room => renderRoom(room))}
      </div>
    );
  };

  const renderRoom = (room: Room) => {
    const isExpanded = expandedItems.has(room.id);
    const hasChildren = room.racks && room.racks.length > 0;

    return (
      <div key={room.id} className="pl-6 bg-[#000033]/30">
        <div className="py-4 px-4 hover:bg-blue-800/30 flex items-center justify-between border-l border-blue-800 transition-colors">
          <div className="flex items-center space-x-3 flex-1">
            <button
              onClick={() => hasChildren && toggleExpand(room.id)}
              className="text-blue-300 hover:text-white w-6 h-6 flex items-center justify-center transition-colors"
            >
              {hasChildren ? (isExpanded ? '▼' : '▶') : '○'}
            </button>
            <div>
              <p className="font-medium text-white">{room.name}</p>
              <p className="text-sm text-blue-300">Oda</p>
            </div>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setViewing3DRoom(room)}
              className="px-3 py-1 text-sm bg-indigo-700 text-white rounded hover:bg-indigo-600 transition-colors"
            >
              3D Görünüm
            </button>
            <button
              onClick={() => openEditModal('room', room)}
              className="px-3 py-1 text-sm bg-blue-800 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Düzenle
            </button>
            <button
              onClick={() => handleDelete('room', room.id, room.name)}
              className="px-3 py-1 text-sm bg-red-800 text-white rounded hover:bg-red-700 transition-colors"
            >
              Sil
            </button>
            <button
              onClick={() => openAddModal('rack', room.id)}
              className="px-3 py-1 text-sm bg-orange-700 text-white rounded hover:bg-orange-600 transition-colors"
            >
              + Kabinet
            </button>
          </div>
        </div>
        {isExpanded && room.racks && room.racks.map(rack => renderRack(rack))}
      </div>
    );
  };

  const renderRack = (rack: Rack) => {
    return (
      <div key={rack.id} className="pl-6 bg-[#000033]/30">
        <div className="py-4 px-4 hover:bg-blue-800/30 flex items-center justify-between border-l border-blue-800 transition-colors">
          <div className="flex items-center space-x-3 flex-1">
            <span className="w-6 h-6 flex items-center justify-center text-orange-500">📦</span>
            <div>
              <p className="font-medium text-white">{rack.name}</p>
              <p className="text-sm text-blue-300">{rack.type} • {rack.maxUnits}U</p>
            </div>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => openEditModal('rack', rack)}
              className="px-3 py-1 text-sm bg-blue-800 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Düzenle
            </button>
            <button
              onClick={() => handleDelete('rack', rack.id, rack.name)}
              className="px-3 py-1 text-sm bg-red-800 text-white rounded hover:bg-red-700 transition-colors"
            >
              Sil
            </button>
            <button
              onClick={() => openDeviceModal(rack.id)}
              className="px-3 py-1 text-sm bg-indigo-700 text-white rounded hover:bg-indigo-600 transition-colors"
            >
              + Cihaz
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#000033] text-white">
      <Header />
      <main className="w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Altyapı Konumları</h1>
            <p className="mt-2 text-blue-200">Fiziksel altyapı hiyerarşinizi yönetin</p>
          </div>
          <button
            onClick={() => openAddModal('org')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
          >
            + Organizasyon Ekle
          </button>
        </div>

        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
            <p className="mt-4 text-blue-200">Altyapı yükleniyor...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 mb-6">
            <p className="text-red-200">{error}</p>
            <button onClick={loadData} className="mt-2 text-red-300 hover:text-red-100 font-medium underline">
              Tekrar Dene
            </button>
          </div>
        )}

        {!loading && !error && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3 bg-[#000044] rounded-lg border border-blue-900 overflow-hidden shadow-xl">
              {organizations.length === 0 ? (
                <div className="text-center py-12 text-blue-300">
                  <p className="text-lg font-medium">Henüz organizasyon yok</p>
                  <p className="mt-2">Başlamak için "+ Organizasyon Ekle"ye tıklayın</p>
                </div>
              ) : (
                <div className="divide-y divide-blue-900">
                  {organizations.map(org => renderOrganization(org))}
                </div>
              )}
            </div>

            <div className="bg-[#000044] rounded-lg border border-blue-900 p-6 shadow-xl h-fit">
              <h2 className="text-lg font-bold text-white mb-4">Özet</h2>
              <div className="space-y-3">
                <div className="p-4 bg-blue-900/50 rounded-lg border border-blue-800">
                  <p className="text-sm text-blue-200">Organizasyonlar</p>
                  <p className="text-2xl font-bold text-white">{organizations.length}</p>
                </div>
                <div className="p-4 bg-blue-900/50 rounded-lg border border-blue-800">
                  <p className="text-sm text-blue-200">Binalar</p>
                  <p className="text-2xl font-bold text-white">
                    {organizations.reduce((sum, org) => sum + (org.buildings?.length || 0), 0)}
                  </p>
                </div>
              </div>
            </div>
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
          <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-[5000] backdrop-blur-sm">
            <div className="bg-[#000033] w-full h-full flex flex-col">
              <div className="p-4 border-b border-blue-900 flex justify-between items-center bg-gradient-to-r from-[#000044] to-[#000055]">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">🏢</span>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">{viewing3DRoom.name}</h2>
                    <p className="text-sm text-blue-300">Data Center Görselleştirme - Düzenleme Modu</p>
                  </div>
                </div>
                <button 
                  onClick={() => setViewing3DRoom(null)}
                  className="p-2 hover:bg-blue-800 rounded-full text-blue-300 hover:text-white transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <ErrorBoundary>
                  {viewing3DRoom && <FloorPlanView room={viewing3DRoom} onUpdate={loadData} />}
                </ErrorBoundary>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
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

  const inputClass = "w-full px-4 py-2 bg-blue-950 border border-blue-800 rounded-lg text-white placeholder-blue-400 focus:ring-2 focus:ring-blue-600 outline-none transition-all";

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
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[6000] p-4 backdrop-blur-sm">
      <div className="bg-[#000044] rounded-xl p-6 max-w-md w-full border border-blue-900 shadow-2xl">
        <h2 className="text-2xl font-bold text-white mb-6">{titles[type]}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {renderFields()}
          <div className="flex space-x-3 pt-6">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-blue-800 text-blue-200 rounded-lg hover:bg-blue-900 transition-colors">İptal</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold transition-colors shadow-lg">Oluştur</button>
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

  const inputClass = "w-full px-4 py-2 bg-blue-950 border border-blue-800 rounded-lg text-white placeholder-blue-400 focus:ring-2 focus:ring-blue-600 outline-none transition-all";
  const labelClass = "text-[10px] text-blue-300 ml-1 font-bold uppercase tracking-wider";

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
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[6000] p-4 backdrop-blur-sm">
      <div className="bg-[#000044] rounded-xl p-6 max-w-md w-full border border-blue-900 shadow-2xl overflow-y-auto max-h-[90vh]">
        <h2 className="text-2xl font-bold text-white mb-6">{titles[type]}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {renderFields()}
          <div className="flex space-x-3 pt-6">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-blue-800 text-blue-200 rounded-lg hover:bg-blue-900 transition-colors">İptal</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold transition-colors shadow-lg">Güncelle</button>
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

  const inputClass = "w-full px-4 py-2 bg-blue-950 border border-blue-800 rounded-lg text-white placeholder-blue-400 focus:ring-2 focus:ring-blue-600 outline-none transition-all";
  const labelClass = "text-[10px] text-blue-300 ml-1 font-bold uppercase tracking-wider";

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[6000] p-4 backdrop-blur-sm">
      <div className="bg-[#000044] rounded-xl p-6 max-w-md w-full border border-blue-900 shadow-2xl">
        <h2 className="text-2xl font-bold text-white mb-6">Cihaz Ekle</h2>
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
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-blue-800 text-blue-200 rounded-lg hover:bg-blue-900 transition-colors">İptal</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold transition-colors shadow-lg">Cihaz Oluştur</button>
          </div>
        </form>
      </div>
    </div>
  );
}
