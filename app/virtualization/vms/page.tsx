'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  RefreshCw,
  Power,
  Play,
  Square,
  Pause,
  RotateCcw,
  Search,
  Server,
  Cpu,
  HardDrive,
  Monitor,
  Download,
  AlertTriangle,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

interface VM {
  id: string;
  name: string;
  host: string;
  ip: string;
  cpuCores: number;
  ramMB: number;
  os: string;
  status: string;
  powerState: string;
  overallStatus: string;
}

export default function VMsPage() {
  const [vms, setVms] = useState<VM[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({ open: false, title: '', description: '', onConfirm: () => {} });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const fetchVMs = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/integrations/vmware?type=vms');
      const json = await res.json();
      
      if (json.error) {
        setError(json.error);
        return;
      }
      
      setVms(json.vms || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVMs();
    const interval = setInterval(fetchVMs, 30000);
    return () => clearInterval(interval);
  }, []);

  // Filter VMs
  const filteredVMs = useMemo(() => {
    return vms.filter(vm => {
      const matchesSearch = 
        vm.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        vm.host?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        vm.ip?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        vm.os?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || vm.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [vms, searchTerm, statusFilter]);

  // Paginate
  const totalPages = Math.ceil(filteredVMs.length / itemsPerPage);
  const paginatedVMs = filteredVMs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Power control
  const handlePowerAction = async (vmId: string, operation: string, vmName: string) => {
    setActionLoading(vmId);
    try {
      const res = await fetch('/api/integrations/vmware', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'vm-power', vmId, operation }),
      });
      const json = await res.json();
      
      if (json.success) {
        // Refresh VM list
        setTimeout(fetchVMs, 2000);
      } else {
        alert(`Islem basarisiz: ${json.error || 'Bilinmeyen hata'}`);
      }
    } catch (err) {
      alert(`Hata: ${(err as Error).message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const confirmPowerAction = (vmId: string, operation: string, vmName: string) => {
    const actionNames: Record<string, string> = {
      on: 'baslatmak',
      off: 'kapatmak (graceful)',
      'force-off': 'zorla kapatmak',
      suspend: 'askiya almak',
      reset: 'yeniden baslatmak',
    };

    setConfirmDialog({
      open: true,
      title: `VM ${actionNames[operation]}`,
      description: `"${vmName}" sanal makinesini ${actionNames[operation]} istediginizden emin misiniz?`,
      onConfirm: () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        handlePowerAction(vmId, operation, vmName);
      },
    });
  };

  // Export CSV
  const exportCSV = () => {
    const headers = ['Ad', 'Host', 'IP', 'CPU', 'RAM (MB)', 'OS', 'Durum'];
    const rows = filteredVMs.map(vm => [
      vm.name,
      vm.host,
      vm.ip,
      vm.cpuCores,
      vm.ramMB,
      vm.os,
      vm.status,
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vms_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <Badge variant="success"><Power className="h-3 w-3 mr-1" />Calisiyor</Badge>;
      case 'notRunning':
        return <Badge variant="secondary"><Square className="h-3 w-3 mr-1" />Kapali</Badge>;
      case 'suspended':
        return <Badge variant="warning"><Pause className="h-3 w-3 mr-1" />Askida</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getOverallBadge = (status: string) => {
    switch (status) {
      case 'green':
        return <Badge variant="success">Saglikli</Badge>;
      case 'yellow':
        return <Badge variant="warning">Uyari</Badge>;
      case 'red':
        return <Badge variant="destructive">Kritik</Badge>;
      default:
        return <Badge variant="outline">Bilinmiyor</Badge>;
    }
  };

  // Summary counts
  const vmRunning = vms.filter(v => v.status === 'running').length;
  const vmStopped = vms.filter(v => v.status === 'notRunning').length;
  const vmSuspended = vms.filter(v => v.status === 'suspended').length;

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              <span>vCenter baglantisi basarisiz: {error}</span>
            </div>
            <Button onClick={fetchVMs} className="mt-4" variant="outline">
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
          <h1 className="text-2xl font-bold">Sanal Makineler</h1>
          <p className="text-muted-foreground">
            vCenter uzerindeki tum sanal makineler
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={exportCSV} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            CSV
          </Button>
          <Button onClick={fetchVMs} disabled={loading} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Toplam VM</CardTitle>
            <Monitor className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{vms.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Calisiyor</CardTitle>
            <Power className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{vmRunning}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Kapali</CardTitle>
            <Square className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">{vmStopped}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Askida</CardTitle>
            <Pause className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{vmSuspended}</div>
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
                placeholder="VM adi, host, IP veya OS ile ara..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Durum Filtrele" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tum Durumlar</SelectItem>
                <SelectItem value="running">Calisiyor</SelectItem>
                <SelectItem value="notRunning">Kapali</SelectItem>
                <SelectItem value="suspended">Askida</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* VM Table */}
      <Card>
        <CardContent className="pt-6">
          {loading && vms.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ad</TableHead>
                    <TableHead>Host</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>CPU</TableHead>
                    <TableHead>RAM</TableHead>
                    <TableHead>OS</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead>Saglik</TableHead>
                    <TableHead className="text-right">Islemler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedVMs.map((vm) => (
                    <TableRow key={vm.id}>
                      <TableCell className="font-medium">{vm.name}</TableCell>
                      <TableCell>{vm.host === 'Unknown' ? <span className="text-muted-foreground">Veri yok</span> : vm.host}</TableCell>
                      <TableCell className="font-mono text-sm">{vm.ip}</TableCell>
                      <TableCell>{vm.cpuCores} vCPU</TableCell>
                      <TableCell>{vm.ramMB >= 1024 ? `${(vm.ramMB / 1024).toFixed(1)} GB` : `${vm.ramMB} MB`}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={vm.os}>{vm.os}</TableCell>
                      <TableCell>{getStatusBadge(vm.status)}</TableCell>
                      <TableCell>{getOverallBadge(vm.overallStatus)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {vm.status !== 'running' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => confirmPowerAction(vm.id, 'on', vm.name)}
                              disabled={actionLoading === vm.id}
                              title="Baslat"
                            >
                              <Play className="h-4 w-4 text-green-500" />
                            </Button>
                          )}
                          {vm.status === 'running' && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => confirmPowerAction(vm.id, 'off', vm.name)}
                                disabled={actionLoading === vm.id}
                                title="Kapat (Graceful)"
                              >
                                <Square className="h-4 w-4 text-gray-500" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => confirmPowerAction(vm.id, 'suspend', vm.name)}
                                disabled={actionLoading === vm.id}
                                title="Askiya Al"
                              >
                                <Pause className="h-4 w-4 text-yellow-500" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => confirmPowerAction(vm.id, 'reset', vm.name)}
                                disabled={actionLoading === vm.id}
                                title="Yeniden Baslat"
                              >
                                <RotateCcw className="h-4 w-4 text-blue-500" />
                              </Button>
                            </>
                          )}
                          {actionLoading === vm.id && (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Toplam {filteredVMs.length} VM, Sayfa {currentPage} / {totalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      Onceki
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Sonraki
                    </Button>
                  </div>
                </div>
              )}

              {paginatedVMs.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  {searchTerm || statusFilter !== 'all' 
                    ? 'Filtrelere uygun VM bulunamadi' 
                    : 'VM bulunamadi'}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={confirmDialog.onConfirm}
      />
    </div>
  );
}
