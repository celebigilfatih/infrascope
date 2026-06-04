/**
 * License Check Middleware
 *
 * Provides middleware functions to protect API routes and pages
 * with license validation and feature gating.
 */

import { NextRequest, NextResponse } from 'next/server';
import { initLicense, getLicenseState, type LicenseState } from './client';
import { isFeatureAvailable, type LicenseTier } from './features';

let initialized = false;

/**
 * Ensure license is initialized before checking
 */
async function ensureInitialized(): Promise<LicenseState> {
  if (!initialized) {
    await initLicense();
    initialized = true;
  }
  const state = getLicenseState();
  if (!state) {
    // Fallback for initialization failure
    return {
      valid: false,
      tier: 'TRIAL',
      maxDevices: 0,
      maxUsers: 0,
      validUntil: '',
      daysRemaining: 0,
      graceMode: false,
      lastValidated: '',
      licenseKey: '',
      machineId: '',
    };
  }
  return state;
}

/**
 * Check if license is valid (for API route protection)
 * Returns null if valid, or a NextResponse with error if invalid
 */
export async function checkLicense(): Promise<NextResponse | null> {
  const state = await ensureInitialized();

  if (!state.valid) {
    return NextResponse.json(
      {
        error: 'License validation failed',
        graceMode: state.graceMode,
      },
      { status: 403 }
    );
  }

  return null;
}

/**
 * Check if a specific feature is available for the current license tier
 * Returns null if available, or a NextResponse with error if not
 */
export async function checkFeature(feature: string): Promise<NextResponse | null> {
  const state = await ensureInitialized();

  if (!state.valid) {
    return NextResponse.json(
      {
        error: 'License validation failed',
        graceMode: state.graceMode,
      },
      { status: 403 }
    );
  }

  if (!isFeatureAvailable(feature, state.tier as LicenseTier)) {
    return NextResponse.json(
      {
        error: 'Feature not available',
        feature,
        requiredTier: feature.includes('advanced') || feature.includes('api.external')
          ? 'ENTERPRISE'
          : 'STANDARD',
        currentTier: state.tier,
      },
      { status: 403 }
    );
  }

  return null;
}

/**
 * Check device count limit
 * Returns null if within limit, or a NextResponse with error if exceeded
 */
export async function checkDeviceLimit(currentCount: number): Promise<NextResponse | null> {
  const state = await ensureInitialized();

  if (!state.valid) {
    return NextResponse.json(
      { error: 'License validation failed' },
      { status: 403 }
    );
  }

  if (currentCount >= state.maxDevices) {
    return NextResponse.json(
      {
        error: 'Device limit reached',
        current: currentCount,
        limit: state.maxDevices,
        tier: state.tier,
        message: `Upgrade your license to add more devices. Current limit: ${state.maxDevices}`,
      },
      { status: 403 }
    );
  }

  return null;
}

/**
 * Check user count limit
 * Returns null if within limit, or a NextResponse with error if exceeded
 */
export async function checkUserLimit(currentCount: number): Promise<NextResponse | null> {
  const state = await ensureInitialized();

  if (!state.valid) {
    return NextResponse.json(
      { error: 'License validation failed' },
      { status: 403 }
    );
  }

  if (currentCount >= state.maxUsers) {
    return NextResponse.json(
      {
        error: 'User limit reached',
        current: currentCount,
        limit: state.maxUsers,
        tier: state.tier,
        message: `Upgrade your license to add more users. Current limit: ${state.maxUsers}`,
      },
      { status: 403 }
    );
  }

  return null;
}

/**
 * Get license info for API responses (safe to expose to client)
 */
export async function getLicenseInfo() {
  const state = await ensureInitialized();

  return {
    valid: state.valid,
    tier: state.tier,
    maxDevices: state.maxDevices,
    maxUsers: state.maxUsers,
    daysRemaining: state.daysRemaining,
    graceMode: state.graceMode,
    validUntil: state.validUntil,
  };
}

/**
 * License status for admin dashboard
 */
export async function getAdminLicenseInfo() {
  const state = await ensureInitialized();

  return {
    ...state,
    warnings: generateWarnings(state),
  };
}

function generateWarnings(state: LicenseState): string[] {
  const warnings: string[] = [];

  if (state.graceMode) {
    warnings.push('Running in grace mode - license validation failed');
  }

  if (state.daysRemaining <= 7) {
    warnings.push(`License expires in ${state.daysRemaining} days`);
  } else if (state.daysRemaining <= 30) {
    warnings.push(`License expires in ${state.daysRemaining} days`);
  }

  if (!state.valid && !state.graceMode) {
    warnings.push('License is invalid');
  }

  return warnings;
}
