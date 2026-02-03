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
import { ChevronLeft, ChevronRight, RefreshCw, Search, Shield, CheckCircle, XCircle, ArrowRight } from 'lucide-react';

interface FirewallPolicy {
  id: string;
  policyId: number;
  name: string | null;
  action: string;
  srcInterface: string | null;
  dstInterface: string | null;
  srcAddresses: string[] | null;
  dstAddresses: string[] | null;
  services: string[] | null;
  schedule: string | null;
  hitCount: string;
  lastHit: string | null;
  device: {
    name: string;
    fortiDeviceId: string;
  };
}

const ITEMS_PER_PAGE = 15;

export default function FirewallPoliciesPage() {
  const [policies, setPolicies] = useState<FirewallPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const fetchPolicies = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/firewall-policies');
      const data = await res.json();
      if (data.success) {
        setPolicies(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch policies:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPolicies();
  }, []);

  const filteredPolicies = useMemo(() => {
    if (!searchTerm) return policies;
    const term = searchTerm.toLowerCase();
    return policies.filter(
      (p) =>
        (p.name?.toLowerCase() || '').includes(term) ||
        p.policyId.toString().includes(term) ||
        (p.srcInterface?.toLowerCase() || '').includes(term) ||
        (p.dstInterface?.toLowerCase() || '').includes(term)
    );
  }, [policies, searchTerm]);

  const totalPages = Math.ceil(filteredPolicies.length / ITEMS_PER_PAGE);
  const paginatedPolicies = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredPolicies.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredPolicies, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) setCurrentPage(1);
  }, [totalPages, currentPage]);

  const getActionBadge = (action: string) => {
    switch (action.toLowerCase()) {
      case 'accept': return <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Accept</Badge>;
      case 'deny': return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Deny</Badge>;
      default: return <Badge variant="outline">{action}</Badge>;
    }
  };

  const formatAddresses = (addresses: string[] | null) => {
    if (!addresses || addresses.length === 0) return 'Any';
    if (addresses.length <= 2) return addresses.join(', ');
    return `${addresses[0]}, ${addresses[1]} +${addresses.length - 2}`;
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
          <h1 className="text-2xl font-bold">Firewall Policies</h1>
          <p className="text-muted-foreground">FortiGate güvenlik politikaları</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={fetchPolicies} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-blue-500/20"><Shield className="h-5 w-5 text-blue-500" /></div>
            <div><p className="text-sm text-muted-foreground">Toplam Policy</p><p className="text-2xl font-bold">{policies.length}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-green-500/20"><CheckCircle className="h-5 w-5 text-green-500" /></div>
            <div><p className="text-sm text-muted-foreground">Accept</p><p className="text-2xl font-bold">{policies.filter((p) => p.action === 'accept').length}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-red-500/20"><XCircle className="h-5 w-5 text-red-500" /></div>
            <div><p className="text-sm text-muted-foreground">Deny</p><p className="text-2xl font-bold">{policies.filter((p) => p.action === 'deny').length}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-orange-500/20"><ArrowRight className="h-5 w-5 text-orange-500" /></div>
            <div><p className="text-sm text-muted-foreground">Toplam Hit</p><p className="text-2xl font-bold">{policies.reduce((acc, p) => acc + Number(p.hitCount), 0).toLocaleString()}</p></div>
          </div>
        </CardContent></Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Policy ID veya isim ara..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} className="pl-9" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />Firewall Policies<Badge variant="secondary">{filteredPolicies.length}</Badge></CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">ID</TableHead>
                    <TableHead>İsim</TableHead>
                    <TableHead>Kaynak</TableHead>
                    <TableHead>Hedef</TableHead>
                    <TableHead>Servis</TableHead>
                    <TableHead>İşlem</TableHead>
                    <TableHead className="text-right">Hit Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedPolicies.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Policy bulunamadı</TableCell></TableRow>
                  ) : (
                    paginatedPolicies.map((policy) => (
                      <TableRow key={policy.id}>
                        <TableCell className="font-mono text-sm">{policy.policyId}</TableCell>
                        <TableCell className="font-medium">{policy.name || '-'}</TableCell>
                        <TableCell>
                          <div className="text-xs text-muted-foreground">{policy.srcInterface || 'Any'}</div>
                          <div className="text-xs">{formatAddresses(policy.srcAddresses)}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs text-muted-foreground">{policy.dstInterface || 'Any'}</div>
                          <div className="text-xs">{formatAddresses(policy.dstAddresses)}</div>
                        </TableCell>
                        <TableCell className="text-xs">{formatAddresses(policy.services)}</TableCell>
                        <TableCell>{getActionBadge(policy.action)}</TableCell>
                        <TableCell className="text-right font-mono">{Number(policy.hitCount).toLocaleString()}</TableCell>
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
