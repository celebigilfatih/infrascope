'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle, Loader2, PlusCircle } from 'lucide-react';
import { notifyDeviceInventoryChanged } from '@/lib/device-inventory-events';

type ConnectionType = 'ssh' | 'api' | 'snmp';
type SnmpVersion = 'v2c' | 'v3';

interface InventoryDevice {
  id: string;
  name: string;
  type: string;
  vendor?: string | null;
  model?: string | null;
  managementIp?: string | null;
  nmsDeviceId?: number | null;
  pollingEnabled?: boolean;
}

export default function AddNmsDevicePage() {
  const router = useRouter();

  const [inventoryDevices, setInventoryDevices] = useState<InventoryDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [form, setForm] = useState({
    deviceId: '',
    managementIp: '',
    snmpPort: 161,
    connectionType: 'snmp' as ConnectionType,
    snmpVersion: 'v2c' as SnmpVersion,
    snmpCommunity: '',
    snmpUsername: '',
    snmpAuthProtocol: '',
    snmpAuthPassword: '',
    sshUsername: '',
    sshPassword: '',
    pollingInterval: 300,
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const availableDevices = useMemo(
    () => inventoryDevices.filter((device) => device.nmsDeviceId == null),
    [inventoryDevices]
  );

  const selectedDevice = useMemo(
    () => inventoryDevices.find((device) => device.id === form.deviceId) || null,
    [form.deviceId, inventoryDevices]
  );

  const set = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  useEffect(() => {
    let cancelled = false;

    async function loadInventoryDevices() {
      setLoadingDevices(true);
      setError(null);
      try {
        const res = await fetch('/api/devices?filterType=all&mode=minimal&limit=200');
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Envanter cihazları yüklenemedi');
        }
        if (!cancelled) setInventoryDevices(data.data || []);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Envanter cihazları yüklenemedi');
      } finally {
        if (!cancelled) setLoadingDevices(false);
      }
    }

    loadInventoryDevices();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async () => {
    if (!form.deviceId) { setError('Önce envanterden bir cihaz seçin'); return; }
    if (!form.managementIp.trim()) { setError('Management IP zorunludur'); return; }

    setError(null);
    setSaving(true);

    try {
      const payload: Record<string, unknown> = {
        deviceId: form.deviceId,
        managementIp: form.managementIp.trim(),
        snmpPort: form.snmpPort,
        pollingInterval: form.pollingInterval,
        pollingEnabled: true,
      };

      if (form.connectionType === 'snmp' || form.connectionType === 'api') {
        payload.snmpVersion = form.snmpVersion;
        payload.snmpCommunity = form.snmpCommunity || 'public';
      }

      if (form.connectionType === 'ssh') {
        payload.sshUsername = form.sshUsername || null;
        payload.sshPassword = form.sshPassword || null;
      }

      const res = await fetch('/api/integrations/nms/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Cihaz NMS izlemeye alınamadı');
        return;
      }

      setSuccess(true);
      notifyDeviceInventoryChanged({ action: 'update', deviceId: form.deviceId, source: 'nms-add-device' });
      setTimeout(() => router.push('/integrations/nms/devices'), 900);
    } catch (err: any) {
      setError(err.message || 'Beklenmeyen hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Cihazı NMS İzlemeye Al</h1>
        <p className="text-muted-foreground text-sm">
          Cihaz kaydı ana envanterde kalır; burada sadece SNMP/SSH izleme ayarları bağlanır.
        </p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-6">
          <div className="space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-500" />
              Envanter Cihazı
            </h2>

            {loadingDevices ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Envanter cihazları yükleniyor...
              </div>
            ) : availableDevices.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">İzlemeye alınabilecek envanter cihazı yok.</p>
                <p className="mt-1">Önce ana cihaz envanterinden cihaz oluşturun; sonra bu ekrandan NMS izlemeye alın.</p>
                <Button variant="outline" size="sm" className="mt-3 gap-2" asChild>
                  <Link href="/devices">
                    <PlusCircle className="h-4 w-4" />
                    Envantere Cihaz Ekle
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="device">Cihaz *</Label>
                <select
                  id="device"
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                  value={form.deviceId}
                  onChange={e => set('deviceId', e.target.value)}
                >
                  <option value="">Envanterden cihaz seçin</option>
                  {availableDevices.map(device => (
                    <option key={device.id} value={device.id}>
                      {device.name} · {device.type.replace(/_/g, ' ')}
                      {device.vendor ? ` · ${device.vendor}` : ''}
                      {device.model ? ` ${device.model}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedDevice && (
              <div className="rounded-lg bg-muted/40 border border-border p-3 text-sm">
                <div className="font-medium">{selectedDevice.name}</div>
                <div className="text-muted-foreground">
                  {selectedDevice.type.replace(/_/g, ' ')}
                  {selectedDevice.vendor ? ` · ${selectedDevice.vendor}` : ''}
                  {selectedDevice.model ? ` ${selectedDevice.model}` : ''}
                </div>
              </div>
            )}
          </div>

          <hr className="border-border" />

          <div className="space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              İzleme Bağlantısı
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

            <div className="space-y-2">
              <Label htmlFor="pollingInterval">Polling Interval (saniye)</Label>
              <Input
                id="pollingInterval"
                type="number"
                min={30}
                value={form.pollingInterval}
                onChange={e => set('pollingInterval', Number(e.target.value))}
              />
            </div>
          </div>

          <hr className="border-border" />

          <div className="space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-400" />
              Protokol
            </h2>
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Bağlantı protokolü</Label>
              <div className="grid grid-cols-3 gap-3">
                {(['snmp', 'ssh', 'api'] as ConnectionType[]).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => set('connectionType', type)}
                    className={`flex items-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium transition-colors
                      ${form.connectionType === type
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card hover:bg-muted/50'
                      }`}
                  >
                    <span className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${
                      form.connectionType === type ? 'border-primary bg-primary' : 'border-muted-foreground'
                    }`} />
                    {type.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {(form.connectionType === 'snmp' || form.connectionType === 'api') && (
              <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-border">
                <h3 className="text-xs font-semibold flex items-center gap-2 text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  SNMP Ayarları
                </h3>
                <div className="space-y-2">
                  <Label htmlFor="snmpVersion">SNMP Version</Label>
                  <select
                    id="snmpVersion"
                    className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                    value={form.snmpVersion}
                    onChange={e => set('snmpVersion', e.target.value as SnmpVersion)}
                  >
                    <option value="v2c">SNMPv2c</option>
                    <option value="v3">SNMPv3</option>
                  </select>
                </div>
                {form.snmpVersion === 'v2c' && (
                  <div className="space-y-2">
                    <Label htmlFor="community">Community String</Label>
                    <Input
                      id="community"
                      type="password"
                      placeholder="public"
                      value={form.snmpCommunity}
                      onChange={e => set('snmpCommunity', e.target.value)}
                    />
                  </div>
                )}
                {form.snmpVersion === 'v3' && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>SNMPv3 Username</Label>
                      <Input value={form.snmpUsername} onChange={e => set('snmpUsername', e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Auth Protocol</Label>
                        <select
                          className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                          value={form.snmpAuthProtocol}
                          onChange={e => set('snmpAuthProtocol', e.target.value)}
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
                          value={form.snmpAuthPassword}
                          onChange={e => set('snmpAuthPassword', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {form.connectionType === 'ssh' && (
              <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-border">
                <h3 className="text-xs font-semibold text-muted-foreground">SSH Credentials</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>SSH Username</Label>
                    <Input value={form.sshUsername} onChange={e => set('sshUsername', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>SSH Password</Label>
                    <Input type="password" value={form.sshPassword} onChange={e => set('sshPassword', e.target.value)} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400 text-sm">
              <CheckCircle className="h-4 w-4 shrink-0" />
              Cihaz NMS izlemeye alındı. Yönlendiriliyor...
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => router.push('/integrations/nms/devices')}
              disabled={saving}
            >
              İptal
            </Button>
            <Button
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
              onClick={handleSubmit}
              disabled={saving || success || loadingDevices || availableDevices.length === 0}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {saving ? 'Kaydediliyor...' : 'İzlemeye Al'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
