import type { NextRequest } from 'next/server';
import { getRequestActor } from '@/lib/auth/request-actor';
import { areLegacyFirewallWritesEnabled } from './feature-flags';

export type LegacyFirewallWriteDecision =
  | {
      allowed: true;
      actor: NonNullable<Awaited<ReturnType<typeof getRequestActor>>>['actor'];
    }
  | {
      allowed: false;
      status: 401 | 403 | 503;
      code: 'authentication-required' | 'admin-required' | 'feature-disabled';
      message: string;
    };

/**
 * Temporary guard for the legacy direct-write endpoint.
 * V2 change requests will replace this path; writes stay disabled by default.
 */
export async function authorizeLegacyFirewallWrite(
  request: NextRequest
): Promise<LegacyFirewallWriteDecision> {
  const auth = await getRequestActor(request);
  if (!auth) {
    return {
      allowed: false,
      status: 401,
      code: 'authentication-required',
      message: 'Authentication required',
    };
  }

  if (auth.role !== 'ADMIN') {
    return {
      allowed: false,
      status: 403,
      code: 'admin-required',
      message: 'Admin role required for firewall changes',
    };
  }

  if (!areLegacyFirewallWritesEnabled()) {
    return {
      allowed: false,
      status: 503,
      code: 'feature-disabled',
      message: 'Firewall changes are disabled until the approval workflow is enabled',
    };
  }

  return { allowed: true, actor: auth.actor };
}
