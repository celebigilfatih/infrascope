'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RefreshCw, Save, Gauge } from 'lucide-react';

interface Threshold {
  id: string;
  name: string;
  metric: string;
  warning: number;
  critical: number;
}

export default function ThresholdsPage() {
  const [thresholds, setThresholds] = useState<Threshold[]>([
    { id: '1', name: 'CPU Usage', metric: 'cpu_percent', warning: 70, critical: 90 },
    { id: '2', name: 'Memory Usage', metric: 'memory_percent', warning: 80, critical: 95 },
    { id: '3', name: 'Disk Usage', metric: 'disk_percent', warning: 75, critical: 90 },
    { id: '4', name: 'Network Latency', metric: 'latency_ms', warning: 50, critical: 100 },
  ]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Thresholds</h1>
          <p className="text-muted-foreground">Alarm eşik değerleri yapılandırması</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button>
            <Save className="h-4 w-4 mr-2" />
            Kaydet
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {thresholds.map((threshold) => (
          <Card key={threshold.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Gauge className="h-5 w-5" />
                {threshold.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Metrik</Label>
                  <Input value={threshold.metric} readOnly />
                </div>
                <div>
                  <Label>Uyarı Eşiği</Label>
                  <Input 
                    type="number" 
                    value={threshold.warning}
                    onChange={(e) => {
                      const newThresholds = thresholds.map(t => 
                        t.id === threshold.id ? { ...t, warning: parseInt(e.target.value) } : t
                      );
                      setThresholds(newThresholds);
                    }}
                  />
                </div>
                <div>
                  <Label>Kritik Eşik</Label>
                  <Input 
                    type="number"
                    value={threshold.critical}
                    onChange={(e) => {
                      const newThresholds = thresholds.map(t => 
                        t.id === threshold.id ? { ...t, critical: parseInt(e.target.value) } : t
                      );
                      setThresholds(newThresholds);
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
