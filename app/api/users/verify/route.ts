import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit/logger';
import { hashPassword, validatePasswordStrength } from '@/lib/auth/password';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token, name, password } = body;

    if (!token || !name || !password) {
      return NextResponse.json(
        { success: false, error: 'Token, name, and password are required' },
        { status: 400 }
      );
    }

    // Find invitation by token
    const invitation = await prisma.invitation.findUnique({ where: { token } });

    if (!invitation) {
      return NextResponse.json(
        { success: false, error: 'Invalid invitation token' },
        { status: 400 }
      );
    }

    // Check if already accepted
    if (invitation.status === 'ACCEPTED') {
      return NextResponse.json(
        { success: false, error: 'This invitation has already been used' },
        { status: 400 }
      );
    }

    // Check if expired
    if (invitation.status === 'EXPIRED' || new Date() > invitation.expiresAt) {
      // Mark as expired if not already
      if (invitation.status !== 'EXPIRED') {
        await prisma.invitation.update({
          where: { id: invitation.id },
          data: { status: 'EXPIRED' },
        });
      }
      return NextResponse.json(
        { success: false, error: 'This invitation has expired' },
        { status: 400 }
      );
    }

    // Check if user with this email already exists (edge case)
    const existingUser = await prisma.user.findUnique({ where: { email: invitation.email } });
    if (existingUser) {
      return NextResponse.json(
        { success: false, error: 'A user with this email already exists' },
        { status: 400 }
      );
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { success: false, error: 'Password does not meet requirements', details: passwordValidation.errors },
        { status: 400 }
      );
    }

    // Create user with hashed password
    // Hash the password with bcrypt before storing
    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        name,
        email: invitation.email,
        password: hashedPassword,
        role: invitation.role,
        status: 'ACTIVE',
      },
    });

    // Mark invitation as accepted
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date(),
      },
    });

    // Log activity
    await prisma.userActivity.create({
      data: {
        userId: user.id,
        action: 'account_created',
      },
    });

    // Audit log
    await logAudit({
      userId: user.id,
      action: 'invitation.accept',
      resource: 'invitation',
      resourceId: invitation.id,
      details: { email: invitation.email, role: invitation.role },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role.toLowerCase(),
      },
    });
  } catch (error) {
    console.error('Error verifying invitation:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

// GET endpoint to validate a token before showing the form
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

    const invitation = await prisma.invitation.findUnique({ where: { token } });

    if (!invitation) {
      return NextResponse.json(
        { success: false, error: 'Invalid invitation token', valid: false },
        { status: 400 }
      );
    }

    if (invitation.status === 'ACCEPTED') {
      return NextResponse.json({
        success: false,
        error: 'This invitation has already been used',
        valid: false,
      });
    }

    if (invitation.status === 'EXPIRED' || new Date() > invitation.expiresAt) {
      return NextResponse.json({
        success: false,
        error: 'This invitation has expired',
        valid: false,
      });
    }

    return NextResponse.json({
      success: true,
      valid: true,
      data: {
        email: invitation.email,
        role: invitation.role.toLowerCase(),
        invitedBy: invitation.invitedBy,
        expiresAt: invitation.expiresAt,
      },
    });
  } catch (error) {
    console.error('Error validating invitation token:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

