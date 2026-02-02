'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RefreshCw, Power, Play, Square, Search, Server, Cpu, HardDrive } from 'lucide-react';

interface VM {
  id: string;
  name: string;
  host: string;
  cluster: string;
  ip: string;
  cpuCores: number;
  ramGB: number;
  diskGB: number;
  os: string;
  status: 'running' | 'stopped' | 'suspended';
}

export default function VMsPage() {
  const [vms, setVms] = useState<VM[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    setTimeout(() => {
      setVms([
        {
          id: '1',
          name: 'WEB-SERVER-01',
          host: 'ESX-HOST-01',
          cluster: 'PROD-CLUSTER-01',
          ip: '10.0.10.11',
          cpuCores: 4,
          ramGB: 16,
          diskGB: 100,
          os: 'Ubuntu 22.04',
          status: 'running',
        },
        {
          id: '2',
          name: 'DB-SERVER-01',
          host: 'ESX-HOST-01',
          cluster: 'PROD-CLUSTER-01',
          ip: '10.0.10.12',
          cpuCores: 8,
          ramGB: 32,
          diskGB: 500,
          os: 'CentOS 8',
          status: 'running',
        },
        {
          id: '3',
          name: 'APP-SERVER-01',
          host: 'ESX-HOST-02',
          cluster: 'PROD-CLUSTER-01',
          ip: '10.0.10.13',
          cpuCores: 4,
          ramGB: 16,
          diskGB: 150,
          os: 'Windows Server 2022',
          status: 'running',
        },
        {
          id: '4',
          name: 'TEST-VM-01',
          host: 'ESX-HOST-03',
          cluster: 'PROD-CLUSTER-01',
          ip: '10.0.10.20',
          cpuCores: 2,
          ramGB: 4,
          diskGB: 50,
          os: 'Ubuntu 20.04',
          status: 'stopped',
        },
        {
          id: '5',
          name: 'CACHE-SERVER-01',
          host: 'ESX-HOST-02',
          cluster: 'PROD-CLUSTER-02',
          ip: '10.0.20.15',
          cpuCores: 4,
          ramGB: 8,
          diskGB: 80,
          os: 'Ubuntu 22.04',
          status: 'suspended',
        },
      ]);
      setLoading(false);
    }, 500);
  }, []);

  const filteredVMs = useMemo(() => {
    if (!searchTerm) return vms;
    const term = searchTerm.toLowerCase();
    return vms.filter(
      (vm) =>
        vm.name.toLowerCase().includes(term) ||
        vm.host.toLowerCase().includes(term) ||
        vm.cluster.toLowerCase().includes(term) ||
        vm.ip.includes(term) ||
        vm.os.toLowerCase().includes(term)
    );
  }, [vms, searchTerm]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <Badge variant="success">Çalışıyor</Badge>;
      case 'stopped':
        return <Badge variant="destructive">Durdu</Badge>;
      case 'suspended':
        return <Badge variant="warning">Askıda</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Virtual Machines</h1>
          <p className="text-muted-foreground">VM yönetimi ve kontrolü</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button>
            <Power className="h-4 w-4 mr-2" />
            VM Oluştur
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-500/20">
                <Play className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Çalışan</p>
                <p className="text-2xl font-bold">{vms.filter((v) => v.status === 'running').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-red-500/20">
                <Square className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Durdu</p>
                <p className="text-2xl font-bold">{vms.filter((v) => v.status === 'stopped').length}</p>
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
                <p className="text-sm text-muted-foreground">Toplam vCPU</p>
                <p className="text-2xl font-bold">{vms.reduce((acc, v) => acc + v.cpuCores, 0)}</p>
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
                <p className="text-2xl font-bold">{vms.reduce((acc, v) => acc + v.ramGB, 0)} GB</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="VM ara... (isim, host, IP, işletim sistemi)"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* VMs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Sanal Makineler
            <Badge variant="secondary">{filteredVMs.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Durum</TableHead>
                  <TableHead>VM Adı</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead>Cluster</TableHead>
                  <TableHead>IP Adresi</TableHead>
                  <TableHead>İşletim Sistemi</TableHead>
                  <TableHead className="text-center">vCPU</TableHead>
                  <TableHead className="text-center">RAM (GB)</TableHead>
                  <TableHead className="text-center">Disk (GB)</TableHead>
                  <TableHead className="text-right">İşlemler</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVMs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      VM bulunamadı
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredVMs.map((vm) => (
                    <TableRow key={vm.id}>
                      <TableCell>{getStatusBadge(vm.status)}</TableCell>
                      <TableCell className="font-medium">{vm.name}</TableCell>
                      <TableCell>{vm.host}</TableCell>
                      <TableCell>{vm.cluster}</TableCell>
                      <TableCell className="font-mono text-sm">{vm.ip}</TableCell>
                      <TableCell>{vm.os}</TableCell>
                      <TableCell className="text-center">{vm.cpuCores}</TableCell>
                      <TableCell className="text-center">{vm.ramGB}</TableCell>
                      <TableCell className="text-center">{vm.diskGB}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm">
                            Konsol
                          </Button>
                          <Button variant="ghost" size="sm">
                            Snapshot
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
