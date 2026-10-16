// Real cache/coordinator/engine/route code; no application environment or live I/O.
const assert = require('node:assert/strict');
const { NextRequest, NextResponse } = require('next/server');
const { moduleLoader } = require('./check-alarm-occurrences.cjs');
const quiet = new Proxy({}, { get: () => () => {} });
function clock() {
  let now = Date.parse('2026-10-15T12:00:00Z'), sequence = 0;
  const timers = new Map();
  const flush = async () => { for (let i = 0; i < 500; i++) await Promise.resolve(); };
  return {
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } },
    setTimeout(fn, ms) { const id = ++sequence; timers.set(id, { fn, due: now + ms }); return id; },
    clearTimeout(id) { timers.delete(id); }, flush,
    async advance(ms) {
      const end = now + ms;
      for (let i = 0; i < 200; i++) {
        await flush(); const next = [...timers.entries()].sort((a, b) => a[1].due - b[1].due)[0];
        if (!next || next[1].due > end) break;
        timers.delete(next[0]); now = next[1].due; next[1].fn();
      }
      now = end; await flush();
    },
    async settle(promise) {
      let done = false, result, failure;
      promise.then(value => { done = true; result = value; }, error => { done = true; failure = error; });
      for (let step = 0; !done && step < 300; step++) {
        await flush(); if (done) break;
        const next = [...timers.entries()].sort((a, b) => a[1].due - b[1].due)[0];
        assert.ok(next, 'A waiting cache operation must own a timer');
        timers.delete(next[0]); now = next[1].due; next[1].fn();
      }
      assert.ok(done, 'Cache operation must settle'); if (failure) throw failure; return result;
    },
    timers: () => [...timers.values()],
  };
}
function matches(row, where = {}) {
  if (where.AND && !(Array.isArray(where.AND) ? where.AND : [where.AND]).every(w => matches(row, w))) return false;
  if (where.OR && !where.OR.some(w => matches(row, w))) return false;
  if (where.NOT && (Array.isArray(where.NOT) ? where.NOT : [where.NOT]).some(w => matches(row, w))) return false;
  for (const [field, expected] of Object.entries(where)) {
    if (['AND', 'OR', 'NOT'].includes(field)) continue;
    if (field === 'rawLog') {
      let value = row.rawLog; for (const key of expected.path) value = value?.[key];
      if ('equals' in expected && value !== expected.equals) return false;
      continue;
    }
    const value = row[field];
    if (expected && typeof expected === 'object') {
      if ('in' in expected && !expected.in.includes(value)) return false;
      if ('notIn' in expected && expected.notIn.includes(value)) return false;
      if ('gte' in expected && value < expected.gte || 'lte' in expected && value > expected.lte || 'lt' in expected && value >= expected.lt) return false;
    } else if (value !== expected) return false;
  }
  return true;
}
function fixture() {
  const timer = clock(), shared = {}, clients = new Map();
  const state = { calls: [], rows: [], writes: [], configReads: 0, role: 'ADMIN', version: 1,
    fixedSourceTime: Math.floor(timer.Date.now() / 1000) - 5 };
  const makeRecord = (host = 'a.fixture.invalid', password = 'fixture-a') => ({ id: 'fixture-config', type: 'FORTIANALYZER', enabled: true,
    name: 'FortiAnalyzer', updatedAt: new timer.Date(timer.Date.now() + state.version++), config: { host, username: 'reader', password } });
  state.record = makeRecord();
  class FA {
    constructor(config) { this.config = { ...config }; this.tasks = new Map(); }
    async login() { state.calls.push({ host: this.config.host, password: this.config.password, op: 'login' }); return state.failedHost !== this.config.host; }
    async startLogSearch(logtype, _limit, _filter, options = {}) {
      state.calls.push({ host: this.config.host, op: 'search', logtype, signal: options.signal });
      const tid = this.tasks.size + 1; this.tasks.set(tid, logtype); return tid;
    }
    async fetchLogResults(tid, _offset, _limit, options = {}) {
      state.calls.push({ host: this.config.host, op: 'results', signal: options.signal });
      if (state.holdResults) return state.holdResults(this, options.signal);
      if (state.emptyHost === this.config.host) return [];
      return [{ logid: 'fixture-type', itime_t: Math.floor(timer.Date.now() / 1000), devid: 'FIXTURE-DEVICE',
        devname: 'Fixture', subtype: 'system', user: 'reader', action: 'Edit', ui: 'GUI(fixture.invalid)', msg: this.config.host,
        ...(state.fixedSourceTime ? { itime_t: state.fixedSourceTime } : {}) }];
    }
    async getStatus() { return { host: this.config.host }; }
  }
  const init = config => {
    const key = JSON.stringify(config); if (!clients.has(key)) clients.set(key, new FA(config)); return clients.get(key);
  };
  const prisma = {
    integrationConfig: {
      findFirst: async ({ where } = {}) => {
        state.configReads++; if (state.configError) throw new Error('Fixture configuration unavailable');
        const record = state.record;
        const value = record && (!where?.id || record.id === where.id) && (!where?.enabled || record.enabled) ? structuredClone(record) : null;
        return state.holdConfigRead ? state.holdConfigRead(value) : value;
      },
      upsert: async ({ create, update }) => {
        if (state.saveError) throw new Error('Fixture save failed');
        state.record = { ...(state.record || makeRecord()), ...(state.record ? update : create), updatedAt: new timer.Date(timer.Date.now() + state.version++) };
        return structuredClone(state.record);
      },
    },
    cachedEvent: {
      upsert: async ({ where, create, update }) => {
        if (state.holdWrite) await state.holdWrite(create);
        const index = state.rows.findIndex(r => r.logtype === where.logtype_logId.logtype && r.logId === where.logtype_logId.logId);
        const row = { ...(index < 0 ? create : update) }; if (index < 0) state.rows.push(row); else state.rows[index] = row;
        state.writes.push(row); return row;
      },
      findMany: async ({ where } = {}) => state.rows.filter(r => matches(r, where)),
      deleteMany: async () => ({ count: 0 }),
    },
  };
  const dependencies = {
    'next/server': { NextRequest, NextResponse }, 'zod': require('zod'), '@/lib/prisma': { prisma },
    '@/lib/logger': { createLogger: () => quiet },
    '@/lib/integrations/fortianalyzer': { __esModule: true, default: FA, initSharedFortiAnalyzerService: init, resetFortiAnalyzerLoginBackoff: () => {} },
    '@/lib/integrations/vmware': {}, '@/lib/integrations/fortigate': {}, '@/lib/firewall/connector-factory': {},
    '@/lib/notifications/email': { sendAlarmEmail: async () => { throw new Error('Unexpected email'); }, getEmailStats: () => ({}) },
    '@/lib/alarms/queries': { ALARM_QUERY_REGISTRY: new Map(), BYPASS_CACHE_ALARMS: new Set() },
    '@/lib/alarms/suppression-engine': { createDefaultSuppressionEngine: () => ({ getStats: () => ({}) }) },
    '@/lib/auth/api-permission': { authorizeApiRequest: async () => state.role === 'ADMIN' ? { allowed: true, auth: { role: 'ADMIN' } }
      : { allowed: false, response: NextResponse.json({}, { status: 403 }) } },
    '@/lib/security/integration-credentials': {
      unprotectIntegrationConfig: (config, profile) => state.realCrypto ? load('lib/security/integration-credentials.ts').unprotectIntegrationConfig(config, profile) : ({ ...config }),
      protectIntegrationConfig: (config, profile) => state.realCrypto ? load('lib/security/integration-credentials.ts').protectIntegrationConfig(config, profile) : ({ ...config }),
      hasIntegrationCredential: () => true,
    },
    '@/lib/validators': { validateBody: (value, schema) => { const result = schema.safeParse(value); return result.success ? { success: true, data: result.data } : { success: false, error: 'Fixture validation' }; } },
  };
  const globals = { ...timer, globalThis: shared, AbortController, AbortSignal, structuredClone, URL, TextEncoder, TextDecoder,
    console: quiet, process: { env: { INTEGRATION_CREDENTIALS_KEY: Buffer.alloc(32, 19).toString('base64') } } };
  const load = moduleLoader(dependencies, globals);
  const Engine = load('lib/alarms/detection-engine.ts').AlarmDetectionEngine;
  const engine = () => new Engine(init(state.record.config), { fortiAnalyzerConfigId: state.record.id });
  const save = async (host = 'b.fixture.invalid', password = 'fixture-b') => {
    const response = await timer.settle(load('app/api/integrations/fortianalyzer/route.ts').POST(new NextRequest('http://fixture.invalid/api/integrations/fortianalyzer', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-config', config: { host, username: 'reader', password } }),
    })));
    return response;
  };
  return { ...timer, state, shared, load, engine, init, save, makeRecord,
    start: async () => { const e = engine(); await timer.settle(e.initializeEventCache()); return e; },
    runtime: () => load('lib/alarms/fortianalyzer-cache-runtime.ts'),
    reloadEngine: () => moduleLoader(dependencies, globals)('lib/alarms/detection-engine.ts').AlarmDetectionEngine,
    get: type => load('app/api/integrations/fortianalyzer/route.ts').GET(new NextRequest('http://fixture.invalid/api/integrations/fortianalyzer?type=' + type)),
  };
}
const tests = [], test = (name, fn) => tests.push([name, fn]);
test('repro: a new engine after a host change collects with the new client', async f => {
  const a = await f.start();
  f.state.record = f.makeRecord('b.fixture.invalid', 'fixture-b');
  const b = await f.start();
  assert.notEqual(a.eventCache, b.eventCache);
  assert.equal(b.eventCache.faService.config.host, 'b.fixture.invalid');
  assert.ok(f.state.calls.some(c => c.host === 'b.fixture.invalid' && c.op === 'search'));
});
test('repro: saving settings retires the old background collector immediately', async f => {
  const a = await f.start(); assert.equal((await f.save()).status, 200);
  assert.equal(a.eventCache.getCacheStatus().isFresh, false);
  const count = f.state.calls.filter(c => c.host === 'a.fixture.invalid').length;
  await f.advance(6 * 60_000);
  assert.equal(f.state.calls.filter(c => c.host === 'a.fixture.invalid').length, count);
});
const range = f => ({ logtype: 'event', startTime: new f.Date(f.Date.now() - 24 * 60 * 60_000), endTime: new f.Date(f.Date.now() + 1000) });
const context = (engine, cache = engine.eventCache) => ({ alarmCode: 'FIXTURE', timeWindowMinutes: 1440,
  eventCache: cache, cacheIsFresh: cache.getCacheStatus('event').isFresh, faService: engine.service });
test('same revision shares one initialization and one recurring timer', async f => {
  const a = f.engine(), b = f.engine();
  await f.settle(Promise.all([a.initializeEventCache(), b.initializeEventCache()]));
  assert.equal(a.eventCache, b.eventCache);
  assert.equal(f.state.calls.filter(c => c.op === 'search').length, 11);
  assert.equal(f.timers().length, 1);
  await f.settle(a.eventCache.startBackgroundSync()); assert.equal(f.timers().length, 1);
});
test('module reloads reuse the same process collector', async f => {
  const a = await f.start(), Reloaded = f.reloadEngine();
  const b = new Reloaded(f.init(f.state.record.config), { fortiAnalyzerConfigId: f.state.record.id });
  await f.settle(b.initializeEventCache());
  assert.equal(a.eventCache, b.eventCache); assert.equal(f.timers().length, 1);
});
test('password changes at the same host bind a new client and freshness', async f => {
  const a = await f.start(); assert.equal((await f.save('a.fixture.invalid', 'fixture-b')).status, 200);
  const b = await f.start(); assert.notEqual(a.eventCache, b.eventCache);
  assert.equal(b.eventCache.faService.config.password, 'fixture-b');
  assert.equal(a.eventCache.getCacheStatus().stopped, true); assert.equal(b.eventCache.getCacheStatus().isFresh, true);
  assert.ok(f.state.calls.some(c => c.op === 'login' && c.password === 'fixture-b'));
});
test('scheduled sync detects an externally changed configuration before old source I/O', async f => {
  const a = await f.start(), count = f.state.calls.length;
  f.state.record = f.makeRecord('b.fixture.invalid', 'fixture-b');
  await f.advance(6 * 60_000);
  assert.equal(a.eventCache.getCacheStatus().stopped, true);
  assert.ok(f.state.calls.slice(count).every(c => c.host === 'b.fixture.invalid'));
  assert.equal(f.runtime().getSharedFortiAnalyzerCacheStatus().isFresh, true);
});
for (const mode of ['disabled', 'deleted', 'malformed']) test(`${mode} configuration stops old collection and can recover`, async f => {
  const a = await f.start(), count = f.state.calls.length;
  if (mode === 'disabled') f.state.record.enabled = false;
  else if (mode === 'deleted') f.state.record = null;
  else f.state.record.config = { host: 'b.fixture.invalid' };
  await f.advance(6 * 60_000);
  assert.equal(a.eventCache.getCacheStatus().stopped, true); assert.equal(f.state.calls.length, count);
  assert.equal(f.runtime().getSharedFortiAnalyzerCacheStatus(), null); assert.equal(f.timers().length, 0);
  f.state.record = f.makeRecord('b.fixture.invalid', 'fixture-b');
  const b = await f.start(); assert.equal(b.eventCache.getCacheStatus().isFresh, true);
});
test('configuration lookup failure cannot collect with the old settings', async f => {
  const a = await f.start(), count = f.state.calls.length;
  f.state.configError = true; await f.advance(6 * 60_000);
  assert.equal(f.state.calls.length, count); assert.equal(a.eventCache.getCacheStatus().isFresh, false);
  f.state.configError = false; await f.settle(a.eventCache.forceSync());
  assert.equal(a.eventCache.getCacheStatus().isFresh, true);
});
test('failed saves retain the existing collector and response cache', async f => {
  const a = await f.start(); f.shared.fazCache = { fixture: { data: 'existing' } }; f.state.saveError = true;
  assert.equal((await f.save()).status, 500); assert.equal(a.eventCache.getCacheStatus().stopped, false);
  assert.equal(f.shared.fazCache.fixture.data, 'existing'); assert.equal(f.timers().length, 1);
});
test('denied saves cannot invalidate the collector', async f => {
  const a = await f.start(); f.state.role = 'VIEWER'; assert.equal((await f.save()).status, 403);
  assert.equal(a.eventCache.getCacheStatus().stopped, false); assert.equal(f.timers().length, 1);
});
test('stopped collectors cannot restart, force sync, read or schedule', async f => {
  const a = await f.start(), cache = a.eventCache; cache.stop(); cache.stop();
  const count = f.state.calls.length; assert.equal(await cache.startBackgroundSync(), 0);
  await assert.rejects(cache.forceSync(), error => error.code === 'SOURCE_CONFIG_CHANGED');
  await assert.rejects(cache.queryCachedEvents(range(f)), error => error.code === 'SOURCE_CONFIG_CHANGED');
  await f.advance(10 * 60_000); assert.equal(f.state.calls.length, count); assert.equal(f.timers().length, 0);
});
test('retired source results are cancelled and cannot regain freshness or write', async f => {
  const a = await f.start(); let resolve;
  f.state.holdResults = (client, signal) => client.config.host === 'a.fixture.invalid'
    ? new Promise(done => { resolve = done; f.state.retiredSignal = signal; }) : [];
  const old = a.eventCache.forceSync(); await f.advance(6000); assert.ok(resolve);
  assert.equal((await f.save()).status, 200); const b = await f.start();
  const writes = f.state.writes.length;
  resolve([{ logid: 'late', itime_t: Math.floor(f.Date.now() / 1000) }]); await f.settle(old); await f.flush();
  assert.ok(f.state.retiredSignal.aborted); assert.equal(f.state.writes.length, writes);
  assert.equal(a.eventCache.getCacheStatus().isFresh, false); assert.equal(b.eventCache.getCacheStatus().isFresh, true);
  assert.equal(f.timers().length, 1);
});
test('a DB write already issued by a retired collector cannot overwrite current rows', async f => {
  f.state.fixedSourceTime = Math.floor(f.Date.now() / 1000) - 5;
  const a = await f.start(); let release;
  f.state.holdWrite = row => row.rawLog.msg === 'a.fixture.invalid' ? new Promise(done => { release = done; }) : undefined;
  const old = a.eventCache.forceSync(); await f.advance(6000); assert.ok(release);
  await f.save(); const b = await f.start(); release(); await f.settle(old);
  const rows = await b.eventCache.queryCachedEvents(range(f));
  assert.ok(rows.length > 0); assert.ok(rows.every(row => row.msg === 'b.fixture.invalid'));
  const identities = f.state.rows.map(r => r.logtype + ':' + r.logId);
  assert.equal(new Set(identities).size, identities.length); assert.equal(f.timers().length, 1);
});
test('late retired initialization cannot replace the newer collector', async f => {
  let resolve;
  f.state.holdResults = client => client.config.host === 'a.fixture.invalid' ? new Promise(done => { resolve = done; }) : [];
  const a = f.engine(), pending = a.initializeEventCache().then(() => null, error => error);
  await f.advance(6000); assert.ok(resolve); await f.save(); const b = await f.start();
  const error = await f.settle(pending); assert.equal(error.code, 'SOURCE_CONFIG_CHANGED');
  resolve([]); await f.flush();
  assert.equal(f.runtime().getSharedFortiAnalyzerCacheStatus().sourceRevision, b.eventCache.getCacheStatus().sourceRevision);
  assert.equal(f.timers().length, 1);
});
test('old cached rows never satisfy the new revision even when native IDs collide', async f => {
  f.state.fixedSourceTime = Math.floor(f.Date.now() / 1000) - 5;
  await f.start(); await f.save(); const b = await f.start();
  const oldRows = f.state.rows.filter(r => r.rawLog.msg === 'a.fixture.invalid');
  assert.ok(oldRows.length > 0);
  f.state.rows.push({ ...oldRows[0], logId: 'legacy-unscoped', rawLog: { logid: 'legacy', msg: 'legacy' } });
  const rows = await b.eventCache.queryCachedEvents(range(f));
  assert.ok(rows.length > 0); assert.ok(rows.every(r => r.msg === 'b.fixture.invalid'));
  assert.ok(rows.every(r => !('__infrascopeFaRevision' in r)));
  const { queryCache } = f.load('lib/alarms/queries/base.ts');
  const dedicated = await queryCache({ logtype: 'event', eventTime: { gte: range(f).startTime, lte: range(f).endTime } }, 500, context(b));
  assert.ok(dedicated.every(r => r.msg === 'b.fixture.invalid')); assert.ok(dedicated.every(r => !('__infrascopeFaRevision' in r)));
});
test('new completed empty searches cannot expose old target events', async f => {
  await f.start(); f.state.emptyHost = 'b.fixture.invalid'; await f.save(); const b = await f.start();
  assert.equal(b.eventCache.getCacheStatus().isFresh, true);
  assert.equal((await b.eventCache.queryCachedEvents(range(f))).length, 0);
  const result = await f.settle(f.load('lib/alarms/queries/config-change.ts').getAdminConfigChangeEvents(context(b)));
  assert.equal(result.events.length, 0);
});
test('new source login failure does not inherit old freshness and can recover', async f => {
  await f.start(); f.state.failedHost = 'b.fixture.invalid'; await f.save(); const b = await f.start();
  assert.equal(b.eventCache.getCacheStatus().isFresh, false);
  assert.ok(b.eventCache.getCacheStatus().failedLogtypes.includes('event'));
  f.state.failedHost = null; await f.settle(b.eventCache.forceSync()); assert.equal(b.eventCache.getCacheStatus().isFresh, true);
});
test('retired query contexts fail before falling back to an old live source', async f => {
  const a = await f.start(); await f.save(); let liveCalls = 0;
  await assert.rejects(f.load('lib/alarms/queries/base.ts').runAlarmQuery(context(a), 'fixture', async () => [], async () => { liveCalls++; return []; }),
    error => error.code === 'SOURCE_CONFIG_CHANGED');
  assert.equal(liveCalls, 0);
});
test('retirement during a cache read rejects its late result without old-source fallback', async f => {
  const a = await f.start(); let resolve, liveCalls = 0;
  const pending = f.load('lib/alarms/queries/base.ts').runAlarmQuery(context(a), 'fixture', () => new Promise(done => { resolve = done; }), async () => { liveCalls++; return []; });
  const observed = pending.then(() => null, error => error); await f.flush(); await f.save(); resolve([{ msg: 'old' }]);
  assert.equal((await observed).code, 'SOURCE_CONFIG_CHANGED'); assert.equal(liveCalls, 0);
});
test('current cache failures retain the matching live-source fallback', async f => {
  const b = await f.start(); let liveCalls = 0;
  const result = await f.load('lib/alarms/queries/base.ts').runAlarmQuery(context(b), 'fixture', async () => { throw new Error('Fixture read failure'); }, async fa => {
    assert.equal(fa, b.service); liveCalls++; return [{ msg: 'current' }];
  });
  assert.equal(liveCalls, 1); assert.equal(result.stats.source, 'fortianalyzer'); assert.equal(result.events[0].msg, 'current');
});
test('a late HTTP response cannot populate the current revision response cache', async f => {
  let resolve;
  f.state.holdResults = client => client.config.host === 'a.fixture.invalid' ? new Promise(done => { resolve = done; }) : [{ msg: 'b.fixture.invalid' }];
  const old = f.get('ips-critical'); await f.advance(2000); assert.ok(resolve);
  await f.save(); const current = await f.settle(f.get('ips-critical'));
  assert.equal((await current.json()).data[0].msg, 'b.fixture.invalid');
  resolve([{ msg: 'a.fixture.invalid' }]); await f.settle(old);
  const result = await f.settle(f.get('ips-critical'));
  assert.equal(result.headers.get('X-Cache'), 'HIT'); assert.equal((await result.json()).data[0].msg, 'b.fixture.invalid');
});
test('HTTP config-revision fallback excludes old target rows', async f => {
  await f.start(); f.state.emptyHost = 'b.fixture.invalid'; await f.save();
  const response = await f.settle(f.get('config-revisions'));
  assert.equal(response.status, 200); assert.equal((await response.json()).data.length, 0);
});
test('a configuration read started before a save cannot rebind the retired snapshot', async f => {
  let resolve, count = 0;
  f.state.holdConfigRead = value => ++count === 1 ? new Promise(done => { resolve = () => done(value); }) : value;
  const pending = f.runtime().getFortiAnalyzerEventCache(); await f.flush(); assert.ok(resolve);
  await f.save(); resolve(); const entry = await pending; await f.settle(entry.ready);
  assert.equal(entry.service.config.host, 'b.fixture.invalid');
  assert.ok(f.state.calls.every(c => c.host === 'b.fixture.invalid'));
});
test('an engine with a retired snapshot cannot authenticate or evaluate the old source', async f => {
  const { fortiAnalyzerRevision } = f.load('lib/integrations/fortianalyzer-revision.ts');
  const Engine = f.load('lib/alarms/detection-engine.ts').AlarmDetectionEngine;
  const old = new Engine(f.init(f.state.record.config), { fortiAnalyzerConfigId: f.state.record.id, fortiAnalyzerRevision: fortiAnalyzerRevision(f.state.record) });
  await f.save(); await assert.rejects(old.initializeEventCache(), error => error.code === 'SOURCE_CONFIG_CHANGED');
  await f.settle((await f.runtime().getFortiAnalyzerEventCache()).ready);
  assert.ok(f.state.calls.every(c => c.host === 'b.fixture.invalid'));
});
test('configuration lookup has a deadline and cannot start an unverified client', async f => {
  f.state.holdConfigRead = () => new Promise(() => {});
  await assert.rejects(f.settle(f.runtime().getFortiAnalyzerEventCache()), error => error.code === 'SOURCE_TIMEOUT');
  assert.equal(f.state.calls.length, 0); assert.equal(f.timers().length, 0);
});
test('warmup timeout clears its wait timer and keeps unfinished coverage stale', async f => {
  let release;
  f.state.holdWrite = () => new Promise(done => { release = done; });
  const engine = await f.start(); assert.ok(release);
  assert.equal(engine.eventCache.getCacheStatus().isFresh, false); assert.equal(f.timers().length, 0);
  engine.eventCache.stop(); release(); await f.flush(); assert.equal(f.timers().length, 0);
});
test('rapid consecutive saves leave only the latest collector scheduled', async f => {
  const a = await f.start(); await f.save(); await f.save('c.fixture.invalid', 'fixture-c');
  const c = await f.start(); assert.equal(c.eventCache.faService.config.host, 'c.fixture.invalid');
  assert.equal(c.eventCache.getCacheStatus().isFresh, true); assert.equal(a.eventCache.getCacheStatus().stopped, true);
  assert.equal(f.timers().length, 1);
  const count = f.state.calls.length; await f.advance(6 * 60_000);
  assert.ok(f.state.calls.slice(count).every(call => call.host === 'c.fixture.invalid'));
});
test('API-key changes rotate cache binding using the saved credential alias', async f => {
  const a = await f.start();
  f.state.record = { ...f.makeRecord(), config: { host: 'a.fixture.invalid', apiKey: 'fixture-token' } };
  const b = await f.start(); assert.notEqual(a.eventCache, b.eventCache);
  assert.equal(b.eventCache.faService.config.accessToken, 'fixture-token');
  assert.equal(b.eventCache.getCacheStatus().isFresh, true);
});
test('persisted source revisions do not expose a legacy plaintext credential digest', async f => {
  const { fortiAnalyzerRevision } = f.load('lib/integrations/fortianalyzer-revision.ts');
  const original = f.state.record, sameVersion = { ...original, config: { ...original.config, password: 'another-legacy-secret' } };
  assert.equal(fortiAnalyzerRevision(original), fortiAnalyzerRevision(sameVersion));
  const nextVersion = { ...sameVersion, updatedAt: new f.Date(original.updatedAt.getTime() + 1) };
  assert.notEqual(fortiAnalyzerRevision(original), fortiAnalyzerRevision(nextVersion));
});
test('encrypted credential changes produce a new revision even at the same timestamp', async f => {
  const { fortiAnalyzerRevision } = f.load('lib/integrations/fortianalyzer-revision.ts');
  const original = { ...f.state.record, config: { ...f.state.record.config, password: 'enc:v1:fixture-envelope-a' } };
  const changed = { ...original, config: { ...original.config, password: 'enc:v1:fixture-envelope-b' } };
  assert.notEqual(fortiAnalyzerRevision(original), fortiAnalyzerRevision(changed));
});
test('real encrypted settings saves decrypt the rotated password before collection', async f => {
  await f.start(); f.state.realCrypto = true;
  assert.equal((await f.save()).status, 200);
  assert.ok(f.state.record.config.password.startsWith('enc:v1:'));
  assert.notEqual(f.state.record.config.password, 'fixture-b');
  const b = await f.start(); assert.equal(b.eventCache.faService.config.password, 'fixture-b');
  assert.ok(f.state.calls.some(c => c.op === 'login' && c.host === 'b.fixture.invalid' && c.password === 'fixture-b'));
  assert.ok((await b.eventCache.queryCachedEvents(range(f))).every(row => row.msg === 'b.fixture.invalid'));
});
test('retirement cancels a dedicated live fallback before another old-source poll', async f => {
  const a = await f.start(), count = f.state.calls.filter(c => c.host === 'a.fixture.invalid' && c.op === 'results').length;
  const pending = f.load('lib/alarms/queries/config-change.ts').getFirmwareChangeEvents({ ...context(a), bypassCache: true })
    .then(() => null, error => error);
  await f.advance(1000); await f.save();
  const error = await f.settle(pending); assert.ok(error);
  assert.equal(f.state.calls.filter(c => c.host === 'a.fixture.invalid' && c.op === 'results').length, count);
});
test('a cancelled finite alarm run cannot cancel the shared background collector', async f => {
  const context = f.load('lib/alarms/execution-context.ts');
  const scope = f.load('lib/alarms/run-lease.ts').createAlarmExecution({ owner: 'fixture', runLogId: 'fixture', expiresAt: f.Date.now() + 720000 });
  const entry = await context.withAlarmExecution(scope.execution, () => f.runtime().getFortiAnalyzerEventCache());
  scope.cancel();
  await f.settle(entry.ready);
  assert.equal(entry.cache.getCacheStatus().isFresh, true);
  assert.equal(entry.cache.getCacheStatus().stopped, false);
  assert.ok(f.state.writes.length > 0);
});
async function main() {
  let passed = 0, failed = 0;
  for (const [name, fn] of tests) {
    const f = fixture();
    try { await fn(f); passed++; console.log(`PASS ${name}`); }
    catch (error) { failed++; console.error(`FAIL ${name}: ${error.stack}`); }
  }
  console.log(`FortiAnalyzer cache lifecycle regressions: ${passed} passed, ${failed} failed (isolated I/O).`);
  if (failed) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
