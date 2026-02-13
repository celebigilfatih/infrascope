'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  RefreshCw,
  Server,
  Cpu,
  HardDrive,
  Search,
  Download,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from 'lucide-react';

interface Host {
  id: string;
  name: string;
  cluster: string;
  vendor: string;
  model: string;
  cpuCores: number;
  memoryGB: number;
  version: string;
  build: string;
  status: string;
  overallStatus: string;
}

export default function HostsPage() {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [clusterFilter, setClusterFilter] = useState<string>('all');

  const fetchHosts = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/integrations/vmware?type=hosts');
      const json = await res.json();
      
      if (json.error) {
        setError(json.error);
        return;
      }
      
      setHosts(json.hosts || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHosts();
    const interval = setInterval(fetchHosts, 30000);
    return () => clearInterval(interval);
  }, []);

  // Get unique clusters for filter
  const clusters = useMemo(() => {
    const unique = new Set(hosts.map(h => h.cluster));
    return Array.from(unique).sort();
  }, [hosts]);

  // Filter hosts
  const filteredHosts = useMemo(() => {
    return hosts.filter(host => {
      const matchesSearch = 
        host.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        host.cluster?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        host.vendor?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        host.model?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || host.status === statusFilter;
      const matchesCluster = clusterFilter === 'all' || host.cluster === clusterFilter;
      
      return matchesSearch && matchesStatus && matchesCluster;
    });
  }, [hosts, searchTerm, statusFilter, clusterFilter]);

  // Export CSV
  const exportCSV = () => {
    const headers = ['Ad', 'Cluster', 'Vendor', 'Model', 'CPU Cores', 'RAM (GB)', 'Version', 'Durum'];
    const rows = filteredHosts.map(h => [
      h.name,
      h.cluster,
      h.vendor,
      h.model,
      h.cpuCores,
      h.memoryGB,
      h.version,
      h.status,
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `esxi_hosts_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status: string) => {
    if (status === 'connected') {
      return (
        <Badge className="bg-green-100 text-green-800">
          <CheckCircle className="h-3 w-3 mr-1" />
          Cevrimici
        </Badge>
      );
    }
    return (
      <Badge className="bg-red-100 text-red-800">
        <XCircle className="h-3 w-3 mr-1" />
        Cevrimdisi
      </Badge>
    );
  };

  const getOverallBadge = (status: string) => {
    switch (status) {
      case 'green':
        return <Badge className="bg-green-100 text-green-800">Saglikli</Badge>;
      case 'yellow':
        return <Badge className="bg-yellow-100 text-yellow-800">Uyari</Badge>;
      case 'red':
        return <Badge className="bg-red-100 text-red-800">Kritik</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800">Bilinmiyor</Badge>;
    }
  };

  // Summary counts
  const hostsOnline = hosts.filter(h => h.status === 'connected').length;
  const hostsOffline = hosts.filter(h => h.status !== 'connected').length;
  const totalCpuCores = hosts.reduce((sum, h) => sum + (h.cpuCores || 0), 0);
  const totalMemoryTB = hosts.reduce((sum, h) => sum + (h.memoryGB || 0), 0) / 1024;

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              <span>vCenter baglantisi basarisiz: {error}</span>
            </div>
            <Button onClick={fetchHosts} className="mt-4" variant="outline">
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
          <h1 className="text-2xl font-bold">ESXi Hostlar</h1>
          <p className="text-muted-foreground">
            vCenter uzerindeki fiziksel sunucular
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={exportCSV} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            CSV
          </Button>
          <Button onClick={fetchHosts} disabled={loading} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Toplam Host</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{hosts.length}</div>
            <div className="flex gap-2 mt-1">
              <span className="text-xs text-green-600">{hostsOnline} Online</span>
              {hostsOffline > 0 && (
                <span className="text-xs text-red-600">{hostsOffline} Offline</span>
              )}
            </div>
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
            <p className="text-xs text-muted-foreground">RAM kapasitesi</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Cluster</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clusters.length}</div>
            <p className="text-xs text-muted-foreground">Farkli cluster</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Host adi, cluster, vendor veya model ile ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={clusterFilter} onValueChange={setClusterFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Cluster" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tum Cluster</SelectItem>
                {clusters.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Durum" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tum Durumlar</SelectItem>
                <SelectItem value="connected">Cevrimici</SelectItem>
                <SelectItem value="disconnected">Cevrimdisi</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Host Table */}
      <Card>
        <CardContent className="pt-6">
          {loading && hosts.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ad</TableHead>
                  <TableHead>Cluster</TableHead>
                  <TableHead>Vendor / Model</TableHead>
                  <TableHead>CPU</TableHead>
                  <TableHead>Bellek</TableHead>
                  <TableHead>ESXi Version</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>Saglik</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHosts.map((host) => (
                  <TableRow key={host.id}>
                    <TableCell className="font-medium">{host.name}</TableCell>
                    <TableCell>{host.cluster}</TableCell>
                    <TableCell>
                      <div className="text-sm">{host.vendor === 'Unknown' ? <span className="text-muted-foreground">Veri yok</span> : host.vendor}</div>
                      <div className="text-xs text-muted-foreground">{host.model === 'Unknown' ? '-' : host.model}</div>
                    </TableCell>
                    <TableCell>{host.cpuCores === 0 ? <span className="text-muted-foreground">Veri yok</span> : `${host.cpuCores} Core`}</TableCell>
                    <TableCell>
                      {host.memoryGB === 0 ? (
                        <span className="text-muted-foreground">Veri yok</span>
                      ) : host.memoryGB >= 1024 ? (
                        `${(host.memoryGB / 1024).toFixed(1)} TB`
                      ) : (
                        `${host.memoryGB} GB`
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{host.version === 'Unknown' ? <span className="text-muted-foreground">Veri yok</span> : host.version}</div>
                      {host.build && (
                        <div className="text-xs text-muted-foreground">Build: {host.build}</div>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(host.status)}</TableCell>
                    <TableCell>{getOverallBadge(host.overallStatus)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {filteredHosts.length === 0 && !loading && (
            <p className="text-center text-muted-foreground py-8">
              {searchTerm || statusFilter !== 'all' || clusterFilter !== 'all'
                ? 'Filtrelere uygun host bulunamadi' 
                : 'Host bulunamadi'}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
