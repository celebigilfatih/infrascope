'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HardDrive, RefreshCw, Plus, MoreHorizontal, Database } from 'lucide-react';

interface Datastore {
  id: string;
  name: string;
  type: string;
  totalGB: number;
  usedGB: number;
  freeGB: number;
  vmCount: number;
  status: 'healthy' | 'warning' | 'critical';
}

export default function DatastoresPage() {
  const [datastores, setDatastores] = useState<Datastore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTimeout(() => {
      setDatastores([
        {
          id: '1',
          name: 'DS-PROD-01',
          type: 'VMFS',
          totalGB: 2048,
          usedGB: 1536,
          freeGB: 512,
          vmCount: 24,
          status: 'healthy',
        },
        {
          id: '2',
          name: 'DS-PROD-02',
          type: 'VMFS',
          totalGB: 4096,
          usedGB: 3584,
          freeGB: 512,
          vmCount: 32,
          status: 'warning',
        },
        {
          id: '3',
          name: 'DS-DEV-01',
          type: 'NFS',
          totalGB: 1024,
          usedGB: 512,
          freeGB: 512,
          vmCount: 12,
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

  const getUsagePercent = (used: number, total: number) => Math.round((used / total) * 100);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Datastores</h1>
          <p className="text-muted-foreground">VMFS/NFS depolama yönetimi</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Datastore Ekle
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-500/20">
                <Database className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Toplam Datastore</p>
                <p className="text-2xl font-bold">{datastores.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-500/20">
                <HardDrive className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Toplam Kapasite</p>
                <p className="text-2xl font-bold">{Math.round(datastores.reduce((acc, d) => acc + d.totalGB, 0) / 1024)} TB</p>
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
                <p className="text-sm text-muted-foreground">Kullanılan</p>
                <p className="text-2xl font-bold">{Math.round(datastores.reduce((acc, d) => acc + d.usedGB, 0) / 1024)} TB</p>
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
                <p className="text-sm text-muted-foreground">Boş Alan</p>
                <p className="text-2xl font-bold">{Math.round(datastores.reduce((acc, d) => acc + d.freeGB, 0) / 1024)} TB</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Datastores List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {loading ? (
          <div className="col-span-full flex justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          datastores.map((ds) => (
            <Card key={ds.id} className="hover:border-primary/50 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <CardTitle className="text-lg">{ds.name}</CardTitle>
                      <CardDescription>{ds.type} - {ds.vmCount} VM</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(ds.status)}
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Capacity Bar */}
                <div>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Kullanım</span>
                    <span className="font-medium">{getUsagePercent(ds.usedGB, ds.totalGB)}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full transition-all bg-blue-500"
                      style={{ width: `${getUsagePercent(ds.usedGB, ds.totalGB)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {ds.usedGB} GB / {ds.totalGB} GB
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="text-center p-2 bg-muted rounded">
                    <p className="text-muted-foreground">Toplam</p>
                    <p className="font-medium">{ds.totalGB} GB</p>
                  </div>
                  <div className="text-center p-2 bg-muted rounded">
                    <p className="text-muted-foreground">Kullanılan</p>
                    <p className="font-medium">{ds.usedGB} GB</p>
                  </div>
                  <div className="text-center p-2 bg-muted rounded">
                    <p className="text-muted-foreground">Boş</p>
                    <p className="font-medium">{ds.freeGB} GB</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1">
                    VM Listesi
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1">
                    Detaylar
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
