'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Network, RefreshCw, Search, Activity, Server, MapPin, AlertCircle } from 'lucide-react';

interface NetworkInterface {
  id: string;
  name: string;
  ipv4: string | null;
  status: string;
}

interface Rack {
  name: string;
  room?: {
    name: string;
    floor?: {
      name: string;
      building?: { name: string };
    };
  };
}

interface SwitchDevice {
  id: string;
  name: string;
  vendor: string | null;
  model: string | null;
  status: string;
  criticality: string;
  serialNumber: string | null;
  supportDate: string | null;
  rackUnitPosition: number | null;
  rack: Rack | null;
  networkInterfaces: NetworkInterface[];
}

const ITEMS_PER_PAGE = 25;

export default function SwitchesPage() {
  const [switches, setSwitches] = useState<SwitchDevice[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Add switch dialog state
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newSwitchName, setNewSwitchName] = useState('');
  const [newSwitchModel, setNewSwitchModel] = useState('');
  const [newSwitchVendor, setNewSwitchVendor] = useState('');
  const [newSwitchCriticality, setNewSwitchCriticality] = useState<'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'>('HIGH');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchSwitches = useCallback(async (page: number, search: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        filterType: 'SWITCH',
        page: String(page),
        limit: String(ITEMS_PER_PAGE),
        mode: 'full',
      });
      if (search) params.set('search', search);
      const res = await fetch(`/api/devices?${params}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'API error');
      setSwitches(json.data);
      setTotal(json.total);
      setTotalPages(json.totalPages);
    } catch (err) {
      setError('Switch verileri yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSwitches(currentPage, searchTerm);
  }, [fetchSwitches, currentPage, searchTerm]);

  // Debounce search — reset to page 1
  const handleSearch = (val: string) => {
    setSearchTerm(val);
    setCurrentPage(1);
  };

  const handleAddSwitch = async () => {
    if (!newSwitchName || !newSwitchModel) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSwitchName,
          type: 'SWITCH',
          model: newSwitchModel,
          vendor: newSwitchVendor || null,
          criticality: newSwitchCriticality,
          status: 'ACTIVE',
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setIsAddDialogOpen(false);
      setNewSwitchName('');
      setNewSwitchModel('');
      setNewSwitchVendor('');
      setNewSwitchCriticality('HIGH');
      fetchSwitches(currentPage, searchTerm);
    } catch (err) {
      console.error('Failed to add switch:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge variant="success">Aktif</Badge>;
      case 'INACTIVE':
        return <Badge variant="destructive">Çevrimdışı</Badge>;
      case 'MAINTENANCE':
        return <Badge className="bg-orange-500">Bakım</Badge>;
      case 'DECOMMISSIONED':
        return <Badge variant="outline">Devre Dışı</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getCriticalityBadge = (criticality: string) => {
    switch (criticality) {
      case 'CRITICAL':
        return <Badge className="bg-red-600 text-white">Kritik</Badge>;
      case 'HIGH':
        return <Badge className="bg-orange-500 text-white">Yüksek</Badge>;
      case 'MEDIUM':
        return <Badge className="bg-yellow-500 text-white">Orta</Badge>;
      case 'LOW':
        return <Badge variant="secondary">Düşük</Badge>;
      default:
        return <Badge variant="outline">{criticality}</Badge>;
    }
  };

  const getLocation = (sw: SwitchDevice): string => {
    if (!sw.rack) return '—';
    const building = sw.rack.room?.floor?.building?.name;
    const room = sw.rack.room?.name;
    const rack = sw.rack.name;
    return [building, room, rack].filter(Boolean).join(' / ');
  };

  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = 5;
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('ellipsis');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  };

  const activeCount = switches.filter(s => s.status === 'ACTIVE').length;
  const inactiveCount = switches.filter(s => s.status !== 'ACTIVE').length;
  const highCriticalCount = switches.filter(s => s.criticality === 'CRITICAL' || s.criticality === 'HIGH').length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Switches</h1>
          <p className="text-muted-foreground">Anahtar cihaz yönetimi</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => fetchSwitches(currentPage, searchTerm)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <Network className="h-4 w-4 mr-2" />
            Switch Ekle
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-500/20">
                <Network className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Toplam Switch</p>
                <p className="text-2xl font-bold">{total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-500/20">
                <Activity className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Aktif</p>
                <p className="text-2xl font-bold text-green-500">{activeCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-red-500/20">
                <Activity className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pasif</p>
                <p className="text-2xl font-bold text-red-500">{inactiveCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-orange-500/20">
                <Server className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Kritik / Yüksek</p>
                <p className="text-2xl font-bold text-orange-500">{highCriticalCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Switch ara... (isim, model, vendor)"
          value={searchTerm}
          onChange={(e) => handleSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      {/* Switches Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5" />
            Switches
            <Badge variant="secondary">{total}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Durum</TableHead>
                    <TableHead>Switch Adı</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Kritiklik</TableHead>
                    <TableHead>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        Konum
                      </div>
                    </TableHead>
                    <TableHead>Seri No</TableHead>
                    <TableHead>Destek Bitişi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {switches.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        Switch bulunamadı
                      </TableCell>
                    </TableRow>
                  ) : (
                    switches.map((sw) => {
                      const primaryIp = sw.networkInterfaces?.find(ni => ni.ipv4)?.ipv4;
                      const supportDate = sw.supportDate ? new Date(sw.supportDate) : null;
                      const isExpired = supportDate && supportDate < new Date();
                      return (
                        <TableRow key={sw.id}>
                          <TableCell>{getStatusBadge(sw.status)}</TableCell>
                          <TableCell className="font-medium">
                            <div>{sw.name}</div>
                            {primaryIp && (
                              <div className="text-xs font-mono text-muted-foreground">{primaryIp}</div>
                            )}
                          </TableCell>
                          <TableCell>{sw.model || '—'}</TableCell>
                          <TableCell>{sw.vendor || '—'}</TableCell>
                          <TableCell>{getCriticalityBadge(sw.criticality)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{getLocation(sw)}</TableCell>
                          <TableCell className="font-mono text-xs">{sw.serialNumber || '—'}</TableCell>
                          <TableCell>
                            {supportDate ? (
                              <span className={isExpired ? 'text-red-500 font-medium' : ''}>
                                {supportDate.toLocaleDateString('tr-TR')}
                                {isExpired && ' (Bitti)'}
                              </span>
                            ) : '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Sayfa {currentPage} / {totalPages} &bull; Toplam {total} switch
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {getPageNumbers().map((page, idx) => (
                      <React.Fragment key={idx}>
                        {page === 'ellipsis' ? (
                          <span className="px-2 text-muted-foreground">...</span>
                        ) : (
                          <Button
                            variant={currentPage === page ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setCurrentPage(page as number)}
                            className="w-9"
                          >
                            {page}
                          </Button>
                        )}
                      </React.Fragment>
                    ))}
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Add Switch Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Yeni Switch Ekle</DialogTitle>
            <DialogDescription>
              Manuel olarak switch cihazı ekleyin. Tüm alanlar zorunlu değildir.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="add-name" className="text-right font-medium">
                Adı *
              </label>
              <Input
                id="add-name"
                value={newSwitchName}
                onChange={(e) => setNewSwitchName(e.target.value)}
                placeholder="Örn: SW-KAT-3"
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="add-model" className="text-right font-medium">
                Model *
              </label>
              <Input
                id="add-model"
                value={newSwitchModel}
                onChange={(e) => setNewSwitchModel(e.target.value)}
                placeholder="Örn: Catalyst 2960L"
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="add-vendor" className="text-right font-medium">
                Vendor
              </label>
              <Input
                id="add-vendor"
                value={newSwitchVendor}
                onChange={(e) => setNewSwitchVendor(e.target.value)}
                placeholder="Örn: Cisco"
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="add-criticality" className="text-right font-medium">
                Kritiklik
              </label>
              <Select value={newSwitchCriticality} onValueChange={(val) => setNewSwitchCriticality(val as any)}>
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CRITICAL">Kritik</SelectItem>
                  <SelectItem value="HIGH">Yüksek</SelectItem>
                  <SelectItem value="MEDIUM">Orta</SelectItem>
                  <SelectItem value="LOW">Düşük</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} disabled={isSubmitting}>
              İptal
            </Button>
            <Button onClick={handleAddSwitch} disabled={isSubmitting || !newSwitchName || !newSwitchModel}>
              {isSubmitting ? 'Ekleniyor...' : 'Ekle'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
