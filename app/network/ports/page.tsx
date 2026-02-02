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
import { ChevronLeft, ChevronRight, RefreshCw, Search, Plug, Network } from 'lucide-react';

interface Port {
  id: string;
  switchName: string;
  portNumber: string;
  status: 'up' | 'down' | 'disabled';
  vlan: string;
  connectedDevice: string;
  deviceType: string;
  speed: string;
  lastSeen: string;
}

const ITEMS_PER_PAGE = 15;

export default function PortsPage() {
  const [ports, setPorts] = useState<Port[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setTimeout(() => {
      setPorts([
        { id: '1', switchName: 'SW-CORE-01', portNumber: 'Gi1/0/1', status: 'up', vlan: '10', connectedDevice: 'SW-DIST-01', deviceType: 'Switch', speed: '1G', lastSeen: '2 min ago' },
        { id: '2', switchName: 'SW-CORE-01', portNumber: 'Gi1/0/2', status: 'up', vlan: '10', connectedDevice: 'SW-DIST-02', deviceType: 'Switch', speed: '1G', lastSeen: '5 min ago' },
        { id: '3', switchName: 'SW-CORE-01', portNumber: 'Gi1/0/3', status: 'up', vlan: '20', connectedDevice: 'SRV-WEB-01', deviceType: 'Server', speed: '1G', lastSeen: '1 min ago' },
        { id: '4', switchName: 'SW-CORE-01', portNumber: 'Gi1/0/4', status: 'down', vlan: '1', connectedDevice: '-', deviceType: '-', speed: '-', lastSeen: '-' },
        { id: '5', switchName: 'SW-CORE-01', portNumber: 'Gi1/0/5', status: 'up', vlan: '30', connectedDevice: 'FW-MAIN-01', deviceType: 'Firewall', speed: '10G', lastSeen: '3 min ago' },
        { id: '6', switchName: 'SW-DIST-01', portNumber: 'Gi1/0/1', status: 'up', vlan: '10', connectedDevice: 'SW-ACC-01', deviceType: 'Switch', speed: '1G', lastSeen: '4 min ago' },
        { id: '7', switchName: 'SW-DIST-01', portNumber: 'Gi1/0/2', status: 'up', vlan: '11', connectedDevice: 'SRV-DB-01', deviceType: 'Server', speed: '1G', lastSeen: '2 min ago' },
        { id: '8', switchName: 'SW-DIST-01', portNumber: 'Gi1/0/3', status: 'up', vlan: '12', connectedDevice: 'SRV-APP-01', deviceType: 'Server', speed: '1G', lastSeen: '1 min ago' },
        { id: '9', switchName: 'SW-DIST-01', portNumber: 'Gi1/0/4', status: 'disabled', vlan: '1', connectedDevice: '-', deviceType: '-', speed: '-', lastSeen: '-' },
        { id: '10', switchName: 'SW-DIST-01', portNumber: 'Gi1/0/5', status: 'down', vlan: '1', connectedDevice: '-', deviceType: '-', speed: '-', lastSeen: '-' },
        { id: '11', switchName: 'SW-ACC-01', portNumber: 'Gi1/0/1', status: 'up', vlan: '10', connectedDevice: 'PC-EMP-001', deviceType: 'Workstation', speed: '100M', lastSeen: '10 min ago' },
        { id: '12', switchName: 'SW-ACC-01', portNumber: 'Gi1/0/2', status: 'up', vlan: '10', connectedDevice: 'PC-EMP-002', deviceType: 'Workstation', speed: '1G', lastSeen: '5 min ago' },
        { id: '13', switchName: 'SW-ACC-01', portNumber: 'Gi1/0/3', status: 'up', vlan: '11', connectedDevice: 'PRINTER-FL-01', deviceType: 'Printer', speed: '100M', lastSeen: '30 min ago' },
        { id: '14', switchName: 'SW-ACC-01', portNumber: 'Gi1/0/4', status: 'down', vlan: '1', connectedDevice: '-', deviceType: '-', speed: '-', lastSeen: '-' },
        { id: '15', switchName: 'SW-ACC-01', portNumber: 'Gi1/0/5', status: 'up', vlan: '12', connectedDevice: 'SRV-DEV-01', deviceType: 'Server', speed: '1G', lastSeen: '8 min ago' },
        { id: '16', switchName: 'SW-ACC-01', portNumber: 'Gi1/0/6', status: 'up', vlan: '10', connectedDevice: 'PC-EMP-003', deviceType: 'Workstation', speed: '1G', lastSeen: '15 min ago' },
        { id: '17', switchName: 'SW-ACC-01', portNumber: 'Gi1/0/7', status: 'down', vlan: '1', connectedDevice: '-', deviceType: '-', speed: '-', lastSeen: '-' },
        { id: '18', switchName: 'SW-ACC-01', portNumber: 'Gi1/0/8', status: 'up', vlan: '11', connectedDevice: 'AP-WIFI-01', deviceType: 'Access Point', speed: '1G', lastSeen: '2 min ago' },
        { id: '19', switchName: 'SW-CORE-02', portNumber: 'Gi1/0/1', status: 'up', vlan: '10', connectedDevice: 'SW-DIST-03', deviceType: 'Switch', speed: '10G', lastSeen: '1 min ago' },
        { id: '20', switchName: 'SW-CORE-02', portNumber: 'Gi1/0/2', status: 'up', vlan: '10', connectedDevice: 'SW-DIST-04', deviceType: 'Switch', speed: '10G', lastSeen: '2 min ago' },
      ]);
      setLoading(false);
    }, 500);
  }, []);

  const filteredPorts = useMemo(() => {
    if (!searchTerm) return ports;
    const term = searchTerm.toLowerCase();
    return ports.filter(
      (p) =>
        p.switchName.toLowerCase().includes(term) ||
        p.portNumber.toLowerCase().includes(term) ||
        p.connectedDevice.toLowerCase().includes(term) ||
        p.deviceType.toLowerCase().includes(term) ||
        p.vlan.includes(term)
    );
  }, [ports, searchTerm]);

  const totalPages = Math.ceil(filteredPorts.length / ITEMS_PER_PAGE);
  const paginatedPorts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredPorts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredPorts, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'up':
        return <Badge variant="success">Up</Badge>;
      case 'down':
        return <Badge variant="destructive">Down</Badge>;
      case 'disabled':
        return <Badge variant="secondary">Disabled</Badge>;
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
          <h1 className="text-2xl font-bold">Ports</h1>
          <p className="text-muted-foreground">Switch port yönetimi</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button>
            <Plug className="h-4 w-4 mr-2" />
            Port Yapılandır
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-500/20">
                <Plug className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Toplam Port</p>
                <p className="text-2xl font-bold">{ports.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-500/20">
                <Network className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Aktif</p>
                <p className="text-2xl font-bold">{ports.filter((p) => p.status === 'up').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-red-500/20">
                <Network className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Down</p>
                <p className="text-2xl font-bold">{ports.filter((p) => p.status === 'down').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-gray-500/20">
                <Network className="h-5 w-5 text-gray-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Disabled</p>
                <p className="text-2xl font-bold">{ports.filter((p) => p.status === 'disabled').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Port ara... (switch, port no, cihaz, VLAN)"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
          className="pl-9"
        />
      </div>

      {/* Ports Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="h-5 w-5" />
            Ports
            <Badge variant="secondary">{filteredPorts.length}</Badge>
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
                    <TableHead>Switch</TableHead>
                    <TableHead>Port</TableHead>
                    <TableHead>VLAN</TableHead>
                    <TableHead>Bağlı Cihaz</TableHead>
                    <TableHead>Cihaz Türü</TableHead>
                    <TableHead className="text-center">Hız</TableHead>
                    <TableHead className="text-right">Son Görülme</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedPorts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        Port bulunamadı
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedPorts.map((port) => (
                      <TableRow key={port.id}>
                        <TableCell>{getStatusBadge(port.status)}</TableCell>
                        <TableCell className="font-medium">{port.switchName}</TableCell>
                        <TableCell className="font-mono">{port.portNumber}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{port.vlan}</Badge>
                        </TableCell>
                        <TableCell>{port.connectedDevice}</TableCell>
                        <TableCell>{port.deviceType}</TableCell>
                        <TableCell className="text-center">{port.speed}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{port.lastSeen}</TableCell>
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