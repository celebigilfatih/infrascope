import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestActor } from '@/lib/auth/request-actor';
import { nmsInternalFetch } from '@/lib/nms/internal-client';

interface Params { params: { id: string } }

function serializeBigInt(obj: unknown): unknown {
  return JSON.parse(JSON.stringify(obj, (_k, v) => typeof v === 'bigint' ? v.toString() : v));
}

/**
 * GET /api/integrations/nms/devices/[id]/backups
 * List configuration backups for a device from the DB.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const device = await (prisma as any).device.findUnique({
      where: { id: params.id },
      select: { nmsDeviceId: true, name: true },
    });

    if (!device?.nmsDeviceId) {
      return NextResponse.json({ error: 'Device has no NMS configuration' }, { status: 404 });
    }

    const backups = await (prisma as any).nmsBackup.findMany({
      where: { nmsDeviceId: device.nmsDeviceId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        backupType: true,
        backupFile: true,
        description: true,
        sizeBytes: true,
        checksum: true,
        createdAt: true,
        updatedAt: true,
        // Note: configuration (text) excluded from list — fetch per backup on demand
      },
    });

    return NextResponse.json(serializeBigInt({ backups, total: backups.length, deviceName: device.name }));
  } catch (error) {
    console.error('[NMS Device Backups] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch backups' }, { status: 500 });
  }
}

/**
 * POST /api/integrations/nms/devices/[id]/backups
 * Trigger a new config backup via NMS backend (SSH).
 * Body: { backupType?: string, description?: string }
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const auth = await getRequestActor(req);
    if (!auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const device = await (prisma as any).device.findUnique({
      where: { id: params.id },
      select: { id: true, nmsDeviceId: true, name: true },
    });

    if (!device?.nmsDeviceId) {
      return NextResponse.json({ error: 'Device has no NMS configuration' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const backupType = body.backupType || 'Running Config';
    const description = body.description || null;

    await prisma.auditLog.create({
      data: {
        entity: 'Device',
        entityId: device.id,
        resource: 'device',
        resourceId: device.id,
        action: 'SSH_CONFIG_BACKUP_REQUESTED',
        userId: auth.actor.id || null,
        details: { backupType, description },
        ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        userAgent: req.headers.get('user-agent'),
      },
    });

    try {
      const nmsRes = await nmsInternalFetch(
        `/devices/${device.nmsDeviceId}/backup`,
        {
          method: 'POST',
          timeoutMs: 120000,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            backup_type: backupType,
            description,
          }),
        }
      );

      if (nmsRes.ok) {
        const nmsData = await nmsRes.json();
        await prisma.auditLog.create({
          data: {
            entity: 'Device',
            entityId: device.id,
            resource: 'device',
            resourceId: device.id,
            action: 'SSH_CONFIG_BACKUP_COMPLETED',
            userId: auth.actor.id || null,
            details: {
              backupId: nmsData.backup?.id || null,
              checksum: nmsData.backup?.checksum || null,
              sizeBytes: nmsData.backup?.size_bytes || null,
            },
          },
        });
        return NextResponse.json(
          { success: true, source: 'nms-agent', backup: nmsData.backup ?? nmsData },
          { status: 201 }
        );
      }

      return NextResponse.json(
        {
          error: 'NMS backup failed',
          status: nmsRes.status,
          device: device.name,
        },
        { status: nmsRes.status === 404 ? 404 : 502 }
      );
    } catch (e: any) {
      console.error('[NMS Device Backups] NMS agent error:', e?.message || e);
      return NextResponse.json(
        {
          error: 'NMS agent unreachable',
          hint: 'Backup requires the NMS agent service to be running for SSH access to the device.',
          device: device.name,
        },
        { status: 503 }
      );
    }
  } catch (error) {
    console.error('[NMS Device Backups] POST error:', error);
    return NextResponse.json({ error: 'Failed to trigger backup' }, { status: 500 });
  }
}

/**
 * GET /api/integrations/nms/devices/[id]/backups?backupId=xxx
 * Fetch config text for a specific backup (via DB).
 */
