import { NextRequest, NextResponse } from 'next/server';
import { CustomerStatus, LicenseTier } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireLicenseAdmin } from '@/lib/license/admin-auth';

export async function GET(request: NextRequest) {
  const authError = await requireLicenseAdmin(request);
  if (authError) return authError;

  const customers = await prisma.customer.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: {
          licenses: true,
          activations: true,
        },
      },
      licenses: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  return NextResponse.json({
    success: true,
    data: customers.map((customer) => ({
      id: customer.id,
      companyName: customer.companyName,
      contactName: customer.contactName,
      email: customer.email,
      phone: customer.phone,
      tier: customer.tier,
      status: customer.status,
      notes: customer.notes,
      licenseCount: customer._count.licenses,
      activationCount: customer._count.activations,
      latestLicenseStatus: customer.licenses[0]?.status || null,
      createdAt: customer.createdAt.toISOString(),
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
  const status = String(body.status || 'ACTIVE') as CustomerStatus;

  if (!companyName || !contactName || !email) {
    return NextResponse.json(
      { success: false, error: 'companyName, contactName, and email are required' },
      { status: 400 }
    );
  }

  if (!Object.values(LicenseTier).includes(tier) || !Object.values(CustomerStatus).includes(status)) {
    return NextResponse.json(
      { success: false, error: 'Invalid tier or status' },
      { status: 400 }
    );
  }

  const customer = await prisma.customer.upsert({
    where: { email },
    create: {
      companyName,
      contactName,
      email,
      phone: body.phone ? String(body.phone).trim() : undefined,
      notes: body.notes ? String(body.notes).trim() : undefined,
      tier,
      status,
    },
    update: {
      companyName,
      contactName,
      phone: body.phone ? String(body.phone).trim() : undefined,
      notes: body.notes ? String(body.notes).trim() : undefined,
      tier,
      status,
    },
  });

  return NextResponse.json({ success: true, data: customer });
}
