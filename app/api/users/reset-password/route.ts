import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, validatePasswordStrength } from '@/lib/auth/password';
import { logAudit } from '@/lib/audit/logger';
import { sendPasswordResetEmail } from '@/lib/email/sendInvitation';
import { validateBody } from '@/lib/validators';
import { resetPasswordConfirmSchema } from '@/lib/validators/users';
import crypto from 'crypto';

// Password reset token model stored in SystemConfig with special key pattern
const RESET_TOKEN_PREFIX = 'password_reset_';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email is required' },
        { status: 400 }
      );
    }

    // Find user by email
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Don't reveal whether email exists - security best practice
      return NextResponse.json({
        success: true,
        message: 'If an account with this email exists, a reset link has been sent',
      });
    }

    // Generate reset token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store token in SystemConfig
    await prisma.systemConfig.upsert({
      where: { key: `${RESET_TOKEN_PREFIX}${token}` },
      create: {
        key: `${RESET_TOKEN_PREFIX}${token}`,
        value: JSON.stringify({ userId: user.id, expiresAt: expiresAt.toISOString() }),
      },
      update: {
        value: JSON.stringify({ userId: user.id, expiresAt: expiresAt.toISOString() }),
      },
    });

    // Send reset email
    await sendPasswordResetEmail({
      to: email,
      token,
      userName: user.name,
    });

    // Audit log
    await logAudit({
      userId: user.id,
      action: 'user.password_reset_request',
      resource: 'user',
      resourceId: user.id,
    });

    return NextResponse.json({
      success: true,
      message: 'If an account with this email exists, a reset link has been sent',
    });
  } catch (error) {
    console.error('Error requesting password reset:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

// Verify token and set new password
export async function PATCH(request: Request) {
  try {
    const rawBody = await request.json();
    const parsed = validateBody(rawBody, resetPasswordConfirmSchema);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error },
        { status: 400 }
      );
    }
    const { token, newPassword } = parsed.data;

    // Validate password strength
    const validation = validatePasswordStrength(newPassword);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: 'Password does not meet requirements', details: validation.errors },
        { status: 400 }
      );
    }

    // Look up token
    const config = await prisma.systemConfig.findUnique({
      where: { key: `${RESET_TOKEN_PREFIX}${token}` },
    });

    if (!config) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired reset token' },
        { status: 400 }
      );
    }

    const tokenData = JSON.parse(config.value) as { userId: string; expiresAt: string };

    // Check expiry
    if (new Date() > new Date(tokenData.expiresAt)) {
      // Delete expired token
      await prisma.systemConfig.delete({ where: { key: config.key } });
      return NextResponse.json(
        { success: false, error: 'Reset token has expired' },
        { status: 400 }
      );
    }

    // Hash and update password
    const hashedPassword = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: tokenData.userId },
      data: { password: hashedPassword },
    });

    // Delete used token
    await prisma.systemConfig.delete({ where: { key: config.key } });

    // Log activity
    await prisma.userActivity.create({
      data: {
        userId: tokenData.userId,
        action: 'password_reset',
      },
    });

    // Audit log
    await logAudit({
      userId: tokenData.userId,
      action: 'user.password_reset_complete',
      resource: 'user',
      resourceId: tokenData.userId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error resetting password:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

// Validate a reset token (GET)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Token is required' },
        { status: 400 }
      );
    }

    const config = await prisma.systemConfig.findUnique({
      where: { key: `${RESET_TOKEN_PREFIX}${token}` },
    });

    if (!config) {
      return NextResponse.json({ success: false, error: 'Invalid token', valid: false });
    }

    const tokenData = JSON.parse(config.value) as { userId: string; expiresAt: string };

    if (new Date() > new Date(tokenData.expiresAt)) {
      await prisma.systemConfig.delete({ where: { key: config.key } });
      return NextResponse.json({ success: false, error: 'Token expired', valid: false });
    }

    return NextResponse.json({ success: true, valid: true });
  } catch (error) {
    console.error('Error validating reset token:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
