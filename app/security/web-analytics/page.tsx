'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Globe,
  Search,
  RefreshCw,
  AlertCircle,
  Users,
  BarChart3,
  ArrowUpDown,
  TrendingUp,
  Shield,
  ShieldAlert,
  Monitor,
  Clock,
  FileCheck,
  Cloud,
} from 'lucide-react';

interface WebsiteCategory {
  catdesc?: string;
  domain?: string;
  bandwidth?: string;
  browsetime?: string;
  sessions?: string;
  traffic_in?: string;
  traffic_out?: string;
  threatweight?: string;
  threat_block?: string;
  threat_pass?: string;
  session_block?: string;
  session_pass?: string;
  fortigate?: string;
  agg_webcat?: string;
  [key: string]: unknown;
}

interface BrowsingUser {
  f_user?: string;
  srcip?: string;
  bandwidth?: string;
  browsetime?: string;
  sessions?: string;
  traffic_in?: string;
  traffic_out?: string;
  threatweight?: string;
  threat_block?: string;
  session_block?: string;
  session_pass?: string;
  fortigate?: string;
  [key: string]: unknown;
}

interface PolicyHit {
  policy?: string;
  policyid?: string;
  agg_policyid?: string;
  policytype?: string;
  bandwidth?: string;
  counts?: string;
  count_block?: string;
  count_pass?: string;
  traffic_in?: string;
  traffic_out?: string;
  srcintf?: string;
  dstintf?: string;
  fortigate?: string;
  devid?: string;
  vd?: string;
  time_stamp?: string;
  [key: string]: unknown;
}

interface CloudApp {
  app_group?: string;
  appcat?: string;
  bandwidth?: string;
  risk?: string;
  d_risk?: string;
  sessions?: string;
  session_block?: string;
  session_pass?: string;
  traffic_in?: string;
  traffic_out?: string;
  num_users?: string;
  fortigate?: string;
  [key: string]: unknown;
}

function formatBytes(bytesStr?: string): string {
  if (!bytesStr) return '0 B';
  const bytes = parseFloat(bytesStr);
  if (isNaN(bytes) || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDuration(secondsStr?: string): string {
  if (!secondsStr) return '0s';
  const s = parseInt(secondsStr, 10);
  if (isNaN(s) || s === 0) return '0s';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}s ${m}dk`;
  if (m > 0) return `${m}dk`;
  return `${s}sn`;
}

function formatNumber(numStr?: string): string {
  if (!numStr) return '0';
  const n = parseInt(numStr, 10);
  if (isNaN(n)) return '0';
  return n.toLocaleString('tr-TR');
}

const TIME_RANGES = [
  { label: '15 dk', value: 15 },
  { label: '1 saat', value: 60 },
];

export default function WebAnalyticsPage() {
  const [websiteData, setWebsiteData] = useState<WebsiteCategory[]>([]);
  const [userData, setUserData] = useState<BrowsingUser[]>([]);
  const [policyData, setPolicyData] = useState<PolicyHit[]>([]);
  const [cloudData, setCloudData] = useState<CloudApp[]>([]);
  const [loadingWebsites, setLoadingWebsites] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingPolicies, setLoadingPolicies] = useState(true);
  const [loadingCloud, setLoadingCloud] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [websiteSearch, setWebsiteSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [policySearch, setPolicySearch] = useState('');
  const [cloudSearch, setCloudSearch] = useState('');
  const [activeTab, setActiveTab] = useState('categories');
  const [timeRange, setTimeRange] = useState(60);

  // Fetch all FortiView data in a SINGLE batch API call (single FA login)
  const fetchAllData = useCallback(async (range: number) => {
    setError(null);
    setLoadingWebsites(true);
    setLoadingUsers(true);
    setLoadingPolicies(true);
    setLoadingCloud(true);
  
    try {
      const response = await fetch(
        `/api/integrations/fortianalyzer?type=fortiview-batch&views=top-websites,top-browsing-users,policy-hits,top-applications&limit=100&sort=bandwidth&range=${range}`
      );
      const result = await response.json();
  
      if (!result.success) {
        setError(result.error || 'FortiView verileri y\u00fcklenemedi');
        return;
      }
  
      const r = result.results || {};
  
      // Top Websites
      if (r['top-websites'] && Array.isArray(r['top-websites'].data)) {
        setWebsiteData(r['top-websites'].data);
      }
      // Top Browsing Users
      if (r['top-browsing-users'] && Array.isArray(r['top-browsing-users'].data)) {
        setUserData(r['top-browsing-users'].data);
      }
      // Policy Hits
      if (r['policy-hits'] && Array.isArray(r['policy-hits'].data)) {
        setPolicyData(r['policy-hits'].data);
      }
      // Top Applications (Cloud Apps)
      if (r['top-applications'] && Array.isArray(r['top-applications'].data)) {
        setCloudData(r['top-applications'].data);
      }
    } catch (err) {
      console.error('Failed to fetch FortiView batch data:', err);
      setError('FortiView verileri al\u0131namad\u0131');
    } finally {
      setLoadingWebsites(false);
      setLoadingUsers(false);
      setLoadingPolicies(false);
      setLoadingCloud(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData(timeRange);
    const interval = setInterval(() => {
      fetchAllData(timeRange);
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAllData, timeRange]);

  const refreshAll = () => {
    fetchAllData(timeRange);
  };

  const handleTimeRangeChange = (range: number) => {
    setTimeRange(range);
    fetchAllData(range);
  };

  const filteredWebsites = websiteData.filter((w: WebsiteCategory) => {
    if (!websiteSearch) return true;
    const term = websiteSearch.toLowerCase();
    return (
      (w.catdesc || '').toLowerCase().includes(term) ||
      (w.domain || '').toLowerCase().includes(term) ||
      (w.fortigate || '').toLowerCase().includes(term)
    );
  });

  const filteredUsers = userData
    .slice(0, 20)
    .filter((u: BrowsingUser) => {
    if (!userSearch) return true;
    const term = userSearch.toLowerCase();
    return (
      (u.f_user || '').toLowerCase().includes(term) ||
      (u.srcip || '').toLowerCase().includes(term) ||
      (u.fortigate || '').toLowerCase().includes(term)
    );
  });

  const filteredPolicies = policyData.filter((p: PolicyHit) => {
    if (!policySearch) return true;
    const term = policySearch.toLowerCase();
    return (
      (p.policy || '').toLowerCase().includes(term) ||
      (p.policyid || p.agg_policyid || '').toLowerCase().includes(term) ||
      (p.srcintf || '').toLowerCase().includes(term) ||
      (p.dstintf || '').toLowerCase().includes(term) ||
      (p.fortigate || '').toLowerCase().includes(term)
    );
  });

  const filteredCloud = cloudData.filter((c: CloudApp) => {
    if (!cloudSearch) return true;
    const term = cloudSearch.toLowerCase();
    return (
      (c.app_group || '').toLowerCase().includes(term) ||
      (c.appcat || '').toLowerCase().includes(term) ||
      (c.fortigate || '').toLowerCase().includes(term)
    );
  });

  const totalBandwidth = websiteData.reduce((sum: number, w: WebsiteCategory) => sum + (parseFloat(w.bandwidth || '0') || 0), 0);
  const totalSessions = websiteData.reduce((sum: number, w: WebsiteCategory) => sum + (parseInt(w.sessions || '0', 10) || 0), 0);
  const totalThreats = websiteData.reduce((sum: number, w: WebsiteCategory) => sum + (parseInt(w.threat_block || '0', 10) || 0), 0);
  const loading = loadingWebsites || loadingUsers || loadingPolicies || loadingCloud;

  // Top 20 sites by threat score (threatweight > 0, sorted desc)
  const topThreatSites = useMemo(() =>
    websiteData
      .filter((w: WebsiteCategory) => parseInt(w.threatweight || '0', 10) > 0)
      .sort((a, b) => parseInt(b.threatweight || '0', 10) - parseInt(a.threatweight || '0', 10))
      .slice(0, 20),
  [websiteData]);

  return (
    <div className="p-6 space-y-6 max-w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Web Analytics</h1>
          <p className="text-muted-foreground">
            FortiAnalyzer FortiView - Top Web Sitesi Kategorileri ve Kullanıcı Aktivitesi
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            {TIME_RANGES.map((tr) => (
              <Button
                key={tr.value}
                variant={timeRange === tr.value ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleTimeRangeChange(tr.value)}
                disabled={loading}
                className="text-xs h-8"
              >
                <Clock className="h-3 w-3 mr-1" />
                {tr.label}
              </Button>
            ))}
          </div>
          <Button onClick={refreshAll} variant="outline" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-blue-500/20"><Globe className="h-5 w-5 text-blue-500" /></div>
            <div><p className="text-sm text-muted-foreground">Web Kategorisi</p><p className="text-2xl font-bold">{websiteData.length}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-green-500/20"><Users className="h-5 w-5 text-green-500" /></div>
            <div><p className="text-sm text-muted-foreground">Aktif Kullanıcı</p><p className="text-2xl font-bold">{userData.length}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-purple-500/20"><TrendingUp className="h-5 w-5 text-purple-500" /></div>
            <div><p className="text-sm text-muted-foreground">Toplam Bant Genişliği</p><p className="text-2xl font-bold">{formatBytes(String(totalBandwidth))}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-red-500/20"><Shield className="h-5 w-5 text-red-500" /></div>
            <div><p className="text-sm text-muted-foreground">Engellenen Tehdit</p><p className="text-2xl font-bold">{formatNumber(String(totalThreats))}</p></div>
          </div>
        </CardContent></Card>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-destructive/10 rounded-lg">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <span className="text-destructive">{error}</span>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="categories">
            <Globe className="h-4 w-4 mr-2" />
            Top Web Siteleri
          </TabsTrigger>
          <TabsTrigger value="threats">
            <ShieldAlert className="h-4 w-4 mr-2" />
            Yüksek Tehdit
            {topThreatSites.length > 0 && (
              <Badge variant="destructive" className="ml-2 text-xs">{topThreatSites.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="users">
            <Users className="h-4 w-4 mr-2" />
            Top Kullanıcılar
          </TabsTrigger>
          <TabsTrigger value="policies">
            <FileCheck className="h-4 w-4 mr-2" />
            Policy Hits
          </TabsTrigger>
          <TabsTrigger value="cloud">
            <Cloud className="h-4 w-4 mr-2" />
            Cloud Uygulamaları
          </TabsTrigger>
        </TabsList>

        {/* Top Website Categories */}
        <TabsContent value="categories" className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Kategori, domain veya cihaz ara..." value={websiteSearch} onChange={(e) => setWebsiteSearch(e.target.value)} className="pl-9" />
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Top Web Sitesi Kategorileri
                <Badge variant="secondary">{filteredWebsites.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingWebsites ? (
                <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-primary" /></div>
              ) : (
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Kategori / Domain</TableHead>
                      <TableHead><div className="flex items-center gap-1"><ArrowUpDown className="h-3 w-3" />Bant Genişliği</div></TableHead>
                      <TableHead>Oturum</TableHead>
                      <TableHead>Gelen Trafik</TableHead>
                      <TableHead>Giden Trafik</TableHead>
                      <TableHead>Tehdit Skoru</TableHead>
                      <TableHead>Engellenen</TableHead>
                      <TableHead>Cihaz</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredWebsites.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Veri bulunamadı</TableCell>
                      </TableRow>
                    ) : (
                      filteredWebsites.map((w: WebsiteCategory, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell>
                            <div className="font-medium">{w.catdesc || w.domain || w.agg_webcat || '-'}</div>
                            {w.domain && w.catdesc && <div className="text-xs text-muted-foreground">{w.domain}</div>}
                          </TableCell>
                          <TableCell className="font-mono text-sm font-semibold">{formatBytes(w.bandwidth)}</TableCell>
                          <TableCell className="font-mono text-sm">{formatNumber(w.sessions)}</TableCell>
                          <TableCell className="font-mono text-xs text-green-600">{formatBytes(w.traffic_in)}</TableCell>
                          <TableCell className="font-mono text-xs text-blue-600">{formatBytes(w.traffic_out)}</TableCell>
                          <TableCell>
                            {parseInt(w.threatweight || '0', 10) > 0 ? (
                              <Badge variant="destructive">{formatNumber(w.threatweight)}</Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {parseInt(w.threat_block || '0', 10) > 0 ? (
                              <Badge className="bg-red-600 text-white">{formatNumber(w.threat_block)}</Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">{w.fortigate || '-'}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* High Threat Sites — Top 20 by threatweight */}
        <TabsContent value="threats" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-red-500" />
                Tehdit Skoru Yüksek Top 20 Web Sitesi
                <Badge variant="destructive">{topThreatSites.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingWebsites ? (
                <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-primary" /></div>
              ) : topThreatSites.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ShieldAlert className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>Seçilen zaman aralığında tehdit skoru olan site bulunamadı</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="w-full" style={{ tableLayout: 'auto' }}>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead className="whitespace-nowrap">Kategori / Domain</TableHead>
                        <TableHead className="whitespace-nowrap">
                          <div className="flex items-center gap-1 text-red-600 font-semibold">
                            <ShieldAlert className="h-3 w-3" />Tehdit Skoru
                          </div>
                        </TableHead>
                        <TableHead className="whitespace-nowrap">Engellenen</TableHead>
                        <TableHead className="whitespace-nowrap">Geçen</TableHead>
                        <TableHead className="whitespace-nowrap">Oturum</TableHead>
                        <TableHead className="whitespace-nowrap">Bant Genişliği</TableHead>
                        <TableHead className="whitespace-nowrap">Gelen Trafik</TableHead>
                        <TableHead className="whitespace-nowrap">Giden Trafik</TableHead>
                        <TableHead className="whitespace-nowrap">Gezinti Süresi</TableHead>
                        <TableHead className="whitespace-nowrap">Cihaz</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topThreatSites.map((w: WebsiteCategory, idx: number) => {
                        const score = parseInt(w.threatweight || '0', 10);
                        const blocked = parseInt(w.threat_block || '0', 10);
                        const scoreColor =
                          score >= 50000 ? 'bg-red-700 text-white' :
                          score >= 10000 ? 'bg-red-500 text-white' :
                          score >= 1000  ? 'bg-orange-500 text-white' :
                                          'bg-yellow-500 text-white';
                        return (
                          <TableRow key={idx} className={blocked > 0 ? 'bg-red-50/30' : ''}>
                            <TableCell className="text-muted-foreground whitespace-nowrap font-semibold">{idx + 1}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              <div className="font-semibold">{w.catdesc || w.domain || w.agg_webcat || '-'}</div>
                              {w.domain && w.catdesc && <div className="text-xs text-muted-foreground">{w.domain}</div>}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              <Badge className={scoreColor}>{score.toLocaleString('tr-TR')}</Badge>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {blocked > 0 ? (
                                <Badge className="bg-red-600 text-white">{blocked.toLocaleString('tr-TR')}</Badge>
                              ) : (
                                <span className="text-muted-foreground">0</span>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-sm whitespace-nowrap">
                              {parseInt(w.threat_pass || '0', 10).toLocaleString('tr-TR')}
                            </TableCell>
                            <TableCell className="font-mono text-sm whitespace-nowrap">{formatNumber(w.sessions)}</TableCell>
                            <TableCell className="font-mono text-sm font-semibold whitespace-nowrap">{formatBytes(w.bandwidth)}</TableCell>
                            <TableCell className="font-mono text-xs text-green-600 whitespace-nowrap">{formatBytes(w.traffic_in)}</TableCell>
                            <TableCell className="font-mono text-xs text-blue-600 whitespace-nowrap">{formatBytes(w.traffic_out)}</TableCell>
                            <TableCell className="text-sm whitespace-nowrap">{formatDuration(w.browsetime)}</TableCell>
                            <TableCell className="text-xs whitespace-nowrap">{w.fortigate || '-'}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Top Browsing Users */}
        <TabsContent value="users" className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Kullanıcı, IP veya cihaz ara..." value={userSearch} onChange={(e) => setUserSearch(e.target.value)} className="pl-9" />
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Monitor className="h-5 w-5" />
                Top Web Kullanıcıları
                <Badge variant="secondary">{filteredUsers.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingUsers ? (
                <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-primary" /></div>
              ) : (
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Kullanıcı</TableHead>
                      <TableHead>Kaynak IP</TableHead>
                      <TableHead><div className="flex items-center gap-1"><ArrowUpDown className="h-3 w-3" />Bant Genişliği</div></TableHead>
                      <TableHead>Oturum</TableHead>
                      <TableHead>Gezinti Süresi</TableHead>
                      <TableHead>Gelen Trafik</TableHead>
                      <TableHead>Giden Trafik</TableHead>
                      <TableHead>Tehdit</TableHead>
                      <TableHead>Cihaz</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Veri bulunamadı</TableCell>
                      </TableRow>
                    ) : (
                      filteredUsers.map((u: BrowsingUser, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="font-medium">{u.f_user || 'Bilinmeyen'}</TableCell>
                          <TableCell className="font-mono text-xs">{u.srcip || '-'}</TableCell>
                          <TableCell className="font-mono text-sm font-semibold">{formatBytes(u.bandwidth)}</TableCell>
                          <TableCell className="font-mono text-sm">{formatNumber(u.sessions)}</TableCell>
                          <TableCell className="text-sm">{formatDuration(u.browsetime)}</TableCell>
                          <TableCell className="font-mono text-xs text-green-600">{formatBytes(u.traffic_in)}</TableCell>
                          <TableCell className="font-mono text-xs text-blue-600">{formatBytes(u.traffic_out)}</TableCell>
                          <TableCell>
                            {parseInt(u.threatweight || '0', 10) > 0 ? (
                              <Badge variant="destructive">{formatNumber(u.threatweight)}</Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">{u.fortigate || '-'}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Top Policy Hits */}
        <TabsContent value="policies" className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Policy ID, interface veya cihaz ara..." value={policySearch} onChange={(e) => setPolicySearch(e.target.value)} className="pl-9" />
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCheck className="h-5 w-5" />
                Top Policy Hits
                <Badge variant="secondary">{filteredPolicies.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingPolicies ? (
                <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-primary" /></div>
              ) : (
                <Table className="w-full" style={{ tableLayout: 'auto' }}>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead className="whitespace-nowrap">Policy</TableHead>
                      <TableHead className="whitespace-nowrap">Tür</TableHead>
                      <TableHead className="whitespace-nowrap"><div className="flex items-center gap-1"><ArrowUpDown className="h-3 w-3" />Bant Genişliği</div></TableHead>
                      <TableHead className="whitespace-nowrap">Hit Sayısı</TableHead>
                      <TableHead className="whitespace-nowrap">İzin Verilen</TableHead>
                      <TableHead className="whitespace-nowrap">Engellenen</TableHead>
                      <TableHead className="whitespace-nowrap">Gelen Trafik</TableHead>
                      <TableHead className="whitespace-nowrap">Giden Trafik</TableHead>
                      <TableHead className="whitespace-nowrap">Kaynak Int.</TableHead>
                      <TableHead className="whitespace-nowrap">Hedef Int.</TableHead>
                      <TableHead className="whitespace-nowrap">Cihaz</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPolicies.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">Veri bulunamadı</TableCell>
                      </TableRow>
                    ) : (
                      filteredPolicies.map((p: PolicyHit, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell className="text-muted-foreground whitespace-nowrap">{idx + 1}</TableCell>
                          <TableCell className="font-medium whitespace-nowrap">{p.policy || p.agg_policyid || p.policyid || '-'}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{p.policytype || '-'}</TableCell>
                          <TableCell className="font-mono text-sm font-semibold whitespace-nowrap">{formatBytes(p.bandwidth)}</TableCell>
                          <TableCell className="font-mono text-sm whitespace-nowrap">{formatNumber(p.counts)}</TableCell>
                          <TableCell className="font-mono text-sm text-green-600 whitespace-nowrap">{formatNumber(p.count_pass)}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {parseInt(p.count_block || '0', 10) > 0 ? (
                              <Badge variant="destructive">{formatNumber(p.count_block)}</Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-green-600 whitespace-nowrap">{formatBytes(p.traffic_in)}</TableCell>
                          <TableCell className="font-mono text-xs text-blue-600 whitespace-nowrap">{formatBytes(p.traffic_out)}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{p.srcintf || '-'}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{p.dstintf || '-'}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{p.fortigate || '-'}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cloud Applications */}
        <TabsContent value="cloud" className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Uygulama, kategori veya cihaz ara..." value={cloudSearch} onChange={(e) => setCloudSearch(e.target.value)} className="pl-9" />
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cloud className="h-5 w-5" />
                Top Cloud Uygulamaları
                <Badge variant="secondary">{filteredCloud.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingCloud ? (
                <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-primary" /></div>
              ) : (
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Uygulama</TableHead>
                      <TableHead>Kategori</TableHead>
                      <TableHead>Risk</TableHead>
                      <TableHead><div className="flex items-center gap-1"><ArrowUpDown className="h-3 w-3" />Bant Genişliği</div></TableHead>
                      <TableHead>Oturum</TableHead>
                      <TableHead>İzin Verilen</TableHead>
                      <TableHead>Engellenen</TableHead>
                      <TableHead>Gelen Trafik</TableHead>
                      <TableHead>Giden Trafik</TableHead>
                      <TableHead>Kullanıcı</TableHead>
                      <TableHead>Cihaz</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCloud.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">Veri bulunamadı</TableCell>
                      </TableRow>
                    ) : (
                      filteredCloud.map((c: CloudApp, idx: number) => {
                        const riskLevel = parseInt(c.risk || c.d_risk || '0', 10);
                        const riskColor = riskLevel >= 4 ? 'bg-red-600' : riskLevel >= 3 ? 'bg-orange-500' : riskLevel >= 2 ? 'bg-yellow-500' : 'bg-green-500';
                        const riskLabel = riskLevel >= 4 ? 'Kritik' : riskLevel >= 3 ? 'Yüksek' : riskLevel >= 2 ? 'Orta' : 'Düşük';
                        return (
                          <TableRow key={idx}>
                            <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                            <TableCell className="font-medium">{c.app_group || '-'}</TableCell>
                            <TableCell className="text-sm">{c.appcat || '-'}</TableCell>
                            <TableCell>
                              <Badge className={`${riskColor} text-white`}>{riskLabel} ({riskLevel})</Badge>
                            </TableCell>
                            <TableCell className="font-mono text-sm font-semibold">{formatBytes(c.bandwidth)}</TableCell>
                            <TableCell className="font-mono text-sm">{formatNumber(c.sessions)}</TableCell>
                            <TableCell className="font-mono text-sm text-green-600">{formatNumber(c.session_pass)}</TableCell>
                            <TableCell>
                              {parseInt(c.session_block || '0', 10) > 0 ? (
                                <Badge variant="destructive">{formatNumber(c.session_block)}</Badge>
                              ) : (
                                <span className="text-muted-foreground">0</span>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-green-600">{formatBytes(c.traffic_in)}</TableCell>
                            <TableCell className="font-mono text-xs text-blue-600">{formatBytes(c.traffic_out)}</TableCell>
                            <TableCell className="font-mono text-sm">{formatNumber(c.num_users)}</TableCell>
                            <TableCell className="text-xs">{c.fortigate || '-'}</TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
