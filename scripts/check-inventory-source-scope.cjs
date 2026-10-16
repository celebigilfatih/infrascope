// Actual importers, source identity and API/coordinator boundaries; synthetic source and ORM.
const assert = require('node:assert/strict');
const { NextRequest, NextResponse } = require('next/server');
const { moduleLoader } = require('./check-alarm-occurrences.cjs');
const { fixture: scheduleFixture, deferred } = require('./check-inventory-scheduling.cjs');
const quiet = new Proxy({}, { get: () => () => {} });
function memoryDatabase() {
  const records = {}, queries = [];
  let sequence = 0;
  const database = {};
  for (const model of ['device', 'vMwareCluster', 'vMwareDatastore', 'networkInterface', 'zabbixTrigger', 'capacityMetric']) {
    const rows = records[model] = [];
    const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
    database[model] = {
      findFirst: async ({ where }) => {
        queries.push({ model, where });
        if (where.vmwareMoref) assert.ok(where.vmwareSourceScope, 'Every MoRef lookup needs its source');
        if (where.zabbixHostId) assert.ok(where.zabbixSourceScope, 'Every host lookup needs its source');
        if (where.vcenterId) assert.ok(where.sourceScope, 'Every cluster lookup needs its source');
        return rows.find(r => matches(r, where)) ?? null;
      },
      create: async ({ data }) => { const row = { id: `fixture-row-${++sequence}`, ...data }; rows.push(row); return row; },
      update: async ({ where, data }) => Object.assign(rows.find(r => matches(r, where)), data),
      upsert: async ({ where, create, update }) => {
        const compound = Object.values(where)[0];
        assert.equal(typeof compound, 'object', 'Auxiliary inventory must use compound source identity');
        const row = rows.find(r => matches(r, compound));
        if (row) { Object.assign(row, Object.fromEntries(Object.entries(update).filter(([,v]) => v !== undefined))); return row; }
        return database[model].create({ data: create });
      },
    };
  }
  return { database, records, queries };
}
function sourceFixture(database) {
  const load = moduleLoader({
    '@/lib/prisma': { prisma: database },
    '@prisma/client': { ...require('@prisma/client'), PrismaClient: class { constructor() { return database; } } },
    '@/lib/logger': { createLogger: () => quiet }, '@/lib/security/tls': {},
    '@/lib/integrations/vmware-python': { isVMwarePythonError: () => false },
  }, { console: quiet, globalThis: {} });
  const scope = load('lib/integrations/inventory-source-scope.ts').inventorySourceScope;
  function service(type, id, endpoint, label = id) {
    const vmware = type === 'VMWARE_VCENTER';
    const config = vmware ? { integrationId: id, host: endpoint, username: 'fixture-reader', password: 'fixture-password', pollingInterval: 5,
      enabledModules: { clusters: true, hosts: true, vms: true, datastores: true, datacenters: true } }
      : { integrationId: id, url: endpoint, authToken: 'fixture-token', pollingInterval: 5,
        enabledModules: { hosts: true, interfaces: true, triggers: true, items: true } };
    const instance = vmware ? new (load('lib/integrations/vmware.ts').VMwareService)(config)
      : new (load('lib/integrations/zabbix.ts').ZabbixService)(config);
    let authCalls = 0;
    instance.authenticate = async () => { authCalls++; return true; };
    instance.fetchClusters = async () => [{ cluster: { value: 'domain-c1' }, name: label + '-cluster', summary: {} }];
    instance.fetchHosts = async () => vmware
      ? [{ host: { value: 'host-1' }, name: label + '-host', parent: { value: 'domain-c1' }, summary: {} }]
      : ['101', '102'].map(hostid => ({ hostid, name: label + '-host-' + hostid, host: 'fixture', status: '0', inventory: {} }));
    instance.fetchVMs = async () => [{ vm: { value: 'vm-1' }, parent: { value: 'host-1' }, name: label + '-vm', summary: {} }];
    instance.fetchDatastores = async () => [{ datastore: { value: 'datastore-1' }, name: label + '-datastore', summary: {}, info: {} }];
    instance.fetchInterfaces = async () => ['101', '102'].map(hostid => ({ interfaceid: '1', hostid, type: 1, port: '10050', ip: '192.0.2.1' }));
    instance.fetchTriggers = async () => [{ triggerid: '201', hosts: [{ hostid: '101' }, { hostid: '102' }], description: label,
      expression: 'fixture', priority: 2, status: 'PROBLEM', value: 1, lastchange: 1792152000 }];
    return { instance, config, scope: () => scope(type, id, endpoint), authCalls: () => authCalls };
  }
  return { service, scope, load };
}
const tests = [], test = (name, run) => tests.push([name, run]);
for (const type of ['VMWARE_VCENTER', 'ZABBIX']) {
  test(type + ': identical remote IDs in two targets never share devices or auxiliary rows', async () => {
    const db = memoryDatabase(), f = sourceFixture(db.database), vmware = type === 'VMWARE_VCENTER';
    const a = f.service(type, 'fixture-a', vmware ? 'a.invalid' : 'https://a.invalid/zabbix');
    const b = f.service(type, 'fixture-b', vmware ? 'b.invalid' : 'https://b.invalid/zabbix');
    const results = await Promise.all([a.instance.syncToInventory('fixture-org'), b.instance.syncToInventory('fixture-org')]);
    assert.ok(results.every(r => r.success)); assert.equal(db.records.device.length, 4);
    if (vmware) {
      assert.equal(db.records.vMwareCluster.length, 2); assert.equal(db.records.vMwareDatastore.length, 2);
      for (const vm of db.records.device.filter(r => r.vmwareMoref === 'vm-1')) {
        const host = db.records.device.find(r => r.id === vm.vmHostId);
        assert.equal(host.vmwareSourceScope, vm.vmwareSourceScope);
        assert.equal(vm.vmwareClusterId, host.vmwareClusterId);
        assert.equal(db.records.vMwareCluster.find(r => r.id === host.vmwareClusterId).sourceScope, vm.vmwareSourceScope);
      }
    } else {
      assert.equal(db.records.networkInterface.length, 4); assert.equal(db.records.zabbixTrigger.length, 4);
      assert.equal(new Set(db.records.networkInterface.map(r => r.deviceId)).size, 4);
      for (const row of db.records.zabbixTrigger) assert.ok(db.records.device.some(d => d.zabbixSourceScope === row.sourceScope && d.zabbixHostId === row.hostId));
    }
    const before = structuredClone(db.records), ids = db.records.device.map(r => r.id);
    await a.instance.syncToInventory('fixture-org');
    assert.deepEqual(db.records.device.map(r => r.id), ids);
    const key = vmware ? 'vmwareSourceScope' : 'zabbixSourceScope';
    assert.deepEqual(db.records.device.filter(r => r[key] === b.scope()), before.device.filter(r => r[key] === b.scope()));
  });
  test(type + ': retargeting retains old IDs; returning to original target reuses its records', async () => {
    const db = memoryDatabase(), f = sourceFixture(db.database), vmware = type === 'VMWARE_VCENTER';
    const a = f.service(type, 'fixture-a', vmware ? 'a.invalid' : 'https://a.invalid');
    const b = f.service(type, 'fixture-a', vmware ? 'b.invalid' : 'https://b.invalid');
    await a.instance.syncToInventory('fixture-org'); const old = structuredClone(db.records.device);
    await b.instance.syncToInventory('fixture-org'); assert.equal(db.records.device.length, 4);
    assert.deepEqual(db.records.device.slice(0, 2), old);
    await a.instance.syncToInventory('fixture-org'); assert.equal(db.records.device.length, 4);
    assert.deepEqual(db.records.device.slice(0, 2).map(r => r.id), old.map(r => r.id));
  });
  test(type + ': missing saved source ID fails before authentication or writes', async () => {
    const db = memoryDatabase(), f = sourceFixture(db.database);
    const source = f.service(type, undefined, type === 'VMWARE_VCENTER' ? 'a.invalid' : 'https://a.invalid');
    const result = await source.instance.syncToInventory('fixture-org');
    assert.equal(result.status, 'failed'); assert.equal(result.itemsProcessed, 0); assert.equal(source.authCalls(), 0);
  });
  test(type + ': two configs for the same endpoint retain distinct ownership', () => {
    const f = sourceFixture(memoryDatabase().database), endpoint = type === 'VMWARE_VCENTER' ? 'a.invalid' : 'https://a.invalid';
    assert.notEqual(f.scope(type, 'fixture-a', endpoint), f.scope(type, 'fixture-b', endpoint));
  });
  test(type + ': independent manual sync targets run concurrently but same config is excluded', async () => {
    const f = scheduleFixture(), a = f.add(type), b = f.add(type), gate = deferred(); f.state.gate = gate;
    const route = type === 'VMWARE_VCENTER' ? 'vmware' : 'zabbix';
    assert.equal((await f.post(route, { action: 'sync' })).status, 409);
    assert.equal(f.state.calls.length, 0);
    const first = f.post(route, { action: 'sync', configId: a.id });
    for (let i = 0; i < 100; i++) await Promise.resolve();
    const second = f.post(route, { action: 'sync', configId: b.id });
    for (let i = 0; i < 100; i++) await Promise.resolve();
    assert.equal(f.state.calls.length, 2); assert.equal(f.state.peak, 2);
    assert.equal((await f.post(route, { action: 'sync', configId: a.id })).status, 409);
    gate.resolve(); assert.equal((await first).status, 200); assert.equal((await second).status, 200);
    b.enabled = false; assert.equal((await f.post(route, { action: 'sync', configId: b.id })).status, 400);
  });
}
const normalizationVectors = [
  ['VMWARE_VCENTER', ' HTTPS://VC.FIXTURE.INVALID:443/// ', 'vc.fixture.invalid'],
  ['VMWARE_VCENTER', 'vc.fixture.invalid:8443', 'VC.FIXTURE.INVALID:8443/'],
  ['VMWARE_VCENTER', 'HTTPS://[2001:DB8:0:0:0:0:0:1]:443/', '[2001:db8:0:0:0:0:0:1]'],
  ['VMWARE_VCENTER', 'HTTPS://VÇ.FIXTURE.INVALID:443/', 'vç.fixture.invalid'],
  ['ZABBIX', 'HTTPS://Z.FIXTURE.INVALID:443/zabbix/api_jsonrpc.php///', 'https://z.fixture.invalid/zabbix/'],
  ['ZABBIX', 'http://z.fixture.invalid:80', 'http://Z.FIXTURE.INVALID/'],
  ['ZABBIX', 'https://z.fixture.invalid:8443/Case', 'HTTPS://Z.FIXTURE.INVALID:8443/Case/'],
];
for (const [type, a, b] of normalizationVectors) test(type + ': endpoint normalization ' + a, () => {
  const f = sourceFixture(memoryDatabase().database); assert.equal(f.scope(type, 'fixture-a', a), f.scope(type, 'fixture-a', b));
  if (type === 'VMWARE_VCENTER') {
    const saved = { id: 'fixture-a', syncInterval: 5, config: { host: a, username: 'fixture', password: 'fixture' } };
    const source = f.load('lib/integrations/vmware-source.ts').createSavedVMwareSource(saved);
    assert.equal(source.inventoryScope, f.scope(type, 'fixture-a', a));
    assert.equal(source.service.getInventoryScope(), source.inventoryScope);
  }
});
test('scope excludes credential, polling interval and module revisions', () => {
  const f = sourceFixture(memoryDatabase().database), row = { id: 'fixture-a', syncInterval: 5,
    config: { host: 'a.invalid', username: 'fixture', password: 'fixture-old', enabledModules: {} } };
  const first = f.load('lib/integrations/vmware-source.ts').createSavedVMwareSource(row).service.getInventoryScope();
  row.config.password = 'fixture-new'; row.syncInterval = 10; row.config.enabledModules.hosts = false;
  assert.equal(f.load('lib/integrations/vmware-source.ts').createSavedVMwareSource(row).service.getInventoryScope(), first);
});
test('capacity writes carry saved source identity and reject unscoped writes', async () => {
  const db = memoryDatabase(), f = sourceFixture(db.database), source = f.service('VMWARE_VCENTER', 'fixture-a', 'a.invalid');
  source.instance.fetchDatastores = async () => [{ datastore: { value: 'datastore-1' }, name: 'fixture', summary: { capacity: 100, freeSpace: 25 } }];
  assert.equal((await source.instance.collectCapacityMetrics()).collected, 1);
  assert.equal(db.records.capacityMetric[0].sourceScope, source.scope());
  const invalid = f.service('VMWARE_VCENTER', undefined, 'a.invalid');
  assert.equal((await invalid.instance.collectCapacityMetrics()).collected, 0);
});
for (const type of ['VMWARE_VCENTER', 'ZABBIX']) test(type + ': authorized reads select an explicit saved connection and reject ambiguity', async () => {
  const f = scheduleFixture(), a = f.add(type), b = f.add(type), route = type === 'VMWARE_VCENTER' ? 'vmware' : 'zabbix';
  const get = id => f.load(`app/api/integrations/${route}/route.ts`).GET(new NextRequest(
    `http://fixture.invalid/api/integrations/${route}?type=status${id ? `&configId=${id}` : ''}`));
  // The scheduler fixture's client intentionally has no status implementation; selection must occur first.
  assert.equal((await get()).status, 409); assert.equal(f.state.calls.length, 0);
  const selected = f.load('lib/integrations/inventory-source-selection.ts').selectInventorySource;
  assert.equal((await selected(type, a.id)).id, a.id); assert.equal((await selected(type, b.id)).id, b.id);
  b.enabled = false; assert.equal(await selected(type, b.id), null);
  assert.equal((await selected(type)).id, a.id);
});
test('VMware occurrence identity distinguishes native event and entity IDs across source scopes', () => {
  const f = sourceFixture(memoryDatabase().database), identity = f.load('lib/alarms/incident-service.ts').buildOccurrenceIdentity;
  const input = scope => ({ alarm: { id: 'fixture-alarm', code: 'VM_FIXTURE', source: 'vmware' }, title: 'Fixture', message: 'Fixture',
    rawData: [{ id: 'same-event', vmId: 'vm-1', inventorySourceScope: scope }] });
  const a = identity(input('fixture-a')), b = identity(input('fixture-b'));
  assert.notEqual(a.fingerprint, b.fingerprint); assert.notEqual(a.sourceEventId, b.sourceEventId);
  assert.equal(a.sourceEventId, identity(input('fixture-a')).sourceEventId);
});
test('VMware alarm initialization receives the selected saved source scope without credential identity', async () => {
  const fixture = require('./check-alarm-dispatch.cjs').fixture();
  const raw = { host: 'HTTPS://VC.FIXTURE.INVALID:443/', username: 'fixture', password: 'fixture-old' };
  fixture.state.configs.VMWARE_VCENTER = { id: 'fixture-a', enabled: true, config: raw };
  const first = fixture.engine(false); assert.equal(await first.initializeVMware(), true);
  const expected = sourceFixture(memoryDatabase().database).scope('VMWARE_VCENTER', 'fixture-a', raw.host);
  assert.equal(first.vmwareInventoryScope, expected);
  raw.password = 'fixture-new'; const rotated = fixture.engine(false); await rotated.initializeVMware();
  assert.equal(rotated.vmwareInventoryScope, expected);
  raw.host = 'other.invalid'; const changed = fixture.engine(false); await changed.initializeVMware();
  assert.notEqual(changed.vmwareInventoryScope, expected);
});
test('VMware API metrics and remote operations use the explicitly selected source despite equal remote IDs', async () => {
  const db = memoryDatabase(), f = sourceFixture(db.database), queries = [], calls = [];
  const profiles = ['fixture-a', 'fixture-b'].map(id => ({ id, type: 'VMWARE_VCENTER', enabled: true, syncInterval: 5,
    config: f.service('VMWARE_VCENTER', id, id + '.invalid').config }));
  const metrics = profiles.flatMap((r, index) => Array.from({ length: 4 }, (_, i) => ({
    sourceScope: f.scope('VMWARE_VCENTER', r.id, r.config.host), resourceType: 'datastore', resourceId: 'datastore-1',
    resourceName: r.id, metricType: 'disk', timestamp: new Date(Date.now() - (4 - i) * 60000), value: (index + 1) * 10, total: 100,
  })));
  const prisma = { integrationConfig: { findMany: async ({ where }) => profiles.filter(r => r.enabled && (!where.id || where.id === r.id)) },
    capacityMetric: { findMany: async ({ where }) => { queries.push(where); return metrics.filter(m => m.sourceScope === where.sourceScope); } } };
  const load = moduleLoader({ 'next/server': { NextRequest, NextResponse }, '@/lib/prisma': { prisma },
    '@/lib/auth/api-permission': { authorizeApiRequest: async () => ({ allowed: true, auth: { role: 'ADMIN' } }) },
    '@/lib/auth/permission-policy': { canAccessSync: () => true }, '@/lib/validators': {}, '@/lib/validators/integrations': {},
    '@/lib/integrations/vmware-python': { isVMwarePythonError: () => false },
    '@/lib/integrations/vmware': { VMwareService: class { constructor(config) {
      const service = f.service('VMWARE_VCENTER', config.integrationId, config.host).instance;
      service.powerOnVM = async vmId => { calls.push({ configId: config.integrationId, vmId }); return { success: true }; }; return service;
    } } },
  }, { console: quiet, globalThis: {} });
  const route = load('app/api/integrations/vmware/route.ts');
  for (const row of profiles) {
    for (const type of ['capacity-trends', 'growth-forecast']) {
      const response = await route.GET(new NextRequest(`http://fixture.invalid/api/integrations/vmware?type=${type}&configId=${row.id}`));
      assert.equal(response.status, 200); const body = await response.json();
      const result = body.trends || body.forecast; assert.equal(result.length, 1); assert.equal(result[0].resourceName, row.id);
      assert.equal(queries.at(-1).sourceScope, f.scope('VMWARE_VCENTER', row.id, row.config.host));
    }
    const response = await route.POST(new NextRequest('http://fixture.invalid/api/integrations/vmware', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'vm-power', operation: 'on', vmId: 'vm-1', configId: row.id }),
    })); assert.equal(response.status, 200);
  }
  assert.deepEqual(calls.map(c => c.configId), profiles.map(r => r.id));
  assert.equal((await route.POST(new NextRequest('http://fixture.invalid/api/integrations/vmware', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'vm-power', operation: 'on', vmId: 'vm-1' }) }))).status, 409);
  assert.equal(calls.length, 2);
});
async function main() {
  let failed = 0;
  for (const [name, run] of tests) { try { await run(); console.log('PASS ' + name); } catch (error) { failed++; console.error('FAIL ' + name, error); } }
  assert.equal(failed, 0); console.log(`Inventory source scope regressions passed (${tests.length} scenarios; no external I/O).`);
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { memoryDatabase, sourceFixture, normalizationVectors };
