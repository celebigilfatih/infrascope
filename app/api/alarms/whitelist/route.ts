import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { authorizeApiRequest } from '@/lib/auth/api-permission';
import { canAccessSync } from '@/lib/auth/permission-policy';
import { alarmWhitelistLockKey } from '@/lib/alarms/incident-exclusion';

/**
 * POST /api/alarms/whitelist
 * Add an alarm to the whitelist to suppress future false positives
 */
export async function POST(request: NextRequest) {
  try {
    const access = await authorizeApiRequest(request, 'alarms', 'write');
    if (!access.allowed) return access.response;
    const { auth } = access;
    const body = await request.json() as Record<string, unknown> | null;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Geçerli bir istek gövdesi gerekiyor.' }, { status: 400 });
    const alarmCode = typeof body.alarmCode === 'string' ? body.alarmCode.trim() : '';
    const field = typeof body.field === 'string' ? body.field.trim() : '';
    const value = typeof body.value === 'string' ? body.value.trim() : '';
    if (!alarmCode || !field || !value) return NextResponse.json({ error: 'Alarm kodu, alan ve değer zorunludur.' }, { status: 400 });
    if (!['sourceIp', 'destIp', 'user', 'hostname', 'deviceName'].includes(field)) return NextResponse.json({ error: 'Geçersiz hariç tutma alanı.' }, { status: 400 });
    if (body.reason != null && typeof body.reason !== 'string') return NextResponse.json({ error: 'Açıklama metin olmalıdır.' }, { status: 400 });
    const reason = typeof body.reason === 'string' ? body.reason.trim() : null;
    if (body.expiresAt != null && typeof body.expiresAt !== 'string') return NextResponse.json({ error: 'Geçersiz bitiş tarihi.' }, { status: 400 });
    const expiresAt = body.expiresAt ? new Date(body.expiresAt as string) : null;
    if (expiresAt && !Number.isFinite(expiresAt.getTime())) return NextResponse.json({ error: 'Geçersiz bitiş tarihi.' }, { status: 400 });

    const result = await prisma.$transaction(async tx => {
      // Also serialize first creation: there is no row to lock yet for a new key.
      const key = alarmWhitelistLockKey(alarmCode, field, value);
      await tx.$queryRaw(Prisma.sql`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
      const existing = await tx.alarmWhitelist.findUnique({ where: { alarmCode_field_value: { alarmCode, field, value } } });
      if (existing) {
        const nextReason = body.reason === undefined ? existing.reason : reason;
        if (existing.enabled && existing.reason === nextReason && existing.expiresAt?.getTime() === expiresAt?.getTime()) {
          return { data: existing, action: 'unchanged' };
        }
        const data = await tx.alarmWhitelist.update({ where: { id: existing.id }, data: { reason: nextReason, expiresAt, enabled: true } });
        return { data, action: 'updated' };
      }
      const data = await tx.alarmWhitelist.create({ data: { alarmCode, field, value, reason, expiresAt, enabled: true, createdBy: auth.actor.name } });
      return { data, action: 'created' };
    }, { timeout: 15000 });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[Whitelist API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to add to whitelist' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/alarms/whitelist
 * Get all active whitelist entries
 */
export async function GET(request: NextRequest) {
  try {
    const access = await authorizeApiRequest(request, 'alarms', 'read');
    if (!access.allowed) return access.response;
    const { searchParams } = new URL(request.url);
    const alarmCode = searchParams.get('alarmCode');
    const includeDisabled = searchParams.get('includeDisabled') === 'true';

    const where: Prisma.AlarmWhitelistWhereInput = {
      enabled: true,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    };

    if (alarmCode) {
      where.alarmCode = alarmCode;
    }

    if (includeDisabled) {
      delete where.enabled;
    }

    const whitelist = await prisma.alarmWhitelist.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: whitelist, canDelete: canAccessSync(access.auth.role, 'alarms', 'delete') }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[Whitelist API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch whitelist' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/alarms/whitelist
 * Remove a whitelist entry
 */
export async function DELETE(request: NextRequest) {
  try {
    const access = await authorizeApiRequest(request, 'alarms', 'delete');
    if (!access.allowed) return access.response;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id?.trim() || id !== id.trim() || searchParams.getAll('id').length !== 1) {
      return NextResponse.json(
        { error: 'Tek bir hariç tutma kaydı kimliği gerekiyor.' },
        { status: 400 }
      );
    }

    // Delete only this immutable ID. A retry after a lost response succeeds even
    // if it is gone, and cannot remove a replacement with the same matching key.
    const result = await prisma.alarmWhitelist.deleteMany({
      where: { id },
    });

    return NextResponse.json({ success: true, removed: result.count });
  } catch (error) {
    console.error('[Whitelist API] Error:', error);
    return NextResponse.json(
      { error: 'Hariç tutma kaydı kaldırılamadı. Tekrar deneyin.' },
      { status: 500 }
    );
  }
}
