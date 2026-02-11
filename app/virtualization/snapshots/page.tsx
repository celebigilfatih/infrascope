'use client';

import React, { useState, useEffect } from 'react';
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

  const fetchSnapshots = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch VMs list for create dialog
      const vmRes = await fetch('/api/integrations/vmware?type=vms');
      const vmJson = await vmRes.json();
      
      if (vmJson.error) {
        setError(vmJson.error);
        return;
      }
      
      setVms(vmJson.vms || []);
      
      // Fetch all snapshots in one call (batch operation)
      const snapRes = await fetch('/api/integrations/vmware?type=snapshots');
      const snapJson = await snapRes.json();
      
      if (snapJson.error) {
        setError(snapJson.error);
        return;
      }
      
      setSnapshots(snapJson.snapshots || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSnapshots();
    const interval = setInterval(fetchSnapshots, 60000);
    return () => clearInterval(interval);
  }, []);

  // Filter snapshots
  const filteredSnapshots = snapshots.filter(snap => {
    return (
      snap.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      snap.vmName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      snap.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const formatSize = (bytes: number): string => {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${bytes} B`;
  };

  const getAgeWarning = (createTime: string) => {
    const days = differenceInDays(new Date(), new Date(createTime));
    if (days > 30) {
      return <Badge className="bg-red-100 text-red-800">{days} gun (Eski!)</Badge>;
    }
    if (days > 7) {
      return <Badge className="bg-yellow-100 text-yellow-800">{days} gun</Badge>;
    }
    return <Badge className="bg-green-100 text-green-800">{days} gun</Badge>;
  };

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
  const totalSize = snapshots.reduce((sum, s) => sum + (s.size || 0), 0);
  const oldSnapshots = snapshots.filter(s => differenceInDays(new Date(), new Date(s.createTime)) > 7).length;

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
              {new Set(snapshots.map(s => s.vmId)).size}
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
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
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
                {filteredSnapshots.map((snap) => (
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
                    <TableCell>{getAgeWarning(snap.createTime)}</TableCell>
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
