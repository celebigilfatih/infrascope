import type { Prisma } from '@prisma/client';

export interface AuditQuery {
  userId?: string; user?: string; action?: string; resource?: string;
  startDate?: string; endDate?: string; page?: number; pageSize?: number;
}
export class AuditQueryError extends Error {}

function istanbulMidnight(calendarDay: number) {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  let instant = calendarDay - 3 * 3600000;
  for (let step = 0; step < 3; step += 1) {
    const parts = formatter.formatToParts(new Date(instant));
    const part = (name: string) => parts.find(value => value.type === name)!.value;
    const year = Number(part('year')) > 9999 ? `+${part('year').padStart(6, '0')}` : part('year').padStart(4, '0');
    const observed = Date.parse(`${year}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}Z`);
    const correction = calendarDay - observed;
    if (!correction) break;
    instant += correction;
  }
  return new Date(instant);
}

function dateBoundary(value: string, end: boolean): { date: Date; exclusive: boolean } {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const day = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(day.getTime()) || day.getUTCFullYear() < 1 || day.toISOString().slice(0, 10) !== value) throw new AuditQueryError('Geçerli bir tarih seçin.');
    // Date inputs describe full Turkish calendar days, including the end day.
    return { date: istanbulMidnight(day.getTime() + (end ? 86400000 : 0)), exclusive: end };
  }
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value) || !Number.isFinite(Date.parse(value))) throw new AuditQueryError('Tarih biçimi geçersiz.');
  const calendarDay = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (calendarDay.getUTCFullYear() < 1 || calendarDay.toISOString().slice(0, 10) !== value.slice(0, 10)) throw new AuditQueryError('Geçerli bir tarih seçin.');
  return { date: new Date(value), exclusive: false };
}
export function auditDateRange(start?: string, end?: string): Prisma.DateTimeFilter {
  const from = start ? dateBoundary(start, false) : null;
  const to = end ? dateBoundary(end, true) : null;
  if (from && to && (to.exclusive ? from.date >= to.date : from.date > to.date)) throw new AuditQueryError('Bitiş tarihi başlangıç tarihinden önce olamaz.');
  return { ...(from ? { gte: from.date } : {}), ...(to ? to.exclusive ? { lt: to.date } : { lte: to.date } : {}) };
}
export function auditWhere(params: AuditQuery): Prisma.AuditLogWhereInput {
  const range = auditDateRange(params.startDate, params.endDate);
  return {
    ...(params.userId ? { userId: params.userId } : {}),
    ...(params.user ? { OR: [
      { user: { name: { contains: params.user, mode: 'insensitive' } } },
      { user: { email: { contains: params.user, mode: 'insensitive' } } },
      { userId: { contains: params.user, mode: 'insensitive' } },
    ] } : {}),
    ...(params.action ? { action: { contains: params.action, mode: 'insensitive' } } : {}),
    ...(params.resource ? { resource: params.resource } : {}),
    ...(params.startDate || params.endDate ? { timestamp: range } : {}),
  };
}
export function parseAuditQuery(search: URLSearchParams): AuditQuery {
  const page = Number(search.get('page') || 1), pageSize = Number(search.get('pageSize') || 50);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new AuditQueryError('Sayfalama değerleri geçersiz.');
  const params: AuditQuery = { page, pageSize };
  for (const key of ['userId', 'user', 'action', 'resource', 'startDate', 'endDate'] as const) {
    const value = search.get(key)?.trim();
    if (value && value.length > 200) throw new AuditQueryError('Filtre metni en fazla 200 karakter olabilir.');
    if (value) params[key] = value;
  }
  auditDateRange(params.startDate, params.endDate);
  return params;
}
