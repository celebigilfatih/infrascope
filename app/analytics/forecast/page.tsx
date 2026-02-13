'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, AlertTriangle, TrendingUp, Calendar, HardDrive, Cpu, MemoryStick } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface ForecastData {
  resourceType: string;
  resourceId: string;
  resourceName: string;
  metricType: string;
  current: string;
  predict30: string;
  predict60: string;
  predict90: string;
  growthRate: string;
  daysUntilFull: number | null;
  status: string;
}

export default function ForecastPage() {
  const [forecasts, setForecasts] = useState<ForecastData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchForecast = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/integrations/vmware?type=growth-forecast');
      const json = await res.json();
      
      if (json.error) {
        setError(json.error);
        return;
      }
      
      setForecasts(json.forecast || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForecast();
    const interval = setInterval(fetchForecast, 300000); // Refresh every 5 minutes
    return () => clearInterval(interval);
  }, []);

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

  const getMetricIcon = (type: string) => {
    switch (type) {
      case 'cpu': return <Cpu className="h-4 w-4" />;
      case 'memory': return <MemoryStick className="h-4 w-4" />;
      case 'disk': return <HardDrive className="h-4 w-4" />;
      default: return null;
    }
  };

  // Summary stats
  const criticalCount = forecasts.filter(f => f.status === 'critical').length;
  const warningCount = forecasts.filter(f => f.status === 'warning').length;
  const diskForecasts = forecasts.filter(f => f.metricType === 'disk' && f.daysUntilFull);
  const nearestFull = diskForecasts.length > 0
    ? Math.min(...diskForecasts.map(f => f.daysUntilFull!))
    : null;

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              <span>Forecast verileri alinamadi: {error}</span>
            </div>
            <Button onClick={fetchForecast} className="mt-4" variant="outline">
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
          <h1 className="text-2xl font-bold">Kapasite Tahminleri</h1>
          <p className="text-muted-foreground">Lineer regresyon ile gelecek projeksiyon analizi</p>
        </div>
        <Button onClick={fetchForecast} disabled={loading} variant="outline">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Kritik Uyari</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{criticalCount}</div>
            <p className="text-xs text-muted-foreground">30 gun icinde %85+</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Uyari</CardTitle>
            <TrendingUp className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{warningCount}</div>
            <p className="text-xs text-muted-foreground">30 gun icinde %70+</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">En Yakin Dolum</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{nearestFull ? `${nearestFull} gun` : 'N/A'}</div>
            <p className="text-xs text-muted-foreground">Disk kapasitesi</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Izlenen Kaynak</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{forecasts.length}</div>
            <p className="text-xs text-muted-foreground">Aktif tahmin</p>
          </CardContent>
        </Card>
      </div>

      {/* Forecast Table */}
      <Card>
        <CardHeader>
          <CardTitle>Gelecek Projeksiyon (Linear Regression)</CardTitle>
          <CardDescription>
            Son 30 gun verisine gore 30/60/90 gunluk tahmin
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && forecasts.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kaynak</TableHead>
                  <TableHead>Metrik</TableHead>
                  <TableHead>Guncel</TableHead>
                  <TableHead>30 Gun</TableHead>
                  <TableHead>60 Gun</TableHead>
                  <TableHead>90 Gun</TableHead>
                  <TableHead>Buyume Orani</TableHead>
                  <TableHead>Dolum Suresi</TableHead>
                  <TableHead>Durum</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {forecasts.map((forecast, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{forecast.resourceName}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getMetricIcon(forecast.metricType)}
                        <span className="capitalize">{forecast.metricType}</span>
                      </div>
                    </TableCell>
                    <TableCell>{forecast.current}%</TableCell>
                    <TableCell className={parseFloat(forecast.predict30) >= 85 ? 'text-red-600 font-bold' : parseFloat(forecast.predict30) >= 70 ? 'text-yellow-600' : ''}>
                      {forecast.predict30}%
                    </TableCell>
                    <TableCell className={parseFloat(forecast.predict60) >= 85 ? 'text-red-600 font-bold' : ''}>
                      {forecast.predict60}%
                    </TableCell>
                    <TableCell className={parseFloat(forecast.predict90) >= 85 ? 'text-red-600 font-bold' : ''}>
                      {forecast.predict90}%
                    </TableCell>
                    <TableCell>
                      <span className={parseFloat(forecast.growthRate) > 10 ? 'text-red-600' : parseFloat(forecast.growthRate) > 5 ? 'text-yellow-600' : ''}>
                        +{forecast.growthRate}%/ay
                      </span>
                    </TableCell>
                    <TableCell>
                      {forecast.daysUntilFull ? (
                        <Badge variant={forecast.daysUntilFull < 60 ? 'destructive' : 'secondary'}>
                          {forecast.daysUntilFull} gun
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(forecast.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {forecasts.length === 0 && !loading && (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Henuz yeterli veri yok (min 3 veri noktasi gerekli)</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <TrendingUp className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="text-sm text-blue-900">
              <p className="font-semibold mb-1">Nasil Hesaplaniyor?</p>
              <p>
                Lineer regresyon (y = ax + b) ile son 30 gunun verisi analiz edilir.
                <br />
                Buyume orani (slope) hesaplanir ve gelecek degerler tahmin edilir.
                <br />
                <strong>Disk icin:</strong> %100 dolum suresi hesaplama → (100 - guncel) / buyume_orani
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
