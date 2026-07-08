import { NextRequest, NextResponse } from 'next/server';
import { ActivationStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireLicenseAdmin } from '@/lib/license/admin-auth';

type RouteContext = {
  params: { id: string; activationId: string };
};

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authError = await requireLicenseAdmin(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({}));
  const status = String(body.status || 'DEACTIVATED') as ActivationStatus;

  if (!Object.values(ActivationStatus).includes(status)) {
    return NextResponse.json(
      { success: false, error: 'Invalid activation status' },
      { status: 400 }
    );
  }

  const activation = await prisma.licenseActivation.findFirst({
    where: {
      id: params.activationId,
      licenseId: params.id,
    },
  });

  if (!activation) {
    return NextResponse.json(
      { success: false, error: 'Activation not found' },
      { status: 404 }
    );
  }

  const updated = await prisma.licenseActivation.update({
    where: { id: params.activationId },
    data: { status },
  });

  return NextResponse.json({
    success: true,
    data: {
      id: updated.id,
      status: updated.status,
      machineId: updated.machineId,
    },
  });
}
