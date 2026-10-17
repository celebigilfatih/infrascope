/**
 * GET /api/alarms/definitions - List alarm definitions
 * PUT /api/alarms/definitions - Update alarm definition (enable/disable, thresholds)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAlarmCatalogStatus } from '@/lib/alarms/alarm-catalog';
import { validateBody } from '@/lib/validators';
import { alarmDefinitionUpdateSchema } from '@/lib/validators/alarms';
import { authorizeApiRequest } from '@/lib/auth/api-permission';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const permission = await authorizeApiRequest(request, 'alarms', 'read');
    if (!permission.allowed) return permission.response;
    const definitions = await prisma.alarmDefinition.findMany({
      orderBy: [{ category: 'asc' }, { severity: 'asc' }, { code: 'asc' }],
      include: {
        _count: {
          select: { alarmEvents: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: definitions,
      catalog: getAlarmCatalogStatus(definitions.map((definition) => definition.code)),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[AlarmDefs] GET error:', error);
    return NextResponse.json({ success: false, error: 'Alarm kuralları yüklenemedi.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const permission = await authorizeApiRequest(request, 'alarms', 'write');
    if (!permission.allowed) return permission.response;
    const body = await request.json();
    const parsed = validateBody(body, alarmDefinitionUpdateSchema);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    const { id, enabled, cooldownMinutes, notifyEmail, detectionLogic } = parsed.data;

    const data: Record<string, unknown> = {};
    if (typeof enabled === 'boolean') data.enabled = enabled;
    if (typeof cooldownMinutes === 'number') data.cooldownMinutes = cooldownMinutes;
    if (typeof notifyEmail === 'boolean') data.notifyEmail = notifyEmail;
    if (detectionLogic) data.detectionLogic = detectionLogic;

    const updated = await prisma.alarmDefinition.update({
      where: { id },
      data,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('[AlarmDefs] PUT error:', error);
    if (error instanceof SyntaxError) return NextResponse.json({ success: false, error: 'İstek geçerli JSON olmalıdır.' }, { status: 400 });
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') return NextResponse.json({ success: false, error: 'Kural bulunamadı.' }, { status: 404 });
    return NextResponse.json({ success: false, error: 'Alarm kuralı kaydedilemedi.' }, { status: 500 });
  }
}
