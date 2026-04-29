import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/integrations/nms/alarms
 * Get NMS/SNMP/port alarm events from the infrascope alarm_events table.
 *
 * Filters by AlarmDefinition.code prefix (NMS_, SNMP_, DEVICE_, or contains PORT).
 * `status=active` means NOT acknowledged. This schema has no explicit status field.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'active';

    // Active = not acknowledged (schema has no status enum on AlarmEvent)
    const ackFilter = status === 'active' ? { acknowledged: false } : {};

    const events = await (prisma as any).alarmEvent.findMany({
      where: {
        ...ackFilter,
        alarm: {
          is: {
            OR: [
              { code: { startsWith: 'NMS_' } },
              { code: { startsWith: 'SNMP_' } },
              { code: { startsWith: 'DEVICE_' } },
              { code: { contains: 'PORT' } },
            ],
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        severity: true,
        title: true,
        message: true,
        deviceName: true,
        sourceIp: true,
        acknowledged: true,
        acknowledgedAt: true,
        createdAt: true,
        alarm: { select: { code: true, name: true } },
      },
    });

    // Normalize to the shape the dashboard expects
    const data = events.map((e: any) => ({
      id: e.id,
      device_name: e.deviceName || '—',
      message: e.message || e.title,
      severity: String(e.severity || '').toLowerCase(),
      code: e.alarm?.code,
      created_at: e.createdAt,
      acknowledged: e.acknowledged,
    }));

    return NextResponse.json({ data, total: data.length });
  } catch (error: any) {
    console.error('[NMS Alarms] GET error:', error.message);
    return NextResponse.json(
      { error: 'Failed to fetch alarms', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/integrations/nms/alarms
 * Acknowledge an alarm event (schema has no resolve state on AlarmEvent).
 */
export async function PATCH(req: NextRequest) {
  try {
    const { id } = await req.json();
    const updated = await (prisma as any).alarmEvent.update({
      where: { id },
      data: { acknowledged: true, acknowledgedAt: new Date() },
    });
    return NextResponse.json({ alarm: updated });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to update alarm', details: error.message },
      { status: 500 }
    );
  }
}
