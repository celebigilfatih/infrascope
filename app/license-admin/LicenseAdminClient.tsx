'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Eye,
  Key,
  Plus,
  RefreshCw,
  Save,
  Search,
  Server,
  Users,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

type Summary = {
  totalCustomers: number;
  activeLicenses: number;
  expiringSoon: number;
  suspendedOrRevoked: number;
  activeActivations: number;
  recentHeartbeats: number;
};

type LicenseRow = {
  id: string;
  key: string;
  fullKey: string;
  tier: 'TRIAL' | 'STANDARD' | 'ENTERPRISE';
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'SUSPENDED';
  maxDevices: number;
  maxUsers: number;
  validUntil: string;
  activationLimit: number;
  activationCount: number;
  lastHeartbeatAt: string | null;
  customer: {
    companyName: string;
    contactName: string;
    email: string;
    status: string;
  };
};

type LicenseDetail = LicenseRow & {
  customer: LicenseRow['customer'] & {
    id: string;
    phone: string | null;
  };
  activations: Array<{
    id: string;
    machineId: string;
    activatedAt: string;
    lastSeenAt: string | null;
    ipAddress: string | null;
    hostname: string | null;
    version: string | null;
    status: string;
    usageData: unknown;
  }>;
  heartbeats: Array<{
    id: string;
    machineId: string;
    deviceCount: number;
    userCount: number;
    appVersion: string | null;
    ipAddress: string | null;
    createdAt: string;
  }>;
};

type CreateForm = {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  tier: 'TRIAL' | 'STANDARD' | 'ENTERPRISE';
  maxDevices: string;
  maxUsers: string;
  days: string;
  activationLimit: string;
  notes: string;
};

const initialForm: CreateForm = {
  companyName: '',
  contactName: '',
  email: '',
  phone: '',
  tier: 'STANDARD',
  maxDevices: '50',
  maxUsers: '5',
  days: '365',
  activationLimit: '1',
  notes: '',
};

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    EXPIRED: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
    SUSPENDED: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    REVOKED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  };
  return <Badge className={styles[status] || ''}>{status}</Badge>;
}

function tierBadge(tier: string) {
  const styles: Record<string, string> = {
    TRIAL: 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400',
    STANDARD: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    ENTERPRISE: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400',
  };
  return <Badge className={styles[tier] || ''}>{tier}</Badge>;
}

function formatDate(value: string | null): string {
  if (!value) return 'Never';
  return new Date(value).toLocaleDateString();
}

function daysRemaining(value: string): number {
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
}

export default function LicenseAdminClient() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [licenses, setLicenses] = useState<LicenseRow[]>([]);
  const [detail, setDetail] = useState<LicenseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(initialForm);
  const [search, setSearch] = useState('');
  const [tier, setTier] = useState('all');
  const [status, setStatus] = useState('all');
  const [expiry, setExpiry] = useState('all');

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (tier !== 'all') params.set('tier', tier);
    if (status !== 'all') params.set('status', status);
    if (expiry !== 'all') params.set('expiry', expiry);
    return params.toString();
  }, [search, tier, status, expiry]);

  const loadSummary = useCallback(async () => {
    const response = await fetch('/api/license-admin/summary');
    const result = await response.json();
    if (!result.success) throw new Error(result.error || 'Failed to load summary');
    setSummary(result.data);
  }, []);

  const loadLicenses = useCallback(async () => {
    const response = await fetch(`/api/license-admin/licenses${query ? `?${query}` : ''}`);
    const result = await response.json();
    if (!result.success) throw new Error(result.error || 'Failed to load licenses');
    setLicenses(result.data || []);
  }, [query]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadSummary(), loadLicenses()]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [loadLicenses, loadSummary]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateForm = (key: keyof CreateForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const createLicense = async () => {
    setWorking(true);
    setError(null);
    setCreatedKey(null);
    try {
      const response = await fetch('/api/license-admin/licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          maxDevices: Number(form.maxDevices),
          maxUsers: Number(form.maxUsers),
          days: Number(form.days),
          activationLimit: Number(form.activationLimit),
        }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to create license');
      setCreatedKey(result.data.key);
      setForm(initialForm);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const openDetail = async (licenseId: string) => {
    setWorking(true);
    setError(null);
    try {
      const response = await fetch(`/api/license-admin/licenses/${licenseId}`);
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to load license detail');
      setDetail(result.data);
      setDetailOpen(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const updateLicense = async (licenseId: string, payload: Record<string, unknown>) => {
    setWorking(true);
    setError(null);
    try {
      const response = await fetch(`/api/license-admin/licenses/${licenseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to update license');
      await refresh();
      await openDetail(licenseId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const deactivateActivation = async (licenseId: string, activationId: string) => {
    setWorking(true);
    setError(null);
    try {
      const response = await fetch(`/api/license-admin/licenses/${licenseId}/activations/${activationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'DEACTIVATED' }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to update activation');
      await openDetail(licenseId);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const copyKey = async (key: string) => {
    await navigator.clipboard.writeText(key);
    setCreatedKey(key);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Key className="h-6 w-6" />
            License Admin
          </h1>
          <p className="text-sm text-muted-foreground">Central customer license operations</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Create License
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {createdKey && (
        <div className="flex flex-col gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300 sm:flex-row sm:items-center sm:justify-between">
          <span>Generated license key: <strong className="font-mono">{createdKey}</strong></span>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => copyKey(createdKey)}>
            <Copy className="h-4 w-4" />
            Copy
          </Button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Customers</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-3"><Users className="h-5 w-5 text-primary" /><span className="text-2xl font-bold">{summary?.totalCustomers ?? 0}</span></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Active Licenses</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-green-600" /><span className="text-2xl font-bold">{summary?.activeLicenses ?? 0}</span></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Expiring Soon</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-3"><AlertTriangle className="h-5 w-5 text-yellow-600" /><span className="text-2xl font-bold">{summary?.expiringSoon ?? 0}</span></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Activations</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-3"><Server className="h-5 w-5 text-blue-600" /><span className="text-2xl font-bold">{summary?.activeActivations ?? 0}</span></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <CardTitle>Licenses</CardTitle>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Search customer or key" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={tier} onValueChange={setTier}>
                <SelectTrigger><SelectValue placeholder="Tier" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tiers</SelectItem>
                  <SelectItem value="TRIAL">Trial</SelectItem>
                  <SelectItem value="STANDARD">Standard</SelectItem>
                  <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="SUSPENDED">Suspended</SelectItem>
                  <SelectItem value="REVOKED">Revoked</SelectItem>
                  <SelectItem value="EXPIRED">Expired</SelectItem>
                </SelectContent>
              </Select>
              <Select value={expiry} onValueChange={setExpiry}>
                <SelectTrigger><SelectValue placeholder="Expiry" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All expiry</SelectItem>
                  <SelectItem value="expiring">Next 30 days</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>License</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Limits</TableHead>
                <TableHead>Activations</TableHead>
                <TableHead>Valid Until</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {licenses.map((license) => (
                <TableRow key={license.id}>
                  <TableCell>
                    <div className="font-medium">{license.customer.companyName}</div>
                    <div className="text-xs text-muted-foreground">{license.customer.email}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{license.key}</TableCell>
                  <TableCell>{tierBadge(license.tier)}</TableCell>
                  <TableCell>{statusBadge(license.status)}</TableCell>
                  <TableCell className="text-sm">{license.maxDevices} devices / {license.maxUsers} users</TableCell>
                  <TableCell>{license.activationCount} / {license.activationLimit}</TableCell>
                  <TableCell>
                    <div>{formatDate(license.validUntil)}</div>
                    <div className="text-xs text-muted-foreground">{daysRemaining(license.validUntil)} days</div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openDetail(license.id)} disabled={working}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {licenses.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    No licenses found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create License</DialogTitle>
            <DialogDescription>Create or update the customer and issue a new license key.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>Company</Label><Input value={form.companyName} onChange={(e) => updateForm('companyName', e.target.value)} /></div>
            <div className="space-y-2"><Label>Contact</Label><Input value={form.contactName} onChange={(e) => updateForm('contactName', e.target.value)} /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => updateForm('email', e.target.value)} /></div>
            <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={(e) => updateForm('phone', e.target.value)} /></div>
            <div className="space-y-2">
              <Label>Tier</Label>
              <Select value={form.tier} onValueChange={(value) => updateForm('tier', value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TRIAL">Trial</SelectItem>
                  <SelectItem value="STANDARD">Standard</SelectItem>
                  <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Days</Label><Input type="number" min="1" value={form.days} onChange={(e) => updateForm('days', e.target.value)} /></div>
            <div className="space-y-2"><Label>Max Devices</Label><Input type="number" min="1" value={form.maxDevices} onChange={(e) => updateForm('maxDevices', e.target.value)} /></div>
            <div className="space-y-2"><Label>Max Users</Label><Input type="number" min="1" value={form.maxUsers} onChange={(e) => updateForm('maxUsers', e.target.value)} /></div>
            <div className="space-y-2"><Label>Activation Limit</Label><Input type="number" min="1" value={form.activationLimit} onChange={(e) => updateForm('activationLimit', e.target.value)} /></div>
            <div className="space-y-2 sm:col-span-2"><Label>Notes</Label><Input value={form.notes} onChange={(e) => updateForm('notes', e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button className="gap-2" onClick={createLicense} disabled={working}>
              <Plus className="h-4 w-4" />
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.customer.companyName}</DialogTitle>
                <DialogDescription>{detail.customer.email}</DialogDescription>
              </DialogHeader>
              <div className="space-y-5">
                <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-4">
                  <div><div className="text-xs text-muted-foreground">Key</div><div className="font-mono text-xs">{detail.key}</div></div>
                  <div><div className="text-xs text-muted-foreground">Tier</div>{tierBadge(detail.tier)}</div>
                  <div><div className="text-xs text-muted-foreground">Status</div>{statusBadge(detail.status)}</div>
                  <div><div className="text-xs text-muted-foreground">Valid Until</div><div className="text-sm">{formatDate(detail.validUntil)}</div></div>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <Button variant="outline" className="gap-2" onClick={() => copyKey(detail.fullKey)}>
                    <Copy className="h-4 w-4" />
                    Copy full key
                  </Button>
                  <Button variant="outline" className="gap-2" onClick={() => updateLicense(detail.id, { status: 'ACTIVE' })} disabled={working}>
                    <CheckCircle2 className="h-4 w-4" />
                    Reactivate
                  </Button>
                  <Button variant="outline" className="gap-2" onClick={() => updateLicense(detail.id, { status: 'SUSPENDED' })} disabled={working}>
                    <AlertTriangle className="h-4 w-4" />
                    Suspend
                  </Button>
                  <Button variant="outline" className="gap-2 text-red-600" onClick={() => updateLicense(detail.id, { status: 'REVOKED' })} disabled={working}>
                    <XCircle className="h-4 w-4" />
                    Revoke
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-2"><Label>Max Devices</Label><Input id="edit-max-devices" type="number" defaultValue={detail.maxDevices} /></div>
                  <div className="space-y-2"><Label>Max Users</Label><Input id="edit-max-users" type="number" defaultValue={detail.maxUsers} /></div>
                  <div className="space-y-2"><Label>Activation Limit</Label><Input id="edit-activation-limit" type="number" defaultValue={detail.activationLimit} /></div>
                  <div className="space-y-2"><Label>Valid Until</Label><Input id="edit-valid-until" type="date" defaultValue={detail.validUntil.slice(0, 10)} /></div>
                  <Button
                    className="gap-2 md:col-span-4"
                    onClick={() => updateLicense(detail.id, {
                      maxDevices: Number((document.getElementById('edit-max-devices') as HTMLInputElement).value),
                      maxUsers: Number((document.getElementById('edit-max-users') as HTMLInputElement).value),
                      activationLimit: Number((document.getElementById('edit-activation-limit') as HTMLInputElement).value),
                      validUntil: (document.getElementById('edit-valid-until') as HTMLInputElement).value,
                    })}
                    disabled={working}
                  >
                    <Save className="h-4 w-4" />
                    Save limits and expiry
                  </Button>
                </div>

                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Server className="h-4 w-4" /> Activations</h3>
                  <Table>
                    <TableHeader><TableRow><TableHead>Machine</TableHead><TableHead>Status</TableHead><TableHead>Last Seen</TableHead><TableHead>Version</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {detail.activations.map((activation) => (
                        <TableRow key={activation.id}>
                          <TableCell className="font-mono text-xs">{activation.machineId}</TableCell>
                          <TableCell>{activation.status}</TableCell>
                          <TableCell>{formatDate(activation.lastSeenAt)}</TableCell>
                          <TableCell>{activation.version || '-'}</TableCell>
                          <TableCell className="text-right">
                            {activation.status === 'ACTIVE' && (
                              <Button variant="ghost" size="sm" onClick={() => deactivateActivation(detail.id, activation.id)} disabled={working}>
                                Deactivate
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {detail.activations.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No activations.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </div>

                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Activity className="h-4 w-4" /> Recent Heartbeats</h3>
                  <Table>
                    <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Machine</TableHead><TableHead>Usage</TableHead><TableHead>Version</TableHead><TableHead>IP</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {detail.heartbeats.map((heartbeat) => (
                        <TableRow key={heartbeat.id}>
                          <TableCell>{new Date(heartbeat.createdAt).toLocaleString()}</TableCell>
                          <TableCell className="font-mono text-xs">{heartbeat.machineId.slice(0, 18)}...</TableCell>
                          <TableCell>{heartbeat.deviceCount} devices / {heartbeat.userCount} users</TableCell>
                          <TableCell>{heartbeat.appVersion || '-'}</TableCell>
                          <TableCell>{heartbeat.ipAddress || '-'}</TableCell>
                        </TableRow>
                      ))}
                      {detail.heartbeats.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No heartbeats.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
