'use client';

import React, { useState } from 'react';
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

interface SyncResult {
  success: boolean;
  clustersCreated: number;
  clustersUpdated: number;
  hostsCreated: number;
  hostsUpdated: number;
  vmsCreated: number;
  vmsUpdated: number;
  datastoresProcessed: number;
  errors: string[];
  duration: number;
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
      setStatus({ connected: false, error: (error as Error).message });
    }
    setLoading(false);
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      await fetch('/api/integrations/vmware', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-config', name: 'VMware vCenter', config }),
      });
    } catch (error) {
      console.error('Failed to save config:', error);
    }
    setSaving(false);
  };

  const runSync = async () => {
    setSyncing(true);
    try {
      const response = await fetch('/api/integrations/vmware', {
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
          <div className="p-3 rounded-lg bg-blue-500/20">
            <Server className="h-6 w-6 text-blue-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">VMware vCenter Integration</h1>
            <p className="text-muted-foreground">
              VMware vCenter server configuration and virtualization inventory sync
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
            <Database className="h-4 w-4" />
            Modules
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>vCenter Connection Settings</CardTitle>
              <CardDescription>
                Configure the connection to your VMware vCenter server
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="host">vCenter Host</Label>
                  <Input
                    id="host"
                    placeholder="vcenter.example.com"
                    value={config.host}
                    onChange={(e) => setConfig({ ...config, host: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="thumbprint">Thumbprint (optional)</Label>
                  <Input
                    id="thumbprint"
                    placeholder="SHA-1 thumbprint"
                    value={config.thumbprint}
                    onChange={(e) => setConfig({ ...config, thumbprint: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    placeholder="administrator@vsphere.local"
                    value={config.username}
                    onChange={(e) => setConfig({ ...config, username: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter password"
                    value={config.password}
                    onChange={(e) => setConfig({ ...config, password: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="polling">Polling Interval (minutes)</Label>
                <Input
                  id="polling"
                  type="number"
                  min={5}
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
                    <Server className="h-4 w-4" />
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
                Manually trigger a synchronization with vCenter
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
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-green-500/20">
                    <Cpu className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Clusters</p>
                    <p className="text-2xl font-bold">
                      {(syncResult?.clustersCreated || 0) + (syncResult?.clustersUpdated || 0)}
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
                    <p className="text-sm text-muted-foreground">ESXi Hosts</p>
                    <p className="text-2xl font-bold">
                      {(syncResult?.hostsCreated || 0) + (syncResult?.hostsUpdated || 0)}
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
                    <p className="text-sm text-muted-foreground">Virtual Machines</p>
                    <p className="text-2xl font-bold">
                      {(syncResult?.vmsCreated || 0) + (syncResult?.vmsUpdated || 0)}
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
                    <p className="text-sm text-muted-foreground">Datastores</p>
                    <p className="text-2xl font-bold">{syncResult?.datastoresProcessed || 0}</p>
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
                    <p className="text-sm text-muted-foreground">Duration</p>
                    <p className="text-2xl font-bold">{syncResult?.duration || 0}ms</p>
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
                        Processed {syncResult.hostsCreated + syncResult.hostsUpdated + syncResult.vmsCreated + syncResult.vmsUpdated} items
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
                Select which VMware data to synchronize
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <Database className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Datacenters</p>
                    <p className="text-sm text-muted-foreground">
                      Import datacenter hierarchy
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
                    <p className="font-medium">Clusters</p>
                    <p className="text-sm text-muted-foreground">
                      Import cluster and resource pool information
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
                    <p className="font-medium">ESXi Hosts</p>
                    <p className="text-sm text-muted-foreground">
                      Import ESXi host inventory and status
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
                    <p className="font-medium">Virtual Machines</p>
                    <p className="text-sm text-muted-foreground">
                      Import VM inventory and configurations
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
                    <p className="font-medium">Datastores</p>
                    <p className="text-sm text-muted-foreground">
                      Import datastore and storage information
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
