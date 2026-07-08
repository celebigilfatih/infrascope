import { NextRequest, NextResponse } from 'next/server';
import { LicenseStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireLicenseAdmin } from '@/lib/license/admin-auth';
import { maskLicenseKey } from '@/lib/license/admin-service';

type RouteContext = {
  params: { id: string };
};

function parseOptionalPositiveInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const authError = await requireLicenseAdmin(request);
  if (authError) return authError;

  const license = await prisma.license.findUnique({
    where: { id: params.id },
    include: {
      customer: true,
      activations: {
        orderBy: { activatedAt: 'desc' },
      },
      heartbeats: {
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
    },
  });

  if (!license) {
    return NextResponse.json(
      { success: false, error: 'License not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      id: license.id,
      key: maskLicenseKey(license.key),
      fullKey: license.key,
      tier: license.tier,
      status: license.status,
      maxDevices: license.maxDevices,
      maxUsers: license.maxUsers,
      validFrom: license.validFrom.toISOString(),
      validUntil: license.validUntil.toISOString(),
      activationLimit: license.activationLimit,
      customer: {
        id: license.customer.id,
        companyName: license.customer.companyName,
        contactName: license.customer.contactName,
        email: license.customer.email,
        phone: license.customer.phone,
        status: license.customer.status,
      },
      activations: license.activations.map((activation) => ({
        id: activation.id,
        machineId: activation.machineId,
        activatedAt: activation.activatedAt.toISOString(),
        lastSeenAt: activation.lastSeenAt?.toISOString() || null,
        ipAddress: activation.ipAddress,
        hostname: activation.hostname,
        version: activation.version,
        status: activation.status,
        usageData: activation.usageData,
      })),
      heartbeats: license.heartbeats.map((heartbeat) => ({
        id: heartbeat.id,
        machineId: heartbeat.machineId,
        deviceCount: heartbeat.deviceCount,
        userCount: heartbeat.userCount,
        appVersion: heartbeat.appVersion,
        ipAddress: heartbeat.ipAddress,
        createdAt: heartbeat.createdAt.toISOString(),
      })),
    },
  });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authError = await requireLicenseAdmin(request);
  if (authError) return authError;

  const body = await request.json();
  const updateData: {
    status?: LicenseStatus;
    maxDevices?: number;
    maxUsers?: number;
    validUntil?: Date;
    activationLimit?: number;
  } = {};

  if (body.status !== undefined) {
    const status = String(body.status) as LicenseStatus;
    if (!Object.values(LicenseStatus).includes(status)) {
      return NextResponse.json(
        { success: false, error: 'Invalid license status' },
        { status: 400 }
      );
    }
    updateData.status = status;
  }

  const maxDevices = parseOptionalPositiveInt(body.maxDevices);
  const maxUsers = parseOptionalPositiveInt(body.maxUsers);
  const activationLimit = parseOptionalPositiveInt(body.activationLimit);
  if (maxDevices !== undefined) updateData.maxDevices = maxDevices;
  if (maxUsers !== undefined) updateData.maxUsers = maxUsers;
  if (activationLimit !== undefined) updateData.activationLimit = activationLimit;

  if (body.validUntil) {
    const validUntil = new Date(String(body.validUntil));
    if (Number.isNaN(validUntil.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Invalid validUntil date' },
        { status: 400 }
      );
    }
    updateData.validUntil = validUntil;
  }

  const license = await prisma.license.update({
    where: { id: params.id },
    data: updateData,
    include: { customer: true },
  });

  return NextResponse.json({
    success: true,
    data: {
      id: license.id,
      key: maskLicenseKey(license.key),
      tier: license.tier,
      status: license.status,
      maxDevices: license.maxDevices,
      maxUsers: license.maxUsers,
      validUntil: license.validUntil.toISOString(),
      activationLimit: license.activationLimit,
      customer: {
        id: license.customer.id,
        companyName: license.customer.companyName,
        email: license.customer.email,
      },
    },
  });
}
