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
  History,
  AlertTriangle,
  Save,
  ArrowLeft
} from 'lucide-react';
import Link from 'next/link';

interface ConfigRevision {
  id: number;
  time: number;
  admin: string;
  comment: string;
  version: string;
}

const ITEMS_PER_PAGE = 10;

export default function ConfigRevisionsPage() {
  const [revisions, setRevisions] = useState<ConfigRevision[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const fetchRevisions = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/integrations/fortigate?vpn=config');
      const data = await response.json();
      if (data.success) {
        setRevisions(data.data.revisions);
        setHasUnsavedChanges(data.data.hasUnsavedChanges);
      }
    } catch (error) {
      console.error('Failed to fetch config revisions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRevisions();
    // 15 dakikada bir yenile
    const interval = setInterval(fetchRevisions, 900000);
    return () => clearInterval(interval);
  }, []);

  // Filter and pagination
  const filteredRevisions = useMemo(() => {
    return revisions.filter((rev: ConfigRevision) => {
      const searchLower = search.toLowerCase();
      return (
        (rev.admin || '').toLowerCase().includes(searchLower) ||
        (rev.comment || '').toLowerCase().includes(searchLower) ||
        (rev.version || '').toLowerCase().includes(searchLower)
      );
    });
  }, [revisions, search]);

  const totalPages = Math.ceil(filteredRevisions.length / ITEMS_PER_PAGE);
  const paginatedRevisions = filteredRevisions.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  );

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString('tr-TR');
  };

  // Admin istatistikleri
  const adminStats = useMemo(() => {
    const stats: Record<string, number> = {};
    revisions.forEach((rev) => {
      stats[rev.admin] = (stats[rev.admin] || 0) + 1;
    });
    return Object.entries(stats)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
  }, [revisions]);

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
              <History className="h-8 w-8" />
              Konfigürasyon Revizyonları
            </h1>
            <p className="text-muted-foreground">
              FortiGate yapılandırma değişiklikleri ve versiyon geçmişi
            </p>
          </div>
        </div>
        <Button onClick={fetchRevisions} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </Button>
      </div>

      {/* Unsaved Changes Warning */}
      {hasUnsavedChanges && (
        <Card className="border-orange-500 bg-orange-50 dark:bg-orange-950/20">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            <div>
              <p className="font-medium text-orange-800 dark:text-orange-200">
                Kaydedilmemiş Değişiklikler Var
              </p>
              <p className="text-sm text-orange-600 dark:text-orange-300">
                Mevcut yapılandırma kaydedilmemiş. Değişiklikleri kaydetmek için FortiGate üzerinden işlem yapın.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <History className="h-4 w-4" /> Toplam Revizyon
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{revisions.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Save className="h-4 w-4" /> Son Revizyon
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-medium">
              {revisions.length > 0 ? formatDate(revisions[0].time).split(' ')[0] : '-'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Durum
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={hasUnsavedChanges ? 'destructive' : 'success'}>
              {hasUnsavedChanges ? 'Kaydedilmemiş' : 'Senkronize'}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <History className="h-4 w-4" /> Admin Sayısı
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{adminStats.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Admin Stats */}
      {adminStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Değişiklikler (Son 10 Revizyon)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {adminStats.map(([admin, count]) => (
                <Badge key={admin} variant="secondary" className="text-xs">
                  {admin}: {count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Admin, yorum veya versiyon ara..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-10"
          />
        </div>
        <Badge variant="secondary">
          {filteredRevisions.length} sonuç
        </Badge>
      </div>

      {/* Revisions Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Revizyon ID</TableHead>
                <TableHead>Tarih</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Versiyon</TableHead>
                <TableHead>Yorum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <RefreshCw className="h-8 w-8 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : paginatedRevisions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Revizyon bulunamadı
                  </TableCell>
                </TableRow>
              ) : (
                paginatedRevisions.map((rev: ConfigRevision, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-xs">#{rev.id}</TableCell>
                    <TableCell className="text-sm">{formatDate(rev.time)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {rev.admin}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{rev.version}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-md truncate">
                      {rev.comment || '-'}
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
