'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  RefreshCw,
  Database,
  HardDrive,
  AlertTriangle,
  Download,
  CheckCircle,
  XCircle,
} from 'lucide-react';

interface Datastore {
  id: string;
  name: string;
  type: string;
  capacityGB: number;
  freeGB: number;
  usedGB: number;
  usedPercent: number;
  accessible: boolean;
}

export default function DatastoresPage() {
  const [datastores, setDatastores] = useState<Datastore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  const fetchDatastores = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/integrations/vmware?type=datastores');
      const json = await res.json();
      
      if (json.error) {
        setError(json.error);
        return;
      }
      
      setDatastores(json.datastores || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDatastores();
    const interval = setInterval(fetchDatastores, 300000); // 5 min — matches server cache TTL
    return () => clearInterval(interval);
  }, []);

  const formatSize = (gb: number): string => {
    if (gb >= 1024) return `${(gb / 1024).toFixed(1)} TB`;
    return `${gb} GB`;
  };

  // Export CSV
  const exportCSV = () => {
    const headers = ['Ad', 'Tip', 'Kapasite (GB)', 'Bos (GB)', 'Kullanilan (%)', 'Erisilebilir'];
    const rows = datastores.map((d: Datastore) => [
      d.name,
      d.type,
      d.capacityGB,
      d.freeGB,
      d.usedPercent,
      d.accessible ? 'Evet' : 'Hayir',
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `datastores_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

const getUsageTextColor = (percent: number): string => {
    if (percent >= 90) return 'text-red-600';
    if (percent >= 75) return 'text-yellow-600';
    return 'text-green-600';
  };

  // Summary
  const totalCapacityTB = datastores.reduce((sum: number, d: Datastore) => sum + (d.capacityGB || 0), 0) / 1024;
  const totalFreeTB = datastores.reduce((sum: number, d: Datastore) => sum + (d.freeGB || 0), 0) / 1024;
  const totalUsedTB = totalCapacityTB - totalFreeTB;
  const avgUsage = datastores.length > 0 
    ? Math.round(datastores.reduce((sum: number, d: Datastore) => sum + (d.usedPercent || 0), 0) / datastores.length)
    : 0;
  const criticalCount = datastores.filter((d: Datastore) => d.usedPercent >= 90).length;
  const warningCount = datastores.filter((d: Datastore) => d.usedPercent >= 75 && d.usedPercent < 90).length;

  // Pagination
  const totalPages = Math.ceil(datastores.length / ITEMS_PER_PAGE);
  const paginatedDatastores = datastores.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              <span>vCenter baglantisi basarisiz: {error}</span>
            </div>
            <Button onClick={fetchDatastores} className="mt-4" variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Tekrar Dene
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Datastore</h1>
          <p className="text-muted-foreground">
            vCenter uzerindeki depolama alanlari
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={exportCSV} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            CSV
          </Button>
          <Button onClick={fetchDatastores} disabled={loading} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Toplam Datastore</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading && datastores.length === 0
              ? <div className="h-8 w-12 bg-muted animate-pulse rounded" />
              : <div className="text-2xl font-bold">{datastores.length}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Toplam Kapasite</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading && datastores.length === 0
              ? <div className="h-8 w-24 bg-muted animate-pulse rounded" />
              : <div className="text-2xl font-bold">{totalCapacityTB.toFixed(1)} TB</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Kullanilan</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading && datastores.length === 0 ? (
              <>
                <div className="h-8 w-24 bg-muted animate-pulse rounded" />
                <div className="h-3 w-28 bg-muted animate-pulse rounded mt-1" />
              </>
            ) : (
              <>
                <div className="text-2xl font-bold">{totalUsedTB.toFixed(1)} TB</div>
                <p className="text-xs text-muted-foreground">Ortalama %{avgUsage} dolu</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Bos Alan</CardTitle>
            <HardDrive className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {loading && datastores.length === 0
              ? <div className="h-8 w-24 bg-muted animate-pulse rounded" />
              : <div className="text-2xl font-bold text-green-600">{totalFreeTB.toFixed(1)} TB</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Uyari/Kritik</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            {loading && datastores.length === 0 ? (
              <div className="h-6 w-20 bg-muted animate-pulse rounded" />
            ) : (
              <div className="flex gap-2">
                {criticalCount > 0 && (
                  <Badge className="bg-red-100 text-red-800">{criticalCount} Kritik</Badge>
                )}
                {warningCount > 0 && (
                  <Badge className="bg-yellow-100 text-yellow-800">{warningCount} Uyari</Badge>
                )}
                {criticalCount === 0 && warningCount === 0 && (
                  <Badge className="bg-green-100 text-green-800">Tumu Saglikli</Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Datastore Table */}
      <Card>
        <CardContent className="pt-6">
          {loading && datastores.length === 0 ? (
            <div className="space-y-2">
              <div className="grid grid-cols-6 gap-2 px-2 pb-2 border-b text-xs font-medium text-muted-foreground">
                {['Datastore Adı', 'Tip', 'Kapasite', 'Boş', 'Kullanım', 'Durum'].map((h, i) => (
                  <div key={i}>{h}</div>
                ))}
              </div>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="grid grid-cols-6 gap-2 px-2 py-2 border-b border-border/20 animate-pulse">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <div key={j} className="h-4 bg-muted rounded" style={{ opacity: 0.4 + (j % 3) * 0.2 }} />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datastore Adi</TableHead>
                  <TableHead>Tip</TableHead>
                  <TableHead>Kapasite</TableHead>
                  <TableHead>Bos Alan</TableHead>
                  <TableHead className="w-[200px]">Kullanim</TableHead>
                  <TableHead className="text-center">Durum</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedDatastores.map((ds) => (
                  <TableRow key={ds.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Database className={`h-4 w-4 ${
                          ds.usedPercent >= 90 ? 'text-red-500' : 
                          ds.usedPercent >= 75 ? 'text-yellow-500' : 'text-muted-foreground'
                        }`} />
                        <span className="font-medium">{ds.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-gray-100 text-gray-800">{ds.type}</Badge>
                    </TableCell>
                    <TableCell>{formatSize(ds.capacityGB)}</TableCell>
                    <TableCell>{formatSize(ds.freeGB)}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span>{formatSize(ds.usedGB)} kullaniliyor</span>
                          <span className={getUsageTextColor(ds.usedPercent)}>
                            %{ds.usedPercent}
                          </span>
                        </div>
                        <Progress value={ds.usedPercent} className="h-2" />
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {ds.accessible ? (
                        <Badge className="bg-green-100 text-green-800">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Erisilebilir
                        </Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-800">
                          <XCircle className="h-3 w-3 mr-1" />
                          Erisilemez
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {datastores.length === 0 && !loading && (
            <p className="text-center text-muted-foreground py-8">
              Datastore bulunamadi
            </p>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/50">
              <p className="text-sm text-muted-foreground">
                Toplam {datastores.length} datastore &mdash; Sayfa {currentPage} / {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Önceki
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                  .reduce<(number | string)[]>((acc, p, idx, arr) => {
                    if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('...');
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((item, idx) =>
                    item === '...' ? (
                      <span key={`ellipsis-${idx}`} className="text-sm text-muted-foreground px-1">&hellip;</span>
                    ) : (
                      <Button
                        key={item}
                        variant={currentPage === item ? 'default' : 'outline'}
                        size="sm"
                        className="w-8 h-8 p-0"
                        onClick={() => setCurrentPage(item as number)}
                      >
                        {item}
                      </Button>
                    )
                  )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Sonraki
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
