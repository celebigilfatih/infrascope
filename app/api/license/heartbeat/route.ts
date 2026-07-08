/**
 * POST /api/license/heartbeat
 *
 * Record heartbeat and usage data from an activated installation.
 * Called periodically (every 6-12 hours) to track usage patterns.
 *
 * Body: { licenseKey: string, machineId: string, deviceCount?: number, userCount?: number, appVersion?: string }
 * Returns: { success: boolean, warnings?: string[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireLicenseServerMode } from '@/lib/license/server-mode';

export async function POST(req: NextRequest) {
  try {
    const modeError = requireLicenseServerMode();
    if (modeError) return modeError;

    const { licenseKey, machineId, deviceCount, userCount, appVersion } = await req.json();

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
        { success: false, error: 'Invalid license key' },
        { status: 404 }
      );
    }

    // Check license status
    if (license.status !== 'ACTIVE') {
      return NextResponse.json(
        { success: false, error: `License is ${license.status.toLowerCase()}` },
        { status: 403 }
      );
    }

    // Find activation
    const activation = await prisma.licenseActivation.findFirst({
      where: { licenseId: license.id, machineId, status: 'ACTIVE' },
    });

    if (!activation) {
      return NextResponse.json(
        { success: false, error: 'No active activation found' },
        { status: 403 }
      );
    }

    // Record heartbeat
    await prisma.licenseHeartbeat.create({
      data: {
        licenseId: license.id,
        machineId,
        deviceCount: deviceCount || 0,
        userCount: userCount || 0,
        appVersion,
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
      },
    });

    // Update activation last seen and usage data
    await prisma.licenseActivation.update({
      where: { id: activation.id },
      data: {
        lastSeenAt: new Date(),
        usageData: {
          deviceCount: deviceCount || 0,
          userCount: userCount || 0,
          lastReported: new Date().toISOString(),
        },
      },
    });

    // Generate warnings if approaching limits
    const warnings: string[] = [];

    if (deviceCount && deviceCount > license.maxDevices * 0.9) {
      warnings.push(
        `Device count (${deviceCount}) is approaching limit (${license.maxDevices})`
      );
    }

    if (userCount && userCount > license.maxUsers * 0.9) {
      warnings.push(
        `User count (${userCount}) is approaching limit (${license.maxUsers})`
      );
    }

    const daysRemaining = Math.max(
      0,
      Math.ceil((license.validUntil.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    );

    if (daysRemaining <= 30) {
      warnings.push(`License expires in ${daysRemaining} days`);
    }

    console.log(
      `[License] Heartbeat: ${license.key} on ${machineId.slice(0, 12)}... ` +
      `(devices: ${deviceCount || 0}, users: ${userCount || 0})`
    );

    return NextResponse.json({
      success: true,
      warnings: warnings.length > 0 ? warnings : undefined,
      daysRemaining,
    });
  } catch (err) {
    console.error('[License] Heartbeat error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
