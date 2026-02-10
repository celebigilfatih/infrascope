'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Shield,
  Search,
  RefreshCw,
  AlertTriangle,
  Clock,
  ArrowUpDown,
  Monitor,
  Bug,
  AlertOctagon,
  Activity,
} from 'lucide-react';

// Interfaces
interface CompromisedHost {
  srcip?: string;
  f_user?: string;
  threatweight?: string;
  threat_block?: string;
  threat_pass?: string;
  bandwidth?: string;
  sessions?: string;
  session_block?: string;
  session_pass?: string;
  traffic_in?: string;
  traffic_out?: string;
  srcintf?: string;
  fortigate?: string;
  [key: string]: unknown;
}

interface ThreatEntry {
  threat?: string;
  threattype?: string;
  threatlevel?: string;
  threatweight?: string;
  threat_block?: string;
  threat_pass?: string;
  incidents?: string;
  incident_block?: string;
  incident_pass?: string;
  fortigate?: string;
  logtype?: string;
  logtype_str?: string;
  [key: string]: unknown;
}

const TIME_RANGES = [
  { label: '5 dk', value: 5 },
  { label: '15 dk', value: 15 },
  { label: '4 saat', value: 240 },
  { label: '7 gün', value: 10080 },
];

const formatBytes = (bytes: string | number | undefined): string => {
  if (!bytes) return '0 B';
  const b = typeof bytes === 'string' ? parseFloat(bytes) : bytes;
  if (isNaN(b) || b === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return (b / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
};

const formatNumber = (num: string | number | undefined): string => {
  if (!num) return '0';
  const n = typeof num === 'string' ? parseFloat(num) : num;
  if (isNaN(n)) return '0';
  return n.toLocaleString('tr-TR');
};

export default function IoCHostsPage() {
  const [hostsData, setHostsData] = useState<CompromisedHost[]>([]);
  const [threatsData, setThreatsData] = useState<ThreatEntry[]>([]);
  const [loadingHosts, setLoadingHosts] = useState(true);
  const [loadingThreats, setLoadingThreats] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hostSearch, setHostSearch] = useState('');
  const [threatSearch, setThreatSearch] = useState('');
  const [timeRange, setTimeRange] = useState(240);
  const [activeTab, setActiveTab] = useState('hosts');

  const fetchAllData = useCallback(async (range: number) => {
    setError(null);
    setLoadingHosts(true);
    setLoadingThreats(true);
    try {
      const response = await fetch(
        `/api/integrations/fortianalyzer?type=fortiview-batch&views=top-sources,top-threats&limit=100&sort=threatweight&range=${range}`
      );
      const result = await response.json();
      if (!result.success) {
        setError(result.error || 'Veri alınamadı');
        return;
      }
      const r = result.results || {};
      if (r['top-sources']?.data) setHostsData(r['top-sources'].data);
      if (r['top-threats']?.data) setThreatsData(r['top-threats'].data);
    } catch (err) {
      setError('API bağlantı hatası');
      console.error('IoC fetch error:', err);
    } finally {
      setLoadingHosts(false);
      setLoadingThreats(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData(timeRange);
    const interval = setInterval(() => fetchAllData(timeRange), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAllData, timeRange]);

  const handleTimeRangeChange = (value: number) => {
    setTimeRange(value);
  };

  const getThreatLevelBadge = (weight: string | number | undefined) => {
    const w = typeof weight === 'string' ? parseFloat(weight) : (weight || 0);
    if (w >= 50) return <Badge variant="destructive">Kritik</Badge>;
    if (w >= 25) return <Badge className="bg-orange-500 text-white">Yüksek</Badge>;
    if (w >= 10) return <Badge className="bg-yellow-500 text-black">Orta</Badge>;
    if (w > 0) return <Badge className="bg-blue-500 text-white">Düşük</Badge>;
    return <Badge variant="secondary">Yok</Badge>;
  };

  const getThreatLevelColor = (level: string | undefined) => {
    if (!level) return 'secondary';
    const l = level.toLowerCase();
    if (l === 'critical') return 'destructive';
    if (l === 'high') return 'bg-orange-500 text-white';
    if (l === 'medium') return 'bg-yellow-500 text-black';
    if (l === 'low') return 'bg-blue-500 text-white';
    return 'secondary';
  };

  const filteredHosts = useMemo(() => {
    if (!hostSearch) return hostsData;
    const q = hostSearch.toLowerCase();
    return hostsData.filter((h) =>
      (h.srcip || '').toLowerCase().includes(q) ||
      (h.f_user || '').toLowerCase().includes(q) ||
      (h.fortigate || '').toLowerCase().includes(q) ||
      (h.srcintf || '').toLowerCase().includes(q)
    );
  }, [hostsData, hostSearch]);

  const filteredThreats = useMemo(() => {
    if (!threatSearch) return threatsData;
    const q = threatSearch.toLowerCase();
    return threatsData.filter((t) =>
      (t.threat || '').toLowerCase().includes(q) ||
      (t.threattype || '').toLowerCase().includes(q) ||
      (t.threatlevel || '').toLowerCase().includes(q) ||
      (t.fortigate || '').toLowerCase().includes(q)
    );
  }, [threatsData, threatSearch]);

  // Stats
  const totalThreats = hostsData.reduce((sum, h) => sum + parseFloat(h.threatweight || '0'), 0);
  const totalBlocked = hostsData.reduce((sum, h) => sum + parseFloat(h.threat_block || '0'), 0);
  const totalPassed = hostsData.reduce((sum, h) => sum + parseFloat(h.threat_pass || '0'), 0);
  const criticalHosts = hostsData.filter(h => parseFloat(h.threatweight || '0') >= 50).length;

  return (
    <div className="space-y-4 p-4 max-w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertOctagon className="h-8 w-8 text-red-500" />
          <div>
            <h1 className="text-2xl font-bold">IoC - Compromised Hosts</h1>
            <p className="text-sm text-muted-foreground">
              Indicator of Compromise - Tehdit Altındaki Host&apos;lar ve Tehdit Analizi
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 mr-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            {TIME_RANGES.map((tr) => (
              <Button
                key={tr.value}
                variant={timeRange === tr.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleTimeRangeChange(tr.value)}
                className="text-xs px-2 h-7"
              >
                {tr.label}
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchAllData(timeRange)}
            disabled={loadingHosts && loadingThreats}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${(loadingHosts || loadingThreats) ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Monitor className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-xs text-muted-foreground">Toplam Host</p>
                <p className="text-2xl font-bold">{hostsData.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertOctagon className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-xs text-muted-foreground">Kritik Host</p>
                <p className="text-2xl font-bold text-red-600">{criticalHosts}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-xs text-muted-foreground">Engellenen</p>
                <p className="text-2xl font-bold text-green-600">{formatNumber(totalBlocked)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-xs text-muted-foreground">Toplam Tehdit Skoru</p>
                <p className="text-2xl font-bold">{formatNumber(totalThreats)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="hosts" className="flex items-center gap-1">
            <Monitor className="h-4 w-4" />
            Tehlikeli Host&apos;lar ({hostsData.length})
          </TabsTrigger>
          <TabsTrigger value="threats" className="flex items-center gap-1">
            <Bug className="h-4 w-4" />
            Top Tehditler ({threatsData.length})
          </TabsTrigger>
        </TabsList>

        {/* Compromised Hosts Tab */}
        <TabsContent value="hosts">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertOctagon className="h-5 w-5 text-red-500" />
                  Tehdit Altındaki Host&apos;lar (Top Sources)
                </CardTitle>
                <div className="relative w-64">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="IP, kullanıcı, cihaz ara..."
                    className="pl-8 h-9"
                    value={hostSearch}
                    onChange={(e) => setHostSearch(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingHosts ? (
                <div className="flex justify-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <Table className="w-full" style={{ tableLayout: 'auto' }}>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead className="whitespace-nowrap">Kaynak IP</TableHead>
                      <TableHead className="whitespace-nowrap">Kullanıcı</TableHead>
                      <TableHead className="whitespace-nowrap">Tehdit Seviyesi</TableHead>
                      <TableHead className="whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <ArrowUpDown className="h-3 w-3" />Tehdit Skoru
                        </div>
                      </TableHead>
                      <TableHead className="whitespace-nowrap">Engellenen</TableHead>
                      <TableHead className="whitespace-nowrap">Geçen</TableHead>
                      <TableHead className="whitespace-nowrap">Bant Genişliği</TableHead>
                      <TableHead className="whitespace-nowrap">Oturum</TableHead>
                      <TableHead className="whitespace-nowrap">Gelen Trafik</TableHead>
                      <TableHead className="whitespace-nowrap">Giden Trafik</TableHead>
                      <TableHead className="whitespace-nowrap">Kaynak Int.</TableHead>
                      <TableHead className="whitespace-nowrap">Cihaz</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHosts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                          {hostSearch ? 'Aramayla eşleşen host bulunamadı' : 'Tehdit verisi bulunamadı'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredHosts.map((h: CompromisedHost, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell className="text-muted-foreground whitespace-nowrap">{idx + 1}</TableCell>
                          <TableCell className="font-medium font-mono whitespace-nowrap">{h.srcip || '-'}</TableCell>
                          <TableCell className="whitespace-nowrap">{h.f_user || '-'}</TableCell>
                          <TableCell className="whitespace-nowrap">{getThreatLevelBadge(h.threatweight)}</TableCell>
                          <TableCell className="font-mono text-sm font-semibold whitespace-nowrap">{formatNumber(h.threatweight)}</TableCell>
                          <TableCell className="font-mono text-sm text-red-600 whitespace-nowrap">{formatNumber(h.threat_block)}</TableCell>
                          <TableCell className="font-mono text-sm text-orange-500 whitespace-nowrap">{formatNumber(h.threat_pass)}</TableCell>
                          <TableCell className="font-mono text-sm whitespace-nowrap">{formatBytes(h.bandwidth)}</TableCell>
                          <TableCell className="font-mono text-sm whitespace-nowrap">{formatNumber(h.sessions)}</TableCell>
                          <TableCell className="font-mono text-sm text-green-600 whitespace-nowrap">{formatBytes(h.traffic_in)}</TableCell>
                          <TableCell className="font-mono text-sm text-blue-600 whitespace-nowrap">{formatBytes(h.traffic_out)}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{h.srcintf || '-'}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{h.fortigate || '-'}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Top Threats Tab */}
        <TabsContent value="threats">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bug className="h-5 w-5 text-orange-500" />
                  Top Tehditler
                </CardTitle>
                <div className="relative w-64">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Tehdit adı, tür, seviye ara..."
                    className="pl-8 h-9"
                    value={threatSearch}
                    onChange={(e) => setThreatSearch(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingThreats ? (
                <div className="flex justify-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <Table className="w-full" style={{ tableLayout: 'auto' }}>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead className="whitespace-nowrap">Tehdit Adı</TableHead>
                      <TableHead className="whitespace-nowrap">Tür</TableHead>
                      <TableHead className="whitespace-nowrap">Seviye</TableHead>
                      <TableHead className="whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <ArrowUpDown className="h-3 w-3" />Tehdit Skoru
                        </div>
                      </TableHead>
                      <TableHead className="whitespace-nowrap">Engellenen</TableHead>
                      <TableHead className="whitespace-nowrap">Geçen</TableHead>
                      <TableHead className="whitespace-nowrap">Olay Sayısı</TableHead>
                      <TableHead className="whitespace-nowrap">Log Türü</TableHead>
                      <TableHead className="whitespace-nowrap">Cihaz</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredThreats.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                          {threatSearch ? 'Aramayla eşleşen tehdit bulunamadı' : 'Tehdit verisi bulunamadı'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredThreats.map((t: ThreatEntry, idx: number) => {
                        const levelClass = getThreatLevelColor(t.threatlevel);
                        return (
                          <TableRow key={idx}>
                            <TableCell className="text-muted-foreground whitespace-nowrap">{idx + 1}</TableCell>
                            <TableCell className="font-medium whitespace-nowrap max-w-[300px] truncate" title={t.threat || ''}>
                              {t.threat || '-'}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              <Badge variant="outline">{t.threattype || '-'}</Badge>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {typeof levelClass === 'string' && levelClass.startsWith('bg-') ? (
                                <Badge className={levelClass}>{t.threatlevel || '-'}</Badge>
                              ) : (
                                <Badge variant={levelClass as 'destructive' | 'secondary'}>{t.threatlevel || '-'}</Badge>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-sm font-semibold whitespace-nowrap">{formatNumber(t.threatweight)}</TableCell>
                            <TableCell className="font-mono text-sm text-red-600 whitespace-nowrap">{formatNumber(t.threat_block)}</TableCell>
                            <TableCell className="font-mono text-sm text-orange-500 whitespace-nowrap">{formatNumber(t.threat_pass)}</TableCell>
                            <TableCell className="font-mono text-sm whitespace-nowrap">{formatNumber(t.incidents)}</TableCell>
                            <TableCell className="text-xs whitespace-nowrap">{t.logtype_str || t.logtype || '-'}</TableCell>
                            <TableCell className="text-xs whitespace-nowrap">{t.fortigate || '-'}</TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
