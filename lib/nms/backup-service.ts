import { randomUUID, createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getRequestActor } from '@/lib/auth/request-actor';
import { unprotectNmsBackup } from '@/lib/security/integration-credentials';
import { canManageBackups, getBackupReadiness, resolveBackupPlatform, supportsBackupType } from './backup-platform';

export const jobSelect = {
  id: true, nmsDeviceId: true, deviceName: true, backupType: true, status: true,
  attempts: true, maxAttempts: true, backupId: true, errorCode: true, errorMessage: true,
  createdAt: true, startedAt: true, finishedAt: true, runAfter: true,
} satisfies Prisma.NmsBackupJobSelect;

const requestSchema = z.object({
  backupType: z.enum(['Running Config', 'Startup Config']).default('Running Config'),
  description: z.string().trim().max(1000).nullable().optional(),
}).strict();

export async function enqueueDeviceBackup(req: NextRequest, inventoryId: string) {
  const auth = await getRequestActor(req);
  if (!auth) return NextResponse.json({ error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
  if (!canManageBackups(auth.role)) return NextResponse.json({ error: 'Yedek oluşturma yetkiniz yok.' }, { status: 403 });
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Yedek türü veya açıklama geçersiz.' }, { status: 400 });
  const key = req.headers.get('Idempotency-Key') || randomUUID();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) return NextResponse.json({ error: 'İstek anahtarı geçersiz.' }, { status: 400 });
  const idempotencyKey = `manual:${auth.actor.id}:${key}`;
  const device = await prisma.device.findUnique({ where: { id: inventoryId }, select: {
    id: true, name: true, nmsDeviceId: true, managementIp: true, vendor: true, model: true,
    operatingSystem: true, backupPlatform: true, sshUsername: true, sshPassword: true, sshHostKeyFingerprint: true,
  } });
  if (!device?.nmsDeviceId || !device.managementIp) return NextResponse.json({ error: 'Cihazın NMS kaydı veya yönetim adresi bulunmuyor.' }, { status: 404 });
  const platform = resolveBackupPlatform(device);
  if (!platform) return NextResponse.json({ error: 'Cihazın yedekleme platformunu ayarlardan seçin.', code: 'UNSUPPORTED_PLATFORM' }, { status: 422 });
  if (!supportsBackupType(platform, parsed.data.backupType)) return NextResponse.json({ error: 'Bu platform seçilen yedek türünü desteklemiyor.', code: 'UNSUPPORTED_TYPE' }, { status: 422 });
  const readiness = getBackupReadiness(device, auth.role);
  if (!readiness.ready) return NextResponse.json({ error: readiness.blockers[0].message, code: readiness.blockers[0].code }, { status: 422 });
  const respond = (job: Prisma.NmsBackupJobGetPayload<{ select: typeof jobSelect }>, reused: boolean) =>
    NextResponse.json({ success: true, accepted: true, reused, job }, { status: 202, headers: { 'Cache-Control': 'private, no-store' } });
  const existing = await prisma.nmsBackupJob.findUnique({ where: { idempotencyKey }, select: { ...jobSelect, inventoryDeviceId: true } });
  if (existing) {
    if (existing.inventoryDeviceId !== inventoryId || existing.backupType !== parsed.data.backupType) return NextResponse.json({ error: 'Aynı istek anahtarı farklı bir işlem için kullanılamaz.' }, { status: 409 });
    return respond(existing, true);
  }
  try {
    const job = await prisma.$transaction(async tx => {
      const created = await tx.nmsBackupJob.create({ data: {
        inventoryDeviceId: device.id, nmsDeviceId: device.nmsDeviceId!, deviceName: device.name,
        backupType: parsed.data.backupType, description: parsed.data.description,
        requestedBy: auth.actor.id, idempotencyKey, activeDeviceKey: device.nmsDeviceId,
      }, select: jobSelect });
      await tx.auditLog.create({ data: {
        entity: 'NmsBackupJob', entityId: created.id, resource: 'device', resourceId: device.id,
        action: 'SSH_CONFIG_BACKUP_REQUESTED', userId: auth.actor.id,
        details: { backupType: created.backupType, jobId: created.id },
      } });
      return created;
    });
    return respond(job, false);
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    const active = await prisma.nmsBackupJob.findFirst({ where: { OR: [{ idempotencyKey }, { activeDeviceKey: device.nmsDeviceId }] }, select: { ...jobSelect, inventoryDeviceId: true } });
    if (active?.inventoryDeviceId === inventoryId && active.backupType === parsed.data.backupType) return respond(active, true);
    return NextResponse.json({ error: 'Cihazda başka bir yedekleme işi devam ediyor.', jobId: active?.id }, { status: 409 });
  }
}

export async function readBackup(req: NextRequest, id: string, nmsDeviceId?: number) {
  const auth = await getRequestActor(req);
  if (!auth) return NextResponse.json({ error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
  if (!canManageBackups(auth.role)) return NextResponse.json({ error: 'Yedek içeriğini okuma yetkiniz yok.' }, { status: 403 });
  const backup = await prisma.nmsBackup.findFirst({ where: { id, ...(nmsDeviceId === undefined ? {} : { nmsDeviceId }) } });
  if (!backup) return NextResponse.json({ error: 'Yedek bulunamadı.' }, { status: 404 });
  let configuration: string;
  try {
    configuration = unprotectNmsBackup(backup.configuration || '');
    if (!configuration || !backup.checksum || createHash('sha256').update(configuration).digest('hex') !== backup.checksum) throw new Error('Integrity mismatch');
  } catch {
    return NextResponse.json({ error: 'Yedek çözülemedi veya bütünlük doğrulaması başarısız.' }, { status: 409 });
  }
  await prisma.auditLog.create({ data: {
    entity: 'NmsBackup', entityId: id, resource: 'device', action: 'SSH_CONFIG_BACKUP_READ',
    userId: auth.actor.id, details: { download: new URL(req.url).searchParams.get('action') === 'download' },
  } });
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  if (new URL(req.url).searchParams.get('action') === 'download') {
    const filename = (backup.backupFile || `backup-${id}.cfg`).replace(/[^A-Za-z0-9._-]/g, '_');
    return new NextResponse(configuration, { headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"` } });
  }
  return NextResponse.json({ id, configuration, checksum: backup.checksum, backupType: backup.backupType, sizeBytes: String(backup.sizeBytes) }, { headers });
}

export async function deleteBackup(req: NextRequest, id: string, nmsDeviceId?: number) {
  const auth = await getRequestActor(req);
  if (!auth) return NextResponse.json({ error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
  if (auth.role !== 'ADMIN') return NextResponse.json({ error: 'Yedeği yalnızca yönetici silebilir.' }, { status: 403 });
  const backup = await prisma.nmsBackup.findFirst({ where: { id, ...(nmsDeviceId === undefined ? {} : { nmsDeviceId }) }, select: { id: true, checksum: true } });
  if (!backup) return NextResponse.json({ error: 'Yedek bulunamadı.' }, { status: 404 });
  await prisma.$transaction([
    prisma.auditLog.create({ data: { entity: 'NmsBackup', entityId: id, resource: 'device', action: 'SSH_CONFIG_BACKUP_DELETED', userId: auth.actor.id, details: { checksum: backup.checksum } } }),
    prisma.nmsBackup.delete({ where: { id } }),
  ]);
  return NextResponse.json({ success: true });
}
