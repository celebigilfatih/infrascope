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
import { ChevronLeft, ChevronRight, RefreshCw, Search, Clock, Calendar, Activity, Zap } from 'lucide-react';

interface TimelineEvent {
  id: string;
  timestamp: string;
  event: string;
  category: 'system' | 'security' | 'network' | 'service' | 'user';
  severity: 'info' | 'warning' | 'error' | 'critical';
  source: string;
  details: string;
}

const ITEMS_PER_PAGE = 10;

export default function TimelinePage() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setTimeout(() => {
      setEvents([
        { id: '1', timestamp: '2024-01-15 10:30:25', event: 'System backup completed successfully', category: 'system', severity: 'info', source: 'backup-server', details: 'Full backup of all databases completed in 45 minutes' },
        { id: '2', timestamp: '2024-01-15 10:28:10', event: 'Unauthorized login attempt detected', category: 'security', severity: 'warning', source: 'auth-server', details: 'Failed login from IP 192.168.1.100 (3 attempts)' },
        { id: '3', timestamp: '2024-01-15 10:25:45', event: 'Network switch SW-001 went offline', category: 'network', severity: 'error', source: 'monitoring', details: 'Switch lost connectivity - investigating cause' },
        { id: '4', timestamp: '2024-01-15 10:20:30', event: 'Service deployment completed', category: 'service', severity: 'info', source: 'deploy-bot', details: 'API Gateway v2.2.0 deployed to production' },
        { id: '5', timestamp: '2024-01-15 10:15:18', event: 'SSL certificate expiring soon', category: 'security', severity: 'warning', source: 'cert-monitor', details: 'Certificate CERT-001 expires in 5 days' },
        { id: '6', timestamp: '2024-01-15 10:10:55', event: 'Database connection pool exhausted', category: 'system', severity: 'error', source: 'db-primary', details: 'Connection pool reached max capacity (200 connections)' },
        { id: '7', timestamp: '2024-01-15 10:05:40', event: 'User session timeout', category: 'user', severity: 'info', source: 'auth-server', details: 'User john.doe session expired after 8 hours' },
        { id: '8', timestamp: '2024-01-15 10:00:25', event: 'VLAN configuration changed', category: 'network', severity: 'info', source: 'network-admin', details: 'VLAN 200 created on core switch' },
        { id: '9', timestamp: '2024-01-15 09:55:12', event: 'Disk usage alert', category: 'system', severity: 'warning', source: 'storage-01', details: 'Partition /data is 85% full (1.7TB/2TB)' },
        { id: '10', timestamp: '2024-01-15 09:50:08', event: 'API rate limit triggered', category: 'service', severity: 'warning', source: 'api-gateway', details: 'Client api-client exceeded 1000 req/min limit' },
        { id: '11', timestamp: '2024-01-15 09:45:30', event: 'Security patch applied', category: 'security', severity: 'info', source: 'patch-manager', details: 'CVE-2024-1234 patch applied to all servers' },
        { id: '12', timestamp: '2024-01-15 09:40:15', event: 'Load balancer health check failed', category: 'network', severity: 'error', source: 'lb-01', details: 'Backend server db-002 failed health check' },
        { id: '13', timestamp: '2024-01-15 09:35:00', event: 'New user account created', category: 'user', severity: 'info', source: 'admin-panel', details: 'New user jane.smith added to Engineering group' },
        { id: '14', timestamp: '2024-01-15 09:30:45', event: 'DNS zone transfer completed', category: 'network', severity: 'info', source: 'dns-master', details: 'Zone internal.company.com synced to secondary DNS' },
        { id: '15', timestamp: '2024-01-15 09:25:20', event: 'Critical service down', category: 'service', severity: 'critical', source: 'monitoring', details: 'Payment processing service unavailable - P1 incident' },
      ]);
      setLoading(false);
    }, 500);
  }, []);

  const filteredEvents = useMemo(() => {
    if (!searchTerm) return events;
    const term = searchTerm.toLowerCase();
    return events.filter(event => 
      event.event.toLowerCase().includes(term) ||
      event.source.toLowerCase().includes(term) ||
      event.category.toLowerCase().includes(term) ||
      event.details.toLowerCase().includes(term)
    );
  }, [events, searchTerm]);

  const totalPages = Math.ceil(filteredEvents.length / ITEMS_PER_PAGE);
  const paginatedEvents = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredEvents.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredEvents, currentPage]);

  useEffect(() => { if (currentPage > totalPages && totalPages > 0) setCurrentPage(1); }, [totalPages, currentPage]);

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical': return <Badge variant="destructive">Critical</Badge>;
      case 'error': return <Badge className="bg-red-500">Error</Badge>;
      case 'warning': return <Badge className="bg-orange-500">Warning</Badge>;
      case 'info': return <Badge className="bg-blue-500">Info</Badge>;
      default: return <Badge variant="secondary">{severity}</Badge>;
    }
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'system': return <Badge variant="outline">System</Badge>;
      case 'security': return <Badge className="bg-red-500/20 text-red-500">Security</Badge>;
      case 'network': return <Badge className="bg-blue-500/20 text-blue-500">Network</Badge>;
      case 'service': return <Badge className="bg-purple-500/20 text-purple-500">Service</Badge>;
      case 'user': return <Badge className="bg-green-500/20 text-green-500">User</Badge>;
      default: return <Badge variant="secondary">{category}</Badge>;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'border-l-red-500';
      case 'error': return 'border-l-red-400';
      case 'warning': return 'border-l-orange-500';
      default: return 'border-l-blue-500';
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

  const criticalCount = events.filter(e => e.severity === 'critical').length;
  const errorCount = events.filter(e => e.severity === 'error').length;
  const warningCount = events.filter(e => e.severity === 'warning').length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Audit Timeline</h1>
          <p className="text-muted-foreground">Olay zaman çizelgesi ve aktivite logları</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon"><RefreshCw className="h-4 w-4" /></Button>
          <Button><Clock className="h-4 w-4 mr-2" />Yenile</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-500/20"><Activity className="h-5 w-5 text-blue-500" /></div>
              <div><p className="text-sm text-muted-foreground">Toplam Olay</p><p className="text-2xl font-bold">{events.length}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-red-500/20"><Zap className="h-5 w-5 text-red-500" /></div>
              <div><p className="text-sm text-muted-foreground">Kritik</p><p className="text-2xl font-bold">{criticalCount}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-orange-500/20"><Activity className="h-5 w-5 text-orange-500" /></div>
              <div><p className="text-sm text-muted-foreground">Hata</p><p className="text-2xl font-bold">{errorCount}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-yellow-500/20"><Calendar className="h-5 w-5 text-yellow-500" /></div>
              <div><p className="text-sm text-muted-foreground">Uyarı</p><p className="text-2xl font-bold">{warningCount}</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Olay ara..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} className="pl-9" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" />Audit Timeline<Badge variant="secondary">{filteredEvents.length}</Badge></CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Zaman</TableHead>
                    <TableHead>Olay</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Kaynak</TableHead>
                    <TableHead>Önem</TableHead>
                    <TableHead>Detaylar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedEvents.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sonuç bulunamadı</TableCell></TableRow>
                  ) : (
                    paginatedEvents.map((event) => (
                      <TableRow key={event.id} className={`border-l-4 ${getSeverityColor(event.severity)}`}>
                        <TableCell className="font-mono text-sm whitespace-nowrap">{event.timestamp}</TableCell>
                        <TableCell className="font-medium">{event.event}</TableCell>
                        <TableCell>{getCategoryBadge(event.category)}</TableCell>
                        <TableCell className="text-muted-foreground">{event.source}</TableCell>
                        <TableCell>{getSeverityBadge(event.severity)}</TableCell>
                        <TableCell className="text-muted-foreground max-w-xs truncate" title={event.details}>{event.details}</TableCell>
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
