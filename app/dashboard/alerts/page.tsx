'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, AlertCircle, AlertOctagon, CheckCircle, Clock, Filter, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Alert {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  message: string;
  source: string;
  timestamp: string;
  acknowledged: boolean;
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    // Simulate loading alerts
    setTimeout(() => {
      setAlerts([
        {
          id: '1',
          severity: 'critical',
          title: 'Sunucu Erişilemez',
          message: 'SRV-DB-01 sunucusuna ping yanıt vermiyor',
          source: 'SRV-DB-01',
          timestamp: new Date().toISOString(),
          acknowledged: false,
        },
        {
          id: '2',
          severity: 'high',
          title: 'Disk Doluluk %95',
          message: 'C: sürücüsü disk alanı kritik seviyede',
          source: 'SRV-APP-02',
          timestamp: new Date(Date.now() - 300000).toISOString(),
          acknowledged: false,
        },
        {
          id: '3',
          severity: 'medium',
          title: 'Yüksek CPU Kullanımı',
          message: 'CPU kullanımı son 15 dakikadır %85 üzerinde',
          source: 'SRV-WEB-01',
          timestamp: new Date(Date.now() - 600000).toISOString(),
          acknowledged: true,
        },
        {
          id: '4',
          severity: 'low',
          title: 'Servis Yavaşlığı',
          message: 'Yanıt süresi normalin üzerinde',
          source: 'API-Gateway',
          timestamp: new Date(Date.now() - 900000).toISOString(),
          acknowledged: false,
        },
      ]);
      setLoading(false);
    }, 500);
  }, []);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical': return <Badge variant="destructive">Kritik</Badge>;
      case 'high': return <Badge variant="warning">Yüksek</Badge>;
      case 'medium': return <Badge className="bg-yellow-500">Orta</Badge>;
      case 'low': return <Badge variant="secondary">Düşük</Badge>;
      default: return <Badge variant="outline">{severity}</Badge>;
    }
  };

  const filteredAlerts = alerts.filter(alert => {
    if (filter === 'all') return true;
    if (filter === 'unacknowledged') return !alert.acknowledged;
    return alert.severity === filter;
  });

  const acknowledgeAlert = (id: string) => {
    setAlerts(alerts.map(a => a.id === id ? { ...a, acknowledged: true } : a));
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Kritik Alarmlar</h1>
          <p className="text-muted-foreground">Sistem uyarıları ve alarm yönetimi</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline">
            <Filter className="h-4 w-4 mr-2" />
            Filtrele
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-red-500/20">
                <AlertOctagon className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Kritik</p>
                <p className="text-2xl font-bold">{alerts.filter(a => a.severity === 'critical' && !a.acknowledged).length}</p>
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
                <p className="text-sm text-muted-foreground">Yüksek</p>
                <p className="text-2xl font-bold">{alerts.filter(a => a.severity === 'high' && !a.acknowledged).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-yellow-500/20">
                <AlertCircle className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Bekleyen</p>
                <p className="text-2xl font-bold">{alerts.filter(a => !a.acknowledged).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-500/20">
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Çözülen</p>
                <p className="text-2xl font-bold">{alerts.filter(a => a.acknowledged).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {['all', 'unacknowledged', 'critical', 'high', 'medium', 'low'].map((f) => (
          <Button
            key={f}
            variant={filter === f ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'Tümü' : f === 'unacknowledged' ? 'Bekleyen' : f.charAt(0).toUpperCase() + f.slice(1)}
          </Button>
        ))}
      </div>

      {/* Alerts List */}
      <Card>
        <CardHeader>
          <CardTitle>Alarm Listesi</CardTitle>
          <CardDescription>{filteredAlerts.length} alarm bulundu</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Alarm bulunmuyor</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={cn(
                    "flex items-start gap-4 p-4 rounded-lg border transition-colors",
                    alert.acknowledged
                      ? "bg-muted/30 border-border"
                      : "bg-card border-border hover:border-primary/50"
                  )}
                >
                  <div className={cn("p-2 rounded-full shrink-0", getSeverityColor(alert.severity) + "/20")}>
                    <AlertTriangle className={cn("h-5 w-5", getSeverityColor(alert.severity))} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {getSeverityBadge(alert.severity)}
                      {alert.acknowledged && (
                        <Badge variant="outline" className="text-green-500">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Onaylandı
                        </Badge>
                      )}
                    </div>
                    <h4 className="font-semibold">{alert.title}</h4>
                    <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(alert.timestamp).toLocaleString('tr-TR')}
                      </span>
                      <span>Kaynak: {alert.source}</span>
                    </div>
                  </div>
                  {!alert.acknowledged && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => acknowledgeAlert(alert.id)}
                    >
                      Onayla
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
