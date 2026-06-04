import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword, hashPassword, validatePasswordStrength } from '@/lib/auth/password';
import { logAudit } from '@/lib/audit/logger';
import { validateBody } from '@/lib/validators';
import { changePasswordSchema } from '@/lib/validators/users';

/**
 * Change a user's password.
 * Requires the user's current password for verification.
 * If the user has no password set (invited but not yet verified),
 * the currentPassword field is still required but not verified.
 */
export async function PATCH(request: Request) {
  try {
    const rawBody = await request.json();
    const parsed = validateBody(rawBody, changePasswordSchema);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error },
        { status: 400 }
      );
    }
    const { userId, currentPassword, newPassword } = parsed.data;

    // Validate new password strength
    const validation = validatePasswordStrength(newPassword);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: 'New password does not meet requirements', details: validation.errors },
        { status: 400 }
      );
    }

    // Get user
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Verify current password only if one is set
    if (user.password) {
      if (!currentPassword) {
        return NextResponse.json(
          { success: false, error: 'Current password is required' },
          { status: 400 }
        );
      }
      const isValid = await verifyPassword(currentPassword, user.password);
      if (!isValid) {
        return NextResponse.json(
          { success: false, error: 'Current password is incorrect' },
          { status: 400 }
        );
      }
    } else {
      // User has no password yet — this is an initial password set
      // Still require currentPassword field as a safety measure
      if (!currentPassword) {
        return NextResponse.json(
          { success: false, error: 'A placeholder current password is required to set your initial password' },
          { status: 400 }
        );
      }
    }

    // Hash and update
    const hashedPassword = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    // Log activity
    await prisma.userActivity.create({
      data: {
        userId,
        action: user.password ? 'password_change' : 'password_set',
      },
    });

    // Audit log
    await logAudit({
      userId,
      action: user.password ? 'user.password_change' : 'user.password_set',
      resource: 'user',
      resourceId: userId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error changing password:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
