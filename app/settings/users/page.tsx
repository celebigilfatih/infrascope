'use client';

import { uiError, uiLabel, auditActionLabel } from '@/lib/i18n/tr';

import { ActionIcon } from '@/components/ui/action-icon';
import { PageHeading } from '@/components/ui/page-heading';
import { StatusBadge } from '@/components/ui/status-badge';
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  RefreshCw,
  Plus,
  Mail,
  Trash2,
  Edit2,
  Search,
  Shield,
  Users,
  UserCheck,
  UserX,
  Crown,
  Activity,
  Clock,
  Send,
  KeyRound,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

// --- Types ---

interface UserType {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  status: 'active' | 'inactive' | 'suspended';
  lastLogin: string;
  activities?: ActivityType[];
}

interface ActivityType {
  id: string;
  action: string;
  details: string | null;
  createdAt: string;
}

interface PermissionType {
  id: string;
  resource: string;
  action: string;
  description: string | null;
  admin: boolean;
  editor: boolean;
  viewer: boolean;
}

interface UserStats {
  total: number;
  active: number;
  inactive: number;
  admins: number;
}

// --- Helper Functions ---

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getRoleBadge(role: string) {
  switch (role) {
    case 'admin':
      return <Badge variant="destructive" icon={null}>Yönetici</Badge>;
    case 'editor':
      return <Badge variant="info" icon={null}>Editör</Badge>;
    case 'viewer':
      return <Badge variant="secondary" icon={null}>İzleyici</Badge>;
    default:
      return <Badge variant="outline">{role}</Badge>;
  }
}

function getStatusDot(status: string) {
  const colors: Record<string, string> = {
    active: 'bg-green-500',
    inactive: 'bg-gray-400',
    suspended: 'bg-yellow-500',
  };
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${colors[status] || 'bg-gray-400'}`} />;
}

function formatActivityAction(action: string): string {
  const labels: Record<string, string> = {
    login: "Oturum açtı",
    edit_user: "Kullanıcıyı düzenledi",
    delete_user: "Kullanıcıyı sildi",
    create_user: "Kullanıcı oluşturdu",
    delete_alarm: "Alarmı sildi",
    edit_settings: "Ayarları düzenledi",
    account_created: "Hesap oluşturuldu",
    password_change: "Parolayı değiştirdi",
    password_set: "Parola oluşturdu",
    password_reset: "Parolayı sıfırladı",
  };
  return labels[action] || auditActionLabel(action);
}

function getPasswordChecks(password: string) {
  return {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
  };
}

// --- Main Component ---

export default function UsersPage() {
  // User state
  const [users, setUsers] = useState<UserType[]>([]);
  const [stats, setStats] = useState<UserStats>({ total: 0, active: 0, inactive: 0, admins: 0 });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Dialog state
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [userToChangePassword, setUserToChangePassword] = useState<UserType | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserType | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedUsers, setExpandedUsers] = useState<string[]>([]);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<string>('viewer');
  const [editStatus, setEditStatus] = useState<string>('active');

  // Create form state
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createConfirmPassword, setCreateConfirmPassword] = useState('');
  const [createRole, setCreateRole] = useState<string>('viewer');

  // Password change form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordChecks, setPasswordChecks] = useState({
    length: false,
    uppercase: false,
    number: false,
    special: false,
  });

  // Permissions state
  const [permissions, setPermissions] = useState<PermissionType[]>([]);
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [savingPermissionId, setSavingPermissionId] = useState<string | null>(null);

  // --- Data Fetching ---

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/users');
      const result = await response.json();
      if (result.success && result.data) {
        setUsers(result.data);
        setStats(result.stats || { total: 0, active: 0, inactive: 0, admins: 0 });
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPermissions = useCallback(async () => {
    setPermissionsLoading(true);
    try {
      const response = await fetch('/api/permissions');
      const result = await response.json();
      if (result.success && result.data) {
        setPermissions(result.data);
      }
    } catch (error) {
      console.error('Error fetching permissions:', error);
    } finally {
      setPermissionsLoading(false);
    }
  }, []);

  const fetchUserActivities = useCallback(async (userId: string) => {
    try {
      const response = await fetch(`/api/users/activities?userId=${userId}&limit=5`);
      const result = await response.json();
      if (result.success && result.data) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, activities: result.data } : u))
        );
      }
    } catch (error) {
      console.error('Error fetching user activities:', error);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchPermissions();
  }, [fetchUsers, fetchPermissions]);

  // --- Filtered Users ---

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      !searchQuery ||
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const createPasswordChecks = getPasswordChecks(createPassword);
  const isCreatePasswordValid =
    Object.values(createPasswordChecks).every(Boolean) &&
    createPassword === createConfirmPassword;

  // --- User CRUD Handlers ---

  const openEditDialog = (user: UserType) => {
    setEditingUser(user);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditRole(user.role);
    setEditStatus(user.status);
    setIsEditDialogOpen(true);
  };

  const closeEditDialog = () => {
    setIsEditDialogOpen(false);
    setEditingUser(null);
    setEditName('');
    setEditEmail('');
    setEditRole('viewer');
    setEditStatus('active');
  };

  const handleSaveUser = async () => {
    if (!editingUser) return;
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingUser.id,
          name: editName || editingUser.name,
          email: editEmail || editingUser.email,
          role: editRole || editingUser.role,
          status: editStatus || editingUser.status,
        }),
      });
      const result = await response.json();
      if (result.success) {
        await fetchUsers();
        closeEditDialog();
      } else {
        alert(uiError(`Error: ${result.error}`));
      }
    } catch (error) {
      console.error('Error updating user:', error);
      alert(uiError("Kullanıcı güncellenemedi."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateUser = async () => {
    if (!createName || !createEmail || !createPassword) {
      alert(uiError("Ad, e-posta adresi ve parola zorunludur."));
      return;
    }
    if (!isCreatePasswordValid) {
      alert(uiError("Parola güvenlik koşullarını karşılamıyor veya parola doğrulaması eşleşmiyor."));
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName,
          email: createEmail,
          password: createPassword,
          role: createRole,
        }),
      });
      const result = await response.json();
      if (result.success) {
        await fetchUsers();
        setIsCreateDialogOpen(false);
        setCreateName('');
        setCreateEmail('');
        setCreatePassword('');
        setCreateConfirmPassword('');
        setCreateRole('viewer');
      } else {
        alert(uiError(`Error: ${result.error}`));
      }
    } catch (error) {
      console.error('Error creating user:', error);
      alert(uiError("Kullanıcı oluşturulamadı."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/users?id=${userToDelete.id}`, { method: 'DELETE' });
      const result = await response.json();
      if (result.success) {
        await fetchUsers();
        setIsDeleteDialogOpen(false);
        setUserToDelete(null);
      } else {
        alert(uiError(`Error: ${result.error}`));
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      alert(uiError("Kullanıcı silinemedi."));
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Permission Toggle Handler ---

  const handlePermissionToggle = async (permissionId: string, roleId: string, granted: boolean) => {
    setSavingPermissionId(permissionId);
    try {
      const response = await fetch('/api/permissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissionId, roleId, granted }),
      });
      const result = await response.json();
      if (result.success && result.data) {
        setPermissions(result.data);
      }
    } catch (error) {
      console.error('Error toggling permission:', error);
    } finally {
      setSavingPermissionId(null);
    }
  };

  // --- Password Change Handler ---

  const handlePasswordChange = async () => {
    if (!userToChangePassword) return;
    const allChecksPass = Object.values(passwordChecks).every(Boolean);
    if (!allChecksPass || newPassword !== confirmNewPassword) return;

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/users/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userToChangePassword.id,
          currentPassword,
          newPassword,
        }),
      });
      const result = await response.json();
      if (result.success) {
        setIsPasswordDialogOpen(false);
        setUserToChangePassword(null);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
      } else {
        alert(uiError(`Error: ${result.error}`));
      }
    } catch (error) {
      console.error('Error changing password:', error);
      alert(uiError("Parola değiştirilemedi."));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Password strength tracking
  useEffect(() => {
    setPasswordChecks({
      length: newPassword.length >= 8,
      uppercase: /[A-Z]/.test(newPassword),
      number: /[0-9]/.test(newPassword),
      special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword),
    });
  }, [newPassword]);

  // --- Activity Accordion Toggle ---

  const handleAccordionToggle = (userId: string) => {
    if (expandedUsers.includes(userId)) {
      setExpandedUsers((prev) => prev.filter((id) => id !== userId));
    } else {
      setExpandedUsers((prev) => [...prev, userId]);
      const user = users.find((u) => u.id === userId);
      if (user && !user.activities) {
        fetchUserActivities(userId);
      }
    }
  };

  // --- Group Permissions by Resource ---

  const groupedPermissions = permissions.reduce<Record<string, PermissionType[]>>((acc, perm) => {
    if (!acc[perm.resource]) acc[perm.resource] = [];
    acc[perm.resource].push(perm);
    return acc;
  }, {});

  // --- Render ---

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between max-md:flex-col max-md:items-stretch max-md:gap-4">
        <div>
          <PageHeading section="users" description={<>Kullanıcıları, rolleri ve erişim yetkilerini yönetin</>}>Kullanıcılar ve Roller</PageHeading>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={fetchUsers} disabled={loading} aria-label="Yenile">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="outline" onClick={() => window.location.href = '/settings/users/invitations'}>
            <Send className="h-4 w-4 mr-2" />
            Davetler
          </Button>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Yeni Kullanıcı
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Toplam Kullanıcı</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
              <UserCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Aktif</p>
              <p className="text-2xl font-bold">{stats.active}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-900/30">
              <UserX className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Pasif</p>
              <p className="text-2xl font-bold">{stats.inactive}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
              <Crown className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Yöneticiler</p>
              <p className="text-2xl font-bold">{stats.admins}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            Kullanıcılar
          </TabsTrigger>
          <TabsTrigger value="permissions" className="gap-2">
            <Shield className="h-4 w-4" />
            Yetki Matrisi
          </TabsTrigger>
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Ad veya e-posta ile ara…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Role göre filtrele" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Roller</SelectItem>
                <SelectItem value="admin">Yönetici</SelectItem>
                <SelectItem value="editor">Editör</SelectItem>
                <SelectItem value="viewer">İzleyici</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* User Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {loading ? (
              <Card className="col-span-full">
                <CardContent className="p-6 text-center text-muted-foreground">
                  Kullanıcılar yükleniyor…
                </CardContent>
              </Card>
            ) : filteredUsers.length === 0 ? (
              <Card className="col-span-full">
                <CardContent className="p-6 text-center text-muted-foreground">
                  Kullanıcı bulunamadı. Başlamak için yeni kullanıcı oluşturun.
                </CardContent>
              </Card>
            ) : (
              filteredUsers.map((user) => (
                <Card key={user.id} className="group hover:shadow-md transition-shadow">
                  <CardContent className="p-5">
                    {/* Card Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                            {getInitials(user.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{user.name}</p>
                            {getStatusDot(user.status)}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            {user.email}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEditDialog(user)}
                         aria-label="Düzenle">
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setUserToChangePassword(user);
                            setIsPasswordDialogOpen(true);
                          }}
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setUserToDelete(user);
                            setIsDeleteDialogOpen(true);
                          }}
                         aria-label="Sil">
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                      </div>
                    </div>

                    {/* Role & Status Badges */}
                    <div className="flex items-center gap-2 mb-3">
                      {getRoleBadge(user.role)}
                      <StatusBadge status={user.status} />
                    </div>

                    {/* Last Login */}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
                      <Clock className="h-3 w-3" />
                      Son giriş: {user.lastLogin}
                    </div>

                    {/* Activity Accordion */}
                    <Accordion
                      type="multiple"
                      value={expandedUsers}
                      onValueChange={(vals) => {
                        const newVals = vals.filter((v) => !expandedUsers.includes(v));
                        const removedVals = expandedUsers.filter((v) => !vals.includes(v));
                        newVals.forEach((id) => handleAccordionToggle(id));
                        if (removedVals.length > 0) {
                          setExpandedUsers(vals);
                        }
                      }}
                    >
                      <AccordionItem value={user.id} className="border-b-0">
                        <AccordionTrigger className="py-2 text-xs text-muted-foreground hover:no-underline">
                          <span className="flex items-center gap-1.5">
                            <Activity className="h-3 w-3" />
                            Son Etkinlikler
                          </span>
                        </AccordionTrigger>
                        <AccordionContent>
                          {user.activities === undefined ? (
                            <p className="text-xs text-muted-foreground py-1">Yükleniyor…</p>
                          ) : user.activities.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-1">Son etkinlik yok</p>
                          ) : (
                            <div className="space-y-1.5">
                              {user.activities.map((act) => (
                                <div
                                  key={act.id}
                                  className="flex items-center justify-between text-xs"
                                >
                                  <span className="text-muted-foreground">
                                    {formatActivityAction(act.action)}
                                  </span>
                                  <span className="text-muted-foreground/70">{act.createdAt}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* Permission Matrix Tab */}
        <TabsContent value="permissions">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Yetki Matrisi
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Her kaynağa ve işleme hangi rollerin erişebileceğini belirleyin.
              </p>
            </CardHeader>
            <CardContent>
              {permissionsLoading ? (
                <p className="text-muted-foreground text-center py-8">Yetkiler yükleniyor…</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                          Kaynak
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                          İşlem
                        </th>
                        <th className="text-center py-3 px-4 text-sm font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            <Crown className="h-3.5 w-3.5 text-red-500" />
                            Yönetici
                          </span>
                        </th>
                        <th className="text-center py-3 px-4 text-sm font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            <Edit2 className="h-3.5 w-3.5 text-blue-500" />
                            Editör
                          </span>
                        </th>
                        <th className="text-center py-3 px-4 text-sm font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5 text-gray-500" />
                            İzleyici
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(groupedPermissions).map(([resource, perms]) =>
                        perms.map((perm, idx) => (
                          <tr
                            key={perm.id}
                            className={`border-b last:border-b-0 ${
                              idx === 0 ? '' : ''
                            } hover:bg-muted/50 transition-colors`}
                          >
                            <td className="py-3 px-4 text-sm font-medium">
                              {idx === 0 && (
                                <span className="capitalize">{uiLabel(resource)}</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-sm text-muted-foreground capitalize">
                              {uiLabel(perm.action)}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <Checkbox
                                checked={perm.admin}
                                onCheckedChange={(checked) =>
                                  handlePermissionToggle(perm.id, 'ADMIN', !!checked)
                                }
                                disabled={savingPermissionId === perm.id}
                              />
                            </td>
                            <td className="py-3 px-4 text-center">
                              <Checkbox
                                checked={perm.editor}
                                onCheckedChange={(checked) =>
                                  handlePermissionToggle(perm.id, 'EDITOR', !!checked)
                                }
                                disabled={savingPermissionId === perm.id}
                              />
                            </td>
                            <td className="py-3 px-4 text-center">
                              <Checkbox
                                checked={perm.viewer}
                                onCheckedChange={(checked) =>
                                  handlePermissionToggle(perm.id, 'VIEWER', !!checked)
                                }
                                disabled={savingPermissionId === perm.id}
                              />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create User Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Yeni Kullanıcı Oluştur</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Ad</label>
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Ad soyad"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">E-posta</label>
              <Input
                type="email"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Parola</label>
              <Input
                type="password"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                placeholder="Parola oluşturun"
              />
              <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                <div className="flex items-center gap-2 text-xs">
                  {createPasswordChecks.length ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-gray-300" />
                  )}
                  <span className={createPasswordChecks.length ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}>
                    8 veya daha fazla karakter
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {createPasswordChecks.uppercase ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-gray-300" />
                  )}
                  <span className={createPasswordChecks.uppercase ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}>
                    Büyük harf
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {createPasswordChecks.number ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-gray-300" />
                  )}
                  <span className={createPasswordChecks.number ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}>
                    Rakam
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {createPasswordChecks.special ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-gray-300" />
                  )}
                  <span className={createPasswordChecks.special ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}>
                    Özel karakter
                  </span>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Parolayı Doğrula</label>
              <Input
                type="password"
                value={createConfirmPassword}
                onChange={(e) => setCreateConfirmPassword(e.target.value)}
                placeholder="Parolayı doğrulayın"
              />
              {createConfirmPassword && createPassword !== createConfirmPassword && (
                <p className="text-xs text-red-500 mt-1">Parolalar eşleşmiyor</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Rol</label>
              <Select value={createRole} onValueChange={setCreateRole}>
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
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false);
                setCreateName('');
                setCreateEmail('');
                setCreatePassword('');
                setCreateConfirmPassword('');
                setCreateRole('viewer');
              }}
            ><ActionIcon action="cancel" />
              Vazgeç
            </Button>
            <Button onClick={handleCreateUser} disabled={isSubmitting || !isCreatePasswordValid}>
              {isSubmitting ? "Oluşturuluyor…" : "Kullanıcı Oluştur"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kullanıcıyı Düzenle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Ad</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Kullanıcı adı"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">E-posta</label>
              <Input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Rol</label>
              <Select value={editRole} onValueChange={setEditRole}>
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
            <div>
              <label className="block text-sm font-medium mb-1">Durum</label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Durum seçin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="inactive">Pasif</SelectItem>
                  <SelectItem value="suspended">Askıda</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeEditDialog}><ActionIcon action="cancel" />
              Vazgeç
            </Button>
            <Button onClick={handleSaveUser} disabled={isSubmitting}>
              {isSubmitting ? "Kaydediliyor…" : "Değişiklikleri Kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kullanıcıyı Sil</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Silmek istediğinizden emin misiniz:{' '}
            <span className="font-medium">{userToDelete?.name}</span>? Bu işlem geri alınamaz.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsDeleteDialogOpen(false);
                setUserToDelete(null);
              }}
            ><ActionIcon action="cancel" />
              Vazgeç
            </Button>
            <Button variant="destructive" onClick={handleDeleteUser} disabled={isSubmitting}>
              {isSubmitting ? "Siliniyor…" : "Sil"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Change Dialog */}
      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Parolayı Değiştir
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Parolası değiştirilecek kullanıcı: <span className="font-medium">{userToChangePassword?.name}</span>
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Mevcut Parola</label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Mevcut parolayı girin"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Yeni Parola</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Yeni parolayı girin"
              />
              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  {passwordChecks.length ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-gray-300" />
                  )}
                  <span className={passwordChecks.length ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}>
                    En az 8 karakter
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {passwordChecks.uppercase ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-gray-300" />
                  )}
                  <span className={passwordChecks.uppercase ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}>
                    Bir büyük harf
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {passwordChecks.number ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-gray-300" />
                  )}
                  <span className={passwordChecks.number ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}>
                    Bir rakam
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {passwordChecks.special ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-gray-300" />
                  )}
                  <span className={passwordChecks.special ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}>
                    Bir özel karakter
                  </span>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Yeni Parolayı Doğrula</label>
              <Input
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="Yeni parolayı doğrulayın"
              />
              {confirmNewPassword && newPassword !== confirmNewPassword && (
                <p className="text-xs text-red-500 mt-1">Parolalar eşleşmiyor</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsPasswordDialogOpen(false);
                setUserToChangePassword(null);
                setCurrentPassword('');
                setNewPassword('');
                setConfirmNewPassword('');
              }}
            ><ActionIcon action="cancel" />
              Vazgeç
            </Button>
            <Button
              onClick={handlePasswordChange}
              disabled={
                isSubmitting ||
                !currentPassword ||
                !Object.values(passwordChecks).every(Boolean) ||
                newPassword !== confirmNewPassword
              }
            >
              {isSubmitting ? "Değiştiriliyor…" : "Parolayı Değiştir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
