import { SourceQueryError } from '@/lib/integrations/source-query-error';

// Increment when persisted eventTime semantics change. Old cache rows must be recollected.
export const FA_EVENT_TIME_VERSION = 1;

function epoch(value: unknown): Date | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const n = BigInt(whole);
  // Infer contemporary Unix units by magnitude; truncate sub-millisecond precision.
  const ms = n >= 100_000_000_000_000_000n ? n / 1_000_000n
    : n >= 100_000_000_000_000n ? n / 1_000n
      : n >= 100_000_000_000n ? n : n * 1_000n + BigInt((fraction + '000').slice(0, 3));
  if (fraction && n >= 100_000_000_000n) return null;
  if (ms > 253402300799999n) return null;
  return new Date(Number(ms));
}

function calendar(value: unknown, tz: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:?\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute, second, fraction = '', inline] = match;
  const y = Number(year), m = Number(month), d = Number(day);
  const h = Number(hour), min = Number(minute), s = Number(second);
  if (y < 1970 || m < 1 || m > 12 || d < 1 || d > 31 || h > 23 || min > 59 || s > 59) return null;
  const utc = Date.UTC(y, m - 1, d, h, min, s, Number((fraction + '000').slice(0, 3)));
  const check = new Date(utc);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  // An inline offset wins; absent timezone means UTC, independently of host TZ.
  const offset = inline ?? (tz === undefined || tz === null || tz === '' ? 'Z' : String(tz).trim());
  if (offset === 'Z') return check;
  const zone = /^([+-])(\d{2}):?(\d{2})$/.exec(offset);
  if (!zone) return null;
  const hours = Number(zone[2]), minutes = Number(zone[3]);
  if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) return null;
  return new Date(utc - (zone[1] === '+' ? 1 : -1) * (hours * 60 + minutes) * 60_000);
}

/** Native occurrence epoch wins over receipt time; never apply tz to an epoch. */
export function parseFortiAnalyzerEventTime(log: Record<string, unknown>): Date | null {
  return epoch(log.eventtime) ?? epoch(log.itime_t) ?? epoch(log.itime)
    ?? calendar(log.itime, log.tz)
    ?? calendar(typeof log.date === 'string' && typeof log.time === 'string' ? `${log.date}T${log.time}` : null, log.tz);
}

export function requireFortiAnalyzerEventTime(log: Record<string, unknown>): Date {
  const time = parseFortiAnalyzerEventTime(log);
  if (!time) throw new SourceQueryError('SOURCE_EVENT_TIME_INVALID', 'FortiAnalyzer event has no valid source timestamp');
  return time;
}

/** Both bounds are inclusive. Invalid source times invalidate the query, never a clean empty result. */
export function filterFortiAnalyzerTimeWindow(logs: Array<Record<string, unknown>>, start: Date, end: Date) {
  return logs.filter(log => {
    const time = requireFortiAnalyzerEventTime(log);
    return time >= start && time <= end;
  });
}
