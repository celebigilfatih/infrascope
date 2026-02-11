/**
 * GET /api/alarms/definitions - List alarm definitions
 * PUT /api/alarms/definitions - Update alarm definition (enable/disable, thresholds)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { seedAlarmDefinitions } from '@/lib/alarms/seed-alarms';

export async function GET() {
  try {
    const definitions = await prisma.alarmDefinition.findMany({
      orderBy: [{ category: 'asc' }, { severity: 'asc' }, { code: 'asc' }],
      include: {
        _count: {
          select: { alarmEvents: true },
        },
      },
    });

    return NextResponse.json({ success: true, data: definitions });
  } catch (error) {
    console.error('[AlarmDefs] GET error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, enabled, cooldownMinutes, notifyEmail, detectionLogic, action } = body as {
      id?: string;
      enabled?: boolean;
      cooldownMinutes?: number;
      notifyEmail?: boolean;
      detectionLogic?: Record<string, unknown>;
      action?: string;
    };

    // Seed action
    if (action === 'seed') {
      const result = await seedAlarmDefinitions();
      return NextResponse.json({ success: true, ...result });
    }

    if (!id) {
      return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
    }

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
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
