/**
 * GET  /api/alarms - List alarm events
 * PATCH /api/alarms - Acknowledge alarm events
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const severity = searchParams.get('severity');
    const acknowledged = searchParams.get('acknowledged');
    const category = searchParams.get('category');
    const limit = parseInt(searchParams.get('limit') || '100', 10);
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
    const body = await request.json();
    const { ids, acknowledged, acknowledgedBy } = body as {
      ids: string[];
      acknowledged: boolean;
      acknowledgedBy?: string;
    };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ success: false, error: 'ids array required' }, { status: 400 });
    }

    const updated = await prisma.alarmEvent.updateMany({
      where: { id: { in: ids } },
      data: {
        acknowledged: acknowledged !== false,
        acknowledgedBy: acknowledgedBy || 'admin',
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
