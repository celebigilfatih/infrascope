'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Target, RefreshCw, Plus, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface IPRange {
  id: string;
  name: string;
  subnet: string;
  gateway: string;
  total: number;
  used: number;
  reserved: number;
  status: 'available' | 'partial' | 'exhausted';
}

export default function IPAMPage() {
  const [ranges, setRanges] = useState<IPRange[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTimeout(() => {
      setRanges([
        { id: '1', name: 'Prod-Servers', subnet: '10.0.10.0/24', gateway: '10.0.10.1', total: 254, used: 24, reserved: 10, status: 'available' },
        { id: '2', name: 'Prod-Web', subnet: '10.0.20.0/24', gateway: '10.0.20.1', total: 254, used: 12, reserved: 5, status: 'available' },
        { id: '3', name: 'Dev-Test', subnet: '10.0.30.0/24', gateway: '10.0.30.1', total: 254, used: 8, reserved: 2, status: 'available' },
        { id: '4', name: 'Voice', subnet: '10.0.100.0/24', gateway: '10.0.100.1', total: 254, used: 45, reserved: 20, status: 'available' },
        { id: '5', name: 'Management', subnet: '10.0.200.0/24', gateway: '10.0.200.1', total: 254, used: 6, reserved: 5, status: 'available' },
        { id: '6', name: 'IoT-Devices', subnet: '10.0.50.0/24', gateway: '10.0.50.1', total: 254, used: 240, reserved: 10, status: 'exhausted' },
      ]);
      setLoading(false);
    }, 500);
  }, []);

  const getUsagePercentage = (range: IPRange) => Math.round(((range.used + range.reserved) / range.total) * 100);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'available': return <Badge variant="success">Musait</Badge>;
      case 'partial': return <Badge className="bg-yellow-500">Kismi</Badge>;
      case 'exhausted': return <Badge variant="destructive">Tukendi</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 70) return 'bg-orange-500';
    if (percentage >= 50) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">IPAM</h1>
          <p className="text-muted-foreground">IP Adres Yonetimi</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Subnet Ekle
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-500/20">
                <Target className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Toplam Subnet</p>
                <p className="text-2xl font-bold">{ranges.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-500/20">
                <Target className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Musait IP</p>
                <p className="text-2xl font-bold">
                  {ranges.reduce((acc, r) => acc + (r.total - r.used - r.reserved), 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-orange-500/20">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Kritik Subnet</p>
                <p className="text-2xl font-bold text-orange-500">
                  {ranges.filter(r => getUsagePercentage(r) >= 70).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-red-500/20">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tukendi</p>
                <p className="text-2xl font-bold text-red-500">
                  {ranges.filter(r => r.status === 'exhausted').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {ranges.filter(r => r.status === 'exhausted').length > 0 && (
        <Card className="border-red-500/50 bg-red-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
              <div>
                <p className="font-medium">IP Adresi Uyarisi</p>
                <p className="text-sm text-muted-foreground">
                  {ranges.filter(r => r.status === 'exhausted').length} subnet'te IP adresi tukendi. 
                  Yeni subnet eklemeniz veya mevcut subnet'leri genisletmeniz gerekebilir.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {loading ? (
          <div className="col-span-full flex justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          ranges.map((range) => {
            const percentage = getUsagePercentage(range);
            return (
              <Card key={range.id} className="hover:border-primary/50 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Target className="h-5 w-5 text-muted-foreground" />
                        <CardTitle className="text-lg">{range.name}</CardTitle>
                        {getStatusBadge(range.status)}
                      </div>
                      <CardDescription className="font-mono">{range.subnet}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground">Gateway</p>
                      <p className="font-mono">{range.gateway}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Kullanım</p>
                      <p className="font-mono">{percentage}%</p>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-muted-foreground">IP Kullanimi</span>
                      <span className="font-medium">
                        {range.used + range.reserved} / {range.total}
                      </span>
                    </div>
                    <div className="h-3 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn("h-full transition-all", getUsageColor(percentage))}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 rounded bg-green-500/10">
                      <p className="font-bold text-green-500">{range.total - range.used - range.reserved}</p>
                      <p className="text-muted-foreground">Musait</p>
                    </div>
                    <div className="p-2 rounded bg-blue-500/10">
                      <p className="font-bold text-blue-500">{range.used}</p>
                      <p className="text-muted-foreground">Kullanilan</p>
                    </div>
                    <div className="p-2 rounded bg-gray-500/10">
                      <p className="font-bold text-gray-500">{range.reserved}</p>
                      <p className="text-muted-foreground">Ayrilan</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
