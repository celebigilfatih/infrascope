import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestActor } from '@/lib/auth/request-actor';
import { readBackup, deleteBackup } from '@/lib/nms/backup-service';

interface Params { params: Promise<{ id: string; backupId: string }> }
async function deviceId(id: string) {
  return prisma.device.findUnique({ where: { id }, select: { nmsDeviceId: true } });
}
export async function GET(req: NextRequest, props: Params) {
  const params = await props.params;
  if (!(await getRequestActor(req))) return NextResponse.json({ error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
  const device = await deviceId(params.id);
  if (!device?.nmsDeviceId) return NextResponse.json({ error: 'Cihaz bulunamadı.' }, { status: 404 });
  return readBackup(req, params.backupId, device.nmsDeviceId);
}
export async function DELETE(req: NextRequest, props: Params) {
  const params = await props.params;
  if (!(await getRequestActor(req))) return NextResponse.json({ error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
  const device = await deviceId(params.id);
  if (!device?.nmsDeviceId) return NextResponse.json({ error: 'Cihaz bulunamadı.' }, { status: 404 });
  return deleteBackup(req, params.backupId, device.nmsDeviceId);
}
