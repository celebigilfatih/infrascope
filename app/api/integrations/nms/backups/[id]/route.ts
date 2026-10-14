import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestActor } from '@/lib/auth/request-actor';
import { GET as readDeviceBackup, DELETE as deleteDeviceBackup } from '../../devices/[id]/backups/[backupId]/route';

export const dynamic = 'force-dynamic';
type Params = { params: { id: string } };

async function loadBackup(id: string) {
  return prisma.nmsBackup.findUnique({ where: { id }, select: { backupFile: true, device: { select: { id: true } } } });
}

/** Read or download the same verified, decrypted record as the device page. */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    if (!await getRequestActor(req)) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const backup = await loadBackup(params.id);
    if (!backup) return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
    const response = await readDeviceBackup(req, { params: { id: backup.device.id, backupId: params.id } });
    if (!response.ok || new URL(req.url).searchParams.get('action') !== 'download') {
      response.headers.set('Cache-Control', 'private, no-store');
      return response;
    }
    const data = await response.json() as { configuration: string | null };
    if (!data.configuration) return NextResponse.json({ error: 'Backup configuration not found' }, { status: 404 });
    const filename = (backup.backupFile || `backup-${params.id}.cfg`).replace(/[^a-zA-Z0-9._-]/g, '_');
    return new NextResponse(data.configuration, { headers: {
      'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) {
    console.error('[NMS Backup] GET error:', error);
    return NextResponse.json({ error: 'Failed to read configuration backup' }, { status: 500 });
  }
}

/** Reuse ADMIN authorization and the audited device-scoped deletion. */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const auth = await getRequestActor(req);
    if (!auth) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (auth.role !== 'ADMIN') return NextResponse.json({ error: 'Admin role required' }, { status: 403 });
    const backup = await loadBackup(params.id);
    if (!backup) return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
    return deleteDeviceBackup(req, { params: { id: backup.device.id, backupId: params.id } });
  } catch (error) {
    console.error('[NMS Backup] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete configuration backup' }, { status: 500 });
  }
}
