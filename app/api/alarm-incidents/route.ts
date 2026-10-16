import { AlarmArchiveState, Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestActor } from '@/lib/auth/request-actor';
import { authorizeApiRequest } from '@/lib/auth/api-permission';
import { transitionAlarmIncident, type IncidentAction } from '@/lib/alarms/incident-service';
import { incidentAssigneeFilter, incidentListFilters, incidentListOrdering, incidentCursorFilter, encodeIncidentCursor } from '@/lib/alarms/incident-list';
import { incidentBulkLifecycleReason, isIncidentBulkLifecycleEligible } from '@/lib/alarms/incident-bulk-lifecycle';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await getRequestActor(request);
    if (!auth) return NextResponse.json({ success: false, error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
    const params = request.nextUrl.searchParams;
    const requestedLimit = Number(params.get('limit') || 25);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.floor(requestedLimit), 1), 100) : 25;
    const archiveState = params.get('archiveState') || AlarmArchiveState.HOT;
    const ordering = incidentListOrdering(params);
    let baseWhere: Prisma.AlarmIncidentWhereInput;
    let cursorWhere: Prisma.AlarmIncidentWhereInput | null;
    try {
      baseWhere = incidentListFilters(params, auth.actor.id);
      cursorWhere = incidentCursorFilter(params.get('cursor'), ordering);
    } catch (error) {
      return NextResponse.json({ success: false, error: (error as Error).message }, { status: 400 });
    }
    const where: Prisma.AlarmIncidentWhereInput = cursorWhere ? { AND: [baseWhere, cursorWhere] } : baseWhere;
    const overviewWhere: Prisma.AlarmIncidentWhereInput = incidentAssigneeFilter(params, auth.actor.id);
    if (archiveState !== 'all' && Object.values(AlarmArchiveState).includes(archiveState as AlarmArchiveState)) {
      overviewWhere.archiveState = archiveState as AlarmArchiveState;
    }

    const [rows, total, statusStats, severityStats, sourceStats, overviewStatusStats, overviewSeverityStats, activeSeverityStats] = await Promise.all([
      prisma.alarmIncident.findMany({
        where,
        orderBy: ordering.orderBy,
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
      prisma.alarmIncident.groupBy({ by: ['status'], where: overviewWhere, _count: { id: true } }),
      prisma.alarmIncident.groupBy({ by: ['severity'], where: overviewWhere, _count: { id: true } }),
      prisma.alarmIncident.groupBy({ by: ['severity'], where: { ...overviewWhere, status: { in: ['OPEN', 'ACKNOWLEDGED'] } }, _count: { id: true } }),
    ]);

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const last = data[data.length - 1];

    return NextResponse.json({
      success: true,
      data,
      total,
      nextCursor: hasMore && last ? encodeIncidentCursor(last, ordering) : null,
      stats: {
        status: Object.fromEntries(statusStats.map((item) => [item.status, item._count.id])),
        severity: Object.fromEntries(severityStats.map((item) => [item.severity, item._count.id])),
        source: Object.fromEntries(sourceStats.map((item) => [item.source, item._count.id])),
      },
      overview: {
        activeSeverity: Object.fromEntries(activeSeverityStats.map((item) => [item.severity, item._count.id])),
        status: Object.fromEntries(overviewStatusStats.map((item) => [item.status, item._count.id])),
        severity: Object.fromEntries(overviewSeverityStats.map((item) => [item.severity, item._count.id])),
      },
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    console.error('[AlarmIncidents] GET error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const access = await authorizeApiRequest(request, 'alarms', 'write');
    if (!access.allowed) return access.response;
    const { auth } = access;

    const body = await request.json() as {
      ids?: string[];
      action?: IncidentAction;
      reason?: string;
      assigneeId?: string | null;
      bulk?: boolean;
      requestId?: string;
    };
    if (!Array.isArray(body.ids) || body.ids.some(id => typeof id !== 'string' || !id.trim())) {
      return NextResponse.json({ success: false, error: 'Geçerli incident kimlikleri gerekiyor.' }, { status: 400 });
    }
    const ids = [...new Set(body.ids)];
    if (ids.length > 100) return NextResponse.json({ success: false, error: 'Tek işlemde en fazla 100 incident seçebilirsiniz.' }, { status: 400 });
    const allowedActions: IncidentAction[] = [
      'ACKNOWLEDGE', 'UNACKNOWLEDGE', 'RESOLVE', 'CLOSE', 'ARCHIVE', 'RESTORE',
      'ASSIGN', 'ADD_NOTE', 'SET_LEGAL_HOLD', 'RELEASE_LEGAL_HOLD',
    ];
    if (ids.length === 0 || !body.action || !allowedActions.includes(body.action)) {
      return NextResponse.json({ success: false, error: 'Valid ids and action are required' }, { status: 400 });
    }

    const adminOnly: IncidentAction[] = ['ARCHIVE', 'RESTORE', 'SET_LEGAL_HOLD', 'RELEASE_LEGAL_HOLD'];
    if (['ASSIGN', 'ADD_NOTE', 'RESOLVE', 'CLOSE'].includes(body.action) && auth.role === 'VIEWER') {
      return NextResponse.json({ success: false, error: 'Bu işlem için yönetici veya editör yetkisi gerekiyor.' }, { status: 403 });
    }
    if (body.action === 'ADD_NOTE' && ids.length !== 1) {
      return NextResponse.json({ success: false, error: 'Not eklemek için tek bir incident seçin.' }, { status: 400 });
    }
    if (adminOnly.includes(body.action) && auth.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Admin role required' }, { status: 403 });
    }

    const action = body.action;
    if (body.requestId !== undefined && action !== 'ADD_NOTE') {
      return NextResponse.json({ success: false, error: 'İstek kimliği yalnız not eklerken kullanılabilir.' }, { status: 400 });
    }
    if ((body.bulk !== undefined && typeof body.bulk !== 'boolean') || (body.bulk && action !== 'RESOLVE' && action !== 'CLOSE')) {
      return NextResponse.json({ success: false, error: 'Geçersiz toplu durum işlemi.' }, { status: 400 });
    }
    const atomic = action === 'ASSIGN' || action === 'RESOLVE' || action === 'CLOSE';
    const lifecycleBatch = (action === 'RESOLVE' || action === 'CLOSE') && (body.bulk || ids.length > 1);
    const reason = lifecycleBatch ? incidentBulkLifecycleReason(body.reason) : body.reason;
    const apply = async (transaction?: Prisma.TransactionClient) => {
      const results = [];
      let eligibleIds: Set<string> | undefined;
      if (body.bulk && transaction && (action === 'RESOLVE' || action === 'CLOSE')) {
        // Lock before reading eligibility so counts and transitions share the same state.
        await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "alarm_incidents" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`);
        const rows = await transaction.alarmIncident.findMany({ where: { id: { in: ids } }, select: { id: true, status: true } });
        if (rows.length !== ids.length) throw new Error('Seçilen incident kaydı artık mevcut değil. Listeyi yenileyip tekrar deneyin.');
        eligibleIds = new Set(rows.filter(row => isIncidentBulkLifecycleEligible(row.status, action)).map(row => row.id));
      }
      // Consistent lock ordering also avoids reversed overlapping batches deadlocking.
      for (const incidentId of atomic ? [...ids].sort() : ids) {
        if (eligibleIds && !eligibleIds.has(incidentId)) continue;
        results.push(await transitionAlarmIncident({
          incidentId, action, actor: auth.actor, reason, assigneeId: body.assigneeId, requestId: body.requestId,
        }, transaction));
      }
      return results;
    };
    const results = atomic
      ? await prisma.$transaction(transaction => apply(transaction), { timeout: 15000 })
      : await apply();

    return NextResponse.json({ success: true, updated: results.length, ...(body.bulk ? { skipped: ids.length - results.length } : {}), data: results });
  } catch (error) {
    console.error('[AlarmIncidents] PATCH error:', error);
    const message = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025'
      ? 'Seçilen incident kaydı artık mevcut değil. Listeyi yenileyip tekrar deneyin.' : (error as Error).message;
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
