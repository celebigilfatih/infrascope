export type Resource =
  | 'users'
  | 'alarms'
  | 'devices'
  | 'organizations'
  | 'settings'
  | 'audit'
  | 'firewall';
export type Action = 'read' | 'write' | 'delete';

export interface PermissionCheck {
  resource: Resource;
  action: Action;
}

// Static fallback used by Edge middleware, where Prisma is not available.
export const DEFAULT_PERMISSIONS: { resource: Resource; action: Action; roles: string[] }[] = [
  { resource: 'users', action: 'read', roles: ['ADMIN', 'EDITOR', 'VIEWER'] },
  { resource: 'users', action: 'write', roles: ['ADMIN', 'EDITOR'] },
  { resource: 'users', action: 'delete', roles: ['ADMIN'] },
  { resource: 'alarms', action: 'read', roles: ['ADMIN', 'EDITOR', 'VIEWER'] },
  { resource: 'alarms', action: 'write', roles: ['ADMIN', 'EDITOR'] },
  { resource: 'alarms', action: 'delete', roles: ['ADMIN'] },
  { resource: 'devices', action: 'read', roles: ['ADMIN', 'EDITOR', 'VIEWER'] },
  { resource: 'devices', action: 'write', roles: ['ADMIN', 'EDITOR'] },
  { resource: 'devices', action: 'delete', roles: ['ADMIN'] },
  { resource: 'organizations', action: 'read', roles: ['ADMIN', 'EDITOR', 'VIEWER'] },
  { resource: 'organizations', action: 'write', roles: ['ADMIN'] },
  { resource: 'organizations', action: 'delete', roles: ['ADMIN'] },
  { resource: 'settings', action: 'read', roles: ['ADMIN', 'EDITOR', 'VIEWER'] },
  { resource: 'settings', action: 'write', roles: ['ADMIN'] },
  { resource: 'settings', action: 'delete', roles: ['ADMIN'] },
  { resource: 'audit', action: 'read', roles: ['ADMIN'] },
  { resource: 'audit', action: 'write', roles: ['ADMIN'] },
  { resource: 'audit', action: 'delete', roles: ['ADMIN'] },
  { resource: 'firewall', action: 'read', roles: ['ADMIN', 'EDITOR', 'VIEWER'] },
  { resource: 'firewall', action: 'write', roles: ['ADMIN'] },
  { resource: 'firewall', action: 'delete', roles: ['ADMIN'] },
];

export function canAccessSync(
  userRole: string,
  resource: Resource,
  action: Action
): boolean {
  const permission = DEFAULT_PERMISSIONS.find(
    (item) => item.resource === resource && item.action === action
  );

  return permission?.roles.includes(userRole.toUpperCase()) ?? false;
}
