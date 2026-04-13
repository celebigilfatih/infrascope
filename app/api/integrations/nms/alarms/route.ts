import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/integrations/nms/alarms
 * Get NMS device alarms from infrascope alarm_events table
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'active';
    const deviceId = searchParams.get('device_id');

    // Map status filter
    const statusFilter = status === 'active' ? ['ACTIVE', 'TRIGGERED'] : undefined;

    const alarms = await (prisma as any).alarmEvent.findMany({
      where: {
        ...(statusFilter ? { status: { in: statusFilter } } : {}),
        // NMS device alarms have alarmCode starting with NMS_ or SNMP_
        OR: [
          { alarmCode: { startsWith: 'NMS_' } },
          { alarmCode: { startsWith: 'SNMP_' } },
          { alarmCode: { startsWith: 'DEVICE_' } },
          { alarmCode: { contains: 'PORT' } },
        ],
      },
      orderBy: { triggeredAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ alarms, total: alarms.length });
  } catch (error: any) {
    console.error('[NMS Alarms] GET error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch alarms', details: error.message }, { status: 500 });
  }
}

/**
 * PATCH /api/integrations/nms/alarms
 * Acknowledge or resolve an alarm
 */
export async function PATCH(req: NextRequest) {
  try {
    const { id, action } = await req.json();
    const newStatus = action === 'resolve' ? 'RESOLVED' : 'ACKNOWLEDGED';

    const updated = await (prisma as any).alarmEvent.update({
      where: { id },
      data: {
        status: newStatus,
        ...(action === 'resolve' ? { resolvedAt: new Date() } : { acknowledgedAt: new Date() }),
      },
    });

    return NextResponse.json({ alarm: updated });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to update alarm', details: error.message }, { status: 500 });
  }
}
