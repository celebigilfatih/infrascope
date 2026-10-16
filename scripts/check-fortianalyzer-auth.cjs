// Exercise real FA authentication and its HTTP test route with offline fixtures.
const assert = require('node:assert/strict');
const { NextRequest, NextResponse } = require('next/server');
const { moduleLoader } = require('./check-alarm-occurrences.cjs');

function clock() {
  let now = Date.parse('2026-10-15T12:00:00Z'), sequence = 0;
  const timers = new Map();
  const flush = async () => { for (let i = 0; i < 500; i++) await Promise.resolve(); };
  return {
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } },
    setTimeout(fn, ms) { const id = ++sequence; timers.set(id, { fn, due: now + ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    advance(ms) { now += ms; }, flush,
    async settle(promise) {
      let done = false, result, failure;
      promise.then(value => { done = true; result = value; }, error => { done = true; failure = error; });
      for (let step = 0; !done && step < 100; step++) {
        await flush(); if (done) break;
        const next = [...timers.entries()].sort((a, b) => a[1].due - b[1].due)[0];
        assert.ok(next, 'Unsettled authentication must have a deadline');
        timers.delete(next[0]); now = next[1].due; next[1].fn();
      }
      assert.ok(done, 'Authentication must finish within its deadline');
      if (failure) throw failure;
      return result;
    },
    pendingTimers: () => timers.size,
  };
}
const credentials = { host: 'fa.fixture.invalid', username: 'reader', password: 'fixture-good' };
const success = session => ({ result: [{ status: { code: 0 } }], session });
const rejected = { result: [{ status: { code: -11, message: 'Fixture rejected' } }] };
function fixture() {
  const timer = clock(), shared = {};
  const state = { calls: [], logs: [], reads: 0, writes: 0, saved: null, role: 'ADMIN' };
  let sequence = 0;
  const log = new Proxy({}, { get: () => (...args) => state.logs.push(args) });
  const dependencies = {
    'next/server': { NextRequest, NextResponse }, 'zod': require('zod'),
    '@/lib/logger': { createLogger: () => log },
    '@/lib/security/tls': { secureFetch: async (_integration, url, options) => {
      const request = JSON.parse(options.body);
      const call = { url, request, signal: options.signal, headers: options.headers };
      state.calls.push(call);
      const path = request.params[0].url;
      if (path === '/sys/logout') {
        if (state.logoutError) throw new Error('Fixture logout failed');
        if (state.hangLogout) return new Promise(() => {});
        return { ok: true, json: async () => ({}) };
      }
      if (path.startsWith('/dvmdb/adom/')) return { ok: true, json: async () => ({ result: [{ status: { code: 0 }, data: [] }] }) };
      if (path !== '/sys/login/user') return { ok: true, json: async () => ({ result: [{ status: { code: 0 }, data: { fixture: true } }] }) };
      if (state.onLogin) await state.onLogin(call);
      if (state.transportError) throw state.transportError;
      if (state.hangLogin) return new Promise(() => {});
      return { ok: state.httpOk !== false, status: state.httpOk === false ? 503 : 200, json: async () => {
        if (state.bodyError) throw new Error('Fixture body failed');
        if (state.body) return state.body(call);
        if (state.hangBody) return new Promise(() => {});
        if (state.payload !== undefined) return state.payload;
        return request.params[0].data.passwd === 'fixture-good' || request.params[0].data.passwd === ' '
          ? success(`fixture-session-${++sequence}`) : rejected;
      } };
    } },
    '@/lib/auth/api-permission': { authorizeApiRequest: async () => state.role === 'ADMIN'
      ? { allowed: true, auth: { role: 'ADMIN' } }
      : { allowed: false, response: NextResponse.json({ success: false }, { status: state.role ? 403 : 401 }) } },
    '@/lib/prisma': { prisma: { integrationConfig: {
      findFirst: async () => { state.reads++; return state.saved; },
      upsert: async () => { state.writes++; return {}; },
    } } },
    '@/lib/validators': { validateBody: (data, schema) => {
      const result = schema.safeParse(data);
      return result.success ? { success: true, data: result.data } : { success: false, error: 'Fixture validation failed' };
    } },
  };
  const globals = { ...timer, globalThis: shared, AbortController, AbortSignal, structuredClone, TextEncoder, TextDecoder,
    process: { env: { INTEGRATION_CREDENTIALS_KEY: Buffer.alloc(32, 17).toString('base64') } }, console: log };
  const load = moduleLoader(dependencies, globals);
  const library = load('lib/integrations/fortianalyzer.ts');
  const route = load('app/api/integrations/fortianalyzer/route.ts');
  const request = (config = credentials, action = 'test') => new NextRequest('http://fixture.invalid/api/integrations/fortianalyzer', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, config }),
  });
  const probe = async (config = credentials) => {
    const response = await timer.settle(route.POST(request(config)));
    return { status: response.status, data: await response.json() };
  };
  const logins = () => state.calls.filter(c => c.request.params[0].url === '/sys/login/user');
  const logouts = () => state.calls.filter(c => c.request.params[0].url === '/sys/logout');
  return { ...timer, state, shared, library, load, route, request, probe, logins, logouts,
    client: config => new library.default(config || credentials),
    reload: () => moduleLoader(dependencies, globals)('lib/integrations/fortianalyzer.ts'),
    saveFixture: config => { state.saved = { config: load('lib/security/integration-credentials.ts').protectIntegrationConfig(config, 'FORTIANALYZER') }; },
  };
}
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
test('repro: valid collector session cannot validate a wrong probe password', async f => {
  const collector = f.library.initSharedFortiAnalyzerService(credentials);
  assert.equal(await f.settle(collector.login()), true);
  const originalSession = collector.session;
  const result = await f.probe({ ...credentials, password: 'fixture-wrong' });
  assert.equal(result.data.connected, false);
  assert.equal(f.logins().length, 2);
  assert.equal(f.logins()[1].request.params[0].data.passwd, 'fixture-wrong');
  assert.equal(collector.session, originalSession);
  assert.equal(await collector.login(), true);
  assert.equal(f.logouts().length, 0);
});
test('repro: a valid explicit password reaches FA and closes only the new probe session', async f => {
  const collector = f.library.initSharedFortiAnalyzerService(credentials);
  assert.equal(await f.settle(collector.login()), true);
  const originalSession = collector.session;
  const result = await f.probe();
  assert.equal(result.data.connected, true); assert.equal(result.data.success, true);
  assert.equal(f.logins().length, 2); assert.equal(f.logouts().length, 1);
  assert.notEqual(f.logouts()[0].request.session, originalSession);
  assert.equal(collector.session, originalSession); assert.equal(f.state.reads, 0); assert.equal(f.state.writes, 0);
});
test('shared clients still reuse and deduplicate identical credentials', async f => {
  const a = f.client(), b = f.client();
  const result = await f.settle(Promise.all([a.login(), b.login()]));
  assert.deepEqual(result, [true, true]); assert.equal(a.session, b.session); assert.equal(f.logins().length, 1);
  assert.equal(await a.login(), true); assert.equal(f.logins().length, 1);
});
test('hot-reloaded modules share only the same credential session', async f => {
  const a = f.client(); await f.settle(a.login());
  const Reloaded = f.reload().default;
  const b = new Reloaded(credentials);
  assert.equal(await f.settle(b.login()), true); assert.equal(a.session, b.session); assert.equal(f.logins().length, 1);
  const c = new Reloaded({ ...credentials, username: 'other' });
  assert.equal(await f.settle(c.login()), true); assert.notEqual(c.session, a.session); assert.equal(f.logins().length, 2);
});
for (const change of [{ username: 'other' }, { password: 'fixture-wrong' }]) test(`shared factory rotation isolates ${Object.keys(change)[0]}`, async f => {
  const a = f.library.initSharedFortiAnalyzerService(credentials); await f.settle(a.login());
  const b = f.library.initSharedFortiAnalyzerService({ ...credentials, ...change });
  assert.notEqual(a, b);
  assert.equal(await f.settle(b.login()), change.password ? false : true);
  assert.equal(f.logins().length, 2); assert.equal(f.logouts().length, 0);
});
test('normalized host variants preserve pooling without ignoring password differences', async f => {
  const a = f.client({ ...credentials, host: ' FA.FIXTURE.INVALID ' }); await f.settle(a.login());
  const b = f.client(); assert.equal(await f.settle(b.login()), true); assert.equal(f.logins().length, 1);
  const result = await f.probe({ ...credentials, host: ' FA.FIXTURE.INVALID ', password: 'fixture-wrong' });
  assert.equal(result.data.connected, false); assert.equal(f.logins().length, 2);
  assert.equal(f.logins()[1].url, 'https://fa.fixture.invalid/jsonrpc');
});
test('constructor snapshots credentials rather than retaining a mutable input object', async f => {
  const input = { ...credentials }; const a = f.client(input); input.password = 'fixture-wrong';
  assert.equal(await f.settle(a.login()), true);
  assert.equal(f.logins()[0].request.params[0].data.passwd, credentials.password);
});
test('legacy host-only state is not trusted after the ownership change', async f => {
  f.shared._fazGlobalState = { [credentials.host]: { session: 'unowned-legacy-session', lastLoginTime: f.Date.now() } };
  const result = await f.probe({ ...credentials, password: 'fixture-wrong' });
  assert.equal(result.data.connected, false); assert.equal(f.logins().length, 1);
  assert.equal(f.logouts().length, 0);
});
test('concurrent accounts do not adopt each other through the login queue', async f => {
  const a = f.client(), b = f.client({ ...credentials, username: 'other', password: 'fixture-wrong' });
  const result = await f.settle(Promise.all([a.login(), b.login()]));
  assert.deepEqual(result, [true, false]); assert.equal(f.logins().length, 2); assert.equal(b.session, null);
});
test('concurrent collector and probe keep separate session ownership', async f => {
  const collector = f.client();
  const [loggedIn, response] = await f.settle(Promise.all([collector.login(), f.route.POST(f.request())]));
  assert.equal(loggedIn, true); assert.equal((await response.json()).connected, true);
  assert.equal(f.logins().length, 2); assert.equal(f.logouts().length, 1);
  assert.notEqual(collector.session, f.logouts()[0].request.session);
});
test('concurrent password revisions of one account never share a login result', async f => {
  const a = f.client(), b = f.client({ ...credentials, password: 'fixture-wrong' });
  const result = await f.settle(Promise.all([a.login(), b.login()]));
  assert.deepEqual(result, [true, false]); assert.equal(f.logins().length, 2); assert.equal(b.session, null);
});
test('queued probes time out without leaving an account lock or sending another login', async f => {
  f.state.hangLogin = true;
  const result = await f.settle(Promise.all([f.route.POST(f.request()), f.route.POST(f.request())]));
  for (const response of result) assert.equal((await response.json()).connected, false);
  assert.equal(f.logins().length, 1);
  f.state.hangLogin = false; f.advance(61_000);
  assert.equal((await f.probe()).data.connected, true); assert.equal(f.logins().length, 2);
});
test('concurrent distinct probes send each credential and close their own sessions', async f => {
  const responses = await f.settle(Promise.all([f.route.POST(f.request()), f.route.POST(f.request({ ...credentials, username: 'other' }))]));
  for (const response of responses) assert.equal((await response.json()).connected, true);
  assert.equal(f.logins().length, 2); assert.equal(f.logouts().length, 2);
  assert.equal(new Set(f.logouts().map(c => c.request.session)).size, 2);
});
test('a later probe with the same credential performs a new login', async f => {
  assert.equal((await f.probe()).data.connected, true); assert.equal((await f.probe()).data.connected, true);
  assert.equal(f.logins().length, 2); assert.equal(f.logouts().length, 2);
});
test('same-account probes retain serialization until their logout attempt finishes', async f => {
  f.state.hangLogout = true;
  const probes = Array.from({ length: 8 }, () => f.route.POST(f.request()));
  await f.flush();
  const pendingLoginCount = f.logins().length;
  await f.settle(Promise.all(probes));
  assert.equal(pendingLoginCount, 1, 'Only one owned probe session may await cleanup per account');
  f.state.hangLogout = false; f.advance(61_000);
  assert.equal((await f.probe()).data.connected, true);
});
test('a suppressed login cannot return a stale session to same-credential waiters', async f => {
  const a = f.client(); await f.settle(a.login()); f.advance(31 * 60_000);
  assert.equal((await f.probe({ ...credentials, password: 'fixture-wrong' })).data.connected, false);
  const b = f.client();
  const results = await f.settle(Promise.all([a.login(), b.login()]));
  assert.deepEqual(results, [false, false]);
});
for (const raw of ['', undefined]) test(`blank/omitted password uses the encrypted saved password (${raw === undefined ? 'omitted' : 'blank'})`, async f => {
  f.saveFixture(credentials);
  const result = await f.probe({ ...credentials, password: raw });
  assert.equal(result.data.connected, true); assert.equal(f.state.reads, 1);
  assert.equal(f.logins()[0].request.params[0].data.passwd, credentials.password);
  assert.equal(f.state.writes, 0);
});
test('an explicit wrong password never falls back to the saved correct password', async f => {
  f.saveFixture(credentials);
  assert.equal((await f.probe({ ...credentials, password: 'fixture-wrong' })).data.connected, false);
  assert.equal(f.state.reads, 0); assert.equal(f.logins()[0].request.params[0].data.passwd, 'fixture-wrong');
});
test('password whitespace is sent literally', async f => {
  assert.equal((await f.probe({ ...credentials, password: ' ' })).data.connected, true);
  assert.equal(f.logins()[0].request.params[0].data.passwd, ' ');
});
test('missing saved password rejects before starting authentication', async f => {
  assert.equal((await f.probe({ ...credentials, password: '' })).data.connected, false);
  assert.equal(f.logins().length, 0);
});
test('inactive token fields cannot bypass explicit session authentication', async f => {
  const result = await f.probe({ ...credentials, authMode: 'session', password: 'fixture-wrong', accessToken: 'fixture-token', apiKey: 'fixture-token' });
  assert.equal(result.data.connected, false); assert.equal(f.logins().length, 1);
});
test('API-token clients verify ADOM access without creating a session', async f => {
  const a = f.client({ host: credentials.host, accessToken: 'fixture-token' });
  assert.equal(await a.login(), true); assert.equal(f.state.calls.length, 1);
  assert.equal(f.state.calls[0].headers.Authorization, 'Bearer fixture-token');
  assert.equal(f.state.calls[0].request.session, undefined); assert.equal(f.logins().length, 0);
});
for (const role of ['VIEWER', 'EDITOR', null]) test(`authorization rejects ${role || 'anonymous'} before configuration/source access`, async f => {
  f.state.role = role;
  const result = await f.probe(); assert.equal(result.status, role ? 403 : 401);
  assert.equal(f.state.reads, 0); assert.equal(f.state.writes, 0); assert.equal(f.state.calls.length, 0);
});
for (const [name, configure] of [
  ['HTTP error with a success-shaped body', f => { f.state.httpOk = false; }],
  ['outer RPC error with a success-shaped result', f => { f.state.payload = { ...success('fixture-session'), error: { code: -11 } }; }],
  ['missing status', f => { f.state.payload = { session: 'fixture-session' }; }],
  ['empty session', f => { f.state.payload = success(''); }],
  ['object session', f => { f.state.payload = success({ unexpected: true }); }],
  ['numeric session', f => { f.state.payload = success(42); }],
  ['null response', f => { f.state.payload = null; }],
  ['invalid JSON', f => { f.state.bodyError = true; }],
  ['transport failure', f => { f.state.transportError = new Error('Fixture transport failed'); }],
]) test(`${name} cannot validate credentials`, async f => {
  configure(f); const result = await f.probe(); assert.equal(result.data.connected, false);
  assert.equal(f.logins().length, 1); assert.equal(f.state.writes, 0);
});
for (const mode of ['hangLogin', 'hangBody']) test(`${mode} is bounded and aborts authentication`, async f => {
  f.state[mode] = true;
  const result = await f.probe(); assert.equal(result.data.connected, false);
  assert.equal(f.logins().length, 1); assert.ok(f.logins()[0].signal.aborted);
});
for (const mode of ['logoutError', 'hangLogout']) test(`${mode} stays bounded without invalidating the collector`, async f => {
  const collector = f.client(); await f.settle(collector.login()); const original = collector.session;
  f.state[mode] = true;
  assert.equal((await f.probe()).data.connected, true);
  assert.equal(f.logouts().length, 1); assert.equal(collector.session, original);
  assert.notEqual(f.logouts()[0].request.session, original);
  if (mode === 'hangLogout') assert.ok(f.logouts()[0].signal.aborted);
});
test('late successful body completion cannot publish an abandoned probe session', async f => {
  let resolve;
  f.state.body = () => new Promise(done => { resolve = done; });
  assert.equal((await f.probe()).data.connected, false);
  resolve(success('fixture-late-session')); await f.flush();
  f.state.body = null; f.advance(61_000);
  const collector = f.client(); assert.equal(await f.settle(collector.login()), true);
  assert.notEqual(collector.session, 'fixture-late-session'); assert.equal(f.logins().length, 2);
});
test('same-account backoff survives password changes without affecting another account', async f => {
  assert.equal((await f.probe({ ...credentials, password: 'fixture-wrong' })).data.connected, false);
  assert.equal((await f.probe({ ...credentials, password: 'another-wrong' })).data.connected, false);
  assert.equal(f.logins().length, 1);
  assert.equal((await f.probe({ ...credentials, username: 'other' })).data.connected, true);
  assert.equal(f.logins().length, 2);
  f.advance(61_000); assert.equal((await f.probe()).data.connected, true); assert.equal(f.logins().length, 3);
});
test('locked source accounts remain visible and are not retried automatically', async f => {
  f.library.initSharedFortiAnalyzerService(credentials);
  f.state.payload = { result: [{ status: { code: -22 } }] };
  assert.equal((await f.probe()).data.connected, false);
  const health = f.library.getFortiAnalyzerLoginHealth();
  assert.equal(health.isAccountLocked, true); assert.equal(health.consecutiveFailures, 1);
  assert.ok(health.backoffRemainingSec > 0);
  assert.equal((await f.probe()).data.connected, false); assert.equal(f.logins().length, 1);
});
test('saving one account only resets its own backoff', async f => {
  f.library.initSharedFortiAnalyzerService(credentials);
  const other = { ...credentials, username: 'other', password: 'fixture-wrong' };
  assert.equal((await f.probe({ ...credentials, password: 'fixture-wrong' })).data.connected, false);
  assert.equal((await f.probe(other)).data.connected, false);
  const response = await f.settle(f.route.POST(f.request(credentials, 'save-config')));
  assert.equal((await response.json()).success, true);
  assert.equal((await f.probe()).data.connected, true);
  assert.equal((await f.probe(other)).data.connected, false);
  assert.equal(f.logins().length, 3); assert.equal(f.state.writes, 1);
});
test('authentication errors do not log credentials, session tokens or provider messages', async f => {
  f.state.transportError = new Error('fixture-sensitive-password');
  assert.equal((await f.probe()).data.connected, false);
  const logs = JSON.stringify(f.state.logs);
  assert.ok(!logs.includes('fixture-sensitive-password')); assert.ok(!logs.includes(credentials.password));
});

async function main() {
  let passed = 0, failed = 0;
  const selected = process.argv.includes('--repro') ? tests.filter(([name]) => name.startsWith('repro:')) : tests;
  for (const [name, fn] of selected) {
    const f = fixture();
    try { await fn(f); assert.equal(f.pendingTimers(), 0, 'Authentication deadlines must be released'); passed++; console.log(`PASS ${name}`); }
    catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
  }
  console.log(`FortiAnalyzer authentication regressions: ${passed} passed, ${failed} failed (isolated I/O).`);
  if (failed) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
