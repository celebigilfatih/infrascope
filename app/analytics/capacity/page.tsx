'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, TrendingUp, TrendingDown, Minus, AlertTriangle, HardDrive, Cpu, MemoryStick } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface TrendData {
  resourceType: string;
  resourceId: string;
  resourceName: string;
  metricType: string;
  currentValue: string;
  trendPercent: string;
  status: string;
  dataPoints: Array<{ timestamp: string; value: string }>;
}

export default function CapacityPage() {
  const [trends, setTrends] = useState<TrendData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(7);

  const fetchTrends = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/integrations/vmware?type=capacity-trends&days=${days}`);
      const json = await res.json();
      
      if (json.error) {
        setError(json.error);
        return;
      }
      
      setTrends(json.trends || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrends();
    const interval = setInterval(fetchTrends, 120000); // Refresh every 2 minutes
    return () => clearInterval(interval);
  }, [days]);

  const collectMetrics = async () => {
    setLoading(true);
    await fetch('/api/integrations/vmware?type=collect-metrics');
    setTimeout(fetchTrends, 2000);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'critical':
        return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Kritik</Badge>;
      case 'warning':
        return <Badge className="bg-yellow-100 text-yellow-800"><AlertTriangle className="h-3 w-3 mr-1" />Uyari</Badge>;
      default:
        return <Badge className="bg-green-100 text-green-800">Normal</Badge>;
    }
  };

  const getTrendIcon = (percent: number) => {
    if (percent > 5) return <TrendingUp className="h-4 w-4 text-red-500" />;
    if (percent < -5) return <TrendingDown className="h-4 w-4 text-green-500" />;
    return <Minus className="h-4 w-4 text-gray-500" />;
  };

  const getMetricIcon = (type: string) => {
    switch (type) {
      case 'cpu': return <Cpu className="h-4 w-4" />;
      case 'memory': return <MemoryStick className="h-4 w-4" />;
      case 'disk': return <HardDrive className="h-4 w-4" />;
      default: return null;
    }
  };

  // Summary stats
  const criticalCount = trends.filter(t => t.status === 'critical').length;
  const warningCount = trends.filter(t => t.status === 'warning').length;
  const avgCpu = trends.filter(t => t.metricType === 'cpu').reduce((sum, t) => sum + parseFloat(t.currentValue), 0) / Math.max(trends.filter(t => t.metricType === 'cpu').length, 1);
  const avgMemory = trends.filter(t => t.metricType === 'memory').reduce((sum, t) => sum + parseFloat(t.currentValue), 0) / Math.max(trends.filter(t => t.metricType === 'memory').length, 1);
  const avgDisk = trends.filter(t => t.metricType === 'disk').reduce((sum, t) => sum + parseFloat(t.currentValue), 0) / Math.max(trends.filter(t => t.metricType === 'disk').length, 1);

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              <span>Kapasite verileri alinamadi: {error}</span>
            </div>
            <Button onClick={fetchTrends} className="mt-4" variant="outline">
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Kapasite Trendleri</h1>
          <p className="text-muted-foreground">CPU, RAM ve Disk kullanim egilimlerinin analizi</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="px-3 py-2 border rounded-md"
          >
            <option value="1">Son 1 Gun</option>
            <option value="7">Son 7 Gun</option>
            <option value="30">Son 30 Gun</option>
          </select>
          <Button onClick={collectMetrics} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Metrik Topla
          </Button>
          <Button onClick={fetchTrends} disabled={loading} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Ortalama CPU</CardTitle>
            <Cpu className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgCpu.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">Cluster ortalamasi</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Ortalama Memory</CardTitle>
            <MemoryStick className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgMemory.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">Cluster ortalamasi</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Ortalama Disk</CardTitle>
            <HardDrive className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgDisk.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">Datastore ortalamasi</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Uyarilar</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{criticalCount}</div>
            <p className="text-xs text-muted-foreground">{warningCount} uyari</p>
          </CardContent>
        </Card>
      </div>

      {/* Trends Table */}
      <Card>
        <CardHeader>
          <CardTitle>Kaynak Trendleri</CardTitle>
          <CardDescription>
            {trends.length} kaynak izleniyor
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && trends.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kaynak</TableHead>
                  <TableHead>Tip</TableHead>
                  <TableHead>Metrik</TableHead>
                  <TableHead>Guncel Deger</TableHead>
                  <TableHead>Trend</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>Veri Sayisi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trends.map((trend, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{trend.resourceName}</TableCell>
                    <TableCell className="capitalize">{trend.resourceType}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getMetricIcon(trend.metricType)}
                        <span className="capitalize">{trend.metricType}</span>
                      </div>
                    </TableCell>
                    <TableCell>{trend.currentValue}%</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getTrendIcon(parseFloat(trend.trendPercent))}
                        <span className={parseFloat(trend.trendPercent) > 5 ? 'text-red-600' : parseFloat(trend.trendPercent) < -5 ? 'text-green-600' : ''}>
                          {trend.trendPercent > '0' ? '+' : ''}{trend.trendPercent}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(trend.status)}</TableCell>
                    <TableCell>{trend.dataPoints.length} nokta</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {trends.length === 0 && !loading && (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">Henuz metrik verisi yok</p>
              <Button onClick={collectMetrics} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Metrik Toplamaya Basla
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
