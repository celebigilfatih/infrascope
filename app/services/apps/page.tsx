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
import { ChevronLeft, ChevronRight, RefreshCw, Search, Box, Cpu, HardDrive, Activity } from 'lucide-react';

interface ServiceApp {
  id: string;
  name: string;
  type: string;
  status: 'running' | 'stopped' | 'warning' | 'error';
  instances: number;
  cpuUsage: number;
  memoryUsage: number;
  lastUpdated: string;
  version: string;
}

const ITEMS_PER_PAGE = 10;

export default function AppsPage() {
  const [apps, setApps] = useState<ServiceApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setTimeout(() => {
      setApps([
        { id: '1', name: 'API Gateway', type: 'Gateway', status: 'running', instances: 3, cpuUsage: 45, memoryUsage: 62, lastUpdated: '2024-01-15 10:30', version: '2.1.0' },
        { id: '2', name: 'Auth Service', type: 'Microservice', status: 'running', instances: 2, cpuUsage: 28, memoryUsage: 45, lastUpdated: '2024-01-15 10:28', version: '1.8.5' },
        { id: '3', name: 'User Database', type: 'Database', status: 'running', instances: 1, cpuUsage: 72, memoryUsage: 85, lastUpdated: '2024-01-15 10:30', version: '5.7.0' },
        { id: '4', name: 'Cache Redis', type: 'Cache', status: 'running', instances: 2, cpuUsage: 15, memoryUsage: 42, lastUpdated: '2024-01-15 10:29', version: '7.0.0' },
        { id: '5', name: 'Message Queue', type: 'Queue', status: 'warning', instances: 2, cpuUsage: 55, memoryUsage: 68, lastUpdated: '2024-01-15 10:25', version: '3.8.0' },
        { id: '6', name: 'Search Engine', type: 'Search', status: 'running', instances: 1, cpuUsage: 62, memoryUsage: 74, lastUpdated: '2024-01-15 10:30', version: '8.0.0' },
        { id: '7', name: 'Notification Service', type: 'Microservice', status: 'stopped', instances: 0, cpuUsage: 0, memoryUsage: 0, lastUpdated: '2024-01-14 18:45', version: '1.2.0' },
        { id: '8', name: 'Analytics Engine', type: 'Processing', status: 'error', instances: 1, cpuUsage: 95, memoryUsage: 92, lastUpdated: '2024-01-15 09:15', version: '3.0.0' },
        { id: '9', name: 'File Storage', type: 'Storage', status: 'running', instances: 2, cpuUsage: 22, memoryUsage: 55, lastUpdated: '2024-01-15 10:30', version: '4.2.0' },
        { id: '10', name: 'ML Pipeline', type: 'Processing', status: 'running', instances: 1, cpuUsage: 88, memoryUsage: 78, lastUpdated: '2024-01-15 10:20', version: '2.5.0' },
      ]);
      setLoading(false);
    }, 500);
  }, []);

  const filteredApps = useMemo(() => {
    if (!searchTerm) return apps;
    const term = searchTerm.toLowerCase();
    return apps.filter(app => app.name.toLowerCase().includes(term) || app.type.toLowerCase().includes(term));
  }, [apps, searchTerm]);

  const totalPages = Math.ceil(filteredApps.length / ITEMS_PER_PAGE);
  const paginatedApps = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredApps.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredApps, currentPage]);

  useEffect(() => { if (currentPage > totalPages && totalPages > 0) setCurrentPage(1); }, [totalPages, currentPage]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'bg-green-500';
      case 'warning': return 'bg-orange-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running': return <Badge className="bg-green-500">Running</Badge>;
      case 'warning': return <Badge className="bg-orange-500">Warning</Badge>;
      case 'error': return <Badge variant="destructive">Error</Badge>;
      default: return <Badge variant="secondary">Stopped</Badge>;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'database': return <HardDrive className="h-4 w-4 text-blue-500" />;
      case 'cache': return <Activity className="h-4 w-4 text-purple-500" />;
      case 'microservice': return <Box className="h-4 w-4 text-green-500" />;
      default: return <Cpu className="h-4 w-4 text-gray-500" />;
    }
  };

  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = 5;
    if (totalPages <= maxVisible) { for (let i = 1; i <= totalPages; i++) pages.push(i); }
    else {
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

  const runningCount = apps.filter(a => a.status === 'running').length;
  const errorCount = apps.filter(a => a.status === 'error').length;
  const totalInstances = apps.reduce((acc, a) => acc + a.instances, 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Service Applications</h1>
          <p className="text-muted-foreground">Uygulama ve servis yönetimi</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon"><RefreshCw className="h-4 w-4" /></Button>
          <Button><Box className="h-4 w-4 mr-2" />Yenile</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-500/20"><Box className="h-5 w-5 text-blue-500" /></div>
              <div><p className="text-sm text-muted-foreground">Toplam Uygulama</p><p className="text-2xl font-bold">{apps.length}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-500/20"><Activity className="h-5 w-5 text-green-500" /></div>
              <div><p className="text-sm text-muted-foreground">Çalışan</p><p className="text-2xl font-bold">{runningCount}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-red-500/20"><Activity className="h-5 w-5 text-red-500" /></div>
              <div><p className="text-sm text-muted-foreground">Hata</p><p className="text-2xl font-bold">{errorCount}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-purple-500/20"><Cpu className="h-5 w-5 text-purple-500" /></div>
              <div><p className="text-sm text-muted-foreground">Toplam Instance</p><p className="text-2xl font-bold">{totalInstances}</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Uygulama ara..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} className="pl-9" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Box className="h-5 w-5" />Service Applications<Badge variant="secondary">{filteredApps.length}</Badge></CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Uygulama</TableHead>
                    <TableHead>Tip</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead className="text-center">Instance</TableHead>
                    <TableHead className="text-center">CPU</TableHead>
                    <TableHead className="text-center">RAM</TableHead>
                    <TableHead>Versiyon</TableHead>
                    <TableHead>Son Güncelleme</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedApps.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Sonuç bulunamadı</TableCell></TableRow>
                  ) : (
                    paginatedApps.map((app) => (
                      <TableRow key={app.id}>
                        <TableCell className="font-medium">{app.name}</TableCell>
                        <TableCell><div className="flex items-center gap-2">{getTypeIcon(app.type)}{app.type}</div></TableCell>
                        <TableCell><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${getStatusColor(app.status)}`}></span>{getStatusBadge(app.status)}</div></TableCell>
                        <TableCell className="text-center font-mono">{app.instances}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-blue-500" style={{ width: `${app.cpuUsage}%` }}></div></div>
                            <span className="text-sm">{app.cpuUsage}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-purple-500" style={{ width: `${app.memoryUsage}%` }}></div></div>
                            <span className="text-sm">{app.memoryUsage}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{app.version}</TableCell>
                        <TableCell className="text-muted-foreground">{app.lastUpdated}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">Sayfa {currentPage} / {totalPages}</p>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft className="h-4 w-4" /></Button>
                    {getPageNumbers().map((page, idx) => (
                      <React.Fragment key={idx}>
                        {page === 'ellipsis' ? <span className="px-2 text-muted-foreground">...</span> : (
                          <Button variant={currentPage === page ? 'default' : 'outline'} size="sm" onClick={() => setCurrentPage(page)} className="w-9">{page}</Button>
                        )}
                      </React.Fragment>
                    ))}
                    <Button variant="outline" size="icon" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight className="h-4 w-4" /></Button>
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
