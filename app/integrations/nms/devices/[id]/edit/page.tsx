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

interface NmsDevice {
  id: number;
  name: string;
  ip_address: string;
  vendor: string | null;
  device_type: string | null;
  snmp_version: string;
  snmp_port: number;
  snmp_community: string;
  ssh_username: string | null;
  ssh_password: string | null;
  polling_enabled: boolean;
  polling_interval: number;
  location: string | null;
  notes: string | null;
}

export default function EditNmsDevicePage() {
  const params = useParams();
  const router = useRouter();
  const deviceId = params.id as string;

  const [initialDevice, setInitialDevice] = useState<NmsDevice | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    name: '',
    ip_address: '',
    snmp_port: 161,
    snmp_version: 'v2c' as SnmpVersion,
    snmp_community: '',
    ssh_username: '',
    ssh_password: '',
    vendor: '',
    device_type: '',
    polling_enabled: true,
    polling_interval: 300,
    notes: '',
  });

  useEffect(() => {
    const loadDevice = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/integrations/nms/network-devices/${deviceId}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Failed to load device');
          return;
        }
        const d = data.data;
        setInitialDevice(d);
        setForm({
          name: d.name || '',
          ip_address: d.ip_address || '',
          snmp_port: d.snmp_port || 161,
          snmp_version: (d.snmp_version || 'v2c') as SnmpVersion,
          snmp_community: d.snmp_community || '',
          ssh_username: d.ssh_username || '',
          ssh_password: d.ssh_password || '',
          vendor: d.vendor || '',
          device_type: d.device_type || '',
          polling_enabled: d.polling_enabled ?? true,
          polling_interval: d.polling_interval || 300,
          notes: d.notes || '',
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
    if (!form.name.trim()) { setError('Device Name is required'); return; }
    if (!form.ip_address.trim()) { setError('IP Address is required'); return; }
    setError(null);
    setSaving(true);

    try {
      const payload = {
        name: form.name,
        ip_address: form.ip_address,
        snmp_port: form.snmp_port,
        vendor: form.vendor || null,
        device_type: form.device_type || null,
        polling_enabled: form.polling_enabled,
        polling_interval: form.polling_interval,
        notes: form.notes || null,
        snmp_version: form.snmp_version,
        snmp_community: form.snmp_community,
        ssh_username: form.ssh_username || null,
        ssh_password: form.ssh_password || null,
      };

      const res = await fetch(`/api/integrations/nms/network-devices/${deviceId}`, {
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
            {initialDevice?.name || 'Device'} &bull; {initialDevice?.ip_address}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-6 space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-500" />
              Basic Information
            </h2>
            <div className="space-y-2">
              <Label htmlFor="name">Device Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Core Router 1"
                value={form.name}
                onChange={e => set('name', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="ip">IP Address *</Label>
                <Input
                  id="ip"
                  placeholder="192.168.1.1"
                  value={form.ip_address}
                  onChange={e => set('ip_address', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="port">SNMP Port</Label>
                <Input
                  id="port"
                  type="number"
                  value={form.snmp_port}
                  onChange={e => set('snmp_port', Number(e.target.value))}
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
                  value={form.snmp_version}
                  onChange={e => set('snmp_version', e.target.value as SnmpVersion)}
                >
                  <option value="v2c">SNMPv2c</option>
                  <option value="v3">SNMPv3</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="community">Community String</Label>
                <Input
                  id="community"
                  type="password"
                  placeholder="••••••••"
                  value={form.snmp_community}
                  onChange={e => set('snmp_community', e.target.value)}
                />
              </div>
            </div>
          </div>

          <hr className="border-border" />

          {/* SSH Credentials */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-slate-500" />
              SSH Credentials
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="ssh_username">SSH Username</Label>
                <Input
                  id="ssh_username"
                  placeholder="admin"
                  value={form.ssh_username}
                  onChange={e => set('ssh_username', e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ssh_password">SSH Password</Label>
                <Input
                  id="ssh_password"
                  type="password"
                  placeholder="••••••••"
                  value={form.ssh_password}
                  onChange={e => set('ssh_password', e.target.value)}
                  autoComplete="off"
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
                  value={form.polling_interval}
                  onChange={e => set('polling_interval', Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Polling Enabled</Label>
                <select
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                  value={String(form.polling_enabled)}
                  onChange={e => set('polling_enabled', e.target.value === 'true')}
                >
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </select>
              </div>
            </div>
          </div>

          <hr className="border-border" />

          {/* Device Details */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-500" />
              Device Details
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Vendor</Label>
                <select
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                  value={form.vendor}
                  onChange={e => set('vendor', e.target.value)}
                >
                  <option value="">Select Vendor</option>
                  {VENDORS.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Device Type</Label>
                <select
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                  value={form.device_type}
                  onChange={e => set('device_type', e.target.value)}
                >
                  <option value="">Select Type</option>
                  {DEVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <textarea
                className="w-full min-h-[60px] px-3 py-2 rounded-md border border-input bg-background text-sm resize-none"
                placeholder="Optional notes..."
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
              />
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
