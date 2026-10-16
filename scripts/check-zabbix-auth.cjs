// Actual Zabbix service/routes; synthetic tokens, ORM and source transport.
const assert = require('node:assert/strict');
const { NextRequest, NextResponse } = require('next/server');
const { moduleLoader } = require('./check-alarm-occurrences.cjs');
const quiet = new Proxy({}, { get: () => () => {} });
const flush = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
const profile = () => ({ integrationId: 'fixture-config', url: 'https://fixture.invalid/zabbix', authToken: 'fixture-valid-token', pollingInterval: 5,
  enabledModules: { hosts: true, interfaces: true, triggers: true, items: true } });
const host = () => ({ hostid: '101', host: 'fixture-host', name: 'Fixture switch', status: '0', inventory_mode: 0, inventory: { vendor: 'Fixture' } });
function fixture(version = '7.2.0') {
  const state = { version, config: profile(), expectedToken: 'fixture-valid-token', calls: [], modes: {}, timers: new Map(),
    hosts: [host()], interfaces: [], triggers: [], probe: [{ hostid: '101' }], devices: new Map(), writes: [], syncLogs: [], updates: [],
    allowed: true, role: 'ADMIN', enabled: true, logs: [] };
  let timerId = 0;
  const prisma = {
    device: {
      findFirst: async ({ where }) => state.devices.get(where.zabbixHostId) || null,
      create: async ({ data }) => { const record = { ...data, id: 'fixture-device-' + (state.devices.size + 1) };
        state.devices.set(data.zabbixHostId, record); state.writes.push(['device:create', data]); return record; },
      update: async ({ where, data }) => { state.writes.push(['device:update', data]); return { ...data, id: where.id }; },
    },
    networkInterface: { upsert: async value => { state.writes.push(['interface', value]); return value.create; } },
    zabbixTrigger: { upsert: async value => { state.writes.push(['trigger', value]); return value.create; } },
    integrationConfig: {
      findMany: async () => state.enabled ? [{ id: 'fixture-config', config: state.config }] : [],
      findFirst: async ({ where }) => where.enabled && !state.enabled ? null : { id: 'fixture-config', config: state.config },
      update: async value => { state.updates.push(value.data); return value.data; },
    },
    integrationSyncLog: { create: async ({ data }) => { state.syncLogs.push(data); return data; } },
    organization: { findFirst: async () => ({ id: 'fixture-org' }) },
    $transaction: async callback => callback(prisma),
  };
  const globals = {
    URL, AbortSignal, AbortController, structuredClone,
    console: { ...quiet, warn: (...args) => state.logs.push(args) },
    setTimeout: callback => { const id = ++timerId; state.timers.set(id, callback); return id; },
    clearTimeout: id => state.timers.delete(id),
    fetch: async (url, options) => {
      const request = JSON.parse(options.body);
      state.calls.push({ url, request, headers: options.headers, signal: options.signal });
      const mode = state.modes[request.method] || {};
      if (mode.hangFetch) return new Promise(() => {});
      if (mode.networkError) throw new Error('Transport echoed fixture-valid-token');
      if (mode.status) return new Response('', { status: mode.status });
      if (mode.hangBody) return { ok: true, json: () => new Promise(() => {}) };
      if (mode.invalidJson) return { ok: true, json: async () => { throw new SyntaxError('fixture-valid-token'); } };
      let reply;
      if (mode.envelope) return new Response(JSON.stringify(typeof mode.envelope === 'function' ? mode.envelope(request) : mode.envelope));
      if (request.method === 'apiinfo.version') {
        assert.equal(options.headers.Authorization, undefined);
        assert.equal(request.auth, undefined);
        assert.deepEqual(request.params, []);
        reply = { result: state.version };
      } else if (request.method === 'user.login' || request.method === 'user.logout') {
        reply = { error: { code: -32602, message: 'Password login is forbidden by fixture' } };
      } else {
        const [major, minor] = String(state.version).split('.').map(Number);
        const modern = major > 6 || (major === 6 && minor >= 4);
        const valid = modern ? options.headers.Authorization === 'Bearer ' + state.expectedToken && request.auth === undefined
          : request.auth === state.expectedToken && options.headers.Authorization === undefined;
        if (!valid || mode.denied) reply = { error: { code: -32602, message: 'Rejected fixture-valid-token', data: 'fixture-valid-token' } };
        else if (request.method === 'host.get') reply = { result: request.params.limit === 1 ? state.probe : state.hosts };
        else if (request.method === 'hostinterface.get') reply = { result: state.interfaces };
        else if (request.method === 'trigger.get') reply = { result: state.triggers };
        else if (request.method === 'hostgroup.get') reply = { result: [] };
        else throw new Error('Unapproved source method ' + request.method);
      }
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, ...reply }));
    },
  };
  const dependencies = {
    '@prisma/client': { ...require('@prisma/client'), PrismaClient: class { constructor() { return prisma; } } },
    'next/server': { NextRequest, NextResponse }, '@/lib/prisma': { prisma },
    '@/lib/auth/api-permission': {
      authorizeApiRequest: async () => state.allowed ? { allowed: true, auth: { role: state.role } }
        : { allowed: false, response: NextResponse.json({ error: 'Denied' }, { status: 401 }) },
      forbiddenApiPermission: () => NextResponse.json({ error: 'Denied' }, { status: 403 }),
    },
    '@/lib/auth/permission-policy': { canAccessSync: role => role === 'ADMIN' },
  };
  const load = moduleLoader(dependencies, globals);
  const Service = load('lib/integrations/zabbix.ts').ZabbixService;
  const service = new Service(state.config);
  const post = (action, config = state.config) => load('app/api/integrations/zabbix/route.ts').POST(new NextRequest('http://fixture.invalid/api/integrations/zabbix', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, config }),
  }));
  return { state, load, service, newService: config => new Service(config || state.config), post,
    get: () => load('app/api/integrations/zabbix/route.ts').GET(new NextRequest('http://fixture.invalid/api/integrations/zabbix')) };
}
const tests = [], test = (name, run) => tests.push([name, run]);
test('repro: valid configured token never depends on password login', async f => {
  assert.equal(await f.service.authenticate(), true);
  assert.deepEqual(f.state.calls.map(c => c.request.method), ['apiinfo.version', 'host.get']);
});
for (const version of ['5.4.12', '6.0.40', '6.2.9', '6.4.0', '6.4.21', '7.0.17', '7.2.5', '7.4.0', '7.4.0rc1']) {
  test(version + ' uses its documented token transport and a protected probe', async () => {
    const f = fixture(version), status = await f.service.getStatus();
    assert.equal(status.connected, true); assert.equal(status.version, version);
    const discovery = f.state.calls[0], probe = f.state.calls[1];
    assert.equal(discovery.headers.Authorization, undefined); assert.equal(discovery.request.auth, undefined);
    assert.deepEqual(probe.request.params, { output: ['hostid'], limit: 1 });
    const [major, minor] = version.split('.').map(Number);
    if (major > 6 || minor >= 4 && major === 6) {
      assert.equal(probe.headers.Authorization, 'Bearer fixture-valid-token'); assert.equal(probe.request.auth, undefined);
    } else { assert.equal(probe.request.auth, 'fixture-valid-token'); assert.equal(probe.headers.Authorization, undefined); }
    assert.ok(!f.state.calls.some(c => /user\.|token\./.test(c.request.method)));
    assert.equal(f.state.timers.size, 0);
  });
}
for (const token of [undefined, null, '', '   ']) test('missing/blank token fails before network access', async f => {
  f.state.config.authToken = token;
  const status = await f.newService().getStatus();
  assert.equal(status.connected, false); assert.equal(status.code, 'ZABBIX_TOKEN_REQUIRED'); assert.equal(f.state.calls.length, 0);
});
test('surrounding paste whitespace is normalized without a password fallback', async f => {
  f.state.config.authToken = ' fixture-valid-token ';
  assert.equal((await f.newService().getStatus()).connected, true);
});
test('embedded token line breaks are rejected before source access', async f => {
  f.state.config.authToken = 'fixture-valid-\ntoken';
  assert.equal((await f.newService().getStatus()).code, 'ZABBIX_CONFIG_INVALID'); assert.equal(f.state.calls.length, 0);
});
for (const version of ['6.0.40', '7.2.5']) test(version + ' invalid/expired token fails without login or encoding fallback', async () => {
  const f = fixture(version); f.state.config.authToken = 'fixture-invalid';
  const status = await f.newService().getStatus();
  assert.equal(status.connected, false); assert.equal(status.code, 'ZABBIX_RPC_ERROR');
  assert.deepEqual(f.state.calls.map(c => c.request.method), ['apiinfo.version', 'host.get']);
  assert.doesNotMatch(JSON.stringify(status), /fixture-valid-token|fixture-invalid/);
});
test('public version success cannot conceal protected method denial', async f => {
  f.state.modes['host.get'] = { denied: true };
  const status = await f.service.getStatus(); assert.equal(status.connected, false); assert.equal(status.version, undefined);
});
test('authorized empty host probe is valid token verification', async f => {
  f.state.probe = []; assert.equal((await f.service.getStatus()).connected, true);
});
for (const probe of [null, false, '0', {}, [{ hostid: 101 }], [{}]]) test('malformed protected read cannot validate a token', async f => {
  f.state.probe = probe; assert.equal((await f.service.getStatus()).code, 'ZABBIX_RESPONSE_INVALID');
});
for (const version of ['not-zabbix', '', '7.2', null, {}, 70200]) test('malformed version cannot select an auth transport', async f => {
  f.state.version = version; const status = await f.service.getStatus();
  assert.equal(status.connected, false); assert.equal(status.code, 'ZABBIX_RESPONSE_INVALID'); assert.equal(f.state.calls.length, 1);
});
test('pre-token versions fail explicitly and never attempt password login', async f => {
  f.state.version = '5.0.40'; assert.equal((await f.service.getStatus()).code, 'ZABBIX_VERSION_UNSUPPORTED'); assert.equal(f.state.calls.length, 1);
});
for (const status of [401, 403, 500, 503]) test('HTTP ' + status + ' cannot become connected status', async f => {
  f.state.modes['host.get'] = { status };
  const result = await f.service.getStatus(); assert.equal(result.connected, false);
  assert.equal(result.code, [401, 403].includes(status) ? 'ZABBIX_ACCESS_DENIED' : 'ZABBIX_HTTP_ERROR');
});
for (const [name, mode] of [
  ['invalid JSON', { invalidJson: true }], ['null envelope', { envelope: () => null }],
  ['missing result', { envelope: r => ({ jsonrpc: '2.0', id: r.id }) }],
  ['wrong request ID', { envelope: r => ({ jsonrpc: '2.0', id: r.id + 1, result: [] }) }],
  ['wrong RPC version', { envelope: r => ({ jsonrpc: '1.0', id: r.id, result: [] }) }],
  ['result plus error', { envelope: r => ({ jsonrpc: '2.0', id: r.id, result: [], error: { message: 'fixture-valid-token' } }) }],
  ['network error', { networkError: true }],
]) test(name + ' fails with sanitized status and logs', async f => {
  f.state.modes['host.get'] = mode; const result = await f.service.getStatus();
  assert.equal(result.connected, false);
  assert.doesNotMatch(JSON.stringify([result, f.state.logs]), /fixture-valid-token/);
});
for (const method of ['apiinfo.version', 'host.get']) for (const phase of ['hangFetch', 'hangBody']) test(method + ' ' + phase + ' is bounded and aborted', async f => {
  f.state.modes[method] = { [phase]: true }; const pending = f.service.getStatus(); await flush();
  assert.equal(f.state.timers.size, 1); const request = f.state.calls.at(-1);
  [...f.state.timers.values()][0](); const status = await pending;
  assert.equal(status.code, 'ZABBIX_TIMEOUT'); assert.equal(request.signal.aborted, true); assert.equal(f.state.timers.size, 0);
});
test('failed verification clears state so subsequent reads cannot borrow the token', async f => {
  assert.equal(await f.service.authenticate(), true);
  f.state.modes['host.get'] = { denied: true }; assert.equal(await f.service.authenticate(), false);
  const count = f.state.calls.length;
  await assert.rejects(f.service.fetchHosts(), e => e.code === 'ZABBIX_NOT_AUTHENTICATED');
  assert.equal(f.state.calls.length, count);
});
test('same instance can recover from a transient verification failure', async f => {
  f.state.modes['host.get'] = { denied: true }; assert.equal(await f.service.authenticate(), false);
  delete f.state.modes['host.get']; assert.equal(await f.service.authenticate(), true);
});
test('repeated verification rechecks revocation rather than trusting stale success', async f => {
  assert.equal(await f.service.authenticate(), true); f.state.expectedToken = 'fixture-rotated';
  assert.equal((await f.service.getStatus()).connected, false);
});
test('simultaneous verification shares one discovery/probe pair', async f => {
  assert.ok((await Promise.all(Array.from({ length: 10 }, () => f.service.authenticate()))).every(Boolean));
  assert.equal(f.state.calls.length, 2);
});
test('configuration is immutable and different instances never share token state', async f => {
  f.state.config.authToken = 'fixture-rotated'; f.state.expectedToken = 'fixture-rotated';
  assert.equal(await f.service.authenticate(), false); assert.equal(await f.newService().authenticate(), true);
});
for (const url of ['https://fixture.invalid', 'https://fixture.invalid/', 'https://fixture.invalid/zabbix///',
  'https://fixture.invalid/zabbix/api_jsonrpc.php', 'https://fixture.invalid/zabbix/api_jsonrpc.php/']) test('frontend/API endpoint normalization: ' + url, async f => {
  f.state.config.url = url; assert.equal(await f.newService().authenticate(), true);
  assert.ok(f.state.calls.every(c => c.url.endsWith('/api_jsonrpc.php') && !c.url.includes('//api_jsonrpc')));
});
for (const url of ['file:///fixture', 'https://reader:fixture-secret@fixture.invalid', 'https://fixture.invalid/?token=fixture', 'not-a-url']) test('invalid endpoint is rejected without source access', async f => {
  f.state.config.url = url; assert.equal((await f.newService().getStatus()).code, 'ZABBIX_CONFIG_INVALID'); assert.equal(f.state.calls.length, 0);
});
test('verified token is retained for all actual inventory read methods', async f => {
  assert.equal(await f.service.authenticate(), true);
  await f.service.fetchHosts(); await f.service.fetchInterfaces(['101']); await f.service.fetchTriggers(); await f.service.fetchHostGroups();
  assert.deepEqual(f.state.calls.slice(2).map(c => c.request.method), ['host.get', 'hostinterface.get', 'trigger.get', 'hostgroup.get']);
  assert.ok(f.state.calls.slice(1).every(c => c.headers.Authorization === 'Bearer fixture-valid-token'));
});
test('post-verification host inventory uses supported query parameters', async f => {
  assert.equal(await f.service.authenticate(), true); await f.service.fetchHosts();
  const params = f.state.calls.at(-1).request.params;
  assert.equal(params.selectInventory, 'extend'); assert.equal(params.selectHosts, undefined);
});
test('sync persists genuine source hosts, interfaces and triggers without user.login', async f => {
  f.state.interfaces = [{ interfaceid: '1', hostid: '101', dns: '', ip: '192.0.2.1', port: '10050', type: 1, main: 1, useip: 1 }];
  f.state.triggers = [{ triggerid: '22', description: 'Fixture trigger', expression: 'fixture', status: '0', value: 0, priority: 2,
    lastchange: 1700000000, comments: '', hosts: [{ hostid: '101', host: 'fixture-host' }] }];
  const result = await f.service.syncToInventory('fixture-org');
  assert.equal(result.success, true); assert.equal(result.hostsCreated, 1); assert.equal(result.interfacesProcessed, 1); assert.equal(result.triggersProcessed, 1);
  assert.deepEqual(f.state.writes.map(w => w[0]), ['device:create', 'interface', 'trigger']);
  assert.ok(!f.state.calls.some(c => c.request.method === 'user.login'));
});
test('invalid token stops sync before any inventory mutation', async f => {
  f.state.expectedToken = 'fixture-other-token';
  const result = await f.service.syncToInventory('fixture-org');
  assert.equal(result.success, false); assert.equal(f.state.writes.length, 0); assert.doesNotMatch(JSON.stringify(result.errors), /fixture-valid-token/);
});
test('POST test verifies the entered token rather than borrowing saved credentials', async f => {
  const response = await f.post('test', { url: profile().url, authToken: 'fixture-invalid' }), result = await response.json();
  assert.equal(response.status, 200); assert.equal(result.connected, false); assert.equal(result.code, 'ZABBIX_RPC_ERROR');
  assert.equal(f.state.writes.length, 0); assert.equal(f.state.updates.length, 0);
});
test('GET status and POST test use the same valid-token verification path', async f => {
  assert.equal((await (await f.get()).json()).connected, true);
  assert.equal((await (await f.post('test')).json()).connected, true);
  assert.deepEqual(f.state.calls.map(c => c.request.method), ['apiinfo.version', 'host.get', 'apiinfo.version', 'host.get']);
});
test('POST sync reaches real service and records success only after token validation', async f => {
  const result = await (await f.post('sync')).json();
  assert.equal(result.success, true); assert.equal(f.state.syncLogs[0].status, 'success'); assert.equal(f.state.updates[0].lastSyncStatus, 'success');
});
test('POST sync token rejection is logged failed without inventory writes or secrets', async f => {
  f.state.expectedToken = 'fixture-other-token'; const result = await (await f.post('sync')).json();
  assert.equal(result.success, false); assert.equal(f.state.writes.length, 0); assert.equal(f.state.syncLogs[0].status, 'failed');
  assert.doesNotMatch(JSON.stringify(f.state.syncLogs), /fixture-valid-token/);
});
for (const mode of ['anonymous-get', 'anonymous-test', 'anonymous-sync', 'editor-test']) test(mode + ' cannot touch the source', async f => {
  if (mode.startsWith('anonymous')) f.state.allowed = false; else f.state.role = 'EDITOR';
  const response = mode.endsWith('get') ? await f.get() : await f.post(mode.endsWith('sync') ? 'sync' : 'test');
  assert.equal(response.status, mode === 'editor-test' ? 403 : 401); assert.equal(f.state.calls.length, 0); assert.equal(f.state.writes.length, 0);
});
test('EDITOR retains the authorized sync operation', async f => {
  f.state.role = 'EDITOR'; assert.equal((await (await f.post('sync')).json()).success, true);
});
test('disabled source returns unconfigured without authenticating', async f => {
  f.state.enabled = false; const result = await (await f.get()).json(); assert.equal(result.connected, false); assert.equal(f.state.calls.length, 0);
});
for (const version of ['6.0.40', '6.4.21', '7.2.5']) test('real loopback JSON-RPC serialization for ' + version, async () => {
  const http = require('node:http'), calls = [];
  const token = 'fixture-wire-token';
  const server = http.createServer(async (request, response) => {
    let raw = ''; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw); calls.push({ body, headers: request.headers, url: request.url });
    let result;
    if (body.method === 'apiinfo.version') {
      if (body.auth !== undefined || request.headers.authorization) throw new Error('Discovery must be anonymous');
      result = version;
    } else {
      const legacy = version.startsWith('6.0');
      const valid = legacy ? body.auth === token && request.headers.authorization === undefined
        : request.headers.authorization === 'Bearer ' + token && body.auth === undefined;
      if (body.method !== 'host.get' || !valid) {
        response.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Rejected' } })); return;
      }
      result = [];
    }
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const load = moduleLoader({ '@prisma/client': { PrismaClient: class {} } }, { fetch, URL, AbortController, AbortSignal, setTimeout, clearTimeout, console: quiet });
    const Service = load('lib/integrations/zabbix.ts').ZabbixService;
    const service = new Service({ ...profile(), url: 'http://127.0.0.1:' + server.address().port + '/zabbix/', authToken: token });
    assert.equal((await service.getStatus()).connected, true);
    assert.deepEqual(calls.map(c => c.body.method), ['apiinfo.version', 'host.get']);
    assert.ok(calls.every(c => c.url === '/zabbix/api_jsonrpc.php'));
    const invalid = new Service({ ...profile(), url: 'http://127.0.0.1:' + server.address().port + '/zabbix/', authToken: 'fixture-invalid' });
    const failed = await invalid.getStatus();
    assert.equal(failed.connected, false); assert.equal(failed.code, 'ZABBIX_RPC_ERROR');
    assert.deepEqual(calls.map(c => c.body.method), ['apiinfo.version', 'host.get', 'apiinfo.version', 'host.get']);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
async function main() {
  for (const [name, run] of tests) { await run(fixture()); console.log('PASS ' + name); }
  console.log('Zabbix token regressions passed (' + tests.length + ' scenarios; synthetic source/ORM plus loopback-only HTTP).');
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
