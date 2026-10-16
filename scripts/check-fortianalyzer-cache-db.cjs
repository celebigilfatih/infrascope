// Opt-in: real PostgreSQL cache provenance checks in a disposable local test DB.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
if (process.env.INFRASCOPE_FA_CACHE_DB_TEST !== '1' || url.protocol !== 'postgresql:'
  || url.hostname !== '127.0.0.1' || !/^\/[a-z0-9_]+_(cache|occurrence)_tests$/.test(url.pathname)) {
  throw new Error('Explicit opt-in and a local disposable *_cache_tests or *_occurrence_tests DB are required');
}
const { PrismaClient } = require('@prisma/client');
const { moduleLoader } = require('./check-alarm-occurrences.cjs');
const prisma = new PrismaClient({ datasources: { db: { url: url.href } } });
const quiet = new Proxy({}, { get: () => () => {} });
const load = moduleLoader({ '@/lib/prisma': { prisma }, '@/lib/logger': { createLogger: () => quiet },
  '@/lib/integrations/fortianalyzer': {} }, { AbortController, AbortSignal, console: quiet });
const { EventCacheService } = load('lib/alarms/event-cache.ts');
const { queryCache } = load('lib/alarms/queries/base.ts');
const { getAdminConfigChangeEvents } = load('lib/alarms/queries/config-change.ts');
const nonce = randomUUID(), revisionA = `fixture-a-${nonce}`, revisionB = `fixture-b-${nonce}`;
const a = new EventCacheService({}, { revision: revisionA }), b = new EventCacheService({}, { revision: revisionB });
const now = new Date();
const native = { logid: nonce, eventtime: (BigInt(now.getTime()) * 1_000_000n).toString(),
  itime_t: Math.floor(now.getTime() / 1000), devid: 'FIXTURE', subtype: 'system', action: 'Edit', user: 'fixture-reader', ui: 'GUI(fixture.invalid)', msg: 'A' };
const ctx = { alarmCode: 'FIXTURE', timeWindowMinutes: 5, eventCache: b, cacheIsFresh: true, faService: {} };
const window = { gte: new Date(now.getTime() - 60_000), lte: new Date(now.getTime() + 60_000) };
async function main() {
  await a.saveEvents('event', [native]); await b.saveEvents('event', [{ ...native, msg: 'B' }]);
  await a.saveEvents('event', [native]);
  assert.equal(await prisma.cachedEvent.count({ where: { logId: { contains: nonce } } }), 2);
  console.log('PASS PostgreSQL: identical native IDs retain separate revisions and idempotent upserts');
  await prisma.cachedEvent.create({ data: { logtype: 'event', logId: `legacy-${nonce}`, eventTime: now,
    subtype: 'system', action: 'Edit', user: 'fixture-reader', rawLog: { ...native, msg: 'legacy' } } });
  const rows = await b.queryCachedEvents({ logtype: 'event', startTime: window.gte, endTime: window.lte });
  assert.equal(rows.length, 1); assert.equal(rows[0].msg, 'B'); assert.ok(!('__infrascopeFaRevision' in rows[0]));
  const dedicated = await queryCache({ logtype: 'event', eventTime: window,
    AND: [{ rawLog: { path: ['user'], equals: 'fixture-reader' } }] }, 500, ctx);
  assert.equal(dedicated.length, 1); assert.equal(dedicated[0].msg, 'B');
  console.log('PASS PostgreSQL: generic and dedicated JSONB filters exclude old and unscoped rows');
  const admin = await getAdminConfigChangeEvents(ctx);
  assert.equal(admin.events.length, 1); assert.equal(admin.events[0].msg, 'B');
  assert.equal(admin.stats.source, 'cache'); assert.ok(!('__infrascopeFaRevision' in admin.events[0]));
  console.log('PASS PostgreSQL: specialized admin query preserves provenance and native payloads');
  a.stop(); await assert.rejects(a.saveEvents('event', [native]), error => error.code === 'SOURCE_CONFIG_CHANGED');
  console.log('PASS PostgreSQL: retired writers are fenced without deleting source history');
  console.log('FortiAnalyzer PostgreSQL cache regressions passed (4 scenarios; real Prisma uniqueness/JSONB queries).');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await prisma.cachedEvent.deleteMany({ where: { logId: { contains: nonce } } });
  await prisma.$disconnect();
});
