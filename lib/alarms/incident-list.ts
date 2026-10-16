import { AlarmArchiveState, AlarmIncidentStatus, AlarmSeverity2, Prisma } from '@prisma/client';

export function incidentAssigneeFilter(params: URLSearchParams, currentUserId?: string): Prisma.AlarmIncidentWhereInput {
  const assignee = params.get('assignee');
  if (!assignee || assignee === 'all') return {};
  if (assignee === 'unassigned') return { assignedToId: null };
  if (assignee === 'me') {
    if (!currentUserId) throw new Error('Bana atananlar için oturum açmanız gerekiyor.');
    return { assignedToId: currentUserId };
  }
  if (!assignee.trim() || assignee.length > 200) throw new Error('Geçersiz sorumlu filtresi.');
  return { assignedToId: assignee.trim() };
}

export function incidentListFilters(params: URLSearchParams, currentUserId?: string): Prisma.AlarmIncidentWhereInput {
  const where: Prisma.AlarmIncidentWhereInput = incidentAssigneeFilter(params, currentUserId);
  const archive = params.get('archiveState') || 'HOT';
  if (Object.values(AlarmArchiveState).includes(archive as AlarmArchiveState)) where.archiveState = archive as AlarmArchiveState;
  const statuses = (params.get('status') || '').split(',').filter((value): value is AlarmIncidentStatus => Object.values(AlarmIncidentStatus).includes(value as AlarmIncidentStatus));
  if (statuses.length) where.status = { in: statuses };
  const severity = params.get('severity');
  if (severity && Object.values(AlarmSeverity2).includes(severity as AlarmSeverity2)) where.severity = severity as AlarmSeverity2;
  const source = params.get('source');
  if (source && source !== 'all') where.source = source === 'firewall' ? { in: ['fortianalyzer', 'fortigate-sslvpn'] } : source === 'switch' ? 'nms' : source;
  const search = params.get('search')?.trim();
  if (search) where.OR = [
    { title: { contains: search, mode: 'insensitive' } }, { message: { contains: search, mode: 'insensitive' } },
    { entityId: { contains: search, mode: 'insensitive' } }, { alarm: { code: { contains: search, mode: 'insensitive' } } },
    { occurrences: { some: { deviceName: { contains: search, mode: 'insensitive' } } } },
  ];
  const from = params.get('from'), to = params.get('to');
  if (from || to) {
    if ((from && Number.isNaN(Date.parse(from))) || (to && Number.isNaN(Date.parse(to)))) throw new Error('Geçersiz tarih filtresi.');
    where.lastSeenAt = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) };
  }
  return where;
}

export function incidentListOrdering(params: URLSearchParams) {
  const sort = params.get('sort') === 'severity' ? 'severity' : 'lastSeenAt';
  const direction = params.get('direction') === 'asc' ? 'asc' : 'desc';
  const orderBy: Prisma.AlarmIncidentOrderByWithRelationInput[] = sort === 'severity'
    ? [{ severity: direction }, { lastSeenAt: 'desc' }, { id: 'desc' }]
    : [{ lastSeenAt: direction }, { id: 'desc' }];
  return { sort, direction, orderBy } as const;
}

type Ordering = ReturnType<typeof incidentListOrdering>;
type CursorRow = { id: string; severity: AlarmSeverity2; lastSeenAt: Date };
export function encodeIncidentCursor(row: CursorRow, ordering: Ordering): string {
  return Buffer.from(JSON.stringify({ id: row.id, severity: row.severity, lastSeenAt: row.lastSeenAt.toISOString(), sort: ordering.sort, direction: ordering.direction })).toString('base64url');
}

export function incidentCursorFilter(value: string | null, ordering: Ordering): Prisma.AlarmIncidentWhereInput | null {
  if (!value) return null;
  try {
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    const lastSeenAt = new Date(cursor.lastSeenAt);
    if (typeof cursor.id !== 'string' || !cursor.id || Number.isNaN(lastSeenAt.getTime())) throw new Error();
    // Accept old timestamp-only cursors for the original descending order.
    if ((cursor.sort || 'lastSeenAt') !== ordering.sort || (cursor.direction || 'desc') !== ordering.direction) throw new Error();
    const timestampFilter: Prisma.AlarmIncidentWhereInput = { OR: [
      { lastSeenAt: { [ordering.sort === 'severity' || ordering.direction === 'desc' ? 'lt' : 'gt']: lastSeenAt } },
      { lastSeenAt, id: { lt: cursor.id } },
    ] };
    if (ordering.sort === 'lastSeenAt') return timestampFilter;
    if (!Object.values(AlarmSeverity2).includes(cursor.severity)) throw new Error();
    return { OR: [
      { severity: { [ordering.direction === 'asc' ? 'gt' : 'lt']: cursor.severity } },
      { severity: cursor.severity, AND: [timestampFilter] },
    ] };
  } catch {
    throw new Error('Sayfa bilgisi geçersiz. Listeyi ilk sayfadan açın.');
  }
}
