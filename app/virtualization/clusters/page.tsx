'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  RefreshCw,
  Server,
  Cpu,
  HardDrive,
  Layers,
  AlertTriangle,
  Download,
} from 'lucide-react';

interface Cluster {
  id: string;
  name: string;
  hostCount: number;
  effectiveHosts: number;
  totalCpu: number;
  cpuCores: number;
  totalMemoryGB: number;
}

export default function ClustersPage() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClusters = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/integrations/vmware?type=clusters');
      const json = await res.json();
      
      if (json.error) {
        setError(json.error);
        return;
      }
      
      setClusters(json.clusters || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClusters();
    const interval = setInterval(fetchClusters, 60000);
    return () => clearInterval(interval);
  }, []);

  // Export CSV
  const exportCSV = () => {
    const headers = ['Ad', 'Host Sayisi', 'Aktif Host', 'CPU Cores', 'Bellek (GB)'];
    const rows = clusters.map(c => [
      c.name,
      c.hostCount,
      c.effectiveHosts,
      c.cpuCores,
      c.totalMemoryGB,
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clusters_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Summary
  const totalHosts = clusters.reduce((sum, c) => sum + (c.hostCount || 0), 0);
  const totalCpuCores = clusters.reduce((sum, c) => sum + (c.cpuCores || 0), 0);
  const totalMemoryTB = clusters.reduce((sum, c) => sum + (c.totalMemoryGB || 0), 0) / 1024;

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              <span>vCenter baglantisi basarisiz: {error}</span>
            </div>
            <Button onClick={fetchClusters} className="mt-4" variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Tekrar Dene
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cluster</h1>
          <p className="text-muted-foreground">
            vCenter uzerindeki cluster yapilari
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={exportCSV} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            CSV
          </Button>
          <Button onClick={fetchClusters} disabled={loading} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Toplam Cluster</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clusters.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Toplam Host</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalHosts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Toplam CPU</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCpuCores}</div>
            <p className="text-xs text-muted-foreground">CPU cekirdegi</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Toplam Bellek</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMemoryTB.toFixed(1)} TB</div>
          </CardContent>
        </Card>
      </div>

      {/* Cluster Table */}
      <Card>
        <CardContent className="pt-6">
          {loading && clusters.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cluster Adi</TableHead>
                  <TableHead className="text-center">Host Sayisi</TableHead>
                  <TableHead className="text-center">Aktif Host</TableHead>
                  <TableHead className="text-center">CPU Cores</TableHead>
                  <TableHead className="text-center">Bellek</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clusters.map((cluster) => (
                  <TableRow key={cluster.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{cluster.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className="bg-blue-100 text-blue-800">
                        {cluster.hostCount} Host
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {cluster.effectiveHosts === cluster.hostCount ? (
                        <Badge className="bg-green-100 text-green-800">
                          {cluster.effectiveHosts} Aktif
                        </Badge>
                      ) : (
                        <Badge className="bg-yellow-100 text-yellow-800">
                          {cluster.effectiveHosts} / {cluster.hostCount} Aktif
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {cluster.cpuCores} Core
                    </TableCell>
                    <TableCell className="text-center">
                      {cluster.totalMemoryGB >= 1024 
                        ? `${(cluster.totalMemoryGB / 1024).toFixed(1)} TB` 
                        : `${cluster.totalMemoryGB} GB`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {clusters.length === 0 && !loading && (
            <p className="text-center text-muted-foreground py-8">
              Cluster bulunamadi
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
