// Actual NMS enable/discovery/firewall routes and allocator. Synthetic source/auth/ORM only.
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS fixture runner. */
const assert = require('node:assert/strict');
const { NextRequest, NextResponse } = require('next/server');
const { moduleLoader } = require('./check-alarm-occurrences.cjs');
const quiet = new Proxy({}, { get: () => () => {} });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function fixture(options = {}) {
  const state = { devices: [], discovered: [], integrations: [], connectors: [], events: [], probes: [], allocations: [],
    allowed: true, role: 'ADMIN', txOptions: [], lockAttempts: 0, sequence: 0, created: [], isolations: [], committedConnectors: new Set() };
  const prefix = options.prefix || 'b17-fixture';
  const pick = (row, select) => row && select ? Object.fromEntries(Object.keys(select).filter(k => select[k]).map(k => [k, row[k]])) : row;
  const matches = (row, where) => !where || Object.entries(where).every(([key, value]) => key === 'NOT' ? !matches(row, value)
    : value && typeof value === 'object' && 'not' in value ? row[key] !== value.not : row[key] === value);
  let tail = Promise.resolve();
  const memory = {};
  for (const [model, collection] of [['device', 'devices'], ['nmsDiscoveredDevice', 'discovered'], ['integrationConfig', 'integrations'], ['firewallConnector', 'connectors']]) {
    memory[model] = {
      findUnique: async ({ where, select }) => pick(state[collection].find(r => matches(r, where)) || null, select),
      findFirst: async ({ where, select } = {}) => pick(state[collection].find(r => matches(r, where)) || null, select),
      findMany: async ({ where, select } = {}) => state[collection].filter(r => matches(r, where)).map(r => pick(r, select)),
      count: async () => state[collection].length,
      create: async ({ data, select }) => {
        if (model === 'device' && data.nmsDeviceId != null && state.devices.some(r => r.nmsDeviceId === data.nmsDeviceId)) throw new Error('Fixture duplicate NMS ID');
        const row = { id: `${prefix}-${++state.sequence}`, ...data }; state[collection].push(row); return pick(row, select);
      },
      update: async ({ where, data, select }) => {
        const row = state[collection].find(r => matches(r, where)); if (!row) throw new Error('Fixture missing row');
        if (model === 'device' && data.nmsDeviceId != null && state.devices.some(r => r.id !== row.id && r.nmsDeviceId === data.nmsDeviceId)) throw new Error('Fixture duplicate NMS ID');
        Object.assign(row, data); return pick(row, select);
      },
    };
  }
  memory.$queryRaw = async strings => strings.join('').includes('pg_advisory_xact_lock') ? []
    : [{ nextId: BigInt(Math.max(0, ...state.devices.map(r => r.nmsDeviceId || 0)) + 1) }];
  memory.$transaction = async callback => {
    const prior = tail, gate = deferred(); tail = gate.promise; await prior;
    const snapshot = structuredClone({ devices: state.devices, discovered: state.discovered, integrations: state.integrations, connectors: state.connectors });
    try { return await callback(memory); } catch (error) { Object.assign(state, snapshot); throw error; } finally { gate.resolve(); }
  };
  const database = options.database || memory;
  const wrap = (model, table, local) => new Proxy(table, { get: (target, operation) => {
    const value = target[operation]; if (typeof value !== 'function') return value;
    return async (...args) => {
      state.events.push(`${local ? 'tx' : 'root'}:${model}:${String(operation)}`);
      const writesNmsId = model === 'device' && ['create', 'update'].includes(operation) && args[0].data.nmsDeviceId != null;
      if (local && (writesNmsId || ['findUnique', 'findFirst'].includes(operation) && ['device', 'nmsDiscoveredDevice'].includes(model))) {
        assert.equal(local.locked, true, 'Eligibility and NMS ID writes must occur after the common lock');
      }
      if (state.failOnce === `${model}:${String(operation)}`) { state.failOnce = null; throw new Error('Fixture write failure'); }
      const result = await value.apply(target, args);
      if (operation === 'create') state.created.push({ model, id: result.id });
      if (writesNmsId) state.allocations.push({ deviceId: result.id, nmsDeviceId: args[0].data.nmsDeviceId });
      return result;
    };
  } });
  const prisma = Object.fromEntries(['device', 'nmsDiscoveredDevice', 'integrationConfig', 'firewallConnector'].map(model => [model, wrap(model, database[model])]));
  prisma.$transaction = async (callback, txOptions) => {
    state.txOptions.push(txOptions); assert.equal(txOptions?.isolationLevel, 'ReadCommitted');
    state.events.push('transaction:start');
    try {
      const result = await database.$transaction(async raw => {
        if (options.database) state.isolations.push((await raw.$queryRawUnsafe('SHOW transaction_isolation'))[0].transaction_isolation);
        const local = { locked: false }, tx = Object.fromEntries(['device', 'nmsDiscoveredDevice', 'integrationConfig', 'firewallConnector'].map(model => [model, wrap(model, raw[model], local)]));
        tx.$queryRaw = async (...args) => {
          const sql = args[0].join('');
          if (sql.includes('pg_advisory_xact_lock')) {
            assert.equal(args[1], 2147380047, 'Every writer must use the existing advisory key');
            state.lockAttempts++; state.events.push('lock:requested');
            state.onLockAttempt?.();
            if (state.barrier) {
              if (state.lockAttempts === state.barrier.expected) state.barrier.gate.resolve();
              await state.barrier.gate.promise;
            }
            const rows = await raw.$queryRaw(...args); local.locked = true; state.events.push('lock:acquired'); return rows;
          }
          assert.equal(local.locked, true); state.events.push('id:read');
          return raw.$queryRaw(...args);
        };
        const result = await callback(tx);
        if (state.failCommit) throw new Error('Fixture transaction failure');
        return result;
      }, txOptions);
      if (result?.connector?.id) state.committedConnectors.add(result.connector.id);
      state.events.push('transaction:committed'); return result;
    } catch (error) { state.events.push('transaction:rolled-back'); throw error; }
  };
  const load = moduleLoader({
    'next/server': { NextRequest, NextResponse }, 'node:net': require('node:net'), '@/lib/prisma': { prisma },
    '@/lib/auth/api-permission': { authorizeApiRequest: async () => state.allowed ? { allowed: true, auth: { role: state.role } }
      : { allowed: false, response: NextResponse.json({ error: 'Fixture denied' }, { status: 403 }) } },
    '@/lib/auth/request-actor': { getRequestActor: async () => ({ role: state.role, actor: { id: 'fixture-actor' } }) },
    '@/lib/license/middleware': { checkDeviceLimit: async () => state.limit ? NextResponse.json({ error: 'Fixture license limit' }, { status: 403 }) : null },
    '@/lib/firewall/probe': { probeFirewallConnector: async id => {
      assert.ok(state.committedConnectors.has(id), 'Remote probe starts only after its own inventory transaction commits');
      state.probes.push(id);
      const connector = await database.firewallConnector.findUnique({ where: { id } });
      const device = await database.device.findUnique({ where: { id: connector.deviceId } });
      return { connector, device, monitoring: { mode: 'UNAVAILABLE' }, status: { connected: false, errorCode: 'FIXTURE_SOURCE_UNAVAILABLE' } };
    } },
  }, { console: quiet, globalThis: {} });
  const request = (route, body) => new NextRequest('http://fixture.invalid' + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const enable = (device, overrides = {}) => load('app/api/integrations/nms/devices/route.ts').POST(request('/api/integrations/nms/devices', {
    deviceId: device.id, managementIp: device.managementIp || '192.0.2.10', snmpCommunity: 'fixture-community', ...overrides,
  }));
  const discover = (device, found, overrides = {}) => load('app/api/integrations/nms/discovery/[scanId]/import/route.ts').POST(
    request(`/api/integrations/nms/discovery/${found.scanId}/import`, { deviceId: device.id, discoveredDeviceId: found.id, ...overrides }), { params: { scanId: found.scanId } });
  const firewall = (suffix, overrides = {}) => load('app/api/firewalls/route.ts').POST(request('/api/firewalls', {
    name: 'Fixture firewall ' + suffix, host: `fg-${suffix}.fixture.invalid`, accessToken: 'fixture-token',
    snmp: { version: '2c', community: 'fixture-community', pollingInterval: 30 }, ...overrides,
  }));
  const addDevice = (overrides = {}) => database.device.create({ data: { id: `${prefix}-inventory-${++state.sequence}`, name: 'Fixture switch', type: 'SWITCH', nmsDeviceId: null, ...overrides } });
  const addDiscovered = async (overrides = {}) => {
    if (options.database) throw new Error('Create the fixture discovery scan explicitly in DB checks');
    return database.nmsDiscoveredDevice.create({ data: { id: `${prefix}-discovered-${++state.sequence}`, scanId: 'fixture-scan', ipAddress: '192.0.2.20', snmpCommunity: 'fixture-community', imported: false, ...overrides } });
  };
  return { state, database, prisma, load, enable, discover, firewall, addDevice, addDiscovered };
}
const tests = [], test = (name, run) => tests.push([name, run]);
test('legacy/legacy independent enables use the common allocator and return different IDs', async () => {
  const f = fixture(), a = await f.addDevice({ managementIp: '192.0.2.1' }), b = await f.addDevice({ managementIp: '192.0.2.2' });
  const responses = await Promise.all([f.enable(a), f.enable(b)]); assert.ok(responses.every(r => r.status === 201));
  assert.equal(new Set(f.state.devices.map(d => d.nmsDeviceId)).size, 2); assert.equal(f.state.lockAttempts, 2);
});
test('legacy and firewall onboarding allocate through the same key and preserve probe-after-commit', async () => {
  const f = fixture(), device = await f.addDevice();
  const responses = await Promise.all([f.enable(device), f.firewall('a')]); assert.ok(responses.every(r => r.status === 201));
  assert.equal(new Set(f.state.devices.map(d => d.nmsDeviceId)).size, 2); assert.equal(f.state.probes.length, 1);
});
test('a repeated enable returns 409 without replacing the winner ID or credentials', async () => {
  const f = fixture(), device = await f.addDevice();
  const results = await Promise.all([f.enable(device), f.enable(device, { snmpCommunity: 'fixture-replacement' })]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]); assert.equal(f.state.allocations.length, 1);
});
test('same-IP competing enables retain the existing conflict contract', async () => {
  const f = fixture(), a = await f.addDevice(), b = await f.addDevice();
  const responses = await Promise.all([f.enable(a), f.enable(b)]); assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
});
test('discovery updates inventory and the imported marker in the same transaction', async () => {
  const f = fixture(), device = await f.addDevice(), found = await f.addDiscovered();
  const response = await f.discover(device, found); assert.equal(response.status, 201);
  const body = await response.json(); assert.equal(body.device.nmsDeviceId, body.nmsDeviceId); assert.equal(body.importedFrom.id, found.id);
  assert.equal(f.state.discovered[0].imported, true);
});
test('competing discovery imports cannot attach one discovered row to two inventory devices', async () => {
  const f = fixture(), a = await f.addDevice(), b = await f.addDevice(), found = await f.addDiscovered();
  const responses = await Promise.all([f.discover(a, found), f.discover(b, found)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]); assert.equal(f.state.allocations.length, 1);
});
for (const site of ['device:update', 'nmsDiscoveredDevice:update']) test('discovery rollback at ' + site + ' preserves a retryable unimported record', async () => {
  const f = fixture(), device = await f.addDevice(), found = await f.addDiscovered(); f.state.failOnce = site;
  assert.equal((await f.discover(device, found)).status, 500);
  assert.equal(f.state.devices[0].nmsDeviceId, null); assert.equal(f.state.discovered[0].imported, false);
  assert.equal((await f.discover(device, found)).status, 201);
});
test('commit failure rolls back an enable and releases allocation for retry', async () => {
  const f = fixture(), device = await f.addDevice(); f.state.failCommit = true;
  assert.equal((await f.enable(device)).status, 500); assert.equal(f.state.devices[0].nmsDeviceId, null);
  f.state.failCommit = false; assert.equal((await f.enable(device)).status, 201); assert.equal(f.state.devices[0].nmsDeviceId, 1);
});
for (const site of ['integrationConfig:create', 'firewallConnector:create']) test('firewall rollback at ' + site + ' does not leave an NMS reservation or start a probe', async () => {
  const f = fixture(); f.state.failOnce = site; assert.equal((await f.firewall('a')).status, 500);
  assert.equal(f.state.devices.length, 0); assert.equal(f.state.integrations.length, 0); assert.equal(f.state.probes.length, 0);
  assert.equal((await f.firewall('a')).status, 201); assert.equal(f.state.devices[0].nmsDeviceId, 1);
});
test('REST-only firewall onboarding retains null NMS identity without an allocation lock', async () => {
  const f = fixture(); assert.equal((await f.firewall('rest', { snmp: undefined })).status, 201);
  assert.equal(f.state.devices[0].nmsDeviceId, null); assert.equal(f.state.lockAttempts, 0);
});
test('SSH-only firewall onboarding still obtains its own NMS identity', async () => {
  const f = fixture(); assert.equal((await f.firewall('ssh', { snmp: undefined, ssh: { username: 'fixture', password: 'fixture-ssh' } })).status, 201);
  assert.equal(f.state.devices[0].nmsDeviceId, 1); assert.equal(f.state.devices[0].pollingEnabled, false);
});
test('SNMPv3 and SSH secrets remain encrypted and absent from enable responses', async () => {
  const f = fixture(), device = await f.addDevice();
  const response = await f.enable(device, { snmpVersion: '3', snmpV3Username: 'fixture', snmpV3SecurityLevel: 'authPriv',
    snmpV3AuthPassword: 'fixture-auth-secret', snmpV3PrivacyPassword: 'fixture-privacy-secret',
    backupPlatform: 'cisco_ios', sshUsername: 'fixture', sshPassword: 'fixture-ssh-secret' });
  assert.equal(response.status, 201); const body = await response.json();
  for (const key of ['snmpV3AuthPassword', 'snmpV3PrivacyPassword', 'sshPassword']) {
    assert.match(f.state.devices[0][key], /^enc:v1:/); assert.equal(body.device[key], undefined);
  }
});
for (const route of ['enable', 'discovery']) test(route + ': denied request cannot reserve an ID or touch inventory', async () => {
  const f = fixture(), device = await f.addDevice(), found = await f.addDiscovered(); f.state.allowed = false;
  assert.equal((await (route === 'enable' ? f.enable(device) : f.discover(device, found))).status, 403);
  assert.equal(f.state.events.length, 0);
});
for (const version of ['invalid', '3']) test('discovery rejects unsupported version ' + version + ' without marking imported', async () => {
  const f = fixture(), device = await f.addDevice(), found = await f.addDiscovered();
  assert.equal((await f.discover(device, found, { snmpVersion: version })).status, 400);
  assert.equal(f.state.devices[0].nmsDeviceId, null); assert.equal(f.state.discovered[0].imported, false);
});
test('missing inventory and wrong discovery scan do not consume an identity', async () => {
  const f = fixture(), found = await f.addDiscovered();
  assert.equal((await f.enable({ id: 'missing' })).status, 404);
  assert.equal((await f.discover({ id: 'missing' }, found)).status, 404);
  assert.equal((await f.discover({ id: 'missing' }, { ...found, scanId: 'other' })).status, 400);
  assert.equal(f.state.allocations.length, 0);
});
test('allocator rejects missing, fractional and out-of-range query results without inventing ID 1', async () => {
  const f = fixture(), allocate = f.load('lib/nms/device-id.ts').reserveNextNmsDeviceId;
  for (const value of [undefined, null, 0, -1, 1.5, NaN, '1', 2147483648n]) {
    const tx = { $queryRaw: async strings => strings.join('').includes('pg_advisory_xact_lock') ? [] : value === undefined ? [] : [{ nextId: value }] };
    await assert.rejects(allocate(tx));
  }
  for (const value of [1n, 42, 2147483647n]) {
    const tx = { $queryRaw: async strings => strings.join('').includes('pg_advisory_xact_lock') ? [] : [{ nextId: value }] };
    assert.equal(await allocate(tx), Number(value));
  }
});
async function main() {
  let failed = 0;
  for (const [name, run] of tests) { try { await run(); console.log('PASS ' + name); } catch (error) { failed++; console.error('FAIL ' + name, error); } }
  assert.equal(failed, 0); console.log(`NMS device ID regressions passed (${tests.length} scenarios; no external I/O).`);
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { fixture, deferred };
