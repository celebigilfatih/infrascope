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
import { ChevronLeft, ChevronRight, RefreshCw, Search, FileText, User, Activity } from 'lucide-react';

interface AuditChange {
  id: string;
  entity: string;
  action: 'create' | 'update' | 'delete';
  field: string;
  oldValue: string;
  newValue: string;
  user: string;
  timestamp: string;
  severity: 'low' | 'medium' | 'high';
}

const ITEMS_PER_PAGE = 10;

export default function ChangesPage() {
  const [changes, setChanges] = useState<AuditChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setTimeout(() => {
      setChanges([
        { id: '1', entity: 'Device', action: 'update', field: 'status', oldValue: 'offline', newValue: 'online', user: 'admin', timestamp: '2024-01-15 10:30:25', severity: 'medium' },
        { id: '2', entity: 'Building', action: 'create', field: 'location', oldValue: '-', newValue: 'Building C - Server Room', user: 'operator', timestamp: '2024-01-15 10:28:10', severity: 'low' },
        { id: '3', entity: 'Rack', action: 'update', field: 'power_capacity', oldValue: '10kW', newValue: '15kW', user: 'engineer', timestamp: '2024-01-15 10:25:45', severity: 'medium' },
        { id: '4', entity: 'User', action: 'delete', field: 'account', oldValue: 'john.doe@company.com', newValue: '-', user: 'admin', timestamp: '2024-01-15 10:20:30', severity: 'high' },
        { id: '5', entity: 'Service', action: 'update', field: 'version', oldValue: '2.1.0', newValue: '2.2.0', user: 'devops', timestamp: '2024-01-15 10:15:18', severity: 'low' },
        { id: '6', entity: 'Network', action: 'update', field: 'vlan_id', oldValue: '100', newValue: '200', user: 'network_admin', timestamp: '2024-01-15 10:10:55', severity: 'medium' },
        { id: '7', entity: 'Device', action: 'update', field: 'firmware', oldValue: 'v3.1', newValue: 'v3.2', user: 'admin', timestamp: '2024-01-15 10:05:40', severity: 'low' },
        { id: '8', entity: 'Floor', action: 'create', field: 'floor_plan', oldValue: '-', newValue: 'floor_3_layout.png', user: 'operator', timestamp: '2024-01-15 09:58:22', severity: 'low' },
        { id: '9', entity: 'Policy', action: 'update', field: 'access_level', oldValue: 'read-only', newValue: 'read-write', user: 'security_admin', timestamp: '2024-01-15 09:52:15', severity: 'high' },
        { id: '10', entity: 'Alert', action: 'create', field: 'threshold', oldValue: '-', newValue: 'CPU > 90%', user: 'monitoring', timestamp: '2024-01-15 09:45:30', severity: 'medium' },
        { id: '11', entity: 'Device', action: 'delete', field: 'asset', oldValue: 'SRV-001', newValue: '-', user: 'admin', timestamp: '2024-01-15 09:38:12', severity: 'high' },
        { id: '12', entity: 'Backup', action: 'create', field: 'schedule', oldValue: '-', newValue: 'Daily 02:00', user: 'backup_admin', timestamp: '2024-01-15 09:30:00', severity: 'low' },
      ]);
      setLoading(false);
    }, 500);
  }, []);

  const filteredChanges = useMemo(() => {
    if (!searchTerm) return changes;
    const term = searchTerm.toLowerCase();
    return changes.filter(change => 
      change.entity.toLowerCase().includes(term) ||
      change.action.toLowerCase().includes(term) ||
      change.user.toLowerCase().includes(term) ||
      change.field.toLowerCase().includes(term)
    );
  }, [changes, searchTerm]);

  const totalPages = Math.ceil(filteredChanges.length / ITEMS_PER_PAGE);
  const paginatedChanges = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredChanges.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredChanges, currentPage]);

  useEffect(() => { if (currentPage > totalPages && totalPages > 0) setCurrentPage(1); }, [totalPages, currentPage]);

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'create': return <Badge className="bg-green-500">Create</Badge>;
      case 'update': return <Badge className="bg-blue-500">Update</Badge>;
      case 'delete': return <Badge variant="destructive">Delete</Badge>;
      default: return <Badge variant="secondary">{action}</Badge>;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'high': return <Badge variant="destructive">High</Badge>;
      case 'medium': return <Badge className="bg-orange-500">Medium</Badge>;
      case 'low': return <Badge className="bg-green-500">Low</Badge>;
      default: return <Badge variant="secondary">{severity}</Badge>;
    }
  };

  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = 5;
    if (totalPages <= maxVisible) { for (let i = 1; i <= totalPages; i++) pages.push(i); }
    else {
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

  const createCount = changes.filter(c => c.action === 'create').length;
  const updateCount = changes.filter(c => c.action === 'update').length;
  const deleteCount = changes.filter(c => c.action === 'delete').length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Audit Changes</h1>
          <p className="text-muted-foreground">Değişiklik takibi ve audit log</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon"><RefreshCw className="h-4 w-4" /></Button>
          <Button><FileText className="h-4 w-4 mr-2" />Yenile</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-500/20"><Activity className="h-5 w-5 text-blue-500" /></div>
              <div><p className="text-sm text-muted-foreground">Toplam Değişiklik</p><p className="text-2xl font-bold">{changes.length}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-500/20"><FileText className="h-5 w-5 text-green-500" /></div>
              <div><p className="text-sm text-muted-foreground">Oluşturulan</p><p className="text-2xl font-bold">{createCount}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-orange-500/20"><Activity className="h-5 w-5 text-orange-500" /></div>
              <div><p className="text-sm text-muted-foreground">Güncellenen</p><p className="text-2xl font-bold">{updateCount}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-red-500/20"><Activity className="h-5 w-5 text-red-500" /></div>
              <div><p className="text-sm text-muted-foreground">Silinen</p><p className="text-2xl font-bold">{deleteCount}</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Değişiklik ara..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} className="pl-9" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Audit Changes<Badge variant="secondary">{filteredChanges.length}</Badge></CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Zaman</TableHead>
                    <TableHead>Kullanıcı</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Alan</TableHead>
                    <TableHead>Eski Değer</TableHead>
                    <TableHead>Yeni Değer</TableHead>
                    <TableHead>İşlem</TableHead>
                    <TableHead>Önem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedChanges.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Sonuç bulunamadı</TableCell></TableRow>
                  ) : (
                    paginatedChanges.map((change) => (
                      <TableRow key={change.id}>
                        <TableCell className="font-mono text-sm">{change.timestamp}</TableCell>
                        <TableCell><div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" />{change.user}</div></TableCell>
                        <TableCell className="font-medium">{change.entity}</TableCell>
                        <TableCell className="font-mono text-sm">{change.field}</TableCell>
                        <TableCell className="text-muted-foreground max-w-xs truncate" title={change.oldValue}>{change.oldValue}</TableCell>
                        <TableCell className="max-w-xs truncate" title={change.newValue}>{change.newValue}</TableCell>
                        <TableCell>{getActionBadge(change.action)}</TableCell>
                        <TableCell>{getSeverityBadge(change.severity)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">Sayfa {currentPage} / {totalPages}</p>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft className="h-4 w-4" /></Button>
                    {getPageNumbers().map((page, idx) => (
                      <React.Fragment key={idx}>
                        {page === 'ellipsis' ? <span className="px-2 text-muted-foreground">...</span> : (
                          <Button variant={currentPage === page ? 'default' : 'outline'} size="sm" onClick={() => setCurrentPage(page)} className="w-9">{page}</Button>
                        )}
                      </React.Fragment>
                    ))}
                    <Button variant="outline" size="icon" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight className="h-4 w-4" /></Button>
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
