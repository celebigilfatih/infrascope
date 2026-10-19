/* eslint-disable @typescript-eslint/no-require-imports -- Real parser, RPC reader and route; synthetic HTTP/DB only. */
const assert = require('node:assert/strict');
const { NextRequest, NextResponse } = require('next/server');
const { moduleLoader } = require('./check-alarm-occurrences.cjs');
const quiet = new Proxy({}, { get: () => () => {} }), now = Date.parse('2026-10-19T12:00:00Z');
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
const state = { allowed: true, calls: [], lookups: [], resolved: [], failed: false, rows: [], total: 0 };
const profiles = ['one', 'two', 'disabled'].map((id, i) => ({ id, type: 'FORTIANALYZER', enabled: id !== 'disabled', updatedAt: new Date(now - 1000), config: { host: `${id}.test.invalid`, adom: i ? 'TEST B' : 'TEST A', username: 'test-reader', password: 'synthetic' } }));
const services = new Map(); let Service;
const load = moduleLoader({ 'next/server': { NextRequest, NextResponse }, '@/lib/prisma': { prisma: { integrationConfig: { findUnique: async ({ where }) => { state.lookups.push(where.id); return profiles.find(row => row.id === where.id) || null; } } } }, '@/lib/logger': { createLogger: () => quiet }, '@/lib/security/tls': {},
  '@/lib/auth/api-permission': { authorizeApiRequest: async (_request, resource, action) => { assert.equal(resource, 'settings'); assert.equal(action, 'read'); return state.allowed ? { allowed: true } : { allowed: false, response: NextResponse.json({}, { status: 403 }) }; } },
  '@/lib/integrations/fortianalyzer-source': { readFortiAnalyzerProfile: config => config },
  '@/lib/integrations/fortianalyzer': { initSharedFortiAnalyzerService: config => {
    state.resolved.push(config);
    if (!services.has(config.host)) { const service = new Service(config); service.session = 'synthetic'; service.fetchRpc = async options => { const rpc = JSON.parse(options.body); state.calls.push({ rpc, signal: options.signal }); if (state.failed) return { json: async () => ({ error: { code: -1, message: 'private-provider-error' } }) }; return { json: async () => rpc.method === 'add' ? { result: { tid: 7 } } : { result: { percentage: 100, data: state.rows, 'total-count-all': state.total } } }; }; services.set(config.host, service); }
    return services.get(config.host);
  } },
}, { Date: FixedDate, AbortController, AbortSignal, console: quiet, setTimeout: (fn, ms) => setTimeout(fn, ms === 5000 ? 0 : ms), clearTimeout });
Service = load('lib/integrations/fortianalyzer.ts').default;
const model = load('lib/security/web-analytics.ts'), route = load('app/api/integrations/fortianalyzer/analytics/route.ts');
const scope = { configId: 'one', adom: 'TEST A', profileUpdatedAt: profiles[0].updatedAt.toISOString(), minutes: 60, ...model.analyticsWindow(60, new Date(now).toISOString()) };
const raw = [{ domain: 'web.test.invalid', catdesc: 'TEST Kategori', bandwidth: '1024', sessions: '0', session_block: '0', traffic_in: '0', browsetime: '3660' }, { catdesc: 'TEST Kategori', bandwidth: '0', sessions: 2, session_block: 1 }, { domain: 'other.test.invalid', bandwidth: 'bad', sessions: -1 }];
function request(extra = {}) { return new NextRequest('http://localhost/api/integrations/fortianalyzer/analytics?' + new URLSearchParams({ configId: 'one', profileUpdatedAt: scope.profileUpdatedAt, view: 'top-websites', minutes: '60', end: scope.end, ...extra })); }
async function main() {
  assert.equal(model.analyticsWindow(15, '2026-10-19T12:00:00.999Z').start, '2026-10-19T11:45:00.000Z');
  for (const minutes of [0, -1, 16, 1500, NaN]) assert.throws(() => model.analyticsWindow(minutes, scope.end));
  const rows = model.normalizeAnalyticsRows(raw, 'top-websites'); assert.equal(rows[0].sessions, 0); assert.equal(rows[1].bytes, 0); assert.equal(rows[2].bytes, null); assert.equal(rows[2].sessions, null); assert.equal(model.analyticsSum(rows, 'bytes'), null); assert.equal(model.analyticsSum([], 'bytes'), 0);
  assert.equal(model.analyticsCategories(rows).find(row => row.name === 'TEST Kategori').bytes, 1024);
  assert.equal(model.analyticsDuration(3660), '1 sa. 1 dk.'); assert.equal(model.analyticsDuration(0), '0 sn.'); assert.equal(model.analyticsBytes(0), '0 B'); assert.equal(model.analyticsBytes(null), 'Bilgi yok'); assert.equal(model.analyticsBytes(1024), '1 KiB');
  for (const bad of ['', '123garbage', '1,000', '-1', Infinity, Number.MAX_SAFE_INTEGER + 1, null]) assert.equal(model.analyticsNumber(bad), null);
  const many = model.normalizeAnalyticsRows(Array.from({ length: 100 }, (_, i) => ({ f_user: 'TEST ' + i, bandwidth: '1' })), 'top-browsing-users'); assert.equal(many[99].name, 'TEST 99');
  assert.equal(model.normalizeAnalyticsRows([{ policyid: 0, counts: '0', count_block: '0' }], 'policy-hits')[0].policyId, '0'); assert.equal(model.normalizeAnalyticsRows([{}], 'top-applications')[0].risk, null);
  let envelope = { success: true, view: 'top-websites', scope, data: raw, totalCount: 300, collectedAt: scope.end };
  assert.equal(model.parseAnalyticsResult(envelope, scope, 'top-websites').rows.length, 3);
  for (const key of Object.keys(scope)) assert.throws(() => model.parseAnalyticsResult({ ...envelope, scope: { ...scope, [key]: 'wrong' } }, scope, 'top-websites'));
  assert.throws(() => model.parseAnalyticsResult({ ...envelope, totalCount: 1 }, scope, 'top-websites')); assert.throws(() => model.normalizeAnalyticsRows(Array(101).fill({}), 'top-websites'));
  state.rows = raw; state.total = 300; let response = await route.GET(request()), body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.scope.configId, 'one'); assert.equal(body.scope.adom, 'TEST A'); assert.equal(body.totalCount, 300); model.parseAnalyticsResult(body, scope, 'top-websites');
  const add = state.calls.find(call => call.rpc.method === 'add'); assert.equal(add.rpc.params[0].url, '/fortiview/adom/TEST%20A/top-websites/run'); assert.deepEqual(add.rpc.params[0]['time-range'], { start: '2026-10-19 11:00:00', end: '2026-10-19 12:00:00' }); assert.equal(add.rpc.params[0].device[0].devid, 'All_FortiGate'); assert.equal(add.rpc.params[0].limit, 100); assert.ok(state.calls.every(call => call.signal));
  response = await route.GET(request({ configId: 'two' })); body = await response.json(); assert.equal(body.scope.adom, 'TEST B'); assert.equal(state.resolved.at(-1).host, 'two.test.invalid');
  const countBefore = state.calls.length;
  for (const extra of [{ minutes: '90' }, { view: 'arbitrary' }, { configId: '' }, { end: 'bad' }, { end: '2026-10-19T13:00:00Z' }]) assert.equal((await route.GET(request(extra))).status, 400);
  assert.equal((await route.GET(request({ configId: 'missing' }))).status, 404); assert.equal((await route.GET(request({ configId: 'disabled' }))).status, 409); assert.equal((await route.GET(request({ profileUpdatedAt: scope.end }))).status, 409); assert.equal(state.calls.length, countBefore);
  state.allowed = false; assert.equal((await route.GET(request())).status, 403); assert.equal(state.calls.length, countBefore); state.allowed = true;
  state.failed = true; response = await route.GET(request()); body = await response.json(); assert.equal(response.status, 503); assert.equal(body.code, 'SOURCE_FAILED'); assert.ok(!JSON.stringify(body).includes('private')); assert.equal(body.data, undefined);
  state.failed = false; state.rows = []; state.total = 0; response = await route.GET(request()); body = await response.json(); assert.equal(body.data.length, 0); assert.equal(body.totalCount, 0);
  for (const invalidRows of [[null], Array(101).fill({})]) { state.rows = invalidRows; state.total = 300; response = await route.GET(request()); assert.equal(response.status, 503); assert.equal((await response.json()).data, undefined); }
  state.rows = []; state.total = 0;
  state.calls = []; await services.get('one.test.invalid').getFortiView('top-websites', 100, undefined, undefined, 60); assert.equal(state.calls[0].rpc.params[0]['time-range'].end, '2026-10-20 12:00:00');
  const cancelled = new AbortController(); cancelled.abort();
  const service = services.get('one.test.invalid'); let logins = 0;
  service.session = null; service.login = async () => { logins++; return true; };
  await assert.rejects(() => service.getFortiView('top-websites', 100, undefined, undefined, 60, { window: scope, signal: cancelled.signal }), error => error.code === 'SOURCE_CANCELLED');
  await assert.rejects(() => service.getFortiView('top-websites', 100, undefined, undefined, 60, { window: { ...scope, start: scope.end }, signal: new AbortController().signal }), error => error.code === 'SOURCE_INVALID_QUERY');
  assert.equal(logins, 0); assert.equal(state.calls.length, 2);
  const duringLogin = new AbortController();
  service.login = async () => { logins++; duringLogin.abort(); service.session = 'shared-session'; return true; };
  await assert.rejects(() => service.getFortiView('top-websites', 100, undefined, undefined, 60, { window: scope, signal: duringLogin.signal }), error => error.code === 'SOURCE_CANCELLED');
  assert.equal(logins, 1); assert.equal(service.session, 'shared-session'); assert.equal(state.calls.length, 2);
  const originalRpc = service.fetchRpc;
  service.fetchRpc = async () => ({ json: async () => ({ result: { tid: -1 } }) });
  assert.equal(await service.getFortiView('top-websites', 100, undefined, undefined, 60, { window: scope, signal: new AbortController().signal }), null);
  const duringBody = new AbortController(); let polls = 0;
  service.fetchRpc = async options => ({ json: async () => { if (JSON.parse(options.body).method === 'add') return { result: { tid: 7 } }; polls++; duringBody.abort(); return { result: { percentage: 100, data: [] } }; } });
  await assert.rejects(() => service.getFortiView('top-websites', 100, undefined, undefined, 60, { window: scope, signal: duringBody.signal }), error => error.code === 'SOURCE_CANCELLED'); assert.equal(polls, 1);
  service.fetchRpc = originalRpc;
  const transport = { failure: null, calls: [] };
  const api = moduleLoader({ axios: { create: () => ({ get: async (...args) => { transport.calls.push(args); if (transport.failure) throw transport.failure; return { data: { success: true } }; } }) } })('lib/api.ts');
  const signal = new AbortController().signal;
  assert.deepEqual(await api.apiGet('/test', { a: 1 }, { timeout: 80, signal }), { success: true });
  assert.equal(transport.calls[0][1].signal, signal); assert.equal(transport.calls[0][1].timeout, 80);
  for (const code of ['PROFILE_CHANGED', 'PROFILE_DISABLED', 'SOURCE_TIMEOUT', 'SOURCE_FAILED']) {
    transport.failure = { response: { status: 409, data: { code, error: 'private-provider-error' } } };
    const failure = await api.apiGet('/test'); assert.equal(failure.code, code); assert.equal(failure.status, 409);
    assert.notEqual(model.analyticsError(failure), model.analyticsError(null)); assert.ok(!model.analyticsError(failure).includes('private'));
  }
  for (const response of [{ status: 401, data: '<html>private</html>' }, { status: 403, data: { code: { invalid: true } } }]) {
    transport.failure = { response }; const failure = await api.apiGet('/test'); assert.equal(failure.success, false); assert.equal(failure.code, undefined); assert.equal(model.analyticsError(failure), model.analyticsError(null));
  }
  console.log('Web analytics passed: exact profile/ADOM and UTC windows without future buffer, authorized read-only route, disabled/version guards, abort-aware RPC, legacy compatibility, zero vs missing metrics, bounded top-100 scope, all users, category totals and safe failures. No source or database calls.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
