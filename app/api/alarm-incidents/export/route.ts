import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestActor } from '@/lib/auth/request-actor';
import { incidentListFilters, incidentListOrdering } from '@/lib/alarms/incident-list';

export const dynamic = 'force-dynamic';

function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getRequestActor(request);
    if (!auth) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });

    const params = request.nextUrl.searchParams;
    let where;
    try { where = incidentListFilters(params, auth.actor.id); }
    catch (error) { return NextResponse.json({ success: false, error: (error as Error).message }, { status: 400 }); }
    const rows = await prisma.alarmIncident.findMany({
      where,
      include: { alarm: { select: { code: true } } },
      orderBy: incidentListOrdering(params).orderBy,
      take: 10_000,
    });

    const headers = [
      'incidentId', 'alarmCode', 'status', 'archiveState', 'severity', 'category', 'source',
      'title', 'entityType', 'entityId', 'firstSeenAt', 'lastSeenAt', 'occurrenceCount',
      'acknowledgedBy', 'resolvedBy', 'closedBy', 'assignedTo', 'legalHold',
    ];
    const lines = [headers.map(csvCell).join(',')];
    for (const row of rows) {
      lines.push([
        row.id, row.alarm.code, row.status, row.archiveState, row.severity, row.category,
        row.source, row.title, row.entityType, row.entityId, row.firstSeenAt.toISOString(),
        row.lastSeenAt.toISOString(), row.occurrenceCount, row.acknowledgedBy, row.resolvedBy,
        row.closedBy, row.assignedTo, row.legalHold,
      ].map(csvCell).join(','));
    }

    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(`\uFEFF${lines.join('\n')}`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="infrascope-alarm-incidents-${date}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
