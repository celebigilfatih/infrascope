'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
  Monitor,
  Clock,
  FileCheck,
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
  { label: '5 dk', value: 5 },
  { label: '15 dk', value: 15 },
  { label: '4 saat', value: 240 },
  { label: '7 gün', value: 10080 },
];

export default function WebAnalyticsPage() {
  const [websiteData, setWebsiteData] = useState<WebsiteCategory[]>([]);
  const [userData, setUserData] = useState<BrowsingUser[]>([]);
  const [policyData, setPolicyData] = useState<PolicyHit[]>([]);
  const [loadingWebsites, setLoadingWebsites] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingPolicies, setLoadingPolicies] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [websiteSearch, setWebsiteSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [policySearch, setPolicySearch] = useState('');
  const [activeTab, setActiveTab] = useState('categories');
  const [timeRange, setTimeRange] = useState(240);

  // Fetch all FortiView data in a SINGLE batch API call (single FA login)
  const fetchAllData = useCallback(async (range: number) => {
    setError(null);
    setLoadingWebsites(true);
    setLoadingUsers(true);
    setLoadingPolicies(true);
  
    try {
      const response = await fetch(
        `/api/integrations/fortianalyzer?type=fortiview-batch&views=top-websites,top-browsing-users,policy-hits&limit=100&sort=bandwidth&range=${range}`
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
    } catch (err) {
      console.error('Failed to fetch FortiView batch data:', err);
      setError('FortiView verileri al\u0131namad\u0131');
    } finally {
      setLoadingWebsites(false);
      setLoadingUsers(false);
      setLoadingPolicies(false);
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

  const filteredUsers = userData.filter((u: BrowsingUser) => {
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

  const totalBandwidth = websiteData.reduce((sum: number, w: WebsiteCategory) => sum + (parseFloat(w.bandwidth || '0') || 0), 0);
  const totalSessions = websiteData.reduce((sum: number, w: WebsiteCategory) => sum + (parseInt(w.sessions || '0', 10) || 0), 0);
  const totalThreats = websiteData.reduce((sum: number, w: WebsiteCategory) => sum + (parseInt(w.threat_block || '0', 10) || 0), 0);
  const loading = loadingWebsites || loadingUsers || loadingPolicies;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Web Analitik</h1>
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
          <TabsTrigger value="users">
            <Users className="h-4 w-4 mr-2" />
            Top Kullanıcılar
          </TabsTrigger>
          <TabsTrigger value="policies">
            <FileCheck className="h-4 w-4 mr-2" />
            Policy Hits
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
            <CardContent>
              {loadingWebsites ? (
                <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-primary" /></div>
              ) : (
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
            <CardContent>
              {loadingUsers ? (
                <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-primary" /></div>
              ) : (
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
            <CardContent>
              {loadingPolicies ? (
                <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-primary" /></div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Policy</TableHead>
                      <TableHead>Tür</TableHead>
                      <TableHead><div className="flex items-center gap-1"><ArrowUpDown className="h-3 w-3" />Bant Genişliği</div></TableHead>
                      <TableHead>Hit Sayısı</TableHead>
                      <TableHead>İzin Verilen</TableHead>
                      <TableHead>Engellenen</TableHead>
                      <TableHead>Gelen Trafik</TableHead>
                      <TableHead>Giden Trafik</TableHead>
                      <TableHead>Kaynak Int.</TableHead>
                      <TableHead>Hedef Int.</TableHead>
                      <TableHead>Cihaz</TableHead>
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
                          <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="font-medium">{p.policy || p.agg_policyid || p.policyid || '-'}</TableCell>
                          <TableCell className="text-xs">{p.policytype || '-'}</TableCell>
                          <TableCell className="font-mono text-sm font-semibold">{formatBytes(p.bandwidth)}</TableCell>
                          <TableCell className="font-mono text-sm">{formatNumber(p.counts)}</TableCell>
                          <TableCell className="font-mono text-sm text-green-600">{formatNumber(p.count_pass)}</TableCell>
                          <TableCell>
                            {parseInt(p.count_block || '0', 10) > 0 ? (
                              <Badge variant="destructive">{formatNumber(p.count_block)}</Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-green-600">{formatBytes(p.traffic_in)}</TableCell>
                          <TableCell className="font-mono text-xs text-blue-600">{formatBytes(p.traffic_out)}</TableCell>
                          <TableCell className="text-xs">{p.srcintf || '-'}</TableCell>
                          <TableCell className="text-xs">{p.dstintf || '-'}</TableCell>
                          <TableCell className="text-xs">{p.fortigate || '-'}</TableCell>
                        </TableRow>
                      ))
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
