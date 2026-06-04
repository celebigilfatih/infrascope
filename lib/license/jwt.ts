/**
 * JWT token utilities for license validation.
 *
 * Uses the `jose` library to sign and verify license tokens
 * that are issued by the central license server and validated
 * by on-premise installations.
 */

import { SignJWT, jwtVerify, errors } from 'jose';

const LICENSE_SECRET = process.env.LICENSE_JWT_SECRET || process.env.NEXTAUTH_SECRET || 'infrascope-license-secret';

export interface LicenseTokenPayload {
  licenseId: string;
  customerId: string;
  key: string;
  tier: string;
  maxDevices: number;
  maxUsers: number;
  validUntil: string; // ISO date
  machineId: string;
}

function getSecretKey(): Uint8Array {
  return new TextEncoder().encode(LICENSE_SECRET);
}

/**
 * Sign a license token (server-side only).
 * Token expires when the license expires.
 */
export async function signLicenseToken(payload: LicenseTokenPayload): Promise<string> {
  const exp = new Date(payload.validUntil);

  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(getSecretKey());
}

/**
 * Verify a license token.
 * Returns the payload if valid, null if expired or invalid.
 */
export async function verifyLicenseToken(token: string): Promise<LicenseTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as unknown as LicenseTokenPayload;
  } catch (err) {
    if (err instanceof errors.JWTExpired) {
      return null; // Expired — not an error, just invalid
    }
    console.error('[License JWT] Verification failed:', (err as Error).message);
    return null;
  }
}
