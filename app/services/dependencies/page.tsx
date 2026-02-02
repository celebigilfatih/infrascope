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
import { ChevronLeft, ChevronRight, RefreshCw, Search, GitBranch, Link, AlertTriangle, CheckCircle } from 'lucide-react';

interface ServiceDependency {
  id: string;
  source: string;
  target: string;
  type: 'synchronous' | 'asynchronous' | 'database' | 'cache' | 'external';
  status: 'healthy' | 'degraded' | 'critical' | 'unknown';
  latency: number;
  errorRate: number;
  lastChecked: string;
}

const ITEMS_PER_PAGE = 10;

export default function DependenciesPage() {
  const [dependencies, setDependencies] = useState<ServiceDependency[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setTimeout(() => {
      setDependencies([
        { id: '1', source: 'API Gateway', target: 'Auth Service', type: 'synchronous', status: 'healthy', latency: 15, errorRate: 0.1, lastChecked: '2024-01-15 10:30' },
        { id: '2', source: 'API Gateway', target: 'User Database', type: 'database', status: 'healthy', latency: 8, errorRate: 0.0, lastChecked: '2024-01-15 10:30' },
        { id: '3', source: 'Auth Service', target: 'Cache Redis', type: 'cache', status: 'healthy', latency: 2, errorRate: 0.0, lastChecked: '2024-01-15 10:30' },
        { id: '4', source: 'Auth Service', target: 'User Database', type: 'database', status: 'healthy', latency: 12, errorRate: 0.2, lastChecked: '2024-01-15 10:29' },
        { id: '5', source: 'Notification Service', target: 'Message Queue', type: 'asynchronous', status: 'degraded', latency: 145, errorRate: 2.5, lastChecked: '2024-01-15 10:25' },
        { id: '6', source: 'Analytics Engine', target: 'Message Queue', type: 'asynchronous', status: 'critical', latency: 890, errorRate: 8.3, lastChecked: '2024-01-15 09:15' },
        { id: '7', source: 'Analytics Engine', target: 'Search Engine', type: 'synchronous', status: 'healthy', latency: 45, errorRate: 0.5, lastChecked: '2024-01-15 10:28' },
        { id: '8', source: 'API Gateway', target: 'Payment Service', type: 'external', status: 'degraded', latency: 230, errorRate: 1.2, lastChecked: '2024-01-15 10:30' },
        { id: '9', source: 'Search Engine', target: 'User Database', type: 'database', status: 'healthy', latency: 18, errorRate: 0.1, lastChecked: '2024-01-15 10:30' },
        { id: '10', source: 'File Storage', target: 'User Database', type: 'database', status: 'healthy', latency: 25, errorRate: 0.0, lastChecked: '2024-01-15 10:29' },
        { id: '11', source: 'ML Pipeline', target: 'Analytics Engine', type: 'synchronous', status: 'healthy', latency: 320, errorRate: 0.8, lastChecked: '2024-01-15 10:20' },
        { id: '12', source: 'API Gateway', target: 'ML Pipeline', type: 'synchronous', status: 'healthy', latency: 450, errorRate: 0.3, lastChecked: '2024-01-15 10:30' },
      ]);
      setLoading(false);
    }, 500);
  }, []);

  const filteredDeps = useMemo(() => {
    if (!searchTerm) return dependencies;
    const term = searchTerm.toLowerCase();
    return dependencies.filter(dep => dep.source.toLowerCase().includes(term) || dep.target.toLowerCase().includes(term));
  }, [dependencies, searchTerm]);

  const totalPages = Math.ceil(filteredDeps.length / ITEMS_PER_PAGE);
  const paginatedDeps = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredDeps.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredDeps, currentPage]);

  useEffect(() => { if (currentPage > totalPages && totalPages > 0) setCurrentPage(1); }, [totalPages, currentPage]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy': return <Badge className="bg-green-500">Healthy</Badge>;
      case 'degraded': return <Badge className="bg-orange-500">Degraded</Badge>;
      case 'critical': return <Badge variant="destructive">Critical</Badge>;
      default: return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'synchronous': return <Badge variant="outline">Sync</Badge>;
      case 'asynchronous': return <Badge variant="outline">Async</Badge>;
      case 'database': return <Badge className="bg-blue-500/20 text-blue-500">DB</Badge>;
      case 'cache': return <Badge className="bg-purple-500/20 text-purple-500">Cache</Badge>;
      case 'external': return <Badge className="bg-red-500/20 text-red-500">External</Badge>;
      default: return <Badge variant="secondary">{type}</Badge>;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'database': return <Link className="h-4 w-4 text-blue-500" />;
      case 'cache': return <Link className="h-4 w-4 text-purple-500" />;
      case 'external': return <Link className="h-4 w-4 text-red-500" />;
      default: return <GitBranch className="h-4 w-4 text-gray-500" />;
    }
  };

  const getLatencyColor = (latency: number) => {
    if (latency < 50) return 'text-green-500';
    if (latency < 200) return 'text-orange-500';
    return 'text-red-500';
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

  const healthyCount = dependencies.filter(d => d.status === 'healthy').length;
  const criticalCount = dependencies.filter(d => d.status === 'critical').length;
  const avgLatency = Math.round(dependencies.reduce((acc, d) => acc + d.latency, 0) / dependencies.length);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Service Dependencies</h1>
          <p className="text-muted-foreground">Servis bağımlılıkları ve iletişim haritası</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon"><RefreshCw className="h-4 w-4" /></Button>
          <Button><GitBranch className="h-4 w-4 mr-2" />Yenile</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-500/20"><GitBranch className="h-5 w-5 text-blue-500" /></div>
              <div><p className="text-sm text-muted-foreground">Toplam Bağımlılık</p><p className="text-2xl font-bold">{dependencies.length}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-500/20"><CheckCircle className="h-5 w-5 text-green-500" /></div>
              <div><p className="text-sm text-muted-foreground">Sağlıklı</p><p className="text-2xl font-bold">{healthyCount}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-red-500/20"><AlertTriangle className="h-5 w-5 text-red-500" /></div>
              <div><p className="text-sm text-muted-foreground">Kritik</p><p className="text-2xl font-bold">{criticalCount}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-purple-500/20"><Link className="h-5 w-5 text-purple-500" /></div>
              <div><p className="text-sm text-muted-foreground">Ort. Gecikme</p><p className="text-2xl font-bold">{avgLatency}ms</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Servis ara..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} className="pl-9" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><GitBranch className="h-5 w-5" />Service Dependencies<Badge variant="secondary">{filteredDeps.length}</Badge></CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kaynak</TableHead>
                    <TableHead></TableHead>
                    <TableHead>Hedef</TableHead>
                    <TableHead>Tip</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead className="text-center">Gecikme</TableHead>
                    <TableHead className="text-center">Hata Oranı</TableHead>
                    <TableHead>Son Kontrol</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedDeps.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Sonuç bulunamadı</TableCell></TableRow>
                  ) : (
                    paginatedDeps.map((dep) => (
                      <TableRow key={dep.id}>
                        <TableCell className="font-medium">{dep.source}</TableCell>
                        <TableCell className="text-center">{getTypeIcon(dep.type)}</TableCell>
                        <TableCell className="font-medium">{dep.target}</TableCell>
                        <TableCell>{getTypeBadge(dep.type)}</TableCell>
                        <TableCell>{getStatusBadge(dep.status)}</TableCell>
                        <TableCell className={`text-center font-mono ${getLatencyColor(dep.latency)}`}>{dep.latency}ms</TableCell>
                        <TableCell className="text-center">
                          <span className={dep.errorRate > 1 ? 'text-red-500 font-mono' : 'text-green-500 font-mono'}>{dep.errorRate.toFixed(1)}%</span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{dep.lastChecked}</TableCell>
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
