// Actual FA client/profile/settings/collector/runner/health paths; synthetic wire, store and clock.
const assert = require('node:assert/strict');
const { NextRequest, NextResponse } = require('next/server');
const { moduleLoader } = require('./check-alarm-occurrences.cjs');
const { clock } = require('./check-alarm-ownership.cjs');
const { attachAlarmLease } = require('./helpers/alarm-run-fixture.cjs');
const quiet = new Proxy({}, { get: () => () => {} });
const session = { host: 'fa.fixture.invalid', username: 'reader', password: 'fixture-password' };
const token = { host: session.host, apiKey: 'fixture-key' };
function matches(row, where = {}) {
  if (where.AND && !where.AND.every(w => matches(row, w))) return false;
  if (where.OR && !where.OR.some(w => matches(row, w))) return false;
  if (where.NOT && (Array.isArray(where.NOT) ? where.NOT : [where.NOT]).some(w => matches(row, w))) return false;
  return Object.entries(where).every(([k, v]) => {
    if (['AND', 'OR', 'NOT'].includes(k)) return true;
    if (k === 'rawLog') return row.rawLog?.[v.path[0]] === v.equals;
    if (v && typeof v === 'object') return Object.entries(v).every(([op, x]) => op === 'gte' ? row[k] >= x : op === 'lte' ? row[k] <= x : op === 'in' ? x.includes(row[k]) : row[k] === v);
    return row[k] === v;
  });
}
function fixture() {
  const timer = clock(), root = {};
  const eventEpoch = (BigInt(timer.Date.now() - 1000) * 1000000n).toString();
  const state = { calls: [], logs: [], rows: [], writes: 0, role: 'ADMIN', validKey: 'fixture-key', allowed: ['root', 'Tenant_A', 'Tenant_B', 'Tenant A'], version: 1, rules: [] };
  const logger = new Proxy({}, { get: () => (...args) => state.logsForPrivacy?.push(args) });
  const prisma = {
    integrationConfig: { findFirst: async () => state.record || null, findMany: async () => state.record ? [state.record] : [],
      upsert: async ({ create, update }) => { state.writes++; state.record = { ...(state.record || { id: 'fixture-analyzer', ...create }), ...(state.record ? update : {}), updatedAt: new timer.Date(timer.Date.now() + state.version++) }; return state.record; } },
    cachedEvent: { upsert: async ({ where, create }) => { const i = state.rows.findIndex(r => r.logtype === where.logtype_logId.logtype && r.logId === where.logtype_logId.logId); if (i < 0) state.rows.push(create); else state.rows[i] = create; return create; },
      findMany: async ({ where, take } = {}) => state.rows.filter(r => matches(r, where)).sort((a, b) => b.eventTime - a.eventTime).slice(0, take),
      deleteMany: async () => ({ count: 0 }), aggregate: async () => ({ _max: { createdAt: null } }), count: async () => 0 },
    alarmDefinition: { findMany: async ({ where } = {}) => where?.source === 'nms' || where?.code ? [] : state.rules, findFirst: async () => ({ severity: 'ALARM_HIGH', category: 'OPERATIONAL' }), count: async () => 0 },
    alarmEvent: { findFirst: async () => null, findMany: async () => [], count: async () => 0 }, alarmCooldown: { deleteMany: async () => ({ count: 0 }) },
    alarmCheckLog: { create: async ({ data }) => { const row = { id: `fixture-${state.logs.length}`, ...data }; state.logs.push(row); return row; }, count: async () => 0 },
    device: { count: async () => 0 }, nmsHealthMetric: { count: async () => 0 },
    firewallConnector: { findUnique: async () => ({ id: 'fixture-connector', analyzerDeviceId: 'FIXTURE', deviceId: 'fixture-device', vdom: 'root' }) },
    systemConfig: { findUnique: async () => null }, $queryRaw: async () => [],
  };
  attachAlarmLease(prisma, () => state, timer.Date);
  let sequence = 0;
  const queries = new Proxy({}, { get: (_target, key) => load('lib/alarms/queries/index.ts')[key] });
  const load = moduleLoader({ 'next/server': { NextRequest, NextResponse }, zod: require('zod'),
    '@/lib/alarms/queries': queries,
    '@/lib/prisma': { prisma }, '@/lib/logger': { createLogger: () => logger },
    '@/lib/auth/api-permission': { authorizeApiRequest: async () => state.role === 'ADMIN' ? { allowed: true } : { allowed: false, response: NextResponse.json({}, { status: 403 }) } },
    '@/lib/validators': { validateBody: (input, schema) => { const result = schema.safeParse(input); return result.success ? { success: true, data: result.data } : { success: false, error: 'Fixture validation failed' }; } },
    '@/lib/security/tls': { secureFetch: async (_integration, url, options) => {
      const request = JSON.parse(options.body), path = request.params[0].url;
      const call = { url, request, headers: options.headers, signal: options.signal }; state.calls.push(call);
      if (state.hang) return new Promise(() => {});
      const ok = state.httpFailure !== path;
      let payload;
      if (path === '/sys/login/user') payload = request.params[0].data.passwd === session.password
        ? { session: `fixture-session-${++sequence}`, result: [{ status: { code: 0 } }] } : { result: [{ status: { code: -11 } }] };
      else if (path === '/sys/logout') payload = { result: [{ status: { code: 0 } }] };
      else {
        const adom = decodeURIComponent(path.match(/\/adom\/([^/]+)/)?.[1] || 'root');
        const authorized = options.headers.Authorization ? options.headers.Authorization === `Bearer ${state.validKey}` : request.session?.startsWith('fixture-session-');
        const denied = !authorized || !state.allowed.includes(adom) || state.denyPath?.(path) || (state.denyViews && path.startsWith('/fortiview'));
        if (denied) payload = { error: { code: -11, message: state.validKey }, result: { status: { code: -11 } } };
        else if (path.startsWith('/dvmdb/adom/')) payload = { result: [{ status: { code: 0 }, data: state.malformed ? {} : [{ devid: 'FIXTURE', name: adom }] }] };
        else if (path === '/dvmdb/adom') payload = { result: [{ status: { code: 0 }, data: state.allowed.map(name => ({ name })) }] };
        else if (path === '/sys/status') payload = { result: [{ status: { code: 0 }, data: { fixture: adom } }] };
        else if (path.startsWith('/eventmgmt')) payload = { result: { status: { code: 0 }, data: { adom } } };
        else if (request.method === 'add') payload = { result: { tid: ++sequence, status: { code: 0 } } };
        else if (path.startsWith('/fortiview')) payload = { result: { percentage: 100, status: { code: 0 }, data: state.empty ? [] : [{ adom }], 'total-count-all': state.empty ? 0 : 1 } };
        else payload = { result: { percentage: 100, status: { code: 0 }, data: state.empty ? [] : [{ logid: 'fixture-event', eventtime: eventEpoch, devid: 'FIXTURE', vd: 'root', subtype: 'system', action: 'Edit', msg: adom }] } };
      }
      if (state.override?.[path]) payload = state.override[path];
      return { ok, status: ok ? 200 : 503, json: async () => payload };
    } },
    '@/lib/integrations/vmware': {}, '@/lib/integrations/fortigate': {}, '@/lib/firewall/connector-factory': {},
    '@/lib/license/client': { initLicense: async () => {}, isLicenseValid: () => true },
    '@/lib/notifications/email': { getEmailStats: () => ({}), sendAlarmEmail: async () => { throw new Error('Unexpected mail'); } },
    '@/lib/notifications/dlq-worker': { getDLQStats: async () => ({ pending: 0 }), cleanupDLQ: async () => {} },
    '@/lib/alarms/suppression-engine': { createDefaultSuppressionEngine: () => ({ getStats: () => ({}) }) },
    '@/lib/integrations/vmware-health': { checkSavedVMwareHealth: async () => ({ status: 'unknown' }) },
    '@/lib/alarm-scheduler': { getSchedulerStatus: () => ({ running: true }) },
    '@/lib/alarms/alarm-monitor': { getAlarmMonitor: () => ({ getStatus: () => ({ running: true }) }) },
  }, { ...timer, globalThis: root, AbortController, AbortSignal, console: quiet,
    process: { env: { INTEGRATION_CREDENTIALS_KEY: Buffer.alloc(32, 27).toString('base64') } },
    fetch: async () => ({ ok: true, json: async () => ({ poller_alive: false, registered_devices: 0 }) }),
  });
  async function settle(promise) {
    let done = false, result, failure;
    promise.then(value => { result = value; done = true; }, error => { failure = error; done = true; });
    for (let i = 0; !done && i < 200; i++) {
      await timer.flush(); if (done) break;
      const next = [...timer.timers.values()].sort((a, b) => a.due - b.due)[0];
      assert.ok(next, 'Pending source operation must be bounded'); await timer.advance(next.due - timer.Date.now());
    }
    assert.ok(done); if (failure) throw failure; return result;
  }
  const library = load('lib/integrations/fortianalyzer.ts'), route = load('app/api/integrations/fortianalyzer/route.ts');
  const request = (action, config) => new NextRequest('http://fixture.invalid/api/integrations/fortianalyzer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, config }) });
  const post = async (action, config) => { const response = await settle(route.POST(request(action, config))); return { status: response.status, data: await response.json() }; };
  const get = async (query = 'type=status') => { const response = await settle(route.GET(new NextRequest(`http://fixture.invalid/api/integrations/fortianalyzer?${query}`))); return { status: response.status, data: await response.json() }; };
  const setSaved = profile => { state.record = { id: 'fixture-analyzer', enabled: true, updatedAt: new timer.Date(), config: load('lib/security/integration-credentials.ts').protectIntegrationConfig(profile, 'FORTIANALYZER') }; };
  return { state, prisma, load, library, route, post, get, setSaved, settle, timer };
}
const tests = [], test = (name, run) => tests.push([name, run]);
for (const adom of ['root', 'Tenant_A', 'Tenant A']) for (const config of [session, token, { host: token.host, accessToken: token.apiKey }]) {
  const mode = config.password ? 'session' : 'api-key';
  test(`${adom}/${mode}/${config.accessToken ? 'legacy-alias' : 'canonical'} scoped probe and every client data path`, async f => {
    const profile = { ...config, adom };
    assert.equal(await f.settle(f.library.default.testConnection(profile)), true);
    const client = f.library.initSharedFortiAnalyzerService(profile);
    await f.settle(client.getDevices()); await f.settle(client.getStatus()); await f.settle(client.getAdoms());
    const tid = await f.settle(client.startLogSearch('event', 1)); await f.settle(client.fetchLogResults(tid, 0, 1, { requireComplete: true }));
    await f.settle(client.getFortiView('top-sources', 1));
    await f.settle(client.getMitreAttackMatrix()); await f.settle(client.getMitreTechniqueDetails('T1000'));
    const scoped = f.state.calls.filter(c => c.request.params[0].url.includes('/adom/'));
    assert.ok(scoped.length >= 6);
    assert.ok(scoped.every(c => c.request.params[0].url.includes(`/adom/${encodeURIComponent(adom)}/`)));
    if (mode === 'api-key') for (const call of f.state.calls) {
      assert.equal(call.headers.Authorization, `Bearer ${token.apiKey}`); assert.equal(call.request.session, undefined);
      assert.ok(!call.url.includes(token.apiKey)); assert.ok(!JSON.stringify(call.request).includes(token.apiKey));
      assert.ok(!['/sys/login/user', '/sys/logout'].includes(call.request.params[0].url));
    }
    else assert.ok(f.state.calls.some(c => c.request.params[0].url === '/sys/logout'));
  });
}
for (const config of [session, token]) test(`denied selected ADOM cannot pass ${config.password ? 'session' : 'key'} test or fall back to root`, async f => {
  assert.equal(await f.settle(f.library.default.testConnection({ ...config, adom: 'Forbidden' })), false);
  assert.ok(!f.state.calls.some(c => c.request.params[0].url.includes('/adom/root/')));
});
test('wrong key is verified and never downgraded to a saved session password', async f => {
  f.setSaved(session);
  const result = await f.post('test', { ...token, apiKey: 'fixture-wrong', password: session.password });
  assert.equal(result.data.connected, false); assert.ok(!f.state.calls.some(c => c.request.params[0].url === '/sys/login/user'));
});
test('malformed successful ADOM response is rejected and probe session is closed', async f => {
  f.state.malformed = true;
  assert.equal(await f.settle(f.library.default.testConnection(session)), false);
  assert.equal(f.state.calls.filter(c => c.request.params[0].url === '/sys/logout').length, 1);
});
test('HTTP failure cannot validate an otherwise successful ADOM response', async f => {
  f.state.httpFailure = '/dvmdb/adom/root/device'; assert.equal(await f.settle(f.library.default.testConnection(token)), false);
});
test('hung ADOM verification has a deadline and does not return success', async f => {
  f.state.hang = true; assert.equal(await f.settle(f.library.default.testConnection(token)), false);
  assert.equal(f.state.calls[0].signal.aborted, true);
});
test('shared clients are separated by ADOM and auth mode', f => {
  const a = f.library.initSharedFortiAnalyzerService({ ...token, adom: 'Tenant_A' });
  assert.equal(a, f.library.initSharedFortiAnalyzerService({ ...token, adom: 'Tenant_A' }));
  assert.notEqual(a, f.library.initSharedFortiAnalyzerService({ ...token, adom: 'Tenant_B' }));
  assert.notEqual(a, f.library.initSharedFortiAnalyzerService({ ...session, adom: 'Tenant_A' }));
});
for (const key of ['apiKey', 'accessToken']) test(`${key} saves encrypted, returns only presence and reloads exact target`, async f => {
  const result = await f.post('save-config', { host: token.host, [key]: token.apiKey, adom: 'Tenant_A', authMode: 'api-key' });
  assert.equal(result.data.success, true); assert.match(f.state.record.config.apiKey, /^enc:v1:/);
  assert.equal(f.state.record.config.accessToken, undefined); assert.equal(f.state.record.config.password, undefined);
  const read = await f.get('type=config'); assert.equal(read.data.config.apiKeySet, true); assert.equal(read.data.config.adom, 'Tenant_A');
  assert.ok(!JSON.stringify(read.data).includes(token.apiKey)); assert.ok(!JSON.stringify(read.data).includes('enc:v1:'));
  const status = await f.get(); assert.equal(status.data.success, true);
});
for (const secret of ['', '********', undefined]) test(`blank/masked/omitted key retains only same-principal saved secret (${secret})`, async f => {
  f.setSaved({ ...token, adom: 'Tenant_A' });
  const result = await f.post('test', { host: token.host, apiKey: secret, authMode: 'api-key', adom: 'Tenant_B' });
  assert.equal(result.data.connected, true); assert.ok(f.state.calls.every(c => c.headers.Authorization === `Bearer ${token.apiKey}`));
});
for (const config of [{ ...token, host: 'other.fixture.invalid', apiKey: '' }, { ...session, username: 'other', password: '' }, { ...session, password: '', authMode: 'session' }]) {
  test(`changed host/principal/mode cannot borrow a saved key (${config.host}/${config.username || 'key'})`, async f => {
    f.setSaved(token); const result = await f.post('test', { ...config, authMode: config.authMode ?? (config.username ? 'session' : 'api-key') });
    assert.equal(result.data.connected, false); assert.equal(f.state.calls.length, 0);
  });
}
test('switching auth mode removes inactive secrets and explicit session wins', async f => {
  f.setSaved(token); assert.equal((await f.post('save-config', { ...session, authMode: 'session' })).data.success, true);
  assert.equal(f.state.record.config.apiKey, undefined); assert.equal(f.state.record.config.accessToken, undefined); assert.match(f.state.record.config.password, /^enc:v1:/);
  assert.equal((await f.post('test', { ...session, password: 'wrong', authMode: 'session', apiKey: token.apiKey })).data.connected, false);
});
test('conflicting aliases and invalid ADOMs fail before source I/O', async f => {
  for (const config of [{ ...token, accessToken: 'different' }, { ...token, adom: '../root' }, { ...token, adom: '' }, { ...token, adom: '..' }]) {
    assert.equal((await f.post('test', config)).data.connected, false);
  }
  assert.equal(f.state.calls.length, 0);
});
test('configuration revision includes ADOM even without an updatedAt change', f => {
  f.setSaved(token); const revision = f.load('lib/integrations/fortianalyzer-revision.ts').fortiAnalyzerRevision;
  assert.notEqual(revision(f.state.record), revision({ ...f.state.record, config: { ...f.state.record.config, adom: 'Tenant_A' } }));
});
test('MITRE route uses saved ADOM/key and rejects a conflicting override', async f => {
  f.setSaved({ ...token, adom: 'Tenant_A' }); const route = f.load('app/api/integrations/fortianalyzer/mitre/route.ts');
  const response = await f.settle(route.GET(new NextRequest('http://fixture.invalid/api/integrations/fortianalyzer/mitre?type=matrix')));
  assert.equal((await response.json()).success, true);
  const mismatch = await f.settle(route.GET(new NextRequest('http://fixture.invalid/api/integrations/fortianalyzer/mitre?type=matrix&adom=root')));
  assert.equal((await mismatch.json()).success, false);
  assert.ok(!f.state.calls.some(c => c.request.params[0].url.includes('/adom/root/')));
});
test('FortiView HTTP cache cannot cross ADOM revisions', async f => {
  f.setSaved({ ...token, adom: 'Tenant_A' }); const a = await f.get('type=fortiview&view=top-sources');
  assert.equal(a.data.data[0].adom, 'Tenant_A');
  f.setSaved({ ...token, adom: 'Tenant_B' }); const b = await f.get('type=fortiview&view=top-sources');
  assert.equal(b.data.data[0].adom, 'Tenant_B'); assert.equal(b.data.cached, false);
});
test('FortiView permission failure is not cached as successful empty batch', async f => {
  f.setSaved(token); f.state.denyViews = true;
  assert.equal((await f.get('type=fortiview-batch&views=top-sources')).data.success, false);
  f.state.denyViews = false; const recovered = await f.get('type=fortiview-batch&views=top-sources'); assert.equal(recovered.data.success, true); assert.equal(recovered.data.cached, false);
});
test('confirmed completed empty FortiView remains valid', async f => {
  f.setSaved(token); f.state.empty = true; const result = await f.get('type=fortiview&view=top-sources');
  assert.equal(result.data.success, true); assert.equal(result.data.data.length, 0);
});
test('new and legacy key profiles use the same correlation resolver', async f => {
  for (const profile of [token, { host: token.host, accessToken: token.apiKey }]) {
    f.setSaved({ ...profile, adom: 'Tenant_A' });
    const resolved = await f.load('lib/firewall/fortianalyzer-correlation.ts').resolveFirewallAnalyzerService();
    await f.settle(resolved.service.getDevices()); assert.equal(resolved.service.getTarget().adom, 'Tenant_A'); assert.ok(resolved.revision);
  }
});
for (const config of [session, token, { host: token.host, accessToken: token.apiKey }]) test(`real runner/cache/query uses selected non-root ${config.password ? 'session' : 'key'}`, async f => {
  f.setSaved({ ...config, adom: 'Tenant_A' });
  f.state.rules = [{ id: 'fixture-rule', code: 'FIXTURE_FA', name: 'Fixture', source: 'fortianalyzer', enabled: true, severity: 'ALARM_HIGH', category: 'OPERATIONAL', cooldownMinutes: 0,
    detectionLogic: { logtype: 'event', timeWindowMinutes: 5, threshold: 99 } }];
  const result = await f.settle(f.load('lib/alarms/alarm-runner.ts').runAlarmCheck());
  assert.equal(result.success, true); assert.equal(result.summary.errors, 0);
  const calls = f.state.calls.filter(c => c.request.params[0].url.includes('/adom/'));
  assert.ok(calls.length > 10); assert.ok(calls.every(c => c.request.params[0].url.includes('/adom/Tenant_A/')));
});
test('health verifies the saved target rather than the last accessed shared client', async f => {
  f.setSaved({ ...token, adom: 'Tenant_A' }); f.library.initSharedFortiAnalyzerService({ ...session, adom: 'Tenant_B' });
  const response = await f.settle(f.load('app/api/health/route.ts').GET()); const body = await response.json();
  assert.equal(body.datasources.fortianalyzer.status, 'healthy'); assert.equal(body.datasources.fortianalyzer.target.adom, 'Tenant_A');
});
test('failed health caching is limited to the current ADOM revision', async f => {
  f.setSaved({ ...token, adom: 'Forbidden' }); const route = f.load('app/api/health/route.ts');
  assert.equal((await (await f.settle(route.GET())).json()).datasources.fortianalyzer.status, 'unhealthy');
  const count = f.state.calls.length; await f.settle(route.GET()); assert.equal(f.state.calls.length, count);
  f.setSaved({ ...token, adom: 'Tenant_A' });
  const result = (await (await f.settle(route.GET())).json()).datasources.fortianalyzer;
  assert.equal(result.status, 'healthy'); assert.equal(result.target.adom, 'Tenant_A');
});
test('explicit key recovery resets only the matching key and ADOM backoff', async f => {
  f.state.allowed = [];
  const a = f.library.initSharedFortiAnalyzerService({ ...token, adom: 'Tenant_A' });
  const b = f.library.initSharedFortiAnalyzerService({ ...token, adom: 'Tenant_B' });
  assert.equal(await f.settle(a.login()), false); assert.equal(await f.settle(b.login()), false);
  f.state.allowed = ['Tenant_A', 'Tenant_B'];
  f.library.resetFortiAnalyzerLoginBackoff({ ...token, adom: 'Tenant_A' });
  assert.equal(await f.settle(a.login()), true); assert.equal(await f.settle(b.login()), false);
});
test('background collector rebinds when only ADOM changes at the same timestamp', async f => {
  f.setSaved({ ...token, adom: 'Tenant_A' }); const runtime = f.load('lib/alarms/fortianalyzer-cache-runtime.ts');
  const a = await f.settle(runtime.getFortiAnalyzerEventCache()); await f.settle(a.ready);
  const timestamp = f.state.record.updatedAt;
  f.state.record = { ...f.state.record, config: { ...f.state.record.config, adom: 'Tenant_B' } };
  const b = await f.settle(runtime.getFortiAnalyzerEventCache()); await f.settle(b.ready);
  assert.equal(f.state.record.updatedAt, timestamp); assert.notEqual(a.revision, b.revision);
  assert.equal(a.cache.getCacheStatus().stopped, true); assert.equal(b.service.getTarget().adom, 'Tenant_B');
  const rows = await b.cache.queryCachedEvents({ logtype: 'event', startTime: new f.timer.Date(0), endTime: new f.timer.Date() });
  assert.ok(rows.length); assert.ok(rows.every(r => r.msg === 'Tenant_B'));
});
test('legacy key envelope rejects a mismatched encryption key before source access', async f => {
  const crypto = f.load('lib/security/integration-credentials.ts');
  f.state.record = { id: 'fixture-analyzer', enabled: true, updatedAt: new f.timer.Date(), config: crypto.protectIntegrationConfig({ host: token.host, accessToken: token.apiKey }, 'FORTIANALYZER', { INTEGRATION_CREDENTIALS_KEY: Buffer.alloc(32, 29).toString('base64') }) };
  assert.equal((await f.get()).data.success, false); assert.equal(f.state.calls.length, 0);
});
for (const type of ['status', 'adoms', 'devices', 'logsearch']) test(`${type} API permission failures remain failures with a valid API key`, async f => {
  f.setSaved({ ...token, adom: 'Tenant_A' });
  f.state.denyPath = path => type === 'status' ? path === '/sys/status' : type === 'adoms' ? path === '/dvmdb/adom' : type === 'devices' ? path.startsWith('/dvmdb/adom/') : path.startsWith('/logview');
  assert.equal((await f.get(`type=${type}`)).data.success, false);
});
test('outer status errors cannot be hidden by a success-shaped result', async f => {
  f.setSaved(token); f.state.override = { '/sys/status': { error: { code: -3 }, result: [{ status: { code: 0 }, data: {} }] } };
  assert.equal((await f.get()).data.success, false);
});
test('MITRE permission failures are not returned as successful null data', async f => {
  f.setSaved(token); f.state.denyPath = path => path.startsWith('/eventmgmt');
  const route = f.load('app/api/integrations/fortianalyzer/mitre/route.ts');
  const response = await f.settle(route.GET(new NextRequest('http://fixture.invalid/mitre?type=matrix')));
  assert.equal((await response.json()).success, false);
});
test('rejected API-key responses never log provider messages or credential values', async f => {
  f.state.logsForPrivacy = []; f.setSaved(token); f.state.denyViews = true;
  assert.equal((await f.get('type=fortiview&view=top-sources')).data.success, false);
  const logs = JSON.stringify(f.state.logsForPrivacy);
  assert.ok(!logs.includes(token.apiKey)); assert.ok(!logs.includes('enc:v1:'));
});
async function main() { for (const [name, run] of tests) { await run(fixture()); console.log(`PASS ${name}`); }
  console.log(`FortiAnalyzer profile regressions passed (${tests.length} scenarios; synthetic wire/store and actual runtime paths).`); }
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
module.exports = { fixture, session, token };
