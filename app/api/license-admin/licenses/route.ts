import { NextRequest, NextResponse } from 'next/server';
import { LicenseStatus, LicenseTier } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireLicenseAdmin } from '@/lib/license/admin-auth';
import { createLicenseWithCustomer, maskLicenseKey } from '@/lib/license/admin-service';

function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  const authError = await requireLicenseAdmin(request);
  if (authError) return authError;

  const search = request.nextUrl.searchParams.get('search')?.trim();
  const tier = request.nextUrl.searchParams.get('tier');
  const status = request.nextUrl.searchParams.get('status');
  const expiry = request.nextUrl.searchParams.get('expiry');

  const now = new Date();
  const soon = new Date(now);
  soon.setDate(soon.getDate() + 30);

  const licenses = await prisma.license.findMany({
    where: {
      ...(tier && tier !== 'all' ? { tier: tier as LicenseTier } : {}),
      ...(status && status !== 'all' ? { status: status as LicenseStatus } : {}),
      ...(expiry === 'expiring' ? { validUntil: { lte: soon, gte: now } } : {}),
      ...(expiry === 'expired' ? { validUntil: { lt: now } } : {}),
      ...(search
        ? {
            OR: [
              { key: { contains: search, mode: 'insensitive' } },
              { customer: { companyName: { contains: search, mode: 'insensitive' } } },
              { customer: { email: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    include: {
      customer: true,
      _count: {
        select: {
          activations: true,
          heartbeats: true,
        },
      },
      activations: {
        where: { status: 'ACTIVE' },
        select: { id: true },
      },
      heartbeats: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return NextResponse.json({
    success: true,
    data: licenses.map((license) => ({
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
      activationCount: license.activations.length,
      totalActivationCount: license._count.activations,
      heartbeatCount: license._count.heartbeats,
      lastHeartbeatAt: license.heartbeats[0]?.createdAt.toISOString() || null,
      customer: {
        id: license.customer.id,
        companyName: license.customer.companyName,
        contactName: license.customer.contactName,
        email: license.customer.email,
        status: license.customer.status,
      },
      createdAt: license.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: NextRequest) {
  const authError = await requireLicenseAdmin(request);
  if (authError) return authError;

  const body = await request.json();
  const companyName = String(body.companyName || '').trim();
  const contactName = String(body.contactName || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const tier = String(body.tier || 'STANDARD') as LicenseTier;

  if (!companyName || !contactName || !email) {
    return NextResponse.json(
      { success: false, error: 'companyName, contactName, and email are required' },
      { status: 400 }
    );
  }

  if (!Object.values(LicenseTier).includes(tier)) {
    return NextResponse.json(
      { success: false, error: 'Invalid tier' },
      { status: 400 }
    );
  }

  const { customer, license } = await createLicenseWithCustomer(prisma, {
    companyName,
    contactName,
    email,
    phone: body.phone ? String(body.phone).trim() : undefined,
    notes: body.notes ? String(body.notes).trim() : undefined,
    tier,
    maxDevices: parsePositiveInt(body.maxDevices, 50),
    maxUsers: parsePositiveInt(body.maxUsers, 5),
    days: parsePositiveInt(body.days, 365),
    activationLimit: parsePositiveInt(body.activationLimit, 1),
  });

  return NextResponse.json({
    success: true,
    data: {
      id: license.id,
      key: license.key,
      maskedKey: maskLicenseKey(license.key),
      customer: {
        id: customer.id,
        companyName: customer.companyName,
        email: customer.email,
      },
      tier: license.tier,
      status: license.status,
      maxDevices: license.maxDevices,
      maxUsers: license.maxUsers,
      validUntil: license.validUntil.toISOString(),
      activationLimit: license.activationLimit,
    },
  });
}
