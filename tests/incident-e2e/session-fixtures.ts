import type { BrowserContext } from '@playwright/test';
import { SignJWT } from 'jose';
import { SESSION_COOKIE_NAME } from '../../lib/auth/session';
import type { Fixtures } from './fixtures';

export async function installTestSession(context: BrowserContext, fixtures: Fixtures, role: string, expired = false) {
  // Tokens are signed only with the disposable runner's fixed test secret.
  if (process.env.INFRASCOPE_INCIDENT_E2E !== '1' || process.env.NEXTAUTH_SECRET !== 'incident-e2e-session-secret-only') throw new Error('Session fixtures require the disposable regression environment.');
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ userId: fixtures.userId, role, email: fixtures.email })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt(now - 60)
    .setExpirationTime(expired ? now - 10 : now + 3600)
    .sign(new TextEncoder().encode(process.env.NEXTAUTH_SECRET));
  await context.addCookies([{ name: SESSION_COOKIE_NAME, value: token, url: 'http://127.0.0.1:3180', httpOnly: true, sameSite: 'Strict', expires: now + 3600 }]);
}
