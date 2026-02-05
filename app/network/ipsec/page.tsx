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
  Shield,
  Network,
  Activity,
  Lock,
  Globe,
  ArrowLeft
} from 'lucide-react';
import Link from 'next/link';

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

const ITEMS_PER_PAGE = 10;

export default function IPsecPage() {
  const [tunnels, setTunnels] = useState<IPsecTunnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const fetchTunnels = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/integrations/fortigate?vpn=ipsec');
      const data = await response.json();
      if (data.success) {
        setTunnels(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch IPsec tunnels:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTunnels();
  }, []);

  // Filter and pagination
  const filteredTunnels = useMemo(() => {
    return tunnels.filter((tunnel: IPsecTunnel) => {
      const searchLower = search.toLowerCase();
      return (
        tunnel.name.toLowerCase().includes(searchLower) ||
        tunnel.comments.toLowerCase().includes(searchLower) ||
        tunnel.rgwy.toLowerCase().includes(searchLower) ||
        tunnel.username.toLowerCase().includes(searchLower)
      );
    });
  }, [tunnels, search]);

  const totalPages = Math.ceil(filteredTunnels.length / ITEMS_PER_PAGE);
  const paginatedTunnels = filteredTunnels.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  );

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/network/firewall">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Shield className="h-8 w-8" />
              IPsec Tunnel'ları
            </h1>
            <p className="text-muted-foreground">
              FortiGate IPsec VPN tunnel durumları ve istatistikleri
            </p>
          </div>
        </div>
        <Button onClick={fetchTunnels} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Network className="h-4 w-4" /> Toplam Tunnel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tunnels.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" /> Aktif
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {tunnels.filter((t: IPsecTunnel) => t.status === 'up').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Lock className="h-4 w-4" /> Pasif
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {tunnels.filter((t: IPsecTunnel) => t.status !== 'up').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Globe className="h-4 w-4" /> Toplam Bağlantı
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {tunnels.reduce((sum: number, t: IPsecTunnel) => sum + t.connection_count, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tunnel ara..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-10"
          />
        </div>
        <Badge variant="secondary">
          {filteredTunnels.length} sonuç
        </Badge>
      </div>

      {/* Tunnels Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tunnel Adı</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead>Uzak Ağ Geçidi</TableHead>
                <TableHead>Kullanıcı</TableHead>
                <TableHead>Gelen Veri</TableHead>
                <TableHead>Giden Veri</TableHead>
                <TableHead>Bağlantı</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <RefreshCw className="h-8 w-8 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : paginatedTunnels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Tunnel bulunamadı
                  </TableCell>
                </TableRow>
              ) : (
                paginatedTunnels.map((tunnel: IPsecTunnel, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{tunnel.name}</p>
                        {tunnel.comments && (
                          <p className="text-xs text-muted-foreground">{tunnel.comments}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={tunnel.status === 'up' ? 'success' : 'destructive'}>
                        {tunnel.status === 'up' ? 'Aktif' : 'Pasif'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{tunnel.rgwy}</TableCell>
                    <TableCell>{tunnel.username || '-'}</TableCell>
                    <TableCell>{formatBytes(tunnel.incoming_bytes)}</TableCell>
                    <TableCell>{formatBytes(tunnel.outgoing_bytes)}</TableCell>
                    <TableCell>{tunnel.connection_count}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm">
            Sayfa {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
