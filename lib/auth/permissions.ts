import { prisma } from '@/lib/prisma';

export type Resource = 'users' | 'alarms' | 'devices' | 'organizations' | 'settings' | 'audit';
export type Action = 'read' | 'write' | 'delete';

export interface PermissionCheck {
  resource: Resource;
  action: Action;
}

// Default permission matrix seeded on first run
const DEFAULT_PERMISSIONS: { resource: Resource; action: Action; roles: string[] }[] = [
  // Users
  { resource: 'users', action: 'read', roles: ['ADMIN', 'EDITOR', 'VIEWER'] },
  { resource: 'users', action: 'write', roles: ['ADMIN', 'EDITOR'] },
  { resource: 'users', action: 'delete', roles: ['ADMIN'] },
  // Alarms
  { resource: 'alarms', action: 'read', roles: ['ADMIN', 'EDITOR', 'VIEWER'] },
  { resource: 'alarms', action: 'write', roles: ['ADMIN', 'EDITOR'] },
  { resource: 'alarms', action: 'delete', roles: ['ADMIN'] },
  // Devices
  { resource: 'devices', action: 'read', roles: ['ADMIN', 'EDITOR', 'VIEWER'] },
  { resource: 'devices', action: 'write', roles: ['ADMIN', 'EDITOR'] },
  { resource: 'devices', action: 'delete', roles: ['ADMIN'] },
  // Organizations
  { resource: 'organizations', action: 'read', roles: ['ADMIN', 'EDITOR', 'VIEWER'] },
  { resource: 'organizations', action: 'write', roles: ['ADMIN'] },
  { resource: 'organizations', action: 'delete', roles: ['ADMIN'] },
  // Settings
  { resource: 'settings', action: 'read', roles: ['ADMIN', 'EDITOR', 'VIEWER'] },
  { resource: 'settings', action: 'write', roles: ['ADMIN'] },
  { resource: 'settings', action: 'delete', roles: ['ADMIN'] },
  // Audit
  { resource: 'audit', action: 'read', roles: ['ADMIN'] },
  { resource: 'audit', action: 'write', roles: ['ADMIN'] },
  { resource: 'audit', action: 'delete', roles: ['ADMIN'] },
];

/**
 * Check if a user role has access to a specific resource/action combination.
 * Uses the database RolePermission table for dynamic permission checking.
 */
export async function canAccess(
  userRole: string,
  resource: Resource,
  action: Action
): Promise<boolean> {
  const permission = await prisma.permission.findUnique({
    where: { resource_action: { resource, action } },
    include: { roles: true },
  });

  if (!permission) return false;

  return permission.roles.some((rp) => rp.roleId === userRole.toUpperCase());
}

/**
 * Synchronous permission check using the default permission matrix.
 * Use this for middleware where DB access may not be available.
 */
export function canAccessSync(
  userRole: string,
  resource: Resource,
  action: Action
): boolean {
  const permission = DEFAULT_PERMISSIONS.find(
    (p) => p.resource === resource && p.action === action
  );

  if (!permission) return false;

  return permission.roles.includes(userRole.toUpperCase());
}

/**
 * Get all permissions for a specific role.
 */
export async function getRolePermissions(role: string) {
  const rolePermissions = await prisma.rolePermission.findMany({
    where: { roleId: role.toUpperCase() as any },
    include: { permission: true },
  });

  return rolePermissions.map((rp) => ({
    id: rp.permission.id,
    resource: rp.permission.resource,
    action: rp.permission.action,
    description: rp.permission.description,
    granted: true,
  }));
}

/**
 * Get the full permission matrix (all permissions with role assignments).
 */
export async function getPermissionMatrix() {
  const permissions = await prisma.permission.findMany({
    include: { roles: true },
    orderBy: [{ resource: 'asc' }, { action: 'asc' }],
  });

  return permissions.map((p) => ({
    id: p.id,
    resource: p.resource,
    action: p.action,
    description: p.description,
    admin: p.roles.some((r) => r.roleId === 'ADMIN'),
    editor: p.roles.some((r) => r.roleId === 'EDITOR'),
    viewer: p.roles.some((r) => r.roleId === 'VIEWER'),
  }));
}

/**
 * Toggle a permission for a role.
 */
export async function togglePermission(permissionId: string, roleId: string, granted: boolean) {
  const upperRole = roleId.toUpperCase() as any;

  if (granted) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: upperRole, permissionId },
      },
      create: { roleId: upperRole, permissionId },
      update: {},
    });
  } else {
    await prisma.rolePermission.deleteMany({
      where: { roleId: upperRole, permissionId },
    });
  }
}

/**
 * Seed default permissions into the database.
 * Safe to call multiple times - will skip existing entries.
 */
export async function seedPermissions() {
  for (const perm of DEFAULT_PERMISSIONS) {
    const permission = await prisma.permission.upsert({
      where: { resource_action: { resource: perm.resource, action: perm.action } },
      create: {
        resource: perm.resource,
        action: perm.action,
        description: `${perm.action} ${perm.resource}`,
      },
      update: {},
    });

    for (const role of perm.roles) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role as any, permissionId: permission.id },
        },
        create: { roleId: role as any, permissionId: permission.id },
        update: {},
      });
    }
  }
}
