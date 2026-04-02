'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Activity,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Save,
  Loader2,
  User,
  Lock,
  Server,
} from 'lucide-react';

export default function FortiAnalyzerIntegrationPage() {
  const [host, setHost] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [loadingConfig, setLoadingConfig] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [testResult, setTestResult] = useState<{ connected: boolean; error?: string } | null>(null);
  const [saveResult, setSaveResult] = useState<{ success: boolean; error?: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/integrations/fortianalyzer?type=config');
        const data = await res.json();
        if (data.config) {
          setHost(data.config.host || '');
          setUsername(data.config.username || '');
        }
      } catch (e) {
        console.error('Failed to load FortiAnalyzer config:', e);
      } finally {
        setLoadingConfig(false);
      }
    };
    load();
  }, []);

  const testConnection = async () => {
    if (!host || !username) {
      setTestResult({ connected: false, error: 'Host and username are required for connection test.' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/integrations/fortianalyzer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test', config: { host, username, password } }),
      });
      const data = await res.json();
      setTestResult({ connected: data.connected, error: data.error });
    } catch (e) {
      setTestResult({ connected: false, error: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const saveConfig = async () => {
    if (!host || !username) {
      setSaveResult({ success: false, error: 'Host and username are required.' });
      return;
    }
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await fetch('/api/integrations/fortianalyzer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-config', config: { host, username, password } }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveResult({ success: true });
        setPassword(''); // clear password field after save
      } else {
        setSaveResult({ success: false, error: data.error });
      }
    } catch (e) {
      setSaveResult({ success: false, error: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-lg bg-orange-500/20">
            <Activity className="h-6 w-6 text-orange-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">FortiAnalyzer Integration</h1>
            <p className="text-muted-foreground">
              Manage FortiAnalyzer credentials and connection settings
            </p>
          </div>
        </div>
        {testResult && (
          testResult.connected ? (
            <Badge variant="success" className="gap-1">
              <CheckCircle className="h-3 w-3" />
              Connected
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <XCircle className="h-3 w-3" />
              Not Connected
            </Badge>
          )
        )}
      </div>

      {/* Credentials Card */}
      <Card>
        <CardHeader>
          <CardTitle>Connection Credentials</CardTitle>
          <CardDescription>
            Update the host, username, and password used to connect to FortiAnalyzer.
            Leave password blank to keep the existing password.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {loadingConfig ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading current configuration...
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="fa-host" className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-muted-foreground" />
                  FortiAnalyzer Host
                </Label>
                <Input
                  id="fa-host"
                  placeholder="e.g. 10.0.0.5"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fa-username" className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    Username
                  </Label>
                  <Input
                    id="fa-username"
                    placeholder="infrascope"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fa-password" className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    Password
                    <span className="text-xs text-muted-foreground font-normal">(leave blank to keep existing)</span>
                  </Label>
                  <Input
                    id="fa-password"
                    type="password"
                    placeholder="Enter new password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <Button variant="outline" onClick={testConnection} disabled={testing || saving}>
                  {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Test Connection
                </Button>
                <Button onClick={saveConfig} disabled={saving || testing}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Save & Apply
                </Button>
              </div>

              {/* Test result */}
              {testResult && !testResult.connected && testResult.error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {testResult.error}
                </div>
              )}
              {testResult?.connected && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-600 text-sm">
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  Login successful — credentials are valid.
                </div>
              )}

              {/* Save result */}
              {saveResult && (
                saveResult.success ? (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-600 text-sm">
                    <CheckCircle className="h-4 w-4 shrink-0" />
                    Configuration saved. The alarm engine will use the new credentials on the next check.
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {saveResult.error || 'Failed to save configuration.'}
                  </div>
                )
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">How credentials are used</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            FortiAnalyzer credentials are stored in the database and used by the alarm engine to:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Fetch event logs (traffic, auth, system events)</li>
            <li>Detect security alarms (off-hours login, IPS, IoC, MITRE ATT&CK)</li>
            <li>Query FortiView dashboards (web analytics, top users)</li>
            <li>Pull configuration revision logs</li>
          </ul>
          <p className="mt-3">
            After saving, the system automatically resets any login backoff and retries with the new credentials
            at the next alarm check cycle (within 10 minutes).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
