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
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  AlertTriangle,
  FileText,
  Calendar,
  User,
  Server,
  ArrowLeft,
  Filter
} from 'lucide-react';
import Link from 'next/link';

interface ConfigLog {
  user: string;
  action: string;
  cfgpath: string;
  cfgobj: string;
  msg: string;
  time: number;
  devname: string;
  logid: string;
  type: string;
  subtype: string;
  level: string;
  srcip: string;
  dstip: string;
}

const ITEMS_PER_PAGE = 10;

export default function FortiAnalyzerEventsPage() {
  const [events, setEvents] = useState<ConfigLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [logType, setLogType] = useState('event');

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/integrations/fortianalyzer?type=events&limit=50`);
      const data = await response.json();
      console.log('FA Events API response:', data);
      if (data.success && Array.isArray(data.data)) {
        setEvents(data.data);
      } else {
        setEvents([]);
      }
    } catch (error) {
      console.error('Failed to fetch FortiAnalyzer events:', error);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
    // 5 dakikada bir yenile
    const interval = setInterval(fetchEvents, 300000);
    return () => clearInterval(interval);
  }, []);

  // Filter and pagination
  const filteredEvents = useMemo(() => {
    return events.filter((event: ConfigLog) => {
      const searchLower = search.toLowerCase();
      return (
        (event.type || '').toLowerCase().includes(searchLower) ||
        (event.subtype || '').toLowerCase().includes(searchLower) ||
        (event.devname || '').toLowerCase().includes(searchLower) ||
        (event.user || '').toLowerCase().includes(searchLower) ||
        (event.srcip || '').toLowerCase().includes(searchLower) ||
        (event.dstip || '').toLowerCase().includes(searchLower) ||
        (event.action || '').toLowerCase().includes(searchLower) ||
        (event.msg || '').toLowerCase().includes(searchLower)
      );
    });
  }, [events, search]);

  const totalPages = Math.ceil(filteredEvents.length / ITEMS_PER_PAGE);
  const paginatedEvents = filteredEvents.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  );

  const formatDate = (timestamp: number) => {
    if (!timestamp) return '-';
    return new Date(timestamp * 1000).toLocaleString('tr-TR');
  };

  // İstatistikler
  const stats = useMemo(() => {
    const typeCount: Record<string, number> = {};
    const levelCount: Record<string, number> = {};
    
    events.forEach((event) => {
      typeCount[event.type] = (typeCount[event.type] || 0) + 1;
      levelCount[event.level] = (levelCount[event.level] || 0) + 1;
    });
    
    return { typeCount, levelCount };
  }, [events]);

  const getLevelBadgeVariant = (level: string) => {
    switch (level?.toLowerCase()) {
      case 'critical':
      case 'high':
        return 'destructive';
      case 'warning':
      case 'medium':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/network/firewall">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <FileText className="h-8 w-8" />
              FortiAnalyzer Event Logları
            </h1>
            <p className="text-muted-foreground">
              Son 24 saatin olay logları ve aktivite kayıtları
            </p>
          </div>
        </div>
        <Button onClick={fetchEvents} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" /> Toplam Event
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{events.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Kritik/Orta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {(stats.levelCount['warning'] || 0) + (stats.levelCount['medium'] || 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Server className="h-4 w-4" /> Cihaz
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(events.map(e => e.devname)).size}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Zaman Aralığı
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-medium">Son 24 Saat</div>
          </CardContent>
        </Card>
      </div>

      {/* Event Types */}
      {Object.keys(stats.typeCount).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Filter className="h-4 w-4" /> Event Tipleri
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.typeCount)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10)
                .map(([type, count]) => (
                  <Badge key={type} variant="secondary" className="text-xs">
                    {type}: {count}
                  </Badge>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Event tipi, cihaz, IP, kullanıcı veya mesaj ara..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-10"
          />
        </div>
        <Badge variant="secondary">
          {filteredEvents.length} sonuç
        </Badge>
      </div>

      {/* Events Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Zaman</TableHead>
                <TableHead>Tip</TableHead>
                <TableHead>Seviye</TableHead>
                <TableHead>Cihaz</TableHead>
                <TableHead>Kullanıcı</TableHead>
                <TableHead>Kaynak</TableHead>
                <TableHead>Hedef</TableHead>
                <TableHead>Aksiyon</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <RefreshCw className="h-8 w-8 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : paginatedEvents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Event log bulunamadı
                  </TableCell>
                </TableRow>
              ) : (
                paginatedEvents.map((event: ConfigLog, idx: number) => (
                  <TableRow key={idx} className="hover:bg-muted/50">
                    <TableCell className="text-xs whitespace-nowrap">
                      {formatDate(event.time)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline" className="text-xs w-fit">
                          {event.type}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{event.subtype}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getLevelBadgeVariant(event.level)} className="text-xs">
                        {event.level}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{event.devname}</TableCell>
                    <TableCell className="text-xs">{event.user || '-'}</TableCell>
                    <TableCell className="text-xs font-mono">{event.srcip || '-'}</TableCell>
                    <TableCell className="text-xs font-mono">{event.dstip || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {event.action}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 py-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">
                Sayfa {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
