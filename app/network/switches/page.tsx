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
import { ChevronLeft, ChevronRight, Globe, RefreshCw, Search, Activity, Cpu } from 'lucide-react';

interface Switch {
  id: string;
  name: string;
  ip: string;
  model: string;
  vendor: string;
  portCount: number;
  usedPorts: number;
  upPorts: number;
  downPorts: number;
  cpu: number;
  memory: number;
  status: 'online' | 'offline' | 'warning';
}

const ITEMS_PER_PAGE = 10;

export default function SwitchesPage() {
  const [switches, setSwitches] = useState<Switch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setTimeout(() => {
      setSwitches([
        { id: '1', name: 'SW-CORE-01', ip: '10.0.0.1', model: 'Cisco Catalyst 9300', vendor: 'Cisco', portCount: 48, usedPorts: 42, upPorts: 40, downPorts: 2, cpu: 45, memory: 62, status: 'online' },
        { id: '2', name: 'SW-DIST-01', ip: '10.0.1.1', model: 'Cisco Catalyst 9200', vendor: 'Cisco', portCount: 48, usedPorts: 38, upPorts: 38, downPorts: 0, cpu: 32, memory: 48, status: 'online' },
        { id: '3', name: 'SW-ACC-01', ip: '10.0.2.1', model: 'Aruba 2930F', vendor: 'Aruba', portCount: 24, usedPorts: 20, upPorts: 19, downPorts: 1, cpu: 28, memory: 55, status: 'warning' },
        { id: '4', name: 'SW-CORE-02', ip: '10.0.0.2', model: 'Cisco Catalyst 9300', vendor: 'Cisco', portCount: 48, usedPorts: 44, upPorts: 44, downPorts: 0, cpu: 52, memory: 65, status: 'online' },
        { id: '5', name: 'SW-DIST-02', ip: '10.0.1.2', model: 'Cisco Catalyst 9200', vendor: 'Cisco', portCount: 48, usedPorts: 35, upPorts: 34, downPorts: 1, cpu: 38, memory: 51, status: 'online' },
        { id: '6', name: 'SW-ACC-02', ip: '10.0.2.2', model: 'Aruba 2930F', vendor: 'Aruba', portCount: 24, usedPorts: 18, upPorts: 18, downPorts: 0, cpu: 22, memory: 42, status: 'online' },
        { id: '7', name: 'SW-CORE-03', ip: '10.0.0.3', model: 'Juniper EX4300', vendor: 'Juniper', portCount: 48, usedPorts: 46, upPorts: 45, downPorts: 1, cpu: 61, memory: 72, status: 'warning' },
        { id: '8', name: 'SW-MGMT-01', ip: '10.0.10.1', model: 'Cisco Catalyst 2960', vendor: 'Cisco', portCount: 24, usedPorts: 12, upPorts: 12, downPorts: 0, cpu: 18, memory: 35, status: 'online' },
        { id: '9', name: 'SW-STACK-01', ip: '10.0.3.1', model: 'Cisco Catalyst 9300', vendor: 'Cisco', portCount: 96, usedPorts: 88, upPorts: 86, downPorts: 2, cpu: 55, memory: 68, status: 'online' },
        { id: '10', name: 'SW-WIFI-01', ip: '10.0.4.1', model: 'Aruba 2930F', vendor: 'Aruba', portCount: 48, usedPorts: 40, upPorts: 38, downPorts: 2, cpu: 41, memory: 58, status: 'warning' },
        { id: '11', name: 'SW-EDGE-01', ip: '10.0.5.1', model: 'Juniper EX2300', vendor: 'Juniper', portCount: 24, usedPorts: 20, upPorts: 19, downPorts: 1, cpu: 29, memory: 45, status: 'online' },
        { id: '12', name: 'SW-BACKUP-01', ip: '10.0.0.100', model: 'Cisco Catalyst 9200', vendor: 'Cisco', portCount: 48, usedPorts: 0, upPorts: 0, downPorts: 0, cpu: 5, memory: 15, status: 'offline' },
      ]);
      setLoading(false);
    }, 500);
  }, []);

  const filteredSwitches = useMemo(() => {
    if (!searchTerm) return switches;
    const term = searchTerm.toLowerCase();
    return switches.filter(
      (sw) =>
        sw.name.toLowerCase().includes(term) ||
        sw.ip.includes(term) ||
        sw.model.toLowerCase().includes(term) ||
        sw.vendor.toLowerCase().includes(term)
    );
  }, [switches, searchTerm]);

  const totalPages = Math.ceil(filteredSwitches.length / ITEMS_PER_PAGE);
  const paginatedSwitches = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredSwitches.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredSwitches, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'online':
        return <Badge variant="success">Çevrimiçi</Badge>;
      case 'offline':
        return <Badge variant="destructive">Çevrimdışı</Badge>;
      case 'warning':
        return <Badge className="bg-orange-500">Uyarı</Badge>;
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
          <h1 className="text-2xl font-bold">Switches</h1>
          <p className="text-muted-foreground">Anahtar cihaz yönetimi</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button>
            <Globe className="h-4 w-4 mr-2" />
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
                <Globe className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Toplam Switch</p>
                <p className="text-2xl font-bold">{switches.length}</p>
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
                <p className="text-sm text-muted-foreground">Aktif Port</p>
                <p className="text-2xl font-bold">{switches.reduce((acc, s) => acc + s.upPorts, 0)}</p>
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
                <p className="text-sm text-muted-foreground">Down Port</p>
                <p className="text-2xl font-bold text-red-500">{switches.reduce((acc, s) => acc + s.downPorts, 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-orange-500/20">
                <Cpu className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ortalama CPU</p>
                <p className="text-2xl font-bold">
                  {switches.length > 0 ? Math.round(switches.reduce((acc, s) => acc + s.cpu, 0) / switches.length) : 0}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Switch ara... (isim, IP, model, vendor)"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
          className="pl-9"
        />
      </div>

      {/* Switches Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Switches
            <Badge variant="secondary">{filteredSwitches.length}</Badge>
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
                    <TableHead>IP Adresi</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-center">Port (Up/Down)</TableHead>
                    <TableHead className="text-center">CPU</TableHead>
                    <TableHead className="text-center">Memory</TableHead>
                    <TableHead className="text-right">İşlemler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedSwitches.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        Switch bulunamadı
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedSwitches.map((sw) => (
                      <TableRow key={sw.id}>
                        <TableCell>{getStatusBadge(sw.status)}</TableCell>
                        <TableCell className="font-medium">{sw.name}</TableCell>
                        <TableCell className="font-mono text-sm">{sw.ip}</TableCell>
                        <TableCell>{sw.model}</TableCell>
                        <TableCell>{sw.vendor}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-green-500">{sw.upPorts}</span>
                            <span className="text-muted-foreground">/</span>
                            <span className="text-red-500">{sw.downPorts}</span>
                            <span className="text-muted-foreground">/</span>
                            <span>{sw.portCount}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{sw.cpu}%</TableCell>
                        <TableCell className="text-center">{sw.memory}%</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm">
                              Port
                            </Button>
                            <Button variant="ghost" size="sm">
                              Performans
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
