'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  Shield,
  Cpu,
  MemoryStick,
  Network,
  Activity,
  Server,
  Users,
  Lock,
  Globe,
  Clock,
  FileText,
  AlertTriangle,
  User,
  History
} from 'lucide-react';

interface FortiGateStatus {
  hostname: string;
  version: string;
  serial: string;
  model: string;
  cpu: number;
  memory: number;
  session: {
    current: number;
    percent: number;
  };
  ha: {
    enabled: boolean;
    role: string;
    serial: string;
  };
  sdwan: {
    interfaces: Array<{
      name: string;
      link: string;
      session: number;
      tx_bandwidth: number;
      rx_bandwidth: number;
    }>;
  };
  license: {
    status: string;
    support: string;
    expires: string;
  };
}

interface SSLVPNUser {
  user_name: string;
  remote_host: string;
  last_login_timestamp: number;
  two_factor_auth: boolean;
  interface: string;
  duration: number;
  aip: string;
  in_bytes: number;
  out_bytes: number;
}

interface IPsecTunnel {
  name: string;
  comments: string;
  status: string;
  username: string;
  rgwy: string;
  incoming_bytes: number;
  outgoing_bytes: number;
  connection_count: number;
}

interface ConfigRevision {
  id: number;
  time: number;
  admin: string;
  comment: string;
  version: string;
}

interface InterfaceStats {
  id: string;
  name: string;
  alias: string;
  mac: string;
  ip: string;
  link: boolean;
  speed: number;
  tx_packets: number;
  rx_packets: number;
  tx_bytes: number;
  rx_bytes: number;
  tx_errors: number;
  rx_errors: number;
}

interface EventLog {
  id: string;
  eventtime: number;
  logid: string;
  type: string;
  subtype: string;
  action: string;
  level: string;
  user: string;
  srcip: string;
  dstip: string;
  msg: string;
}

const ITEMS_PER_PAGE = 10;

export default function FirewallPage() {
  const [status, setStatus] = useState<FortiGateStatus | null>(null);
  const [sslUsers, setSslUsers] = useState<SSLVPNUser[]>([]);
  const [interfaceStats, setInterfaceStats] = useState<InterfaceStats[]>([]);
  const [eventLogs, setEventLogs] = useState<EventLog[]>([]);
  const [fortiAnalyzerStatus, setFortiAnalyzerStatus] = useState<Record<string, unknown> | null>(null);
  const [fortiAnalyzerAdoms, setFortiAnalyzerAdoms] = useState<Array<Record<string, unknown>>>([]);
  const [configRevisions, setConfigRevisions] = useState<{
    hasUnsavedChanges: boolean;
    revisions: ConfigRevision[];
  }>({ hasUnsavedChanges: false, revisions: [] });
  const [loading, setLoading] = useState(true);

  // Search and pagination states
  const [sslSearch, setSslSearch] = useState('');
  const [sslPage, setSslPage] = useState(1);
  const [interfaceSearch, setInterfaceSearch] = useState('');
  const [interfacePage, setInterfacePage] = useState(1);

  const fetchFortiGateData = async () => {
    setLoading(true);
    try {
      const [statusRes, sslRes, interfaceRes] = await Promise.all([
        fetch('/api/integrations/fortigate'),
        fetch('/api/integrations/fortigate?vpn=ssl'),
        fetch('/api/integrations/fortigate?vpn=interfaces'),
      ]);

      const statusData = await statusRes.json();
      const sslData = await sslRes.json();
      const interfaceData = await interfaceRes.json();

      if (statusData.connected) {
        setStatus({
          hostname: statusData.hostname || 'BUSKI_MASTER',
          version: statusData.version || 'v7.2.11',
          serial: statusData.serial || 'FG4H0FT922903115',
          model: statusData.model || 'FortiGate 400F',
          cpu: statusData.cpu || 0,
          memory: statusData.memory || 0,
          session: statusData.session || { current: 0, percent: 0 },
          ha: statusData.ha || { enabled: false, role: 'Unknown', serial: '' },
          sdwan: statusData.sdwan || { interfaces: [] },
          license: statusData.license || { status: 'Unknown', support: 'Unknown', expires: '' },
        });
      }

      if (sslData.success) {
        setSslUsers(sslData.data);
      }

      if (interfaceData.success) {
        setInterfaceStats(interfaceData.data);
      }
    } catch (error) {
      console.error('Failed to fetch FortiGate data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFortiAnalyzerData = async () => {
    try {
      const [faStatusRes, faAdomsRes] = await Promise.all([
        fetch('/api/integrations/fortianalyzer?type=status'),
        fetch('/api/integrations/fortianalyzer?type=adoms'),
      ]);

      const faStatusData = await faStatusRes.json();
      const faAdomsData = await faAdomsRes.json();

      if (faStatusData.success) {
        setFortiAnalyzerStatus(faStatusData.data);
      }

      if (faAdomsData.success) {
        setFortiAnalyzerAdoms(faAdomsData.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch FortiAnalyzer data:', error);
    }
  };

  useEffect(() => {
    fetchFortiGateData();
    fetchFortiAnalyzerData();
    
    // FortiGate: 5 dakika
    const fortigateInterval = setInterval(fetchFortiGateData, 300000);
    // FortiAnalyzer: 15 dakika
    const fortianalyzerInterval = setInterval(fetchFortiAnalyzerData, 900000);
    
    return () => {
      clearInterval(fortigateInterval);
      clearInterval(fortianalyzerInterval);
    };
  }, []);

  // Filter and paginate SSL users
  const filteredSslUsers = useMemo(() => {
    if (!sslSearch) return sslUsers;
    const term = sslSearch.toLowerCase();
    return sslUsers.filter(
      (u) =>
        u.user_name.toLowerCase().includes(term) ||
        u.remote_host.includes(term) ||
        u.aip.includes(term) ||
        u.interface.toLowerCase().includes(term)
    );
  }, [sslUsers, sslSearch]);

  const sslTotalPages = Math.ceil(filteredSslUsers.length / ITEMS_PER_PAGE);
  const paginatedSslUsers = useMemo(() => {
    const start = (sslPage - 1) * ITEMS_PER_PAGE;
    return filteredSslUsers.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredSslUsers, sslPage]);

  // Interface filter and pagination
  const filteredInterfaces = useMemo(() => {
    return interfaceStats.filter((iface: InterfaceStats) => {
      const searchLower = interfaceSearch.toLowerCase();
      return (
        iface.name.toLowerCase().includes(searchLower) ||
        (iface.alias && iface.alias.toLowerCase().includes(searchLower)) ||
        iface.ip.toLowerCase().includes(searchLower)
      );
    });
  }, [interfaceStats, interfaceSearch]);

  const interfaceTotalPages = Math.ceil(filteredInterfaces.length / ITEMS_PER_PAGE);
  const paginatedInterfaces = filteredInterfaces.slice(
    (interfacePage - 1) * ITEMS_PER_PAGE,
    interfacePage * ITEMS_PER_PAGE
  );

  // Group revisions by admin
  const revisionsByAdmin = useMemo(() => {
    const groups: Record<string, ConfigRevision[]> = {};
    configRevisions.revisions.forEach((rev: ConfigRevision) => {
      if (!groups[rev.admin]) {
        groups[rev.admin] = [];
      }
      groups[rev.admin].push(rev);
    });
    return groups;
  }, [configRevisions.revisions]);

  // Get manual changes (excluding daemon_admin)
  const manualChanges = useMemo(() => {
    return configRevisions.revisions.filter(
      (rev: ConfigRevision) => rev.admin !== 'daemon_admin'
    );
  }, [configRevisions.revisions]);

  const formatBandwidth = (bytes: number) => {
    if (bytes > 1000000000) return `${(bytes / 1000000000).toFixed(2)} GB`;
    if (bytes > 1000000) return `${(bytes / 1000000).toFixed(2)} MB`;
    if (bytes > 1000) return `${(bytes / 1000).toFixed(2)} KB`;
    return `${bytes} B`;
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}s ${mins}d`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString('tr-TR');
  };

  const getPageNumbers = (currentPage: number, totalPages: number) => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = 5;
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('ellipsis');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">FortiGate Firewall</h1>
          <p className="text-muted-foreground">{status?.hostname} ({status?.serial})</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => { fetchFortiGateData(); fetchFortiAnalyzerData(); }} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* System Status Cards */}
      {status && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-blue-500/20">
                  <Server className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Versiyon</p>
                  <p className="text-lg font-bold">{status.version}</p>
                  <p className="text-xs text-muted-foreground">{status.model}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-green-500/20">
                  <Cpu className="h-5 w-5 text-green-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">CPU Kullanımı</p>
                  <p className="text-lg font-bold">{status.cpu}%</p>
                  <Progress value={status.cpu} className="h-2 mt-1" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-orange-500/20">
                  <MemoryStick className="h-5 w-5 text-orange-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Memory Kullanımı</p>
                  <p className="text-lg font-bold">{status.memory}%</p>
                  <Progress value={status.memory} className="h-2 mt-1" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-purple-500/20">
                  <Network className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Aktif Session</p>
                  <p className="text-lg font-bold">{status.session.current.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">%{status.session.percent} kullanımda</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* HA & SD-WAN Status */}
      {status && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Shield className="h-4 w-4" /> HA Durumu
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Rol</span>
                  <Badge variant={status.ha.role === 'Master' ? 'default' : 'secondary'}>
                    {status.ha.role}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Master Serial</span>
                  <span className="font-mono text-xs">{status.serial}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Slave Serial</span>
                  <span className="font-mono text-xs">{status.ha.serial}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Lisans</span>
                  <Badge className="bg-green-600">{status.license.support}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4" /> SD-WAN Interfaces
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {status.sdwan.interfaces.map((iface) => (
                  <div key={iface.name} className="flex justify-between items-center p-2 bg-muted rounded">
                    <div>
                      <span className="font-medium">{iface.name}</span>
                      <Badge variant={iface.link === 'up' ? 'success' : 'destructive'} className="ml-2 text-xs">
                        {iface.link}
                      </Badge>
                    </div>
                    <div className="text-right text-xs">
                      <div>↓ {(iface.rx_bandwidth / 1000000).toFixed(2)} Mbps</div>
                      <div>↑ {(iface.tx_bandwidth / 1000000).toFixed(2)} Mbps</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Interface Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5" />
            Interface İstatistikleri
            <Badge variant="secondary">{filteredInterfaces.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Interface ara..."
                value={interfaceSearch}
                onChange={(e) => {
                  setInterfaceSearch(e.target.value);
                  setInterfacePage(1);
                }}
                className="pl-10"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>İsim</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Hız</TableHead>
                    <TableHead>RX/TX (GB)</TableHead>
                    <TableHead>Paketler</TableHead>
                    <TableHead>Hatalar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedInterfaces.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Interface bulunamadı
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedInterfaces.map((iface: InterfaceStats) => (
                      <TableRow key={iface.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{iface.name}</p>
                            {iface.alias && (
                              <p className="text-xs text-muted-foreground">{iface.alias}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={iface.link ? 'success' : 'secondary'}>
                            {iface.link ? 'Bağlı' : 'Kapalı'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{iface.ip || '-'}</TableCell>
                        <TableCell>{iface.speed > 0 ? `${iface.speed} Mbps` : '-'}</TableCell>
                        <TableCell>
                          {(iface.rx_bytes / 1000000000).toFixed(2)} / {(iface.tx_bytes / 1000000000).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {iface.rx_packets.toLocaleString()} / {iface.tx_packets.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {(iface.rx_errors + iface.tx_errors) > 0 ? (
                            <span className="text-red-600 font-medium">
                              {iface.rx_errors + iface.tx_errors}
                            </span>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              {interfaceTotalPages > 1 && (
                <div className="flex items-center justify-center gap-4 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setInterfacePage(p => Math.max(1, p - 1))}
                    disabled={interfacePage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm">
                    Sayfa {interfacePage} / {interfaceTotalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setInterfacePage(p => Math.min(interfaceTotalPages, p + 1))}
                    disabled={interfacePage === interfaceTotalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* FortiAnalyzer Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            FortiAnalyzer Durumu
            {fortiAnalyzerStatus && (
              <Badge variant="success">Bağlı</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !fortiAnalyzerStatus ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>FortiAnalyzer bağlantısı kurulamadı</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">Hostname</p>
                  <p className="font-medium">{fortiAnalyzerStatus.Hostname as string}</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">Version</p>
                  <p className="font-medium">{fortiAnalyzerStatus.Version as string}</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">Platform</p>
                  <p className="font-medium">{fortiAnalyzerStatus['Platform Full Name'] as string}</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">Serial</p>
                  <p className="font-medium">{fortiAnalyzerStatus['Serial Number'] as string}</p>
                </div>
              </div>
              
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground mb-2">Disk Kullanımı</p>
                <p className="text-sm">{fortiAnalyzerStatus['Disk Usage'] as string}</p>
              </div>

              {fortiAnalyzerAdoms.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">ADOM'lar ({fortiAnalyzerAdoms.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {fortiAnalyzerAdoms.slice(0, 8).map((adom: Record<string, unknown>, idx: number) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {adom.name as string}
                      </Badge>
                    ))}
                    {fortiAnalyzerAdoms.length > 8 && (
                      <Badge variant="secondary" className="text-xs">+{fortiAnalyzerAdoms.length - 8}</Badge>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* SSL-VPN Users Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              SSL-VPN Kullanıcıları
              <Badge variant="secondary">{filteredSslUsers.length}</Badge>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Kullanıcı ara..."
                value={sslSearch}
                onChange={(e) => { setSslSearch(e.target.value); setSslPage(1); }}
                className="pl-9"
              />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kullanıcı</TableHead>
                    <TableHead>IP Adresi</TableHead>
                    <TableHead>VPN IP</TableHead>
                    <TableHead>Interface</TableHead>
                    <TableHead>Süre</TableHead>
                    <TableHead>2FA</TableHead>
                    <TableHead className="text-right">Traffic</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedSslUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Kullanıcı bulunamadı
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedSslUsers.map((user, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{user.user_name}</TableCell>
                        <TableCell className="font-mono text-xs">{user.remote_host}</TableCell>
                        <TableCell className="font-mono text-xs">{user.aip}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{user.interface}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{formatDuration(user.duration)}</TableCell>
                        <TableCell>
                          {user.two_factor_auth ? (
                            <Badge className="bg-green-600 text-xs">Aktif</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">Pasif</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          <div>↓ {formatBandwidth(user.in_bytes)}</div>
                          <div>↑ {formatBandwidth(user.out_bytes)}</div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              {sslTotalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">Sayfa {sslPage} / {sslTotalPages}</p>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" onClick={() => setSslPage((p) => Math.max(1, p - 1))} disabled={sslPage === 1}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {getPageNumbers(sslPage, sslTotalPages).map((page, idx) => (
                      <React.Fragment key={idx}>
                        {page === 'ellipsis' ? (
                          <span className="px-2 text-muted-foreground">...</span>
                        ) : (
                          <Button
                            variant={sslPage === page ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setSslPage(page)}
                            className="w-9"
                          >
                            {page}
                          </Button>
                        )}
                      </React.Fragment>
                    ))}
                    <Button variant="outline" size="icon" onClick={() => setSslPage((p) => Math.min(sslTotalPages, p + 1))} disabled={sslPage === sslTotalPages}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
