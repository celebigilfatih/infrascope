// Actual parser/cache/query/engine code with synthetic source, DB and mail I/O.
const assert = require('node:assert/strict');
const { moduleLoader } = require('./check-alarm-occurrences.cjs');
const quiet = new Proxy({}, { get: () => () => {} });
const now = Date.parse('2026-10-15T09:00:00Z');
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
function fixture() {
  const state = { logs: [], rows: [], writes: 0, occurrences: [] };
  function matches(row, where = {}) {
    if (where.AND && !where.AND.every(w => matches(row, w))) return false;
    for (const [key, value] of Object.entries(where)) {
      if (key === 'AND') continue;
      if (key === 'rawLog') { if (row.rawLog[value.path[0]] !== value.equals) return false; }
      else if (key === 'eventTime') { if (row.eventTime < value.gte || row.eventTime > value.lte) return false; }
      else if (row[key] !== value) return false;
    }
    return true;
  }
  const prisma = { alarmWhitelist: { findMany: async () => [] }, alarmEvent: { findFirst: async () => null }, cachedEvent: {
    upsert: async ({ where, create }) => {
      state.writes++;
      const index = state.rows.findIndex(r => r.logId === where.logtype_logId.logId && r.logtype === create.logtype);
      if (index < 0) state.rows.push(create); else state.rows[index] = create;
      return create;
    },
    findMany: async ({ where, take }) => state.rows.filter(row => matches(row, where))
      .sort((a, b) => b.eventTime - a.eventTime).slice(0, take),
    deleteMany: async () => ({ count: 0 }),
  } };
  const load = moduleLoader({
    '@/lib/prisma': { prisma }, '@/lib/logger': { createLogger: () => quiet },
    '@/lib/integrations/fortianalyzer': {}, '@/lib/integrations/vmware': {}, '@/lib/integrations/fortigate': {},
    '@/lib/firewall/connector-factory': {},
    '@/lib/alarms/queries/fortianalyzer-search': {
      startFortiAnalyzerSearch: async () => 1,
      waitForFortiAnalyzerResults: async () => state.logs,
    },
    '@/lib/alarms/queries': { ALARM_QUERY_REGISTRY: new Map(), BYPASS_CACHE_ALARMS: new Set() },
    '@/lib/alarms/suppression-engine': { createDefaultSuppressionEngine: () => ({}) },
    '@/lib/alarms/incident-service': { recordAlarmOccurrence: async input => {
      state.occurrences.push(input); return { created: false, event: { id: 'fixture' } };
    } },
    '@/lib/notifications/email': { sendAlarmEmail: async () => { throw new Error('Unexpected email'); }, getEmailStats: () => ({}) },
  }, { Date: FixedDate, AbortController, AbortSignal,
    setTimeout: (fn, ms) => { const timer = setTimeout(fn, ms); timer.unref(); return timer; }, clearTimeout, console: quiet });
  const time = load('lib/alarms/fortianalyzer-event-time.ts');
  const cache = new (load('lib/alarms/event-cache.ts').EventCacheService)({ login: async () => true }, { revision: 'fixture-time' });
  let engine;
  return { state, load, cache, time, query: load('lib/alarms/queries/base.ts'),
    get engine() { return engine ??= new (load('lib/alarms/detection-engine.ts').AlarmDetectionEngine)({}); } };
}
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const expected = '2026-10-15T09:00:00.000Z';
for (const [name, raw] of [
  ['separate positive offset', { itime: '2026-10-15 12:00:00', tz: '+0300' }],
  ['colon offset', { itime: '2026-10-15 12:00:00', tz: '+03:00' }],
  ['negative fractional offset', { itime: '2026-10-15 03:30:00', tz: '-0530' }],
  ['positive fractional offset', { itime: '2026-10-15 14:45:00', tz: '+0545' }],
  ['inline offset wins over tz', { itime: '2026-10-15T12:00:00+03:00', tz: '-0500' }],
  ['inline compact offset', { itime: '2026-10-15T12:00:00+0300' }],
  ['inline UTC is not shifted', { itime: expected, tz: '+0300' }],
  ['offsetless text means UTC', { itime: '2026-10-15 09:00:00' }],
  ['date and time fields', { date: '2026-10-15', time: '12:00:00', tz: '+0300' }],
  ['UTC day rollover', { itime: '2026-10-15 23:00:00', tz: '+1400' }],
  ['negative offset day rollover', { itime: '2026-10-14 23:00:00', tz: '-1000' }],
  ['invalid preferred field falls back', { eventtime: 'bad', itime_t: now / 1000 }],
  ['native occurrence wins over receipt', { eventtime: String(BigInt(now) * 1000000n), itime_t: now / 1000 + 3600 }],
]) test(name, f => assert.equal(f.time.parseFortiAnalyzerEventTime(raw).toISOString(), expected));

for (const [unit, factor] of [['seconds', 1n], ['milliseconds', 1000n], ['microseconds', 1000000n], ['nanoseconds', 1000000000n]]) {
  for (const field of ['eventtime', 'itime_t', 'itime']) for (const representation of ['string', 'number']) {
    test(`${field} ${unit} ${representation} ignores separate timezone`, f => {
      const value = BigInt(now / 1000) * factor;
      const raw = { [field]: representation === 'string' ? value.toString() : Number(value), tz: '+0300' };
      assert.equal(f.time.parseFortiAnalyzerEventTime(raw).toISOString(), expected);
    });
  }
}
for (const [name, raw] of [
  ['missing', {}], ['invalid text', { itime: 'bad' }], ['nonfinite', { eventtime: Infinity }],
  ['out of range', { eventtime: '9999999999999999999999999' }], ['impossible date', { itime: '2026-02-30 12:00:00' }],
  ['non-leap day', { itime: '2025-02-29 12:00:00' }], ['impossible month', { itime: '2026-13-15 12:00:00' }],
  ['hour overflow', { itime: '2026-10-15 24:00:00' }], ['second overflow', { itime: '2026-10-15 12:00:60' }],
  ['invalid timezone', { itime: '2026-10-15 12:00:00', tz: 'Turkey' }],
  ['offset overflow', { itime: '2026-10-15 12:00:00', tz: '+1460' }],
  ['maximum offset overflow', { itime: '2026-10-15 12:00:00', tz: '+1401' }],
  ['malformed numeric text', { itime_t: '1792054800junk' }],
]) test(`reject ${name} without arrival-time fallback`, async f => {
  assert.equal(f.time.parseFortiAnalyzerEventTime(raw), null);
  await assert.rejects(f.cache.saveEvents('event', [{ logid: 'fixture', ...raw }]), e => e.code === 'SOURCE_EVENT_TIME_INVALID');
  assert.equal(f.state.writes, 0);
});
test('sub-millisecond precision is truncated but raw occurrence identity is preserved', async f => {
  const raw = { logid: 'fixture', devid: 'FIXTURE', eventtime: (BigInt(now) * 1000000n + 999999n).toString() };
  assert.equal(f.time.parseFortiAnalyzerEventTime(raw).getTime(), now);
  await f.cache.saveEvents('event', [raw]);
  const [saved] = await f.query.queryCache({ eventTime: { gte: new FixedDate(now), lte: new FixedDate(now) } }, 500, { eventCache: f.cache });
  assert.deepEqual(JSON.parse(JSON.stringify(saved)), raw);
  const identity = f.load('lib/alarms/fortinet-occurrence-identity.ts').buildFortinetOccurrenceIdentity;
  assert.equal(identity(saved, { source: 'fortianalyzer' }).id, identity(raw, { source: 'fortianalyzer' }).id);
});
test('leap date and fractional seconds are validated in UTC', f => {
  assert.equal(f.time.parseFortiAnalyzerEventTime({ itime: '2024-02-29 12:00:00.123456789', tz: '+0300' }).toISOString(), '2024-02-29T09:00:00.123Z');
  assert.equal(f.time.parseFortiAnalyzerEventTime({ eventtime: `${now / 1000}.123456` }).getTime(), now + 123);
});
test('cache collection, live query and engine share UTC and inclusive bounds', async f => {
  const raw = (id, itime) => ({ logid: id, itime, tz: '+0300', subtype: 'system' });
  f.state.logs = [raw('lower', '2026-10-15 11:55:00'), raw('upper', '2026-10-15 12:00:00'),
    raw('old', '2026-10-15 11:54:59.999'), raw('future', '2026-10-15 12:00:00.001')];
  await f.cache.syncLogType('event', new FixedDate(now - 300000), new FixedDate(now));
  const ctx = { eventCache: f.cache };
  const cached = await f.query.queryCache({ logtype: 'event', eventTime: f.query.timeWindow(5) }, 500, ctx);
  const live = await f.query.queryFortiAnalyzerDirect({}, 'event', '', 5);
  assert.deepEqual(Array.from(cached, x => x.logid).sort(), Array.from(live, x => x.logid).sort());
  assert.equal(live.length, 2);
  for (const entry of live) assert.equal(f.engine.parseLogTime(entry).getTime(), f.time.parseFortiAnalyzerEventTime(entry).getTime());
  assert.equal(f.engine.parseLogTime({ eventTime: expected }).toISOString(), expected);
});
test('targeted collection uses the same UTC window', async f => {
  f.state.logs = [{ logid: 'fixture', itime: '2026-10-15 12:00:00', tz: '+0300', msg: 'failed' }];
  await f.cache.syncLogTypeWithFilter('event', 'action == login', new FixedDate(now - 1), new FixedDate(now));
  assert.equal(f.state.rows.length, 1); assert.equal(f.state.rows[0].eventTime.getTime(), now);
});
test('invalid source data rejects live, generic and targeted collection', async f => {
  f.state.logs = [{ logid: 'fixture', itime: 'invalid' }];
  const invalid = e => e.code === 'SOURCE_EVENT_TIME_INVALID';
  await assert.rejects(f.query.queryFortiAnalyzerDirect({}, 'event', '', 5), invalid);
  await assert.rejects(f.cache.syncLogType('event', new FixedDate(now - 1), new FixedDate(now)), invalid);
  await assert.rejects(f.cache.syncLogTypeWithFilter('event', '', new FixedDate(now - 1), new FixedDate(now)), invalid);
  assert.equal(f.state.writes, 0);
});
test('a malformed batch is validated before the first database write', async f => {
  await assert.rejects(f.cache.saveEvents('event', [{ logid: 'good', itime_t: now / 1000 }, { logid: 'bad' }]), e => e.code === 'SOURCE_EVENT_TIME_INVALID');
  assert.equal(f.state.writes, 0);
});
test('invalid timestamp refresh removes freshness and successful recollection restores it', async f => {
  f.state.logs = [{ logid: 'fixture', itime: '2026-10-15 12:00:00', tz: '+0300' }];
  await f.cache.syncAllEventTypes();
  assert.equal(f.cache.getCacheStatus('event').isFresh, true);
  f.state.logs = [{ logid: 'fixture', itime: 'invalid' }];
  await f.cache.syncAllEventTypes();
  assert.equal(f.cache.getCacheStatus('event').isFresh, false);
  assert.ok(f.cache.getCacheStatus().failedLogtypes.includes('event'));
  f.state.logs = [];
  await f.cache.syncAllEventTypes();
  assert.equal(f.cache.getCacheStatus('event').isFresh, true);
});
test('same-revision old cache timestamps are excluded until recollection', async f => {
  const raw = { logid: 'fixture', itime_t: now / 1000 };
  f.state.rows.push({ logtype: 'event', logId: 'fixture-time:fixture-' + raw.itime_t, eventTime: new FixedDate(now),
    rawLog: { ...raw, __infrascopeFaRevision: 'fixture-time' } });
  assert.equal((await f.query.queryCache({}, 500, { eventCache: f.cache })).length, 0);
  assert.equal((await f.query.queryCache({})).length, 0);
  await f.cache.saveEvents('event', [raw]);
  assert.equal((await f.query.queryCache({}, 500, { eventCache: f.cache })).length, 1);
});
test('a timestamp-policy change rotates collector revision without changing configuration identity', f => {
  const record = { id: 'fixture-config', enabled: true, updatedAt: new FixedDate(), config: { host: 'fixture.invalid' } };
  const previousPolicy = moduleLoader({ '@/lib/alarms/fortianalyzer-event-time': { FA_EVENT_TIME_VERSION: 0 } })
    ('lib/integrations/fortianalyzer-revision.ts');
  const currentPolicy = f.load('lib/integrations/fortianalyzer-revision.ts');
  assert.notEqual(previousPolicy.fortiAnalyzerRevision(record), currentPolicy.fortiAnalyzerRevision(record));
  assert.equal(record.id, 'fixture-config');
});
test('text-only event instants do not overwrite each other', async f => {
  await f.cache.saveEvents('event', [
    { logid: 'same-type', itime: '2026-10-15 11:59:00', tz: '+0300' },
    { logid: 'same-type', itime: '2026-10-15 12:00:00', tz: '+0300' },
  ]);
  assert.equal(f.state.rows.length, 2);
});
test('batch collection covers the widest rule before individual window filtering', async f => {
  f.state.logs = [{ logid: 'fixture', itime: '2026-10-15 11:00:00', tz: '+0300' }];
  const rule = minutes => ({ id: `fixture-${minutes}`, code: `FIXTURE_${minutes}`, name: 'Fixture',
    source: 'fortianalyzer', cooldownMinutes: 0, detectionLogic: { logtype: 'event', threshold: 1, timeWindowMinutes: minutes } });
  const fired = [];
  f.engine.fireAlarm = async alarm => fired.push(alarm.code);
  const result = await f.engine.evaluateLogTypeGroupOptimized('event', [rule(5), rule(120)]);
  assert.equal(result.find(r => r.alarmCode === 'FIXTURE_5').matchCount, 0);
  assert.equal(result.find(r => r.alarmCode === 'FIXTURE_120').matchCount, 1);
  assert.deepEqual(fired, ['FIXTURE_120']);
});
test('recording receives normalized sourceOccurredAt without changing raw evidence', async f => {
  const raw = { logid: 'fixture', itime: '2026-10-15 12:00:00', tz: '+0300' };
  await f.engine.fireAlarm({ id: 'fixture', code: 'FIXTURE', name: 'Fixture', source: 'fortianalyzer',
    detectionLogic: { logtype: 'event' } }, [raw]);
  assert.equal(f.state.occurrences[0].sourceOccurredAt.toISOString(), expected);
  assert.deepEqual(f.state.occurrences[0].rawData[0], raw);
});
async function main() {
  for (const [name, run] of tests) { await run(fixture()); console.log(`PASS ${name}`); }
  console.log(`FortiAnalyzer UTC regressions passed (${tests.length} scenarios; TZ=${process.env.TZ || 'default'}; isolated I/O).`);
}
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
module.exports = { fixture, now };
