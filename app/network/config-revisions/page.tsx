'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
import {
  History,
  User,
  Search,
  RefreshCw,
  AlertCircle,
  LogIn,
  LogOut,
  Settings,
  Shield,
  Server,
  ChevronLeft,
  ChevronRight,
  Eye,
  X
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface AdminLog {
  id?: string;
  date?: string;
  time?: string;
  user?: string;
  action?: string;
  msg?: string;
  logdesc?: string;
  srcip?: string;
  dstip?: string;
  status?: string;
  level?: string;
  ui?: string;
  method?: string;
  profile?: string;
  devname?: string;
  devid?: string;
  reason?: string;
  cfgpath?: string;
  cfgattr?: string;
  cfgobj?: string;
}

const ITEMS_PER_PAGE = 15;

export default function ConfigRevisionsPage() {
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AdminLog | null>(null);

  useEffect(() => {
    fetchAdminLogs();
    const interval = setInterval(fetchAdminLogs, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchAdminLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/integrations/fortianalyzer?type=config-revisions');
      const result = await response.json();
      if (result.success && Array.isArray(result.data)) {
        // Exclude service accounts — automated log collection noise
        const EXCLUDED_USERS = ['siem', 'fgtinfra'];
        setLogs(result.data.filter((log: AdminLog) =>
          !EXCLUDED_USERS.includes((log.user || '').toLowerCase())
        ));
      } else {
        setError(result.error || 'Veri yüklenemedi');
      }
    } catch (err) {
      setError('Admin logları yüklenemedi');
      console.error('Failed to fetch admin logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = useMemo(() => {
    if (!searchTerm) return logs;
    const term = searchTerm.toLowerCase();
    return logs.filter(log =>
      (log.user || '').toLowerCase().includes(term) ||
      (log.action || '').toLowerCase().includes(term) ||
      (log.logdesc || '').toLowerCase().includes(term) ||
      (log.devname || '').toLowerCase().includes(term) ||
      (log.srcip || '').toLowerCase().includes(term)
    );
  }, [logs, searchTerm]);

  const totalPages = Math.ceil(filteredLogs.length / ITEMS_PER_PAGE);
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredLogs.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredLogs, currentPage]);

  const loginCount = useMemo(() => logs.filter(l => l.action === 'login').length, [logs]);
  const logoutCount = useMemo(() => logs.filter(l => l.action === 'logout').length, [logs]);
  const configChangeCount = useMemo(() => logs.filter(l =>
    l.action !== 'login' && l.action !== 'logout' && l.action !== 'perf-stats'
  ).length, [logs]);
  const uniqueAdmins = useMemo(() => [...new Set(logs.map(l => l.user).filter(Boolean))], [logs]);
  const uniqueDevices = useMemo(() => [...new Set(logs.map(l => l.devname).filter(Boolean))], [logs]);

  const getActionIcon = (action?: string) => {
    switch (action) {
      case 'login': return <LogIn className="h-4 w-4 text-green-500" />;
      case 'logout': return <LogOut className="h-4 w-4 text-orange-500" />;
      default: return <Settings className="h-4 w-4 text-blue-500" />;
    }
  };

  const actionTranslations: Record<string, { label: string; color: string }> = {
    'login': { label: 'Giriş', color: 'bg-green-600' },
    'logout': { label: 'Çıkış', color: 'bg-orange-600' },
    'Edit': { label: 'Düzenleme', color: 'bg-blue-600' },
    'Add': { label: 'Ekleme', color: 'bg-emerald-600' },
    'Delete': { label: 'Silme', color: 'bg-red-600' },
    'Move': { label: 'Taşıma', color: 'bg-violet-600' },
    'Clone': { label: 'Kopyalama', color: 'bg-indigo-600' },
    'backup': { label: 'Yedekleme', color: 'bg-teal-600' },
    'restore': { label: 'Geri Yükleme', color: 'bg-amber-600' },
    'upgrade': { label: 'Güncelleme', color: 'bg-cyan-600' },
    'reboot': { label: 'Yeniden Başlatma', color: 'bg-red-500' },
    'shutdown': { label: 'Kapatma', color: 'bg-red-700' },
    'config-change': { label: 'Konfig Değişikliği', color: 'bg-blue-500' },
  };

  const getActionBadge = (action?: string) => {
    const tr = action ? actionTranslations[action] : undefined;
    if (tr) return <Badge className={tr.color}>{tr.label}</Badge>;
    return <Badge className="bg-slate-600">{action || 'Bilinmiyor'}</Badge>;
  };

  const getLevelBadge = (level?: string) => {
    switch (level) {
      case 'warning': return <Badge variant="destructive">Uyarı</Badge>;
      case 'alert': return <Badge variant="destructive">Alarm</Badge>;
      case 'information': return <Badge variant="secondary">Bilgi</Badge>;
      case 'notice': return <Badge variant="outline">Bildirim</Badge>;
      default: return <Badge variant="outline">{level || '-'}</Badge>;
    }
  };

  const decodeMsg = (msg?: string) => {
    if (!msg) return '-';
    try { return decodeURIComponent(msg); } catch { return msg; }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Admin İşlem Logları</h1>
          <p className="text-muted-foreground">
            FortiGate üzerindeki admin kullanıcı işlemleri (giriş/çıkış, konfigürasyon değişiklikleri)
          </p>
        </div>
        <Button onClick={fetchAdminLogs} variant="outline" disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-blue-500/20"><History className="h-5 w-5 text-blue-500" /></div>
            <div><p className="text-sm text-muted-foreground">Toplam Log</p><p className="text-2xl font-bold">{logs.length}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-green-500/20"><LogIn className="h-5 w-5 text-green-500" /></div>
            <div><p className="text-sm text-muted-foreground">Giriş</p><p className="text-2xl font-bold">{loginCount}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-orange-500/20"><LogOut className="h-5 w-5 text-orange-500" /></div>
            <div><p className="text-sm text-muted-foreground">Çıkış</p><p className="text-2xl font-bold">{logoutCount}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-purple-500/20"><User className="h-5 w-5 text-purple-500" /></div>
            <div><p className="text-sm text-muted-foreground">Admin Sayısı</p><p className="text-2xl font-bold">{uniqueAdmins.length}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-cyan-500/20"><Server className="h-5 w-5 text-cyan-500" /></div>
            <div><p className="text-sm text-muted-foreground">Cihaz</p><p className="text-2xl font-bold">{uniqueDevices.length}</p></div>
          </div>
        </CardContent></Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Admin, işlem, cihaz veya IP ara..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} className="pl-9" />
      </div>

      {/* Log Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Admin İşlem Geçmişi
            <Badge variant="secondary">{filteredLogs.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-primary" /></div>
          ) : error ? (
            <div className="flex items-center gap-2 p-4 bg-destructive/10 rounded-lg">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <span className="text-destructive">{error}</span>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Tarih</TableHead>
                    <TableHead className="w-16">Saat</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>İşlem</TableHead>
                    <TableHead>Açıklama</TableHead>
                    <TableHead>Kaynak IP</TableHead>
                    <TableHead>Cihaz</TableHead>
                    <TableHead>Seviye</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Admin logu bulunamadı</TableCell>
                    </TableRow>
                  ) : (
                    paginatedLogs.map((log, idx) => (
                      <TableRow key={log.id || idx}>
                        <TableCell className="text-xs">{log.date || '-'}</TableCell>
                        <TableCell className="text-xs font-mono">{log.time || '-'}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getActionIcon(log.action)}
                            <span className="font-medium">{log.user || '-'}</span>
                          </div>
                          {log.ui && <div className="text-xs text-muted-foreground">{log.ui}</div>}
                        </TableCell>
                        <TableCell>{getActionBadge(log.action)}</TableCell>
                        <TableCell className="max-w-xs">
                          <div className="text-sm truncate" title={decodeMsg(log.msg)}>{decodeMsg(log.msg)}</div>
                          {log.logdesc && <div className="text-xs text-muted-foreground">{log.logdesc}</div>}
                        </TableCell>
                        <TableCell className="text-xs font-mono">{log.srcip || '-'}</TableCell>
                        <TableCell className="text-xs">{log.devname || '-'}</TableCell>
                        <TableCell>{getLevelBadge(log.level)}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setSelectedLog(log)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">Sayfa {currentPage} / {totalPages} ({filteredLogs.length} kayıt)</p>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft className="h-4 w-4" /></Button>
                    <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight className="h-4 w-4" /></Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Log Detayı
            </DialogTitle>
            <DialogDescription>
              {selectedLog?.date} {selectedLog?.time}
            </DialogDescription>
          </DialogHeader>
          
          {selectedLog && (
            <div className="space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Admin Kullanıcısı</label>
                  <div className="flex items-center gap-2">
                    {getActionIcon(selectedLog.action)}
                    <span className="font-medium">{selectedLog.user || '-'}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">İşlem</label>
                  <div>{getActionBadge(selectedLog.action)}</div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Kaynak IP</label>
                  <p className="font-mono text-sm">{selectedLog.srcip || '-'}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Hedef IP</label>
                  <p className="font-mono text-sm">{selectedLog.dstip || '-'}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Cihaz</label>
                  <p className="text-sm">{selectedLog.devname || '-'}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Cihaz ID</label>
                  <p className="font-mono text-xs">{selectedLog.devid || '-'}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Arayüz</label>
                  <p className="text-sm">{selectedLog.ui || '-'}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Metod</label>
                  <p className="text-sm">{selectedLog.method || '-'}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Seviye</label>
                  <div>{getLevelBadge(selectedLog.level)}</div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Durum</label>
                  <p className="text-sm">{selectedLog.status || '-'}</p>
                </div>
              </div>

              {/* Message */}
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Açıklama (Message)</label>
                <div className="bg-muted/50 p-3 rounded-lg text-sm whitespace-pre-wrap break-all">
                  {decodeMsg(selectedLog.msg)}
                </div>
              </div>

              {/* Log Description */}
              {selectedLog.logdesc && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Log Açıklaması</label>
                  <p className="text-sm">{selectedLog.logdesc}</p>
                </div>
              )}

              {/* Config Path */}
              {selectedLog.cfgpath && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Konfigürasyon Yolu</label>
                  <p className="font-mono text-xs bg-muted/50 p-2 rounded">{selectedLog.cfgpath}</p>
                </div>
              )}

              {/* Config Attribute */}
              {selectedLog.cfgattr && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Konfigürasyon Attribute</label>
                  <p className="font-mono text-xs bg-muted/50 p-2 rounded">{selectedLog.cfgattr}</p>
                </div>
              )}

              {/* Config Object */}
              {selectedLog.cfgobj && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Konfigürasyon Objesi</label>
                  <p className="font-mono text-xs bg-muted/50 p-2 rounded">{selectedLog.cfgobj}</p>
                </div>
              )}

              {/* Profile */}
              {selectedLog.profile && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Profil</label>
                  <p className="text-sm">{selectedLog.profile}</p>
                </div>
              )}

              {/* Reason */}
              {selectedLog.reason && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Sebep</label>
                  <p className="text-sm">{selectedLog.reason}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}