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
import { ChevronLeft, ChevronRight, RefreshCw, Search, AlertTriangle, Clock, Server, Shield } from 'lucide-react';

interface DriftItem {
  id: string;
  resource: string;
  type: 'configuration' | 'state' | 'compliance' | 'security';
  expected: string;
  actual: string;
  drift: number;
  lastScan: string;
  status: 'compliant' | 'warning' | 'violation';
  severity: 'low' | 'medium' | 'high';
}

const ITEMS_PER_PAGE = 10;

export default function DriftPage() {
  const [driftItems, setDriftItems] = useState<DriftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setTimeout(() => {
      setDriftItems([
        { id: '1', resource: 'Database Server DB-001', type: 'configuration', expected: 'max_connections=100', actual: 'max_connections=150', drift: 50, lastScan: '2024-01-15 10:30', status: 'warning', severity: 'medium' },
        { id: '2', resource: 'Load Balancer LB-01', type: 'state', expected: 'active', actual: 'standby', drift: 100, lastScan: '2024-01-15 10:28', status: 'violation', severity: 'high' },
        { id: '3', resource: 'Firewall Policy FW-100', type: 'compliance', expected: 'Rule #42: Allow SSH from 10.0.0.0/8', actual: 'Rule #42: Allow SSH from 0.0.0.0/0', drift: 100, lastScan: '2024-01-15 10:25', status: 'violation', severity: 'high' },
        { id: '4', resource: 'SSL Certificate CERT-001', type: 'security', expected: 'Valid until 2024-12-31', actual: 'Valid until 2024-01-20', drift: 80, lastScan: '2024-01-15 10:20', status: 'warning', severity: 'high' },
        { id: '5', resource: 'API Gateway GW-01', type: 'configuration', expected: 'rate_limit=1000/min', actual: 'rate_limit=950/min', drift: 5, lastScan: '2024-01-15 10:15', status: 'compliant', severity: 'low' },
        { id: '6', resource: 'Cache Cluster CACHE-01', type: 'state', expected: 'nodes=3', actual: 'nodes=3', drift: 0, lastScan: '2024-01-15 10:10', status: 'compliant', severity: 'low' },
        { id: '7', resource: 'Backup System BACKUP-01', type: 'compliance', expected: 'retention=30 days', actual: 'retention=7 days', drift: 77, lastScan: '2024-01-15 10:05', status: 'violation', severity: 'medium' },
        { id: '8', resource: 'DNS Server DNS-01', type: 'configuration', expected: 'ttl=3600', actual: 'ttl=300', drift: 8, lastScan: '2024-01-15 10:00', status: 'compliant', severity: 'low' },
        { id: '9', resource: 'VPN Gateway VPN-01', type: 'security', expected: 'encryption=AES-256', actual: 'encryption=AES-128', drift: 50, lastScan: '2024-01-15 09:55', status: 'warning', severity: 'high' },
        { id: '10', resource: 'Monitoring Agent MON-001', type: 'state', expected: 'version=2.5.0', actual: 'version=2.4.5', drift: 20, lastScan: '2024-01-15 09:50', status: 'warning', severity: 'medium' },
        { id: '11', resource: 'Storage Array STG-01', type: 'configuration', expected: 'raid_level=RAID-10', actual: 'raid_level=RAID-5', drift: 100, lastScan: '2024-01-15 09:45', status: 'violation', severity: 'high' },
        { id: '12', resource: 'User Directory LDAP-01', type: 'compliance', expected: 'password_policy=strong', actual: 'password_policy=medium', drift: 33, lastScan: '2024-01-15 09:40', status: 'warning', severity: 'medium' },
      ]);
      setLoading(false);
    }, 500);
  }, []);

  const filteredDrift = useMemo(() => {
    if (!searchTerm) return driftItems;
    const term = searchTerm.toLowerCase();
    return driftItems.filter(item => 
      item.resource.toLowerCase().includes(term) ||
      item.type.toLowerCase().includes(term)
    );
  }, [driftItems, searchTerm]);

  const totalPages = Math.ceil(filteredDrift.length / ITEMS_PER_PAGE);
  const paginatedDrift = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredDrift.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredDrift, currentPage]);

  useEffect(() => { if (currentPage > totalPages && totalPages > 0) setCurrentPage(1); }, [totalPages, currentPage]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'compliant': return <Badge className="bg-green-500">Compliant</Badge>;
      case 'warning': return <Badge className="bg-orange-500">Warning</Badge>;
      case 'violation': return <Badge variant="destructive">Violation</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'high': return <Badge variant="destructive">High</Badge>;
      case 'medium': return <Badge className="bg-orange-500">Medium</Badge>;
      case 'low': return <Badge className="bg-green-500">Low</Badge>;
      default: return <Badge variant="secondary">{severity}</Badge>;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'configuration': return <Server className="h-4 w-4 text-blue-500" />;
      case 'security': return <Shield className="h-4 w-4 text-red-500" />;
      case 'compliance': return <Shield className="h-4 w-4 text-purple-500" />;
      default: return <AlertTriangle className="h-4 w-4 text-orange-500" />;
    }
  };

  const getDriftColor = (drift: number) => {
    if (drift === 0) return 'bg-green-500';
    if (drift < 20) return 'bg-orange-500';
    return 'bg-red-500';
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

  const compliantCount = driftItems.filter(d => d.status === 'compliant').length;
  const violationCount = driftItems.filter(d => d.status === 'violation').length;
  const avgDrift = Math.round(driftItems.reduce((acc, d) => acc + d.drift, 0) / driftItems.length);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Configuration Drift</h1>
          <p className="text-muted-foreground">Yapılandırma sapması tespiti</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon"><RefreshCw className="h-4 w-4" /></Button>
          <Button><AlertTriangle className="h-4 w-4 mr-2" />Yenile</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-500/20"><Server className="h-5 w-5 text-blue-500" /></div>
              <div><p className="text-sm text-muted-foreground">İzlenen Kaynak</p><p className="text-2xl font-bold">{driftItems.length}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-500/20"><Shield className="h-5 w-5 text-green-500" /></div>
              <div><p className="text-sm text-muted-foreground">Uyumlu</p><p className="text-2xl font-bold">{compliantCount}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-red-500/20"><AlertTriangle className="h-5 w-5 text-red-500" /></div>
              <div><p className="text-sm text-muted-foreground">İhlal</p><p className="text-2xl font-bold">{violationCount}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-orange-500/20"><Clock className="h-5 w-5 text-orange-500" /></div>
              <div><p className="text-sm text-muted-foreground">Ort. Sapma</p><p className="text-2xl font-bold">{avgDrift}%</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Kaynak ara..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} className="pl-9" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" />Configuration Drift<Badge variant="secondary">{filteredDrift.length}</Badge></CardTitle>
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
                    <TableHead>Tip</TableHead>
                    <TableHead>Beklenen</TableHead>
                    <TableHead>Gerçek</TableHead>
                    <TableHead className="text-center">Sapma</TableHead>
                    <TableHead>Son Tarama</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead>Önem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedDrift.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Sonuç bulunamadı</TableCell></TableRow>
                  ) : (
                    paginatedDrift.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.resource}</TableCell>
                        <TableCell><div className="flex items-center gap-2">{getTypeIcon(item.type)}{item.type}</div></TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">{item.expected}</TableCell>
                        <TableCell className="font-mono text-sm">{item.actual}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden"><div className={`h-full ${getDriftColor(item.drift)}`} style={{ width: `${item.drift}%` }}></div></div>
                            <span className={`font-mono ${item.drift > 50 ? 'text-red-500' : item.drift > 0 ? 'text-orange-500' : 'text-green-500'}`}>{item.drift}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{item.lastScan}</TableCell>
                        <TableCell>{getStatusBadge(item.status)}</TableCell>
                        <TableCell>{getSeverityBadge(item.severity)}</TableCell>
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
