import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestActor } from '@/lib/auth/request-actor';
import { enqueueDeviceBackup } from '@/lib/nms/backup-service';
import { canManageBackups, resolveBackupPlatform, supportsBackupType } from '@/lib/nms/backup-platform';

export const dynamic = 'force-dynamic';
interface Params { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, props: Params) {
  const params = await props.params;
  const auth = await getRequestActor(req);
  if (!auth) return NextResponse.json({ error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
  const device = await prisma.device.findUnique({ where: { id: params.id }, select: { nmsDeviceId: true, name: true, vendor: true, model: true, operatingSystem: true, backupPlatform: true } });
  if (!device?.nmsDeviceId) return NextResponse.json({ error: 'Cihaz bulunamadı.' }, { status: 404 });
  const backups = await prisma.nmsBackup.findMany({ where: { nmsDeviceId: device.nmsDeviceId }, orderBy: { createdAt: 'desc' }, take: 500,
    select: { id: true, backupType: true, backupFile: true, description: true, sizeBytes: true, checksum: true, createdAt: true, updatedAt: true } });
  const platform = resolveBackupPlatform(device);
  return NextResponse.json({ backups: backups.map(backup => ({ ...backup, sizeBytes: String(backup.sizeBytes) })), deviceName: device.name,
    permissions: { create: canManageBackups(auth.role), running: supportsBackupType(platform, 'Running Config'), startup: supportsBackupType(platform, 'Startup Config') },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(req: NextRequest, props: Params) {
  const params = await props.params;
  try { return await enqueueDeviceBackup(req, params.id); }
  catch (error) {
    console.error('[NMS Backups] Queue request failed', error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json({ error: 'Yedekleme işi kaydedilemedi.' }, { status: 503 });
  }
}
