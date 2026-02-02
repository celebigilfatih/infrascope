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
import { ChevronLeft, ChevronRight, RefreshCw, Search, Shield, ShieldAlert, Activity } from 'lucide-react';

interface IPSEvent {
  id: string;
  timestamp: string;
  sourceIP: string;
  destIP: string;
  signature: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  action: 'blocked' | 'detected' | 'ignored';
  interface: string;
}

const ITEMS_PER_PAGE = 12;

export default function IPSPage() {
  const [events, setEvents] = useState<IPSEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setTimeout(() => {
      setEvents([
        { id: '1', timestamp: '2024-01-15 14:32:10', sourceIP: '203.0.113.45', destIP: '10.0.10.5', signature: 'SQL Injection Attempt', severity: 'critical', action: 'blocked', interface: 'WAN' },
        { id: '2', timestamp: '2024-01-15 14:31:45', sourceIP: '198.51.100.22', destIP: '10.0.10.10', signature: 'Port Scan', severity: 'high', action: 'blocked', interface: 'WAN' },
        { id: '3', timestamp: '2024-01-15 14:30:22', sourceIP: '10.0.2.50', destIP: '10.0.10.1', signature: 'Brute Force SSH', severity: 'high', action: 'blocked', interface: 'LAN' },
        { id: '4', timestamp: '2024-01-15 14:28:15', sourceIP: '192.0.2.100', destIP: '10.0.20.5', signature: 'XSS Attempt', severity: 'medium', action: 'detected', interface: 'DMZ' },
        { id: '5', timestamp: '2024-01-15 14:25:33', sourceIP: '203.0.113.88', destIP: '10.0.10.5', signature: 'Malware Download', severity: 'critical', action: 'blocked', interface: 'WAN' },
        { id: '6', timestamp: '2024-01-15 14:22:10', sourceIP: '10.0.3.25', destIP: '10.0.50.1', signature: 'Unauthorized Access', severity: 'high', action: 'blocked', interface: 'LAN' },
        { id: '7', timestamp: '2024-01-15 14:20:05', sourceIP: '198.51.100.55', destIP: '10.0.10.15', signature: 'DDoS Attack', severity: 'critical', action: 'blocked', interface: 'WAN' },
        { id: '8', timestamp: '2024-01-15 14:18:42', sourceIP: '192.0.2.200', destIP: '10.0.20.10', signature: 'Phishing Link', severity: 'medium', action: 'detected', interface: 'DMZ' },
        { id: '9', timestamp: '2024-01-15 14:15:20', sourceIP: '10.0.4.100', destIP: '10.0.10.1', signature: 'DNS Tunneling', severity: 'high', action: 'blocked', interface: 'LAN' },
        { id: '10', timestamp: '2024-01-15 14:12:15', sourceIP: '203.0.113.99', destIP: '10.0.10.5', signature: 'Buffer Overflow', severity: 'critical', action: 'blocked', interface: 'WAN' },
      ]);
      setLoading(false);
    }, 500);
  }, []);

  const filteredEvents = useMemo(() => {
    if (!searchTerm) return events;
    const term = searchTerm.toLowerCase();
    return events.filter((e) => e.signature.toLowerCase().includes(term) || e.sourceIP.includes(term) || e.destIP.includes(term));
  }, [events, searchTerm]);

  const totalPages = Math.ceil(filteredEvents.length / ITEMS_PER_PAGE);
  const paginatedEvents = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredEvents.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredEvents, currentPage]);

  useEffect(() => { if (currentPage > totalPages && totalPages > 0) setCurrentPage(1); }, [totalPages, currentPage]);

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical': return <Badge className="bg-red-600">Critical</Badge>;
      case 'high': return <Badge variant="destructive">High</Badge>;
      case 'medium': return <Badge className="bg-orange-500">Medium</Badge>;
      case 'low': return <Badge variant="secondary">Low</Badge>;
      default: return <Badge variant="outline">{severity}</Badge>;
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'blocked': return <Badge variant="success"><Shield className="h-3 w-3 mr-1" />Blocked</Badge>;
      case 'detected': return <Badge className="bg-orange-500"><Activity className="h-3 w-3 mr-1" />Detected</Badge>;
      case 'ignored': return <Badge variant="secondary">Ignored</Badge>;
      default: return <Badge variant="outline">{action}</Badge>;
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
          <h1 className="text-2xl font-bold">IPS Events</h1>
          <p className="text-muted-foreground">Saldırı Önleme Sistemi olayları</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon"><RefreshCw className="h-4 w-4" /></Button>
          <Button><Shield className="h-4 w-4 mr-2" />Yapılandır</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-blue-500/20"><Shield className="h-5 w-5 text-blue-500" /></div>
            <div><p className="text-sm text-muted-foreground">Toplam Olay</p><p className="text-2xl font-bold">{events.length}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-red-500/20"><ShieldAlert className="h-5 w-5 text-red-500" /></div>
            <div><p className="text-sm text-muted-foreground">Kritik/High</p><p className="text-2xl font-bold">{events.filter((e) => e.severity === 'critical' || e.severity === 'high').length}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-green-500/20"><Shield className="h-5 w-5 text-green-500" /></div>
            <div><p className="text-sm text-muted-foreground">Engellendi</p><p className="text-2xl font-bold">{events.filter((e) => e.action === 'blocked').length}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-purple-500/20"><Activity className="h-5 w-5 text-purple-500" /></div>
            <div><p className="text-sm text-muted-foreground">Bugün</p><p className="text-2xl font-bold">{events.length}</p></div>
          </div>
        </CardContent></Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Olay ara... (imza, IP)" value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} className="pl-9" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />IPS Events<Badge variant="secondary">{filteredEvents.length}</Badge></CardTitle>
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
                    <TableHead>İmza</TableHead>
                    <TableHead>Kaynak IP</TableHead>
                    <TableHead>Hedef IP</TableHead>
                    <TableHead>Interface</TableHead>
                    <TableHead>Seviye</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedEvents.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Olay bulunamadı</TableCell></TableRow>
                  ) : (
                    paginatedEvents.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell className="font-mono text-sm">{event.timestamp.split(' ')[1]}</TableCell>
                        <TableCell className="font-medium">{event.signature}</TableCell>
                        <TableCell className="font-mono text-sm">{event.sourceIP}</TableCell>
                        <TableCell className="font-mono text-sm">{event.destIP}</TableCell>
                        <TableCell><Badge variant="outline">{event.interface}</Badge></TableCell>
                        <TableCell>{getSeverityBadge(event.severity)}</TableCell>
                        <TableCell>{getActionBadge(event.action)}</TableCell>
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
