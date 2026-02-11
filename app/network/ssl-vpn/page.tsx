'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
  Users,
  Download,
  Clock,
  Activity,
  Globe,
  Shield,
} from 'lucide-react';

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

interface VPNSummary {
  total_users: number;
  active_sessions: number;
  total_in_bytes: number;
  total_out_bytes: number;
}

const ITEMS_PER_PAGE = 15;

export default function SSLVPNPage() {
  const [sslUsers, setSslUsers] = useState<SSLVPNUser[]>([]);
  const [summary, setSummary] = useState<VPNSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, summaryRes] = await Promise.all([
        fetch('/api/integrations/fortigate?vpn=ssl'),
        fetch('/api/integrations/fortigate?vpn=ssl-summary'),
      ]);

      const usersData = await usersRes.json();
      const summaryData = await summaryRes.json();

      if (usersData.success) {
        setSslUsers(usersData.data || []);
      }

      if (summaryData.success) {
        setSummary(summaryData.data || null);
      }

      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to fetch SSL-VPN data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const filteredUsers = useMemo(() => {
    if (!search) return sslUsers;
    const term = search.toLowerCase();
    return sslUsers.filter(
      (u: SSLVPNUser) =>
        u.user_name.toLowerCase().includes(term) ||
        u.remote_host.toLowerCase().includes(term) ||
        u.aip.includes(term) ||
        u.interface.toLowerCase().includes(term)
    );
  }, [sslUsers, search]);

  const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE);
  const paginatedUsers = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return filteredUsers.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredUsers, page]);

  const getPageNumbers = (currentPage: number, total: number) => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = 7;
    if (total <= maxVisible) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('ellipsis');
      const start = Math.max(2, currentPage - 2);
      const end = Math.min(total - 1, currentPage + 2);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < total - 2) pages.push('ellipsis');
      pages.push(total);
    }
    return pages;
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) return `${hours}s ${mins}d ${secs}sn`;
    if (mins > 0) return `${mins}d ${secs}sn`;
    return `${secs}sn`;
  };

  const formatBytes = (bytes: number): string => {
    if (bytes > 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
    if (bytes > 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
    if (bytes > 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${bytes} B`;
  };

  const formatTime = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleString('tr-TR');
  };

  const exportToCSV = () => {
    const headers = ['Kullanıcı', 'Uzak Host', 'Kaynak IP', 'Interface', 'Giriş Zamanı', 'Süre', '2FA', 'İn Bytes', 'Out Bytes'];
    const rows = filteredUsers.map((u: SSLVPNUser) => [
      u.user_name,
      u.remote_host,
      u.aip,
      u.interface,
      formatTime(u.last_login_timestamp),
      formatDuration(u.duration),
      u.two_factor_auth ? 'Evet' : 'Hayır',
      u.in_bytes.toString(),
      u.out_bytes.toString(),
    ]);

    const csv = [headers.join(','), ...rows.map((r: string[]) => r.join(', '))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sslvpn-users-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">SSL-VPN Kullanıcıları</h1>
          <p className="text-muted-foreground">
            Aktif FortiGate SSL-VPN bağlantıları
            {lastUpdate && (
              <span className="ml-2 text-xs">
                (Son güncelleme: {lastUpdate.toLocaleTimeString('tr-TR')})
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="outline" onClick={exportToCSV} disabled={filteredUsers.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            CSV Export
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-500/20">
                <Users className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Toplam Kullanıcı</p>
                <p className="text-2xl font-bold">{summary?.total_users || sslUsers.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-500/20">
                <Activity className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Aktif Oturum</p>
                <p className="text-2xl font-bold">{summary?.active_sessions || sslUsers.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-purple-500/20">
                <Globe className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Toplam İngress</p>
                <p className="text-2xl font-bold">{formatBytes(summary?.total_in_bytes || sslUsers.reduce((s, u) => s + u.in_bytes, 0))}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-orange-500/20">
                <Shield className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Toplam Egress</p>
                <p className="text-2xl font-bold">{formatBytes(summary?.total_out_bytes || sslUsers.reduce((s, u) => s + u.out_bytes, 0))}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Kullanıcı adı, IP veya interface ara..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
        <Badge variant="secondary">
          {filteredUsers.length} kullanıcı bulundu
        </Badge>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Aktif VPN Kullanıcıları</CardTitle>
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
                    <TableHead>Uzak Host</TableHead>
                    <TableHead>Kaynak IP</TableHead>
                    <TableHead>Interface</TableHead>
                    <TableHead>Giriş Zamanı</TableHead>
                    <TableHead>Süre</TableHead>
                    <TableHead>2FA</TableHead>
                    <TableHead>İngress</TableHead>
                    <TableHead>Egress</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        Aktif SSL-VPN kullanıcısı bulunamadı
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedUsers.map((user) => (
                      <TableRow key={`${user.user_name}-${user.remote_host}-${user.last_login_timestamp}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{user.user_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{user.remote_host}</TableCell>
                        <TableCell className="font-mono text-xs">{user.aip}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{user.interface}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{formatTime(user.last_login_timestamp)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span>{formatDuration(user.duration)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.two_factor_auth ? 'default' : 'secondary'}>
                            {user.two_factor_auth ? 'Aktif' : 'Yok'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{formatBytes(user.in_bytes)}</TableCell>
                        <TableCell className="text-xs">{formatBytes(user.out_bytes)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Sayfa {page} / {totalPages}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {getPageNumbers(page, totalPages).map((p, idx) => (
                      <React.Fragment key={idx}>
                        {p === 'ellipsis' ? (
                          <span className="px-2 text-muted-foreground">...</span>
                        ) : (
                          <Button
                            variant={page === p ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setPage(p)}
                            className="w-9"
                          >
                            {p}
                          </Button>
                        )}
                      </React.Fragment>
                    ))}
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
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
