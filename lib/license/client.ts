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
 *   LICENSE_SERVER_URL   — Central server URL (default: https://lisans.webmahsul.com.tr)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'fs';
import path from 'path';
import { getMachineId } from './machine-id';
import type { LicenseTier, LicenseLimits } from './features';

const LICENSE_SERVER_URL = process.env.LICENSE_SERVER_URL || 'https://lisans.webmahsul.com.tr';
const ENV_LICENSE_KEY = process.env.LICENSE_KEY || '';
const LICENSE_CACHE_PATH = process.env.LICENSE_CACHE_PATH || path.join(process.cwd(), '.license-cache');
const GRACE_PERIOD_DAYS = 14;
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
  licenseKey: string;
  state: LicenseState;
  cachedAt: number; // epoch ms
}

// ── Singleton state ──────────────────────────────────────────────
let currentState: LicenseState | null = null;
let validationTimer: NodeJS.Timeout | null = null;

function getCacheFile(): string {
  try {
    if (existsSync(LICENSE_CACHE_PATH) && statSync(LICENSE_CACHE_PATH).isDirectory()) {
      return path.join(LICENSE_CACHE_PATH, 'license.json');
    }
  } catch {
    // Fall through to the configured path.
  }
  return LICENSE_CACHE_PATH;
}

function getConfiguredLicenseKey(cache?: CacheData | null): string {
  return ENV_LICENSE_KEY || cache?.licenseKey || '';
}

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

export function hasConfiguredLicense(): boolean {
  return Boolean(getConfiguredLicenseKey(readCache()));
}

// ── Cache management ─────────────────────────────────────────────

function readCache(): CacheData | null {
  try {
    const cacheFile = getCacheFile();
    if (!existsSync(cacheFile)) return null;
    const raw = readFileSync(cacheFile, 'utf-8');
    const data = JSON.parse(raw) as CacheData;
    if (!data.state || !data.cachedAt || !data.token) return null;
    return data;
  } catch {
    return null;
  }
}

function writeCache(data: CacheData): void {
  try {
    const cacheFile = getCacheFile();
    mkdirSync(path.dirname(cacheFile), { recursive: true });
    writeFileSync(cacheFile, JSON.stringify(data, null, 2));
  } catch {
    // Read-only FS — ignore
  }
}

// ── Server communication ─────────────────────────────────────────

async function activateLicense(licenseKey: string): Promise<{ token: string; state: LicenseState } | null> {
  if (!licenseKey) return null;

  const machineId = getMachineId();

  try {
    const res = await fetch(`${LICENSE_SERVER_URL}/api/license/activate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-version': process.env.NEXT_PUBLIC_APP_VERSION || process.env.APP_VERSION || 'unknown',
      },
      body: JSON.stringify({ licenseKey, machineId }),
    });

    if (!res.ok) {
      console.error(`[License] Activation failed: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json();
    if (!data.token || !data.state) return null;
    return { token: data.token as string, state: data.state as LicenseState };
  } catch (err) {
    console.error('[License] Activation request failed:', (err as Error).message);
    return null;
  }
}

async function validateLicense(licenseKey: string, token: string): Promise<{ token: string; state: LicenseState } | null> {
  const machineId = getMachineId();

  try {
    const res = await fetch(`${LICENSE_SERVER_URL}/api/license/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ licenseKey, machineId, token }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (!data.state) return null;
    return {
      token: (data.token as string | undefined) || token,
      state: data.state as LicenseState,
    };
  } catch {
    return null;
  }
}

async function sendHeartbeat(
  licenseKey: string,
  token: string,
  usage: { deviceCount: number; userCount: number; appVersion?: string }
): Promise<void> {
  try {
    await fetch(`${LICENSE_SERVER_URL}/api/license/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        licenseKey,
        machineId: getMachineId(),
        ...usage,
      }),
    });
  } catch {
    // Heartbeat failure is non-critical
  }
}

// ── Validation logic ─────────────────────────────────────────────

async function performValidation(): Promise<void> {
  const cache = readCache();
  const licenseKey = getConfiguredLicenseKey(cache);

  // No license key configured — use trial mode
  if (!licenseKey) {
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
  let validationResult: { token: string; state: LicenseState } | null = null;

  if (cache?.token) {
    // Existing token — try validate first (lighter than activate)
    validationResult = await validateLicense(licenseKey, cache.token);
  }

  if (!validationResult) {
    // No token or validate failed — try full activation
    validationResult = await activateLicense(licenseKey);
  }

  if (validationResult) {
    // Server responded — update state and cache
    const newState = validationResult.state;
    newState.machineId = getMachineId();
    newState.licenseKey = maskKey(licenseKey);
    newState.graceMode = false;
    newState.lastValidated = new Date().toISOString();
    currentState = newState;

    writeCache({
      token: validationResult.token,
      licenseKey,
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
        licenseKey: maskKey(licenseKey),
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
    licenseKey: maskKey(licenseKey),
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
  const licenseKey = getConfiguredLicenseKey(cache);
  if (cache?.token && licenseKey) {
    await sendHeartbeat(licenseKey, cache.token, {
      deviceCount,
      userCount,
      appVersion: process.env.NEXT_PUBLIC_APP_VERSION || process.env.APP_VERSION || 'unknown',
    });
  }
}

/**
 * Force re-validation (e.g., after license key change).
 */
export async function revalidateLicense(): Promise<LicenseState> {
  await performValidation();
  return currentState!;
}

/**
 * Activate and cache a license key during first-run setup.
 */
export async function activateAndCacheLicense(licenseKey: string): Promise<LicenseState | null> {
  const result = await activateLicense(licenseKey);
  if (!result) return null;

  const state = {
    ...result.state,
    machineId: getMachineId(),
    licenseKey: maskKey(licenseKey),
    graceMode: false,
    lastValidated: new Date().toISOString(),
  };

  currentState = state;
  writeCache({
    token: result.token,
    licenseKey,
    state,
    cachedAt: Date.now(),
  });

  return state;
}
