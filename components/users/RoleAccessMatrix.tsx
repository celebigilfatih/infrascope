'use client';
import { useState } from 'react';
import { BellRing, Building2, Check, Crown, Eye, Info, Monitor, Pencil, ScrollText, Search, Settings2, Shield, UsersRound, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { actionLabels, permissionActions, permissionResources, resourceLabels, roleAllows, roleDescriptions, roleLabels, rolePermissionCount, userRoles, userSearch, type WorkspaceRole } from '@/lib/users/workspace';
import styles from './users-workspace.module.css';

const resourceIcons = { users: UsersRound, alarms: BellRing, devices: Monitor, organizations: Building2, settings: Settings2, audit: ScrollText, firewall: Shield };
export function RoleAccessMatrix({ fixedRole }: { fixedRole?: WorkspaceRole | null }) {
  const [highlight, setHighlight] = useState<WorkspaceRole>('admin'), [search, setSearch] = useState('');
  const resources = permissionResources.filter(resource => userSearch(resourceLabels[resource]).includes(userSearch(search.trim())));
  const roles = fixedRole ? [fixedRole] : userRoles;
  if (fixedRole === null) return <p className={styles.muted}>Rol bilgisi alınamadığı için erişim kapsamı gösterilemiyor.</p>;
  return <div className={styles.roleWorkspace}>
    <div className={styles.info}><Info size={18} aria-hidden="true" /><p>Bu görünüm uygulamanın tanımlı rol kurallarını gösterir. Ortak rol yetkileri burada değiştirilemez. Bir kullanıcıya rol atamak için hesabını düzenleyin. İzinli bir işlem için lisans, ekran desteği ve ek koşullar da sağlanmalıdır; örneğin denetim kayıtları salt okunurdur.</p></div>
    {fixedRole ? <div className={styles.roleIntro}><h3>{roleLabels[fixedRole]} rolünün erişimi</h3><p>{roleDescriptions[fixedRole]}</p></div> : <>
      <div className={styles.roleCards}>{userRoles.map(role => { const Icon = role === 'admin' ? Crown : role === 'editor' ? Pencil : Eye; return <button key={role} type="button" aria-pressed={highlight === role} onClick={() => setHighlight(role)}><span className={styles.icon}><Icon size={18} aria-hidden="true" /></span><strong>{roleLabels[role]}</strong><p>{roleDescriptions[role]}</p><small>{rolePermissionCount(role)} kaynak / işlem izni · Sütunu vurgula</small></button>; })}</div>
      <div className={styles.search}><Search size={16} aria-hidden="true" /><Input aria-label="Yetki alanı ara" value={search} onChange={event => setSearch(event.target.value)} placeholder="Kullanıcılar, cihazlar, ayarlar…" /></div>
    </>}
    <div className={styles.resourceGrid}>{resources.map(resource => { const Icon = resourceIcons[resource]; return <section className={styles.resource} key={resource} aria-label={`${resourceLabels[resource]} erişim kuralları`}><h3><Icon size={18} aria-hidden="true" />{resourceLabels[resource]}</h3><table><caption className="sr-only">{resourceLabels[resource]} için rol ve işlem izinleri</caption><thead><tr><th scope="col">İşlem</th>{roles.map(role => <th scope="col" key={role} className={!fixedRole && role === highlight ? styles.highlight : undefined}>{roleLabels[role]}</th>)}</tr></thead><tbody>{permissionActions.map(action => <tr key={action}><th scope="row">{actionLabels[action]}</th>{roles.map(role => { const allowed = roleAllows(role, resource, action); return <td key={role} className={!fixedRole && role === highlight ? styles.highlight : undefined}>{allowed ? <Check size={17} aria-hidden="true" className={styles.allowed} /> : <X size={16} aria-hidden="true" className={styles.notAllowed} />}<span className="sr-only">{allowed ? 'Rol kuralında izin var' : 'Rol kuralında izin yok'}</span></td>; })}</tr>)}</tbody></table></section>; })}</div>
    {!resources.length && <p className={styles.empty}>Aramanızla eşleşen yetki alanı bulunamadı.</p>}
  </div>;
}
