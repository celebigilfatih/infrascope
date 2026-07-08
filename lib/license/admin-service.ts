import crypto from 'crypto';
import type { PrismaClient, LicenseTier } from '@prisma/client';

const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export type CreateLicenseInput = {
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  notes?: string;
  tier: LicenseTier;
  maxDevices: number;
  maxUsers: number;
  days: number;
  activationLimit: number;
};

function randomGroup(length = 4): string {
  const bytes = crypto.randomBytes(length);
  let group = '';
  for (const byte of bytes) {
    group += KEY_ALPHABET[byte % KEY_ALPHABET.length];
  }
  return group;
}

export function maskLicenseKey(key: string): string {
  if (key.length <= 8) return '****';
  return `${key.slice(0, 7)}-****-****-${key.slice(-4)}`;
}

export function generateLicenseKey(): string {
  const year = new Date().getUTCFullYear();
  return `IS-${year}-${randomGroup()}-${randomGroup()}-${randomGroup()}`;
}

export async function generateUniqueLicenseKey(prisma: PrismaClient): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const key = generateLicenseKey();
    const existing = await prisma.license.findUnique({ where: { key } });
    if (!existing) return key;
  }
  throw new Error('Could not generate a unique license key after 10 attempts');
}

export async function createLicenseWithCustomer(prisma: PrismaClient, input: CreateLicenseInput) {
  const validFrom = new Date();
  const validUntil = new Date(validFrom);
  validUntil.setUTCDate(validUntil.getUTCDate() + input.days);

  const key = await generateUniqueLicenseKey(prisma);
  const email = input.email.trim().toLowerCase();

  const customer = await prisma.customer.upsert({
    where: { email },
    create: {
      companyName: input.companyName.trim(),
      contactName: input.contactName.trim(),
      email,
      phone: input.phone?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      tier: input.tier,
      status: 'ACTIVE',
    },
    update: {
      companyName: input.companyName.trim(),
      contactName: input.contactName.trim(),
      phone: input.phone?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      tier: input.tier,
      status: 'ACTIVE',
    },
  });

  const license = await prisma.license.create({
    data: {
      key,
      customerId: customer.id,
      tier: input.tier,
      maxDevices: input.maxDevices,
      maxUsers: input.maxUsers,
      validFrom,
      validUntil,
      status: 'ACTIVE',
      activationLimit: input.activationLimit,
    },
  });

  return { customer, license };
}
