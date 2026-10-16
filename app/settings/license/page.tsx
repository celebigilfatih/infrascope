'use client';

import { uiError, uiLabel } from '@/lib/i18n/tr';

import { PageHeading, PageStateFrame } from '@/components/ui/page-heading';
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  RefreshCw,
  Key,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Server,
  Users,
  Calendar,
  Shield,
  Cpu,
  Info,
} from 'lucide-react';

interface LicenseInfo {
  valid: boolean;
  tier: 'TRIAL' | 'STANDARD' | 'ENTERPRISE';
  maxDevices: number;
  maxUsers: number;
  daysRemaining: number;
  graceMode: boolean;
  validUntil: string;
  lastValidated?: string;
  licenseKey?: string;
  machineId?: string;
  error?: string;
  warnings?: string[];
}

interface UsageStats {
  deviceCount: number;
  userCount: number;
}

const FEATURE_MATRIX = {
  TRIAL: {
    label: "Deneme",
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
    features: {
      'Dashboard': true,
      'Device Management': true,
      'Basic Monitoring': true,
      'VMware Integration': false,
      'Fortinet Integration': false,
      'Advanced Reports': false,
      'External API': false,
      'SLA Monitoring': false,
    },
  },
  STANDARD: {
    label: "Standart",
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    features: {
      'Dashboard': true,
      'Device Management': true,
      'Basic Monitoring': true,
      'VMware Integration': true,
      'Fortinet Integration': true,
      'Advanced Reports': false,
      'External API': false,
      'SLA Monitoring': true,
    },
  },
  ENTERPRISE: {
    label: "Kurumsal",
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    features: {
      'Dashboard': true,
      'Device Management': true,
      'Basic Monitoring': true,
      'VMware Integration': true,
      'Fortinet Integration': true,
      'Advanced Reports': true,
      'External API': true,
      'SLA Monitoring': true,
    },
  },
};

export default function LicensePage() {
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [usage, setUsage] = useState<UsageStats>({ deviceCount: 0, userCount: 0 });
  const [loading, setLoading] = useState(true);
  const [licenseKey, setLicenseKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchLicense = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/license/status');
      const data = await response.json();
      setLicense(data.license);
      setUsage(data.usage || { deviceCount: 0, userCount: 0 });
    } catch (err) {
      console.error('Failed to fetch license:', err);
      setError(uiError("Lisans bilgileri yüklenemedi."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLicense();
  }, [fetchLicense]);

  const handleActivate = async () => {
    if (!licenseKey.trim()) {
      setError(uiError("Lütfen lisans anahtarını girin."));
      return;
    }

    setActivating(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: licenseKey.trim() }),
      });
      const data = await response.json();

      if (data.success) {
        setSuccess('License activated successfully!');
        setLicenseKey('');
        await fetchLicense();
      } else {
        setError(uiError(data.error || 'Failed to activate license'));
      }
    } catch (err) {
      console.error('Activation error:', err);
      setError(uiError("Lisans etkinleştirilemedi. Lütfen yeniden deneyin."));
    } finally {
      setActivating(false);
    }
  };

  const handleValidate = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/license/validate', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        setSuccess('License validated successfully!');
        await fetchLicense();
      } else {
        setError(uiError(data.error || 'Validation failed'));
      }
    } catch {
      setError(uiError("Lisans doğrulanamadı."));
    } finally {
      setLoading(false);
    }
  };

  const getTierBadge = (tier: string) => {
    const tierInfo = FEATURE_MATRIX[tier as keyof typeof FEATURE_MATRIX];
    if (!tierInfo) return <Badge variant="outline">{tier}</Badge>;
    return <Badge className={tierInfo.color}>{tierInfo.label}</Badge>;
  };

  const getStatusBadge = () => {
    if (!license) return null;
    if (!license.valid) {
      return (
        <Badge variant="destructive">
          <XCircle className="h-3 w-3 mr-1" />
          Geçersiz
        </Badge>
      );
    }
    if (license.graceMode) {
      return (
        <Badge variant="warning">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Ek Süre
        </Badge>
      );
    }
    if (license.daysRemaining <= 30) {
      return (
        <Badge variant="warning">
          <Clock className="h-3 w-3 mr-1" />
          Yakında Sona Erecek
        </Badge>
      );
    }
    return (
      <Badge variant="success">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Aktif
      </Badge>
    );
  };

  if (loading && !license) {
    return <PageStateFrame section="license" title="Lisans Yönetimi">{(
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )}</PageStateFrame>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between max-md:flex-col max-md:items-stretch max-md:gap-4">
        <div>
          <PageHeading section="license" description={<>InfraScope lisansınızı ve aboneliğinizi yönetin</>}>

            Lisans Yönetimi
          </PageHeading>
        </div>
        <Button variant="outline" size="icon" onClick={fetchLicense} disabled={loading} aria-label="Yenile">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <XCircle className="h-5 w-5" />
            <span>{uiError(error)}</span>
          </div>
        </div>
      )}
      {success && (
        <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-5 w-5" />
            <span>{success}</span>
          </div>
        </div>
      )}

      {/* License Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Lisans Durumu
              </CardTitle>
              <CardDescription>Mevcut abonelik bilgileri</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {getStatusBadge()}
              {license && getTierBadge(license.tier)}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* License Details Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Geçerlilik Tarihi
              </p>
              <p className="font-medium">
                {license?.validUntil
                  ? new Date(license.validUntil).toLocaleDateString('tr-TR')
                  : '—'}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Kalan Gün
              </p>
              <p className="font-medium">
                {license?.daysRemaining !== undefined ? (
                  <span className={license.daysRemaining <= 30 ? 'text-orange-600' : ''}>
                    {license.daysRemaining} gün
                  </span>
                ) : (
                  '—'
                )}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Server className="h-3.5 w-3.5" />
                Cihaz Limiti
              </p>
              <p className="font-medium">{license?.maxDevices || 0}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Kullanıcı Limiti
              </p>
              <p className="font-medium">{license?.maxUsers || 0}</p>
            </div>
          </div>

          {/* Usage Progress */}
          {license && (
            <div className="space-y-4 pt-4 border-t">
              <h4 className="text-sm font-medium">Mevcut Kullanım</h4>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Cihazlar</span>
                    <span className="font-medium">
                      {usage.deviceCount} / {license.maxDevices}
                    </span>
                  </div>
                  <Progress
                    value={license.maxDevices > 0 ? (usage.deviceCount / license.maxDevices) * 100 : 0}
                    className={
                      usage.deviceCount / license.maxDevices > 0.9
                        ? '[&>div]:bg-orange-500'
                        : ''
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Kullanıcılar</span>
                    <span className="font-medium">
                      {usage.userCount} / {license.maxUsers}
                    </span>
                  </div>
                  <Progress
                    value={license.maxUsers > 0 ? (usage.userCount / license.maxUsers) * 100 : 0}
                    className={
                      usage.userCount / license.maxUsers > 0.9 ? '[&>div]:bg-orange-500' : ''
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {/* Warnings */}
          {license?.warnings && license.warnings.length > 0 && (
            <div className="pt-4 border-t">
              <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                Uyarılar
              </h4>
              <ul className="space-y-1">
                {license.warnings.map((warning, idx) => (
                  <li key={idx} className="text-sm text-yellow-700 dark:text-yellow-400">
                    {warning}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Technical Details */}
          {license?.licenseKey && (
            <div className="pt-4 border-t">
              <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                <Info className="h-4 w-4 text-muted-foreground" />
                Teknik Detaylar
              </h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Lisans Anahtarı:</span>{' '}
                  <code className="bg-muted px-1.5 py-0.5 rounded">{license.licenseKey}</code>
                </div>
                <div>
                  <span className="text-muted-foreground">Makine Kimliği:</span>{' '}
                  <code className="bg-muted px-1.5 py-0.5 rounded">
                    {license.machineId?.slice(0, 12)}...
                  </code>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activate License Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Lisansı Etkinleştir
          </CardTitle>
          <CardDescription>
            Aboneliğinizi etkinleştirmek veya yükseltmek için lisans anahtarınızı girin
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="license-key" className="sr-only">
                Lisans Anahtarı
              </Label>
              <Input
                id="license-key"
                placeholder="IS-2026-XXXX-XXXX"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                disabled={activating}
              />
            </div>
            <Button onClick={handleActivate} disabled={activating || !licenseKey.trim()}>
              {activating ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Etkinleştiriliyor…
                </>
              ) : (
                "Etkinleştir"
              )}
            </Button>
            <Button variant="outline" onClick={handleValidate} disabled={loading}>
              Doğrula
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Lisans anahtarı için sales@infrascope.com adresiyle iletişime geçin
          </p>
        </CardContent>
      </Card>

      {/* Feature Matrix Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5" />
            Özellik Karşılaştırması
          </CardTitle>
          <CardDescription>Her lisans planında kullanılabilen özellikler</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 text-sm font-medium">Özellik</th>
                  {Object.entries(FEATURE_MATRIX).map(([tier, info]) => (
                    <th key={tier} className="text-center py-3 px-4 text-sm font-medium">
                      <span className="inline-block">{info.label}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.keys(FEATURE_MATRIX.TRIAL.features).map((feature) => (
                  <tr key={feature} className="border-b last:border-b-0 hover:bg-muted/50">
                    <td className="py-3 px-4 text-sm">{uiLabel(feature)}</td>
                    {Object.entries(FEATURE_MATRIX).map(([tier, info]) => (
                      <td key={tier} className="py-3 px-4 text-center">
                        {info.features[feature as keyof typeof info.features] ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                        ) : (
                          <XCircle className="h-4 w-4 text-gray-300 dark:text-gray-600 mx-auto" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
