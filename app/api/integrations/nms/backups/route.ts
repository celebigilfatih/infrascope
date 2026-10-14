import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getRequestActor } from '@/lib/auth/request-actor';
import { POST as createDeviceBackup } from '../devices/[id]/backups/route';

export const dynamic = 'force-dynamic';

/** List persisted backups without returning configuration or credentials. */
export async function GET(req: NextRequest) {
  try {
    if (!await getRequestActor(req)) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const deviceId = searchParams.get('device_id');
    if (deviceId !== null && (!/^\d+$/.test(deviceId) || !Number.isSafeInteger(Number(deviceId)) || Number(deviceId) < 1)) {
      return NextResponse.json({ error: 'Invalid device_id' }, { status: 400 });
    }
    const backupType = searchParams.get('backup_type');
    const search = searchParams.get('search')?.trim();
    const where: Prisma.NmsBackupWhereInput = {
      ...(deviceId ? { nmsDeviceId: Number(deviceId) } : {}),
      ...(backupType ? { backupType } : {}),
      ...(search ? { OR: [
        { backupFile: { contains: search, mode: 'insensitive' } },
        { device: { name: { contains: search, mode: 'insensitive' } } },
      ] } : {}),
    };
    const backups = await prisma.nmsBackup.findMany({
      where, orderBy: { createdAt: 'desc' },
      select: {
        id: true, nmsDeviceId: true, backupType: true, backupFile: true,
        description: true, sizeBytes: true, createdAt: true,
        device: { select: { id: true, name: true } },
      },
    });
    const data = backups.map(backup => ({
      id: backup.id, device_id: backup.nmsDeviceId, inventory_device_id: backup.device.id,
      device_name: backup.device.name, backup_type: backup.backupType,
      file_name: backup.backupFile || `backup-${backup.id}.cfg`, description: backup.description,
      file_size: Number(backup.sizeBytes), created_at: backup.createdAt.toISOString(), status: 'success',
    }));
    return NextResponse.json({ data, total: data.length }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[NMS Backups] GET error:', error);
    return NextResponse.json({ error: 'Failed to load configuration backups' }, { status: 500 });
  }
}

/** Reuse the device backup workflow, including internal authentication and audit. */
export async function POST(req: NextRequest) {
  try {
    if (!await getRequestActor(req)) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const body = await req.json();
    const nmsDeviceId = Number(body.device_id);
    if (!Number.isSafeInteger(nmsDeviceId) || nmsDeviceId < 1) return NextResponse.json({ error: 'Invalid device_id' }, { status: 400 });
    if ((body.backup_type && body.backup_type !== 'Running Config') || (body.schedule && body.schedule !== 'Run Now')) {
      return NextResponse.json({ error: 'Only immediate Running Config backups are supported' }, { status: 400 });
    }
    const device = await prisma.device.findUnique({ where: { nmsDeviceId }, select: { id: true } });
    if (!device) return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    const deviceRequest = new NextRequest(req.url, {
      method: 'POST', headers: req.headers,
      body: JSON.stringify({ backupType: 'Running Config', description: body.description || null }),
    });
    return createDeviceBackup(deviceRequest, { params: { id: device.id } });
  } catch (error) {
    console.error('[NMS Backups] POST error:', error);
    return NextResponse.json({ error: 'Failed to create configuration backup' }, { status: 500 });
  }
}
