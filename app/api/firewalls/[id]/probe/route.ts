import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestActor } from '@/lib/auth/request-actor';
import {
  FirewallProbeRateLimitError,
  probeFirewallConnector,
} from '@/lib/firewall/probe';

type RouteContext = { params: { id: string } };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const actor = await getRequestActor(request);
  if (!actor) {
    return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  }
  if (actor.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'Admin role required' }, { status: 403 });
  }

  const connector = await prisma.firewallConnector.findUnique({
    where: { id: params.id },
    select: { id: true, integrationConfig: { select: { enabled: true } } },
  });
  if (!connector) {
    return NextResponse.json({ success: false, error: 'Firewall connector not found' }, { status: 404 });
  }
  if (!connector.integrationConfig.enabled) {
    return NextResponse.json({ success: false, error: 'Firewall connector is disabled' }, { status: 409 });
  }

  try {
    const result = await probeFirewallConnector(connector.id, { trigger: 'manual' });
    return NextResponse.json({
      success: true,
      data: {
        connectorId: result.connector.id,
        monitoring: result.monitoring,
        probe: {
          connected: result.status.connected,
          error: result.status.error,
          errorCode: result.status.errorCode,
          retryable: result.status.retryable,
          consecutiveFailures: result.consecutiveFailures,
          nextProbeAt: result.nextProbeAt,
        },
      },
    });
  } catch (error) {
    if (error instanceof FirewallProbeRateLimitError) {
      return NextResponse.json(
        { success: false, error: error.message, code: 'PROBE_RATE_LIMITED', retryAfterSeconds: error.retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(error.retryAfterSeconds) } }
      );
    }
    console.error('Manual firewall probe failed:', error);
    return NextResponse.json({ success: false, error: 'Firewall probe failed' }, { status: 500 });
  }
}
