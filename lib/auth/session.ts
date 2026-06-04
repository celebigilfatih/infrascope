/**
 * Server-side session management using JWT.
 *
 * Uses the `jose` library (Edge Runtime compatible) to sign and verify
 * session tokens stored in an httpOnly cookie. Follows the same pattern
 * as lib/license/jwt.ts.
 *
 * The JWT secret is derived from NEXTAUTH_SECRET (already configured
 * across all environments).
 */

import { SignJWT, jwtVerify, errors } from 'jose';

const SESSION_SECRET = process.env.NEXTAUTH_SECRET || 'infrascope-session-dev-secret';
const SESSION_DURATION = '8h';

export const SESSION_COOKIE_NAME = 'infrascope_session';
export const SESSION_MAX_AGE = 28800; // 8 hours in seconds

export interface SessionPayload {
  userId: string;
  role: string;
  email: string;
}

function getSecretKey(): Uint8Array {
  return new TextEncoder().encode(SESSION_SECRET);
}

/**
 * Sign a session token (server-side only).
 * Token expires after 8 hours.
 */
export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .sign(getSecretKey());
}

/**
 * Verify a session token.
 * Returns the payload if valid, null if expired or invalid.
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return {
      userId: payload.userId as string,
      role: payload.role as string,
      email: payload.email as string,
    };
  } catch (err) {
    if (err instanceof errors.JWTExpired) {
      return null;
    }
    console.error('[Session] Token verification failed:', (err as Error).message);
    return null;
  }
}
