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
import { ChevronLeft, ChevronRight, RefreshCw, Search, Network, Shield } from 'lucide-react';

interface Vlan {
  id: string;
  vlanId: number;
  name: string;
  subnet: string;
  gateway: string;
  deviceCount: number;
  status: 'active' | 'inactive';
  description: string;
}

const ITEMS_PER_PAGE = 10;

export default function VlansPage() {
  const [vlans, setVlans] = useState<Vlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setTimeout(() => {
      setVlans([
        { id: '1', vlanId: 1, name: 'Default', subnet: '192.168.1.0/24', gateway: '192.168.1.1', deviceCount: 12, status: 'active', description: 'Varsayılan VLAN' },
        { id: '2', vlanId: 10, name: 'Management', subnet: '10.0.10.0/24', gateway: '10.0.10.1', deviceCount: 8, status: 'active', description: 'Yönetim ağı' },
        { id: '3', vlanId: 20, name: 'Servers', subnet: '10.0.20.0/24', gateway: '10.0.20.1', deviceCount: 15, status: 'active', description: 'Sunucu ağı' },
        { id: '4', vlanId: 30, name: 'Workstations', subnet: '10.0.30.0/24', gateway: '10.0.30.1', deviceCount: 45, status: 'active', description: 'İş istasyonları' },
        { id: '5', vlanId: 40, name: 'Guest', subnet: '10.0.40.0/24', gateway: '10.0.40.1', deviceCount: 5, status: 'active', description: 'Misafir ağı' },
        { id: '6', vlanId: 50, name: 'IoT', subnet: '10.0.50.0/24', gateway: '10.0.50.1', deviceCount: 22, status: 'active', description: 'IoT cihazları' },
        { id: '7', vlanId: 60, name: 'Voice', subnet: '10.0.60.0/24', gateway: '10.0.60.1', deviceCount: 18, status: 'active', description: 'IP Telefon' },
        { id: '8', vlanId: 70, name: 'Video', subnet: '10.0.70.0/24', gateway: '10.0.70.1', deviceCount: 10, status: 'active', description: 'Video surveillance' },
        { id: '9', vlanId: 80, name: 'DMZ', subnet: '10.0.80.0/24', gateway: '10.0.80.1', deviceCount: 6, status: 'active', description: 'Demilitarized zone' },
        { id: '10', vlanId: 90, name: 'Development', subnet: '10.0.90.0/24', gateway: '10.0.90.1', deviceCount: 12, status: 'active', description: 'Geliştirme ortamı' },
        { id: '11', vlanId: 99, name: 'Management-OOB', subnet: '172.16.0.0/24', gateway: '172.16.0.1', deviceCount: 4, status: 'active', description: 'Out-of-band management' },
        { id: '12', vlanId: 100, name: 'Test-Lab', subnet: '10.100.0.0/24', gateway: '10.100.0.1', deviceCount: 3, status: 'inactive', description: 'Test laboratuvarı' },
      ]);
      setLoading(false);
    }, 500);
  }, []);

  const filteredVlans = useMemo(() => {
    if (!searchTerm) return vlans;
    const term = searchTerm.toLowerCase();
    return vlans.filter(
      (v) =>
        v.name.toLowerCase().includes(term) ||
        v.vlanId.toString().includes(term) ||
        v.subnet.includes(term) ||
        v.description.toLowerCase().includes(term)
    );
  }, [vlans, searchTerm]);

  const totalPages = Math.ceil(filteredVlans.length / ITEMS_PER_PAGE);
  const paginatedVlans = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredVlans.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredVlans, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="success">Aktif</Badge>;
      case 'inactive':
        return <Badge variant="destructive">Pasif</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">VLANs</h1>
          <p className="text-muted-foreground">VLAN yapılandırması ve yönetimi</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button>
            <Network className="h-4 w-4 mr-2" />
            VLAN Ekle
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
                <p className="text-sm text-muted-foreground">Toplam VLAN</p>
                <p className="text-2xl font-bold">{vlans.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-500/20">
                <Shield className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Aktif</p>
                <p className="text-2xl font-bold">{vlans.filter((v) => v.status === 'active').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-red-500/20">
                <Shield className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pasif</p>
                <p className="text-2xl font-bold">{vlans.filter((v) => v.status === 'inactive').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-purple-500/20">
                <Network className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Toplam Cihaz</p>
                <p className="text-2xl font-bold">{vlans.reduce((acc, v) => acc + v.deviceCount, 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="VLAN ara... (isim, ID, subnet, açıklama)"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
          className="pl-9"
        />
      </div>

      {/* VLANs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5" />
            VLANs
            <Badge variant="secondary">{filteredVlans.length}</Badge>
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
                    <TableHead>VLAN ID</TableHead>
                    <TableHead>İsim</TableHead>
                    <TableHead>Alt Ağ</TableHead>
                    <TableHead>Ağ Geçidi</TableHead>
                    <TableHead className="text-center">Cihaz</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead>Açıklama</TableHead>
                    <TableHead className="text-right">İşlemler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedVlans.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        VLAN bulunamadı
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedVlans.map((vlan) => (
                      <TableRow key={vlan.id}>
                        <TableCell>
                          <Badge variant="outline">{vlan.vlanId}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">{vlan.name}</TableCell>
                        <TableCell className="font-mono text-sm">{vlan.subnet}</TableCell>
                        <TableCell className="font-mono text-sm">{vlan.gateway}</TableCell>
                        <TableCell className="text-center">{vlan.deviceCount}</TableCell>
                        <TableCell>{getStatusBadge(vlan.status)}</TableCell>
                        <TableCell className="max-w-xs truncate text-muted-foreground">
                          {vlan.description}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm">
                              Düzenle
                            </Button>
                            <Button variant="ghost" size="sm">
                              Cihazlar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {/* Custom Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Sayfa {currentPage} / {totalPages}
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
                            onClick={() => setCurrentPage(page)}
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
    </div>
  );
}
