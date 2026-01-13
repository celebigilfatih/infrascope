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
        setError('Failed to load dashboard statistics');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while loading data');
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { label: 'Total Devices', value: stats.totalDevices, subValue: `${stats.activeDevices} Active`, icon: '🖥️', color: 'bg-blue-500', link: '/devices' },
    { label: 'Services', value: stats.totalServices, subValue: `${stats.runningServices} Running`, icon: '⚙️', color: 'bg-purple-500', link: '/services' },
    { label: 'Buildings', value: stats.totalBuildings, subValue: 'Across all orgs', icon: '🏢', color: 'bg-green-500', link: '/locations' },
    { label: 'Critical Issues', value: stats.criticalIssues, subValue: 'Requires attention', icon: '⚠️', color: 'bg-red-500', link: '/network' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Infrastructure Dashboard</h1>
          <p className="mt-2 text-gray-600">Real-time overview of your enterprise infrastructure</p>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
            {error}
            <button onClick={loadDashboardData} className="ml-4 font-semibold underline">Retry</button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
              {statCards.map((card) => (
                <Link href={card.link} key={card.label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className={`${card.color} w-12 h-12 rounded-lg flex items-center justify-center text-2xl shadow-inner`}>
                      {card.icon}
                    </div>
                    <span className="text-3xl font-bold text-gray-900">{card.value}</span>
                  </div>
                  <h3 className="text-gray-500 font-medium">{card.label}</h3>
                  <p className="text-sm text-gray-400 mt-1">{card.subValue}</p>
                </Link>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="font-bold text-gray-900">Recent Infrastructure Activity</h2>
                  <button className="text-blue-600 text-sm font-semibold hover:underline">View All</button>
                </div>
                <div className="divide-y divide-gray-50">
                  {[
                    { type: 'Device Added', name: 'CORE-SW-01', time: '2 hours ago', status: 'Success' },
                    { type: 'Service Alert', name: 'LDAP-Primary', time: '5 hours ago', status: 'Warning' },
                    { type: 'Connection Created', name: 'Building A ↔ Building B', time: '1 day ago', status: 'Success' },
                    { type: 'Maintenance', name: 'DB-Cluster-01', time: '2 days ago', status: 'Scheduled' },
                  ].map((activity, i) => (
                    <div key={i} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                      <div className="flex items-center space-x-4">
                        <div className={`w-2 h-2 rounded-full ${activity.status === 'Success' ? 'bg-green-500' : activity.status === 'Warning' ? 'bg-amber-500' : 'bg-blue-500'}`}></div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">{activity.type}: {activity.name}</p>
                          <p className="text-xs text-gray-500">{activity.time}</p>
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        activity.status === 'Success' ? 'bg-green-100 text-green-700' : 
                        activity.status === 'Warning' ? 'bg-amber-100 text-amber-700' : 
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {activity.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-8">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <h2 className="font-bold text-gray-900 mb-4">Quick Actions</h2>
                  <div className="grid grid-cols-1 gap-3">
                    <Link href="/devices" className="flex items-center space-x-3 p-3 rounded-lg border border-gray-100 hover:bg-blue-50 hover:border-blue-200 transition-all group">
                      <span className="text-xl">➕</span>
                      <span className="text-sm font-semibold text-gray-700 group-hover:text-blue-700">Add New Device</span>
                    </Link>
                    <Link href="/network" className="flex items-center space-x-3 p-3 rounded-lg border border-gray-100 hover:bg-purple-50 hover:border-purple-200 transition-all group">
                      <span className="text-xl">🔗</span>
                      <span className="text-sm font-semibold text-gray-700 group-hover:text-purple-700">Create Connection</span>
                    </Link>
                    <Link href="/locations" className="flex items-center space-x-3 p-3 rounded-lg border border-gray-100 hover:bg-green-50 hover:border-green-200 transition-all group">
                      <span className="text-xl">📍</span>
                      <span className="text-sm font-semibold text-gray-700 group-hover:text-green-700">Manage Locations</span>
                    </Link>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl shadow-lg p-6 text-white">
                  <h2 className="font-bold text-lg mb-2">System Health</h2>
                  <div className="flex items-center space-x-4 mb-4">
                    <div className="text-4xl">🛡️</div>
                    <div>
                      <p className="text-3xl font-bold">98.2%</p>
                      <p className="text-blue-100 text-sm">Overall Uptime</p>
                    </div>
                  </div>
                  <div className="w-full bg-blue-400 bg-opacity-30 rounded-full h-2">
                    <div className="bg-white h-2 rounded-full" style={{ width: '98.2%' }}></div>
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
