import { AlarmArchiveState, AlarmIncidentStatus, AlarmSeverity2, Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestActor } from '@/lib/auth/request-actor';
import { transitionAlarmIncident, type IncidentAction } from '@/lib/alarms/incident-service';

export const dynamic = 'force-dynamic';

function encodeCursor(value: { lastSeenAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ lastSeenAt: value.lastSeenAt.toISOString(), id: value.id })).toString('base64url');
}

function decodeCursor(value: string | null): { lastSeenAt: Date; id: string } | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { lastSeenAt: string; id: string };
    const lastSeenAt = new Date(parsed.lastSeenAt);
    if (!parsed.id || Number.isNaN(lastSeenAt.getTime())) return null;
    return { lastSeenAt, id: parsed.id };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const limit = Math.min(Math.max(Number(params.get('limit') || 25), 1), 100);
    const cursor = decodeCursor(params.get('cursor'));
    const search = params.get('search')?.trim();
    const source = params.get('source');
    const severity = params.get('severity');
    const archiveState = params.get('archiveState') || AlarmArchiveState.HOT;
    const statuses = params.get('status')?.split(',').filter(Boolean) ?? [];
    const from = params.get('from');
    const to = params.get('to');

    const where: Prisma.AlarmIncidentWhereInput = {};
    if (archiveState !== 'all' && Object.values(AlarmArchiveState).includes(archiveState as AlarmArchiveState)) {
      where.archiveState = archiveState as AlarmArchiveState;
    }
    if (statuses.length > 0) {
      const valid = statuses.filter((status): status is AlarmIncidentStatus =>
        Object.values(AlarmIncidentStatus).includes(status as AlarmIncidentStatus)
      );
      if (valid.length > 0) where.status = { in: valid };
    }
    if (severity && Object.values(AlarmSeverity2).includes(severity as AlarmSeverity2)) {
      where.severity = severity as AlarmSeverity2;
    }
    if (source && source !== 'all') {
      where.source = source === 'firewall'
        ? { in: ['fortianalyzer', 'fortigate-sslvpn'] }
        : source === 'switch'
          ? 'nms'
          : source;
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { message: { contains: search, mode: 'insensitive' } },
        { entityId: { contains: search, mode: 'insensitive' } },
        { alarm: { code: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (from || to) {
      where.lastSeenAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const baseWhere = { ...where };
    if (cursor) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          OR: [
            { lastSeenAt: { lt: cursor.lastSeenAt } },
            { lastSeenAt: cursor.lastSeenAt, id: { lt: cursor.id } },
          ],
        },
      ];
    }

    const [rows, total, statusStats, severityStats, sourceStats] = await Promise.all([
      prisma.alarmIncident.findMany({
        where,
        orderBy: [{ lastSeenAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        include: {
          alarm: { select: { code: true, name: true, description: true } },
          occurrences: { orderBy: { createdAt: 'desc' }, take: 1 },
          _count: { select: { occurrences: true, transitions: true, notificationAttempts: true } },
        },
      }),
      prisma.alarmIncident.count({ where: baseWhere }),
      prisma.alarmIncident.groupBy({ by: ['status'], where: baseWhere, _count: { id: true } }),
      prisma.alarmIncident.groupBy({ by: ['severity'], where: baseWhere, _count: { id: true } }),
      prisma.alarmIncident.groupBy({ by: ['source'], where: baseWhere, _count: { id: true } }),
    ]);

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const last = data[data.length - 1];

    return NextResponse.json({
      success: true,
      data,
      total,
      nextCursor: hasMore && last ? encodeCursor(last) : null,
      stats: {
        status: Object.fromEntries(statusStats.map((item) => [item.status, item._count.id])),
        severity: Object.fromEntries(severityStats.map((item) => [item.severity, item._count.id])),
        source: Object.fromEntries(sourceStats.map((item) => [item.source, item._count.id])),
      },
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    console.error('[AlarmIncidents] GET error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await getRequestActor(request);
    if (!auth) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });

    const body = await request.json() as {
      ids?: string[];
      action?: IncidentAction;
      reason?: string;
      assigneeId?: string | null;
      assigneeName?: string | null;
    };
    const ids = [...new Set(body.ids ?? [])].slice(0, 100);
    const allowedActions: IncidentAction[] = [
      'ACKNOWLEDGE', 'UNACKNOWLEDGE', 'RESOLVE', 'CLOSE', 'ARCHIVE', 'RESTORE',
      'ASSIGN', 'SET_LEGAL_HOLD', 'RELEASE_LEGAL_HOLD',
    ];
    if (ids.length === 0 || !body.action || !allowedActions.includes(body.action)) {
      return NextResponse.json({ success: false, error: 'Valid ids and action are required' }, { status: 400 });
    }

    const adminOnly: IncidentAction[] = ['ARCHIVE', 'RESTORE', 'SET_LEGAL_HOLD', 'RELEASE_LEGAL_HOLD'];
    if (adminOnly.includes(body.action) && auth.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Admin role required' }, { status: 403 });
    }

    const results = [];
    for (const incidentId of ids) {
      results.push(await transitionAlarmIncident({
        incidentId,
        action: body.action,
        actor: auth.actor,
        reason: body.reason,
        assigneeId: body.assigneeId,
        assigneeName: body.assigneeName,
      }));
    }

    return NextResponse.json({ success: true, updated: results.length, data: results });
  } catch (error) {
    console.error('[AlarmIncidents] PATCH error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 400 });
  }
}
