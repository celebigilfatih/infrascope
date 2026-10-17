/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS regression harness with synchronous VM dependency adapters. */
// Exercise real authorization boundaries with fake session/identity and external I/O.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { NextRequest, NextResponse } = require('next/server');
const { moduleLoader } = require('./check-alarm-occurrences.cjs');
const quiet = new Proxy({}, { get: () => () => {} });
function fixture(role = 'VIEWER') {
  const state = { role, jwtRole: role, valid: true, active: true, exists: true, calls: [], authReads: 0, bodyReads: 0, licensed: true };
  const effect = name => { state.calls.push(name); return null; };
  const config = { id: 'fixture-config', config: { host: 'fixture.invalid', username: 'fixture', password: 'fixture',
    url: 'https://fixture.invalid', authToken: 'fixture', pollingInterval: 5, enabledModules: {} } };
  const table = name => new Proxy({}, { get: (_target, operation) => async () => {
    effect(`${name}.${String(operation)}`);
    if (name === 'integrationConfig' && operation === 'findFirst') return config;
    if (name === 'integrationConfig' && operation === 'findMany') return [config];
    if (name === 'integrationConfig' && operation === 'findUnique') return { ...config, type: 'FORTIGATE' };
    if (name === 'device' && operation === 'findUnique') return { id: 'fixture-device', name: 'Fixture', nmsDeviceId: state.nmsDeviceId === undefined ? 7 : state.nmsDeviceId, snmpVersion: '2c', snmpCommunity: 'protected' };
    if (name === 'device' && operation === 'findFirst') return null;
    if (name === 'organization' && operation === 'findFirst') return { id: 'fixture-org' };
    if (operation === 'findMany') return [];
    if (operation === 'updateMany' || operation === 'deleteMany') return { count: 0 };
    if (operation === 'aggregate') return { _max: { nmsDeviceId: 1 } };
    return { id: 'fixture-id' };
  } });
  const prisma = new Proxy({ user: { findUnique: async () => {
    state.authReads++; if (state.identityError) throw new Error('Fixture identity lookup failed');
    return state.exists ? { id: 'fixture-user', role: state.role, status: state.active ? 'ACTIVE' : 'INACTIVE', name: 'Fixture' } : null;
  } }, $queryRaw: async strings => {
    effect('id:query');
    return strings.join('').includes('pg_advisory_xact_lock') ? [{ locked: 1 }] : [{ nextId: 2n }];
  }, $transaction: async callback => callback(prisma) }, { get: (target, name) => name in target ? target[name] : table(String(name)) });
  class Service {
    static async testConnection() { return new Service().login(); }
    constructor() { effect('client:new'); }
    async login() { effect('client:login'); return true; }
    async authenticate() { effect('client:auth'); this.authenticated = state.sourceAuthenticated !== false; return this.authenticated; }
    async getStatus() { effect('client:status'); return { connected: true }; }
    async testConnection() { effect('client:status'); return { connected: true }; }
    async syncToInventory() { effect('client:sync'); return { success: true, errors: [], hostsCreated: 0, hostsUpdated: 0 }; }
    async collectCapacityMetrics() { effect('client:collect'); return { success: true }; }
    async testEventsAPI() {
      if (!this.authenticated) throw new Error('Events API requires the authenticated REST session');
      effect('client:test-events'); return { success: true };
    }
    async authenticateSOAP() { effect('client:soap-auth'); return true; }
    async queryEventsSOAP() { effect('client:soap-query'); return []; }
    async fetchVMLifecycleEvents() { return []; }
    async fetchSnapshotEvents() { return []; }
    async powerOnVM() { effect('client:power'); return { success: true }; }
    async deleteSnapshot() { effect('client:delete-snapshot'); return { success: true }; }
    async dispose() { effect('client:dispose'); }
  }
  const service = () => new Service();
  const load = moduleLoader({
    'next/server': { NextRequest, NextResponse }, 'zod': require('zod'),
    '@/lib/prisma': { prisma }, '@/lib/logger': { createLogger: () => quiet },
    '@/lib/auth/session': { SESSION_COOKIE_NAME: 'fixture-session', verifySessionToken: async token =>
      state.valid && token === 'valid' ? { userId: 'fixture-user', role: state.jwtRole } : null },
    '@/lib/rate-limit': { getClientIp: () => '127.0.0.1', getRateLimitConfig: () => ({}), isRateLimited: () => ({ limited: false }) },
    '@/lib/license/server-mode': { isLicenseServerMode: () => false },
    '@/lib/license/middleware': { checkLicense: async () => { effect('license:check'); return state.licensed ? null : NextResponse.json({ error: 'Fixture license invalid' }, { status: 403 }); } },
    '@/lib/integrations/fortianalyzer': { __esModule: true, default: Service, initSharedFortiAnalyzerService: service, resetFortiAnalyzerLoginBackoff: () => {} },
    '@/lib/integrations/vmware': { VMwareService: Service }, '@/lib/integrations/zabbix': { ZabbixService: Service },
    '@/lib/integrations/vmware-python': { isVMwarePythonError: () => false, vmwareCollectionErrorMessage: () => 'Fixture collection failure' },
    '@/lib/integrations/fortigate': { FortiGateService: Service },
    '@/lib/firewall/connector-factory': { getFortiGateConnector: async () => { effect('connector:resolve'); return { service: service(), config: config.config, integration: config, target: { key: 'fixture' } }; },
      resolveFortiGateTarget: async () => ({ integration: config, config: config.config, target: { key: 'fixture' } }),
      fortiGateTargetSelectorFromUrl: () => ({}), createEphemeralFortiGateConnector: service, clearFortiGateConnectors: async () => {} },
    '@/lib/security/integration-credentials': { protectIntegrationConfig: value => { effect('credential:protect'); return value; },
      unprotectIntegrationConfig: value => { effect('credential:unprotect'); return value; }, hasIntegrationCredential: () => true, protectNmsCredential: value => { effect('credential:protect'); return value; } },
    '@/lib/validators': { validateBody: value => ({ success: true, data: value }) },
    '@/lib/alarms/alarm-runner': { runAlarmCheck: async options => { effect(options?.sources?.includes('vmware') ? 'alarm:vmware' : 'alarm:run'); return { success: true }; } },
    '@/lib/alarms/detection-engine': { AlarmDetectionEngine: class { async evaluateAllAlarms() { effect('alarm:vmware'); return []; } } },
    '@/lib/nms/internal-client': { nmsInternalFetch: async () => { effect('nms:fetch'); return { ok: true, json: async () => ({ scan_id: 'fixture' }) }; } },
  }, { URL, AbortSignal, process: { env: {} }, console: quiet, fetch: async () => { effect('network'); return { ok: true, json: async () => ({}) }; },
    setTimeout: () => 0, clearTimeout: () => {} });
  const request = (path, method = 'GET', body, authenticated = true) => {
    const req = new NextRequest(`http://localhost${path}`, { method,
      headers: { 'Content-Type': 'application/json', 'x-user-role': 'ADMIN', ...(authenticated ? { cookie: 'fixture-session=valid' } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const json = req.json.bind(req); req.json = async () => { state.bodyReads++; return json(); };
    return req;
  };
  return { state, load, request };
}
const tests = [], test = (name, fn) => tests.push([name, fn]);
for (const path of ['/api/integrations/fortianalyzer', '/api/integrations/vmware', '/api/integrations/zabbix', '/api/integrations/nms/devices']) {
  test(`middleware blocks VIEWER write to ${path}`, async () => {
    const f = fixture(); const response = await f.load('middleware.ts').middleware(f.request(path, 'POST', { action: 'test' }));
    assert.equal(response.status, 403); assert.equal(f.state.calls.length, 0);
  });
}
test('middleware preserves ADMIN integration operations', async () => {
  const f = fixture('ADMIN'); const response = await f.load('middleware.ts').middleware(f.request('/api/integrations/fortianalyzer', 'POST', { action: 'test' }));
  assert.equal(response.headers.get('x-middleware-next'), '1');
});
const context = { params: { id: 'fixture-device', scanId: 'fixture-scan', portName: 'Gi0%2F1' } };
for (const path of ['fortianalyzer', 'fortianalyzer/mitre', 'fortigate', 'vmware', 'zabbix', 'status', 'nms', 'nms/devices', 'nms/devices/[id]',
  'nms/network-devices', 'nms/network-devices/[id]', 'nms/discovery', 'nms/discovery/[scanId]', 'nms/devices/[id]/ports/[portName]', 'nms/devices/[id]/ports/monitored', 'nms/alarms']) {
  test(`anonymous cannot reach integration read ${path}`, async () => {
    const f = fixture('ADMIN'); const response = await f.load(`app/api/integrations/${path}/route.ts`).GET(f.request(`/api/integrations/${path}`, 'GET', undefined, false), context);
    assert.equal(response.status, 401); assert.equal(f.state.calls.length, 0);
  });
}
const mutations = [
  ['fortianalyzer', 'POST', { action: 'test' }, true], ['fortianalyzer', 'POST', { action: 'save-config' }, true],
  ['fortigate', 'POST', { action: 'test' }, true], ['fortigate', 'POST', { action: 'save-config' }, true], ['fortigate', 'POST', { action: 'sync' }, true],
  ['vmware', 'POST', { action: 'test' }, true], ['vmware', 'POST', { action: 'save-config' }, true],
  ['vmware', 'POST', { action: 'sync' }], ['vmware', 'POST', { action: 'vm-power', operation: 'on' }],
  ['vmware', 'POST', { action: 'snapshot-create' }], ['vmware', 'POST', { action: 'snapshot-revert' }], ['vmware', 'POST', { action: 'snapshot-delete' }, true],
  ['vmware', 'POST', { action: 'collect-metrics' }], ['vmware', 'POST', { action: 'test-events-api' }, true], ['vmware', 'POST', { action: 'test-soap-events' }, true],
  ['zabbix', 'POST', { action: 'test' }, true], ['zabbix', 'POST', { action: 'save-config' }, true], ['zabbix', 'POST', { action: 'sync' }],
  ['nms/devices', 'POST', {}], ['nms/devices/[id]', 'PUT', {}], ['nms/devices/[id]', 'DELETE', undefined, true],
  ['nms/network-devices/[id]', 'PUT', {}], ['nms/network-devices/[id]', 'DELETE', undefined, true],
  ['nms/discovery', 'POST', {}], ['nms/discovery/[scanId]/import', 'POST', {}],
  ['nms/devices/[id]/ports/monitored', 'PATCH', {}], ['nms/alarms', 'PATCH', {}],
];
for (const [path, method, body, adminOnly] of mutations) {
  for (const role of ['VIEWER', ...(adminOnly ? ['EDITOR'] : [])]) test(`${role} denied ${method} ${path} ${body?.action || ''} before downstream I/O`, async () => {
    const f = fixture(role), req = f.request(`/api/integrations/${path}`, method, body);
    const response = await f.load(`app/api/integrations/${path}/route.ts`)[method](req, context);
    assert.equal(response.status, 403); assert.equal(f.state.calls.length, 0);
    if (role === 'VIEWER') assert.equal(f.state.bodyReads, 0);
  });
  test(`anonymous denied ${method} ${path} ${body?.action || ''}`, async () => {
    const f = fixture('ADMIN'), req = f.request(`/api/integrations/${path}`, method, body, false);
    const response = await f.load(`app/api/integrations/${path}/route.ts`)[method](req, context);
    assert.equal(response.status, 401); assert.equal(f.state.calls.length, 0); assert.equal(f.state.bodyReads, 0);
  });
}
for (const mode of ['expired', 'inactive', 'deleted', 'downgraded', 'identity-error']) test(`${mode} identity cannot use a stale ADMIN cookie`, async () => {
  const f = fixture('ADMIN');
  if (mode === 'expired') f.state.valid = false;
  if (mode === 'inactive') f.state.active = false;
  if (mode === 'deleted') f.state.exists = false;
  if (mode === 'downgraded') f.state.role = 'VIEWER';
  if (mode === 'identity-error') f.state.identityError = true;
  const response = await f.load('app/api/integrations/vmware/route.ts').POST(f.request('/api/integrations/vmware', 'POST', { action: 'sync' }));
  assert.equal(response.status, mode === 'downgraded' ? 403 : mode === 'identity-error' ? 503 : 401);
  assert.equal(f.state.calls.length, 0); assert.equal(f.state.bodyReads, 0);
});
for (const path of ['check', 'check-vmware']) {
  test(`GET alarm ${path} is 405 with no evaluation`, async () => {
    const f = fixture('ADMIN'); const response = await f.load(`app/api/alarms/${path}/route.ts`).GET(f.request(`/api/alarms/${path}`));
    assert.equal(response.status, 405); assert.equal(response.headers.get('Allow'), 'POST'); assert.equal(f.state.calls.length, 0);
  });
  for (const role of ['VIEWER', 'EDITOR', 'ADMIN']) test(`${role} alarm ${path} POST permission`, async () => {
    const f = fixture(role); const response = await f.load(`app/api/alarms/${path}/route.ts`).POST(f.request(`/api/alarms/${path}`, 'POST'));
    assert.equal(response.status, role === 'VIEWER' ? 403 : 200);
    assert.equal(f.state.calls.includes(path === 'check' ? 'alarm:run' : 'alarm:vmware'), role !== 'VIEWER');
    if (role === 'VIEWER') assert.equal(f.state.calls.length, 0);
  });
}
test('VMware alarm POST retains license enforcement after authorization', async () => {
  const f = fixture('EDITOR'); f.state.licensed = false;
  const response = await f.load('app/api/alarms/check-vmware/route.ts').POST(f.request('/api/alarms/check-vmware', 'POST'));
  assert.equal(response.status, 403); assert.ok(!f.state.calls.includes('alarm:vmware'));
});
for (const type of ['collect-metrics', '%63ollect-metrics', 'test-events-api', 'test-soap-events', 'collect-metrics&type=status']) {
  test(`GET VMware ${type} cannot start an operation`, async () => {
    const f = fixture('ADMIN'); const response = await f.load('app/api/integrations/vmware/route.ts').GET(f.request(`/api/integrations/vmware?type=${type}`));
    assert.equal(response.status, 405); assert.equal(response.headers.get('Allow'), 'POST'); assert.equal(f.state.calls.length, 0);
  });
}
test('HEAD cannot invoke VMware collection', async () => {
  const f = fixture('ADMIN'); const response = await f.load('app/api/integrations/vmware/route.ts').GET(f.request('/api/integrations/vmware?type=collect-metrics', 'HEAD'));
  assert.equal(response.status, 405); assert.equal(f.state.calls.length, 0);
});
test('duplicate JSON action keys use the same parsed action for authorization and execution', async () => {
  const f = fixture('EDITOR'); const req = new NextRequest('http://localhost/api/integrations/vmware', { method: 'POST',
    headers: { cookie: 'fixture-session=valid', 'Content-Type': 'application/json' }, body: '{"action":"sync","action":"save-config"}' });
  const response = await f.load('app/api/integrations/vmware/route.ts').POST(req);
  assert.equal(response.status, 403); assert.equal(f.state.calls.length, 0);
});
for (const action of ['collect-metrics', 'test-events-api', 'test-soap-events']) test(`moved ${action} preserves failed source authentication semantics`, async () => {
  const f = fixture('ADMIN'); f.state.sourceAuthenticated = false;
  const response = await f.load('app/api/integrations/vmware/route.ts').POST(f.request('/api/integrations/vmware', 'POST', { action }));
  assert.equal(response.status, 401);
  assert.ok(!f.state.calls.some(c => ['client:collect', 'client:test-events', 'client:soap-query'].includes(c)));
});
const credentials = { host: 'fixture.invalid', username: 'fixture', password: 'fixture', pollingInterval: 5, enabledModules: {}, url: 'https://fixture.invalid', authToken: 'fixture' };
for (const [path, action, role, expectedCall] of [
  ['fortianalyzer', 'test', 'ADMIN', 'client:login'], ['fortianalyzer', 'save-config', 'ADMIN', 'integrationConfig.upsert'],
  ['vmware', 'test', 'ADMIN', 'client:status'], ['vmware', 'save-config', 'ADMIN', 'integrationConfig.upsert'],
  ['vmware', 'sync', 'EDITOR', 'client:sync'], ['vmware', 'collect-metrics', 'EDITOR', 'client:collect'],
  ['vmware', 'test-events-api', 'ADMIN', 'client:test-events'], ['vmware', 'test-soap-events', 'ADMIN', 'client:soap-query'],
  ['vmware', 'vm-power', 'EDITOR', 'client:power'], ['vmware', 'snapshot-delete', 'ADMIN', 'client:delete-snapshot'],
  ['zabbix', 'test', 'ADMIN', 'client:status'], ['zabbix', 'sync', 'EDITOR', 'client:sync'], ['zabbix', 'save-config', 'ADMIN', 'integrationConfig.upsert'],
  ['fortigate', 'test', 'ADMIN', 'client:status'], ['fortigate', 'sync', 'ADMIN', 'client:sync'], ['fortigate', 'save-config', 'ADMIN', 'integrationConfig.update'],
]) test(`${role} legitimate ${path} ${action} reaches its original operation`, async () => {
  const f = fixture(role); const response = await f.load(`app/api/integrations/${path}/route.ts`).POST(f.request(`/api/integrations/${path}`, 'POST', {
    action, config: credentials, name: 'Fixture', vmId: 'fixture-vm', snapshotId: 'fixture-snapshot', operation: 'on', minutes: 37,
  }));
  assert.equal(response.status, 200); assert.ok(f.state.calls.includes(expectedCall), `${expectedCall}: ${f.state.calls}`);
  if (action === 'test-soap-events') assert.equal((await response.json()).timeWindowMinutes, 37);
});
for (const [path, method, role, body, expectedCall] of [
  ['nms/devices/[id]', 'PUT', 'EDITOR', { pollingEnabled: false }, 'device.update'],
  ['nms/devices/[id]', 'DELETE', 'ADMIN', undefined, 'device.update'],
  ['nms/network-devices/[id]', 'PUT', 'EDITOR', { pollingEnabled: false }, 'network'],
  ['nms/network-devices/[id]', 'DELETE', 'ADMIN', undefined, 'network'],
  ['nms/devices/[id]/ports/monitored', 'PATCH', 'EDITOR', { all: true, monitored: true }, 'nmsInterface.updateMany'],
  ['nms/alarms', 'PATCH', 'EDITOR', { id: 'fixture-event' }, 'alarmEvent.update'],
  ['nms/discovery', 'POST', 'EDITOR', { cidr: '192.0.2.0/30', communities: ['fixture'] }, 'nms:fetch'],
]) test(`${role} permitted ${method} ${path} reaches its existing operation`, async () => {
  const f = fixture(role); const response = await f.load(`app/api/integrations/${path}/route.ts`)[method](f.request(`/api/integrations/${path}`, method, body), context);
  assert.equal(response.status, 200); assert.ok(f.state.calls.includes(expectedCall), expectedCall);
});
test('EDITOR can enable NMS monitoring with explicit credentials', async () => {
  const f = fixture('EDITOR'); f.state.nmsDeviceId = null;
  const response = await f.load('app/api/integrations/nms/devices/route.ts').POST(f.request('/api/integrations/nms/devices', 'POST',
    { deviceId: 'fixture-device', managementIp: '192.0.2.1', snmpVersion: '2c', snmpCommunity: 'fixture' }));
  assert.equal(response.status, 201); assert.ok(f.state.calls.includes('device.update'));
});
for (const path of ['fortianalyzer', 'vmware']) test(`VIEWER retains redacted configuration read ${path}`, async () => {
  const f = fixture('VIEWER'); const response = await f.load(`app/api/integrations/${path}/route.ts`).GET(f.request(`/api/integrations/${path}?type=config`));
  assert.equal(response.status, 200); const result = await response.json();
  assert.notEqual(result.config.password, 'fixture'); assert.ok(!f.state.calls.some(call => call.startsWith('client:')));
});
for (const path of ['/api/integrations/nms/backups', '/api/integrations/nms/devices/fixture/backups', '/api/integrations/nms/discovery', '/api/integrations/vmware']) {
  test(`EDITOR middleware still permits operational POST ${path}`, async () => {
    const f = fixture('EDITOR'); const response = await f.load('middleware.ts').middleware(f.request(path, 'POST', {}));
    assert.equal(response.headers.get('x-middleware-next'), '1');
  });
}
test('UI collection uses POST and VMware sync no longer requires a settings write', async () => {
  const capacity = fs.readFileSync('app/analytics/capacity/page.tsx', 'utf8');
  assert.doesNotMatch(capacity, /vmware\?type=collect-metrics/); assert.match(capacity, /action: 'collect-metrics'/);
  const page = fs.readFileSync('app/integrations/vmware/page.tsx', 'utf8');
  const start = page.indexOf("} else if (action === 'sync')");
  assert.ok(start >= 0, 'The manual sync branch must exist');
  const sync = page.slice(start, page.indexOf('} else {', start));
  assert.doesNotMatch(sync, /action: 'save-config'/); assert.match(sync, /action: 'sync'/);
  const transport = fs.readFileSync('lib/integrations/vmware-workspace.ts', 'utf8');
  assert.match(transport, /method: body \? 'POST' : 'GET'/);
});
(async () => {
  for (const [name, fn] of tests) { await fn(); console.log(`PASS ${name}`); }
  console.log(`Integration permission regressions passed (${tests.length} scenarios; fake external I/O).`);
})().catch(error => { console.error(error); process.exitCode = 1; });
