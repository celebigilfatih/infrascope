'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, LineChart, Calendar } from 'lucide-react';

export default function ForecastPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Capacity Forecast</h1>
          <p className="text-muted-foreground">Kapasite tahminleri ve planlama</p>
        </div>
        <Button variant="outline" size="icon">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LineChart className="h-5 w-5" />
              30 Günlük Tahmin
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">CPU kullanımı %85 seviyesine ulaşacak</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              90 Günlük Tahmin
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Storage kapasitesi kritik seviyeye yaklaşacak</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
