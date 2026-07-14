import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { getRequestActor } from '@/lib/auth/request-actor';
import { unprotectNmsBackup } from '@/lib/security/integration-credentials';

interface Params { params: { id: string; backupId: string } }

/**
 * GET /api/integrations/nms/devices/[id]/backups/[backupId]
 * Fetch full configuration text for a specific backup.
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const auth = await getRequestActor(req);
    if (!auth) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const device = await prisma.device.findUnique({
      where: { id: params.id },
      select: { nmsDeviceId: true },
    });
    if (!device?.nmsDeviceId) {
      return NextResponse.json({ error: 'Device has no NMS configuration' }, { status: 404 });
    }
    const backup = await (prisma as any).nmsBackup.findUnique({
      where: { id: params.backupId },
      select: {
        id: true,
        backupType: true,
        description: true,
        sizeBytes: true,
        configuration: true,
        checksum: true,
        createdAt: true,
        nmsDeviceId: true,
      },
    });

    if (!backup || backup.nmsDeviceId !== device.nmsDeviceId) {
      return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
    }
    const configuration = backup.configuration
      ? unprotectNmsBackup(backup.configuration)
      : null;
    const checksum = configuration
      ? createHash('sha256').update(configuration, 'utf8').digest('hex')
      : null;
    if (backup.checksum && checksum !== backup.checksum) {
      return NextResponse.json({ error: 'Backup integrity verification failed' }, { status: 409 });
    }

    return NextResponse.json({
      ...backup,
      configuration,
      integrityVerified: Boolean(configuration && backup.checksum),
      sizeBytes: backup.sizeBytes?.toString() ?? '0',
    });
  } catch (error) {
    console.error('[NMS Backup Detail] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch backup' }, { status: 500 });
  }
}

/**
 * DELETE /api/integrations/nms/devices/[id]/backups/[backupId]
 * Delete a backup record from the DB.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const auth = await getRequestActor(req);
    if (!auth) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin role required' }, { status: 403 });
    }
    const device = await prisma.device.findUnique({
      where: { id: params.id },
      select: { nmsDeviceId: true },
    });
    if (!device?.nmsDeviceId) {
      return NextResponse.json({ error: 'Device has no NMS configuration' }, { status: 404 });
    }
    const backup = await prisma.nmsBackup.findFirst({
      where: { id: params.backupId, nmsDeviceId: device.nmsDeviceId },
      select: { id: true, checksum: true },
    });
    if (!backup) return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
    await prisma.$transaction([
      prisma.auditLog.create({
        data: {
          entity: 'NmsBackup',
          entityId: backup.id,
          resource: 'device',
          resourceId: params.id,
          action: 'SSH_CONFIG_BACKUP_DELETED',
          userId: auth.actor.id || null,
          details: { checksum: backup.checksum },
        },
      }),
      prisma.nmsBackup.delete({ where: { id: backup.id } }),
    ]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[NMS Backup Detail] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete backup' }, { status: 500 });
  }
}
