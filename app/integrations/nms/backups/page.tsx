'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Database,
  Plus,
  Search,
  Trash2,
  Download,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Loader2,
  X,
  HardDrive,
  Tag,
} from 'lucide-react';

interface Backup {
  id: number;
  device_id: number;
  device_name: string;
  backup_type: string;
  file_name: string;
  description: string | null;
  file_size: number;
  created_at: string;
  status: string;
}

interface NmsDevice {
  id: number;
  name: string;
  ip_address: string;
}

const BACKUP_TYPES = ['Running Config', 'Startup Config', 'Full Backup'];
const SCHEDULE_TYPES = ['Run Now', 'Scheduled'];

function formatSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0.00 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 0.01) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${mb.toFixed(2)} MB`;
}

export default function NmsBackupsPage() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [devices, setDevices] = useState<NmsDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDevice, setFilterDevice] = useState('');
  const [filterType, setFilterType] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [form, setForm] = useState({
    device_id: '',
    backup_type: 'Running Config',
    backup_name: '',
    description: '',
    schedule: 'Run Now',
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState(false);

  const loadBackups = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterDevice) params.set('device_id', filterDevice);
      if (filterType) params.set('backup_type', filterType);

      const res = await fetch(`/api/integrations/nms/backups${params.toString() ? '?' + params.toString() : ''}`);
      const data = await res.json();
      setBackups(data.data || data.backups || []);
      setError(null);
    } catch (e: any) {
      setError('Failed to load backups: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [filterDevice, filterType]);

  const loadDevices = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/nms/network-devices');
      const data = await res.json();
      setDevices(data.data || []);
    } catch { /* NMS offline */ }
  }, []);

  useEffect(() => {
    loadBackups();
    loadDevices();
  }, [loadBackups, loadDevices]);

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this backup?')) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/integrations/nms/backups/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setBackups(prev => prev.filter(b => b.id !== id));
      }
    } finally {
      setDeleting(null);
    }
  };

  const handleDownload = async (backup: Backup) => {
    window.open(`/api/integrations/nms/backups/${backup.id}?action=download`, '_blank');
  };

  const handleCreate = async () => {
    if (!form.device_id) { setCreateError('Please select a device'); return; }
    if (!form.backup_name.trim()) { setCreateError('Backup Name is required'); return; }
    setCreateError(null);
    setCreating(true);
    try {
      const res = await fetch('/api/integrations/nms/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: Number(form.device_id),
          backup_type: form.backup_type,
          backup_name: form.backup_name,
          description: form.description || null,
          schedule: form.schedule,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error || 'Backup creation failed');
        return;
      }
      setCreateSuccess(true);
      setTimeout(() => {
        setShowCreate(false);
        setCreateSuccess(false);
        setForm({ device_id: '', backup_type: 'Running Config', backup_name: '', description: '', schedule: 'Run Now' });
        loadBackups();
      }, 1500);
    } catch (e: any) {
      setCreateError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const filtered = backups.filter(b => {
    if (search && !b.device_name?.toLowerCase().includes(search.toLowerCase()) &&
        !b.file_name?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalSize = backups.reduce((sum, b) => sum + (b.file_size || 0), 0);
  const uniqueDevices = new Set(backups.map(b => b.device_id)).size;
  const uniqueTypes = new Set(backups.map(b => b.backup_type)).size;

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Config Backups</h1>
          <p className="text-muted-foreground text-sm">Manage device configuration backups</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2 bg-orange-500 hover:bg-orange-600 text-white">
          <Plus className="h-4 w-4" />
          Create Backup
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Backups</p>
              <p className="text-3xl font-bold mt-1">{backups.length}</p>
            </div>
            <Database className="h-8 w-8 text-blue-500 opacity-70" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Size</p>
              <p className="text-2xl font-bold mt-1 text-green-500">{formatSize(totalSize)}</p>
            </div>
            <HardDrive className="h-8 w-8 text-green-500 opacity-70" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Devices</p>
              <p className="text-3xl font-bold mt-1 text-orange-500">{uniqueDevices}</p>
            </div>
            <Database className="h-8 w-8 text-orange-500 opacity-70" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Backup Types</p>
              <p className="text-3xl font-bold mt-1 text-yellow-500">{uniqueTypes}</p>
            </div>
            <Tag className="h-8 w-8 text-yellow-500 opacity-70" />
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by device or filename..."
            className="pl-8"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="h-9 px-3 rounded-md border border-input bg-background text-sm min-w-[160px]"
          value={filterDevice}
          onChange={e => setFilterDevice(e.target.value)}
        >
          <option value="">All Devices</option>
          {devices.map(d => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
        </select>
        <select
          className="h-9 px-3 rounded-md border border-input bg-background text-sm min-w-[140px]"
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
        >
          <option value="">All Types</option>
          {BACKUP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <Button variant="outline" size="sm" onClick={loadBackups} className="gap-1">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Backups Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Database className="h-14 w-14 opacity-25 mb-4" />
              <p className="font-medium">No backups found</p>
              <p className="text-sm mt-1">Create your first backup to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 w-8">
                      <input type="checkbox" className="rounded" />
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Device</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">File Name</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Size</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Created</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(backup => (
                    <tr key={backup.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={selected.has(backup.id)}
                          onChange={() => toggleSelect(backup.id)}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium">{backup.device_name}</td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{backup.file_name || `backup-${backup.id}`}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className="text-xs">{backup.backup_type}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{formatSize(backup.file_size)}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {backup.created_at ? new Date(backup.created_at).toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={backup.status === 'success' ? 'success' : 'secondary'} className="text-xs gap-1">
                          <CheckCircle className="h-3 w-3" />
                          {backup.status || 'success'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            title="Download"
                            onClick={() => handleDownload(backup)}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            title="Delete"
                            onClick={() => handleDelete(backup.id)}
                            disabled={deleting === backup.id}
                          >
                            {deleting === backup.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Backup Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl border border-border w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div>
                <h2 className="text-lg font-bold">Create Backup</h2>
                <p className="text-sm text-muted-foreground">Create a new configuration backup for a device</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowCreate(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-6 space-y-5">
              {/* Select Device */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  Select Device
                </h3>
                <Label htmlFor="cb_device">Device *</Label>
                <select
                  id="cb_device"
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                  value={form.device_id}
                  onChange={e => setForm(prev => ({ ...prev, device_id: e.target.value }))}
                >
                  <option value="">Choose a device...</option>
                  {devices.map(d => (
                    <option key={d.id} value={String(d.id)}>{d.name} ({d.ip_address})</option>
                  ))}
                </select>
              </div>

              {/* Backup Configuration */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                  Backup Configuration
                </h3>
                <div className="space-y-2">
                  <Label>Backup Type *</Label>
                  <select
                    className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                    value={form.backup_type}
                    onChange={e => setForm(prev => ({ ...prev, backup_type: e.target.value }))}
                  >
                    {BACKUP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Backup Name *</Label>
                  <Input
                    placeholder="e.g., Router-01-20251226-backup"
                    value={form.backup_name}
                    onChange={e => setForm(prev => ({ ...prev, backup_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <textarea
                    className="w-full min-h-[70px] px-3 py-2 rounded-md border border-input bg-background text-sm resize-none"
                    placeholder="Add notes about this backup..."
                    value={form.description}
                    onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>
              </div>

              {/* Schedule */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                  Schedule
                </h3>
                <Label>Schedule Type</Label>
                <select
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                  value={form.schedule}
                  onChange={e => setForm(prev => ({ ...prev, schedule: e.target.value }))}
                >
                  {SCHEDULE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-xs">
                Backup will be encrypted and stored securely. You can restore it later or download it for archival.
              </div>

              {createError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {createError}
                </div>
              )}
              {createSuccess && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-600 text-sm">
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  Backup created successfully!
                </div>
              )}
            </div>

            <div className="flex gap-3 p-6 pt-0">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowCreate(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                onClick={handleCreate}
                disabled={creating || createSuccess}
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {creating ? 'Connecting to device... (may take up to 60s)' : 'Create Backup'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
