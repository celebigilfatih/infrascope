'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  RefreshCw, Bell, Mail, Shield, AlertTriangle, Settings, Send, Database,
  CheckCircle, XCircle, Search, Plus, X, Users,
} from 'lucide-react';

interface AlarmDef {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
  severity: string;
  enabled: boolean;
  cooldownMinutes: number;
  notifyEmail: boolean;
  detectionLogic: Record<string, unknown>;
  _count?: { alarmEvents: number };
}

interface NotifConfig {
  channel: string;
  enabled: boolean;
  config: {
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPass: string;
    smtpSecure: boolean;
    recipients: string[];
  };
  isConfigured?: boolean;
}

const SEVERITY_MAP: Record<string, { label: string; color: string }> = {
  ALARM_CRITICAL: { label: 'Kritik', color: 'bg-red-600' },
  ALARM_HIGH: { label: 'Yuksek', color: 'bg-orange-500' },
  ALARM_MEDIUM: { label: 'Orta', color: 'bg-yellow-500' },
  ALARM_LOW: { label: 'Dusuk', color: 'bg-blue-500' },
  ALARM_INFO: { label: 'Bilgi', color: 'bg-gray-400' },
};

const CATEGORY_MAP: Record<string, string> = {
  CONFIG_ACCESS: 'Config & Access',
  SECURITY: 'Security',
  RISK_ANOMALY: 'Risk & Anomaly',
  OPERATIONAL: 'Operational',
  SOC_CORRELATION: 'SOC Correlation',
};

export default function AlertSettingsPage() {
  const [definitions, setDefinitions] = useState<AlarmDef[]>([]);
  const [notifConfig, setNotifConfig] = useState<NotifConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Email form state
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [recipientList, setRecipientList] = useState<string[]>([]);
  const [newRecipient, setNewRecipient] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [defsRes, notifRes] = await Promise.all([
        fetch('/api/alarms/definitions'),
        fetch('/api/alarms/notification'),
      ]);
      const defsData = await defsRes.json();
      const notifData = await notifRes.json();

      if (defsData.success) setDefinitions(defsData.data);
      if (notifData.success) {
        setNotifConfig(notifData.data);
        const cfg = notifData.data.config;
        setSmtpHost(cfg.smtpHost || '');
        setSmtpPort(String(cfg.smtpPort || 587));
        setSmtpUser(cfg.smtpUser || '');
        setSmtpPass(cfg.smtpPass || '');
        setSmtpSecure(Boolean(cfg.smtpSecure));
        setEmailEnabled(Boolean(notifData.data.enabled));
        setEmailConfigured(Boolean(notifData.data.isConfigured));
        setRecipientList(cfg.recipients || []);
      }
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const seedAlarms = async () => {
    setSeeding(true);
    try {
      const res = await fetch('/api/alarms/definitions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'seed' }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ text: `${data.created} alarm olusturuldu, ${data.updated} guncellendi. Toplam: ${data.total}`, type: 'success' });
        fetchData();
      } else {
        setMessage({ text: data.error || 'Seed hatasi', type: 'error' });
      }
    } catch (err) {
      setMessage({ text: 'Seed hatasi', type: 'error' });
    } finally {
      setSeeding(false);
    }
  };

  const toggleAlarm = async (id: string, enabled: boolean) => {
    try {
      await fetch('/api/alarms/definitions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, enabled }),
      });
      setDefinitions((prev: AlarmDef[]) => prev.map((d: AlarmDef) => d.id === id ? { ...d, enabled } : d));
    } catch (err) {
      console.error('Toggle error:', err);
    }
  };

  const toggleNotifyEmail = async (id: string, notifyEmail: boolean) => {
    try {
      await fetch('/api/alarms/definitions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, notifyEmail }),
      });
      setDefinitions((prev: AlarmDef[]) => prev.map((d: AlarmDef) => d.id === id ? { ...d, notifyEmail } : d));
    } catch (err) {
      console.error('Toggle email error:', err);
    }
  };

  const saveEmailConfig = async () => {
    setSavingConfig(true);
    try {
      const res = await fetch('/api/alarms/notification', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: emailEnabled,
          smtpHost,
          smtpPort: parseInt(smtpPort, 10),
          smtpUser,
          smtpPass,
          smtpSecure,
          recipients: recipientList,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ text: 'Email yapilandirmasi kaydedildi', type: 'success' });
        fetchData();
      } else {
        setMessage({ text: data.error || 'Kaydetme hatasi', type: 'error' });
      }
    } catch (err) {
      setMessage({ text: 'Kaydetme hatasi', type: 'error' });
    } finally {
      setSavingConfig(false);
    }
  };

  const sendTestEmail = async () => {
    if (!emailEnabled) {
      setMessage({ text: 'Email bildirimleri pasif. Test emaili icin once bildirimleri aktif edin.', type: 'error' });
      return;
    }
    setTestingEmail(true);
    try {
      const res = await fetch('/api/alarms/notification', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setMessage({ text: 'Test emaili basariyla gonderildi!', type: 'success' });
      } else {
        setMessage({ text: `Test email hatasi: ${data.error}`, type: 'error' });
      }
    } catch (err) {
      setMessage({ text: 'Test email hatasi', type: 'error' });
    } finally {
      setTestingEmail(false);
    }
  };

  const filteredDefs = definitions.filter((d: AlarmDef) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      d.code.toLowerCase().includes(term) ||
      d.name.toLowerCase().includes(term) ||
      (d.description || '').toLowerCase().includes(term) ||
      (CATEGORY_MAP[d.category] || '').toLowerCase().includes(term)
    );
  });

  // Group by category
  const groupedDefs = filteredDefs.reduce((acc: Record<string, AlarmDef[]>, d: AlarmDef) => {
    const cat = d.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(d);
    return acc;
  }, {} as Record<string, AlarmDef[]>);

  const categoryOrder = ['CONFIG_ACCESS', 'SECURITY', 'RISK_ANOMALY', 'OPERATIONAL', 'SOC_CORRELATION'];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Alarm Yapilandirmasi</h1>
          <p className="text-muted-foreground">Alarm tanimlari, bildirim kanallari ve yapilandirma</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-lg flex items-center gap-2 text-sm ${message.type === 'success' ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'}`}>
          {message.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {message.text}
          <Button variant="ghost" size="sm" className="ml-auto h-6" onClick={() => setMessage(null)}>Kapat</Button>
        </div>
      )}

      <Tabs defaultValue="definitions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="definitions">
            <Shield className="h-4 w-4 mr-2" />
            Alarm Tanimlari ({definitions.length})
          </TabsTrigger>
          <TabsTrigger value="email">
            <Mail className="h-4 w-4 mr-2" />
            Email Yapilandirmasi
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Alarm Definitions */}
        <TabsContent value="definitions" className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Alarm ara..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
            </div>
            <Button onClick={seedAlarms} disabled={seeding}>
              <Database className="h-4 w-4 mr-2" />
              {seeding ? 'Yukleniyor...' : definitions.length === 0 ? 'Alarmlari Yukle (25)' : 'Alarmlari Guncelle'}
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : definitions.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Bell className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-medium mb-2">Alarm Tanimi Bulunamadi</h3>
                <p className="text-muted-foreground mb-4">25 alarm tanimini yuklemek icin butona tiklayin.</p>
                <Button onClick={seedAlarms} disabled={seeding}>
                  <Database className="h-4 w-4 mr-2" />
                  Alarmlari Yukle
                </Button>
              </CardContent>
            </Card>
          ) : (
            categoryOrder.filter((cat) => groupedDefs[cat]).map((cat) => (
              <Card key={cat}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    {CATEGORY_MAP[cat] || cat}
                    <Badge variant="secondary" className="text-xs">{groupedDefs[cat].length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="whitespace-nowrap">Aktif</TableHead>
                          <TableHead className="whitespace-nowrap">Seviye</TableHead>
                          <TableHead className="whitespace-nowrap">Kod</TableHead>
                          <TableHead className="whitespace-nowrap">Alarm Adi</TableHead>
                          <TableHead className="whitespace-nowrap">Cooldown</TableHead>
                          <TableHead className="whitespace-nowrap">Email</TableHead>
                          <TableHead className="whitespace-nowrap text-right">Olaylar</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {groupedDefs[cat].map((d: AlarmDef) => {
                          const sev = SEVERITY_MAP[d.severity] || { label: d.severity, color: 'bg-gray-400' };
                          return (
                            <TableRow key={d.id} className={!d.enabled ? 'opacity-50' : ''}>
                              <TableCell>
                                <Switch checked={d.enabled} onCheckedChange={(v) => toggleAlarm(d.id, v)} />
                              </TableCell>
                              <TableCell>
                                <Badge className={`${sev.color} text-white text-xs`}>{sev.label}</Badge>
                              </TableCell>
                              <TableCell className="font-mono text-xs">{d.code}</TableCell>
                              <TableCell>
                                <div>
                                  <p className="font-medium text-sm">{d.name}</p>
                                  {d.description && <p className="text-xs text-muted-foreground line-clamp-1">{d.description}</p>}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">{d.cooldownMinutes}dk</TableCell>
                              <TableCell>
                                <Switch checked={d.notifyEmail} onCheckedChange={(v) => toggleNotifyEmail(d.id, v)} />
                              </TableCell>
                              <TableCell className="text-right font-medium">{d._count?.alarmEvents || 0}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Tab 2: Email Configuration */}
        <TabsContent value="email" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  SMTP Yapilandirmasi
                </CardTitle>
                <Badge variant={emailEnabled && emailConfigured ? 'success' : emailEnabled ? 'warning' : 'secondary'}>
                  {emailEnabled ? (emailConfigured ? 'Aktif' : 'Eksik ayar') : 'Pasif'}
                </Badge>
              </div>
              <CardDescription>Email bildirim sunucu ayarlari</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
                <div>
                  <Label className="font-semibold">Email bildirimleri</Label>
                  <p className="text-xs text-muted-foreground">
                    Aktif oldugunda notifyEmail acik alarm tanimlari SMTP ile email gonderir.
                  </p>
                </div>
                <Switch checked={emailEnabled} onCheckedChange={setEmailEnabled} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>SMTP Sunucu</Label>
                  <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="mail.example.com" />
                </div>
                <div className="space-y-2">
                  <Label>Port</Label>
                  <Input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="587" />
                </div>
                <div className="space-y-2">
                  <Label>Kullanici Adi</Label>
                  <Input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="alert@example.com" />
                </div>
                <div className="space-y-2">
                  <Label>Sifre</Label>
                  <Input type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} placeholder="********" />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <div>
                  <Label className="font-semibold">TLS / SSL</Label>
                  <p className="text-xs text-muted-foreground">
                    465 gibi implicit TLS portlari icin acin; 587 STARTTLS icin genelde kapali kalir.
                  </p>
                </div>
                <Switch checked={smtpSecure} onCheckedChange={setSmtpSecure} />
              </div>
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Alicilar ({recipientList.length})
                </Label>
                {recipientList.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {recipientList.map((email, idx) => (
                      <div key={idx} className="flex items-center gap-1 bg-primary/10 text-primary rounded-full px-3 py-1 text-sm">
                        <Mail className="h-3 w-3" />
                        {email}
                        <button
                          onClick={() => setRecipientList((prev) => prev.filter((_, i) => i !== idx))}
                          className="ml-1 hover:bg-primary/20 rounded-full p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    value={newRecipient}
                    onChange={(e) => setNewRecipient(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const email = newRecipient.trim();
                        if (email && email.includes('@') && !recipientList.includes(email)) {
                          setRecipientList((prev) => [...prev, email]);
                          setNewRecipient('');
                        }
                      }
                    }}
                    placeholder="ornek@domain.com yazin, Enter ile ekleyin"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      const email = newRecipient.trim();
                      if (email && email.includes('@') && !recipientList.includes(email)) {
                        setRecipientList((prev) => [...prev, email]);
                        setNewRecipient('');
                      }
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {recipientList.length === 0 && (
                  <p className="text-xs text-muted-foreground">Henuz alici eklenmedi. Email adresi yazip Enter&#39;a basin.</p>
                )}
              </div>
              <div className="flex items-center gap-3 pt-2">
                <Button onClick={saveEmailConfig} disabled={savingConfig}>
                  {savingConfig ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                  Kaydet
                </Button>
                <Button variant="outline" onClick={sendTestEmail} disabled={testingEmail || !emailEnabled || !emailConfigured}>
                  {testingEmail ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Test Email Gonder
                </Button>
              </div>
              {(!emailEnabled || !emailConfigured) && (
                <p className="text-xs text-muted-foreground">
                  Test email icin ayarlari kaydedin ve email bildirimlerini aktif hale getirin.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
