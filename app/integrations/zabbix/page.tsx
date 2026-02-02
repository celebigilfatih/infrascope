'use client';

import React, { useState, useEffect } from 'react';
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
  Network,
  Shield
} from 'lucide-react';

interface ZabbixConfig {
  url: string;
  authToken: string;
  pollingInterval: number;
  enabledModules: {
    hosts: boolean;
    interfaces: boolean;
    triggers: boolean;
    items: boolean;
  };
}

interface SyncResult {
  success: boolean;
  hostsCreated: number;
  hostsUpdated: number;
  interfacesProcessed: number;
  triggersProcessed: number;
  errors: string[];
  duration: number;
}

export default function ZabbixIntegrationPage() {
  const [config, setConfig] = useState<ZabbixConfig>({
    url: '',
    authToken: '',
    pollingInterval: 5,
    enabledModules: {
      hosts: true,
      interfaces: true,
      triggers: true,
      items: false,
    },
  });
  
  const [status, setStatus] = useState<{ connected: boolean; version?: string; error?: string } | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('config');

  // Load existing config
  useEffect(() => {
    // In production, fetch from API
    setConfig({
      url: 'https://zabbix.example.com',
      authToken: '',
      pollingInterval: 5,
      enabledModules: {
        hosts: true,
        interfaces: true,
        triggers: true,
        items: false,
      },
    });
  }, []);

  const testConnection = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/integrations/zabbix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test', config }),
      });
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      setStatus({ connected: false, error: (error as Error).message });
    }
    setLoading(false);
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      await fetch('/api/integrations/zabbix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-config', name: 'Zabbix Server', config }),
      });
      // Show success
    } catch (error) {
      console.error('Failed to save config:', error);
    }
    setSaving(false);
  };

  const runSync = async () => {
    setSyncing(true);
    try {
      const response = await fetch('/api/integrations/zabbix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync' }),
      });
      const data = await response.json();
      setSyncResult(data);
      setActiveTab('sync');
    } catch (error) {
      console.error('Sync failed:', error);
    }
    setSyncing(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-lg bg-red-500/20">
            <Server className="h-6 w-6 text-red-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Zabbix Integration</h1>
            <p className="text-muted-foreground">
              Zabbix monitoring system configuration and synchronization
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status?.connected ? (
            <Badge variant="success" className="gap-1">
              <CheckCircle className="h-3 w-3" />
              Connected {status.version && `(${status.version})`}
            </Badge>
          ) : status ? (
            <Badge variant="destructive" className="gap-1">
              <XCircle className="h-3 w-3" />
              Disconnected
            </Badge>
          ) : null}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="config" className="gap-2">
            <Settings className="h-4 w-4" />
            Configuration
          </TabsTrigger>
          <TabsTrigger value="sync" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Sync Status
          </TabsTrigger>
          <TabsTrigger value="modules" className="gap-2">
            <Network className="h-4 w-4" />
            Modules
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Connection Settings</CardTitle>
              <CardDescription>
                Configure the connection to your Zabbix server
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="url">Zabbix API URL</Label>
                  <Input
                    id="url"
                    placeholder="https://zabbix.example.com"
                    value={config.url}
                    onChange={(e) => setConfig({ ...config, url: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="token">API Token</Label>
                  <Input
                    id="token"
                    type="password"
                    placeholder="Enter API token"
                    value={config.authToken}
                    onChange={(e) => setConfig({ ...config, authToken: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="polling">Polling Interval (minutes)</Label>
                <Input
                  id="polling"
                  type="number"
                  min={1}
                  max={60}
                  value={config.pollingInterval}
                  onChange={(e) => setConfig({ ...config, pollingInterval: parseInt(e.target.value) })}
                />
              </div>

              <div className="flex gap-4 pt-4">
                <Button onClick={testConnection} disabled={loading} variant="outline">
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Network className="h-4 w-4" />
                  )}
                  <span className="ml-2">Test Connection</span>
                </Button>
                <Button onClick={saveConfig} disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span className="ml-2">Save Configuration</span>
                </Button>
              </div>

              {status && status.error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span>{status.error}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Run Manual Sync</CardTitle>
              <CardDescription>
                Manually trigger a synchronization with Zabbix
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={runSync} disabled={syncing} className="gap-2">
                {syncing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span className="ml-2">Start Synchronization</span>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sync" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-green-500/20">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Hosts Created</p>
                    <p className="text-2xl font-bold">{syncResult?.hostsCreated || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-blue-500/20">
                    <RefreshCw className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Hosts Updated</p>
                    <p className="text-2xl font-bold">{syncResult?.hostsUpdated || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-purple-500/20">
                    <Network className="h-5 w-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Interfaces</p>
                    <p className="text-2xl font-bold">{syncResult?.interfacesProcessed || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-orange-500/20">
                    <Shield className="h-5 w-5 text-orange-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Triggers</p>
                    <p className="text-2xl font-bold">{syncResult?.triggersProcessed || 0}</p>
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
                    {syncResult.success ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-yellow-500" />
                    )}
                    <div>
                      <p className="font-semibold">
                        {syncResult.success ? 'Sync Completed' : 'Sync Completed with Warnings'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Duration: {syncResult.duration}ms
                      </p>
                    </div>
                  </div>
                </div>
                {syncResult.errors.length > 0 && (
                  <div className="mt-4 p-3 rounded-lg bg-destructive/10">
                    <p className="text-sm font-medium mb-2">Errors:</p>
                    <ul className="text-sm text-destructive space-y-1">
                      {syncResult.errors.map((error, i) => (
                        <li key={i}>• {error}</li>
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
              <CardTitle>Data Modules</CardTitle>
              <CardDescription>
                Select which Zabbix data to synchronize
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <Server className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Hosts</p>
                    <p className="text-sm text-muted-foreground">
                      Import hosts and inventory data
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
                  <Network className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Interfaces</p>
                    <p className="text-sm text-muted-foreground">
                      Import network interfaces and IP addresses
                    </p>
                  </div>
                </div>
                <Switch
                  checked={config.enabledModules.interfaces}
                  onCheckedChange={(checked) => 
                    setConfig({ ...config, enabledModules: { ...config.enabledModules, interfaces: checked } })
                  }
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Triggers</p>
                    <p className="text-sm text-muted-foreground">
                      Import triggers and alert configuration
                    </p>
                  </div>
                </div>
                <Switch
                  checked={config.enabledModules.triggers}
                  onCheckedChange={(checked) => 
                    setConfig({ ...config, enabledModules: { ...config.enabledModules, triggers: checked } })
                  }
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <Database className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Items</p>
                    <p className="text-sm text-muted-foreground">
                      Import monitored items and metrics
                    </p>
                  </div>
                </div>
                <Switch
                  checked={config.enabledModules.items}
                  onCheckedChange={(checked) => 
                    setConfig({ ...config, enabledModules: { ...config.enabledModules, items: checked } })
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
