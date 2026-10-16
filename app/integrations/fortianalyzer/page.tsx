'use client';

import { uiError } from '@/lib/i18n/tr';

import { PageHeading } from '@/components/ui/page-heading';
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
  const [adom, setAdom] = useState('root');
  const [authMode, setAuthMode] = useState<'session' | 'api-key'>('session');
  const [apiKey, setApiKey] = useState('');
  const [secretSet, setSecretSet] = useState(false);

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
          setAdom(data.config.adom ?? 'root');
          setAuthMode(data.config.authMode ?? 'session');
          setSecretSet(data.config.authMode === 'api-key' ? data.config.apiKeySet : data.config.passwordSet);
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
    if (!host || !adom || (authMode === 'session' && !username)) {
      setTestResult({ connected: false, error: 'Sunucu, ADOM ve seçilen yöntemin gerekli alanlarını doldurun.' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/integrations/fortianalyzer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test', config: { host, adom, authMode, ...(authMode === 'session' ? { username, password } : { apiKey }) } }),
      });
      const data = await res.json();
      setTestResult({ connected: data.connected, error: uiError(data.error) });
    } catch (e) {
      setTestResult({ connected: false, error: uiError((e as Error).message) });
    } finally {
      setTesting(false);
    }
  };

  const saveConfig = async () => {
    if (!host || !adom || (authMode === 'session' && !username)) {
      setSaveResult({ success: false, error: 'Sunucu, ADOM ve seçilen yöntemin gerekli alanlarını doldurun.' });
      return;
    }
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await fetch('/api/integrations/fortianalyzer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-config', config: { host, adom, authMode, ...(authMode === 'session' ? { username, password } : { apiKey }) } }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveResult({ success: true });
        setPassword(''); // clear password field after save
        setApiKey('');
        setSecretSet(true);
      } else {
        setSaveResult({ success: false, error: uiError(data.error) });
      }
    } catch (e) {
      setSaveResult({ success: false, error: uiError((e as Error).message) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between max-md:flex-col max-md:items-stretch max-md:gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-lg bg-orange-500/20">
            <Activity className="h-6 w-6 text-orange-500" />
          </div>
          <div>
            <PageHeading section="fortianalyzer" description={<>
              FortiAnalyzer kimlik bilgilerini ve bağlantı ayarlarını yönetin
            </>}>FortiAnalyzer Entegrasyonu</PageHeading>
          </div>
        </div>
        {testResult && (
          testResult.connected ? (
            <Badge variant="success" className="gap-1">
              <CheckCircle className="h-3 w-3" />
              Bağlı
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <XCircle className="h-3 w-3" />
              Bağlı değil
            </Badge>
          )
        )}
      </div>

      {/* Credentials Card */}
      <Card>
        <CardHeader>
          <CardTitle>Bağlantı Kimlik Bilgileri</CardTitle>
          <CardDescription>
            Sunucuyu, ADOM’u ve kimlik doğrulama yöntemini seçin. Aynı sunucu ve hesap için mevcut gizli değeri korumak üzere ilgili alanı boş bırakabilirsiniz.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {loadingConfig ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Mevcut yapılandırma yükleniyor…
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="fa-host" className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-muted-foreground" />
                  FortiAnalyzer Sunucusu
                </Label>
                <Input
                  id="fa-host"
                  disabled={testing || saving}
                  placeholder="Ör. 10.0.0.5"
                  value={host}
                  onChange={(e) => { setHost(e.target.value); setTestResult(null); }}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fa-adom">ADOM</Label>
                  <Input id="fa-adom" disabled={testing || saving} value={adom} onChange={e => { setAdom(e.target.value); setTestResult(null); }} placeholder="root" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fa-auth-mode">Kimlik doğrulama</Label>
                  <select id="fa-auth-mode" disabled={testing || saving} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={authMode}
                    onChange={e => { setAuthMode(e.target.value as 'session' | 'api-key'); setPassword(''); setApiKey(''); setSecretSet(false); setTestResult(null); }}>
                    <option value="session">Kullanıcı adı ve parola</option>
                    <option value="api-key">API anahtarı (Bearer)</option>
                  </select>
                </div>
              </div>

              {authMode === 'session' ? <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fa-username" className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    Kullanıcı Adı
                  </Label>
                  <Input
                    id="fa-username"
                    disabled={testing || saving}
                    placeholder="infrascope"
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setTestResult(null); }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fa-password" className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    Parola
                    <span className="text-xs text-muted-foreground font-normal">(mevcut değeri korumak için boş bırakın)</span>
                  </Label>
                  <Input
                    id="fa-password"
                    disabled={testing || saving}
                    type="password"
                    placeholder="Yeni parolayı girin"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setTestResult(null); }}
                  />
                </div>
              </div> : <div className="space-y-2">
                <Label htmlFor="fa-api-key">API anahtarı</Label>
                <Input id="fa-api-key" disabled={testing || saving} type="password" autoComplete="new-password" value={apiKey}
                  onChange={e => { setApiKey(e.target.value); setTestResult(null); }} placeholder={secretSet ? 'Kayıtlı anahtarı korumak için boş bırakın' : 'API anahtarını girin'} />
                <p className="text-xs text-muted-foreground">FortiAnalyzer REST API anahtarı kullanılır. FortiCloud OAuth erişim token’ı bu alanla aynı yöntem değildir.</p>
              </div>}

              <div className="flex flex-wrap gap-3 pt-2">
                <Button variant="outline" onClick={testConnection} disabled={testing || saving}>
                  {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Bağlantıyı Test Et
                </Button>
                <Button onClick={saveConfig} disabled={saving || testing}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Kaydet ve Uygula
                </Button>
              </div>

              {/* Test result */}
              {testResult && !testResult.connected && testResult.error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {uiError(testResult.error)}
                </div>
              )}
              {testResult?.connected && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-600 text-sm">
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  Seçilen ADOM’da kimlik doğrulama ve sınırlı cihaz okuması başarılı.
                </div>
              )}

              {/* Save result */}
              {saveResult && (
                saveResult.success ? (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-600 text-sm">
                    <CheckCircle className="h-4 w-4 shrink-0" />
                    Yapılandırma kaydedildi. Alarm motoru bir sonraki kontrolde yeni kimlik bilgilerini kullanacak.
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {saveResult.error || 'Yapılandırma kaydedilemedi.'}
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
          <CardTitle className="text-sm font-medium">Kimlik Bilgilerinin Kullanımı</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            FortiAnalyzer kimlik bilgileri veritabanında saklanır. Alarm motoru bu bilgileri şu işlemler için kullanır:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Olay günlüklerini alma (trafik, kimlik doğrulama ve sistem olayları)</li>
            <li>Güvenlik olaylarını tespit etme (mesai dışı giriş, IPS, IoC, MITRE ATT&CK)</li>
            <li>FortiView verilerini sorgulama (web analizi ve öne çıkan kullanıcılar)</li>
            <li>Yapılandırma değişikliği günlüklerini alma</li>
          </ul>
          <p className="mt-3">
            Kaydettikten sonra giriş bekleme süresi sıfırlanır. Sistem, en geç 10 dakika içindeki bir sonraki alarm kontrolünde yeni kimlik bilgileriyle tekrar dener.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
