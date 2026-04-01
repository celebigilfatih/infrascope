'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

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

export default function AddNmsDevicePage() {
  const router = useRouter();

  const [form, setForm] = useState({
    name: '',
    ip_address: '',
    snmp_port: 161,
    connection_type: 'snmp' as ConnectionType,
    snmp_version: 'v2c' as SnmpVersion,
    snmp_community: '',
    snmp_username: '',
    snmp_auth_protocol: '',
    snmp_auth_password: '',
    ssh_username: '',
    ssh_password: '',
    vendor: '',
    device_type: '',
    notes: '',
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const set = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError('Device Name is required'); return; }
    if (!form.ip_address.trim()) { setError('IP Address is required'); return; }
    setError(null);
    setSaving(true);

    try {
      const payload: any = {
        name: form.name,
        ip_address: form.ip_address,
        snmp_port: form.snmp_port,
        vendor: form.vendor || null,
        device_type: form.device_type || null,
        notes: form.notes || null,
        polling_enabled: true,
      };

      if (form.connection_type === 'snmp' || form.connection_type === 'api') {
        payload.snmp_version = form.snmp_version;
        payload.snmp_community = form.snmp_community || 'public';
        if (form.snmp_version === 'v3') {
          payload.snmp_username = form.snmp_username;
          payload.snmp_auth_protocol = form.snmp_auth_protocol;
          payload.snmp_auth_password = form.snmp_auth_password;
        }
      }

      if (form.connection_type === 'ssh') {
        payload.ssh_username = form.ssh_username;
        payload.ssh_password = form.ssh_password;
      }

      const res = await fetch('/api/integrations/nms/network-devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to add device');
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push('/integrations/nms/devices'), 1200);
    } catch (err: any) {
      setError(err.message || 'Unexpected error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Add Device</h1>
        <p className="text-muted-foreground text-sm">Configure a new network device for monitoring</p>
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
                <Label htmlFor="port">Port</Label>
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

          {/* Connection Type */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-400" />
              Connection Type
            </h2>
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Select Connection Protocol</Label>
              <div className="grid grid-cols-3 gap-3">
                {(['ssh', 'api', 'snmp'] as ConnectionType[]).map(type => (
                  <button
                    key={type}
                    onClick={() => set('connection_type', type)}
                    className={`flex items-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium transition-colors
                      ${form.connection_type === type
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card hover:bg-muted/50'
                      }`}
                  >
                    <span className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${
                      form.connection_type === type ? 'border-primary bg-primary' : 'border-muted-foreground'
                    }`} />
                    {type.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* SNMP fields */}
            {(form.connection_type === 'snmp' || form.connection_type === 'api') && (
              <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-border">
                <h3 className="text-xs font-semibold flex items-center gap-2 text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  SNMP Configuration
                </h3>
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
                {form.snmp_version === 'v2c' && (
                  <div className="space-y-2">
                    <Label htmlFor="community">Community String</Label>
                    <Input
                      id="community"
                      type="password"
                      placeholder="public"
                      value={form.snmp_community}
                      onChange={e => set('snmp_community', e.target.value)}
                    />
                  </div>
                )}
                {form.snmp_version === 'v3' && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>SNMPv3 Username</Label>
                      <Input value={form.snmp_username} onChange={e => set('snmp_username', e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Auth Protocol</Label>
                        <select
                          className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                          value={form.snmp_auth_protocol}
                          onChange={e => set('snmp_auth_protocol', e.target.value)}
                        >
                          <option value="">None</option>
                          <option value="MD5">MD5</option>
                          <option value="SHA">SHA</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label>Auth Password</Label>
                        <Input
                          type="password"
                          value={form.snmp_auth_password}
                          onChange={e => set('snmp_auth_password', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SSH fields */}
            {form.connection_type === 'ssh' && (
              <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-border">
                <h3 className="text-xs font-semibold text-muted-foreground">SSH Credentials</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>SSH Username</Label>
                    <Input value={form.ssh_username} onChange={e => set('ssh_username', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>SSH Password</Label>
                    <Input type="password" value={form.ssh_password} onChange={e => set('ssh_password', e.target.value)} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <hr className="border-border" />

          {/* Device Details */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
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
              Device added successfully! Redirecting...
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => router.push('/integrations/nms')}
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
              {saving ? 'Adding...' : 'Add Device'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
