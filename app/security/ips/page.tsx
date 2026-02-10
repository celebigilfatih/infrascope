'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  Activity,
  AlertTriangle,
  ExternalLink,
  Clock,
} from 'lucide-react';

interface IPSEvent {
  id?: string;
  date?: string;
  time?: string;
  itime?: string;
  dtime?: string;
  attack?: string;
  severity?: string;
  action?: string;
  srcip?: string;
  dstip?: string;
  srcport?: string;
  dstport?: string;
  proto?: string;
  service?: string;
  srcintf?: string;
  dstintf?: string;
  srccountry?: string;
  dstcountry?: string;
  policyid?: string;
  policytype?: string;
  msg?: string;
  ref?: string;
  count?: string;
  devname?: string;
  subtype?: string;
  threat?: string;
  threattype?: string;
  threatlevel?: string;
  crlevel?: string;
  attackid?: string;
  [key: string]: unknown;
}

const ITEMS_PER_PAGE = 25;

const formatNumber = (num: string | number | undefined): string => {
  if (!num) return '0';
  const n = typeof num === 'string' ? parseInt(num, 10) : num;
  if (isNaN(n)) return '0';
  return n.toLocaleString('tr-TR');
};

const decodeMsg = (msg: string | undefined): string => {
  if (!msg) return '-';
  try {
    return decodeURIComponent(msg.replace(/%20/g, ' '));
  } catch {
    return msg;
  }
};

const getProtoName = (proto: string | undefined): string => {
  switch (proto) {
    case '6': return 'TCP';
    case '17': return 'UDP';
    case '1': return 'ICMP';
    case '47': return 'GRE';
    default: return proto || '-';
  }
};

export default function IPSPage() {
  const [events, setEvents] = useState<IPSEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/integrations/fortianalyzer?type=ips-critical&limit=200');
      const result = await response.json();
      if (!result.success) {
        setError(result.error || 'IPS verileri alınamadı');
        return;
      }
      setEvents(result.data || []);
    } catch (err) {
      setError('API bağlantı hatası');
      console.error('IPS fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredEvents = useMemo(() => {
    if (!searchTerm) return events;
    const term = searchTerm.toLowerCase();
    return events.filter((e: IPSEvent) =>
      (e.attack || '').toLowerCase().includes(term) ||
      (e.srcip || '').toLowerCase().includes(term) ||
      (e.dstip || '').toLowerCase().includes(term) ||
      (e.msg || '').toLowerCase().includes(term) ||
      (e.devname || '').toLowerCase().includes(term) ||
      (e.srcintf || '').toLowerCase().includes(term) ||
      (e.srccountry || '').toLowerCase().includes(term)
    );
  }, [events, searchTerm]);

  const totalPages = Math.ceil(filteredEvents.length / ITEMS_PER_PAGE);
  const paginatedEvents = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredEvents.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredEvents, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) setCurrentPage(1);
  }, [totalPages, currentPage]);

  // Stats
  const droppedCount = events.filter((e: IPSEvent) => e.action === 'dropped').length;
  const detectedCount = events.filter((e: IPSEvent) => e.action === 'detected').length;
  const uniqueAttacks = useMemo(() => new Set(events.map((e: IPSEvent) => e.attack)).size, [events]);
  const uniqueSources = useMemo(() => new Set(events.map((e: IPSEvent) => e.srcip)).size, [events]);

  const getActionBadge = (action: string | undefined) => {
    switch (action) {
      case 'dropped':
        return <Badge className="bg-red-600 text-white">Dropped</Badge>;
      case 'detected':
        return <Badge className="bg-orange-500 text-white">Detected</Badge>;
      case 'blocked':
        return <Badge className="bg-red-600 text-white">Blocked</Badge>;
      default:
        return <Badge variant="outline">{action || '-'}</Badge>;
    }
  };

  const getSubtypeBadge = (subtype: string | undefined) => {
    switch (subtype) {
      case 'ips':
        return <Badge className="bg-purple-600 text-white">IPS</Badge>;
      case 'anomaly':
        return <Badge className="bg-blue-600 text-white">DoS/Anomaly</Badge>;
      default:
        return <Badge variant="outline">{subtype || '-'}</Badge>;
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
    <div className="p-4 space-y-4 max-w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-8 w-8 text-red-500" />
          <div>
            <h1 className="text-2xl font-bold">IPS / DoS Events</h1>
            <p className="text-sm text-muted-foreground">
              Kritik Seviye Saldırı Önleme Sistemi Olayları (FortiAnalyzer)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-xs text-muted-foreground">Toplam Olay</p>
                <p className="text-2xl font-bold">{formatNumber(events.length)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-xs text-muted-foreground">Dropped</p>
                <p className="text-2xl font-bold text-red-600">{formatNumber(droppedCount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-xs text-muted-foreground">Detected</p>
                <p className="text-2xl font-bold text-orange-500">{formatNumber(detectedCount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-xs text-muted-foreground">Benzersiz Saldırı</p>
                <p className="text-2xl font-bold">{formatNumber(uniqueAttacks)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-cyan-500" />
              <div>
                <p className="text-xs text-muted-foreground">Benzersiz Kaynak</p>
                <p className="text-2xl font-bold">{formatNumber(uniqueSources)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Saldırı, IP, cihaz, ülke ara..."
          value={searchTerm}
          onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5" />
            Kritik IPS İmzaları
            <Badge variant="secondary">{filteredEvents.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">FortiAnalyzer&apos;dan kritik IPS logları alınıyor...</p>
            </div>
          ) : (
            <>
              <Table className="w-full" style={{ tableLayout: 'auto' }}>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 whitespace-nowrap">#</TableHead>
                    <TableHead className="whitespace-nowrap">
                      <div className="flex items-center gap-1"><Clock className="h-3 w-3" />Zaman</div>
                    </TableHead>
                    <TableHead className="whitespace-nowrap">Saldırı / İmza</TableHead>
                    <TableHead className="whitespace-nowrap">Tür</TableHead>
                    <TableHead className="whitespace-nowrap">Aksiyon</TableHead>
                    <TableHead className="whitespace-nowrap">Kaynak IP</TableHead>
                    <TableHead className="whitespace-nowrap">Hedef IP</TableHead>
                    <TableHead className="whitespace-nowrap">Protokol</TableHead>
                    <TableHead className="whitespace-nowrap">Servis</TableHead>
                    <TableHead className="whitespace-nowrap">Tekrar</TableHead>
                    <TableHead className="whitespace-nowrap">Kaynak Ülke</TableHead>
                    <TableHead className="whitespace-nowrap">Interface</TableHead>
                    <TableHead className="whitespace-nowrap">Cihaz</TableHead>
                    <TableHead className="whitespace-nowrap">Ref</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedEvents.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={14} className="text-center py-8 text-muted-foreground">
                        {searchTerm ? 'Aramayla eşleşen olay bulunamadı' : 'Kritik IPS olayı bulunamadı'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedEvents.map((event: IPSEvent, idx: number) => (
                      <TableRow key={event.id || idx}>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {(currentPage - 1) * ITEMS_PER_PAGE + idx + 1}
                        </TableCell>
                        <TableCell className="font-mono text-xs whitespace-nowrap">
                          {event.date && event.time
                            ? `${event.date} ${event.time}`
                            : event.dtime || '-'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-medium max-w-[300px] truncate" title={decodeMsg(event.msg)}>
                          {event.attack || event.threat || '-'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {getSubtypeBadge(event.subtype)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {getActionBadge(event.action)}
                        </TableCell>
                        <TableCell className="font-mono text-sm whitespace-nowrap">
                          {event.srcip || '-'}
                          {event.srcport ? `:${event.srcport}` : ''}
                        </TableCell>
                        <TableCell className="font-mono text-sm whitespace-nowrap">
                          {event.dstip || '-'}
                          {event.dstport ? `:${event.dstport}` : ''}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {getProtoName(event.proto)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {event.service || '-'}
                        </TableCell>
                        <TableCell className="font-mono text-sm whitespace-nowrap font-semibold">
                          {formatNumber(event.count)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {event.srccountry || '-'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {event.srcintf || '-'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {event.devname || '-'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {event.ref ? (
                            <a
                              href={event.ref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:text-blue-700"
                              title={event.ref}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          ) : '-'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-sm text-muted-foreground">
                    Sayfa {currentPage} / {totalPages} ({filteredEvents.length} olay)
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
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
                            className="w-9 h-8"
                          >
                            {page}
                          </Button>
                        )}
                      </React.Fragment>
                    ))}
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
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
