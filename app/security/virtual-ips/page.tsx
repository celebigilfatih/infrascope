'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Globe,
  Search,
  RefreshCw,
  AlertCircle,
  ArrowRightLeft,
  Shield,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Wifi,
} from 'lucide-react';

interface VirtualIP {
  name: string;
  id: number;
  comment: string;
  type: string;
  extip: string;
  extintf: string;
  mappedip: Array<{ range: string }>;
  extport: string;
  mappedport: string;
  protocol: string;
  portforward: string;
  status: string;
  color: number;
  'src-filter': Array<{ range: string }>;
  'ssl-mode': string;
  'ssl-certificate': string;
  'arp-reply': string;
  'nat-source-vip': string;
  'portmapping-type': string;
}

const ITEMS_PER_PAGE = 15;

export default function VirtualIPsPage() {
  const [vips, setVips] = useState<VirtualIP[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchVIPs();
    const interval = setInterval(fetchVIPs, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchVIPs = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/integrations/fortigate?vpn=vip');
      const result = await response.json();
      if (result.success && Array.isArray(result.data)) {
        setVips(result.data);
      } else {
        setError(result.error || 'Virtual IP verileri yüklenemedi');
      }
    } catch (err) {
      setError('Virtual IP listesi alınamadı');
      console.error('Failed to fetch VIPs:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredVips = useMemo(() => {
    if (!searchTerm) return vips;
    const term = searchTerm.toLowerCase();
    return vips.filter((vip: VirtualIP) =>
      (vip.name || '').toLowerCase().includes(term) ||
      (vip.extip || '').toLowerCase().includes(term) ||
      (vip.comment || '').toLowerCase().includes(term) ||
      (vip.extintf || '').toLowerCase().includes(term) ||
      (vip.mappedip || []).some((m: { range: string }) => (m.range || '').toLowerCase().includes(term))
    );
  }, [vips, searchTerm]);

  const totalPages = Math.ceil(filteredVips.length / ITEMS_PER_PAGE);
  const paginatedVips = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredVips.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredVips, currentPage]);

  const enabledCount = useMemo(() => vips.filter((v: VirtualIP) => v.status === 'enable').length, [vips]);
  const portForwardCount = useMemo(() => vips.filter((v: VirtualIP) => v.portforward === 'enable').length, [vips]);
  const uniqueInterfaces = useMemo(() => [...new Set(vips.map((v: VirtualIP) => v.extintf).filter(Boolean))], [vips]);

  const getMappedIPs = (vip: VirtualIP) => {
    if (!vip.mappedip || !Array.isArray(vip.mappedip)) return '-';
    return vip.mappedip.map((m: { range: string }) => m.range).join(', ') || '-';
  };

  const getStatusBadge = (status?: string) => {
    if (status === 'enable') return <Badge className="bg-green-600 text-white">Aktif</Badge>;
    return <Badge className="bg-gray-500 text-white">Pasif</Badge>;
  };

  const getTypeBadge = (type?: string) => {
    switch (type) {
      case 'static-nat': return <Badge className="bg-blue-600 text-white">Statik NAT</Badge>;
      case 'server-load-balance': return <Badge className="bg-purple-600 text-white">Yük Dengeleme</Badge>;
      case 'dns-translation': return <Badge className="bg-teal-600 text-white">DNS Çeviri</Badge>;
      case 'fqdn': return <Badge className="bg-indigo-600 text-white">FQDN</Badge>;
      default: return <Badge className="bg-slate-600 text-white">{type || 'Statik NAT'}</Badge>;
    }
  };

  const getPortForwardBadge = (pf?: string) => {
    if (pf === 'enable') return <Badge className="bg-amber-600 text-white">Evet</Badge>;
    return <Badge variant="outline">Hayır</Badge>;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Virtual IP (VIP) Listesi</h1>
          <p className="text-muted-foreground">
            FortiGate üzerindeki Virtual IP (DNAT) kuralları
          </p>
        </div>
        <Button onClick={fetchVIPs} variant="outline" disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-blue-500/20"><Globe className="h-5 w-5 text-blue-500" /></div>
            <div><p className="text-sm text-muted-foreground">Toplam VIP</p><p className="text-2xl font-bold">{vips.length}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-green-500/20"><Shield className="h-5 w-5 text-green-500" /></div>
            <div><p className="text-sm text-muted-foreground">Aktif</p><p className="text-2xl font-bold">{enabledCount}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-amber-500/20"><ArrowRightLeft className="h-5 w-5 text-amber-500" /></div>
            <div><p className="text-sm text-muted-foreground">Port Forward</p><p className="text-2xl font-bold">{portForwardCount}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-purple-500/20"><Wifi className="h-5 w-5 text-purple-500" /></div>
            <div><p className="text-sm text-muted-foreground">Interface</p><p className="text-2xl font-bold">{uniqueInterfaces.length}</p></div>
          </div>
        </CardContent></Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="VIP adı, IP, interface veya açıklama ara..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} className="pl-9" />
      </div>

      {/* VIP Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ExternalLink className="h-5 w-5" />
            Virtual IP Kuralları
            <Badge variant="secondary">{filteredVips.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-primary" /></div>
          ) : error ? (
            <div className="flex items-center gap-2 p-4 bg-destructive/10 rounded-lg">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <span className="text-destructive">{error}</span>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Durum</TableHead>
                    <TableHead>Ad</TableHead>
                    <TableHead>Tür</TableHead>
                    <TableHead>Harici IP</TableHead>
                    <TableHead>Harici Port</TableHead>
                    <TableHead>Dahili IP</TableHead>
                    <TableHead>Dahili Port</TableHead>
                    <TableHead>Interface</TableHead>
                    <TableHead>Port Forward</TableHead>
                    <TableHead>Açıklama</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedVips.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Virtual IP bulunamadı</TableCell>
                    </TableRow>
                  ) : (
                    paginatedVips.map((vip: VirtualIP, idx: number) => (
                      <TableRow key={vip.name || idx}>
                        <TableCell>{getStatusBadge(vip.status)}</TableCell>
                        <TableCell className="font-medium">{vip.name || '-'}</TableCell>
                        <TableCell>{getTypeBadge(vip.type)}</TableCell>
                        <TableCell className="font-mono text-xs">{vip.extip || '-'}</TableCell>
                        <TableCell className="font-mono text-xs">{vip.extport || '-'}</TableCell>
                        <TableCell className="font-mono text-xs">{getMappedIPs(vip)}</TableCell>
                        <TableCell className="font-mono text-xs">{vip.mappedport || '-'}</TableCell>
                        <TableCell className="text-xs">{vip.extintf || 'any'}</TableCell>
                        <TableCell>{getPortForwardBadge(vip.portforward)}</TableCell>
                        <TableCell className="max-w-xs text-xs text-muted-foreground truncate" title={vip.comment}>{vip.comment || '-'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">Sayfa {currentPage} / {totalPages} ({filteredVips.length} kayıt)</p>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft className="h-4 w-4" /></Button>
                    <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight className="h-4 w-4" /></Button>
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
