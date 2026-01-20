'use client';

import { Header } from '../../components/layout/Header';
import React, { useState, useEffect } from 'react';
import { apiGet, apiDelete } from '../../lib/api';
import { Service, ApiResponse } from '../../types';
import { toast } from 'react-toastify';

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadServices();
  }, []);

  const loadServices = async () => {
    try {
      setLoading(true);
      setError(null);
      const response: ApiResponse<Service[]> = await apiGet('/api/services');
      if (response.success) {
        setServices(response.data || []);
      } else {
        setError('Servisler yüklenemedi');
      }
    } catch (err: any) {
      setError(err.message || 'Servisler yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`${name} servisini silmek istediğinizden emin misiniz?`)) return;

    try {
      const response: any = await apiDelete(`/api/services/${id}`);
      if (response.success) {
        toast.success('Servis başarıyla silindi');
        loadServices();
      } else {
        toast.error(response.error || 'Servis silinemedi');
      }
    } catch (err: any) {
      toast.error('Servis silinirken hata oluştu');
    }
  };

  const filteredServices = services.filter(service => {
    return service.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
           service.displayName?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'RUNNING': return 'bg-emerald-900/40 text-emerald-400 border-emerald-800/50';
      case 'STOPPED': return 'bg-red-900/40 text-red-400 border-red-800/50';
      case 'DEGRADED': return 'bg-amber-900/40 text-amber-400 border-amber-800/50';
      default: return 'bg-slate-900/40 text-slate-400 border-slate-800/50';
    }
  };

  return (
    <div className="min-h-screen bg-[#000033]">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Servisler ve Uygulamalar</h1>
            <p className="mt-2 text-blue-300">Ağ servislerini ve yazılım yığınlarını izleyin ve yönetin</p>
          </div>
          <button className="px-6 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-500 font-bold shadow-lg shadow-purple-900/20 transition-all">
            + Servis Kaydet
          </button>
        </div>

        {/* Search */}
        <div className="bg-[#000044] p-4 rounded-xl shadow-lg border border-blue-800 mb-6 flex gap-4">
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400">🔍</span>
            <input 
              type="text" 
              placeholder="Servisleri isme göre ara..." 
              className="w-full pl-10 pr-4 py-2 bg-blue-950 border border-blue-800 rounded-lg text-white placeholder-blue-500 focus:ring-2 focus:ring-purple-600 outline-none transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
          </div>
        ) : error ? (
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-red-400">
            {error}
            <button onClick={loadServices} className="ml-4 font-bold underline hover:text-red-300 transition-colors">Tekrar Dene</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredServices.length === 0 ? (
              <div className="col-span-full py-12 text-center text-blue-400 bg-[#000044] rounded-xl border border-blue-800 shadow-xl">
                Henüz kayıtlı servis yok.
              </div>
            ) : (
              filteredServices.map((service) => (
                <div key={service.id} className="bg-[#000044] rounded-xl shadow-xl border border-blue-800 p-6 hover:border-blue-500 transition-all group">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-white text-lg group-hover:text-purple-400 transition-colors">{service.displayName || service.name}</h3>
                      <p className="text-xs text-blue-400 uppercase tracking-widest font-black mt-1">{service.type.replace(/_/g, ' ')}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border ${getStatusColor(service.status)}`}>
                      {service.status === 'RUNNING' ? 'ÇALIŞIYOR' : 
                       service.status === 'STOPPED' ? 'DURDURULDU' : 
                       service.status === 'DEGRADED' ? 'SORUNLU' : service.status}
                    </span>
                  </div>
                  
                  <div className="space-y-4 mb-8">
                    <div className="flex items-center text-sm">
                      <span className="w-24 text-blue-400 font-bold uppercase text-xs tracking-wider">Port:</span>
                      <span className="bg-blue-950 px-3 py-1 rounded-lg border border-blue-800 font-mono text-xs text-white shadow-inner">{service.port} / {service.protocol}</span>
                    </div>
                    <div className="flex items-center text-sm">
                      <span className="w-24 text-blue-400 font-bold uppercase text-xs tracking-wider">Kritiklik:</span>
                      <span className={`text-xs font-black uppercase tracking-tight ${
                        service.criticality === 'CRITICAL' ? 'text-red-400' : 
                        service.criticality === 'HIGH' ? 'text-amber-400' : 'text-blue-200'
                      }`}>{service.criticality}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-4 border-t border-blue-800/50">
                    <button className="text-purple-400 hover:text-purple-300 text-sm font-bold transition-colors">Detaylar</button>
                    <button 
                      onClick={() => handleDelete(service.id, service.name)}
                      className="text-blue-500 hover:text-red-400 text-sm font-medium transition-colors"
                    >
                      Sil
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}
