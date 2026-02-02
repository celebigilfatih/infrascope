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
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { RefreshCw, Plus, Clock, Trash2, RotateCcw, Search, Database } from 'lucide-react';

interface Snapshot {
  id: string;
  name: string;
  vmName: string;
  description: string;
  createdAt: string;
  sizeGB: number;
  type: 'manual' | 'scheduled' | 'backup';
}

const ITEMS_PER_PAGE = 10;

export default function SnapshotsPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setTimeout(() => {
      setSnapshots([
        { id: '1', name: 'Before-Update-2024-01-15', vmName: 'WEB-SERVER-01', description: 'System update öncesi snapshot', createdAt: '2024-01-15 10:30', sizeGB: 12.5, type: 'manual' },
        { id: '2', name: 'Weekly-Backup-2024-01-14', vmName: 'DB-SERVER-01', description: 'Haftalık otomatik yedekleme', createdAt: '2024-01-14 02:00', sizeGB: 45.2, type: 'scheduled' },
        { id: '3', name: 'Pre-Migration-Backup', vmName: 'APP-SERVER-01', description: 'Migration öncesi yedek', createdAt: '2024-01-10 14:15', sizeGB: 28.7, type: 'backup' },
        { id: '4', name: 'Before-Patch-2024-01-08', vmName: 'WEB-SERVER-01', description: 'Security patch öncesi', createdAt: '2024-01-08 09:00', sizeGB: 11.3, type: 'manual' },
        { id: '5', name: 'Dev-Test-Snapshot', vmName: 'TEST-VM-01', description: 'Test ortamı snapshot', createdAt: '2024-01-05 16:20', sizeGB: 5.8, type: 'manual' },
        { id: '6', name: 'Monthly-Backup-Jan', vmName: 'CACHE-SERVER-01', description: 'Aylık yedekleme', createdAt: '2024-01-01 00:00', sizeGB: 32.1, type: 'backup' },
        { id: '7', name: 'Before-Upgrade-DB', vmName: 'DB-SERVER-01', description: 'Database upgrade öncesi', createdAt: '2023-12-28 11:00', sizeGB: 52.3, type: 'manual' },
        { id: '8', name: 'Daily-Backup-2023-12-27', vmName: 'WEB-SERVER-02', description: 'Günlük otomatik yedekleme', createdAt: '2023-12-27 02:00', sizeGB: 18.9, type: 'scheduled' },
        { id: '9', name: 'Pre-Config-Change', vmName: 'APP-SERVER-02', description: 'Yapılandırma değişikliği öncesi', createdAt: '2023-12-25 14:30', sizeGB: 8.4, type: 'manual' },
        { id: '10', name: 'Weekly-Backup-2023-12-24', vmName: 'DB-SERVER-02', description: 'Haftalık otomatik yedekleme', createdAt: '2023-12-24 02:00', sizeGB: 67.5, type: 'scheduled' },
        { id: '11', name: 'Before-Hotfix', vmName: 'WEB-SERVER-01', description: 'Hotfix uygulama öncesi', createdAt: '2023-12-20 08:00', sizeGB: 14.2, type: 'manual' },
        { id: '12', name: 'Quarterly-Full-Backup', vmName: 'DB-SERVER-01', description: 'Çeyreklik tam yedekleme', createdAt: '2023-12-15 00:00', sizeGB: 125.8, type: 'backup' },
      ]);
      setLoading(false);
    }, 500);
  }, []);

  const filteredSnapshots = useMemo(() => {
    if (!searchTerm) return snapshots;
    const term = searchTerm.toLowerCase();
    return snapshots.filter(
      (s) =>
        s.name.toLowerCase().includes(term) ||
        s.vmName.toLowerCase().includes(term) ||
        s.description.toLowerCase().includes(term) ||
        s.type.toLowerCase().includes(term)
    );
  }, [snapshots, searchTerm]);

  const totalPages = Math.ceil(filteredSnapshots.length / ITEMS_PER_PAGE);
  const paginatedSnapshots = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredSnapshots.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredSnapshots, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'manual':
        return <Badge variant="outline">Manuel</Badge>;
      case 'scheduled':
        return <Badge variant="secondary">Zamanlanmış</Badge>;
      case 'backup':
        return <Badge variant="default">Yedek</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  const getPageNumbers = () => {
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
          <h1 className="text-2xl font-bold">Snapshots</h1>
          <p className="text-muted-foreground">VM snapshot yönetimi</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Snapshot Al
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-500/20">
                <Clock className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Toplam</p>
                <p className="text-2xl font-bold">{snapshots.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-500/20">
                <Clock className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Manuel</p>
                <p className="text-2xl font-bold">{snapshots.filter((s) => s.type === 'manual').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-purple-500/20">
                <Clock className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Zamanlanmış</p>
                <p className="text-2xl font-bold">{snapshots.filter((s) => s.type === 'scheduled').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-orange-500/20">
                <Database className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Toplam Boyut</p>
                <p className="text-2xl font-bold">{snapshots.reduce((acc, s) => acc + s.sizeGB, 0).toFixed(1)} GB</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Snapshot ara... (isim, VM, açıklama, tip)"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
          className="pl-9"
        />
      </div>

      {/* Snapshots Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Snapshots
            <Badge variant="secondary">{filteredSnapshots.length}</Badge>
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
                    <TableHead>Tip</TableHead>
                    <TableHead>Snapshot Adı</TableHead>
                    <TableHead>VM</TableHead>
                    <TableHead>Açıklama</TableHead>
                    <TableHead>Oluşturulma</TableHead>
                    <TableHead className="text-right">Boyut (GB)</TableHead>
                    <TableHead className="text-right">İşlemler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedSnapshots.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Snapshot bulunamadı
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedSnapshots.map((snapshot) => (
                      <TableRow key={snapshot.id}>
                        <TableCell>{getTypeBadge(snapshot.type)}</TableCell>
                        <TableCell className="font-medium">{snapshot.name}</TableCell>
                        <TableCell>{snapshot.vmName}</TableCell>
                        <TableCell className="max-w-xs truncate">{snapshot.description}</TableCell>
                        <TableCell>{snapshot.createdAt}</TableCell>
                        <TableCell className="text-right">{snapshot.sizeGB}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm">
                              <RotateCcw className="h-4 w-4 mr-1" />
                              Geri Yükle
                            </Button>
                            <Button variant="ghost" size="sm" className="text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {/* Custom Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Sayfa {currentPage} / {totalPages}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {getPageNumbers().map((page, idx) => (
                      <React.Fragment key={idx}>
                        {page === 'ellipsis' ? (
                          <span className="px-2 text-muted-foreground">...</span>
                        ) : (
                          <Button
                            variant={currentPage === page ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setCurrentPage(page)}
                            className="w-9"
                          >
                            {page}
                          </Button>
                        )}
                      </React.Fragment>
                    ))}
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
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
