'use client';

import { uiError } from '@/lib/i18n/tr';

import { StatusBadge } from '@/components/ui/status-badge';
import { PageHeading } from '@/components/ui/page-heading';
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, CheckCircle, XCircle, AlertCircle, Activity, Settings2, ArrowUpRight } from 'lucide-react';
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
  const [error, setError] = useState<string | null>(null);

  const fetchIntegrations = useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/integrations/status');
        const result = await response.json();
        if (!response.ok || !result.success || !Array.isArray(result.data)) throw new Error(uiError(result.error || 'Entegrasyon durumu alınamadı.'));
        setIntegrations(result.data);
      } catch (failure) {
        setError(uiError(failure instanceof Error ? failure.message : 'Entegrasyon durumu alınamadı.'));
      } finally {
        setLoading(false);
      }
  }, []);
  useEffect(() => { void fetchIntegrations(); }, [fetchIntegrations]);

  const getStatusBadge = (status: string) => { return <StatusBadge status={status} />; };

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
      <div className="flex items-center justify-between max-md:flex-col max-md:items-stretch max-md:gap-4">
        <div>
          <PageHeading section="integrations" description={<>Entegrasyon durumu ve sağlık kontrolü</>}>Entegrasyon Durumu</PageHeading>
        </div>
        <Button variant="outline" size="icon" aria-label="Yenile" onClick={() => void fetchIntegrations()} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin motion-reduce:animate-none')} />
        </Button>
      </div>

      {error && <div role="alert" className="flex items-start gap-3 rounded-xl border border-[var(--ui-danger-border)] bg-[var(--ui-danger-bg)] p-4 text-sm text-[var(--ui-danger-fg)]"><AlertCircle size={18} className="shrink-0" aria-hidden="true" /><p>{uiError(error)}</p></div>}
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
                <p className="text-sm text-muted-foreground">Bağlı değil</p>
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
                <p className="text-2xl font-bold">{integrations.length ? Math.round(integrations.reduce((acc, i) => acc + i.healthScore, 0) / integrations.length) : 0}%</p>
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
          integrations.map((integration) => {
            const unconfigured = integration.id.startsWith('unconfigured-');
            const target = ({ 'VMware vCenter': '/integrations/vmware', 'FortiGate Firewall': '/integrations/firewall', FortiAnalyzer: '/integrations/fortianalyzer', 'SNMP Monitoring': '/integrations/nms/devices' } as Record<string, string>)[integration.name];
            return (
            <Card key={integration.id} className={cn(
              "hover:border-primary/50 transition-colors",
              integration.status === 'error' && "border-red-500/50",
            )}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="shrink-0">
                    {unconfigured ? <Settings2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" /> : getStatusIcon(integration.status)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="font-semibold">{integration.name}</h3>
                      <Badge variant="outline">{getTypeLabel(integration.type)}</Badge>
                      {unconfigured ? <SemanticBadge tone="neutral" icon={Settings2}>Yapılandırılmadı</SemanticBadge> : getStatusBadge(integration.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">{integration.message}</p>
                  </div>
                  <div className="w-full shrink-0 sm:w-32">
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
                  {target && <Button variant="outline" size="sm" asChild><Link href={target}>Ayarları aç<ArrowUpRight size={14} aria-hidden="true" /></Link></Button>}
                </div>
              </CardContent>
            </Card>
          ); })
        )}
      </div>
    </div>
  );
}
