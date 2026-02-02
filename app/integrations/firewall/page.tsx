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
  Shield, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Settings, 
  Save,
  Loader2,
  Globe,
  Lock,
  Network
} from 'lucide-react';

interface FortiGateConfig {
  host: string;
  accessToken: string;
  snmp: {
    community: string;
    version: '2c' | '3';
  };
  pollingInterval: number;
  syncMode: 'snmp' | 'rest' | 'both';
  enabledModules: {
    interfaces: boolean;
    vlans: boolean;
    policies: boolean;
    addresses: boolean;
    vips: boolean;
    sdwan: boolean;
  };
}

interface SyncResult {
  success: boolean;
  deviceId?: string;
  interfacesProcessed: number;
  vlansProcessed: number;
  policiesProcessed: number;
  addressesProcessed: number;
  errors: string[];
  duration: number;
}

export default function FortiGateIntegrationPage() {
  const [config, setConfig] = useState<FortiGateConfig>({
    host: '',
    accessToken: '',
    snmp: {
      community: 'public',
      version: '2c',
    },
    pollingInterval: 15,
    syncMode: 'rest',
    enabledModules: {
      interfaces: true,
      vlans: true,
      policies: true,
      addresses: true,
      vips: false,
      sdwan: false,
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
      const response = await fetch('/api/integrations/fortigate', {
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
      await fetch('/api/integrations/fortigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-config', name: `FortiGate-${config.host}`, config }),
      });
    } catch (error) {
      console.error('Failed to save config:', error);
    }
    setSaving(false);
  };

  const runSync = async () => {
    setSyncing(true);
    try {
      const response = await fetch('/api/integrations/fortigate', {
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
            <Shield className="h-6 w-6 text-blue-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">FortiGate Firewall Integration</h1>
            <p className="text-muted-foreground">
              FortiGate firewall configuration, policies, and security settings
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
            <Lock className="h-4 w-4" />
            Modules
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>FortiGate Connection Settings</CardTitle>
              <CardDescription>
                Configure the connection to your FortiGate firewall
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="host">FortiGate Host</Label>
                  <Input
                    id="host"
                    placeholder="firewall.example.com"
                    value={config.host}
                    onChange={(e) => setConfig({ ...config, host: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="token">API Access Token</Label>
                  <Input
                    id="token"
                    type="password"
                    placeholder="Enter API access token"
                    value={config.accessToken}
                    onChange={(e) => setConfig({ ...config, accessToken: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="syncMode">Sync Mode</Label>
                  <select
                    id="syncMode"
                    className="w-full h-10 px-3 rounded-md border border-input bg-background"
                    value={config.syncMode}
                    onChange={(e) => setConfig({ ...config, syncMode: e.target.value as 'snmp' | 'rest' | 'both' })}
                  >
                    <option value="snmp">SNMP Only</option>
                    <option value="rest">REST API Only</option>
                    <option value="both">SNMP + REST API</option>
                  </select>
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
              </div>

              <div className="border-t pt-4 mt-4">
                <h4 className="font-medium mb-3">SNMP Configuration (Optional)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="snmpCommunity">SNMP Community</Label>
                    <Input
                      id="snmpCommunity"
                      placeholder="public"
                      value={config.snmp.community}
                      onChange={(e) => setConfig({ ...config, snmp: { ...config.snmp, community: e.target.value } })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="snmpVersion">SNMP Version</Label>
                    <select
                      id="snmpVersion"
                      className="w-full h-10 px-3 rounded-md border border-input bg-background"
                      value={config.snmp.version}
                      onChange={(e) => setConfig({ ...config, snmp: { ...config.snmp, version: e.target.value as '2c' | '3' } })}
                    >
                      <option value="2c">SNMP v2c</option>
                      <option value="3">SNMP v3</option>
                    </select>
                  </div>
                </div>
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
                Manually trigger a synchronization with FortiGate
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
                  <div className="p-2 rounded-full bg-blue-500/20">
                    <Globe className="h-5 w-5 text-blue-500" />
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
                  <div className="p-2 rounded-full bg-green-500/20">
                    <Network className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">VLANs</p>
                    <p className="text-2xl font-bold">{syncResult?.vlansProcessed || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-purple-500/20">
                    <Shield className="h-5 w-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Policies</p>
                    <p className="text-2xl font-bold">{syncResult?.policiesProcessed || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-orange-500/20">
                    <Lock className="h-5 w-5 text-orange-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Addresses</p>
                    <p className="text-2xl font-bold">{syncResult?.addressesProcessed || 0}</p>
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
                Select which FortiGate data to synchronize
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <Globe className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Interfaces</p>
                    <p className="text-sm text-muted-foreground">
                      Import physical and VLAN interfaces
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
                  <Network className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">VLANs</p>
                    <p className="text-sm text-muted-foreground">
                      Import VLAN configuration
                    </p>
                  </div>
                </div>
                <Switch
                  checked={config.enabledModules.vlans}
                  onCheckedChange={(checked) => 
                    setConfig({ ...config, enabledModules: { ...config.enabledModules, vlans: checked } })
                  }
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <Shield className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Firewall Policies</p>
                    <p className="text-sm text-muted-foreground">
                      Import firewall policy rules
                    </p>
                  </div>
                </div>
                <Switch
                  checked={config.enabledModules.policies}
                  onCheckedChange={(checked) => 
                    setConfig({ ...config, enabledModules: { ...config.enabledModules, policies: checked } })
                  }
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <Lock className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Address Objects</p>
                    <p className="text-sm text-muted-foreground">
                      Import firewall address objects
                    </p>
                  </div>
                </div>
                <Switch
                  checked={config.enabledModules.addresses}
                  onCheckedChange={(checked) => 
                    setConfig({ ...config, enabledModules: { ...config.enabledModules, addresses: checked } })
                  }
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <Globe className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">VIPs (Virtual IPs)</p>
                    <p className="text-sm text-muted-foreground">
                      Import NAT virtual IPs
                    </p>
                  </div>
                </div>
                <Switch
                  checked={config.enabledModules.vips}
                  onCheckedChange={(checked) => 
                    setConfig({ ...config, enabledModules: { ...config.enabledModules, vips: checked } })
                  }
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <Network className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">SD-WAN</p>
                    <p className="text-sm text-muted-foreground">
                      Import SD-WAN configuration
                    </p>
                  </div>
                </div>
                <Switch
                  checked={config.enabledModules.sdwan}
                  onCheckedChange={(checked) => 
                    setConfig({ ...config, enabledModules: { ...config.enabledModules, sdwan: checked } })
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
