'use client';

import { Header } from '../../components/layout/Header';
import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../../lib/api';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

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
  racks?: Rack[];
}

interface Rack {
  id: string;
  name: string;
  type: string;
  maxUnits: number;
  roomId: string;
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
        setError('Failed to load data');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
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
        toast.success(`${modalType.charAt(0).toUpperCase() + modalType.slice(1)} added successfully!`);
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
      <div key={org.id} className="border-b border-gray-200 last:border-b-0">
        <div className="py-4 px-4 hover:bg-gray-50 flex items-center justify-between bg-white rounded-lg shadow-sm border border-gray-100 mb-2">
          <div className="flex items-center space-x-3 flex-1">
            <button
              onClick={() => hasChildren && toggleExpand(org.id)}
              className="text-gray-600 hover:text-gray-900 w-6 h-6 flex items-center justify-center"
            >
              {hasChildren ? (isExpanded ? '▼' : '▶') : '○'}
            </button>
            <div>
              <p className="font-bold text-lg text-gray-900">{org.name}</p>
              <p className="text-sm text-gray-500">Organization • {org.code}</p>
            </div>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => openEditModal('org', org)}
              className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
            >
              Edit
            </button>
            <button
              onClick={() => handleDelete('org', org.id, org.name)}
              className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
            >
              Delete
            </button>
            <button
              onClick={() => openAddModal('building', org.id)}
              className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
            >
              + Building
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
      <div key={building.id} style={{ paddingLeft: '24px' }}>
        <div className="py-4 px-4 hover:bg-gray-50 flex items-center justify-between bg-white rounded-lg shadow-sm border border-gray-100 mb-2">
          <div className="flex items-center space-x-3 flex-1">
            <button
              onClick={() => hasChildren && toggleExpand(building.id)}
              className="text-gray-600 hover:text-gray-900 w-6 h-6 flex items-center justify-center"
            >
              {hasChildren ? (isExpanded ? '▼' : '▶') : '○'}
            </button>
            <div>
              <p className="font-semibold text-gray-900">{building.name}</p>
              <p className="text-sm text-gray-500">
                Building {building.city && ` • ${building.city}, ${building.country}`}
              </p>
            </div>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => openEditModal('building', building)}
              className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
            >
              Edit
            </button>
            <button
              onClick={() => handleDelete('building', building.id, building.name)}
              className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
            >
              Delete
            </button>
            <button
              onClick={() => openAddModal('floor', building.id)}
              className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
            >
              + Floor
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
      <div key={floor.id} style={{ paddingLeft: '48px' }}>
        <div className="py-4 px-4 hover:bg-gray-50 flex items-center justify-between bg-white rounded-lg shadow-sm border border-gray-100 mb-2">
          <div className="flex items-center space-x-3 flex-1">
            <button
              onClick={() => hasChildren && toggleExpand(floor.id)}
              className="text-gray-600 hover:text-gray-900 w-6 h-6 flex items-center justify-center"
            >
              {hasChildren ? (isExpanded ? '▼' : '▶') : '○'}
            </button>
            <div>
              <p className="font-medium text-gray-900">{floor.name}</p>
              <p className="text-sm text-gray-500">Floor {floor.floorNumber}</p>
            </div>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => openEditModal('floor', floor)}
              className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
            >
              Edit
            </button>
            <button
              onClick={() => handleDelete('floor', floor.id, floor.name)}
              className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
            >
              Delete
            </button>
            <button
              onClick={() => openAddModal('room', floor.id)}
              className="px-3 py-1 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
            >
              + Room
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
      <div key={room.id} style={{ paddingLeft: '72px' }}>
        <div className="py-4 px-4 hover:bg-gray-50 flex items-center justify-between bg-white rounded-lg shadow-sm border border-gray-100 mb-2">
          <div className="flex items-center space-x-3 flex-1">
            <button
              onClick={() => hasChildren && toggleExpand(room.id)}
              className="text-gray-600 hover:text-gray-900 w-6 h-6 flex items-center justify-center"
            >
              {hasChildren ? (isExpanded ? '▼' : '▶') : '○'}
            </button>
            <div>
              <p className="font-medium text-gray-900">{room.name}</p>
              <p className="text-sm text-gray-500">Room</p>
            </div>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => openEditModal('room', room)}
              className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
            >
              Edit
            </button>
            <button
              onClick={() => handleDelete('room', room.id, room.name)}
              className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
            >
              Delete
            </button>
            <button
              onClick={() => openAddModal('rack', room.id)}
              className="px-3 py-1 text-sm bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors"
            >
              + Rack
            </button>
          </div>
        </div>
        {isExpanded && room.racks && room.racks.map(rack => renderRack(rack))}
      </div>
    );
  };

  const renderRack = (rack: Rack) => {
    return (
      <div key={rack.id} style={{ paddingLeft: '96px' }}>
        <div className="py-4 px-4 hover:bg-gray-50 flex items-center justify-between bg-white rounded-lg shadow-sm border border-gray-100 mb-2">
          <div className="flex items-center space-x-3 flex-1">
            <span className="w-6 h-6 flex items-center justify-center text-orange-600">📦</span>
            <div>
              <p className="font-medium text-gray-900">{rack.name}</p>
              <p className="text-sm text-gray-500">{rack.type} • {rack.maxUnits}U</p>
            </div>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => openEditModal('rack', rack)}
              className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
            >
              Edit
            </button>
            <button
              onClick={() => handleDelete('rack', rack.id, rack.name)}
              className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
            >
              Delete
            </button>
            <button
              onClick={() => openDeviceModal(rack.id)}
              className="px-3 py-1 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
            >
              + Device
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <Header />
      <main className="w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Infrastructure Locations</h1>
            <p className="mt-2 text-gray-600">Manage your physical infrastructure hierarchy</p>
          </div>
          <button
            onClick={() => openAddModal('org')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            + Add Organization
          </button>
        </div>

        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Loading infrastructure...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">{error}</p>
            <button onClick={loadData} className="mt-2 text-red-600 hover:text-red-800 font-medium">
              Retry
            </button>
          </div>
        )}

        {!loading && !error && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3 bg-white rounded-lg border border-gray-200">
              {organizations.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p className="text-lg font-medium">No organizations yet</p>
                  <p className="mt-2">Click "Add Organization" to get started</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {organizations.map(org => renderOrganization(org))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Summary</h2>
              <div className="space-y-3">
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm text-gray-600">Organizations</p>
                  <p className="text-2xl font-bold text-blue-600">{organizations.length}</p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <p className="text-sm text-gray-600">Buildings</p>
                  <p className="text-2xl font-bold text-green-600">
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

        <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} newestOnTop closeOnClick pauseOnHover draggable/>
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

  const renderFields = () => {
    switch (type) {
      case 'org':
        return (
          <>
            <input type="text" placeholder="Name" className="w-full px-4 py-2 border border-gray-300 rounded-lg" onChange={e => setFormData({ ...formData, name: e.target.value })} required />
            <input type="text" placeholder="Code (e.g., TECHCORP)" className="w-full px-4 py-2 border border-gray-300 rounded-lg" onChange={e => setFormData({ ...formData, code: e.target.value })} required />
            <textarea placeholder="Description (optional)" className="w-full px-4 py-2 border border-gray-300 rounded-lg" onChange={e => setFormData({ ...formData, description: e.target.value })} />
          </>
        );
      case 'building':
        return (
          <>
            <input type="text" placeholder="Building Name" className="w-full px-4 py-2 border border-gray-300 rounded-lg" onChange={e => setFormData({ ...formData, name: e.target.value })} required />
            <input type="text" placeholder="Address" className="w-full px-4 py-2 border border-gray-300 rounded-lg" onChange={e => setFormData({ ...formData, address: e.target.value })} />
            <input type="text" placeholder="City" className="w-full px-4 py-2 border border-gray-300 rounded-lg" onChange={e => setFormData({ ...formData, city: e.target.value })} />
            <input type="text" placeholder="Country" className="w-full px-4 py-2 border border-gray-300 rounded-lg" onChange={e => setFormData({ ...formData, country: e.target.value })} />
          </>
        );
      case 'floor':
        return (
          <>
            <input type="text" placeholder="Floor Name" className="w-full px-4 py-2 border border-gray-300 rounded-lg" onChange={e => setFormData({ ...formData, name: e.target.value })} required />
            <input type="number" placeholder="Floor Number" className="w-full px-4 py-2 border border-gray-300 rounded-lg" onChange={e => setFormData({ ...formData, floorNumber: parseInt(e.target.value) })} required />
          </>
        );
      case 'room':
        return (
          <>
            <input type="text" placeholder="Room Name" className="w-full px-4 py-2 border border-gray-300 rounded-lg" onChange={e => setFormData({ ...formData, name: e.target.value })} required />
            <input type="text" placeholder="Description (optional)" className="w-full px-4 py-2 border border-gray-300 rounded-lg" onChange={e => setFormData({ ...formData, description: e.target.value })} />
          </>
        );
      case 'rack':
        return (
          <>
            <input type="text" placeholder="Rack Name" className="w-full px-4 py-2 border border-gray-300 rounded-lg" onChange={e => setFormData({ ...formData, name: e.target.value })} required />
            <select className="w-full px-4 py-2 border border-gray-300 rounded-lg" onChange={e => setFormData({ ...formData, type: e.target.value })} required>
              <option value="">Select Type</option>
              <option value="RACK_42U">42U Rack</option>
              <option value="RACK_45U">45U Rack</option>
              <option value="CUSTOM">Custom</option>
            </select>
            <input type="text" placeholder="Position (e.g., A1)" className="w-full px-4 py-2 border border-gray-300 rounded-lg" onChange={e => setFormData({ ...formData, position: e.target.value })} />
          </>
        );
      default:
        return null;
    }
  };

  const titles: Record<ModalType, string> = {
    org: 'Add Organization',
    building: 'Add Building',
    floor: 'Add Floor',
    room: 'Add Room',
    rack: 'Add Rack',
    device: 'Add Device',
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">{titles[type]}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {renderFields()}
          <div className="flex space-x-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create</button>
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

  const renderFields = () => {
    switch (type) {
      case 'org':
        return (
          <>
            <input type="text" placeholder="Name" className="w-full px-4 py-2 border border-gray-300 rounded-lg" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
            <input type="text" placeholder="Code" className="w-full px-4 py-2 border border-gray-300 rounded-lg" value={formData.code || ''} onChange={e => setFormData({ ...formData, code: e.target.value })} required />
            <textarea placeholder="Description" className="w-full px-4 py-2 border border-gray-300 rounded-lg" value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} />
          </>
        );
      case 'building':
        return (
          <>
            <input type="text" placeholder="Building Name" className="w-full px-4 py-2 border border-gray-300 rounded-lg" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
            <input type="text" placeholder="Address" className="w-full px-4 py-2 border border-gray-300 rounded-lg" value={formData.address || ''} onChange={e => setFormData({ ...formData, address: e.target.value })} />
            <input type="text" placeholder="City" className="w-full px-4 py-2 border border-gray-300 rounded-lg" value={formData.city || ''} onChange={e => setFormData({ ...formData, city: e.target.value })} />
            <input type="text" placeholder="Country" className="w-full px-4 py-2 border border-gray-300 rounded-lg" value={formData.country || ''} onChange={e => setFormData({ ...formData, country: e.target.value })} />
          </>
        );
      case 'floor':
        return (
          <>
            <input type="text" placeholder="Floor Name" className="w-full px-4 py-2 border border-gray-300 rounded-lg" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
            <input type="number" placeholder="Floor Number" className="w-full px-4 py-2 border border-gray-300 rounded-lg" value={formData.floorNumber || ''} onChange={e => setFormData({ ...formData, floorNumber: parseInt(e.target.value) })} required />
          </>
        );
      case 'room':
        return (
          <>
            <input type="text" placeholder="Room Name" className="w-full px-4 py-2 border border-gray-300 rounded-lg" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
            <input type="text" placeholder="Description" className="w-full px-4 py-2 border border-gray-300 rounded-lg" value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} />
          </>
        );
      case 'rack':
        return (
          <>
            <input type="text" placeholder="Rack Name" className="w-full px-4 py-2 border border-gray-300 rounded-lg" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
            <select className="w-full px-4 py-2 border border-gray-300 rounded-lg" value={formData.type || ''} onChange={e => setFormData({ ...formData, type: e.target.value })} required>
              <option value="">Select Type</option>
              <option value="RACK_42U">42U Rack</option>
              <option value="RACK_45U">45U Rack</option>
              <option value="CUSTOM">Custom</option>
            </select>
            <input type="text" placeholder="Position" className="w-full px-4 py-2 border border-gray-300 rounded-lg" value={formData.position || ''} onChange={e => setFormData({ ...formData, position: e.target.value })} />
          </>
        );
      default:
        return null;
    }
  };

  const titles: Record<ModalType, string> = {
    org: 'Edit Organization',
    building: 'Edit Building',
    floor: 'Edit Floor',
    room: 'Edit Room',
    rack: 'Edit Rack',
    device: 'Edit Device',
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">{titles[type]}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {renderFields()}
          <div className="flex space-x-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Update</button>
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Add Device</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="text" placeholder="Device Name" className="w-full px-4 py-2 border border-gray-300 rounded-lg" onChange={e => setFormData({ ...formData, name: e.target.value })} required />
          <select className="w-full px-4 py-2 border border-gray-300 rounded-lg" onChange={e => setFormData({ ...formData, type: e.target.value })} required>
            <option value="">Select Device Type</option>
            <option value="PHYSICAL_SERVER">Physical Server</option>
            <option value="VIRTUAL_HOST">Virtual Host</option>
            <option value="VIRTUAL_MACHINE">Virtual Machine</option>
            <option value="FIREWALL">Firewall</option>
            <option value="SWITCH">Switch</option>
            <option value="ROUTER">Router</option>
            <option value="STORAGE">Storage</option>
            <option value="PDU">PDU</option>
            <option value="PATCH_PANEL">Patch Panel</option>
            <option value="COMPUTER">Computer</option>
            <option value="LAPTOP">Laptop</option>
            <option value="OTHER">Other</option>
          </select>
          <select className="w-full px-4 py-2 border border-gray-300 rounded-lg" onChange={e => setFormData({ ...formData, status: e.target.value })} defaultValue="ACTIVE">
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="MAINTENANCE">Maintenance</option>
            <option value="DECOMMISSIONED">Decommissioned</option>
            <option value="UNKNOWN">Unknown</option>
          </select>
          <select className="w-full px-4 py-2 border border-gray-300 rounded-lg" onChange={e => setFormData({ ...formData, criticality: e.target.value })} defaultValue="MEDIUM">
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
            <option value="INFORMATIONAL">Informational</option>
          </select>
          <div className="flex space-x-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create Device</button>
          </div>
        </form>
      </div>
    </div>
  );
}
