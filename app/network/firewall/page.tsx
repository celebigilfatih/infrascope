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
import { ChevronLeft, ChevronRight, RefreshCw, Search, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';

interface FirewallRule {
  id: string;
  name: string;
  source: string;
  destination: string;
  service: string;
  action: 'allow' | 'deny' | 'reject';
  interface: string;
  hits: number;
  lastHit: string;
  status: 'active' | 'inactive';
}

const ITEMS_PER_PAGE = 12;

export default function FirewallPage() {
  const [rules, setRules] = useState<FirewallRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setTimeout(() => {
      setRules([
        { id: '1', name: 'Allow-HTTP', source: 'Any', destination: '10.0.10.5', service: 'TCP/80', action: 'allow', interface: 'WAN', hits: 15420, lastHit: '1 min ago', status: 'active' },
        { id: '2', name: 'Allow-HTTPS', source: 'Any', destination: '10.0.10.5', service: 'TCP/443', action: 'allow', interface: 'WAN', hits: 28340, lastHit: '30 sec ago', status: 'active' },
        { id: '3', name: 'Deny-All-Ext', source: 'Internet', destination: 'Any', service: 'Any', action: 'deny', interface: 'WAN', hits: 892, lastHit: '5 min ago', status: 'active' },
        { id: '4', name: 'Allow-DNS', source: 'Internal', destination: '10.0.10.1', service: 'UDP/53', action: 'allow', interface: 'LAN', hits: 56780, lastHit: '10 sec ago', status: 'active' },
        { id: '5', name: 'Allow-SSH-Management', source: '10.0.0.0/24', destination: '10.0.10.10', service: 'TCP/22', action: 'allow', interface: 'MGMT', hits: 45, lastHit: '1 hour ago', status: 'active' },
        { id: '6', name: 'Block-Malware-IPs', source: 'Any', destination: 'Any', service: 'Any', action: 'deny', interface: 'WAN', hits: 234, lastHit: '2 hours ago', status: 'active' },
        { id: '7', name: 'Allow-ERP', source: '192.168.1.0/24', destination: '10.0.20.10', service: 'TCP/8080', action: 'allow', interface: 'DMZ', hits: 2340, lastHit: '15 min ago', status: 'active' },
        { id: '8', name: 'Deny-Gaming', source: '192.168.1.0/24', destination: 'Any', service: 'Any', action: 'deny', interface: 'GUEST', hits: 567, lastHit: '30 min ago', status: 'active' },
        { id: '9', name: 'Allow-VPN', source: 'Any', destination: '10.0.50.1', service: 'UDP/1194', action: 'allow', interface: 'WAN', hits: 890, lastHit: '45 min ago', status: 'active' },
        { id: '10', name: 'Block-P2P', source: 'Any', destination: 'Any', service: 'Any', action: 'reject', interface: 'WAN', hits: 123, lastHit: '3 hours ago', status: 'active' },
      ]);
      setLoading(false);
    }, 500);
  }, []);

  const filteredRules = useMemo(() => {
    if (!searchTerm) return rules;
    const term = searchTerm.toLowerCase();
    return rules.filter(
      (r) =>
        r.name.toLowerCase().includes(term) ||
        r.source.toLowerCase().includes(term) ||
        r.destination.toLowerCase().includes(term) ||
        r.service.toLowerCase().includes(term)
    );
  }, [rules, searchTerm]);

  const totalPages = Math.ceil(filteredRules.length / ITEMS_PER_PAGE);
  const paginatedRules = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredRules.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredRules, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'allow':
        return <Badge variant="success"><ShieldCheck className="h-3 w-3 mr-1" />Allow</Badge>;
      case 'deny':
        return <Badge variant="destructive"><ShieldAlert className="h-3 w-3 mr-1" />Deny</Badge>;
      case 'reject':
        return <Badge className="bg-orange-500"><ShieldAlert className="h-3 w-3 mr-1" />Reject</Badge>;
      default:
        return <Badge variant="outline">{action}</Badge>;
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
          <h1 className="text-2xl font-bold">Firewall Rules</h1>
          <p className="text-muted-foreground">Güvenlik duvarı kural yapılandırması</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button>
            <Shield className="h-4 w-4 mr-2" />
            Kural Ekle
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-500/20">
                <Shield className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Toplam Kural</p>
                <p className="text-2xl font-bold">{rules.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-500/20">
                <ShieldCheck className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Allow</p>
                <p className="text-2xl font-bold">{rules.filter((r) => r.action === 'allow').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-red-500/20">
                <ShieldAlert className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Deny/Reject</p>
                <p className="text-2xl font-bold">{rules.filter((r) => r.action !== 'allow').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-purple-500/20">
                <Shield className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Toplam Hit</p>
                <p className="text-2xl font-bold">{rules.reduce((acc, r) => acc + r.hits, 0).toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Kural ara... (isim, kaynak, hedef, servis)"
          value={searchTerm}
          onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
          className="pl-9"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Firewall Rules
            <Badge variant="secondary">{filteredRules.length}</Badge>
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
                    <TableHead>Kural</TableHead>
                    <TableHead>Kaynak</TableHead>
                    <TableHead>Hedef</TableHead>
                    <TableHead>Servis</TableHead>
                    <TableHead>Interface</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead className="text-right">Hits</TableHead>
                    <TableHead className="text-right">Son Hit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRules.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        Kural bulunamadı
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedRules.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell className="font-medium">{rule.name}</TableCell>
                        <TableCell className="font-mono text-sm">{rule.source}</TableCell>
                        <TableCell className="font-mono text-sm">{rule.destination}</TableCell>
                        <TableCell>{rule.service}</TableCell>
                        <TableCell><Badge variant="outline">{rule.interface}</Badge></TableCell>
                        <TableCell>{getActionBadge(rule.action)}</TableCell>
                        <TableCell className="text-right">{rule.hits.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{rule.lastHit}</TableCell>
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
