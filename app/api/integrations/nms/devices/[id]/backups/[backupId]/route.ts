import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface Params { params: { id: string; backupId: string } }

/**
 * GET /api/integrations/nms/devices/[id]/backups/[backupId]
 * Fetch full configuration text for a specific backup.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
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
      },
    });

    if (!backup) {
      return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
    }

    return NextResponse.json({
      ...backup,
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
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await (prisma as any).nmsBackup.delete({ where: { id: params.backupId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[NMS Backup Detail] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete backup' }, { status: 500 });
  }
}
