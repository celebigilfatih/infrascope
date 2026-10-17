'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Clock3, Crown, Eye, Filter, Info, Mail, Plus, RefreshCw, Search, ShieldCheck, TriangleAlert, UserCheck, UserMinus, UsersRound, X } from 'lucide-react';
import { PageHeading } from '@/components/ui/page-heading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RoleAccessMatrix } from '@/components/users/RoleAccessMatrix';
import { UserRoleBadge, UserStateBadge } from '@/components/users/UserVisuals';
import { UserWorkspaceDialog, type UserDialogMode } from '@/components/users/UserWorkspaceDialog';
import { canAccessSync } from '@/lib/auth/permission-policy';
import { initials, parseActor, parseUsers, requestUsersJson, roleLabels, statusLabels, userDate, userRoles, userSearch, userStatuses, type WorkspaceActor, type WorkspaceUser } from '@/lib/users/workspace';
import styles from '@/components/users/users-workspace.module.css';

function LastLogin({ user }: { user: WorkspaceUser }) { return <span className={styles.login}>{user.lastLoginAt === null ? 'Giriş kaydı yok' : userDate(user.lastLoginAt)}{user.lastLoginAt && <small>Türkiye saati (TSİ)</small>}</span>; }
export default function UsersPage() {
  const [users, setUsers] = useState<WorkspaceUser[] | null>(null), [actor, setActor] = useState<WorkspaceActor | null>(null);
  const [loading, setLoading] = useState(true), [errors, setErrors] = useState<Record<string, string>>({}), [notice, setNotice] = useState(''), [readAt, setReadAt] = useState<string | null>(null);
  const [search, setSearch] = useState(''), [role, setRole] = useState('all'), [status, setStatus] = useState('all');
  const [mode, setMode] = useState<UserDialogMode | null>(null), [selected, setSelected] = useState<WorkspaceUser | null>(null), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const sequence = useRef(0), active = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    const id = ++sequence.current; active.current?.abort(); const controller = new AbortController(); active.current = controller; setLoading(true);
    const results = await Promise.allSettled([
      requestUsersJson('/api/users', 'Kullanıcı listesi alınamadı.', { signal: controller.signal }).then(parseUsers),
      requestUsersJson('/api/auth/me', 'İşlem yetkisi doğrulanamadı.', { signal: controller.signal }).then(parseActor),
    ]);
    if (id !== sequence.current || controller.signal.aborted) return;
    const nextErrors: Record<string, string> = {};
    if (results[0].status === 'fulfilled') { setUsers(results[0].value); setReadAt(new Date().toISOString()); setUncertain(false); }
    else nextErrors.users = results[0].reason instanceof Error ? results[0].reason.message : 'Kullanıcı listesi alınamadı.';
    if (results[1].status === 'fulfilled') setActor(results[1].value);
    else { setActor(null); nextErrors.actor = 'İşlem yetkisi doğrulanamadı. Salt okunur görünüm kullanılıyor.'; }
    setErrors(nextErrors); setLoading(false);
  }, []);
  useEffect(() => { void load(); return () => { sequence.current += 1; active.current?.abort(); }; }, [load]);
  const all = users || [], term = userSearch(search.trim());
  const filtered = all.filter(user => (!term || userSearch(`${user.name} ${user.email}`).includes(term)) && (role === 'all' || user.role === role) && (status === 'all' || user.status === status));
  const canWrite = Boolean(actor && canAccessSync(actor.role, 'users', 'write') && !loading && !Object.keys(errors).length && !uncertain && users !== null);
  const canDelete = Boolean(canWrite && actor && canAccessSync(actor.role, 'users', 'delete'));
  const stats = [
    { icon: UsersRound, label: 'Toplam kullanıcı', value: users?.length, help: 'Tüm kayıtlı hesaplar' },
    { icon: UserCheck, label: 'Aktif hesap', value: users?.filter(user => user.status === 'active').length, help: 'Çevrimiçi kullanıcı sayısı değildir' },
    { icon: UserMinus, label: 'Pasif / askıya alınmış', value: users?.filter(user => user.status === 'inactive' || user.status === 'suspended').length, help: 'Yeni oturum açması engellenenler' },
    { icon: Crown, label: 'Yönetici hesabı', value: users?.filter(user => user.role === 'admin').length, help: 'Durumdan bağımsız rol sayısı' },
  ];
  const hasFilters = Boolean(search || role !== 'all' || status !== 'all');
  const clear = () => { setSearch(''); setRole('all'); setStatus('all'); };
  const open = (user: WorkspaceUser) => { setSelected(user); setMode('detail'); };
  const lastAdmin = Boolean(selected?.role === 'admin' && all.filter(user => user.role === 'admin').length <= 1);
  return <div className={styles.page}><div className={styles.workspace}>
    <header className={styles.header}><PageHeading section="users" description="Hesap durumlarını, rolleri ve erişim kapsamını tek yerden inceleyin.">Kullanıcılar ve Roller</PageHeading><div className={styles.headerActions}><Button variant="outline" onClick={() => void load()} disabled={loading || busy || mode !== null}><RefreshCw size={16} aria-hidden="true" className={loading ? 'animate-spin' : ''} />{loading ? 'Yükleniyor…' : 'Bilgileri yenile'}</Button><Button variant="outline" asChild><Link href="/settings/users/invitations"><Mail size={16} aria-hidden="true" />Davetler</Link></Button><Button disabled={!canWrite || busy} onClick={() => { setSelected(null); setMode('create'); }}><Plus size={16} aria-hidden="true" />Yeni kullanıcı</Button></div></header>
    <div className={styles.serviceBar}><SemanticBadge tone={errors.users || uncertain ? 'warning' : 'info'} icon={Clock3}>{errors.users && users ? 'Önceki liste gösteriliyor' : errors.users ? 'Liste alınamadı' : loading ? 'Bilgiler alınıyor' : 'Kayıtlı hesaplar'}</SemanticBadge><span>{readAt ? `Son okuma: ${userDate(readAt)} · TSİ` : 'Henüz başarılı okuma yok'}</span></div>
    {Object.values(errors).map(error => <div className={styles.error} role="alert" key={error}><TriangleAlert size={18} aria-hidden="true" /><p>{error}{errors.users === error && users && ' Liste son başarılı okumaya aittir; güncel bilgiler doğrulanamadı.'}</p></div>)}
    {uncertain && <div className={styles.error} role="alert"><TriangleAlert size={18} aria-hidden="true" /><p>Son işlemin sonucu doğrulanamadı. Yeni bir işlem yapmadan önce listeyi yenileyin.</p></div>}
    {notice && <div className={styles.notice} role="status"><CheckCircle2 size={18} aria-hidden="true" /><p>{notice}</p><button type="button" aria-label="İşlem bildirimini kapat" onClick={() => setNotice('')}><X size={16} aria-hidden="true" /></button></div>}
    <section aria-label="Kullanıcı özeti" className={styles.stats}>{stats.map(item => <article className={styles.stat} key={item.label}><div><h2>{item.label}</h2><span className={styles.icon}><item.icon size={18} aria-hidden="true" /></span></div><strong>{item.value === undefined ? '—' : item.value.toLocaleString('tr-TR')}</strong><p>{item.help}</p></article>)}</section>
    {actor && !canAccessSync(actor.role, 'users', 'write') && <div className={styles.info}><Eye size={18} aria-hidden="true" /><p>Bu ekranda görüntüleme yetkiniz var. Hesap oluşturma, düzenleme ve silme işlemleri rolünüze kapalıdır.</p></div>}
    <Tabs defaultValue="users" className="min-w-0"><TabsList className={styles.tabs}><TabsTrigger value="users"><UsersRound size={17} aria-hidden="true" />Kullanıcılar</TabsTrigger><TabsTrigger value="permissions"><ShieldCheck size={17} aria-hidden="true" />Rol ve erişim kuralları</TabsTrigger></TabsList>
      <TabsContent value="users" className="mt-5 space-y-5">
        <div className={styles.filters}><div className={styles.search}><Search size={16} aria-hidden="true" /><Input aria-label="Kullanıcı ara" placeholder="Ad soyad veya e-posta ile ara…" value={search} onChange={event => setSearch(event.target.value)} /></div><div><label htmlFor="users-role-filter" className="sr-only">Rol filtresi</label><select id="users-role-filter" value={role} onChange={event => setRole(event.target.value)}><option value="all">Tüm roller</option>{userRoles.map(item => <option value={item} key={item}>{roleLabels[item]}</option>)}</select></div><div><label htmlFor="users-status-filter" className="sr-only">Hesap durumu filtresi</label><select id="users-status-filter" value={status} onChange={event => setStatus(event.target.value)}><option value="all">Tüm hesap durumları</option>{userStatuses.map(item => <option value={item} key={item}>{statusLabels[item]}</option>)}</select></div>{hasFilters && <Button variant="outline" onClick={clear}><X size={16} aria-hidden="true" />Temizle</Button>}</div>
        <section className={styles.collection} aria-labelledby="users-list-title" aria-busy={loading}>
          <div className={styles.sectionHeader}><div><h2 id="users-list-title"><UsersRound size={19} aria-hidden="true" />Kullanıcı listesi</h2><p>Durum, atanmış rol ve son giriş kaydı</p></div><span aria-live="polite">{users ? `${filtered.length} / ${users.length} hesap gösteriliyor` : loading ? 'Liste yükleniyor…' : 'Liste alınamadı'}</span></div>
          {users === null ? <div className={styles.empty}><Info size={26} aria-hidden="true" /><h3>{loading ? 'Kullanıcılar yükleniyor…' : 'Kullanıcı listesi alınamadı'}</h3><p>{loading ? 'Hesaplar ve işlem yetkileri kontrol ediliyor.' : 'Bilgileri yenileyerek yeniden deneyebilirsiniz.'}</p></div> : !filtered.length ? <div className={styles.empty}><Filter size={26} aria-hidden="true" /><h3>{hasFilters ? 'Filtrelerle eşleşen kullanıcı yok' : 'Henüz kullanıcı kaydı yok'}</h3><p>{hasFilters ? 'Arama, rol veya hesap durumu filtresini değiştirin.' : 'Hesap oluşturma yetkiniz varsa yeni kullanıcı ekleyebilirsiniz.'}</p>{hasFilters && <Button variant="outline" onClick={clear}>Filtreleri temizle</Button>}</div> : <>
            <div className={styles.tableWrap}><table className={styles.userTable}><thead><tr><th scope="col">Kullanıcı</th><th scope="col">Hesap durumu</th><th scope="col">Rol</th><th scope="col">Son giriş kaydı</th><th scope="col">İşlem</th></tr></thead><tbody>{filtered.map(user => <tr key={user.id}><td><div className={styles.identity}><span className={styles.avatar}>{initials(user)}</span><div><strong>{user.name || 'Adsız kullanıcı'}{actor?.id === user.id && <small>Siz</small>}</strong><p>{user.email}</p></div></div></td><td><UserStateBadge status={user.status} /></td><td><UserRoleBadge role={user.role} /></td><td><LastLogin user={user} /></td><td><Button variant="outline" size="sm" aria-label={`${user.name || user.email} hesabını incele`} onClick={() => open(user)}><Eye size={15} aria-hidden="true" />İncele</Button></td></tr>)}</tbody></table></div>
            <div className={styles.mobileList}>{filtered.map(user => <article key={user.id} className={styles.userCard}><div className={styles.identity}><span className={styles.avatar}>{initials(user)}</span><div><h3>{user.name || 'Adsız kullanıcı'}{actor?.id === user.id && <small>Siz</small>}</h3><p>{user.email}</p></div></div><div className={styles.cardBadges}><UserStateBadge status={user.status} /><UserRoleBadge role={user.role} /></div><p className={styles.cardLogin}>Son giriş kaydı</p><LastLogin user={user} /><Button variant="outline" size="sm" aria-label={`${user.name || user.email} hesabını incele`} onClick={() => open(user)}><Eye size={15} aria-hidden="true" />Hesabı incele</Button></article>)}</div>
          </>}
          <p className={styles.collectionFoot}>Üstteki sayılar tüm kayıtlı hesaplara aittir. Hesap durumu ve son giriş kaydı, açık oturum sayısını göstermez.</p>
        </section>
      </TabsContent>
      <TabsContent value="permissions" className="mt-5"><RoleAccessMatrix /></TabsContent>
    </Tabs>
    <UserWorkspaceDialog mode={mode} user={selected} canWrite={canWrite} canDelete={canDelete} lastAdmin={lastAdmin} onClose={() => { setMode(null); setSelected(null); }} onMode={setMode} onSaved={message => { setNotice(message); setMode(null); setSelected(null); void load(); }} onUncertain={() => setUncertain(true)} onBusy={setBusy} />
  </div></div>;
}
