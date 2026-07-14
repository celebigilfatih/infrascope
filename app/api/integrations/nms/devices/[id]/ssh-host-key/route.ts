import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestActor } from '@/lib/auth/request-actor';
import { NmsInternalError, nmsInternalFetch, parseNmsResponse } from '@/lib/nms/internal-client';

type RouteContext = { params: { id: string } };
type ObservedHostKey = { algorithm: string; fingerprint: string; observed_at: string };

async function loadDevice(deviceId: string) {
  return prisma.device.findUnique({
    where: { id: deviceId },
    select: {
      id: true,
      nmsDeviceId: true,
      sshHostKeyAlgorithm: true,
      sshHostKeyFingerprint: true,
    },
  });
}

async function inspect(nmsDeviceId: number) {
  return parseNmsResponse<ObservedHostKey>(
    await nmsInternalFetch(`/devices/${nmsDeviceId}/ssh-host-key`)
  );
}

function operationError(error: unknown) {
  if (error instanceof NmsInternalError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  console.error('NMS SSH host-key operation failed:', error);
  return NextResponse.json({ success: false, error: 'SSH host key operation failed' }, { status: 500 });
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    if (!await getRequestActor(request)) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }
    const device = await loadDevice(params.id);
    if (!device?.nmsDeviceId) {
      return NextResponse.json({ success: false, error: 'Device has no NMS configuration' }, { status: 404 });
    }
    const observed = await inspect(device.nmsDeviceId);
    return NextResponse.json({
      success: true,
      data: {
        observed,
        trusted: device.sshHostKeyFingerprint
          ? {
              algorithm: device.sshHostKeyAlgorithm,
              fingerprint: device.sshHostKeyFingerprint,
              matches: device.sshHostKeyFingerprint === observed.fingerprint,
            }
          : null,
      },
    });
  } catch (error) {
    return operationError(error);
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const auth = await getRequestActor(request);
    if (!auth) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    if (auth.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Admin role required' }, { status: 403 });
    }
    const body = await request.json() as { fingerprint?: string };
    const requested = typeof body.fingerprint === 'string' ? body.fingerprint.trim() : '';
    if (!requested.startsWith('SHA256:')) {
      return NextResponse.json({ success: false, error: 'A SHA-256 SSH fingerprint is required' }, { status: 400 });
    }
    const device = await loadDevice(params.id);
    if (!device?.nmsDeviceId) {
      return NextResponse.json({ success: false, error: 'Device has no NMS configuration' }, { status: 404 });
    }
    const observed = await inspect(device.nmsDeviceId);
    if (observed.fingerprint !== requested) {
      return NextResponse.json(
        { success: false, error: 'The SSH host key changed before approval; inspect it again' },
        { status: 409 }
      );
    }
    await prisma.$transaction([
      prisma.device.update({
        where: { id: device.id },
        data: {
          sshHostKeyAlgorithm: observed.algorithm,
          sshHostKeyFingerprint: observed.fingerprint,
        },
      }),
      prisma.auditLog.create({
        data: {
          entity: 'Device',
          entityId: device.id,
          resource: 'device',
          resourceId: device.id,
          action: 'SSH_HOST_KEY_TRUSTED',
          userId: auth.actor.id || null,
          details: {
            algorithm: observed.algorithm,
            fingerprint: observed.fingerprint,
            observedAt: observed.observed_at,
          },
          ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
          userAgent: request.headers.get('user-agent'),
        },
      }),
    ]);
    return NextResponse.json({ success: true, data: { observed, trusted: true } });
  } catch (error) {
    return operationError(error);
  }
}
