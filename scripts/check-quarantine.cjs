/* eslint-disable @typescript-eslint/no-require-imports -- Real model, service, route and audit with isolated I/O. */
const assert = require('node:assert/strict');
const { NextRequest, NextResponse } = require('next/server');
const { moduleLoader } = require('./check-alarm-occurrences.cjs');
const quiet = new Proxy({}, { get: () => () => {} });
const state = { actor: { role: 'ADMIN', actor: { id: 'test-admin', name: 'TEST' } }, read: true, calls: [], audits: [], rows: [], auditFailure: '', host: 'a.test.invalid' };
const env = { FORTIGATE_LEGACY_WRITES_ENABLED: 'true' };
let service;
class ConnectorError extends Error { constructor(code, message, status) { super(message); this.code = code; this.status = status; } }
const load = moduleLoader({ 'next/server': { NextRequest, NextResponse },
  '@/lib/logger': { createLogger: () => quiet }, https: {}, querystring: require('node:querystring'), '@/lib/security/tls': {},
  '@/lib/auth/request-actor': { getRequestActor: async () => state.actor },
  '@/lib/auth/api-permission': { authorizeApiRequest: async (_req, resource, action) => { assert.equal(resource, 'firewall'); assert.equal(action, 'read'); return state.read ? { allowed: true } : { allowed: false, response: NextResponse.json({ success: false }, { status: 403 }) }; } },
  '@/lib/prisma': { prisma: { auditLog: { create: async ({ data }) => { if (state.auditFailure === 'reserve' || state.auditFailure === 'outcome' && data.details.phase !== 'RESERVED') throw Error('Private audit error'); state.audits.push(data); return { id: 'audit-' + state.audits.length }; } } } },
  '@/lib/firewall/connector-factory': { FortiGateConnectorError: ConnectorError, fortiGateTargetSelectorFromUrl: url => { const q = new URL(url).searchParams; return { configId: q.get('configId'), vdom: q.get('vdom') }; }, getFortiGateConnector: async selector => { state.calls.push({ selector }); return { service, target: { configId: selector.configId, vdom: selector.vdom, host: state.host, key: selector.configId + ':' + selector.vdom } }; } },
}, { process: { env }, console: quiet });
const model = load('lib/security/quarantine.ts'), Service = load('lib/integrations/fortigate.ts').default;
service = new Service({ host: 'a.test.invalid', accessToken: 'synthetic', vdom: 'TEST-A' });
service.apiRequest = async (endpoint, method, body) => { state.calls.push({ endpoint, method, body }); if (endpoint === '/monitor/user/banned') return { results: state.rows }; return {}; };
const route = load('app/api/security/quarantine/route.ts');
const scope = { configId: 'config-a', vdom: 'TEST-A', host: 'a.test.invalid' };
const request = (method = 'GET', body, extra = {}) => new NextRequest('http://localhost/api/security/quarantine?' + new URLSearchParams({ configId: scope.configId, vdom: scope.vdom, expectedHost: scope.host, ...extra }), { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
async function main() {
  for (const ip of ['192.0.2.0', '255.255.255.255', '::1', '2001:db8::10', '::ffff:192.0.2.10']) assert.equal(model.quarantineIpValid(ip), true, ip);
  for (const ip of ['', '256.0.0.1', '01.2.3.4', '192.0.2.1/24', '::gg', '::1%eth0', '::1/64', '::1]/path?x=[', '::1]:80/#[', '192.0.2.1 ', null]) assert.equal(model.quarantineIpValid(ip), false, String(ip));
  const now = Date.now();
  state.rows = [{ ip_address: '192.0.2.10', created: now / 1000 - 60, expires: now / 1000 + 600, source: 'ips', comment: 'TEST reason', vd: 'TEST-A' }, { ip_v6_address: '2001:db8::10', expires: 0 }];
  let rows = await service.fetchQuarantinedIPs();
  assert.equal(rows[0].comment, 'TEST reason'); assert.equal(rows[1].source, ''); assert.equal(rows[1].vdom, ''); assert.equal(rows[1].status, ''); assert.equal(rows[1].expires, null); assert.equal(model.quarantineExpiry(rows[1]), 'unknown');
  assert.equal(model.quarantineRemaining({ expires: new Date(now + 45000).toISOString() }, now), '1 dakika kaldı');
  assert.equal(model.quarantineExpiry({ expires: new Date(now - 1).toISOString() }, now), 'expired'); assert.equal(model.quarantineExpiry({ expires: new Date(now + 86400001).toISOString() }, now), 'scheduled');
  assert.equal(model.quarantineSource(''), 'Kaynak bilgisi yok'); assert.equal(model.quarantineSource('manual'), 'Elle eklenen');
  assert.equal(model.quarantineHasIp([{ ip: '2001:db8::a' }], '2001:0DB8:0000:0000:0000:0000:0000:000a'), true);
  assert.equal(model.quarantineHasIp([{ ip: '::ffff:c000:20a' }], '::ffff:192.0.2.10'), true);
  assert.equal(model.quarantineHasIp([{ ip: '192.0.2.10' }], '192.0.2.11'), false);
  for (const age of [0, 119999, -5000]) assert.equal(model.quarantineFresh(new Date(now - age).toISOString(), now), true);
  for (const age of [120000, 150000, -5001]) assert.equal(model.quarantineFresh(new Date(now - age).toISOString(), now), false);
  assert.equal(model.quarantineFresh('invalid', now), false);
  for (const raw of [undefined, {}, [{ comment: 'no-ip' }], [{ ip_address: 'bad' }]]) assert.throws(() => model.normalizeQuarantine(raw));
  for (const expires of [undefined, null, -1, 0, 'bad', 1e100]) assert.equal(model.normalizeQuarantine([{ ip_address: '192.0.2.1', expires }])[0].expires, null);
  let response = await route.GET(request()), body = await response.json(); assert.equal(response.status, 200); assert.equal(body.writeAccess.allowed, true); assert.equal(model.parseQuarantineResult(body, scope).rows.length, 2); assert.match(response.headers.get('cache-control'), /no-store/);
  for (const change of [{ target: { ...body.target, vdom: 'WRONG' } }, { target: { ...body.target, configId: 'WRONG' } }, { target: { ...body.target, host: 'WRONG' } }, { collectedAt: new Date(Date.now() + 60000).toISOString() }, { data: null }]) assert.throws(() => model.parseQuarantineResult({ ...body, ...change }, scope));
  state.rows.push({ ip_address: '192.0.2.55', vd: 'WRONG' }); assert.equal((await route.GET(request())).status, 502); state.rows.pop();
  state.read = false; let before = state.calls.length; assert.equal((await route.GET(request())).status, 403); assert.equal(state.calls.length, before); state.read = true;
  env.FORTIGATE_LEGACY_WRITES_ENABLED = 'false'; body = await (await route.GET(request())).json(); assert.equal(body.writeAccess.allowed, false); assert.equal(body.data.length, 2);
  before = state.calls.length; assert.equal((await route.POST(request('POST', { ip: '192.0.2.20' }))).status, 503); assert.equal((await route.DELETE(request('DELETE', undefined, { ip: '192.0.2.20' }))).status, 503); assert.equal(state.calls.length, before);
  env.FORTIGATE_LEGACY_WRITES_ENABLED = 'true'; state.actor.role = 'VIEWER'; assert.equal((await route.DELETE(request('DELETE', undefined, { ip: '192.0.2.20' }))).status, 403); state.actor.role = 'ADMIN';
  state.actor = null; assert.equal((await route.POST(request('POST', { ip: '192.0.2.20' }))).status, 401); state.actor = { role: 'ADMIN', actor: { id: 'test-admin' } };
  for (const input of [null, {}, { ip: 'bad' }, { ip: '192.0.2.20', expiry_hours: -1 }, { ip: '192.0.2.20', expiry_hours: 0.5 }, { ip: '192.0.2.20', expiry_hours: '24' }, { ip: '192.0.2.20', expiry_hours: 8761 }, { ip: '192.0.2.20', comment: 123 }]) assert.equal((await route.POST(request('POST', input))).status, 400);
  assert.equal((await route.DELETE(request('DELETE', undefined, { ip: 'bad' }))).status, 400);
  state.host = 'changed.test.invalid'; assert.equal((await route.POST(request('POST', { ip: '192.0.2.20' }))).status, 409); assert.equal((await route.DELETE(request('DELETE', undefined, { ip: '192.0.2.20' }))).status, 409); state.host = scope.host;
  state.auditFailure = 'reserve'; before = state.calls.filter(c => c.method === 'POST').length; assert.equal((await route.DELETE(request('DELETE', undefined, { ip: '192.0.2.20' }))).status, 503); assert.equal(state.calls.filter(c => c.method === 'POST').length, before); state.auditFailure = '';
  assert.equal((await route.POST(request('POST', { ip: '192.0.2.20', expiry_hours: 24, comment: 'TEST' }))).status, 200); let call = state.calls.at(-1); assert.equal(call.endpoint, '/monitor/user/banned/add_users'); assert.equal(call.body.expiry, 86400); assert.equal(state.audits.at(-1).details.phase, 'SUCCEEDED'); assert.equal(state.audits.at(-1).details.targetKey, 'config-a:TEST-A');
  assert.equal((await route.DELETE(request('DELETE', undefined, { ip: '2001:db8::10' }))).status, 200); call = state.calls.at(-1); assert.equal(call.endpoint, '/monitor/user/banned/clear_users'); assert.equal(call.body.ip_addresses[0], '2001:db8::10');
  state.auditFailure = 'outcome'; response = await route.DELETE(request('DELETE', undefined, { ip: '192.0.2.20' })); assert.equal(response.status, 503); assert.equal((await response.json()).code, 'AUDIT_UNAVAILABLE'); state.auditFailure = '';
  state.rows = []; body = await (await route.GET(request())).json(); assert.equal(model.parseQuarantineResult(body, scope).rows.length, 0);
  state.rows = undefined; response = await route.GET(request()); assert.equal(response.status, 502); body = await response.json(); assert.equal(body.success, false); assert.ok(!JSON.stringify(body).includes('Private'));
  const transport = { calls: [], fail: false };
  const api = moduleLoader({ axios: { create: () => ({ delete: async (...args) => { transport.calls.push(args); if (transport.fail) throw Error('timeout'); return { data: { success: true } }; } }) } })('lib/api.ts');
  assert.equal((await api.apiDelete('/quarantine', { timeout: 60000 })).success, true); assert.equal(transport.calls[0][1].timeout, 60000);
  transport.fail = true; assert.equal((await api.apiDelete('/quarantine', { timeout: 60000 })).success, false);
  console.log('Quarantine checks passed: real source normalization, IPv4/IPv6, unknown expiry/source, exact device/VDOM/host, stale target, read authorization, disabled/admin write gates, validation, audit reservation/outcome and scoped add/remove. Isolated transport and DB only.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
