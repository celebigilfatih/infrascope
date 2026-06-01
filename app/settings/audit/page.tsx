'use client';

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
  { value: 'all', label: 'All Resources' },
  { value: 'user', label: 'Users' },
  { value: 'alarm', label: 'Alarms' },
  { value: 'device', label: 'Devices' },
  { value: 'permission', label: 'Permissions' },
  { value: 'settings', label: 'Settings' },
];

function getActionBadgeVariant(action: string): 'default' | 'destructive' | 'secondary' | 'outline' {
  if (action.includes('delete')) return 'destructive';
  if (action.includes('create')) return 'default';
  if (action.includes('update') || action.includes('edit')) return 'secondary';
  return 'outline';
}

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  return date.toLocaleString();
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
      if (searchAction) params.set('action', searchAction);
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
    if (searchAction) params.set('action', searchAction);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Audit Log
          </h1>
          <p className="text-muted-foreground">Track all user actions and system events</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => fetchLogs(pagination.page)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
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
              <p className="text-sm text-muted-foreground">Total Events</p>
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
              <p className="text-sm text-muted-foreground">Delete Actions</p>
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
              <p className="text-sm text-muted-foreground">Unique Users</p>
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
              <p className="text-sm text-muted-foreground">Last 24h</p>
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
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search action..."
                value={searchAction}
                onChange={(e) => setSearchAction(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={resourceFilter} onValueChange={setResourceFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Resource" />
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
              placeholder="User ID..."
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
                <Button variant="ghost" size="icon" onClick={clearFilters} title="Clear filters">
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
                <TableHead className="w-[180px]">Timestamp</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>User</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Loading audit logs...
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No audit logs found.
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
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm capitalize">{log.resource || '-'}</span>
                      {log.resourceId && (
                        <span className="text-xs text-muted-foreground ml-1">
                          ({log.resourceId.slice(0, 8)}...)
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm">{log.userName}</p>
                        {log.userRole && (
                          <Badge variant="outline" className="text-[10px] mt-0.5 capitalize">
                            {log.userRole}
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
            Showing {((pagination.page - 1) * pagination.pageSize) + 1} -{' '}
            {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{' '}
            {pagination.total} entries
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => fetchLogs(pagination.page - 1)}
              disabled={pagination.page <= 1 || loading}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => fetchLogs(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages || loading}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
