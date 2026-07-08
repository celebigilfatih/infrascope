import { NextResponse } from 'next/server';
import { UserRole, UserStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit/logger';
import { validateBody } from '@/lib/validators';
import { createUserSchema, updateUserSchema } from '@/lib/validators/users';
import { checkUserLimit } from '@/lib/license/middleware';
import { hashPassword, validatePasswordStrength } from '@/lib/auth/password';

export async function GET() {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const formattedUsers = users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role.toLowerCase(),
      status: user.status.toLowerCase(),
      lastLogin: user.lastLoginAt ? formatTimeAgo(user.lastLoginAt) : 'Never',
    }));

    // Calculate stats
    const stats = {
      total: users.length,
      active: users.filter((u) => u.status === 'ACTIVE').length,
      inactive: users.filter((u) => u.status === 'INACTIVE').length,
      admins: users.filter((u) => u.role === 'ADMIN').length,
    };

    return NextResponse.json({
      success: true,
      data: formattedUsers,
      stats,
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message, data: [] },
      { status: 500 }
    );
  }
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays < 7) return `${diffDays} days ago`;
  return new Date(date).toLocaleDateString();
}

export async function POST(request: Request) {
  try {
    const currentUserCount = await prisma.user.count();
    const licenseError = await checkUserLimit(currentUserCount);
    if (licenseError) return licenseError;

    const rawBody = await request.json();
    const parsed = validateBody(rawBody, createUserSchema);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error },
        { status: 400 }
      );
    }

    const { name, email, password, role, status } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: 'Password does not meet requirements',
          details: passwordValidation.errors,
        },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: 'Email already exists' },
        { status: 400 }
      );
    }

    const user = await prisma.user.create({
      data: {
        name,
        email: normalizedEmail,
        password: await hashPassword(password),
        role: role.toUpperCase() as UserRole,
        status: (status?.toUpperCase() || 'ACTIVE') as UserStatus,
      },
    });

    // Log activity
    await prisma.userActivity.create({
      data: {
        userId: user.id,
        action: 'create_user',
        details: { name: user.name, email: user.email, role: user.role },
      },
    });

    // Audit log
    await logAudit({
      userId: user.id,
      action: 'user.create',
      resource: 'user',
      resourceId: user.id,
      details: { name: user.name, email: user.email, role: user.role },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role.toLowerCase(),
        status: user.status.toLowerCase(),
      },
    });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const rawBody = await request.json();
    const parsed = validateBody(rawBody, updateUserSchema);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error },
        { status: 400 }
      );
    }
    const { id, name, email, role, status } = parsed.data;

    const updateData: Record<string, unknown> = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (role) updateData.role = role.toUpperCase();
    if (status) updateData.status = status.toUpperCase();

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    // Log activity
    await prisma.userActivity.create({
      data: {
        userId: user.id,
        action: 'edit_user',
        details: { updatedFields: Object.keys(updateData) },
      },
    });

    // Audit log
    await logAudit({
      userId: user.id,
      action: 'user.update',
      resource: 'user',
      resourceId: user.id,
      details: { updatedFields: Object.keys(updateData) },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role.toLowerCase(),
        status: user.status.toLowerCase(),
      },
    });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'User ID required' },
        { status: 400 }
      );
    }

    // Get user info before deletion for audit
    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Prevent deleting the last admin
    if (user.role === 'ADMIN') {
      const adminCount = await prisma.user.count({
        where: { role: 'ADMIN' },
      });
      if (adminCount <= 1) {
        return NextResponse.json(
          { success: false, error: 'Cannot delete the last admin user' },
          { status: 400 }
        );
      }
    }

    await prisma.user.delete({
      where: { id },
    });

    // Audit log — userId is null since user is deleted
    // Audit log — userId is null since the user is being deleted
    await logAudit({
      action: 'user.delete',
      resource: 'user',
      resourceId: id,
      details: { name: user.name, email: user.email, role: user.role },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
