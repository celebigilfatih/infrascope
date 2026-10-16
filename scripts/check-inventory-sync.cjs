// Actual inventory services/API routes with synthetic source, ORM, clock and metadata faults.
const assert = require('node:assert/strict');
const { NextRequest, NextResponse } = require('next/server');
const { moduleLoader } = require('./check-alarm-occurrences.cjs');
const quiet = new Proxy({}, { get: () => () => {} });
const record = (kind, i = 1) => kind === 'hosts'
  ? { host: { value: `host-${i}` }, hostid: String(i), name: `fixture-host-${i}`, status: '0', inventory: {}, summary: {} }
  : kind === 'clusters' ? { cluster: { value: `cluster-${i}` }, name: `fixture-cluster-${i}`, summary: {} }
  : kind === 'vms' ? { vm: { value: `vm-${i}` }, name: `fixture-vm-${i}`, summary: {} }
  : kind === 'datastores' ? { datastore: { value: `datastore-${i}` }, name: `fixture-datastore-${i}`, summary: {}, info: {} }
  : kind === 'interfaces' ? { interfaceid: String(i), hostid: '1', type: 1, port: String(1000 + i), ip: '192.0.2.1' }
  : { triggerid: String(i), hosts: [{ hostid: '1' }], description: 'Fixture', priority: 1, status: '0', value: 0, lastchange: 0 };

function fixture(type = 'vmware', module = 'hosts', options = {}) {
  const state = { writes: [], logs: [], metadata: null, sourceCalls: [], clock: 0,
    source: Object.fromEntries(['clusters', 'hosts', 'vms', 'datastores', 'interfaces', 'triggers'].map(k => [k, []])),
    failWrites: new Set(), auth: true, transactionCalls: 0 };
  state.source[module] = [record(module, 1), record(module, 2)];
  const config = type === 'vmware'
    ? { integrationId: 'fixture-config', host: 'vc.fixture.invalid', username: 'fixture-reader', password: 'fixture-secret', pollingInterval: 10,
      enabledModules: { datacenters: false, clusters: module === 'clusters', hosts: module === 'hosts', vms: module === 'vms', datastores: module === 'datastores' } }
    : { integrationId: 'fixture-config', url: 'https://zabbix.fixture.invalid', authToken: 'fixture-token', pollingInterval: 5,
      enabledModules: { hosts: true, interfaces: true, triggers: module === 'triggers', items: false } };
  const configRow = { id: 'fixture-config', type: type === 'vmware' ? 'VMWARE_VCENTER' : 'ZABBIX',
    enabled: true, config, syncInterval: 10, name: 'Fixture' };
  const identity = data => data.vmwareMoref || data.zabbixHostId || data.vcenterId || data.name || data.id;
  const write = (table, operation, data) => {
    const id = identity(data);
    if (state.failWrites.has(`${table}:*`) || state.failWrites.has(`${table}:${id}`)) throw new Error('Fixture item write failed');
    state.writes.push({ table, operation, id }); return { id: `fixture-${id}`, ...data };
  };
  const prisma = {
    device: {
      findFirst: async ({ where }) => {
        if (state.lookupFailure) throw new Error('Fixture database lookup failed');
        const id = where.vmwareMoref || where.zabbixHostId;
        const exists = state.existing || state.writes.some(w => w.table === 'device' && w.id === id);
        return exists ? { id: `fixture-${id}` } : null;
      },
      create: async ({ data }) => write('device', 'create', data), update: async ({ data }) => write('device', 'update', data),
    },
    vMwareCluster: { findFirst: async () => state.existing ? { id: 'fixture-cluster' } : null,
      create: async ({ data }) => write('cluster', 'create', data), update: async ({ data }) => write('cluster', 'update', data) },
    vMwareDatastore: { upsert: async ({ create }) => write('datastore', 'upsert', create) },
    networkInterface: { upsert: async ({ create }) => write('interface', 'upsert', create) },
    zabbixTrigger: { upsert: async ({ create }) => write('trigger', 'upsert', create) },
    organization: { findFirst: async () => ({ id: 'fixture-org' }) },
    integrationConfig: {
      findFirst: async () => configRow, findMany: async () => [{ ...configRow, ...state.metadata, createdAt: new Date() }],
      update: async ({ data }) => { if (state.metadataFailure === 'config') throw new Error('Fixture metadata config failure');
        state.metadata = data; return { ...configRow, ...data }; },
    },
    integrationSyncLog: { create: async ({ data }) => { if (state.metadataFailure === 'log') throw new Error('Fixture metadata log failure');
      state.logs.push(data); return { id: 'fixture-log', ...data }; } },
    $transaction: async callback => {
      state.transactionCalls++; const before = structuredClone({ logs: state.logs, metadata: state.metadata });
      try { return await callback(prisma); } catch (error) { Object.assign(state, before); throw error; }
    },
  };
  class Clock extends Date { static now() { state.clock += 10; return state.clock; } }
  const load = moduleLoader({
    ...(options.recordSync ? { '@/lib/integrations/sync-log': { recordInventorySync: options.recordSync } } : {}),
    'next/server': { NextRequest, NextResponse }, '@/lib/prisma': { prisma },
    '@prisma/client': { ...require('@prisma/client'), PrismaClient: class { constructor() { return prisma; } } },
    '@/lib/logger': { createLogger: () => quiet }, '@/lib/security/tls': {}, '@/lib/integrations/vmware-python': { isVMwarePythonError: () => false },
    '@/lib/auth/api-permission': { authorizeApiRequest: async () => ({ allowed: true, auth: { role: 'ADMIN' } }) },
    '@/lib/auth/permission-policy': { canAccessSync: () => true }, '@/lib/validators': {}, '@/lib/validators/integrations': {},
  }, { Date: Clock, console: quiet, globalThis: {} });
  const Service = load(`lib/integrations/${type}.ts`)[type === 'vmware' ? 'VMwareService' : 'ZabbixService'];
  Service.prototype.authenticate = async () => state.auth;
  for (const kind of ['clusters', 'hosts', 'vms', 'datastores', 'interfaces', 'triggers']) {
    const method = kind === 'vms' ? 'fetchVMs' : 'fetch' + kind[0].toUpperCase() + kind.slice(1);
    Service.prototype[method] = async () => { state.sourceCalls.push(kind); if (state.failSource === kind) throw new Error('Fixture source unavailable'); return state.source[kind]; };
  }
  const service = new Service(config);
  const post = () => load(`app/api/integrations/${type}/route.ts`).POST(new NextRequest(`http://fixture.invalid/api/integrations/${type}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync' }),
  }));
  return { state, config, configRow, prisma, load, service, post, newService: () => new Service(config) };
}
const tests = [], test = (name, fn) => tests.push([name, fn]);
function checkResult(result, status, processed, errors) {
  assert.equal(result.status, status); assert.equal(result.success, status === 'success');
  assert.equal(result.itemsProcessed, processed); assert.equal(result.errorCount, errors); assert.equal(result.errors.length, errors);
  assert.ok(result.itemsCreated + result.itemsUpdated <= processed); assert.ok(result.duration > 0);
}
for (const type of ['vmware', 'zabbix']) {
  test(`repro ${type}: one failed host cannot report full success`, async () => {
    const f = fixture(type); f.state.failWrites.add(`device:${type === 'vmware' ? 'host-1' : '1'}`);
    const result = await f.service.syncToInventory('fixture-org');
    assert.equal(result.success, false); assert.equal(result.status, 'partial'); assert.equal(result.hostsCreated, 1);
  });
  for (const mode of ['create', 'update', 'empty', 'all-writes-fail', 'lookup-fails', 'auth-fails', 'source-fails']) {
    test(`${type}: ${mode} retains exact outcome and counts`, async () => {
      const f = fixture(type);
      if (mode === 'update') f.state.existing = true;
      if (mode === 'empty') f.state.source.hosts = [];
      if (mode === 'all-writes-fail') f.state.failWrites.add('device:*');
      if (mode === 'lookup-fails') f.state.lookupFailure = true;
      if (mode === 'auth-fails') f.state.auth = false;
      if (mode === 'source-fails') f.state.failSource = 'hosts';
      const result = await f.service.syncToInventory('fixture-org');
      if (mode === 'empty') checkResult(result, 'success', 0, 0);
      else if (['create', 'update'].includes(mode)) {
        checkResult(result, 'success', 2, 0); assert.equal(result[mode === 'create' ? 'itemsCreated' : 'itemsUpdated'], 2);
      } else checkResult(result, 'failed', 0, ['all-writes-fail', 'lookup-fails'].includes(mode) ? 2 : 1);
      assert.equal(f.state.writes.length, result.itemsProcessed);
      if (mode === 'auth-fails') assert.equal(f.state.sourceCalls.length, 0);
    });
  }
  for (const status of ['success', 'partial', 'failed']) test(`${type}: API, log and last metadata agree on ${status}`, async () => {
    const f = fixture(type);
    if (status === 'partial') f.state.failWrites.add(`device:${type === 'vmware' ? 'host-1' : '1'}`);
    if (status === 'failed') f.state.auth = false;
    const response = await f.post(); assert.equal(response.status, 200); const body = await response.json();
    checkResult(body, status, status === 'success' ? 2 : status === 'partial' ? 1 : 0, status === 'success' ? 0 : 1);
    assert.equal(f.state.transactionCalls, 1); assert.equal(f.state.logs.length, 1);
    const log = f.state.logs[0]; assert.equal(log.status, status); assert.equal(f.state.metadata.lastSyncStatus, status);
    assert.equal(log.completedAt.getTime(), f.state.metadata.lastSyncAt.getTime());
    assert.equal(log.itemsProcessed, body.itemsProcessed); assert.equal(log.itemsCreated, body.itemsCreated); assert.equal(log.itemsUpdated, body.itemsUpdated);
    assert.equal(log.errorDetails.errorCount, body.errorCount); assert.equal(log.message, body.errors.length ? body.errors.join('; ') : null);
  });
  for (const failure of ['log', 'config']) test(`${type}: ${failure} persistence failure returns HTTP error without contradictory metadata`, async () => {
    const f = fixture(type); f.state.metadataFailure = failure;
    assert.equal((await f.post()).status, 500); assert.equal(f.state.logs.length, 0); assert.equal(f.state.metadata, null);
    assert.equal(f.state.writes.length, 2, 'Inventory progress is independent of metadata rollback');
  });
  test(`${type}: a retry can recover after a partial run and records a separate complete attempt`, async () => {
    const f = fixture(type); f.state.failWrites.add('device:' + (type === 'vmware' ? 'host-1' : '1'));
    assert.equal((await (await f.post()).json()).status, 'partial'); f.state.failWrites.clear();
    assert.equal((await (await f.post()).json()).status, 'success');
    assert.deepEqual(f.state.logs.map(l => l.status), ['partial', 'success']); assert.equal(f.state.metadata.lastSyncStatus, 'success');
  });
}
for (const module of ['clusters', 'hosts', 'vms', 'datastores']) {
  const table = module === 'clusters' ? 'cluster' : module === 'datastores' ? 'datastore' : 'device';
  const id = module === 'clusters' ? 'cluster-1' : module === 'datastores' ? 'datastore-1' : module === 'vms' ? 'vm-1' : 'host-1';
  for (const outcome of ['success', 'partial', 'failed']) test(`VMware ${module}: ${outcome} includes every acknowledged write in processed totals`, async () => {
    const f = fixture('vmware', module);
    if (outcome === 'partial') f.state.failWrites.add(`${table}:${id}`);
    if (outcome === 'failed') f.state.failWrites.add(`${table}:*`);
    const response = await f.post(); assert.equal(response.status, 200); const result = await response.json();
    checkResult(result, outcome, outcome === 'success' ? 2 : outcome === 'partial' ? 1 : 0, outcome === 'success' ? 0 : outcome === 'partial' ? 1 : 2);
    assert.equal(f.state.logs[0].itemsProcessed, f.state.writes.length);
    if (module === 'datastores') assert.equal(result.itemsCreated + result.itemsUpdated, 0, 'Upsert classification must not be invented');
  });
}
test('VMware upstream failure after earlier progress is partial', async () => {
  const f = fixture('vmware', 'clusters'); f.config.enabledModules.hosts = true; f.state.failSource = 'hosts';
  const result = await f.newService().syncToInventory('fixture-org'); checkResult(result, 'partial', 2, 1);
});
for (const module of ['interfaces', 'triggers']) {
  for (const outcome of ['success', 'partial', 'failed']) test(`Zabbix ${module}: ${outcome} includes auxiliary writes`, async () => {
    const f = fixture('zabbix', module); f.state.existing = true;
    if (outcome !== 'failed') f.state.source.hosts = [record('hosts')];
    if (outcome === 'partial' || outcome === 'failed') f.state.failWrites.add(`${module === 'interfaces' ? 'interface' : 'trigger'}:*`);
    if (module === 'interfaces' && outcome === 'failed') {
      // Hosts must exist for their interfaces to be attempted; fail before any write.
      f.state.source.hosts = [record('hosts')]; f.state.failWrites.add('device:*');
    }
    const result = await f.service.syncToInventory('fixture-org');
    checkResult(result, outcome, outcome === 'success' ? 3 : outcome === 'partial' ? 1 : 0, outcome === 'success' ? 0 : 1);
    if (outcome === 'success') assert.equal(result.itemsUpdated, 1);
  });
}
test('Zabbix upstream trigger failure after host writes is partial', async () => {
  const f = fixture('zabbix'); f.config.enabledModules.triggers = true; f.state.failSource = 'triggers';
  checkResult(await f.newService().syncToInventory('fixture-org'), 'partial', 2, 1);
});
test('VMware no enabled inventory modules is a successful no-op without fabricated progress', async () => {
  const f = fixture('vmware'); f.config.enabledModules.hosts = false;
  checkResult(await f.newService().syncToInventory('fixture-org'), 'success', 0, 0); assert.equal(f.state.writes.length, 0);
});
test('status summaries flag partial metadata as incomplete', async () => {
  const f = fixture(); f.state.metadata = { lastSyncStatus: 'partial', lastSyncAt: new Date() };
  const result = await (await f.load('app/api/integrations/status/route.ts').GET(new NextRequest('http://fixture.invalid/api/integrations/status'))).json();
  const integration = result.data.find(r => r.id === 'fixture-config');
  assert.equal(integration.status, 'error'); assert.match(integration.message, /kısmen/);
});
test('all three outcome labels are distinct and Turkish', () => {
  const f = fixture(), { inventorySyncLabel } = f.load('lib/integrations/sync-outcome.ts');
  assert.equal(inventorySyncLabel('success'), 'Senkronizasyon tamamlandı');
  assert.equal(inventorySyncLabel('partial'), 'Senkronizasyon kısmen tamamlandı');
  assert.equal(inventorySyncLabel('failed'), 'Senkronizasyon başarısız');
});
function renderPage(result) {
  const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), ts = require('typescript');
  const React = require('react'); let stateIndex = 0;
  const react = { ...React, useEffect: () => {}, useState: initial => [++stateIndex === 3 ? result : typeof initial === 'function' ? initial() : initial, () => {}] };
  const component = ({ children }) => React.createElement('div', null, children);
  const jsx = fs.readFileSync(path.join(__dirname, '../app/integrations/vmware/page.tsx'), 'utf8');
  const compiled = ts.transpileModule(jsx, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const fixtureModules = fixture().load;
  const module = { exports: {} }, outcomes = fixtureModules('lib/integrations/sync-outcome.ts');
  const localRequire = name => {
    if (name === 'react') return react;
    if (name === '@/lib/integrations/sync-outcome') return outcomes;
    if (name === '@/lib/i18n/tr') return fixtureModules('lib/i18n/tr.ts');
    if (name === 'lucide-react') return new Proxy({}, { get: (_t, key) => props => React.createElement('svg', { ...props, 'data-icon': key }) });
    if (name.startsWith('@/components/ui/')) return new Proxy({}, { get: (_t, key) => key === 'TabsContent'
      ? ({ value, children }) => value === 'sync' ? component({ children }) : null : component });
    throw new Error('Unapproved page fixture dependency: ' + name);
  };
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, { console: quiet })(localRequire, module, module.exports);
  return require('react-dom/server').renderToStaticMarkup(React.createElement(module.exports.default));
}
for (const status of ['success', 'partial', 'failed']) test(`actual VMware page renders ${status} with the correct icon, totals and label`, async () => {
  const f = fixture(); if (status === 'partial') f.state.failWrites.add('device:host-1'); if (status === 'failed') f.state.auth = false;
  const result = await f.service.syncToInventory('fixture-org'), html = renderPage(result);
  assert.ok(html.includes(f.load('lib/integrations/sync-outcome.ts').inventorySyncLabel(status)));
  assert.match(html, new RegExp(`data-icon="${status === 'success' ? 'CheckCircle' : status === 'partial' ? 'AlertCircle' : 'XCircle'}"`));
  assert.ok(html.includes(`${result.itemsProcessed} öğe işlendi · ${result.errorCount} hata`));
});
test('initial VMware page cannot claim a sync or invent zero processed counts', () => {
  const html = renderPage(null); assert.ok(html.includes('—'));
  assert.ok(!html.includes('Senkronizasyon tamamlandı')); assert.ok(!html.includes('öğe işlendi'));
});
async function main() { let failed = 0; for (const [name, fn] of tests) { try { await fn(); console.log('PASS ' + name); }
  catch (error) { failed++; console.error('FAIL ' + name); console.error(error); } }
  assert.equal(failed, 0); console.log(`Inventory sync regressions passed (${tests.length} scenarios; synthetic source/ORM, no external I/O).`); }
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { fixture, record, tests, test };
