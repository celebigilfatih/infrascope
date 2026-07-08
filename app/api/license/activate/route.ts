/**
 * POST /api/license/activate
 *
 * Activate a license key on a machine.
 * Called by the on-premise installation during first setup.
 *
 * Body: { licenseKey: string, machineId: string }
 * Returns: { token: string, state: LicenseState }
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signLicenseToken } from '@/lib/license/jwt';
import { requireLicenseServerMode } from '@/lib/license/server-mode';
import type { LicenseState } from '@/lib/license/client';

export async function POST(req: NextRequest) {
  try {
    const modeError = requireLicenseServerMode();
    if (modeError) return modeError;

    const { licenseKey, machineId } = await req.json();

    if (!licenseKey || !machineId) {
      return NextResponse.json(
        { error: 'licenseKey and machineId are required' },
        { status: 400 }
      );
    }

    // Find the license
    const license = await prisma.license.findUnique({
      where: { key: licenseKey },
      include: { customer: true },
    });

    if (!license) {
      return NextResponse.json(
        { error: 'Invalid license key' },
        { status: 404 }
      );
    }

    // Check license status
    if (license.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: `License is ${license.status.toLowerCase()}` },
        { status: 403 }
      );
    }

    // Check expiry
    if (new Date() > license.validUntil) {
      await prisma.license.update({
        where: { id: license.id },
        data: { status: 'EXPIRED' },
      });
      return NextResponse.json(
        { error: 'License has expired', daysRemaining: 0 },
        { status: 403 }
      );
    }

    // Check activation limit
    const activeActivations = await prisma.licenseActivation.count({
      where: { licenseId: license.id, status: 'ACTIVE' },
    });

    // Check if this machine is already activated
    const existingActivation = await prisma.licenseActivation.findFirst({
      where: { licenseId: license.id, machineId, status: 'ACTIVE' },
    });

    if (!existingActivation && activeActivations >= license.activationLimit) {
      return NextResponse.json(
        {
          error: 'Activation limit reached',
          activationLimit: license.activationLimit,
          activeActivations,
        },
        { status: 403 }
      );
    }

    // Upsert activation
    const activation = await prisma.licenseActivation.upsert({
      where: {
        licenseId_machineId: { licenseId: license.id, machineId },
      },
      update: {
        status: 'ACTIVE',
        lastSeenAt: new Date(),
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
        version: req.headers.get('x-app-version') || undefined,
      },
      create: {
        licenseId: license.id,
        customerId: license.customerId,
        machineId,
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
        version: req.headers.get('x-app-version') || undefined,
      },
    });

    // Calculate days remaining
    const daysRemaining = Math.max(
      0,
      Math.ceil((license.validUntil.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    );

    // Sign JWT token
    const token = await signLicenseToken({
      licenseId: license.id,
      customerId: license.customerId,
      key: license.key,
      tier: license.tier,
      maxDevices: license.maxDevices,
      maxUsers: license.maxUsers,
      validUntil: license.validUntil.toISOString(),
      machineId,
    });

    // Build response state
    const state: LicenseState = {
      valid: true,
      tier: license.tier as LicenseState['tier'],
      maxDevices: license.maxDevices,
      maxUsers: license.maxUsers,
      validUntil: license.validUntil.toISOString(),
      daysRemaining,
      graceMode: false,
      lastValidated: new Date().toISOString(),
      licenseKey: license.key.slice(0, 4) + '****' + license.key.slice(-4),
      machineId,
    };

    console.log(
      `[License] Activated: ${license.key} on ${machineId.slice(0, 12)}... ` +
      `(${license.tier}, ${daysRemaining}d remaining)`
    );

    return NextResponse.json({ token, state });
  } catch (err) {
    console.error('[License] Activation error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
