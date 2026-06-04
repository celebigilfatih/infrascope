/**
 * License validation client for on-premise installations.
 *
 * Runs on app startup and periodically (every 24h) to validate the
 * license against the central license server. Caches the result
 * locally so the app keeps working during short network outages
 * (7-day grace period).
 *
 * Environment variables:
 *   LICENSE_KEY          — Customer's license key (e.g. "IS-2026-XXXX-XXXX")
 *   LICENSE_SERVER_URL   — Central server URL (default: https://license.infrascope.com)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { getMachineId } from './machine-id';
import type { LicenseTier, LicenseLimits } from './features';

const LICENSE_SERVER_URL = process.env.LICENSE_SERVER_URL || 'https://license.infrascope.com';
const LICENSE_KEY = process.env.LICENSE_KEY || '';
const CACHE_FILE = path.join(process.cwd(), '.license-cache');
const GRACE_PERIOD_DAYS = 7;
const VALIDATE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface LicenseState {
  /** Whether the license is currently valid */
  valid: boolean;
  /** License tier */
  tier: LicenseTier;
  /** Max devices allowed */
  maxDevices: number;
  /** Max users allowed */
  maxUsers: number;
  /** License expiry date (ISO) */
  validUntil: string;
  /** Days remaining until expiry */
  daysRemaining: number;
  /** Whether we're in grace period (server unreachable) */
  graceMode: boolean;
  /** Last successful validation timestamp */
  lastValidated: string;
  /** License key (masked) */
  licenseKey: string;
  /** Machine ID */
  machineId: string;
}

interface CacheData {
  token: string;
  state: LicenseState;
  cachedAt: number; // epoch ms
}

// ── Singleton state ──────────────────────────────────────────────
let currentState: LicenseState | null = null;
let validationTimer: NodeJS.Timeout | null = null;

/**
 * Get the current license state (may be null before first validation).
 */
export function getLicenseState(): LicenseState | null {
  return currentState;
}

/**
 * Check if the license is valid (including grace period).
 */
export function isLicenseValid(): boolean {
  return currentState?.valid ?? false;
}

/**
 * Get the current license tier.
 */
export function getLicenseTier(): LicenseTier {
  return currentState?.tier ?? 'TRIAL';
}

/**
 * Get license limits for feature gating.
 */
export function getLicenseLimits(): LicenseLimits {
  if (!currentState) {
    return { tier: 'TRIAL', maxDevices: 10, maxUsers: 2, validUntil: '', daysRemaining: 0 };
  }
  return {
    tier: currentState.tier,
    maxDevices: currentState.maxDevices,
    maxUsers: currentState.maxUsers,
    validUntil: currentState.validUntil,
    daysRemaining: currentState.daysRemaining,
  };
}

// ── Cache management ─────────────────────────────────────────────

function readCache(): CacheData | null {
  try {
    if (!existsSync(CACHE_FILE)) return null;
    const raw = readFileSync(CACHE_FILE, 'utf-8');
    const data = JSON.parse(raw) as CacheData;
    if (!data.state || !data.cachedAt) return null;
    return data;
  } catch {
    return null;
  }
}

function writeCache(data: CacheData): void {
  try {
    writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
  } catch {
    // Read-only FS — ignore
  }
}

// ── Server communication ─────────────────────────────────────────

async function activateLicense(): Promise<LicenseState | null> {
  if (!LICENSE_KEY) return null;

  const machineId = getMachineId();

  try {
    const res = await fetch(`${LICENSE_SERVER_URL}/api/license/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: LICENSE_KEY, machineId }),
    });

    if (!res.ok) {
      console.error(`[License] Activation failed: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json();
    return data.state as LicenseState;
  } catch (err) {
    console.error('[License] Activation request failed:', (err as Error).message);
    return null;
  }
}

async function validateLicense(token: string): Promise<LicenseState | null> {
  try {
    const res = await fetch(`${LICENSE_SERVER_URL}/api/license/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!res.ok) return null;

    const data = await res.json();
    return data.state as LicenseState;
  } catch {
    return null;
  }
}

async function sendHeartbeat(token: string, usage: { deviceCount: number; userCount: number }): Promise<void> {
  try {
    await fetch(`${LICENSE_SERVER_URL}/api/license/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(usage),
    });
  } catch {
    // Heartbeat failure is non-critical
  }
}

// ── Validation logic ─────────────────────────────────────────────

async function performValidation(): Promise<void> {
  // No license key configured — use trial mode
  if (!LICENSE_KEY) {
    currentState = {
      valid: true,
      tier: 'TRIAL',
      maxDevices: 10,
      maxUsers: 2,
      validUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
      daysRemaining: 30,
      graceMode: false,
      lastValidated: new Date().toISOString(),
      licenseKey: '',
      machineId: getMachineId(),
    };
    return;
  }

  // Try to validate with server
  const cache = readCache();
  let newState: LicenseState | null = null;

  if (cache?.token) {
    // Existing token — try validate first (lighter than activate)
    newState = await validateLicense(cache.token);
  }

  if (!newState) {
    // No token or validate failed — try full activation
    newState = await activateLicense();
  }

  if (newState) {
    // Server responded — update state and cache
    newState.machineId = getMachineId();
    newState.licenseKey = maskKey(LICENSE_KEY);
    newState.graceMode = false;
    newState.lastValidated = new Date().toISOString();
    currentState = newState;

    writeCache({
      token: newState.licenseKey, // In production, use JWT from server
      state: newState,
      cachedAt: Date.now(),
    });

    console.log(`[License] Validated: ${newState.tier} tier, ${newState.daysRemaining} days remaining`);
    return;
  }

  // Server unreachable — check grace period
  if (cache?.state) {
    const cachedAt = new Date(cache.cachedAt);
    const daysSinceCache = (Date.now() - cache.cachedAt) / (1000 * 60 * 60 * 24);

    if (daysSinceCache <= GRACE_PERIOD_DAYS) {
      // Grace period — use cached state
      currentState = {
        ...cache.state,
        graceMode: true,
        machineId: getMachineId(),
        licenseKey: maskKey(LICENSE_KEY),
      };
      console.warn(
        `[License] Server unreachable, grace period active ` +
        `(${Math.ceil(GRACE_PERIOD_DAYS - daysSinceCache)} days remaining)`
      );
      return;
    }
  }

  // Grace period expired or no cache — fallback to restricted mode
  currentState = {
    valid: false,
    tier: 'TRIAL',
    maxDevices: 0,
    maxUsers: 0,
    validUntil: '',
    daysRemaining: 0,
    graceMode: true,
    lastValidated: cache?.state?.lastValidated || '',
    licenseKey: maskKey(LICENSE_KEY),
    machineId: getMachineId(),
  };
  console.error('[License] Grace period expired — running in restricted mode');
}

function maskKey(key: string): string {
  if (!key || key.length < 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Initialize license validation.
 * Call once on app startup.
 */
export async function initLicense(): Promise<LicenseState> {
  await performValidation();

  // Schedule periodic re-validation
  if (validationTimer) clearInterval(validationTimer);
  validationTimer = setInterval(performValidation, VALIDATE_INTERVAL_MS);

  return currentState!;
}

/**
 * Send usage heartbeat to license server.
 * Call periodically (e.g., every hour) with current usage stats.
 */
export async function sendUsageHeartbeat(deviceCount: number, userCount: number): Promise<void> {
  const cache = readCache();
  if (cache?.token) {
    await sendHeartbeat(cache.token, { deviceCount, userCount });
  }
}

/**
 * Force re-validation (e.g., after license key change).
 */
export async function revalidateLicense(): Promise<LicenseState> {
  await performValidation();
  return currentState!;
}
