/* eslint-disable @typescript-eslint/no-require-imports -- Actual model, service, target factory and route; synthetic persistence and transport only. */
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const { fixture } = require('./check-fortigate-snmp.cjs');
const f = fixture(), model = f.load('lib/security/policies.ts'), route = f.load('app/api/firewall-policies/workspace/route.ts');
const scope = { configId: 'config-a', vdom: 'root', host: 'a.invalid' };
const request = extra => new NextRequest('http://localhost/api/firewall-policies/workspace?' + new URLSearchParams({ configId: scope.configId, vdom: scope.vdom, expectedHost: scope.host, ...extra }));
const raw = [
  { policyid: 200, name: 'TEST Web', action: 'accept', status: 'disable', srcintf: [{ name: 'lan' }], dstintf: [{ name: 'wan1' }], srcaddr: [{ name: 'TEST Clients' }], dstaddr: [{ name: 'all' }], service: [{ name: 'HTTPS' }, { name: 'DNS' }, { name: 'HTTP' }], hit_count: '9007199254740993', last_used: '2026-10-19T10:00:00+03:00', schedule: 'always', nat: 'enable', logtraffic: 'all', comments: 'TEST explanation' },
  { policyid: 0, action: 'deny', srcintf: [], dstintf: [], srcaddr: [], dstaddr: [], service: [], hit_count: 0 },
  { policyid: 5, dstaddr: [{ name: 'TEST server' }], hit_count: Number.MAX_SAFE_INTEGER + 1, last_used: '2026-10-19 10:00:00' },
];
async function main() {
  let rows = model.normalizeSecurityPolicies(raw);
  assert.equal(rows[0].policyId, 200); assert.equal(rows[1].policyId, 0); assert.equal(rows[2].position, 3); assert.equal(rows[0].enabled, false); assert.equal(rows[1].enabled, null); assert.equal(rows[2].sourceAddresses, null); assert.equal(rows[1].sourceAddresses.length, 0); assert.equal(rows[0].hitCount, '9007199254740993'); assert.equal(rows[1].hitCount, '0'); assert.equal(rows[2].hitCount, null); assert.equal(rows[0].lastUsedAt, '2026-10-19T07:00:00.000Z'); assert.equal(rows[2].lastUsedAt, null); assert.equal(rows[0].comment, 'TEST explanation'); assert.equal(rows[0].nat, true); assert.equal(rows[1].nat, null);
  assert.equal(model.policyCounterLabel('9007199254740993'), '9.007.199.254.740.993'); assert.equal(model.policyCounterLabel(null), 'Bilgi yok');
  for (const value of [undefined, null, '', '-1', '1.2', '1e9', '01', ' 1', Infinity, -1, Number.MAX_SAFE_INTEGER + 1]) assert.equal(model.policyCounter(value), null);
  for (const value of ['2026-02-30T12:00:00Z', '2026-10-19 10:00:00', '2026-10-19T10:00:00', 'not-a-date', 123]) assert.equal(model.policyDate(value), null);
  for (const value of [null, {}, [null], [{}], [{ policyid: -1 }], [raw[0], raw[0]]]) assert.throws(() => model.normalizeSecurityPolicies(value));
  assert.equal(model.policyNameLabel('all', 'addresses'), 'Tüm adresler (all)'); assert.equal(model.policyNameLabel('all', 'services'), 'all'); assert.equal(model.policyScheduleLabel('always'), 'Her zaman');
  let envelope = { success: true, source: 'fortigate-rest', target: scope, collectedAt: new Date(f.state.now).toISOString(), data: rows };
  assert.equal(model.parsePolicySnapshot(envelope, scope).rows.length, 3);
  for (const key of Object.keys(scope)) assert.throws(() => model.parsePolicySnapshot({ ...envelope, target: { ...scope, [key]: 'WRONG' } }, scope));
  for (const data of [null, [{ ...rows[0], position: 2 }], [{ ...rows[0], enabled: 'enable' }], [{ ...rows[0], hitCount: -1 }], [{ ...rows[0], services: [''] }], [rows[0], { ...rows[0], position: 2 }]]) assert.throws(() => model.parsePolicySnapshot({ ...envelope, data }, scope));
  assert.throws(() => model.parsePolicySnapshot({ ...envelope, collectedAt: new Date(f.state.now + 60000).toISOString() }, scope));
  for (const extra of [{ configId: '' }, { vdom: '' }, { expectedHost: '' }]) assert.equal((await route.GET(request(extra))).status, 400);
  f.state.allowed = false; const before = f.state.transport.length; assert.equal((await route.GET(request())).status, 403); assert.equal(f.state.transport.length, before); f.state.allowed = true;
  // Real mode/module checks occur before any synthetic HTTP request.
  assert.equal((await route.GET(request())).status, 409); assert.equal(f.state.transport.length, before);
  f.state.configs[0].config.syncMode = 'rest'; f.state.configs[0].config.enabledModules.policies = true;
  let response = await route.GET(request()), body = await response.json(); assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/); assert.equal(model.parsePolicySnapshot(body, scope).rows.length, 0); assert.equal(f.state.transport.at(-1).url, 'https://a.invalid/api/v2/cmdb/firewall/policy?vdom=root');
  const service = (await f.connector('config-a')).service, calls = [];
  service.apiRequest = async endpoint => { calls.push(endpoint); return { results: raw }; };
  response = await route.GET(request()); body = await response.json(); assert.equal(response.status, 200); rows = model.parsePolicySnapshot(body, scope).rows; assert.equal(rows[0].comment, 'TEST explanation'); assert.equal(rows[0].nat, true); assert.equal(rows[0].logging, 'all'); assert.equal(rows[0].services.length, 3); assert.equal(rows[0].hitCount, '9007199254740993');
  const sourceCalls = calls.length;
  assert.equal((await route.GET(request({ expectedHost: 'wrong.invalid' }))).status, 409); assert.equal(calls.length, sourceCalls);
  f.state.configs[0].enabled = false; assert.equal((await route.GET(request())).status, 409); assert.equal(calls.length, sourceCalls); f.state.configs[0].enabled = true;
  assert.equal((await route.GET(request({ configId: 'missing' }))).status, 404);
  const factory = f.load('lib/firewall/connector-factory.ts'); const other = await factory.getFortiGateConnector({ configId: 'config-a', vdom: 'TEST-B' });
  response = await route.GET(request({ vdom: 'TEST-B' })); body = await response.json(); assert.equal(response.status, 200); assert.equal(body.target.vdom, 'TEST-B'); assert.equal(f.state.transport.at(-1).url, 'https://a.invalid/api/v2/cmdb/firewall/policy?vdom=TEST-B'); assert.notEqual(other.service, service);
  service.apiRequest = async () => { throw Error('private-provider-message'); };
  response = await route.GET(request()); body = await response.json(); assert.equal(body.success, false); assert.ok(!JSON.stringify(body).includes('private-provider')); assert.equal(body.data, undefined);
  service.apiRequest = async () => ({}); assert.equal((await route.GET(request())).status, 502);
  service.apiRequest = async () => ({ results: [{ policyid: 42 }] });
  await assert.rejects(service.fetchFirewallPolicies({ requireEnabled: true }), error => error.code === 'INVALID_RESPONSE');
  response = await route.GET(request()); body = await response.json(); assert.equal(response.status, 200);
  const unknown = model.parsePolicySnapshot(body, scope).rows[0]; assert.equal(unknown.policyId, 42); assert.equal(unknown.destinationAddresses, null); assert.equal(unknown.sourceAddresses, null); assert.equal(unknown.services, null); assert.equal(unknown.enabled, null);
  for (const malformed of [undefined, null, {}, [null], ['invalid'], [{}]]) {
    service.apiRequest = async () => ({ results: malformed }); assert.equal((await route.GET(request())).status, 502);
  }
  service.apiRequest = async () => ({ results: [{ policyid: 1, dstaddr: [] }, { policyid: 1, dstaddr: [] }] }); assert.equal((await route.GET(request())).status, 502);
  const g = fixture(); g.state.configs[0].config.enabledModules.policies = true; assert.equal((await g.load('app/api/firewall-policies/workspace/route.ts').GET(request())).status, 501); assert.equal(g.state.transport.length, 0);
  assert.equal(f.state.writes.length, 0); assert.equal(f.state.inventory.length, 0); assert.equal(f.state.configUpdates.length, 0);
  console.log('Security policy checks passed: real strict source reader and scoped route/factory, optional detail fields, missing vs zero/empty/disabled, precise counters, explicit-zone dates, source order vs rule ID, authorization, disabled/module/SNMP gates, host guard, VDOM separation, safe failures and no persistence or writes.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
