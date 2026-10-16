// Real Prisma/PostgreSQL UTC persistence and range tests; no external source or notification I/O.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
if (process.env.INFRASCOPE_FA_TIME_DB_TEST !== '1' || url.protocol !== 'postgresql:'
  || url.hostname !== '127.0.0.1' || !/^\/[a-z0-9_]+_occurrence_tests$/.test(url.pathname)) {
  throw new Error('Explicit opt-in and a local disposable *_occurrence_tests DB are required');
}
const { PrismaClient } = require('@prisma/client');
const { moduleLoader } = require('./check-alarm-occurrences.cjs');
const prisma = new PrismaClient({ datasources: { db: { url: url.href } } });
const quiet = new Proxy({}, { get: () => () => {} });
const now = Date.parse('2026-10-15T09:00:00Z');
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
const nonce = randomUUID(), revision = `fixture-time-${nonce}`;
let logs = [];
const load = moduleLoader({ '@/lib/prisma': { prisma }, '@/lib/logger': { createLogger: () => quiet },
  '@/lib/integrations/fortianalyzer': {}, '@/lib/alarms/queries/fortianalyzer-search': {
    startFortiAnalyzerSearch: async () => 1, waitForFortiAnalyzerResults: async () => logs,
  } }, { Date: FixedDate, AbortController, AbortSignal, console: quiet });
const cache = new (load('lib/alarms/event-cache.ts').EventCacheService)({}, { revision });
const { queryCache, queryFortiAnalyzerDirect, timeWindow } = load('lib/alarms/queries/base.ts');
const ctx = { alarmCode: 'FIXTURE', timeWindowMinutes: 5, eventCache: cache, cacheIsFresh: true, faService: {} };
const scoped = { logId: { contains: nonce } };
let passed = 0;
function pass(name) { passed++; console.log(`PASS PostgreSQL: ${name}`); }
async function main() {
  const raw = { logid: `${nonce}-local`, itime: '2026-10-15 12:00:00', tz: '+0300',
    subtype: 'system', user: 'fixture-reader', action: 'Edit', ui: 'GUI(fixture.invalid)' };
  await cache.saveEvents('event', [raw]);
  const first = await prisma.cachedEvent.findFirstOrThrow({ where: scoped });
  assert.equal(first.eventTime.toISOString(), '2026-10-15T09:00:00.000Z'); pass('local +0300 source persists as 09:00Z');
  logs = [raw];
  const cached = await queryCache({ logtype: 'event', eventTime: timeWindow(5) }, 500, ctx);
  const live = await queryFortiAnalyzerDirect({}, 'event', '', 5);
  assert.deepEqual(JSON.parse(JSON.stringify(cached)), JSON.parse(JSON.stringify(live))); pass('cache and live return identical native evidence');
  assert.ok(!('__infrascopeFaTimeVersion' in cached[0])); pass('internal timestamp version is not exposed');
  const admin = await load('lib/alarms/queries/config-change.ts').getAdminConfigChangeEvents(ctx);
  assert.equal(admin.events.length, 1); assert.equal(admin.stats.source, 'cache'); pass('specialized admin query uses UTC persistence');
  const entry = (id, ms) => ({ logid: `${nonce}-${id}`, eventtime: (BigInt(ms) * 1000000n).toString(), itime_t: (now + 3600000) / 1000 });
  const bounds = [entry('lower', now - 300000), entry('outside', now - 300001), entry('future', now + 1)];
  await cache.saveEvents('event', bounds);
  logs = [raw, ...bounds];
  const selected = await queryCache({ logtype: 'event', eventTime: timeWindow(5) }, 500, ctx);
  const direct = await queryFortiAnalyzerDirect({}, 'event', '', 5);
  assert.deepEqual(Array.from(selected, r => r.logid).sort(), Array.from(direct, r => r.logid).sort());
  assert.equal(selected.length, 2); pass('inclusive UTC bounds exclude older and future events to the millisecond');
  assert.equal(selected[0].logid, raw.logid); pass('real database ordering uses normalized occurrence time instead of receipt time');
  const old = { ...raw, logid: `${nonce}-legacy` };
  const legacyId = `${revision}:${old.logid}-${JSON.stringify([old.itime, old.date, old.time, old.tz])}`;
  await prisma.cachedEvent.create({ data: { logtype: 'event', logId: legacyId, eventTime: new Date(now),
    rawLog: { ...old, __infrascopeFaRevision: revision } } });
  assert.equal((await queryCache({ logtype: 'event', eventTime: timeWindow(5) }, 500, ctx)).length, 2);
  const generic = await cache.queryCachedEvents({ logtype: 'event', startTime: new FixedDate(now - 300000), endTime: new FixedDate(now) });
  assert.equal(generic.length, 2); pass('legacy same-revision rows cannot satisfy dedicated or generic cache reads');
  await cache.saveEvents('event', [old]);
  assert.equal((await queryCache({ logtype: 'event', eventTime: timeWindow(5) }, 500, ctx)).length, 3);
  assert.equal(await prisma.cachedEvent.count({ where: { logId: legacyId } }), 1); pass('recollection upgrades derived row metadata without a duplicate');
  await cache.saveEvents('event', [{ ...raw, itime: '2026-10-15 11:59:00' }]);
  assert.equal(await prisma.cachedEvent.count({ where: { logId: { startsWith: `${revision}:${raw.logid}-` } } }), 2);
  pass('text-only native times retain separate persisted events');
  const before = await prisma.cachedEvent.count({ where: scoped });
  await assert.rejects(cache.saveEvents('event', [entry('valid-in-invalid-batch', now), { logid: `${nonce}-bad`, itime: 'bad' }]),
    e => e.code === 'SOURCE_EVENT_TIME_INVALID');
  assert.equal(await prisma.cachedEvent.count({ where: scoped }), before); pass('malformed batch does not partially insert or fabricate arrival time');
  await cache.saveEvents('event', [entry('expired', now - 86400001), entry('retained', now - 86400000)]);
  const deleted = await prisma.cachedEvent.deleteMany({ where: { AND: [scoped, { eventTime: { lt: new FixedDate(now - 86400000) } }] } });
  assert.equal(deleted.count, 1); pass('retention compares normalized UTC with the exact 24-hour boundary');
  console.log(`FortiAnalyzer UTC PostgreSQL regressions passed (${passed} scenarios).`);
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  await prisma.cachedEvent.deleteMany({ where: scoped }); await prisma.$disconnect();
});
