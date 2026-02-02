'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Network, Activity } from 'lucide-react';

export default function NetworkAnalyticsPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Network Analytics</h1>
          <p className="text-muted-foreground">Ağ performans ve trafik analizi</p>
        </div>
        <Button variant="outline" size="icon">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Network className="h-5 w-5" />
              Trafik Analizi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Ağ trafik istatistikleri burada görüntülenecek.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Performans Metrikleri
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Latency, throughput ve paket kayıp oranları.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
