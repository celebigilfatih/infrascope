'use client';

import { uiError } from '@/lib/i18n/tr';

import { PageHeading, PageStateFrame } from '@/components/ui/page-heading';
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  RefreshCw,
  AlertTriangle,
  Search,
  Server,
  Camera,
  Power,
  Download,
} from 'lucide-react';

interface SprawlVM {
  vmId: string;
  vmName: string;
  host: string;
  powerState: string;
  snapshotCount: number;
  oldestSnapshotDays?: number;
  sprawlScore: number;
  sprawlReasons: string[];
  recommendation: string;
}

export default function VMSprawlPage() {
  const [sprawlVMs, setSprawlVMs] = useState<SprawlVM[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchSprawl = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/integrations/vmware?type=sprawl');
      const json = await res.json();
      
      if (json.error) {
        setError(uiError(json.error));
        return;
      }
      
      setSprawlVMs(json.sprawl || []);
    } catch (err) {
      setError(uiError((err as Error).message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSprawl();
    const interval = setInterval(fetchSprawl, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  const filteredVMs = sprawlVMs.filter(vm =>
    vm.vmName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    vm.host?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getScoreBadge = (score: number) => {
    if (score >= 5) {
      return <Badge variant="destructive">Kritik ({score})</Badge>;
    } else if (score >= 3) {
      return <Badge variant="warning">Orta Risk ({score})</Badge>;
    } else {
      return <Badge variant="secondary">Düşük ({score})</Badge>;
    }
  };

  const getPowerStateBadge = (state: string) => {
    if (state === 'running') {
      return <Badge variant="success"><Power className="h-3 w-3 mr-1" />Çalışıyor</Badge>;
    } else {
      return <Badge variant="secondary"><Power className="h-3 w-3 mr-1" />Kapalı</Badge>;
    }
  };

  const exportCSV = () => {
    const headers = ['VM Adi', 'Host', 'Durum', 'Anlık Görüntü Sayısı', 'En Eski Anlık Görüntü (Gün)', 'Sprawl Skor', 'Nedenler', 'Oneri'];
    const rows = filteredVMs.map(vm => [
      vm.vmName,
      vm.host,
      vm.powerState,
      vm.snapshotCount,
      vm.oldestSnapshotDays || '-',
      vm.sprawlScore,
      vm.sprawlReasons.join('; '),
      vm.recommendation,
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vm_sprawl_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Summary stats
  const criticalCount = sprawlVMs.filter(vm => vm.sprawlScore >= 5).length;
  const mediumCount = sprawlVMs.filter(vm => vm.sprawlScore >= 3 && vm.sprawlScore < 5).length;
  const lowCount = sprawlVMs.filter(vm => vm.sprawlScore < 3).length;
  const totalSnapshots = sprawlVMs.reduce((sum, vm) => sum + vm.snapshotCount, 0);

  if (error) {
    return <PageStateFrame section="sprawl" title="Atıl Sanal Makine Analizi">{(
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              <span>Atıl kaynak analizi başarısız: {uiError(error)}</span>
            </div>
            <Button onClick={fetchSprawl} className="mt-4" variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Tekrar Dene
            </Button>
          </CardContent>
        </Card>
      </div>
    )}</PageStateFrame>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between max-md:flex-col max-md:items-stretch max-md:gap-4">
        <div>
          <PageHeading section="sprawl" description={<>
            Atıl, gereksiz veya sahipsiz sanal makineleri tespit edin
          </>}>Atıl Sanal Makine Analizi</PageHeading>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={exportCSV} variant="outline" size="sm" disabled={sprawlVMs.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            CSV
          </Button>
          <Button onClick={fetchSprawl} disabled={loading} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Kritik Atıl Kaynaklar</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{criticalCount}</div>
            <p className="text-xs text-muted-foreground">Skor ≥ 5</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Orta Risk</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{mediumCount}</div>
            <p className="text-xs text-muted-foreground">Skor 3-4</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Düşük Risk</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lowCount}</div>
            <p className="text-xs text-muted-foreground">Skor 1-2</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Toplam Anlık Görüntü</CardTitle>
            <Camera className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSnapshots}</div>
            <p className="text-xs text-muted-foreground">Tüm Sanal Makinelerde</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Sanal makine veya sunucu adı ile ara…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Sprawl Table */}
      <Card>
        <CardHeader>
          <CardTitle>Atıl Sanal Makineler</CardTitle>
          <CardDescription>
            {filteredVMs.length} VM tespit edildi
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && sprawlVMs.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sanal Makine Adı</TableHead>
                  <TableHead>Sunucu</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>Anlık Görüntü</TableHead>
                  <TableHead>En Eski</TableHead>
                  <TableHead>Skor</TableHead>
                  <TableHead>Nedenler</TableHead>
                  <TableHead>Öneri</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVMs.map((vm) => (
                  <TableRow key={vm.vmId}>
                    <TableCell className="font-medium">{vm.vmName}</TableCell>
                    <TableCell>{vm.host}</TableCell>
                    <TableCell>{getPowerStateBadge(vm.powerState)}</TableCell>
                    <TableCell>{vm.snapshotCount}</TableCell>
                    <TableCell>
                      {vm.oldestSnapshotDays ? `${vm.oldestSnapshotDays} gun` : '-'}
                    </TableCell>
                    <TableCell>{getScoreBadge(vm.sprawlScore)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {vm.sprawlReasons.map((reason, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {reason}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <span className="text-sm text-muted-foreground">{vm.recommendation}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {filteredVMs.length === 0 && !loading && (
            <p className="text-center text-muted-foreground py-8">
              {searchTerm ? "Aramayla eşleşen atıl sanal makine bulunamadı" : "Atıl sanal makine tespit edilmedi."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
