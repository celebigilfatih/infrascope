'use client';

import React, { useState, useMemo } from 'react';
import { useApi } from '@/lib/hooks/useApi';
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
  X,
  Terminal,
  Globe,
  Clock,
  Cpu,
  FileCode2,
  GitCommit,
  CheckCircle2,
  XCircle,
  Monitor,
  Network,
  Key,
  Tag,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
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
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AdminLog | null>(null);

  // SWR: auto-refresh every 5 min, dedup requests, cache in-memory
  const { data: apiResult, isLoading, mutate: refreshLogs } = useApi<{ success: boolean; data?: AdminLog[]; error?: string }>(
    '/api/integrations/fortianalyzer?type=config-revisions',
    { refreshInterval: 5 * 60 * 1000 },
  );

  // Process SWR data into logs state
  useMemo(() => {
    if (apiResult?.success && Array.isArray(apiResult.data)) {
      const EXCLUDED_USERS = ['siem', 'fgtinfra'];
      setLogs(apiResult.data.filter((log: AdminLog) =>
        !EXCLUDED_USERS.includes((log.user || '').toLowerCase())
      ));
      setError(null);
    } else if (apiResult && !apiResult.success) {
      setError(apiResult.error || 'Veri yüklenemedi');
    }
  }, [apiResult]);

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
        <Button onClick={() => refreshLogs()} variant="outline" disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
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
          {isLoading ? (
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

      {/* Detail Dialog — modern redesign */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden gap-0">
          {selectedLog && (() => {
            const isLogin    = selectedLog.action === 'login';
            const isLogout   = selectedLog.action === 'logout';
            const isDelete   = selectedLog.action === 'Delete';
            const isAdd      = selectedLog.action === 'Add';
            const isMove     = selectedLog.action === 'Move';
            const isConfigOp = !isLogin && !isLogout;
            const isHaDaemon = (selectedLog.ui || '').toLowerCase().startsWith('ha_daemon');

            // Header gradient based on action
            const headerGradient = isLogin
              ? 'from-emerald-600/15 to-emerald-600/5 border-b border-emerald-500/20'
              : isLogout
              ? 'from-orange-600/15 to-orange-600/5 border-b border-orange-500/20'
              : isDelete
              ? 'from-red-600/15 to-red-600/5 border-b border-red-500/20'
              : isAdd
              ? 'from-teal-600/15 to-teal-600/5 border-b border-teal-500/20'
              : 'from-blue-600/15 to-blue-600/5 border-b border-blue-500/20';

            const actionIconEl = isLogin
              ? <LogIn className="h-5 w-5 text-emerald-500" />
              : isLogout
              ? <LogOut className="h-5 w-5 text-orange-500" />
              : isDelete
              ? <XCircle className="h-5 w-5 text-red-500" />
              : isAdd
              ? <CheckCircle2 className="h-5 w-5 text-teal-500" />
              : isMove
              ? <GitCommit className="h-5 w-5 text-violet-500" />
              : <Settings className="h-5 w-5 text-blue-500" />;

            // Parse UI field: "GUI(10.7.7.7)" → { method: 'GUI', ip: '10.7.7.7' }
            const uiRaw = selectedLog.ui || '';
            const uiMatch = uiRaw.match(/^(GUI|SSH|API|console|jsconsole|ha_daemon)(?:\(([^)]+)\))?$/i);
            const uiMethod = uiMatch ? uiMatch[1].toUpperCase() : (uiRaw || null);
            const uiIp     = uiMatch ? uiMatch[2] || null : null;

            const uiIcon = uiMethod === 'SSH'
              ? <Terminal className="h-3.5 w-3.5" />
              : uiMethod === 'API'
              ? <Network className="h-3.5 w-3.5" />
              : uiMethod === 'HA_DAEMON'
              ? <Cpu className="h-3.5 w-3.5" />
              : <Monitor className="h-3.5 w-3.5" />;

            return (
              <div className="flex flex-col max-h-[88vh] overflow-hidden">
                {/* ── Header ─────────────────────────────────────────── */}
                <div className={`bg-gradient-to-r ${headerGradient} px-6 pt-6 pb-5`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* action icon ring */}
                      <div className="shrink-0 h-10 w-10 rounded-full bg-background/80 border flex items-center justify-center shadow-sm">
                        {actionIconEl}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-base font-semibold">{selectedLog.user || '—'}</span>
                          {getActionBadge(selectedLog.action)}
                          {getLevelBadge(selectedLog.level)}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{selectedLog.date} {selectedLog.time}</span>
                          {selectedLog.devname && <span className="flex items-center gap-1"><Server className="h-3 w-3" />{selectedLog.devname}</span>}
                          {uiMethod && !isHaDaemon && (
                            <span className="flex items-center gap-1">{uiIcon}{uiMethod}{uiIp ? ` · ${uiIp}` : ''}</span>
                          )}
                          {isHaDaemon && (
                            <span className="flex items-center gap-1 text-amber-400"><Cpu className="h-3 w-3" />HA Daemon (internal sync)</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Scrollable body ────────────────────────────────── */}
                <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

                  {/* Message + logdesc */}
                  {(selectedLog.msg || selectedLog.logdesc) && (
                    <div className="rounded-lg border bg-muted/30 px-4 py-3 space-y-1">
                      {selectedLog.msg && (
                        <p className="text-sm font-medium">{decodeMsg(selectedLog.msg)}</p>
                      )}
                      {selectedLog.logdesc && (
                        <p className="text-xs text-muted-foreground">{selectedLog.logdesc}</p>
                      )}
                    </div>
                  )}

                  {/* Config change block */}
                  {isConfigOp && selectedLog.cfgpath && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Konfigürasyon Değişikliği</p>
                      <div className="rounded-lg border overflow-hidden">
                        {/* Path row */}
                        <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-muted/20">
                          <FileCode2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wide w-20 shrink-0">Yol</span>
                          <span className="font-mono text-xs">{selectedLog.cfgpath}</span>
                        </div>
                        {/* Object row */}
                        {selectedLog.cfgobj && (
                          <div className="flex items-center gap-3 px-4 py-2.5 border-b last:border-0 bg-muted/10">
                            <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wide w-20 shrink-0">Obje</span>
                            <span className="font-mono text-xs font-semibold">#{selectedLog.cfgobj}</span>
                          </div>
                        )}
                        {/* Attribute row */}
                        {selectedLog.cfgattr && (
                          <div className="flex items-center gap-3 px-4 py-2.5 bg-muted/10">
                            <Key className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wide w-20 shrink-0">Değişiklik</span>
                            <span className="font-mono text-xs break-all">{decodeMsg(selectedLog.cfgattr)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Network / Session info */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Bağlantı Bilgisi</p>
                    <div className="grid grid-cols-2 gap-3">
                      {/* Source IP */}
                      <div className="rounded-lg border px-4 py-3 space-y-1">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Kaynak IP</p>
                        {selectedLog.srcip ? (
                          <span className="inline-flex items-center gap-1.5 font-mono text-sm">
                            <Globe className="h-3.5 w-3.5 text-blue-400" />
                            {selectedLog.srcip}
                          </span>
                        ) : <p className="text-muted-foreground text-sm">—</p>}
                      </div>
                      {/* Dest IP */}
                      <div className="rounded-lg border px-4 py-3 space-y-1">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Hedef IP</p>
                        {selectedLog.dstip ? (
                          <span className="inline-flex items-center gap-1.5 font-mono text-sm">
                            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                            {selectedLog.dstip}
                          </span>
                        ) : <p className="text-muted-foreground text-sm">—</p>}
                      </div>
                      {/* Access method */}
                      <div className="rounded-lg border px-4 py-3 space-y-1">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Erişim Yöntemi</p>
                        {uiMethod ? (
                          <span className="inline-flex items-center gap-1.5 text-sm">
                            {uiIcon}
                            <span className="font-medium">{uiMethod}</span>
                            {uiIp && <span className="text-muted-foreground text-xs">· {uiIp}</span>}
                          </span>
                        ) : <p className="text-muted-foreground text-sm">—</p>}
                      </div>
                      {/* Status */}
                      <div className="rounded-lg border px-4 py-3 space-y-1">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Sonuç</p>
                        {selectedLog.status ? (
                          <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${
                            selectedLog.status === 'success' ? 'text-emerald-500' :
                            selectedLog.status === 'failed'  ? 'text-red-500' : ''
                          }`}>
                            {selectedLog.status === 'success' ? <CheckCircle2 className="h-3.5 w-3.5" /> :
                             selectedLog.status === 'failed'  ? <XCircle className="h-3.5 w-3.5" /> : null}
                            {selectedLog.status}
                          </span>
                        ) : <p className="text-muted-foreground text-sm">—</p>}
                      </div>
                    </div>
                  </div>

                  {/* Device */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Cihaz</p>
                    <div className="rounded-lg border overflow-hidden">
                      <table className="w-full text-sm">
                        <tbody>
                          <tr className="border-b">
                            <td className="px-4 py-2.5 text-muted-foreground w-[35%] bg-muted/20 text-xs">Ad</td>
                            <td className="px-4 py-2.5 font-medium">{selectedLog.devname || '—'}</td>
                          </tr>
                          <tr className="border-b last:border-0">
                            <td className="px-4 py-2.5 text-muted-foreground bg-muted/20 text-xs">ID</td>
                            <td className="px-4 py-2.5 font-mono text-xs">{selectedLog.devid || '—'}</td>
                          </tr>
                          {selectedLog.profile && (
                            <tr>
                              <td className="px-4 py-2.5 text-muted-foreground bg-muted/20 text-xs">Profil</td>
                              <td className="px-4 py-2.5">{selectedLog.profile}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Reason */}
                  {selectedLog.reason && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Sebep</p>
                      <div className="rounded-lg border px-4 py-3 text-sm">{selectedLog.reason}</div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}