'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle, Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

type ConnectionType = 'ssh' | 'api' | 'snmp';
type SnmpVersion = 'v2c' | 'v3';

const VENDORS = [
  'Cisco', 'Fortinet', 'MikroTik', 'Arista', 'Juniper', 'HP',
  'Dell', 'Huawei', 'Ubiquiti', 'Netgear', 'TP-Link', 'Generic',
];

const DEVICE_TYPES = [
  'Router', 'Switch', 'Firewall', 'Access Point', 'Server',
  'Load Balancer', 'Storage', 'UPS', 'Other',
];

interface DbDevice {
  id: string;
  name: string;
  type: string | null;
  vendor: string | null;
  managementIp: string | null;
  snmpVersion: string | null;
  snmpPort: number | null;
  pollingEnabled: boolean;
  pollingInterval: number | null;
}

export default function EditNmsDevicePage() {
  const params = useParams();
  const router = useRouter();
  const deviceId = params.id as string;

  const [initialDevice, setInitialDevice] = useState<DbDevice | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    managementIp: '',
    snmpPort: 161,
    snmpVersion: 'v2c' as SnmpVersion,
    snmpCommunity: '',
    pollingEnabled: true,
    pollingInterval: 30,
  });

  useEffect(() => {
    const loadDevice = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/integrations/nms/devices/${deviceId}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Failed to load device');
          return;
        }
        const d = data.device;
        setInitialDevice(d);
        setForm({
          managementIp: d.managementIp || '',
          snmpPort: d.snmpPort ?? 161,
          snmpVersion: (d.snmpVersion || 'v2c') as SnmpVersion,
          snmpCommunity: '',
          pollingEnabled: d.pollingEnabled ?? true,
          pollingInterval: d.pollingInterval ?? 30,
        });
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    if (deviceId) loadDevice();
  }, [deviceId]);

  const set = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!form.managementIp.trim()) { setError('Management IP is required'); return; }
    setError(null);
    setSaving(true);

    try {
      const payload: Record<string, unknown> = {
        managementIp: form.managementIp,
        snmpPort: form.snmpPort,
        snmpVersion: form.snmpVersion,
        pollingEnabled: form.pollingEnabled,
        pollingInterval: form.pollingInterval,
      };
      if (form.snmpCommunity) payload.snmpCommunity = form.snmpCommunity;

      const res = await fetch(`/api/integrations/nms/devices/${deviceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to update device');
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push(`/integrations/nms/devices/${deviceId}`), 1200);
    } catch (err: any) {
      setError(err.message || 'Unexpected error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !initialDevice) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
        <Button variant="outline" asChild>
          <Link href="/integrations/nms/devices">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Devices
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/integrations/nms/devices">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Edit Device</h1>
          <p className="text-muted-foreground text-sm">
            {initialDevice?.name || 'Device'} &bull; {initialDevice?.managementIp}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-6 space-y-6">
          {/* Device Info (read-only) */}
          {initialDevice && (
            <div className="p-3 rounded-lg bg-muted/40 border border-border space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Device</p>
              <p className="text-sm font-bold">{initialDevice.name}</p>
              <p className="text-xs text-muted-foreground">{initialDevice.type || 'Unknown'} &bull; {initialDevice.vendor || 'Unknown vendor'}</p>
            </div>
          )}

          {/* Connection Settings */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-500" />
              Connection
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="ip">Management IP *</Label>
                <Input
                  id="ip"
                  placeholder="192.168.1.1"
                  value={form.managementIp}
                  onChange={e => set('managementIp', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="port">SNMP Port</Label>
                <Input
                  id="port"
                  type="number"
                  value={form.snmpPort}
                  onChange={e => set('snmpPort', Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          <hr className="border-border" />

          {/* SNMP Configuration */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              SNMP Configuration
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="snmp_version">SNMP Version</Label>
                <select
                  id="snmp_version"
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                  value={form.snmpVersion}
                  onChange={e => set('snmpVersion', e.target.value as SnmpVersion)}
                >
                  <option value="v2c">SNMPv2c</option>
                  <option value="v3">SNMPv3</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="community">Community String <span className="text-muted-foreground font-normal">(leave blank to keep)</span></Label>
                <Input
                  id="community"
                  type="password"
                  placeholder="New community string..."
                  value={form.snmpCommunity}
                  onChange={e => set('snmpCommunity', e.target.value)}
                />
              </div>
            </div>
          </div>

          <hr className="border-border" />

          {/* Polling Settings */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Polling Settings
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="interval">Polling Interval (seconds)</Label>
                <Input
                  id="interval"
                  type="number"
                  value={form.pollingInterval}
                  onChange={e => set('pollingInterval', Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Polling Enabled</Label>
                <select
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                  value={String(form.pollingEnabled)}
                  onChange={e => set('pollingEnabled', e.target.value === 'true')}
                >
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </select>
              </div>
            </div>
          </div>

          {/* Error / Success */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400 text-sm">
              <CheckCircle className="h-4 w-4 shrink-0" />
              Device updated successfully! Redirecting...
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => router.push(`/integrations/nms/devices/${deviceId}`)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
              onClick={handleSubmit}
              disabled={saving || success}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
