'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, CheckCircle, XCircle, AlertCircle, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

interface IntegrationStatus {
  id: string;
  name: string;
  type: 'monitoring' | 'backup' | 'security' | 'cloud' | 'cmdb';
  status: 'connected' | 'disconnected' | 'error' | 'syncing';
  lastSync: string;
  message: string;
  healthScore: number;
}

export default function StatusPage() {
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTimeout(() => {
      setIntegrations([
        { id: '1', name: 'Zabbix Server', type: 'monitoring', status: 'connected', lastSync: '2 dakika', message: 'Tüm hostlar izleniyor', healthScore: 98 },
        { id: '2', name: 'VMware vCenter', type: 'monitoring', status: 'syncing', lastSync: '5 dakika', message: 'VM envanteri senkronize ediliyor', healthScore: 95 },
        { id: '3', name: 'FortiGate Firewall', type: 'security', status: 'connected', lastSync: '5 dakika', message: 'Policy listesi güncel', healthScore: 100 },
        { id: '4', name: 'Veeam Backup', type: 'backup', status: 'connected', lastSync: '1 saat', message: 'Son yedekleme başarılı', healthScore: 99 },
        { id: '5', name: 'AWS Console', type: 'cloud', status: 'connected', lastSync: '10 dakika', message: 'EC2 durumu güncel', healthScore: 92 },
        { id: '6', name: 'NetBox CMDB', type: 'cmdb', status: 'error', lastSync: '2 saat', message: 'API bağlantı hatası', healthScore: 45 },
        { id: '7', name: 'Azure AD', type: 'cloud', status: 'disconnected', lastSync: '-', message: 'Entegrasyon yapılandırılmadı', healthScore: 0 },
      ]);
      setLoading(false);
    }, 500);
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected': return <Badge variant="success">Bağlı</Badge>;
      case 'disconnected': return <Badge variant="destructive">Bağlantı Kesildi</Badge>;
      case 'error': return <Badge variant="destructive">Hata</Badge>;
      case 'syncing': return <Badge className="bg-blue-500">Senkronize</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected': return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'disconnected': return <XCircle className="h-5 w-5 text-red-500" />;
      case 'error': return <AlertCircle className="h-5 w-5 text-red-500" />;
      case 'syncing': return <Activity className="h-5 w-5 text-blue-500 animate-pulse" />;
      default: return <Activity className="h-5 w-5 text-gray-500" />;
    }
  };

  const getHealthColor = (score: number) => {
    if (score >= 90) return 'text-green-500';
    if (score >= 70) return 'text-yellow-500';
    if (score >= 50) return 'text-orange-500';
    return 'text-red-500';
  };

  const getHealthBarColor = (score: number) => {
    if (score >= 90) return 'bg-green-500';
    if (score >= 70) return 'bg-yellow-500';
    if (score >= 50) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'monitoring': return 'İzleme';
      case 'backup': return 'Yedekleme';
      case 'security': return 'Güvenlik';
      case 'cloud': return 'Cloud';
      case 'cmdb': return 'CMDB';
      default: return type;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Integration Status</h1>
          <p className="text-muted-foreground">Entegrasyon durumu ve sağlık kontrolü</p>
        </div>
        <Button variant="outline" size="icon">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-500/20">
                <Activity className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Toplam Entegrasyon</p>
                <p className="text-2xl font-bold">{integrations.length}</p>
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
                <p className="text-sm text-muted-foreground">Bağlı</p>
                <p className="text-2xl font-bold">{integrations.filter(i => i.status === 'connected').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-orange-500/20">
                <AlertCircle className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Hata/Sorun</p>
                <p className="text-2xl font-bold">{integrations.filter(i => i.status === 'error' || i.status === 'disconnected').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-500/20">
                <Activity className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ort. Sağlık</p>
                <p className="text-2xl font-bold">{Math.round(integrations.reduce((acc, i) => acc + i.healthScore, 0) / integrations.length)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          integrations.map((integration) => (
            <Card key={integration.id} className={cn(
              "hover:border-primary/50 transition-colors",
              integration.status === 'error' && "border-red-500/50",
              integration.status === 'disconnected' && "opacity-60"
            )}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="shrink-0">
                    {getStatusIcon(integration.status)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold">{integration.name}</h3>
                      <Badge variant="outline">{getTypeLabel(integration.type)}</Badge>
                      {getStatusBadge(integration.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">{integration.message}</p>
                  </div>
                  <div className="w-32 shrink-0">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Sağlık</span>
                      <span className={cn("font-bold", getHealthColor(integration.healthScore))}>
                        {integration.healthScore}%
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn("h-full transition-all", getHealthBarColor(integration.healthScore))}
                        style={{ width: `${integration.healthScore}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground shrink-0">
                    <p>Son senkron:</p>
                    <p>{integration.lastSync}</p>
                  </div>
                  <Button variant="outline" size="sm">
                    Detaylar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
