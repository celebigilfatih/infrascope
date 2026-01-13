'use client';

import { Header } from '../../components/layout/Header';
import React, { useState, useEffect } from 'react';
import { apiGet, apiDelete } from '../../lib/api';
import { Service, ApiResponse } from '../../types';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

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
        setError('Failed to load services');
      }
    } catch (err: any) {
      setError(err.message || 'Error loading services');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;

    try {
      const response: any = await apiDelete(`/api/services/${id}`);
      if (response.success) {
        toast.success('Service deleted successfully');
        loadServices();
      } else {
        toast.error(response.error || 'Failed to delete service');
      }
    } catch (err: any) {
      toast.error('Error deleting service');
    }
  };

  const filteredServices = services.filter(service => {
    return service.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
           service.displayName?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'RUNNING': return 'bg-green-100 text-green-800';
      case 'STOPPED': return 'bg-red-100 text-red-800';
      case 'DEGRADED': return 'bg-amber-100 text-amber-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Services & Applications</h1>
            <p className="mt-2 text-gray-600">Monitor and manage network services and software stacks</p>
          </div>
          <button className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold shadow-sm transition-all">
            + Register Service
          </button>
        </div>

        {/* Search */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 flex gap-4">
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input 
              type="text" 
              placeholder="Search services by name..." 
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
            {error}
            <button onClick={loadServices} className="ml-4 font-semibold underline">Retry</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredServices.length === 0 ? (
              <div className="col-span-full py-12 text-center text-gray-500 bg-white rounded-xl border border-gray-100 shadow-sm">
                No services registered yet.
              </div>
            ) : (
              filteredServices.map((service) => (
                <div key={service.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-gray-900 text-lg">{service.displayName || service.name}</h3>
                      <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mt-0.5">{service.type.replace('_', ' ')}</p>
                    </div>
                    <span className={`px-2 py-1 rounded text-[10px] font-bold ${getStatusColor(service.status)}`}>
                      {service.status}
                    </span>
                  </div>
                  
                  <div className="space-y-3 mb-6">
                    <div className="flex items-center text-sm text-gray-600">
                      <span className="w-20 font-medium">Port:</span>
                      <span className="bg-gray-50 px-2 py-0.5 rounded border border-gray-100 font-mono text-xs">{service.port} / {service.protocol}</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                      <span className="w-20 font-medium">Criticality:</span>
                      <span className={`${
                        service.criticality === 'CRITICAL' ? 'text-red-600 font-bold' : 
                        service.criticality === 'HIGH' ? 'text-orange-600' : 'text-gray-600'
                      }`}>{service.criticality}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-4 border-t border-gray-50">
                    <button className="text-purple-600 hover:text-purple-800 text-sm font-bold transition-colors">Details</button>
                    <button 
                      onClick={() => handleDelete(service.id, service.name)}
                      className="text-gray-400 hover:text-red-600 text-sm transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
        <ToastContainer position="bottom-right" />
      </main>
    </div>
  );
}
