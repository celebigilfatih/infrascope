import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getRequestActor } from '@/lib/auth/request-actor';
import { POST as createDeviceBackup } from '../devices/[id]/backups/route';
import { canManageBackups } from '@/lib/nms/backup-platform';

export const dynamic = 'force-dynamic';

/** List persisted backups without returning configuration or credentials. */
export async function GET(req: NextRequest) {
  try {
    const auth = await getRequestActor(req);
    if (!auth) return NextResponse.json({ error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const deviceId = searchParams.get('device_id');
    if (deviceId !== null && (!/^\d+$/.test(deviceId) || !Number.isSafeInteger(Number(deviceId)) || Number(deviceId) < 1 || Number(deviceId) > 2147483647)) {
      return NextResponse.json({ error: 'Invalid device_id' }, { status: 400 });
    }
    const backupType = searchParams.get('backup_type');
    const search = searchParams.get('search')?.trim();
    const limit = Number(searchParams.get('limit') || 100);
    const offset = Number(searchParams.get('offset') || 0);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500 || !Number.isSafeInteger(offset) || offset < 0) {
      return NextResponse.json({ error: 'Sayfalama değerleri geçersiz.' }, { status: 400 });
    }
    const where: Prisma.NmsBackupWhereInput = {
      ...(deviceId ? { nmsDeviceId: Number(deviceId) } : {}),
      ...(backupType ? { backupType } : {}),
      ...(search ? { OR: [
        { backupFile: { contains: search, mode: 'insensitive' } },
        { device: { name: { contains: search, mode: 'insensitive' } } },
        { deviceName: { contains: search, mode: 'insensitive' } },
      ] } : {}),
    };
    const backups = await prisma.nmsBackup.findMany({
      where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit, skip: offset,
      select: {
        id: true, nmsDeviceId: true, backupType: true, backupFile: true,
        description: true, sizeBytes: true, createdAt: true,
        deviceName: true, platform: true, device: { select: { id: true, name: true } },
      },
    });
    const data = backups.map(backup => ({
      id: backup.id, device_id: backup.nmsDeviceId, inventory_device_id: backup.device?.id,
      device_name: backup.device?.name || backup.deviceName, archived: !backup.device, platform: backup.platform, backup_type: backup.backupType,
      file_name: backup.backupFile || `backup-${backup.id}.cfg`, description: backup.description,
      file_size: Number(backup.sizeBytes), created_at: backup.createdAt.toISOString(), status: 'success',
    }));
    const total = await prisma.nmsBackup.count({ where });
    return NextResponse.json({ data, total, limit, offset, permissions: { create: canManageBackups(auth.role), content: canManageBackups(auth.role), delete: auth.role === 'ADMIN' } }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[NMS Backups] GET error:', error);
    return NextResponse.json({ error: 'Konfigürasyon yedekleri yüklenemedi.' }, { status: 503 });
  }
}

/** Reuse the device backup workflow, including internal authentication and audit. */
export async function POST(req: NextRequest) {
  try {
    const auth = await getRequestActor(req);
    if (!auth) return NextResponse.json({ error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
    if (!canManageBackups(auth.role)) return NextResponse.json({ error: 'Yedek oluşturma yetkiniz yok.' }, { status: 403 });
    const body = await req.json();
    const nmsDeviceId = Number(body.device_id);
    if (!Number.isSafeInteger(nmsDeviceId) || nmsDeviceId < 1 || nmsDeviceId > 2147483647) return NextResponse.json({ error: 'Cihaz numarası geçersiz.' }, { status: 400 });
    if ((body.backup_type && !['Running Config', 'Startup Config'].includes(body.backup_type)) || (body.schedule && body.schedule !== 'Run Now')) {
      return NextResponse.json({ error: 'Yedek türü geçersiz; zamanlamayı yedekleme politikasından ayarlayın.' }, { status: 400 });
    }
    const device = await prisma.device.findUnique({ where: { nmsDeviceId }, select: { id: true } });
    if (!device) return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    const deviceRequest = new NextRequest(req.url, {
      method: 'POST', headers: req.headers,
      body: JSON.stringify({ backupType: body.backup_type || 'Running Config', description: body.description || null }),
    });
    return createDeviceBackup(deviceRequest, { params: { id: device.id } });
  } catch (error) {
    console.error('[NMS Backups] POST error:', error);
    return NextResponse.json({ error: 'Failed to create configuration backup' }, { status: 500 });
  }
}
