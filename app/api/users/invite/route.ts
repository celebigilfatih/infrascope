import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendInvitationEmail } from '@/lib/email/sendInvitation';
import { logAudit } from '@/lib/audit/logger';
import crypto from 'crypto';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, role } = body;

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email is required' },
        { status: 400 }
      );
    }

    // Determine the inviter from server-side context.
    // TODO: Replace with real session-based user lookup when auth is implemented.
    // For now, find the first admin user as the default inviter.
    const adminUser = await prisma.user.findFirst({
      where: { role: 'ADMIN', status: 'ACTIVE' },
      select: { id: true, name: true },
    });
    const invitedBy = adminUser?.name || 'System';
    const invitedByUserId = adminUser?.id || undefined;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json(
        { success: false, error: 'A user with this email already exists' },
        { status: 400 }
      );
    }

    // Check for existing pending invitation
    const existingInvitation = await prisma.invitation.findUnique({ where: { email } });
    if (existingInvitation && existingInvitation.status === 'PENDING') {
      if (new Date() < existingInvitation.expiresAt) {
        return NextResponse.json(
          { success: false, error: 'A pending invitation already exists for this email' },
          { status: 400 }
        );
      }
      await prisma.invitation.delete({ where: { id: existingInvitation.id } });
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invitation = await prisma.invitation.create({
      data: {
        email,
        role: role?.toUpperCase() || 'VIEWER',
        token,
        invitedBy,
        status: 'PENDING',
        expiresAt,
      },
    });

    // Send invitation email
    const emailSent = await sendInvitationEmail({
      to: email,
      token,
      invitedBy,
      role: invitation.role.toLowerCase(),
    });

    // Audit log — use the actual admin user ID if available
    await logAudit({
      userId: invitedByUserId,
      action: 'invitation.create',
      resource: 'invitation',
      resourceId: invitation.id,
      details: { email, role: invitation.role, emailSent, invitedBy },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role.toLowerCase(),
        status: invitation.status.toLowerCase(),
        expiresAt: invitation.expiresAt,
        emailSent,
      },
    });
  } catch (error) {
    console.error('Error creating invitation:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    // Auto-expire old pending invitations
    await prisma.invitation.updateMany({
      where: {
        status: 'PENDING',
        expiresAt: { lt: new Date() },
      },
      data: { status: 'EXPIRED' },
    });

    const invitations = await prisma.invitation.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const formatted = invitations.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role.toLowerCase(),
      status: inv.status.toLowerCase(),
      invitedBy: inv.invitedBy,
      expiresAt: inv.expiresAt,
      acceptedAt: inv.acceptedAt,
      createdAt: inv.createdAt,
    }));

    const stats = {
      total: invitations.length,
      pending: invitations.filter((i) => i.status === 'PENDING').length,
      accepted: invitations.filter((i) => i.status === 'ACCEPTED').length,
      expired: invitations.filter((i) => i.status === 'EXPIRED').length,
    };

    return NextResponse.json({ success: true, data: formatted, stats });
  } catch (error) {
    console.error('Error fetching invitations:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
