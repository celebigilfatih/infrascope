'use client';

import { Header } from '../../components/layout/Header';
import React, { useState, useEffect } from 'react';
import { apiGet, apiDelete } from '../../lib/api';
import { Device, ApiResponse } from '../../types';
import { toast } from 'react-toastify';

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
        setError('Cihazlar yüklenemedi');
      }
    } catch (err: any) {
      setError(err.message || 'Cihazlar yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`${name} cihazını silmek istediğinizden emin misiniz?`)) return;

    try {
      const response: any = await apiDelete(`/api/devices/${id}`);
      if (response.success) {
        toast.success('Cihaz başarıyla silindi');
        loadDevices();
      } else {
        toast.error(response.error || 'Cihaz silinemedi');
      }
    } catch (err: any) {
      toast.error('Cihaz silinirken hata oluştu');
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
      case 'ACTIVE': return 'bg-emerald-900/40 text-emerald-400 border-emerald-800/50';
      case 'INACTIVE': return 'bg-slate-900/40 text-slate-400 border-slate-800/50';
      case 'MAINTENANCE': return 'bg-amber-900/40 text-amber-400 border-amber-800/50';
      case 'DECOMMISSIONED': return 'bg-red-900/40 text-red-400 border-red-800/50';
      default: return 'bg-blue-900/40 text-blue-400 border-blue-800/50';
    }
  };

  return (
    <div className="min-h-screen bg-[#000033]">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Cihaz Envanteri</h1>
            <p className="mt-2 text-blue-300">Tüm fiziksel ve sanal varlıkları yönetin ve izleyin</p>
          </div>
          <button className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 font-bold shadow-lg shadow-blue-900/20 transition-all">
            + Yeni Cihaz Ekle
          </button>
        </div>

        {/* Filters */}
        <div className="bg-[#000044] p-4 rounded-xl shadow-lg border border-blue-800 mb-6 flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400">🔍</span>
            <input 
              type="text" 
              placeholder="İsim veya seri no ile ara..." 
              className="w-full pl-10 pr-4 py-2 bg-blue-950 border border-blue-800 rounded-lg text-white placeholder-blue-500 focus:ring-2 focus:ring-blue-600 outline-none transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select 
            className="px-4 py-2 bg-blue-950 border border-blue-800 text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-600 transition-all"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">Tüm Cihaz Tipleri</option>
            <option value="PHYSICAL_SERVER">Fiziksel Sunucular</option>
            <option value="VIRTUAL_MACHINE">Sanal Makineler</option>
            <option value="SWITCH">Switchler</option>
            <option value="ROUTER">Routerlar</option>
            <option value="FIREWALL">Güvenlik Duvarları</option>
            <option value="STORAGE">Depolama</option>
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
          </div>
        ) : error ? (
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-red-400">
            {error}
            <button onClick={loadDevices} className="ml-4 font-bold underline hover:text-red-300 transition-colors">Tekrar Dene</button>
          </div>
        ) : (
          <div className="bg-[#000044] rounded-xl shadow-xl border border-blue-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-blue-900/30 text-blue-400 text-xs uppercase tracking-wider">
                    <th className="px-6 py-4 font-bold">Cihaz Adı</th>
                    <th className="px-6 py-4 font-bold">Tip</th>
                    <th className="px-6 py-4 font-bold">Durum</th>
                    <th className="px-6 py-4 font-bold">Kritiklik</th>
                    <th className="px-6 py-4 font-bold">Model / Üretici</th>
                    <th className="px-6 py-4 font-bold text-right">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-800/50 text-sm">
                  {filteredDevices.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-blue-400 font-medium">
                        Kriterlere uygun cihaz bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    filteredDevices.map((device) => (
                      <tr key={device.id} className="hover:bg-blue-800/20 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-bold text-white">{device.name}</div>
                          <div className="text-xs text-blue-400 font-mono tracking-tighter">{device.serialNumber || 'Seri No Yok'}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-blue-200 font-medium uppercase text-xs">{device.type.replace(/_/g, ' ')}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border ${getStatusBadgeClass(device.status)}`}>
                            {device.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`font-black text-xs uppercase tracking-tight ${
                            device.criticality === 'CRITICAL' ? 'text-red-400' : 
                            device.criticality === 'HIGH' ? 'text-amber-400' : 
                            'text-blue-300'
                          }`}>
                            {device.criticality}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-blue-200 font-medium">
                          {device.vendor} {device.model}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-3">
                            <button className="text-blue-400 hover:text-white font-bold transition-colors">Düzenle</button>
                            <button 
                              onClick={() => handleDelete(device.id, device.name)}
                              className="text-red-400 hover:text-red-300 font-bold transition-colors"
                            >
                              Sil
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
