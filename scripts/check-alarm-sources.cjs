// Real source/query/cache/engine code with fake I/O and a deterministic clock.
const assert = require('node:assert/strict');
const { moduleLoader } = require('./check-alarm-occurrences.cjs');
const healthFixture = require('./check-alarm-health.cjs');
const quiet = new Proxy({}, { get: () => () => {} });

function clock() {
  let now = Date.parse('2026-10-15T12:00:00Z'), sequence = 0;
  const timers = new Map();
  return {
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } },
    setTimeout(fn, ms) { const id = ++sequence; timers.set(id, { fn, due: now + ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    async settle(promise) {
      let done = false, value, failure;
      promise.then(result => { done = true; value = result; }, error => { done = true; failure = error; });
      for (let step = 0; !done && step < 500; step++) {
        // Drain nested VM promises before advancing virtual time to a deadline.
        for (let flush = 0; flush < 5000; flush++) await Promise.resolve();
        if (done) break;
        const next = [...timers.entries()].sort((a, b) => a[1].due - b[1].due)[0];
        assert.ok(next, 'An unsettled fixture operation must own a deadline or poll timer');
        timers.delete(next[0]); now = next[1].due; next[1].fn();
      }
      assert.ok(done, 'The operation must settle within the fixture timer budget');
      if (failure) throw failure;
      return value;
    },
  };
}
function fixture() {
  const timer = clock();
  const state = { calls: [], writes: 0, readError: null, writeError: null, duplicateOnce: false,
    rows: [], status: 200, page: { result: { percentage: 100, data: [], status: { code: 0 } } },
    start: { result: { tid: 17, status: { code: 0 } } }, fresh: false, cacheReads: 0 };
  const prisma = { cachedEvent: {
    findMany: async () => { state.cacheReads++; if (state.readError) throw state.readError; return state.rows; },
    upsert: async () => { state.writes++; if (state.duplicateOnce) { state.duplicateOnce = false; throw { code: 'P2002' }; } if (state.writeError) throw state.writeError; return {}; },
    deleteMany: async () => ({ count: 0 }),
  } };
  const registry = new Map();
  const load = moduleLoader({
    '@/lib/prisma': { prisma }, '@/lib/logger': { createLogger: () => quiet },
    '@/lib/security/tls': { secureFetch: async (_source, _url, options) => {
      const request = JSON.parse(options.body); state.calls.push({ request, signal: options.signal });
      if (request.params[0].url.startsWith('/dvmdb/adom/')) return { ok: true, status: 200, json: async () => ({ result: [{ status: { code: 0 }, data: [] }] }) };
      if (state.transportError) throw state.transportError;
      if (state.hang || (state.hangGet && request.method === 'get')) return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('Fixture aborted')), { once: true }));
      const status = request.method === 'get' && state.getStatus ? state.getStatus : state.status;
      return { ok: status < 400, status, json: async () => {
        if (request.method === 'get' && state.hangBody) return new Promise(() => {});
        if (request.method === 'get' && state.pages?.length) return state.pages.shift();
        return state.payload || (request.method === 'add' ? state.start : state.page);
      } };
    } },
    '@/lib/integrations/vmware': {}, '@/lib/integrations/fortigate': {}, '@/lib/firewall/connector-factory': {},
    '@/lib/notifications/email': { sendAlarmEmail: async () => { throw new Error('Unexpected email'); }, getEmailStats: () => ({}) },
    '@/lib/alarms/queries': { ALARM_QUERY_REGISTRY: registry, BYPASS_CACHE_ALARMS: new Set() },
    '@/lib/alarms/suppression-engine': { createDefaultSuppressionEngine: () => ({ getStats: () => ({}) }) },
  }, { ...timer, AbortController, AbortSignal, process: { env: {} }, console: quiet });
  const FA = load('lib/integrations/fortianalyzer.ts').default;
  const fa = new FA({ host: 'fixture.invalid', accessToken: 'fixture-key' });
  const query = load('lib/alarms/queries/base.ts');
  const Cache = load('lib/alarms/event-cache.ts').EventCacheService;
  const engine = new (load('lib/alarms/detection-engine.ts').AlarmDetectionEngine)(fa);
  engine.cacheInitialized = true;
  engine.eventCache = { getCacheStatus: () => ({ isFresh: state.fresh }), queryCachedEvents: async () => { state.cacheReads++; return [{ fixture: true }]; } };
  const ctx = { alarmCode: 'FIXTURE', timeWindowMinutes: 5, cacheIsFresh: false, eventCache: null, faService: fa };
  const rule = { id: 'fixture-rule', code: 'ADMIN_CONFIG_CHANGE', name: 'Fixture', source: 'fortianalyzer',
    severity: 'ALARM_HIGH', cooldownMinutes: 15, notifyEmail: false,
    detectionLogic: { logtype: 'event', threshold: 1, timeWindowMinutes: 5 } };
  return { state, prisma, fa, query, Cache, engine, ctx, rule, load, registry, ...timer };
}
const event = { logid: 'fixture-type', eventtime: '1792065600000000000', itime_t: 1792065600, msg: 'Fixture' };
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('a live query exception is not a successful empty result', async f => {
  await assert.rejects(f.query.runAlarmQuery(f.ctx, 'fixture', async () => [], async () => { throw new Error('Fixture source failed'); }));
});
test('fresh authoritative empty cache is a successful empty result', async f => {
  const result = await f.query.runAlarmQuery({ ...f.ctx, cacheIsFresh: true, eventCache: {} }, 'fixture', async () => [], async () => { throw new Error('Live must not run'); });
  assert.equal(result.events.length, 0); assert.equal(result.stats.source, 'cache');
});
test('stale cache is bypassed and the successful live fallback is identified', async f => {
  const result = await f.query.runAlarmQuery({ ...f.ctx, eventCache: {} }, 'fixture',
    async () => { throw new Error('Stale cache must not be queried'); }, async () => []);
  assert.equal(result.events.length, 0); assert.equal(result.stats.source, 'fortianalyzer'); assert.equal(result.stats.usedFallback, true);
});
test('failed soft verification propagates once instead of pretending the cache verified it', async f => {
  let attempts = 0;
  await assert.rejects(f.query.runAlarmQuery({ ...f.ctx, cacheIsFresh: true, eventCache: {} }, 'fixture', async () => [], async () => { attempts++; throw new Error('Fixture verification failed'); }, { softFallback: true }));
  assert.equal(attempts, 1);
});
test('failed cache read can recover through a successful live source', async f => {
  const result = await f.query.runAlarmQuery({ ...f.ctx, cacheIsFresh: true, eventCache: {} }, 'fixture', async () => { throw new Error('Fixture DB read failed'); }, async () => [event]);
  assert.equal(result.events.length, 1); assert.equal(result.stats.source, 'fortianalyzer'); assert.equal(result.stats.usedFallback, true);
});
test('database-only failures never fall through to FortiAnalyzer', async f => {
  let calls = 0;
  await assert.rejects(f.query.runAlarmQuery(f.ctx, 'fixture', async () => { throw new Error('Fixture database failed'); }, async () => { calls++; return []; }, { databaseOnly: true }));
  assert.equal(calls, 0);
});
test('database-only empty success never invokes soft FA verification', async f => {
  const result = await f.query.runAlarmQuery(f.ctx, 'fixture', async () => [], async () => { throw new Error('Unexpected FA fallback'); }, { databaseOnly: true, softFallback: true });
  assert.equal(result.events.length, 0);
});
for (const [name, code, configure] of [
  ['missing TID', 'SEARCH_NOT_STARTED', f => { f.state.start = { result: { status: { code: 0 } } }; }],
  ['HTTP failure', 'SOURCE_HTTP_ERROR', f => { f.state.status = 503; }],
  ['session expiry', 'SOURCE_SESSION_EXPIRED', f => { f.state.payload = { error: { code: -11, message: 'Fixture session expired' } }; }],
  ['non-auth source status', 'SOURCE_REJECTED', f => { f.state.payload = { result: { status: { code: -3, message: 'Fixture rejected' } } }; }],
]) test(`${name} cannot become an empty direct query`, async f => {
  configure(f); await assert.rejects(f.settle(f.query.queryFortiAnalyzerDirect(f.fa, 'event', '', 5)), error => error.code === code);
});
test('confirmed completed empty search succeeds', async f => {
  assert.equal((await f.settle(f.query.queryFortiAnalyzerDirect(f.fa, 'event', '', 5))).length, 0);
});
test('a still-running empty search ends as incomplete, not empty success', async f => {
  f.state.page.result.percentage = 50;
  await assert.rejects(f.settle(f.query.queryFortiAnalyzerDirect(f.fa, 'event', '', 5)), error => error.code === 'SEARCH_INCOMPLETE');
});
test('partial nonempty search is not treated as a complete result', async f => {
  f.state.page.result.percentage = 50; f.state.page.result.data = [event];
  await assert.rejects(f.settle(f.query.queryFortiAnalyzerDirect(f.fa, 'event', '', 5)), error => error.code === 'SEARCH_INCOMPLETE');
});
test('missing search completion metadata is not proof of empty success', async f => {
  delete f.state.page.result.percentage;
  await assert.rejects(f.settle(f.query.queryFortiAnalyzerDirect(f.fa, 'event', '', 5)), error => error.code === 'SOURCE_INVALID_RESPONSE');
});
test('source transport errors remain failures', async f => {
  f.state.transportError = new Error('Fixture transport failed');
  await assert.rejects(f.settle(f.query.queryFortiAnalyzerDirect(f.fa, 'event', '', 5)), /Fixture transport failed/);
});
test('search timeout aborts the source request and rejects', async f => {
  f.state.hang = true;
  await assert.rejects(f.settle(f.query.queryFortiAnalyzerDirect(f.fa, 'event', '', 5)), error => error.code === 'SOURCE_TIMEOUT');
  assert.ok(f.state.calls[0].signal.aborted);
});

test('authentication failure rejects before issuing a log search', async f => {
  f.fa.session = null; f.fa.login = async () => false;
  await assert.rejects(f.settle(f.query.queryFortiAnalyzerDirect(f.fa, 'event', '', 5)), error => error.code === 'SOURCE_AUTH_FAILED');
  assert.equal(f.state.calls.length, 0);
});
for (const [name, code, configure] of [
  ['HTTP', 'SOURCE_HTTP_ERROR', f => { f.state.getStatus = 503; }],
  ['outer session', 'SOURCE_SESSION_EXPIRED', f => { f.state.page = { error: { code: -11 } }; }],
  ['inner session', 'SOURCE_SESSION_EXPIRED', f => { f.state.page.result.status.code = -11; }],
  ['non-auth status', 'SOURCE_REJECTED', f => { f.state.page.result.status.code = -3; }],
]) test(`${name} failure while polling remains a source failure`, async f => {
  configure(f); await assert.rejects(f.settle(f.query.queryFortiAnalyzerDirect(f.fa, 'event', '', 5)), error => error.code === code);
  assert.ok(f.state.calls.some(call => call.request.method === 'get'));
});
for (const value of [-1, 101, '100']) test(`invalid progress ${value} is rejected`, async f => {
  f.state.page.result.percentage = value;
  await assert.rejects(f.settle(f.query.queryFortiAnalyzerDirect(f.fa, 'event', '', 5)), error => error.code === 'SOURCE_INVALID_RESPONSE');
});
test('completed response without a result array is rejected', async f => {
  delete f.state.page.result.data;
  await assert.rejects(f.settle(f.query.queryFortiAnalyzerDirect(f.fa, 'event', '', 5)), error => error.code === 'SOURCE_INVALID_RESPONSE');
});
test('a partial search can complete within the poll budget', async f => {
  f.state.pages = [{ result: { percentage: 50, status: { code: 0 }, data: [event] } },
    { result: { percentage: 100, status: { code: 0 }, data: [event] } }];
  const rows = await f.settle(f.query.queryFortiAnalyzerDirect(f.fa, 'event', '', 5));
  assert.equal(rows.length, 1); assert.equal(rows[0].logid, event.logid);
  assert.equal(f.state.calls.filter(call => call.request.method === 'get').length, 2);
});
for (const stage of ['hangGet', 'hangBody']) test(`${stage} is bounded and aborts the polling request`, async f => {
  f.state[stage] = true;
  await assert.rejects(f.settle(f.query.queryFortiAnalyzerDirect(f.fa, 'event', '', 5)), error => error.code === 'SOURCE_TIMEOUT');
  assert.ok(f.state.calls.find(call => call.request.method === 'get').signal.aborted);
});
test('caller cancellation prevents a new request', async f => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(f.settle(f.fa.startLogSearch('event', 10, '', { signal: controller.signal })), error => error.code === 'SOURCE_CANCELLED');
  assert.equal(f.state.calls.length, 0);
});
test('stale generic cache cannot mask an unavailable live source', async f => {
  f.state.start = { result: {} };
  await assert.rejects(f.settle(f.engine.performLogSearch({ ...f.rule, code: 'FIXTURE_GENERIC' }, 'event', '', 10)));
});
test('registered query failure cannot fall through to a broader generic cache query', async f => {
  f.state.fresh = true;
  f.registry.set(f.rule.code, async () => { throw new Error('Fixture registered query failed'); });
  await assert.rejects(f.engine.performLogSearch(f.rule, 'event', '', 10));
  assert.equal(f.state.cacheReads, 0);
});
test('fresh generic cache remains usable without a live request', async f => {
  f.state.fresh = true;
  const result = await f.engine.performLogSearch({ ...f.rule, code: 'FIXTURE_GENERIC' }, 'event', '', 10);
  assert.equal(result.tid, 'cache'); assert.equal(result.logs.length, 1); assert.equal(f.state.calls.length, 0);
});
for (const complete of [false, true]) test(`correlation secondary search ${complete ? 'accepts completed empty' : 'rejects incomplete'} results`, async f => {
  f.prisma.alarmEvent = { findFirst: async () => null, findMany: async () => [{ sourceIp: '192.0.2.1', alarm: { code: 'FIXTURE_PRECURSOR' } }] };
  const alarm = { ...f.rule, detectionLogic: { ...f.rule.detectionLogic,
    correlationRules: { precursorCodes: ['FIXTURE_PRECURSOR'], lookbackMinutes: 10,
      matchField: 'sourceIp', secondaryLogtype: 'event', secondaryFilter: 'subtype == system' } } };
  if (!complete) f.state.page.result.percentage = 50;
  const result = f.settle(f.engine.evaluateCorrelationAlarm(alarm));
  if (!complete) await assert.rejects(result, error => error.code === 'SEARCH_INCOMPLETE');
  else { const evaluated = await result; assert.equal(evaluated.error, undefined); assert.equal(evaluated.triggered, false); }
});
test('event-cache write failures propagate', async f => {
  f.state.writeError = new Error('Fixture storage unavailable');
  await assert.rejects(new f.Cache(f.fa).saveEvents('event', [event]));
});
test('a duplicate upsert race retries persistence, rather than swallowing arbitrary failures', async f => {
  f.state.duplicateOnce = true; await new f.Cache(f.fa).saveEvents('event', [event]);
  assert.equal(f.state.writes, 2);
});
test('a failed duplicate retry remains a write failure', async f => {
  f.state.duplicateOnce = true; f.state.writeError = new Error('Fixture retry failed');
  await assert.rejects(new f.Cache(f.fa).saveEvents('event', [event]));
});
test('event-cache read failure is not a successful empty cache', async f => {
  f.state.readError = new Error('Fixture read failed');
  await assert.rejects(new f.Cache(f.fa).queryCachedEvents({ logtype: 'event', startTime: new f.Date(0), endTime: new f.Date() }));
});
test('failed scans never mark event cache fresh; completed empty scans recover it', async f => {
  f.state.start = { result: {} }; const cache = new f.Cache(f.fa);
  await f.settle(cache.forceSync()); assert.equal(cache.getCacheStatus().isFresh, false);
  f.state.start = { result: { tid: 17, status: { code: 0 } } };
  await f.settle(cache.forceSync()); assert.equal(cache.getCacheStatus().isFresh, true, JSON.stringify(cache.getCacheStatus()));
});
test('a failed refresh immediately invalidates previously fresh coverage and recovery restores it', async f => {
  const cache = new f.Cache(f.fa); await f.settle(cache.forceSync()); assert.equal(cache.getCacheStatus('event').isFresh, true);
  f.state.start = { result: {} }; await f.settle(cache.forceSync()); assert.equal(cache.getCacheStatus('event').isFresh, false);
  f.state.start = { result: { tid: 17, status: { code: 0 } } }; await f.settle(cache.forceSync());
  assert.equal(cache.getCacheStatus().isFresh, true); assert.equal(cache.getCacheStatus().consecutiveSyncFailures, 0);
});
test('cache writes failing during sync cannot establish fresh coverage', async f => {
  f.state.page.result.data = [event]; f.state.writeError = new Error('Fixture DB unavailable');
  const cache = new f.Cache(f.fa); await f.settle(cache.forceSync());
  assert.ok(f.state.writes > 0); assert.equal(cache.getCacheStatus().isFresh, false);
});
test('an incomplete later page fails the entire logtype sync', async f => {
  const fake = { login: async () => true, startLogSearch: async () => 17,
    fetchLogResults: async (_tid, offset) => offset ? null : Array(1000).fill(event) };
  const cache = new f.Cache(fake); let saved = 0;
  cache.saveEvents = async (_type, rows) => { saved += rows.length; };
  await assert.rejects(f.settle(cache.syncLogType('event', new f.Date(0), new f.Date())), error => error.code === 'SEARCH_INCOMPLETE');
  assert.equal(saved, 1000); assert.equal(cache.getCacheStatus('event').isFresh, false);
});
test('a failed logtype is unavailable even when other logtypes complete', async f => {
  const fake = { login: async () => true, startLogSearch: async type => type === 'dns' ? null : 17, fetchLogResults: async () => [] };
  const cache = new f.Cache(fake); await f.settle(cache.forceSync());
  assert.equal(cache.getCacheStatus('dns').isFresh, false); assert.equal(cache.getCacheStatus('event').isFresh, true);
  assert.equal(cache.getCacheStatus().isFresh, false);
});
test('failed targeted event sync invalidates event coverage without invalidating other types', async f => {
  const fake = { login: async () => true, startLogSearch: async (_type, _limit, filter) => filter === 'action == login' ? null : 17, fetchLogResults: async () => [] };
  const cache = new f.Cache(fake); await f.settle(cache.forceSync());
  assert.equal(cache.getCacheStatus('event').isFresh, false); assert.equal(cache.getCacheStatus('dns').isFresh, true);
});
test('real query and engine errors reach runner logs and health, then recover without rewriting history', async f => {
  const actualQuery = f.load('lib/alarms/queries/config-change.ts').getAdminConfigChangeEvents;
  f.registry.set(f.rule.code, actualQuery); f.state.start = { result: {} };
  healthFixture.reset(); const runnerState = healthFixture.getState();
  runnerState.config = { id: 'fixture-analyzer', enabled: true, config: { host: 'fixture.invalid', username: 'fixture', password: 'fixture' } };
  for (let i = 0; i < 6; i++) {
    runnerState.faResults = await f.settle(f.engine.evaluateLogTypeGroupOptimized('event', [f.rule]));
    assert.match(runnerState.faResults[0].error, /SEARCH_NOT_STARTED/);
    assert.equal((await healthFixture.run()).summary.errors, 1);
  }
  assert.equal(runnerState.logs[0].status, 'PARTIAL');
  const failed = await healthFixture.health(); assert.equal(failed.alarms.unresolvedErrorChecks, 6);
  f.state.start = { result: { tid: 17, status: { code: 0 } } };
  runnerState.faResults = await f.settle(f.engine.evaluateLogTypeGroupOptimized('event', [f.rule]));
  assert.equal(runnerState.faResults[0].error, undefined);
  await healthFixture.run(); assert.equal(runnerState.logs.at(-1).status, 'SUCCESS');
  const recovered = await healthFixture.health(); assert.equal(recovered.alarms.unresolvedErrorChecks, 0);
  assert.equal(runnerState.logs.filter(row => row.status === 'PARTIAL').length, 6);
});

(async () => {
  for (const [name, fn] of tests) { await fn(fixture()); console.log(`PASS ${name}`); }
  console.log(`Alarm source regressions passed (${tests.length} scenarios; real source/query/cache/engine code, fake I/O and timers).`);
})().catch(error => { console.error(error); process.exitCode = 1; });
