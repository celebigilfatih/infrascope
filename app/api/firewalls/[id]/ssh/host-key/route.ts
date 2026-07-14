import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestActor } from '@/lib/auth/request-actor';
import { FirewallReadTargetError } from '@/lib/firewall/read-service';
import { inspectFirewallSshHostKey } from '@/lib/firewall/ssh-read';
import { NmsInternalError } from '@/lib/nms/internal-client';

type RouteContext = { params: { id: string } };

function routeError(error: unknown) {
  if (error instanceof FirewallReadTargetError || error instanceof NmsInternalError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  console.error('Firewall SSH host-key operation failed:', error);
  return NextResponse.json({ success: false, error: 'SSH host key operation failed' }, { status: 500 });
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    if (!await getRequestActor(request)) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }
    return NextResponse.json({ success: true, data: await inspectFirewallSshHostKey(params.id) });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const auth = await getRequestActor(request);
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }
    if (auth.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Admin role required' }, { status: 403 });
    }
    const body = await request.json() as { fingerprint?: string };
    const requested = typeof body.fingerprint === 'string' ? body.fingerprint.trim() : '';
    if (!requested.startsWith('SHA256:')) {
      return NextResponse.json({ success: false, error: 'A SHA-256 SSH fingerprint is required' }, { status: 400 });
    }
    const inspected = await inspectFirewallSshHostKey(params.id);
    if (requested !== inspected.observed.fingerprint) {
      return NextResponse.json(
        { success: false, error: 'The SSH host key changed before approval; inspect it again' },
        { status: 409 }
      );
    }
    await prisma.$transaction(async (tx) => {
      await tx.device.update({
        where: { id: inspected.target.deviceId },
        data: {
          sshHostKeyAlgorithm: inspected.observed.algorithm,
          sshHostKeyFingerprint: inspected.observed.fingerprint,
        },
      });
      await tx.auditLog.create({
        data: {
          entity: 'Device',
          entityId: inspected.target.deviceId,
          resource: 'firewall',
          resourceId: params.id,
          action: 'SSH_HOST_KEY_TRUSTED',
          userId: auth.actor.id || null,
          details: {
            algorithm: inspected.observed.algorithm,
            fingerprint: inspected.observed.fingerprint,
            observedAt: inspected.observed.observed_at,
          },
          ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
          userAgent: request.headers.get('user-agent'),
        },
      });
    });
    return NextResponse.json({ success: true, data: { ...inspected.observed, trusted: true } });
  } catch (error) {
    return routeError(error);
  }
}
