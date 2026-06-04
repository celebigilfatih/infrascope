/**
 * GET  /api/alarms - List alarm events
 * PATCH /api/alarms - Acknowledge alarm events
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateBody } from '@/lib/validators';
import { acknowledgeAlarmsSchema } from '@/lib/validators/alarms';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const severity = searchParams.get('severity');
    const acknowledged = searchParams.get('acknowledged');
    const category = searchParams.get('category');
    const source = searchParams.get('source');
    const search = searchParams.get('search');
    const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10), 200);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const where: Record<string, unknown> = {};

    if (severity) {
      where.severity = severity;
    }
    if (acknowledged !== null && acknowledged !== '') {
      where.acknowledged = acknowledged === 'true';
    }
    if (category) {
      where.alarm = { category };
    }
    if (source) {
      // Map UI source categories to DB-level filters
      // 'vmware' → alarm.source = 'vmware' OR alarm.code starts with VM_/SNAPSHOT_/MULTIPLE_SNAPSHOTS
      // 'switch' → alarm.code starts with NMS_/SNMP_/PORT_/DEVICE_
      // 'firewall' → everything else (fortianalyzer, fortigate-sslvpn, or no source)
      const existingAlarm = (where.alarm as Record<string, unknown>) || {};
      const alarmFilter: Record<string, unknown> = { ...existingAlarm };
      if (source === 'vmware') {
        alarmFilter.OR = [
          { source: 'vmware' },
          { code: { startsWith: 'VM_', mode: 'insensitive' } },
          { code: { startsWith: 'SNAPSHOT_', mode: 'insensitive' } },
          { code: 'MULTIPLE_SNAPSHOTS' },
        ];
      } else if (source === 'switch') {
        alarmFilter.OR = [
          { code: { startsWith: 'NMS_', mode: 'insensitive' } },
          { code: { startsWith: 'SNMP_', mode: 'insensitive' } },
          { code: { startsWith: 'PORT_', mode: 'insensitive' } },
          { code: { startsWith: 'DEVICE_', mode: 'insensitive' } },
        ];
      } else if (source === 'firewall') {
        alarmFilter.OR = [
          { source: 'fortianalyzer' },
          { source: 'fortigate-sslvpn' },
        ];
      }
      where.alarm = alarmFilter;
    }
    if (search) {
      const term = search.toLowerCase();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { message: { contains: term, mode: 'insensitive' } },
        { sourceIp: { contains: term } },
        { deviceName: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [events, total] = await Promise.all([
      prisma.alarmEvent.findMany({
        where,
        include: {
          alarm: {
            select: { code: true, name: true, category: true, description: true, source: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.alarmEvent.count({ where }),
    ]);

    // Stats
    const stats = await prisma.alarmEvent.groupBy({
      by: ['severity'],
      where: { acknowledged: false },
      _count: { id: true },
    });

    const severityStats: Record<string, number> = {};
    for (const s of stats) {
      severityStats[s.severity] = s._count.id;
    }

    return NextResponse.json({
      success: true,
      data: events,
      total,
      stats: severityStats,
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('[Alarms] GET error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const rawBody = await request.json();
    const parsed = validateBody(rawBody, acknowledgeAlarmsSchema);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }
    const { ids, acknowledged } = parsed.data;

    const updated = await prisma.alarmEvent.updateMany({
      where: { id: { in: ids } },
      data: {
        acknowledged: acknowledged !== false,
        acknowledgedBy: 'admin',
        acknowledgedAt: acknowledged !== false ? new Date() : null,
      },
    });

    return NextResponse.json({
      success: true,
      updated: updated.count,
    });
  } catch (error) {
    console.error('[Alarms] PATCH error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
