// Real FortiGate factory/service, NMS read boundary and API; synthetic persistence and transport.
// No application environment, live device, background collector or notification recipient is loaded.
const assert = require('node:assert/strict');
const { NextRequest, NextResponse } = require('next/server');
const { moduleLoader } = require('./check-alarm-occurrences.cjs');
const quiet = new Proxy({}, { get: () => () => {} });
const now = Date.parse('2026-10-16T12:00:00Z');
const modules = extra => ({ interfaces: true, vlans: false, policies: false, addresses: false, vips: false, sdwan: false, ...extra });
const profile = (id, deviceId, host) => ({ id, name: `Synthetic firewall ${id}`, type: 'FORTIGATE', enabled: true,
  syncInterval: 5, config: { host, deviceId, vdom: 'root', accessToken: 'synthetic-rest',
    snmp: { version: '2c', community: 'synthetic-legacy' }, syncMode: 'snmp', enabledModules: modules() } });
const metric = (nmsDeviceId, index, overrides = {}) => ({ id: `metric-${nmsDeviceId}-${index}`, nmsDeviceId,
  interfaceIndex: index, interfaceName: `observed-port-${index}`, description: 'Synthetic observation',
  adminStatus: 'up', operStatus: index === 2 ? 'down' : 'up', monitored: false,
  speed: 2500000000n, inOctets: 9007199254740995n, outOctets: 512n, inErrors: 7, outErrors: 2,
  mtu: 9000, lastPolledAt: new Date(now - 30000), ...overrides });
function fixture({ database } = {}) {
  const state = { now, configs: [profile('config-a', 'device-a', 'a.invalid'), profile('config-b', 'device-b', 'b.invalid')],
    devices: ['a', 'b'].map((key, i) => ({ id: `device-${key}`, nmsDeviceId: 100 + i,
      managementIp: `${key}.invalid`, pollingEnabled: true, pollingInterval: 30,
      snmpVersion: '2c', snmpCommunity: 'synthetic-nms',
    })),
    links: ['a', 'b'].map(key => ({ id: `link-${key}`, deviceId: `device-${key}`, integrationConfigId: `config-${key}`,
      managementHost: `${key}.invalid`, vdom: 'root', monitoringMode: 'LIMITED', capabilities: [] })),
    rows: [metric(100, 1), metric(100, 2), metric(101, 1, { interfaceName: 'target-b-observation' })],
    queries: [], transport: [], inventory: [], writes: [], syncLogs: [], configUpdates: [], allowed: true };
  const DateClass = class extends Date {
    constructor(...args) { super(...(args.length ? args : [state.now])); }
    static now() { return state.now; }
  };
  const prisma = {
    integrationConfig: { findUnique: async ({ where }) => state.configs.find(c => c.id === where.id),
      update: async ({ where, data }) => { state.configUpdates.push({ id: where.id, ...data }); return data; } },
    firewallConnector: {
      findUnique: async ({ where }) => {
        if (state.linkError) throw new Error('Synthetic link lookup failed');
        const link = state.links.find(l => where.id ? l.id === where.id
          : l.integrationConfigId === where.integrationConfigId_vdom.integrationConfigId && l.vdom === where.integrationConfigId_vdom.vdom);
        return link ? { ...link, device: state.devices.find(d => d.id === link.deviceId),
          integrationConfig: state.configs.find(c => c.id === link.integrationConfigId) } : null;
      },
      update: async () => ({}),
    },
    device: {
      findUnique: async ({ where }) => state.devices.find(d => d.id === where.id) || null,
      findFirst: async () => null,
      create: async () => { state.writes.push('device:create'); return { id: 'created-device' }; },
    },
    nmsInterface: {
      aggregate: async ({ where }) => ({ _max: { lastPolledAt: state.rows.filter(r => r.nmsDeviceId === where.nmsDeviceId)
        .reduce((date, row) => !date || row.lastPolledAt > date ? row.lastPolledAt : date, null) } }),
      count: async ({ where }) => state.rows.filter(r => r.nmsDeviceId === where.nmsDeviceId).length,
      findMany: async args => {
        state.queries.push(args);
        if (state.sourceError) throw new Error('Synthetic NMS storage failed');
        const rows = state.rows.filter(r => r.nmsDeviceId === args.where.nmsDeviceId);
        state.afterRead?.();
        return args.take ? rows.slice(args.skip || 0, (args.skip || 0) + args.take) : rows;
      },
    },
    networkInterface: { upsert: async ({ where, create, update }) => {
      state.writes.push({ where, create, update });
      if (!state.devices.some(d => d.id === create.deviceId)) throw new Error('Synthetic inventory device foreign key failed');
      if (state.writeError) throw new Error('Synthetic inventory write failed');
      const existing = state.inventory.find(i => i.deviceId === where.deviceId_name.deviceId && i.name === where.deviceId_name.name);
      if (existing) { for (const [key, value] of Object.entries(update)) if (value !== undefined) existing[key] = value; return existing; }
      const row = { ...create }; state.inventory.push(row); return row;
    } },
    organization: { findFirst: async () => ({ id: 'synthetic-organization' }) },
    integrationSyncLog: { create: async ({ data }) => { state.syncLogs.push(data); return data; } },
    $transaction: async callback => callback(prisma),
  };
  const load = moduleLoader({
    'next/server': { NextRequest, NextResponse }, '@/lib/prisma': { prisma: database || prisma }, '@/lib/logger': { createLogger: () => quiet },
    '@/lib/auth/api-permission': { authorizeApiRequest: async () => state.allowed ? { allowed: true }
      : { allowed: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) } },
    https: { request: () => { throw new Error('Real HTTPS forbidden'); } }, querystring: require('node:querystring'),
    '@/lib/security/integration-credentials': { unprotectIntegrationConfig: value => value },
    '@/lib/security/tls': { getHttpsRequestTlsOptions: () => { throw new Error('Unexpected cookie auth'); }, secureFetch: async (source, url) => {
      state.transport.push({ source, url });
      return { ok: true, json: async () => ({ results: url.includes('/cmdb/system/interface')
        ? [{ name: 'rest-port', status: 'up', speed: 1000000000, mtu: 1400, type: 'physical', ip: '192.0.2.5', mask: '255.255.255.0' }]
        : [] }) };
    } },
  }, { URL, Date: DateClass, process: { env: {} }, console: quiet });
  const factory = load('lib/firewall/connector-factory.ts');
  const connector = id => factory.getFortiGateConnector({ configId: id || 'config-a' });
  const read = async id => (await connector(id)).service.fetchInterfaces();
  const sync = async id => (await connector(id)).service.syncToInventory('synthetic-organization');
  const post = (id = 'config-a') => load('app/api/integrations/fortigate/route.ts').POST(new NextRequest(
    `http://localhost/api/integrations/fortigate?configId=${id}`, { method: 'POST', body: JSON.stringify({ action: 'sync' }) }));
  return { state, prisma, load, read, sync, post, connector };
}
const tests = [], test = (name, check) => tests.push([name, check]);
test('SNMP mode returns observed NMS values instead of a constant empty success', async f => {
  const rows = await f.read(); assert.equal(rows.length, 2);
  assert.equal(rows[0].name, 'observed-port-1'); assert.equal(rows[0].status, 'up');
  assert.equal(rows[1].status, 'down'); assert.equal(rows[0].speed, 2500000000); assert.equal(rows[0].mtu, 9000);
  assert.equal(f.state.transport.length, 0); assert.equal(f.state.queries[0].where.nmsDeviceId, 100);
});
test('both mode uses NMS interfaces and retains enabled REST module reads', async f => {
  f.state.configs[0].config.syncMode = 'both'; f.state.configs[0].config.enabledModules.policies = true;
  const result = await f.sync(); assert.equal(result.success, true); assert.equal(result.interfacesProcessed, 2);
  assert.ok(f.state.transport.some(r => r.url.includes('/cmdb/firewall/policy')));
  assert.ok(!f.state.transport.some(r => r.url.includes('/cmdb/system/interface')));
});
test('missing NMS data fails before writing or creating inventory', async f => {
  f.state.rows = []; const result = await f.sync();
  assert.equal(result.success, false); assert.equal(f.state.writes.length, 0); assert.equal(f.state.transport.length, 0);
});
test('an old row cannot hide behind another fresh interface timestamp', async f => {
  f.state.rows[1].lastPolledAt = new Date(now - 10 * 60000);
  await assert.rejects(f.read()); assert.equal(f.state.writes.length, 0);
});
test('a non-root VDOM cannot receive device-wide rows as its own interfaces', async f => {
  f.state.configs[0].config.vdom = 'branch'; f.state.links[0].vdom = 'branch';
  await assert.rejects(f.read(), { code: 'UNSUPPORTED_OPERATION' });
});
test('REST mode retains its actual REST interface reader without consulting NMS', async f => {
  f.state.configs[0].config.syncMode = 'rest'; f.state.rows = [];
  const result = await f.sync(); assert.equal(result.success, true); assert.equal(result.interfacesProcessed, 1);
  assert.equal(f.state.queries.length, 0); assert.equal(f.state.inventory[0].name, 'rest-port');
  assert.equal(f.state.inventory[0].ipv4, '192.0.2.5/255.255.255.0');
  assert.equal(result.interfaceSource.source, 'fortigate-rest');
});
test('SNMP credentials remain owned by NMS rather than being copied from legacy settings', async f => {
  delete f.state.configs[0].config.snmp;
  const result = await f.sync(); assert.equal(result.success, true); assert.equal(result.interfacesProcessed, 2);
  assert.equal(f.state.devices[0].snmpCommunity, 'synthetic-nms');
  assert.equal(f.state.transport.length, 0); assert.equal(result.interfaceSource.source, 'nms');
});
for (const mode of ['snmp', 'both']) test(`${mode} has no REST fallback when NMS is unavailable`, async f => {
  f.state.configs[0].config.syncMode = mode; f.state.sourceError = true;
  const result = await f.sync(); assert.equal(result.success, false); assert.ok(result.errors.length);
  assert.equal(f.state.transport.length, 0); assert.equal(f.state.writes.length, 0);
});
test('all interface rows are loaded rather than silently taking only a UI page', async f => {
  f.state.rows = Array.from({ length: 237 }, (_, i) => metric(100, i + 1));
  const result = await f.sync(); assert.equal(result.success, true); assert.equal(result.interfacesProcessed, 237);
  assert.equal(f.state.queries.length, 1); assert.equal(f.state.inventory.length, 237);
});
test('an oversized snapshot fails rather than claiming a truncated successful inventory', async f => {
  f.state.rows = Array.from({ length: 10001 }, (_, i) => metric(100, i + 1));
  const result = await f.sync(); assert.equal(result.success, false); assert.equal(f.state.writes.length, 0);
});
test('source target IDs keep equal interface names on different firewalls separate', async f => {
  f.state.rows[2].interfaceName = 'observed-port-1'; await f.sync(); await f.sync('config-b');
  assert.equal(f.state.inventory.length, 3);
  assert.deepEqual(f.state.inventory.filter(i => i.name === 'observed-port-1').map(i => i.deviceId), ['device-a', 'device-b']);
  assert.deepEqual(f.state.queries.map(q => q.where.nmsDeviceId), [100, 101]);
});
for (const reason of ['unlinked', 'polling-disabled', 'missing-nms-id', 'wrong-host', 'missing-host', 'missing-community']) {
  test(`${reason} cannot claim a successful SNMP read or overwrite inventory`, async f => {
    if (reason === 'unlinked') f.state.links = [];
    if (reason === 'polling-disabled') f.state.devices[0].pollingEnabled = false;
    if (reason === 'missing-nms-id') f.state.devices[0].nmsDeviceId = null;
    if (reason === 'wrong-host') f.state.devices[0].managementIp = 'different.invalid';
    if (reason === 'missing-host') f.state.devices[0].managementIp = null;
    if (reason === 'missing-community') f.state.devices[0].snmpCommunity = '';
    const result = await f.sync(); assert.equal(result.success, false); assert.equal(f.state.writes.length, 0);
    assert.equal(f.state.transport.length, 0); assert.equal(f.state.queries.length, 0);
  });
}
for (const security of ['authNoPriv', 'authPriv']) test(`NMS SNMPv3 ${security} uses the configured profile without legacy community fallback`, async f => {
  Object.assign(f.state.devices[0], { snmpVersion: 'v3', snmpCommunity: null, snmpV3Username: 'synthetic-user',
    snmpV3SecurityLevel: security, snmpV3AuthPassword: 'protected-fixture', snmpV3PrivacyPassword: security === 'authPriv' ? 'protected-fixture' : null });
  const result = await f.sync(); assert.equal(result.success, true); assert.equal(result.interfacesProcessed, 2);
  assert.equal(f.state.transport.length, 0);
});
for (const field of ['snmpV3Username', 'snmpV3AuthPassword', 'snmpV3PrivacyPassword']) test(`incomplete NMS SNMPv3 ${field} is unavailable`, async f => {
  Object.assign(f.state.devices[0], { snmpVersion: '3', snmpV3Username: 'synthetic-user', snmpV3SecurityLevel: 'authPriv',
    snmpV3AuthPassword: 'protected-fixture', snmpV3PrivacyPassword: 'protected-fixture', [field]: '' });
  await assert.rejects(f.read()); assert.equal(f.state.queries.length, 0);
});
for (const age of [121000, 16 * 60000]) test(`a ${age}ms old observation is not written as current`, async f => {
  f.state.rows[0].lastPolledAt = new Date(now - age);
  const result = await f.sync(); assert.equal(result.success, false); assert.equal(f.state.writes.length, 0);
});
test('longer polling intervals use the existing bounded freshness policy', async f => {
  f.state.devices[0].pollingInterval = 120; f.state.rows[0].lastPolledAt = new Date(now - 240000);
  assert.equal((await f.read()).length, 2);
  f.state.rows[0].lastPolledAt = new Date(now - 301000); await assert.rejects(f.read());
});
for (const time of [new Date(now + 60000), new Date('invalid')]) test(`an invalid/future timestamp ${String(time)} cannot advance inventory`, async f => {
  f.state.rows[0].lastPolledAt = time;
  const result = await f.sync(); assert.equal(result.success, false); assert.equal(f.state.writes.length, 0);
});
test('uncollected properties stay null and complete counters retain decimal precision', async f => {
  const rows = await f.read();
  for (const key of ['ip', 'mask', 'duplex', 'interface', 'type']) assert.equal(rows[0][key], null, key);
  assert.equal(rows[0].observation.inOctets, '9007199254740995'); assert.equal(rows[0].observation.inErrors, 7);
  assert.equal(rows[0].collectedAt, new Date(now - 30000).toISOString()); assert.equal(rows[0].source, 'nms');
});
test('genuine zero and non-safe integer values are distinguished without fabricated replacement', async f => {
  f.state.rows[0].speed = 0n; f.state.rows[0].mtu = 0;
  f.state.rows[1].speed = 9007199254740995n;
  const rows = await f.read(); assert.equal(rows[0].speed, 0); assert.equal(rows[0].mtu, 0);
  assert.equal(rows[1].speed, null); assert.equal(rows[1].observation.speed, '9007199254740995');
});
test('unknown link state is explicit UNKNOWN rather than a fabricated down state', async f => {
  f.state.rows[0].operStatus = 'unknown'; await f.sync();
  assert.equal(f.state.inventory[0].status, 'UNKNOWN'); assert.equal(f.state.inventory[0].type, 'OTHER');
});
test('updating NMS state preserves IP, MAC and interface type supplied by other real sources', async f => {
  f.state.inventory.push({ deviceId: 'device-a', name: 'observed-port-1', type: 'FIBER', ipv4: '192.0.2.8/24', macAddress: '00:00:5e:00:53:01', status: 'DOWN' });
  const result = await f.sync(); assert.equal(result.success, true);
  assert.equal(f.state.inventory[0].ipv4, '192.0.2.8/24'); assert.equal(f.state.inventory[0].type, 'FIBER');
  assert.equal(f.state.inventory[0].macAddress, '00:00:5e:00:53:01'); assert.equal(f.state.inventory[0].status, 'UP');
});
for (const field of ['interfaceName', 'interfaceIndex', 'speed', 'inOctets', 'mtu', 'inErrors']) test(`malformed ${field} rejects the full snapshot before any write`, async f => {
  const invalid = { interfaceName: '', interfaceIndex: 0, speed: -1n, inOctets: -1n, mtu: -1, inErrors: -1 };
  f.state.rows[1][field] = invalid[field];
  const result = await f.sync(); assert.equal(result.success, false); assert.equal(f.state.writes.length, 0);
});
for (const field of ['interfaceName', 'interfaceIndex']) test(`duplicate ${field} cannot merge two observations into one inventory row`, async f => {
  f.state.rows[1][field] = f.state.rows[0][field];
  const result = await f.sync(); assert.equal(result.success, false); assert.equal(f.state.writes.length, 0);
});
for (const feature of ['vlans', 'policies', 'addresses', 'vips', 'sdwan']) test(`SNMP-only ${feature} is unsupported before source or inventory work`, async f => {
  f.state.configs[0].config.enabledModules[feature] = true;
  const result = await f.sync(); assert.equal(result.success, false); assert.match(result.errors[0], /SNMP-only/);
  assert.equal(f.state.queries.length, 0); assert.equal(f.state.writes.length, 0); assert.equal(f.state.transport.length, 0);
});
test('a direct REST-only reader in SNMP mode reports unsupported without network I/O', async f => {
  f.state.configs[0].config.enabledModules.policies = true;
  const { service } = await f.connector(); await assert.rejects(service.fetchFirewallPolicies(), { code: 'UNSUPPORTED_OPERATION' });
  assert.equal(f.state.transport.length, 0);
});
test('disabled interface collection is a skipped module without a claimed interface source', async f => {
  f.state.configs[0].config.enabledModules.interfaces = false;
  const result = await f.sync(); assert.equal(result.interfacesProcessed, 0); assert.equal(result.interfaceSource, undefined);
  assert.equal(f.state.queries.length, 0); assert.equal(f.state.writes.length, 0);
});
test('source changes are observed on the same service without retaining a constant or stale list', async f => {
  const { service } = await f.connector(); const before = await service.fetchInterfaces();
  f.state.rows[0].operStatus = 'down'; f.state.rows[0].speed = 10000000000n;
  const after = await service.fetchInterfaces(); assert.equal(before[0].status, 'up'); assert.equal(after[0].status, 'down');
  assert.equal(after[0].speed, 10000000000); assert.equal(f.state.queries.length, 2);
});
test('inventory write failures cannot turn a failed SNMP sync into success', async f => {
  f.state.writeError = true; const result = await f.sync();
  assert.equal(result.success, false); assert.equal(result.interfacesProcessed, 0); assert.equal(result.errors.length, 2);
});
test('the manual API preserves source values, target scope and collection provenance', async f => {
  const response = await f.post(); const result = await response.json();
  assert.equal(response.status, 200); assert.equal(result.success, true); assert.equal(result.interfacesProcessed, 2);
  assert.equal(result.target.configId, 'config-a'); assert.equal(result.interfaceSource.source, 'nms');
  assert.equal(result.interfaceSource.collectedAt, new Date(now - 30000).toISOString());
  assert.equal(f.state.syncLogs[0].status, 'success'); assert.equal(f.state.configUpdates[0].lastSyncStatus, 'success');
});
test('a source failure remains failed in both API sync records and never writes empty inventory', async f => {
  f.state.rows = []; const response = await f.post(); const result = await response.json();
  assert.equal(result.success, false); assert.equal(f.state.syncLogs[0].status, 'failed');
  assert.equal(f.state.configUpdates[0].lastSyncStatus, 'failed'); assert.equal(f.state.writes.length, 0);
});
test('API permission denial prevents source collection and inventory writes', async f => {
  f.state.allowed = false; const response = await f.post(); assert.equal(response.status, 403);
  assert.equal(f.state.queries.length, 0); assert.equal(f.state.writes.length, 0); assert.equal(f.state.transport.length, 0);
});
test('observations and sync results do not expose NMS or legacy credentials', async f => {
  const rows = await f.read(); const result = await f.sync(); const output = JSON.stringify([rows, result]);
  for (const value of ['synthetic-nms', 'synthetic-legacy', 'synthetic-rest']) assert.ok(!output.includes(value));
});
test('the existing paginated UI reader can still display labelled stale observations', async f => {
  f.state.rows[0].lastPolledAt = f.state.rows[1].lastPolledAt = new Date(now - 4 * 60000);
  const reader = f.load('lib/firewall/snmp-read.ts');
  const { envelope } = await reader.readFirewallSnmpInterfaces({ connectorId: 'link-a', query: { page: 2, limit: 1, search: '', filters: {} } });
  assert.equal(envelope.status, 'stale'); assert.equal(envelope.data.pagination.total, 2);
  assert.equal(envelope.data.items.length, 1); assert.equal(envelope.data.items[0].name, 'observed-port-2');
  await assert.rejects(f.read()); assert.equal(f.state.writes.length, 0);
});
test('a device removed after source read is not recreated as a different synthetic target', async f => {
  f.state.afterRead = () => { f.state.devices.shift(); };
  const result = await f.sync(); assert.equal(result.success, false);
  assert.ok(!f.state.writes.includes('device:create')); assert.equal(f.state.inventory.length, 0);
});
async function main() {
  let failed = 0;
  for (const [name, check] of tests) {
    try { await check(fixture()); console.log(`PASS ${name}`); }
    catch (error) { failed++; console.error(`FAIL ${name}\n${error.stack}`); }
  }
  assert.equal(failed, 0, `${failed} FortiGate SNMP regressions failed`);
  console.log(`FortiGate SNMP regressions passed (${tests.length} scenarios; real source adapter and inventory/API code, isolated I/O).`);
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { fixture };
