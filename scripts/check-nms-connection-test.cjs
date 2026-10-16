/* eslint-disable @typescript-eslint/no-require-imports */
// Real form, result parser and proxy route; all source/database I/O is intercepted.
const assert = require('node:assert/strict');
const { NextRequest, NextResponse } = require('next/server');
const { moduleLoader } = require('./check-alarm-occurrences.cjs');
const load = moduleLoader({});
const form = load('lib/nms/add-device-form.ts');
const initial = { deviceId: 'fixture-device', managementIp: '192.0.2.10', snmpPort: 161, snmpVersion: 'v2c', snmpCommunity: 'fixture-community',
  snmpV3Username: '', snmpV3SecurityLevel: 'authPriv', snmpV3AuthProtocol: 'SHA', snmpV3AuthPassword: '', snmpV3PrivacyProtocol: 'AES', snmpV3PrivacyPassword: '',
  pollingInterval: 300, pollingEnabled: true, sshUsername: '', sshPassword: '', sshPort: 22 };
const plain = value => JSON.parse(JSON.stringify(value));
assert.deepEqual(plain(form.validateAddNmsForm(initial, false)), {});
for (const address of ['192.0.2.1', '2001:db8::1', '::ffff:192.0.2.1']) assert.equal(form.validManagementIp(address), true);
for (const address of ['host.invalid', '192.0.2.999', '192.168.001.1', '::bad::', '']) assert.equal(form.validManagementIp(address), false);
for (const interval of [29, 86401, 1.5]) assert.ok(form.validateAddNmsForm({ ...initial, pollingInterval: interval }, false).pollingInterval);
assert.equal(form.addNmsPayload({ ...initial, pollingEnabled: false, sshPassword: 'unused-fixture' }, false).pollingEnabled, false);
assert.equal(form.addNmsPayload({ ...initial, sshPassword: 'unused-fixture' }, false).sshPassword, null);
assert.deepEqual(Object.keys(form.snmpTestPayload(initial)).sort(), ['deviceId', 'managementIp', 'snmpCommunity', 'snmpPort', 'snmpVersion']);
const v3 = { ...initial, snmpVersion: 'v3', snmpV3Username: 'fixture-user', snmpV3AuthPassword: 'fixture-auth', snmpV3PrivacyPassword: 'fixture-private' };
assert.deepEqual(plain(form.validateAddNmsForm(v3, false)), {});
assert.equal(form.snmpTestPayload(v3).snmpCommunity, undefined);
assert.equal(form.snmpTestPayload({ ...v3, snmpV3SecurityLevel: 'authNoPriv' }).snmpV3PrivacyPassword, undefined);
for (const key of ['deviceId', 'managementIp', 'snmpVersion', 'snmpPort', 'snmpV3AuthPassword']) assert.equal(form.affectsSnmpTest(key), true);
for (const key of ['pollingInterval', 'pollingEnabled', 'sshPassword']) assert.equal(form.affectsSnmpTest(key), false);
const result = { reachable: true, outcome: 'response', checkedAt: '2026-10-16T13:00:00Z', durationMs: 0, systemName: 'Fixture', uptimeSeconds: 0 };
assert.deepEqual(plain(form.parseSnmpTestResult(result)), result);
for (const changes of [{ reachable: 'true' }, { outcome: 'no_response' }, { checkedAt: 'bad' }, { durationMs: -1 }, { durationMs: Infinity }]) assert.equal(form.parseSnmpTestResult({ ...result, ...changes }), null);

async function main() {
  let authorized = true, device = { id: initial.deviceId, nmsDeviceId: null }, finds = 0, upstreamCalls = [], upstreamStatus = 200, upstreamData = result, upstreamThrows = false;
  const route = moduleLoader({
    'node:net': require('node:net'), 'next/server': { NextRequest, NextResponse },
    '@/lib/auth/api-permission': { authorizeApiRequest: async (_request, resource, action) => { assert.equal(resource, 'devices'); assert.equal(action, 'write'); return authorized ? { allowed: true } : { allowed: false, response: NextResponse.json({ error: 'Denied' }, { status: 403 }) }; } },
    '@/lib/prisma': { prisma: { device: { findUnique: async args => { finds++; assert.deepEqual(plain(args.select), { id: true, nmsDeviceId: true }); return device; } } } },
    '@/lib/nms/internal-client': { nmsInternalFetch: async (path, options) => { upstreamCalls.push({ path, options }); if (upstreamThrows) throw Error('fixture-private-upstream-detail'); return { ok: upstreamStatus === 200, status: upstreamStatus, json: async () => upstreamData }; } },
  })('app/api/integrations/nms/test-connection/route.ts');
  const request = body => new NextRequest('http://fixture.invalid/api/integrations/nms/test-connection', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
  authorized = false; assert.equal((await route.POST(request('{'))).status, 403); assert.equal(finds, 0); assert.equal(upstreamCalls.length, 0); authorized = true;
  for (const body of ['{', [], { ...initial, managementIp: 'host.invalid' }, { ...initial, snmpPort: 0 }, { ...initial, snmpVersion: 'v1' }, { ...v3, snmpV3AuthPassword: 'short' }]) assert.equal((await route.POST(request(body))).status, 400);
  assert.equal(upstreamCalls.length, 0);
  device = null; assert.equal((await route.POST(request(initial))).status, 404);
  device = { id: initial.deviceId, nmsDeviceId: 123 }; assert.equal((await route.POST(request(initial))).status, 409); assert.equal(upstreamCalls.length, 0);
  device = { id: initial.deviceId, nmsDeviceId: null };
  for (const body of [initial, v3, { ...v3, snmpV3SecurityLevel: 'authNoPriv' }]) {
    const response = await route.POST(request(body)); assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/);
    assert.deepEqual(await response.json(), { result });
    const call = upstreamCalls.at(-1); assert.equal(call.path, '/test-connection'); assert.equal(call.options.timeoutMs, 10000);
    const sent = JSON.parse(call.options.body); assert.equal(sent.snmpVersion, body.snmpVersion === 'v2c' ? '2c' : '3');
    assert.equal(sent.deviceId, undefined); assert.equal(sent.sshPassword, undefined);
    if (body.snmpVersion === 'v2c') assert.equal(sent.snmpCommunity, 'fixture-community');
    else { assert.equal(sent.snmpV3AuthPassword, 'fixture-auth'); assert.equal(sent.snmpCommunity, undefined); assert.equal(sent.snmpV3PrivacyPassword, body.snmpV3SecurityLevel === 'authPriv' ? 'fixture-private' : undefined); }
  }
  upstreamData = { ...result, reachable: false, outcome: 'no_response', systemName: null, uptimeSeconds: null };
  assert.equal((await route.POST(request(initial))).status, 200);
  upstreamData = {}; assert.equal((await route.POST(request(initial))).status, 502);
  for (const status of [401, 429, 500]) { upstreamStatus = status; const response = await route.POST(request(initial)); assert.equal(response.status, 503); assert.doesNotMatch(JSON.stringify(await response.json()), /fixture-community|fixture-auth|private/); }
  upstreamThrows = true; const failure = await route.POST(request(initial)); assert.equal(failure.status, 503); assert.doesNotMatch(JSON.stringify(await failure.json()), /fixture-private-upstream-detail/);
  console.log('NMS connection test passed: form boundaries, exact v2c/v3 credentials, no SSH fields, stale-result inputs, write authorization before parsing, inventory eligibility, no-store, bounded upstream calls and redacted errors. No real network or database.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
