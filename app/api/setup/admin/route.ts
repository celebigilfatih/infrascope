import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, validatePasswordStrength } from '@/lib/auth/password';
import { getSetupStatus } from '@/lib/setup/status';

export async function POST(request: Request) {
  try {
    const setup = await getSetupStatus();
    if (!setup.setupRequired) {
      return NextResponse.json(
        { success: false, error: 'Setup is already completed' },
        { status: 403 }
      );
    }

    const { name, email, password, companyName } = await request.json();
    if (!name || !email || !password) {
      return NextResponse.json(
        { success: false, error: 'name, email, and password are required' },
        { status: 400 }
      );
    }

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

    const result = await prisma.$transaction(async (tx) => {
      const existingUsers = await tx.user.count();
      if (existingUsers > 0) {
        throw new Error('SETUP_ALREADY_COMPLETED');
      }

      const organizationName = (companyName || 'Default Organization').trim();
      const organization = await tx.organization.upsert({
        where: { code: 'DEFAULT' },
        create: {
          name: organizationName,
          code: 'DEFAULT',
          description: 'Created during first-run setup',
        },
        update: {
          name: organizationName,
        },
      });

      const user = await tx.user.create({
        data: {
          name: String(name).trim(),
          email: String(email).trim().toLowerCase(),
          password: await hashPassword(password),
          role: 'ADMIN',
          status: 'ACTIVE',
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
        },
      });

      await tx.userActivity.create({
        data: {
          userId: user.id,
          action: 'first_admin_created',
          details: { organizationId: organization.id },
        },
      });

      return { user, organization };
    });

    return NextResponse.json({
      success: true,
      user: {
        ...result.user,
        role: result.user.role.toLowerCase(),
        status: result.user.status.toLowerCase(),
      },
      organization: result.organization,
    });
  } catch (error) {
    if ((error as Error).message === 'SETUP_ALREADY_COMPLETED') {
      return NextResponse.json(
        { success: false, error: 'Setup is already completed' },
        { status: 403 }
      );
    }

    console.error('[Setup] Admin creation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create first admin' },
      { status: 500 }
    );
  }
}
