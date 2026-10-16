'use client';

import { uiError } from '@/lib/i18n/tr';

import { PageHeading } from '@/components/ui/page-heading';
import React, { useState, useEffect } from 'react';
import type { SyncResult } from '@/lib/integrations/vmware';
import { inventorySyncLabel } from '@/lib/integrations/sync-outcome';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Server, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Settings, 
  Save,
  Loader2,
  Database,
  HardDrive,
  Cpu
} from 'lucide-react';

interface VMwareConfig {
  host: string;
  username: string;
  password: string;
  thumbprint: string;
  pollingInterval: number;
  enabledModules: {
    datacenters: boolean;
    clusters: boolean;
    hosts: boolean;
    vms: boolean;
    datastores: boolean;
  };
}

export default function VMwareIntegrationPage() {
  const [config, setConfig] = useState<VMwareConfig>({
    host: '',
    username: '',
    password: '',
    thumbprint: '',
    pollingInterval: 10,
    enabledModules: {
      datacenters: true,
      clusters: true,
      hosts: true,
      vms: true,
      datastores: true,
    },
  });
  
  const [status, setStatus] = useState<{ connected: boolean; version?: string; error?: string } | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('config');

  // Load config and status on mount
  useEffect(() => {
    const loadConfig = async () => {
      setLoading(true);
      try {
        // Fetch saved config
        const configRes = await fetch('/api/integrations/vmware?type=config');
        const configData = await configRes.json();
        if (configData.config) {
          setConfig({
            host: configData.config.host || '',
            username: configData.config.username || '',
            password: '',
            thumbprint: configData.config.thumbprint || '',
            pollingInterval: configData.config.pollingInterval || 10,
            enabledModules: configData.config.enabledModules || {
              datacenters: true,
              clusters: true,
              hosts: true,
              vms: true,
              datastores: true,
            },
          });
        }
        
        // Check connection status from config (without auth)
        setStatus({
          connected: !!configData.config?.host,
          version: configData.config?.host ? 'Configured' : undefined,
          error: uiError(configData.config?.host ? undefined : "Yapılandırılmadı. vCenter bilgilerini girip kaydedin.")
        });

        // Warn if saved config has no password (was accidentally overwritten)
        if (configData.config?.host && !configData.config?.password) {
          setStatus(prev => ({
            connected: prev?.connected ?? false,
            version: prev?.version,
            error: uiError("Kayıtlı yapılandırmada parola yok. Parolayı yeniden girip kaydedin."),
          }));
        }

        // Fetch dashboard data for sync tab (requires live vCenter auth)
        try {
          const dashRes = await fetch('/api/integrations/vmware?type=dashboard');
          if (dashRes.ok) {
            const dashData = await dashRes.json();
            if (dashData.summary) {
              // vCenter is reachable
              if (configData.config?.host) {
                setStatus({ connected: true, version: "Bağlı" });
              }
            }
          }
          // 401 = auth failed, 200 not configured = just skip, status already set above
        } catch (e) {
          console.error('Failed to load dashboard:', e);
        }
      } catch (error) {
        console.error('Failed to load config:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadConfig();
  }, []);

  const testConnection = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/integrations/vmware', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test', config }),
      });
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      setStatus({ connected: false, error: uiError((error as Error).message) });
    }
    setLoading(false);
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/integrations/vmware', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-config', name: 'VMware vCenter', config }),
      });
      if (!response.ok) {
        const result = await response.json();
        setStatus({ connected: false, error: uiError(result.error || 'Bağlantı ayarları kaydedilemedi.') });
      }
    } catch (error) {
      console.error('Failed to save config:', error);
    }
    setSaving(false);
  };

  const runSync = async () => {
    if (!config.host || !config.username) {
      setStatus({ connected: false, error: uiError("Eşitlemeden önce vCenter sunucusunu ve kullanıcı adını girin.") });
      return;
    }
    setSyncing(true);
    try {
      // Sync uses persisted configuration; settings changes require an explicit save.

      const response = await fetch('/api/integrations/vmware', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync' }),
      });
      const data = await response.json();
      if (!response.ok) {
        setStatus({ connected: false, error: uiError(data.error || 'Sync failed') });
        setActiveTab('config');
      } else {
        setSyncResult(data);
        setActiveTab('sync');
      }
    } catch (error) {
      console.error('Sync failed:', error);
      setStatus({ connected: false, error: uiError((error as Error).message) });
    }
    setSyncing(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between max-md:flex-col max-md:items-stretch max-md:gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-lg bg-blue-500/20">
            <Server className="h-6 w-6 text-blue-500" />
          </div>
          <div>
            <PageHeading section="vmware" description={<>
              VMware vCenter bağlantısını yapılandırın ve sanallaştırma envanterini eşitleyin
            </>}>VMware vCenter Entegrasyonu</PageHeading>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status?.connected ? (
            <Badge variant="success" className="gap-1">
              <CheckCircle className="h-3 w-3" />
              Bağlı {status.version && `(${status.version})`}
            </Badge>
          ) : status ? (
            <Badge variant="destructive" className="gap-1">
              <XCircle className="h-3 w-3" />
              Bağlantı kesildi
            </Badge>
          ) : null}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="config" className="gap-2">
            <Settings className="h-4 w-4" />
            Yapılandırma
          </TabsTrigger>
          <TabsTrigger value="sync" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Eşitleme Durumu
          </TabsTrigger>
          <TabsTrigger value="modules" className="gap-2">
            <Database className="h-4 w-4" />
            Modüller
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>vCenter Bağlantı Ayarları</CardTitle>
              <CardDescription>
                VMware vCenter sunucunuza bağlantıyı yapılandırın
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="host">vCenter Sunucusu</Label>
                  <Input
                    id="host"
                    placeholder="10.5.56.10 (https:// öneki olmadan)"
                    value={config.host}
                    onChange={(e) => setConfig({ ...config, host: e.target.value.replace(/^https?:\/\//i, '').replace(/\/+$/, '') })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="thumbprint">Sertifika Parmak İzi (isteğe bağlı)</Label>
                  <Input
                    id="thumbprint"
                    placeholder="SHA-1 sertifika parmak izi"
                    value={config.thumbprint}
                    onChange={(e) => setConfig({ ...config, thumbprint: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Kullanıcı Adı</Label>
                  <Input
                    id="username"
                    placeholder="administrator@vsphere.local"
                    value={config.username}
                    onChange={(e) => setConfig({ ...config, username: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Parola</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Parolayı girin"
                    value={config.password}
                    onChange={(e) => setConfig({ ...config, password: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="polling">Envanter senkronizasyon aralığı (dakika)</Label>
                <Input
                  id="polling"
                  type="number"
                  min={1}
                  max={1440}
                  value={config.pollingInterval}
                  onChange={(e) => setConfig({ ...config, pollingInterval: parseInt(e.target.value) })}
                />
                <p className="text-xs text-muted-foreground">Kaydedilen aralık otomatik envanter senkronizasyonunu belirler. Alarm ve grafik yenileme aralıkları ayrıdır.</p>
              </div>

              <div className="flex gap-4 pt-4">
                <Button onClick={testConnection} disabled={loading} variant="outline">
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Server className="h-4 w-4" />
                  )}
                  <span className="ml-2">Bağlantıyı Test Et</span>
                </Button>
                <Button onClick={saveConfig} disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span className="ml-2">Yapılandırmayı Kaydet</span>
                </Button>
              </div>

              {status && status.error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span>{uiError(status.error)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Manuel senkronizasyon</CardTitle>
              <CardDescription>
                Senkronizasyon kayıtlı bağlantı ayarlarını kullanır. Ayar değişikliklerini önce kaydedin.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={runSync} disabled={syncing} className="gap-2">
                {syncing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span className="ml-2">Kayıtlı ayarlarla senkronize et</span>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sync" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-green-500/20">
                    <Cpu className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Kümeler</p>
                    <p className="text-2xl font-bold">
                      {syncResult ? syncResult.clustersCreated + syncResult.clustersUpdated : '—'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-blue-500/20">
                    <Server className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">ESXi Sunucuları</p>
                    <p className="text-2xl font-bold">
                      {syncResult ? syncResult.hostsCreated + syncResult.hostsUpdated : '—'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-purple-500/20">
                    <HardDrive className="h-5 w-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Sanal Makineler</p>
                    <p className="text-2xl font-bold">
                      {syncResult ? syncResult.vmsCreated + syncResult.vmsUpdated : '—'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-orange-500/20">
                    <Database className="h-5 w-5 text-orange-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Veri Depoları</p>
                    <p className="text-2xl font-bold">{syncResult?.datastoresProcessed ?? '—'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-cyan-500/20">
                    <RefreshCw className="h-5 w-5 text-cyan-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Süre</p>
                    <p className="text-2xl font-bold">{syncResult ? `${syncResult.duration}ms` : '—'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {syncResult && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {syncResult.status === 'success' ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : syncResult.status === 'failed' ? (
                      <XCircle className="h-5 w-5 text-destructive" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-yellow-500" />
                    )}
                    <div>
                      <p className="font-semibold">
                        {inventorySyncLabel(syncResult.status)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {syncResult.itemsProcessed} öğe işlendi · {syncResult.errorCount} hata
                      </p>
                    </div>
                  </div>
                </div>
                {syncResult.errors && syncResult.errors.length > 0 && (
                  <div className="mt-4 p-3 rounded-lg bg-destructive/10">
                    <p className="text-sm font-medium mb-2">Hatalar:</p>
                    <ul className="text-sm text-destructive space-y-1">
                      {syncResult.errors.map((error, i) => (
                        <li key={i}>• {uiError(error)}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="modules" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Veri Modülleri</CardTitle>
              <CardDescription>
                Eşitlenecek VMware verilerini seçin
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <Database className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Veri Merkezleri</p>
                    <p className="text-sm text-muted-foreground">
                      Veri merkezi hiyerarşisini içe aktar
                    </p>
                  </div>
                </div>
                <Switch
                  checked={config.enabledModules.datacenters}
                  onCheckedChange={(checked) => 
                    setConfig({ ...config, enabledModules: { ...config.enabledModules, datacenters: checked } })
                  }
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <Cpu className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Kümeler</p>
                    <p className="text-sm text-muted-foreground">
                      Küme ve kaynak havuzu bilgilerini içe aktar
                    </p>
                  </div>
                </div>
                <Switch
                  checked={config.enabledModules.clusters}
                  onCheckedChange={(checked) => 
                    setConfig({ ...config, enabledModules: { ...config.enabledModules, clusters: checked } })
                  }
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <Server className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">ESXi Sunucuları</p>
                    <p className="text-sm text-muted-foreground">
                      ESXi sunucu envanterini ve durumunu içe aktar
                    </p>
                  </div>
                </div>
                <Switch
                  checked={config.enabledModules.hosts}
                  onCheckedChange={(checked) => 
                    setConfig({ ...config, enabledModules: { ...config.enabledModules, hosts: checked } })
                  }
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <HardDrive className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Sanal Makineler</p>
                    <p className="text-sm text-muted-foreground">
                      Sanal makine envanterini ve yapılandırmalarını içe aktar
                    </p>
                  </div>
                </div>
                <Switch
                  checked={config.enabledModules.vms}
                  onCheckedChange={(checked) => 
                    setConfig({ ...config, enabledModules: { ...config.enabledModules, vms: checked } })
                  }
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <Database className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Veri Depoları</p>
                    <p className="text-sm text-muted-foreground">
                      Veri deposu ve depolama bilgilerini içe aktar
                    </p>
                  </div>
                </div>
                <Switch
                  checked={config.enabledModules.datastores}
                  onCheckedChange={(checked) => 
                    setConfig({ ...config, enabledModules: { ...config.enabledModules, datastores: checked } })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
