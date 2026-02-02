'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Server, Cpu, HardDrive, RefreshCw, Power, MoreHorizontal } from 'lucide-react';

interface Host {
  id: string;
  name: string;
  cluster: string;
  ip: string;
  cpuCores: number;
  usedCpu: number;
  ramTotal: number;
  usedRam: number;
  vmCount: number;
  status: 'online' | 'offline' | 'maintenance';
}

export default function HostsPage() {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTimeout(() => {
      setHosts([
        {
          id: '1',
          name: 'ESX-HOST-01',
          cluster: 'PROD-CLUSTER-01',
          ip: '10.0.1.11',
          cpuCores: 32,
          usedCpu: 24,
          ramTotal: 128,
          usedRam: 96,
          vmCount: 12,
          status: 'online',
        },
        {
          id: '2',
          name: 'ESX-HOST-02',
          cluster: 'PROD-CLUSTER-01',
          ip: '10.0.1.12',
          cpuCores: 32,
          usedCpu: 28,
          ramTotal: 128,
          usedRam: 112,
          vmCount: 14,
          status: 'online',
        },
        {
          id: '3',
          name: 'ESX-HOST-03',
          cluster: 'PROD-CLUSTER-01',
          ip: '10.0.1.13',
          cpuCores: 32,
          usedCpu: 18,
          ramTotal: 128,
          usedRam: 80,
          vmCount: 10,
          status: 'maintenance',
        },
        {
          id: '4',
          name: 'ESX-HOST-04',
          cluster: 'PROD-CLUSTER-01',
          ip: '10.0.1.14',
          cpuCores: 32,
          usedCpu: 22,
          ramTotal: 128,
          usedRam: 96,
          vmCount: 12,
          status: 'online',
        },
        {
          id: '5',
          name: 'ESX-HOST-05',
          cluster: 'PROD-CLUSTER-02',
          ip: '10.0.2.11',
          cpuCores: 48,
          usedCpu: 36,
          ramTotal: 256,
          usedRam: 192,
          vmCount: 16,
          status: 'online',
        },
      ]);
      setLoading(false);
    }, 500);
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'online': return <Badge variant="success">Çevrimiçi</Badge>;
      case 'offline': return <Badge variant="destructive">Çevrimdışı</Badge>;
      case 'maintenance': return <Badge variant="warning">Bakımda</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Hosts</h1>
          <p className="text-muted-foreground">ESXi/Proxmox host yönetimi</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button>
            <Power className="h-4 w-4 mr-2" />
            Host Ekle
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-500/20">
                <Server className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Çevrimiçi</p>
                <p className="text-2xl font-bold">{hosts.filter(h => h.status === 'online').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-orange-500/20">
                <Power className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Bakımda</p>
                <p className="text-2xl font-bold">{hosts.filter(h => h.status === 'maintenance').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-500/20">
                <Cpu className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Toplam CPU</p>
                <p className="text-2xl font-bold">{hosts.reduce((acc, h) => acc + h.cpuCores, 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-purple-500/20">
                <HardDrive className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Toplam RAM</p>
                <p className="text-2xl font-bold">{hosts.reduce((acc, h) => acc + h.ramTotal, 0)} GB</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Hosts List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {loading ? (
          <div className="col-span-full flex justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          hosts.map((host) => (
            <Card key={host.id} className="hover:border-primary/50 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <CardTitle className="text-lg">{host.name}</CardTitle>
                      <CardDescription>{host.cluster}</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(host.status)}
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">IP: {host.ip}</span>
                  <span className="text-muted-foreground">|</span>
                  <span className="text-muted-foreground">{host.vmCount} VM</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* CPU */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-muted-foreground">CPU</span>
                      <span className="font-medium">{Math.round((host.usedCpu / host.cpuCores) * 100)}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500"
                        style={{ width: `${(host.usedCpu / host.cpuCores) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* RAM */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-muted-foreground">RAM</span>
                      <span className="font-medium">{Math.round((host.usedRam / host.ramTotal) * 100)}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500"
                        style={{ width: `${(host.usedRam / host.ramTotal) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1">
                    VM Listesi
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1">
                    Performans
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
