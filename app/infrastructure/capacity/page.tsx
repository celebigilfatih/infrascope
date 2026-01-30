'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Zap, Server, HardDrive, Thermometer, TrendingUp, AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CapacityData {
  power: { used: number; total: number; percentage: number };
  cooling: { used: number; total: number; percentage: number };
  storage: { used: number; total: number; percentage: number };
  compute: { used: number; total: number; percentage: number };
}

export default function CapacityPage() {
  const [capacity, setCapacity] = useState<CapacityData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTimeout(() => {
      setCapacity({
        power: { used: 45, total: 100, percentage: 45 },
        cooling: { used: 72, total: 100, percentage: 72 },
        storage: { used: 3.2, total: 5, percentage: 64 },
        compute: { used: 78, total: 100, percentage: 78 },
      });
      setLoading(false);
    }, 500);
  }, []);

  const getCapacityColor = (percentage: number) => {
    if (percentage >= 90) return 'text-red-500';
    if (percentage >= 70) return 'text-orange-500';
    if (percentage >= 50) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getCapacityStatus = (percentage: number) => {
    if (percentage >= 90) return 'Kritik';
    if (percentage >= 70) return 'Uyarı';
    return 'Normal';
  };

  const getCapacityBadge = (percentage: number) => {
    if (percentage >= 90) return <Badge variant="destructive">Kritik</Badge>;
    if (percentage >= 70) return <Badge className="bg-orange-500">Uyarı</Badge>;
    return <Badge variant="success">Normal</Badge>;
  };

  if (loading || !capacity) {
    return (
      <div className="p-6 flex justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Power / Capacity</h1>
          <p className="text-muted-foreground">Altyapı kapasite planlaması ve izleme</p>
        </div>
        <Button variant="outline" size="icon">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Power & Cooling Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" />
              <CardTitle>Güç Tüketimi</CardTitle>
            </div>
            <CardDescription>Veri merkezi elektrik tüketimi</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Kullanılan</span>
                  {getCapacityBadge(capacity.power.percentage)}
                </div>
                <span className="text-sm text-muted-foreground">
                  {capacity.power.used} / {capacity.power.total} kW
                </span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn("h-full transition-all", getCapacityColor(capacity.power.percentage).replace('text', 'bg'))}
                  style={{ width: `${capacity.power.percentage}%` }}
                />
              </div>
              <p className={cn("text-xs mt-1", getCapacityColor(capacity.power.percentage))}>
                {getCapacityStatus(capacity.power.percentage)} - {capacity.power.percentage}% kullanımda
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-500">{capacity.power.total - capacity.power.used} kW</p>
                <p className="text-xs text-muted-foreground">Mevcut Kapasite</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-orange-500">{capacity.power.percentage}%</p>
                <p className="text-xs text-muted-foreground">Yük Oranı</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Thermometer className="h-5 w-5 text-blue-500" />
              <CardTitle>Soğutma Kapasitesi</CardTitle>
            </div>
            <CardDescription>Veri merkezi soğutma sistemi</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Kullanılan</span>
                  {getCapacityBadge(capacity.cooling.percentage)}
                </div>
                <span className="text-sm text-muted-foreground">
                  {capacity.cooling.used} / {capacity.cooling.total} TR
                </span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn("h-full transition-all", getCapacityColor(capacity.cooling.percentage).replace('text', 'bg'))}
                  style={{ width: `${capacity.cooling.percentage}%` }}
                />
              </div>
              <p className={cn("text-xs mt-1", getCapacityColor(capacity.cooling.percentage))}>
                {getCapacityStatus(capacity.cooling.percentage)} - {capacity.cooling.percentage}% kullanımda
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-500">{capacity.cooling.total - capacity.cooling.used} TR</p>
                <p className="text-xs text-muted-foreground">Mevcut Kapasite</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-yellow-500">{capacity.cooling.percentage}%</p>
                <p className="text-xs text-muted-foreground">Yük Oranı</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Compute & Storage */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-green-500" />
              <CardTitle>Compute Kapasitesi</CardTitle>
            </div>
            <CardDescription>Sunucu kaynakları kullanımı</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">CPU Kullanımı</span>
                  {getCapacityBadge(capacity.compute.percentage)}
                </div>
                <span className="text-sm text-muted-foreground">
                  {capacity.compute.used} / {capacity.compute.total}%
                </span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn("h-full transition-all", getCapacityColor(capacity.compute.percentage).replace('text', 'bg'))}
                  style={{ width: `${capacity.compute.percentage}%` }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div className="text-center">
                <p className="text-2xl font-bold">{capacity.compute.total - capacity.compute.used}%</p>
                <p className="text-xs text-muted-foreground">Boşta CPU</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-orange-500">{capacity.compute.percentage}%</p>
                <p className="text-xs text-muted-foreground">Yüksek Yük</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-purple-500" />
              <CardTitle>Depolama Kapasitesi</CardTitle>
            </div>
            <CardDescription>Toplam disk alanı kullanımı</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Kullanılan</span>
                  {getCapacityBadge(capacity.storage.percentage)}
                </div>
                <span className="text-sm text-muted-foreground">
                  {capacity.storage.used} / {capacity.storage.total} TB
                </span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn("h-full transition-all", getCapacityColor(capacity.storage.percentage).replace('text', 'bg'))}
                  style={{ width: `${capacity.storage.percentage}%` }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-500">{(capacity.storage.total - capacity.storage.used).toFixed(1)} TB</p>
                <p className="text-xs text-muted-foreground">Mevcut Alan</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-yellow-500">{capacity.storage.percentage}%</p>
                <p className="text-xs text-muted-foreground">Dolulu</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Capacity Alerts */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            <CardTitle>Kapasite Uyarıları</CardTitle>
          </div>
          <CardDescription>Dikkat gerektiren kapasite durumları</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0" />
              <div className="flex-1">
                <p className="font-medium">Soğutma kapasitesi %72 seviyesinde</p>
                <p className="text-sm text-muted-foreground">Yüksek yük dönemlerinde sıcaklık riski oluşabilir</p>
              </div>
              <Button variant="outline" size="sm">Detaylar</Button>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <TrendingUp className="h-5 w-5 text-yellow-500 shrink-0" />
              <div className="flex-1">
                <p className="font-medium">Compute kullanımı artış trendinde</p>
                <p className="text-sm text-muted-foreground">Son 7 günde %15 artış gözlemlendi</p>
              </div>
              <Button variant="outline" size="sm">Detaylar</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
