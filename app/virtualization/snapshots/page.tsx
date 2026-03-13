'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  RefreshCw,
  Camera,
  Trash2,
  RotateCcw,
  Plus,
  AlertTriangle,
  Clock,
  HardDrive,
  Search,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { format, differenceInDays } from 'date-fns';
import { tr } from 'date-fns/locale';

interface Snapshot {
  id: string;
  vmId: string;
  vmName: string;
  name: string;
  description: string;
  createTime: string;
  state: string;
  size: number;
}

interface VM {
  id: string;
  name: string;
}

export default function SnapshotsPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [vms, setVms] = useState<VM[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Create snapshot dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedVmId, setSelectedVmId] = useState('');
  const [newSnapshotName, setNewSnapshotName] = useState('');
  const [newSnapshotDesc, setNewSnapshotDesc] = useState('');
  const [creating, setCreating] = useState(false);

  // Confirm dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({ open: false, title: '', description: '', onConfirm: () => {} });

  // Debounce search to avoid re-render on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 200);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const fetchSnapshots = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch VMs and snapshots in parallel; use server cache (no cache: 'no-store')
      const [vmRes, snapRes] = await Promise.all([
        fetch('/api/integrations/vmware?type=vms'),
        fetch('/api/integrations/vmware?type=snapshots'),
      ]);
      const [vmJson, snapJson] = await Promise.all([vmRes.json(), snapRes.json()]);

      if (vmJson.error) { setError(vmJson.error); return; }
      if (snapJson.error) { setError(snapJson.error); return; }

      setVms(vmJson.vms || []);
      setSnapshots(snapJson.snapshots || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSnapshots();
    const interval = setInterval(fetchSnapshots, 300000); // 5 min — matches server cache TTL
    return () => clearInterval(interval);
  }, [fetchSnapshots]);

  // Filter snapshots — memoized so re-filter only happens when data or search term changes
  const filteredSnapshots = useMemo(() => snapshots.filter(snap =>
    snap.name?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
    snap.vmName?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
    snap.description?.toLowerCase().includes(debouncedSearch.toLowerCase())
  ), [snapshots, debouncedSearch]);

  // Reset to first page when filter changes
  useEffect(() => { setCurrentPage(1); }, [debouncedSearch]);

  // Pagination
  const totalPages = Math.ceil(filteredSnapshots.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedSnapshots = useMemo(
    () => filteredSnapshots.slice(startIndex, endIndex),
    [filteredSnapshots, startIndex, endIndex]
  );

  // Summary stats — memoized, avoid recalculating on every unrelated render
  const { totalSize, oldSnapshotCount, uniqueVmCount } = useMemo(() => ({
    totalSize: snapshots.reduce((sum, s) => sum + (s.size || 0), 0),
    oldSnapshotCount: snapshots.filter(s => differenceInDays(new Date(), new Date(s.createTime)) > 7).length,
    uniqueVmCount: new Set(snapshots.map(s => s.vmId)).size,
  }), [snapshots]);

  const formatSize = (bytes: number): string => {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${bytes} B`;
  };

  // Pre-compute age data per snapshot once — avoids differenceInDays call per render per row
  const snapshotAgeMap = useMemo(() => {
    const now = new Date();
    const map = new Map<string, number>();
    for (const s of snapshots) {
      map.set(s.id, differenceInDays(now, new Date(s.createTime)));
    }
    return map;
  }, [snapshots]);

  const getAgeWarning = useCallback((snapId: string) => {
    const days = snapshotAgeMap.get(snapId) ?? 0;
    if (days > 30) return <Badge className="bg-red-100 text-red-800">{days} gün (Eski!)</Badge>;
    if (days > 7)  return <Badge className="bg-yellow-100 text-yellow-800">{days} gün</Badge>;
    return <Badge className="bg-green-100 text-green-800">{days} gün</Badge>;
  }, [snapshotAgeMap]);

  // Create snapshot
  const handleCreateSnapshot = async () => {
    if (!selectedVmId || !newSnapshotName) return;
    
    setCreating(true);
    try {
      const res = await fetch('/api/integrations/vmware', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'snapshot-create',
          vmId: selectedVmId,
          name: newSnapshotName,
          description: newSnapshotDesc,
        }),
      });
      
      const json = await res.json();
      if (json.success) {
        setCreateDialogOpen(false);
        setSelectedVmId('');
        setNewSnapshotName('');
        setNewSnapshotDesc('');
        setTimeout(fetchSnapshots, 2000);
      } else {
        alert(`Snapshot olusturulamadi: ${json.error || 'Bilinmeyen hata'}`);
      }
    } catch (err) {
      alert(`Hata: ${(err as Error).message}`);
    } finally {
      setCreating(false);
    }
  };

  // Delete snapshot
  const handleDeleteSnapshot = async (vmId: string, snapshotId: string) => {
    setActionLoading(snapshotId);
    try {
      const res = await fetch('/api/integrations/vmware', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'snapshot-delete',
          vmId,
          snapshotId,
        }),
      });
      
      const json = await res.json();
      if (json.success) {
        setTimeout(fetchSnapshots, 2000);
      } else {
        alert(`Snapshot silinemedi: ${json.error || 'Bilinmeyen hata'}`);
      }
    } catch (err) {
      alert(`Hata: ${(err as Error).message}`);
    } finally {
      setActionLoading(null);
    }
  };

  // Revert snapshot
  const handleRevertSnapshot = async (vmId: string, snapshotId: string) => {
    setActionLoading(snapshotId);
    try {
      const res = await fetch('/api/integrations/vmware', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'snapshot-revert',
          vmId,
          snapshotId,
        }),
      });
      
      const json = await res.json();
      if (json.success) {
        setTimeout(fetchSnapshots, 2000);
      } else {
        alert(`Snapshot geri yukleme basarisiz: ${json.error || 'Bilinmeyen hata'}`);
      }
    } catch (err) {
      alert(`Hata: ${(err as Error).message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const confirmAction = (action: 'delete' | 'revert', vmId: string, snapshotId: string, snapshotName: string) => {
    const titles = {
      delete: 'Snapshot Sil',
      revert: 'Snapshot\'a Geri Don',
    };
    const descriptions = {
      delete: `"${snapshotName}" snapshot\'ini silmek istediginizden emin misiniz? Bu islem geri alinamaz.`,
      revert: `"${snapshotName}" snapshot\'ina geri donmek istediginizden emin misiniz? Mevcut degisiklikler kaybolacaktir.`,
    };

    setConfirmDialog({
      open: true,
      title: titles[action],
      description: descriptions[action],
      onConfirm: () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        if (action === 'delete') {
          handleDeleteSnapshot(vmId, snapshotId);
        } else {
          handleRevertSnapshot(vmId, snapshotId);
        }
      },
    });
  };

  // Summary
  const oldSnapshots = oldSnapshotCount;

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              <span>vCenter baglantisi basarisiz: {error}</span>
            </div>
            <Button onClick={fetchSnapshots} className="mt-4" variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Tekrar Dene
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Snapshot Yonetimi</h1>
          <p className="text-muted-foreground">
            VM snapshot listesi ve yonetimi
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setCreateDialogOpen(true)} variant="default">
            <Plus className="h-4 w-4 mr-2" />
            Yeni Snapshot
          </Button>
          <Button onClick={fetchSnapshots} disabled={loading} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Toplam Snapshot</CardTitle>
            <Camera className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{snapshots.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Toplam Boyut</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatSize(totalSize)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">VM ile Snapshot</CardTitle>
            <Camera className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {uniqueVmCount}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Eski Snapshot (7+ gun)</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${oldSnapshots > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
              {oldSnapshots}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Snapshot adi, VM adi veya aciklama ile ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Snapshot Table */}
      <Card>
        <CardContent className="pt-6">
          {loading && snapshots.length === 0 ? (
            <div className="space-y-2">
              <div className="grid grid-cols-7 gap-2 px-2 pb-2 border-b text-xs font-medium text-muted-foreground">
                {['VM', 'Snapshot Adı', 'Açıklama', 'Oluşturma Tarihi', 'Yaş', 'Boyut', ''].map((h, i) => (
                  <div key={i}>{h}</div>
                ))}
              </div>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="grid grid-cols-7 gap-2 px-2 py-2 border-b border-border/20 animate-pulse">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <div key={j} className="h-4 bg-muted rounded" style={{ opacity: 0.4 + (j % 3) * 0.2 }} />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>VM</TableHead>
                  <TableHead>Snapshot Adi</TableHead>
                  <TableHead>Aciklama</TableHead>
                  <TableHead>Olusturma Tarihi</TableHead>
                  <TableHead>Yas</TableHead>
                  <TableHead>Boyut</TableHead>
                  <TableHead className="text-right">Islemler</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedSnapshots.map((snap) => (
                  <TableRow key={`${snap.vmId}-${snap.id}`}>
                    <TableCell className="font-medium">{snap.vmName}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Camera className="h-4 w-4 text-muted-foreground" />
                        {snap.name}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate" title={snap.description}>
                      {snap.description || '-'}
                    </TableCell>
                    <TableCell>
                      {format(new Date(snap.createTime), 'dd MMM yyyy HH:mm', { locale: tr })}
                    </TableCell>
                    <TableCell>{getAgeWarning(snap.id)}</TableCell>
                    <TableCell>{formatSize(snap.size)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => confirmAction('revert', snap.vmId, snap.id, snap.name)}
                          disabled={actionLoading === snap.id}
                          title="Geri Don"
                        >
                          <RotateCcw className="h-4 w-4 text-blue-500" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => confirmAction('delete', snap.vmId, snap.id, snap.name)}
                          disabled={actionLoading === snap.id}
                          title="Sil"
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                        {actionLoading === snap.id && (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {filteredSnapshots.length === 0 && !loading && (
            <p className="text-center text-muted-foreground py-8">
              {searchTerm ? 'Filtrelere uygun snapshot bulunamadi' : 'Snapshot bulunamadi'}
            </p>
          )}

          {/* Pagination Controls */}
          {filteredSnapshots.length > 0 && (
            <div className="flex items-center justify-between mt-4 border-t pt-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {startIndex + 1}-{Math.min(endIndex, filteredSnapshots.length)} / {filteredSnapshots.length} kayit
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="border rounded px-2 py-1 text-sm"
                >
                  <option value="10">10</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
              </div>
              
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                >
                  Ilk
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Onceki
                </Button>
                <span className="text-sm px-3">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Sonraki
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                >
                  Son
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Snapshot Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Yeni Snapshot Olustur</DialogTitle>
            <DialogDescription>
              Secili VM icin yeni bir snapshot olusturun.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>VM Sec</Label>
              <select
                className="w-full p-2 border rounded-md"
                value={selectedVmId}
                onChange={(e) => setSelectedVmId(e.target.value)}
              >
                <option value="">-- VM Secin --</option>
                {vms.map(vm => (
                  <option key={vm.id} value={vm.id}>{vm.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Snapshot Adi</Label>
              <Input
                placeholder="Snapshot adi girin"
                value={newSnapshotName}
                onChange={(e) => setNewSnapshotName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Aciklama (Opsiyonel)</Label>
              <Input
                placeholder="Snapshot aciklamasi"
                value={newSnapshotDesc}
                onChange={(e) => setNewSnapshotDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Iptal
            </Button>
            <Button 
              onClick={handleCreateSnapshot} 
              disabled={!selectedVmId || !newSnapshotName || creating}
            >
              {creating ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Olusturuluyor...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Olustur
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={confirmDialog.onConfirm}
      />
    </div>
  );
}
