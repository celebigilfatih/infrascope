'use client';

import { uiLabel, auditActionLabel, auditActionQuery } from '@/lib/i18n/tr';

import { PageHeading } from '@/components/ui/page-heading';
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  RefreshCw,
  Download,
  Search,
  Shield,
  Filter,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  FileText,
} from 'lucide-react';

interface AuditLogEntry {
  id: string;
  action: string;
  resource: string | null;
  resourceId: string | null;
  details: Record<string, unknown> | null;
  userId: string | null;
  userName: string;
  userEmail: string | null;
  userRole: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  timestamp: string;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const RESOURCE_OPTIONS = [
  { value: 'all', label: "Tüm Kaynaklar" },
  { value: 'user', label: "Kullanıcılar" },
  { value: 'alarm', label: "Alarmlar" },
  { value: 'device', label: "Cihazlar" },
  { value: 'permission', label: "Yetkiler" },
  { value: 'settings', label: "Ayarlar" },
];

function getActionBadgeVariant(action: string): 'default' | 'destructive' | 'secondary' | 'outline' {
  if (action.includes('delete')) return 'destructive';
  if (action.includes('create')) return 'default';
  if (action.includes('update') || action.includes('edit')) return 'secondary';
  return 'outline';
}

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  return date.toLocaleString('tr-TR');
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 25, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchAction, setSearchAction] = useState('');
  const [resourceFilter, setResourceFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchLogs = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '25' });
      if (searchAction) params.set('action', auditActionQuery(searchAction));
      if (resourceFilter !== 'all') params.set('resource', resourceFilter);
      if (userFilter) params.set('userId', userFilter);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const response = await fetch(`/api/audit?${params}`);
      const result = await response.json();
      if (result.success) {
        setLogs(result.data);
        setPagination(result.pagination);
      }
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    } finally {
      setLoading(false);
    }
  }, [searchAction, resourceFilter, userFilter, startDate, endDate]);

  useEffect(() => {
    fetchLogs(1);
  }, [fetchLogs]);

  const handleExport = () => {
    const params = new URLSearchParams();
    if (searchAction) params.set('action', auditActionQuery(searchAction));
    if (resourceFilter !== 'all') params.set('resource', resourceFilter);
    if (userFilter) params.set('userId', userFilter);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);

    window.open(`/api/audit/export?${params}`, '_blank');
  };

  const clearFilters = () => {
    setSearchAction('');
    setResourceFilter('all');
    setUserFilter('');
    setStartDate('');
    setEndDate('');
  };

  const hasActiveFilters = searchAction || resourceFilter !== 'all' || userFilter || startDate || endDate;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between max-md:flex-col max-md:items-stretch max-md:gap-4">
        <div>
          <PageHeading section="audit" description={<>Kullanıcı işlemlerini ve sistem olaylarını takip edin</>}>

            Denetim Kayıtları
          </PageHeading>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => fetchLogs(pagination.page)} disabled={loading} aria-label="Yenile">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            CSV İndir
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Toplam Olay</p>
              <p className="text-2xl font-bold">{pagination.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
              <Shield className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Silme İşlemleri</p>
              <p className="text-2xl font-bold">
                {logs.filter((l) => l.action.includes('delete')).length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
              <User className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Benzersiz Kullanıcılar</p>
              <p className="text-2xl font-bold">
                {new Set(logs.filter((l) => l.userId).map((l) => l.userId)).size}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
              <Clock className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Son 24 Saat</p>
              <p className="text-2xl font-bold">
                {logs.filter((l) => {
                  const ts = new Date(l.timestamp);
                  return Date.now() - ts.getTime() < 86400000;
                }).length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filtreler
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="İşlem ara…"
                value={searchAction}
                onChange={(e) => setSearchAction(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={resourceFilter} onValueChange={setResourceFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Kaynak" />
              </SelectTrigger>
              <SelectContent>
                {RESOURCE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Kullanıcı kimliği…"
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
            />
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <div className="flex gap-2">
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="flex-1"
              />
              {hasActiveFilters && (
                <Button variant="ghost" size="icon" onClick={clearFilters} title="Filtreleri temizle" aria-label="Filtreleri temizle">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Log Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">Tarih ve Saat</TableHead>
                <TableHead>İşlem</TableHead>
                <TableHead>Kaynak</TableHead>
                <TableHead>Kullanıcı</TableHead>
                <TableHead>IP Adresi</TableHead>
                <TableHead>Detaylar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Denetim kayıtları yükleniyor…
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Denetim kaydı bulunamadı.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatTimestamp(log.timestamp)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getActionBadgeVariant(log.action)} className="text-xs">
                        {auditActionLabel(log.action)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm capitalize">{uiLabel(log.resource)}</span>
                      {log.resourceId && (
                        <span className="text-xs text-muted-foreground ml-1">
                          ({log.resourceId.slice(0, 8)}...)
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm">{!log.userId && log.userName === 'System' ? 'Sistem' : log.userName}</p>
                        {log.userRole && (
                          <Badge variant="outline" className="text-[10px] mt-0.5 capitalize">
                            {uiLabel(log.userRole)}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {log.ipAddress || '-'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {log.details ? JSON.stringify(log.details) : '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Gösterilen {((pagination.page - 1) * pagination.pageSize) + 1} -{' '}
            {Math.min(pagination.page * pagination.pageSize, pagination.total)} /{' '}
            {pagination.total} kayıt
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => fetchLogs(pagination.page - 1)}
              disabled={pagination.page <= 1 || loading}
             aria-label="Önceki sayfa">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              Sayfa {pagination.page} / {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => fetchLogs(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages || loading}
             aria-label="Sonraki sayfa">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
