import { createHash } from 'node:crypto';

interface FortinetOccurrenceContext {
  source?: string | null;
  sourceScope?: string;
  deviceName?: string | null;
}

function text(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if ((typeof value === 'string' || typeof value === 'number') && String(value).trim()) {
      return String(value).trim();
    }
  }
  return undefined;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function digest(value: unknown): string {
  return createHash('sha256').update(stableSerialize(value)).digest('hex');
}

/** Fortinet logid identifies an event type, not an individual occurrence. */
export function buildFortinetOccurrenceIdentity(
  evidence: Record<string, unknown>,
  context: FortinetOccurrenceContext,
): { id: string; legacyEvidence?: string } | null {
  const source = (context.source || 'fortianalyzer').toLowerCase();
  if (source !== 'fortianalyzer' && !source.startsWith('fortigate')) return null;
  const raw = evidence.rawLog && typeof evidence.rawLog === 'object' && !Array.isArray(evidence.rawLog)
    ? evidence.rawLog as Record<string, unknown> : evidence;
  const logTypeId = text(raw, ['logid', 'logId']);
  if (!logTypeId) return null;

  const deviceId = text(raw, ['devid', 'serial', 'serialNumber'])?.toUpperCase();
  const device = deviceId || text(raw, ['devname', 'fortigate']) || context.deviceName || null;
  const vdom = (text(raw, ['vdom', 'vd']) || 'root').toLowerCase();
  const eventId = text(raw, ['eventId', 'event_id', 'uuid', 'id']);
  // Preserve source precision; converting nanoseconds to Date loses distinct events.
  const eventtime = text(raw, ['eventtime']);
  const itimeSeconds = text(raw, ['itime_t']);
  const itime = text(raw, ['itime']);
  const date = text(raw, ['date']);
  const time = text(raw, ['time']);
  const sourceTime = eventtime ? ['eventtime', eventtime]
    : date && time ? ['date-time', date, time, text(raw, ['tz']) || '']
      : itimeSeconds ? ['itime_t', itimeSeconds]
        : itime ? ['itime', itime] : null;
  const preciseTime = Boolean(eventtime && /^\d{16,}$/.test(eventtime));
  // Even a nanosecond-shaped timestamp can come from a coarse device clock.
  // Use source fields, not collector/display enrichment, to disambiguate it.
  const details = Object.fromEntries(
    ['user', 'action', 'msg', 'logdesc', 'subtype', 'level', 'cfgpath', 'cfgobj', 'cfgattr', 'interface', 'policyid', 'srcip', 'dstip', 'srcport', 'dstport', 'sessionid', 'ui', 'status']
      .filter(key => raw[key] !== undefined)
      .map(key => [key, raw[key]]),
  );
  const occurrence = {
    source, device, vdom, logType: text(raw, ['logtype', 'type']) || 'event', logTypeId,
    eventId, sourceTime,
    // Missing time must not fall back to ingestion time, a random ID or the batch.
    evidence: !sourceTime && !eventId ? raw : !eventId ? details : undefined,
  };
  return {
    id: `fortinet:v2:${digest({ ...occurrence, sourceScope: context.sourceScope || null })}`,
    // A legacy type-only key is insufficient. Require physical device identity
    // and precise source evidence before suppressing a pre-upgrade replay.
    legacyEvidence: deviceId && (preciseTime || eventId) ? digest(occurrence) : undefined,
  };
}
