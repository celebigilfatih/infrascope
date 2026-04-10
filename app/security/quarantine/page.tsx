'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Shield,
  Search,
  RefreshCw,
  AlertTriangle,
  Clock,
  Plus,
  AlertCircle,
  Lock,
  Unlock,
  Server,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface QuarantinedIP {
  id: string;
  ip: string;
  ipv6?: string;
  created: string | null;
  expires: string | null;
  source: string;
  service: string;
  comment: string;
  status: string;
  vdom: string;
  interface: string;
}

const ITEMS_PER_PAGE = 20;

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function expiryBadge(expires: string | null) {
  if (!expires) return <Badge variant="outline">Kalıcı</Badge>;
  const diff = new Date(expires).getTime() - Date.now();
  const hours = diff / 3600000;
  if (diff < 0) return <Badge variant="secondary">Süresi Dolmuş</Badge>;
  if (hours < 1) return <Badge variant="destructive">&lt; 1 saat</Badge>;
  if (hours < 24) return <Badge className="bg-orange-500 text-white">{Math.round(hours)}s</Badge>;
  return <Badge className="bg-blue-500 text-white">{Math.round(hours / 24)}g</Badge>;
}

function sourceBadge(source: string) {
  const s = source.toLowerCase();
  if (s === 'manual') return <Badge className="bg-slate-600 text-white">Manuel</Badge>;
  if (s.includes('ips') || s.includes('intrusion')) return <Badge variant="destructive">IPS</Badge>;
  if (s.includes('av') || s.includes('virus')) return <Badge className="bg-purple-600 text-white">AV</Badge>;
  if (s.includes('dos')) return <Badge className="bg-orange-600 text-white">DoS</Badge>;
  return <Badge variant="outline">{source}</Badge>;
}

export default function QuarantinePage() {
  const [data, setData] = useState<QuarantinedIP[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Add IP form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newIp, setNewIp] = useState('');
  const [newExpiry, setNewExpiry] = useState('');
  const [newComment, setNewComment] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/security/quarantine');
      const json = await res.json();
      if (json.success) {
        setData(json.data || []);
      } else {
        setError(json.error || 'Veri alınamadı');
      }
    } catch {
      setError('API bağlantı hatası');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter(d =>
      d.ip.includes(q) ||
      (d.ipv6 || '').toLowerCase().includes(q) ||
      d.source.toLowerCase().includes(q) ||
      d.service.toLowerCase().includes(q) ||
      d.comment.toLowerCase().includes(q) ||
      d.vdom.toLowerCase().includes(q)
    );
  }, [data, search]);

  useEffect(() => { setCurrentPage(1); }, [search]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const handleRelease = async (ip: string) => {
    if (!confirm(`${ip} adresini karantinadan çıkarmak istediğinize emin misiniz?`)) return;
    try {
      const res = await fetch(`/api/security/quarantine?ip=${encodeURIComponent(ip)}`, { method: 'DELETE' });
      const json = await res.json();
      setActionMsg({ type: json.success ? 'ok' : 'err', text: json.message || json.error });
      if (json.success) fetchData();
    } catch {
      setActionMsg({ type: 'err', text: 'İstek başarısız' });
    }
    setTimeout(() => setActionMsg(null), 4000);
  };

  const handleAddIP = async () => {
    if (!newIp.trim()) return;
    setAddLoading(true);
    try {
      const res = await fetch('/api/security/quarantine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: newIp.trim(),
          expiry_hours: newExpiry ? parseInt(newExpiry, 10) : undefined,
          comment: newComment.trim() || undefined,
        }),
      });
      const json = await res.json();
      setActionMsg({ type: json.success ? 'ok' : 'err', text: json.message || json.error });
      if (json.success) {
        setNewIp(''); setNewExpiry(''); setNewComment('');
        setShowAddForm(false);
        fetchData();
      }
    } catch {
      setActionMsg({ type: 'err', text: 'İstek başarısız' });
    } finally {
      setAddLoading(false);
    }
    setTimeout(() => setActionMsg(null), 4000);
  };

  const permanentCount = data.filter(d => !d.expires).length;
  const expiredCount = data.filter(d => d.expires && new Date(d.expires) < new Date()).length;
  const autoCount = data.filter(d => d.source.toLowerCase() !== 'manual').length;

  return (
    <div className="space-y-4 p-4 max-w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Lock className="h-8 w-8 text-red-500" />
          <div>
            <h1 className="text-2xl font-bold">Firewall Karantina</h1>
            <p className="text-sm text-muted-foreground">
              FortiGate tarafından karantinaya alınmış IP adresleri
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowAddForm(v => !v)}>
            <Plus className="h-4 w-4 mr-1" />
            IP Ekle
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        </div>
      </div>

      {/* Action message */}
      {actionMsg && (
        <div className={`flex items-center gap-2 p-3 rounded-md text-sm ${
          actionMsg.type === 'ok' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {actionMsg.type === 'ok' ? <Shield className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {actionMsg.text}
        </div>
      )}

      {/* Add form */}
      {showAddForm && (
        <Card className="border-blue-200 bg-blue-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Yeni IP Karantinaya Al
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">IP Adresi *</label>
                <Input placeholder="192.168.1.100" value={newIp} onChange={e => setNewIp(e.target.value)}
                  className="w-44 h-8 text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Süre (saat, boş=kalıcı)</label>
                <Input placeholder="24" type="number" value={newExpiry} onChange={e => setNewExpiry(e.target.value)}
                  className="w-28 h-8 text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Yorum</label>
                <Input placeholder="Sebebi..." value={newComment} onChange={e => setNewComment(e.target.value)}
                  className="w-56 h-8 text-sm" />
              </div>
              <Button size="sm" onClick={handleAddIP} disabled={addLoading || !newIp.trim()}
                className="h-8">
                {addLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Lock className="h-3 w-3 mr-1" />}
                Karantinaya Al
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => setShowAddForm(false)}>İptal</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-3">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-red-500" />
            <div><p className="text-xs text-muted-foreground">Toplam Karantina</p>
              <p className="text-2xl font-bold text-red-600">{data.length}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            <div><p className="text-xs text-muted-foreground">Otomatik (IPS/AV)</p>
              <p className="text-2xl font-bold">{autoCount}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-slate-500" />
            <div><p className="text-xs text-muted-foreground">Manuel</p>
              <p className="text-2xl font-bold">{data.length - autoCount}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-500" />
            <div><p className="text-xs text-muted-foreground">Kalıcı / Süresi Dolmuş</p>
              <p className="text-2xl font-bold">{permanentCount} / {expiredCount}</p></div>
          </div>
        </CardContent></Card>
      </div>

      {/* Error */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-3 flex items-center gap-2 text-red-600">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{error}</span>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="h-4 w-4 text-red-500" />
              Karantina Listesi
              <Badge variant="secondary">{filtered.length}</Badge>
            </CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="IP, kaynak ara..." className="pl-8 h-8 text-sm"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">IP Adresi</TableHead>
                    <TableHead className="whitespace-nowrap">Kaynak</TableHead>
                    <TableHead className="whitespace-nowrap">Karantina Tarihi</TableHead>
                    <TableHead className="whitespace-nowrap">Süre</TableHead>
                    <TableHead className="whitespace-nowrap">VDOM</TableHead>
                    <TableHead className="whitespace-nowrap w-24">İşlem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                        {search ? 'Aramayla eşleşen kayıt bulunamadı' : (
                          <div className="flex flex-col items-center gap-2">
                            <Unlock className="h-8 w-8 text-green-500" />
                            <span>Karantinada IP bulunmuyor</span>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginated.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono font-semibold whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <Lock className="h-3 w-3 text-red-400 shrink-0" />
                            {entry.ip}
                          </div>
                          {entry.ipv6 && <div className="text-xs text-muted-foreground font-mono">{entry.ipv6}</div>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{sourceBadge(entry.source)}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap font-mono text-muted-foreground">
                          {formatDateTime(entry.created)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {expiryBadge(entry.expires)}
                          {entry.expires && (
                            <div className="text-xs text-muted-foreground font-mono mt-0.5">
                              {formatDateTime(entry.expires)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <Server className="h-3 w-3 text-muted-foreground" />
                            {entry.vdom}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs border-red-200 hover:bg-red-50 hover:text-red-600"
                            onClick={() => handleRelease(entry.ip)}
                          >
                            <Unlock className="h-3 w-3 mr-1" />
                            Serbest
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-sm text-muted-foreground">
                    Sayfa {currentPage} / {totalPages} ({filtered.length} kayıt)
                  </p>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-8 w-8"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}>
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
