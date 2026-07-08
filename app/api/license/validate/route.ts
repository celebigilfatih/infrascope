/**
 * POST /api/license/validate
 *
 * Validate an existing license activation.
 * Called periodically by the on-premise installation (every 24h).
 *
 * Body: { licenseKey: string, machineId: string, token?: string }
 * Returns: { valid: boolean, state: LicenseState, token?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signLicenseToken, verifyLicenseToken } from '@/lib/license/jwt';
import { requireLicenseServerMode } from '@/lib/license/server-mode';
import type { LicenseState } from '@/lib/license/client';

export async function POST(req: NextRequest) {
  try {
    const modeError = requireLicenseServerMode();
    if (modeError) return modeError;

    const { licenseKey, machineId, token } = await req.json();

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
        { valid: false, error: 'Invalid license key' },
        { status: 404 }
      );
    }

    // Check license status
    if (license.status !== 'ACTIVE') {
      return NextResponse.json(
        { valid: false, error: `License is ${license.status.toLowerCase()}` },
        { status: 403 }
      );
    }

    // Check expiry
    const daysRemaining = Math.max(
      0,
      Math.ceil((license.validUntil.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    );

    if (daysRemaining === 0) {
      await prisma.license.update({
        where: { id: license.id },
        data: { status: 'EXPIRED' },
      });
      return NextResponse.json(
        { valid: false, error: 'License has expired', daysRemaining: 0 },
        { status: 403 }
      );
    }

    // Check customer status
    if (license.customer.status !== 'ACTIVE') {
      return NextResponse.json(
        { valid: false, error: `Customer account is ${license.customer.status.toLowerCase()}` },
        { status: 403 }
      );
    }

    // Find activation
    const activation = await prisma.licenseActivation.findFirst({
      where: { licenseId: license.id, machineId, status: 'ACTIVE' },
    });

    if (!activation) {
      return NextResponse.json(
        { valid: false, error: 'No active activation found for this machine' },
        { status: 403 }
      );
    }

    // Update last seen
    await prisma.licenseActivation.update({
      where: { id: activation.id },
      data: {
        lastSeenAt: new Date(),
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
      },
    });

    // Check if we need to reissue token (if expired or close to expiry)
    let newToken: string | undefined;
    if (token) {
      const tokenPayload = await verifyLicenseToken(token);
      if (!tokenPayload) {
        // Token expired or invalid, issue new one
        newToken = await signLicenseToken({
          licenseId: license.id,
          customerId: license.customerId,
          key: license.key,
          tier: license.tier,
          maxDevices: license.maxDevices,
          maxUsers: license.maxUsers,
          validUntil: license.validUntil.toISOString(),
          machineId,
        });
      }
    } else {
      // No token provided, issue one
      newToken = await signLicenseToken({
        licenseId: license.id,
        customerId: license.customerId,
        key: license.key,
        tier: license.tier,
        maxDevices: license.maxDevices,
        maxUsers: license.maxUsers,
        validUntil: license.validUntil.toISOString(),
        machineId,
      });
    }

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
      `[License] Validated: ${license.key} on ${machineId.slice(0, 12)}... ` +
      `(${daysRemaining}d remaining)`
    );

    return NextResponse.json({
      valid: true,
      state,
      ...(newToken && { token: newToken }),
    });
  } catch (err) {
    console.error('[License] Validation error:', err);
    return NextResponse.json(
      { valid: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
