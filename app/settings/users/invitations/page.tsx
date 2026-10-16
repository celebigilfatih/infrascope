'use client';

import { uiError, uiLabel } from '@/lib/i18n/tr';

import { ActionIcon } from '@/components/ui/action-icon';
import { PageHeading } from '@/components/ui/page-heading';
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { RefreshCw, Mail, Clock, CheckCircle2, XCircle, Send, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface InvitationType {
  id: string;
  email: string;
  role: string;
  status: string;
  invitedBy: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

interface InvitationStats {
  total: number;
  pending: number;
  accepted: number;
  expired: number;
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'pending':
      return (
        <Badge variant="warning">
          <Clock className="h-3 w-3 mr-1" />
          Bekliyor
        </Badge>
      );
    case 'accepted':
      return (
        <Badge variant="success">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Kabul Edildi
        </Badge>
      );
    case 'expired':
      return (
        <Badge variant="secondary">
          <XCircle className="h-3 w-3 mr-1" />
          Süresi Doldu
        </Badge>
      );
    default:
      return <Badge variant="outline">{uiLabel(status)}</Badge>;
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('tr-TR', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function InvitationsPage() {
  const [invitations, setInvitations] = useState<InvitationType[]>([]);
  const [stats, setStats] = useState<InvitationStats>({ total: 0, pending: 0, accepted: 0, expired: 0 });
  const [loading, setLoading] = useState(true);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('viewer');

  const fetchInvitations = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/users/invite');
      const result = await response.json();
      if (result.success) {
        setInvitations(result.data);
        setStats(result.stats || { total: 0, pending: 0, accepted: 0, expired: 0 });
      }
    } catch (error) {
      console.error('Error fetching invitations:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations]);

  const handleSendInvitation = async () => {
    if (!inviteEmail) {
      alert(uiError("E-posta adresi zorunludur."));
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
        }),
      });
      const result = await response.json();
      if (result.success) {
        await fetchInvitations();
        setIsInviteDialogOpen(false);
        setInviteEmail('');
        setInviteRole('viewer');
      } else {
        alert(uiError(`Error: ${result.error}`));
      }
    } catch (error) {
      console.error('Error sending invitation:', error);
      alert(uiError("Davet gönderilemedi."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between max-md:flex-col max-md:items-stretch max-md:gap-4">
        <div className="flex items-center gap-4">
          <Link href="/settings/users">
            <Button variant="ghost" size="icon" aria-label="Geri dön">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <PageHeading section="invitations" description={<>Kullanıcı davetlerini ve doğrulama süreçlerini yönetin</>}>

              Davetler
            </PageHeading>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={fetchInvitations} disabled={loading} aria-label="Yenile">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={() => setIsInviteDialogOpen(true)}>
            <Send className="h-4 w-4 mr-2" />
            Kullanıcı Davet Et
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Toplam</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
              <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Bekliyor</p>
              <p className="text-2xl font-bold">{stats.pending}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Kabul Edildi</p>
              <p className="text-2xl font-bold">{stats.accepted}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-900/30">
              <XCircle className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Süresi Doldu</p>
              <p className="text-2xl font-bold">{stats.expired}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Invitations Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>E-posta</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead>Davet Eden</TableHead>
                <TableHead>Bitiş Tarihi</TableHead>
                <TableHead>Kabul Edildi</TableHead>
                <TableHead>Oluşturulma</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Davetler yükleniyor…
                  </TableCell>
                </TableRow>
              ) : invitations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Henüz davet yok. Göndermek için Kullanıcı Davet Et düğmesini seçin.
                  </TableCell>
                </TableRow>
              ) : (
                invitations.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.email}</TableCell>
                    <TableCell className="capitalize">{uiLabel(inv.role)}</TableCell>
                    <TableCell>{getStatusBadge(inv.status)}</TableCell>
                    <TableCell className="text-muted-foreground">{inv.invitedBy}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(inv.expiresAt)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {inv.acceptedAt ? formatDate(inv.acceptedAt) : '-'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(inv.createdAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Invite User Dialog */}
      <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Yeni Kullanıcı Davet Et
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">E-posta Adresi</label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Bu adrese doğrulama bağlantısı içeren bir davet e-postası gönderilir.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Rol</label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Rol seçin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Yönetici</SelectItem>
                  <SelectItem value="editor">Editör</SelectItem>
                  <SelectItem value="viewer">İzleyici</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsInviteDialogOpen(false)}><ActionIcon action="cancel" />
              Vazgeç
            </Button>
            <Button onClick={handleSendInvitation} disabled={isSubmitting}>
              {isSubmitting ? "Gönderiliyor…" : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Davet Gönder
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
