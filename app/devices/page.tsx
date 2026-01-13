'use client';

import { Header } from '../../components/layout/Header';
import React, { useState, useEffect } from 'react';
import { apiGet, apiDelete } from '../../lib/api';
import { Device, ApiResponse } from '../../types';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');

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
        setError('Failed to load devices');
      }
    } catch (err: any) {
      setError(err.message || 'Error loading devices');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;

    try {
      const response: any = await apiDelete(`/api/devices/${id}`);
      if (response.success) {
        toast.success('Device deleted successfully');
        loadDevices();
      } else {
        toast.error(response.error || 'Failed to delete device');
      }
    } catch (err: any) {
      toast.error('Error deleting device');
    }
  };

  const filteredDevices = devices.filter(device => {
    const matchesSearch = device.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         device.serialNumber?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || device.type === filterType;
    return matchesSearch && matchesType;
  });

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-100 text-green-800 border-green-200';
      case 'INACTIVE': return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'MAINTENANCE': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'DECOMMISSIONED': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Device Inventory</h1>
            <p className="mt-2 text-gray-600">Manage and track all physical and virtual assets</p>
          </div>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold shadow-sm transition-all">
            + Add New Device
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input 
              type="text" 
              placeholder="Search by name or serial..." 
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select 
            className="px-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">All Device Types</option>
            <option value="PHYSICAL_SERVER">Physical Servers</option>
            <option value="VIRTUAL_MACHINE">Virtual Machines</option>
            <option value="SWITCH">Switches</option>
            <option value="ROUTER">Routers</option>
            <option value="FIREWALL">Firewalls</option>
            <option value="STORAGE">Storage</option>
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
            {error}
            <button onClick={loadDevices} className="ml-4 font-semibold underline">Retry</button>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                    <th className="px-6 py-4 font-semibold">Device Name</th>
                    <th className="px-6 py-4 font-semibold">Type</th>
                    <th className="px-6 py-4 font-semibold">Status</th>
                    <th className="px-6 py-4 font-semibold">Criticality</th>
                    <th className="px-6 py-4 font-semibold">Model / Vendor</th>
                    <th className="px-6 py-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {filteredDevices.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                        No devices found matching your criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredDevices.map((device) => (
                      <tr key={device.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-bold text-gray-900">{device.name}</div>
                          <div className="text-xs text-gray-400 font-mono">{device.serialNumber || 'No Serial'}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-gray-600">{device.type.replace('_', ' ')}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${getStatusBadgeClass(device.status)}`}>
                            {device.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`font-medium ${
                            device.criticality === 'CRITICAL' ? 'text-red-600' : 
                            device.criticality === 'HIGH' ? 'text-orange-600' : 
                            'text-gray-600'
                          }`}>
                            {device.criticality}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-500">
                          {device.vendor} {device.model}
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <button className="text-blue-600 hover:text-blue-800 font-semibold transition-colors">Edit</button>
                          <button 
                            onClick={() => handleDelete(device.id, device.name)}
                            className="text-red-600 hover:text-red-800 font-semibold transition-colors"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <ToastContainer position="bottom-right" />
      </main>
    </div>
  );
}
