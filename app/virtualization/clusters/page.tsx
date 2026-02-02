'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Layers, Server, HardDrive, RefreshCw, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Cluster {
  id: string;
  name: string;
  hostCount: number;
  vmCount: number;
  totalCpu: number;
  usedCpu: number;
  totalRam: number;
  usedRam: number;
  status: 'healthy' | 'warning' | 'critical';
}

export default function ClustersPage() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTimeout(() => {
      setClusters([
        {
          id: '1',
          name: 'PROD-CLUSTER-01',
          hostCount: 4,
          vmCount: 48,
          totalCpu: 128,
          usedCpu: 92,
          totalRam: 512,
          usedRam: 384,
          status: 'healthy',
        },
        {
          id: '2',
          name: 'PROD-CLUSTER-02',
          hostCount: 3,
          vmCount: 32,
          totalCpu: 96,
          usedCpu: 78,
          totalRam: 384,
          usedRam: 320,
          status: 'warning',
        },
        {
          id: '3',
          name: 'DEV-CLUSTER-01',
          hostCount: 2,
          vmCount: 16,
          totalCpu: 32,
          usedCpu: 18,
          totalRam: 128,
          usedRam: 64,
          status: 'healthy',
        },
      ]);
      setLoading(false);
    }, 500);
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy': return <Badge variant="success">Sağlıklı</Badge>;
      case 'warning': return <Badge className="bg-orange-500">Uyarı</Badge>;
      case 'critical': return <Badge variant="destructive">Kritik</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clusters</h1>
          <p className="text-muted-foreground">VMware/Proxmox cluster yönetimi</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Yeni Cluster Ekle
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-500/20">
                <Layers className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Toplam Cluster</p>
                <p className="text-2xl font-bold">{clusters.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-500/20">
                <Server className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Toplam Host</p>
                <p className="text-2xl font-bold">{clusters.reduce((acc, c) => acc + c.hostCount, 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-purple-500/20">
                <Layers className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Toplam VM</p>
                <p className="text-2xl font-bold">{clusters.reduce((acc, c) => acc + c.vmCount, 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-orange-500/20">
                <HardDrive className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Toplam CPU</p>
                <p className="text-2xl font-bold">{clusters.reduce((acc, c) => acc + c.totalCpu, 0)} Cores</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Clusters List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {loading ? (
          <div className="col-span-full flex justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          clusters.map((cluster) => (
            <Card key={cluster.id} className="hover:border-primary/50 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">{cluster.name}</CardTitle>
                      {getStatusBadge(cluster.status)}
                    </div>
                    <CardDescription>
                      {cluster.hostCount} host, {cluster.vmCount} VM
                    </CardDescription>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* CPU Usage */}
                <div>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-muted-foreground">CPU Kullanımı</span>
                    <span className="font-medium">{Math.round((cluster.usedCpu / cluster.totalCpu) * 100)}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn("h-full transition-all bg-blue-500")}
                      style={{ width: `${(cluster.usedCpu / cluster.totalCpu) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {cluster.usedCpu} / {cluster.totalCpu} Cores
                  </p>
                </div>

                {/* RAM Usage */}
                <div>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-muted-foreground">RAM Kullanımı</span>
                    <span className="font-medium">{Math.round((cluster.usedRam / cluster.totalRam) * 100)}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn("h-full transition-all bg-purple-500")}
                      style={{ width: `${(cluster.usedRam / cluster.totalRam) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {cluster.usedRam} / {cluster.totalRam} GB
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1">
                    Host Listesi
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1">
                    VM Listesi
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
