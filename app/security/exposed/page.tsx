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
import { ChevronLeft, ChevronRight, RefreshCw, Search, Globe, AlertTriangle, Eye } from 'lucide-react';

interface ExposedAsset {
  id: string;
  asset: string;
  ip: string;
  port: number;
  service: string;
  exposureLevel: 'critical' | 'high' | 'medium' | 'low';
  vulnerability: string;
  firstSeen: string;
  lastSeen: string;
}

const ITEMS_PER_PAGE = 10;

export default function ExposedPage() {
  const [assets, setAssets] = useState<ExposedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setTimeout(() => {
      setAssets([
        { id: '1', asset: 'WEB-SERVER-01', ip: '10.0.10.5', port: 443, service: 'HTTPS', exposureLevel: 'critical', vulnerability: 'OpenSSL Heartbleed', firstSeen: '2024-01-10', lastSeen: '2024-01-15' },
        { id: '2', asset: 'DB-SERVER-01', ip: '10.0.20.10', port: 5432, service: 'PostgreSQL', exposureLevel: 'high', vulnerability: 'Default Credentials', firstSeen: '2024-01-08', lastSeen: '2024-01-15' },
        { id: '3', asset: 'API-GATEWAY-01', ip: '10.0.30.5', port: 8080, service: 'HTTP', exposureLevel: 'medium', vulnerability: 'Missing Auth Header', firstSeen: '2024-01-12', lastSeen: '2024-01-15' },
        { id: '4', asset: 'FTP-SERVER-01', ip: '10.0.40.5', port: 21, service: 'FTP', exposureLevel: 'high', vulnerability: 'Anonymous Access', firstSeen: '2024-01-05', lastSeen: '2024-01-14' },
        { id: '5', asset: 'SSH-GATEWAY', ip: '10.0.50.1', port: 22, service: 'SSH', exposureLevel: 'low', vulnerability: 'Weak KEX', firstSeen: '2024-01-01', lastSeen: '2024-01-15' },
        { id: '6', asset: 'REDIS-CACHE-01', ip: '10.0.60.5', port: 6379, service: 'Redis', exposureLevel: 'critical', vulnerability: 'No Auth Required', firstSeen: '2024-01-11', lastSeen: '2024-01-15' },
        { id: '7', asset: 'MONGO-DB-01', ip: '10.0.70.5', port: 27017, service: 'MongoDB', exposureLevel: 'high', vulnerability: 'No Auth Required', firstSeen: '2024-01-09', lastSeen: '2024-01-15' },
        { id: '8', asset: 'JENKINS-01', ip: '10.0.80.5', port: 8080, service: 'HTTP', exposureLevel: 'critical', vulnerability: 'Unauthenticated Admin', firstSeen: '2024-01-07', lastSeen: '2024-01-13' },
      ]);
      setLoading(false);
    }, 500);
  }, []);

  const filteredAssets = useMemo(() => {
    if (!searchTerm) return assets;
    const term = searchTerm.toLowerCase();
    return assets.filter((a) => a.asset.toLowerCase().includes(term) || a.ip.includes(term) || a.vulnerability.toLowerCase().includes(term));
  }, [assets, searchTerm]);

  const totalPages = Math.ceil(filteredAssets.length / ITEMS_PER_PAGE);
  const paginatedAssets = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredAssets.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredAssets, currentPage]);

  useEffect(() => { if (currentPage > totalPages && totalPages > 0) setCurrentPage(1); }, [totalPages, currentPage]);

  const getExposureBadge = (level: string) => {
    switch (level) {
      case 'critical': return <Badge className="bg-red-600">Critical</Badge>;
      case 'high': return <Badge variant="destructive">High</Badge>;
      case 'medium': return <Badge className="bg-orange-500">Medium</Badge>;
      case 'low': return <Badge variant="secondary">Low</Badge>;
      default: return <Badge variant="outline">{level}</Badge>;
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Exposed Assets</h1>
          <p className="text-muted-foreground">Açığa çıkmış varlık taraması</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon"><RefreshCw className="h-4 w-4" /></Button>
          <Button><Eye className="h-4 w-4 mr-2" />Yeniden Tara</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-blue-500/20"><Globe className="h-5 w-5 text-blue-500" /></div>
            <div><p className="text-sm text-muted-foreground">Açık Port</p><p className="text-2xl font-bold">{assets.length}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-red-500/20"><AlertTriangle className="h-5 w-5 text-red-500" /></div>
            <div><p className="text-sm text-muted-foreground">Kritik/High</p><p className="text-2xl font-bold">{assets.filter((a) => a.exposureLevel === 'critical' || a.exposureLevel === 'high').length}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-purple-500/20"><Globe className="h-5 w-5 text-purple-500" /></div>
            <div><p className="text-sm text-muted-foreground">Servis</p><p className="text-2xl font-bold">{new Set(assets.map((a) => a.service)).size}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-orange-500/20"><AlertTriangle className="h-5 w-5 text-orange-500" /></div>
            <div><p className="text-sm text-muted-foreground">Zafiyet</p><p className="text-2xl font-bold">{new Set(assets.map((a) => a.vulnerability)).size}</p></div>
          </div>
        </CardContent></Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Varlık ara..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} className="pl-9" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" />Exposed Assets<Badge variant="secondary">{filteredAssets.length}</Badge></CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Varlık</TableHead>
                    <TableHead>IP:Port</TableHead>
                    <TableHead>Servis</TableHead>
                    <TableHead>Seviye</TableHead>
                    <TableHead>Zafiyet</TableHead>
                    <TableHead>Son Görülme</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedAssets.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Varlık bulunamadı</TableCell></TableRow>
                  ) : (
                    paginatedAssets.map((asset) => (
                      <TableRow key={asset.id}>
                        <TableCell className="font-medium">{asset.asset}</TableCell>
                        <TableCell className="font-mono text-sm">{asset.ip}:{asset.port}</TableCell>
                        <TableCell><Badge variant="outline">{asset.service}</Badge></TableCell>
                        <TableCell>{getExposureBadge(asset.exposureLevel)}</TableCell>
                        <TableCell className="max-w-xs truncate">{asset.vulnerability}</TableCell>
                        <TableCell className="text-muted-foreground">{asset.lastSeen}</TableCell>
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
