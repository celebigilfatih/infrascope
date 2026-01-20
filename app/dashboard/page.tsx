'use client';

import { Header } from '../../components/layout/Header';
import React, { useState, useEffect } from 'react';
import { apiGet } from '../../lib/api';
import { Device, Service, ApiResponse } from '../../types';
import Link from 'next/link';

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalDevices: 0,
    activeDevices: 0,
    totalServices: 0,
    runningServices: 0,
    totalBuildings: 0,
    criticalIssues: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [devicesRes, servicesRes, buildingsRes]: [ApiResponse<Device[]>, ApiResponse<Service[]>, ApiResponse<any[]>] = await Promise.all([
        apiGet('/api/devices'),
        apiGet('/api/services'),
        apiGet('/api/buildings'),
      ]);

      if (devicesRes.success && servicesRes.success && buildingsRes.success) {
        const devices = devicesRes.data || [];
        const services = servicesRes.data || [];
        const buildings = buildingsRes.data || [];

        setStats({
          totalDevices: devices.length,
          activeDevices: devices.filter(d => d.status === 'ACTIVE').length,
          totalServices: services.length,
          runningServices: services.filter(s => s.status === 'RUNNING').length,
          totalBuildings: buildings.length,
          criticalIssues: devices.filter(d => d.criticality === 'CRITICAL' && d.status !== 'ACTIVE').length,
        });
      } else {
        setError('Panel istatistikleri yüklenemedi');
      }
    } catch (err: any) {
      setError(err.message || 'Veri yüklenirken bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { label: 'Toplam Cihaz', value: stats.totalDevices, subValue: `${stats.activeDevices} Aktif`, icon: '🖥️', color: 'bg-blue-600', link: '/devices' },
    { label: 'Servisler', value: stats.totalServices, subValue: `${stats.runningServices} Çalışıyor`, icon: '⚙️', color: 'bg-purple-600', link: '/services' },
    { label: 'Binalar', value: stats.totalBuildings, subValue: 'Tüm organizasyonlarda', icon: '🏢', color: 'bg-emerald-600', link: '/locations' },
    { label: 'Kritik Sorunlar', value: stats.criticalIssues, subValue: 'Müdahale gerekiyor', icon: '⚠️', color: 'bg-red-600', link: '/network' },
  ];

  return (
    <div className="min-h-screen bg-[#000033]">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">Altyapı Paneli</h1>
          <p className="mt-2 text-blue-300">Kurumsal altyapınızın gerçek zamanlı görünümü</p>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
          </div>
        ) : error ? (
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-red-400">
            {error}
            <button onClick={loadDashboardData} className="ml-4 font-bold underline hover:text-red-300 transition-colors">Tekrar Dene</button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
              {statCards.map((card) => (
                <Link href={card.link} key={card.label} className="bg-[#000044] rounded-xl shadow-lg border border-blue-800 p-6 hover:border-blue-500 transition-all group">
                  <div className="flex items-center justify-between mb-4">
                    <div className={`${card.color} w-12 h-12 rounded-lg flex items-center justify-center text-2xl shadow-lg group-hover:scale-110 transition-transform`}>
                      {card.icon}
                    </div>
                    <span className="text-3xl font-black text-white">{card.value}</span>
                  </div>
                  <h3 className="text-blue-400 font-bold uppercase tracking-wider text-xs">{card.label}</h3>
                  <p className="text-sm text-blue-200 mt-1 font-medium">{card.subValue}</p>
                </Link>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-[#000044] rounded-xl shadow-lg border border-blue-800 overflow-hidden">
                <div className="px-6 py-4 border-b border-blue-800 flex items-center justify-between bg-blue-900/20">
                  <h2 className="font-bold text-white">Son Altyapı Hareketleri</h2>
                  <button className="text-blue-400 text-sm font-bold hover:text-blue-300 transition-colors">Tümünü Gör</button>
                </div>
                <div className="divide-y divide-blue-800/50">
                  {[
                    { type: 'Cihaz Eklendi', name: 'CORE-SW-01', time: '2 saat önce', status: 'Başarılı' },
                    { type: 'Servis Uyarısı', name: 'LDAP-Primary', time: '5 saat önce', status: 'Uyarı' },
                    { type: 'Bağlantı Oluşturuldu', name: 'Bina A ↔ Bina B', time: '1 gün önce', status: 'Başarılı' },
                    { type: 'Bakım', name: 'DB-Cluster-01', time: '2 gün önce', status: 'Planlandı' },
                  ].map((activity, i) => (
                    <div key={i} className="px-6 py-4 flex items-center justify-between hover:bg-blue-800/20 transition-colors">
                      <div className="flex items-center space-x-4">
                        <div className={`w-2 h-2 rounded-full ${activity.status === 'Başarılı' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : activity.status === 'Uyarı' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]' : 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]'}`}></div>
                        <div>
                          <p className="text-sm font-bold text-white">{activity.type}: {activity.name}</p>
                          <p className="text-xs text-blue-400 font-medium">{activity.time}</p>
                        </div>
                      </div>
                      <span className={`text-[10px] px-2 py-1 rounded-md font-black uppercase tracking-wider ${
                        activity.status === 'Başarılı' ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-800/50' : 
                        activity.status === 'Uyarı' ? 'bg-amber-900/40 text-amber-400 border border-amber-800/50' : 
                        'bg-blue-900/40 text-blue-400 border border-blue-800/50'
                      }`}>
                        {activity.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-8">
                <div className="bg-[#000044] rounded-xl shadow-lg border border-blue-800 p-6">
                  <h2 className="font-bold text-white mb-6 border-b border-blue-800 pb-2">Hızlı İşlemler</h2>
                  <div className="grid grid-cols-1 gap-4">
                    <Link href="/devices" className="flex items-center space-x-4 p-4 rounded-xl border border-blue-800 bg-blue-900/20 hover:bg-blue-800/40 hover:border-blue-500 transition-all group">
                      <span className="text-2xl group-hover:scale-110 transition-transform">➕</span>
                      <span className="text-sm font-bold text-blue-100">Yeni Cihaz Ekle</span>
                    </Link>
                    <Link href="/network" className="flex items-center space-x-4 p-4 rounded-xl border border-blue-800 bg-purple-900/20 hover:bg-purple-800/40 hover:border-purple-500 transition-all group">
                      <span className="text-2xl group-hover:scale-110 transition-transform">🔗</span>
                      <span className="text-sm font-bold text-blue-100">Bağlantı Oluştur</span>
                    </Link>
                    <Link href="/locations" className="flex items-center space-x-4 p-4 rounded-xl border border-blue-800 bg-emerald-900/20 hover:bg-emerald-800/40 hover:border-emerald-500 transition-all group">
                      <span className="text-2xl group-hover:scale-110 transition-transform">📍</span>
                      <span className="text-sm font-bold text-blue-100">Konumları Yönet</span>
                    </Link>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-blue-700 to-indigo-900 rounded-xl shadow-2xl p-6 text-white border border-blue-600/30">
                  <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    Sistem Sağlığı
                  </h2>
                  <div className="flex items-center space-x-6 mb-6">
                    <div className="text-5xl drop-shadow-lg">🛡️</div>
                    <div>
                      <p className="text-4xl font-black tracking-tighter text-white">98.2%</p>
                      <p className="text-blue-200 text-xs font-bold uppercase tracking-widest">Genel Çalışma Süresi</p>
                    </div>
                  </div>
                  <div className="w-full bg-black/30 rounded-full h-3 p-0.5 border border-white/10 shadow-inner">
                    <div className="bg-gradient-to-r from-emerald-500 to-blue-400 h-2 rounded-full shadow-[0_0_10px_rgba(52,211,153,0.5)]" style={{ width: '98.2%' }}></div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
