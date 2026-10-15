import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getRequestActor } from '@/lib/auth/request-actor';
import { BACKUP_PROFILES, canManageBackups, resolveBackupPlatform, supportsBackupType } from '@/lib/nms/backup-platform';
export const dynamic = 'force-dynamic';

const schema = z.object({
  device_id: z.number().int().positive().max(2147483647), enabled: z.boolean(),
  platform: z.string().nullable(), backup_type: z.enum(['Running Config','Startup Config']),
  interval_hours: z.number().int().min(1).max(8760), retention_days: z.number().int().min(1).max(3650),
  keep_last: z.number().int().min(1).max(10000), stale_after_hours: z.number().int().min(1).max(17520),
}).strict().refine(data => data.stale_after_hours >= data.interval_hours);

export async function GET(req: NextRequest) {
  const auth = await getRequestActor(req);
  if (!auth) return NextResponse.json({ error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
  const devices = await prisma.device.findMany({ where: { nmsDeviceId: { not: null }, managementIp: { not: null } },
    select: { id: true, nmsDeviceId: true, name: true, vendor: true, model: true, operatingSystem: true, backupPlatform: true } });
  const policies = await prisma.nmsBackupPolicy.findMany();
  const latest = await prisma.nmsBackup.groupBy({ by: ['nmsDeviceId'], where: { nmsDeviceId: { not: null } }, _max: { createdAt: true } });
  return NextResponse.json({ profiles: BACKUP_PROFILES, canEdit: auth.role === 'ADMIN', canCreate: canManageBackups(auth.role),
    devices: devices.map(device => ({ id: device.nmsDeviceId, name: device.name, platform: resolveBackupPlatform(device),
      policy: policies.find(policy => policy.nmsDeviceId === device.nmsDeviceId && policy.inventoryDeviceId === device.id) || null,
      lastSuccessAt: latest.find(backup => backup.nmsDeviceId === device.nmsDeviceId)?._max.createdAt || null,
    })),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PUT(req: NextRequest) {
  const auth = await getRequestActor(req);
  if (!auth) return NextResponse.json({ error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
  if (auth.role !== 'ADMIN') return NextResponse.json({ error: 'Yalnızca yönetici yedekleme ayarlarını değiştirebilir.' }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Politika değerleri geçersiz. Gecikme sınırı yedek aralığından kısa olamaz.' }, { status: 400 });
  const body = parsed.data;
  if (body.platform !== null && !Object.prototype.hasOwnProperty.call(BACKUP_PROFILES, body.platform)) return NextResponse.json({ error: 'Platform geçersiz.' }, { status: 400 });
  const device = await prisma.device.findUnique({ where: { nmsDeviceId: body.device_id } });
  if (!device) return NextResponse.json({ error: 'Cihaz bulunamadı.' }, { status: 404 });
  const platform = resolveBackupPlatform({ ...device, backupPlatform: body.platform });
  if (body.enabled && (!supportsBackupType(platform, body.backup_type) || !device.sshUsername || !device.sshPassword || !device.sshHostKeyFingerprint)) {
    return NextResponse.json({ error: 'Zamanlama için desteklenen platform, SSH bilgileri ve cihaz anahtarı onayı gerekiyor.' }, { status: 422 });
  }
  const policy = await prisma.$transaction(async tx => {
    await tx.device.update({ where: { id: device.id }, data: { backupPlatform: body.platform } });
    const data = { inventoryDeviceId: device.id, enabled: body.enabled, backupType: body.backup_type,
      intervalHours: body.interval_hours, retentionDays: body.retention_days, keepLast: body.keep_last,
      staleAfterHours: body.stale_after_hours, nextRunAt: new Date(Date.now() + body.interval_hours * 3600000) };
    const result = await tx.nmsBackupPolicy.upsert({ where: { nmsDeviceId: body.device_id }, create: { ...data, nmsDeviceId: body.device_id }, update: data });
    await tx.auditLog.create({ data: { entity: 'NmsBackupPolicy', entityId: result.id, resource: 'device', resourceId: device.id,
      action: 'SSH_CONFIG_BACKUP_POLICY_UPDATED', userId: auth.actor.id, details: body } });
    return result;
  });
  return NextResponse.json({ success: true, policy });
}
