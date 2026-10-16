// Real scheduler/coordinator/API/source resolution. Synthetic clock, source clients, license and ORM.
const assert = require('node:assert/strict');
const { NextRequest, NextResponse } = require('next/server');
const { moduleLoader } = require('./check-alarm-occurrences.cjs');
const quiet = new Proxy({}, { get: () => () => {} });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 200; i++) await Promise.resolve(); };
function fixture(options = {}) {
  const state = { now: Date.parse('2026-10-16T12:00:00Z'), rows: [], calls: [], logs: [], events: [], timers: new Map(), license: true, global: {},
    active: 0, peak: 0, cleanups: 0, queries: 0, nextTimer: 0 };
  const profile = type => type === 'FORTIGATE' ? { host: 'fg.fixture.invalid', accessToken: 'fixture-fg-token', pollingInterval: 999, syncMode: 'rest',
    enabledModules: { interfaces: true, vlans: false, policies: false, addresses: false, vips: false, sdwan: false } }
    : type === 'ZABBIX' ? { url: 'https://z.fixture.invalid', authToken: 'fixture-token', pollingInterval: 999,
    enabledModules: { hosts: true, interfaces: true, triggers: false, items: false } }
    : { host: 'vc.fixture.invalid', username: 'fixture-reader', password: 'fixture-password', pollingInterval: 999,
      enabledModules: { clusters: true, hosts: true, vms: true, datastores: true, datacenters: true } };
  const add = (type = 'VMWARE_VCENTER', interval = 1) => { const row = { id: `fixture-${type}-${state.rows.length}`, type, name: 'fixture', enabled: true,
    syncInterval: interval, config: profile(type), createdAt: new Date(state.now), lastSyncAt: null };
    state.rows.push(row); return row; };
  const prisma = {
    integrationConfig: {
      findMany: async ({ where }) => { state.queries++; if (state.scanGate) await state.scanGate.promise; if (state.dbFail) throw new Error('Fixture DB failure');
        return structuredClone(state.rows.filter(r => r.enabled && (typeof where.type === 'string' ? where.type === r.type : where.type.in.includes(r.type))
          && (!where.id || r.id === where.id))); },
      findUnique: async ({ where }) => { if (state.reload) state.reload(); return structuredClone(state.rows.find(r => r.id === where.id) || null); },
      findFirst: async ({ where }) => structuredClone(state.rows.find(r => r.type === where.type && (!where.enabled || r.enabled)
        && (!where.name || r.name === where.name)) || null),
      update: async ({ where, data }) => { if (state.metadataFail) throw new Error('Fixture metadata failure'); return Object.assign(state.rows.find(r => r.id === where.id), data); },
      upsert: async ({ where, create, update }) => { const row = state.rows.find(r => r.type === where.type_name.type && r.name === where.type_name.name);
        if (row) return Object.assign(row, structuredClone(update)); const fresh = add(create.type); Object.assign(fresh, structuredClone(create)); return fresh; },
    },
    organization: { findFirst: async () => state.noOrg ? null : { id: 'fixture-org' } },
    integrationSyncLog: { create: async ({ data }) => { state.logs.push(structuredClone(data)); return data; } },
    $transaction: async callback => { const before = structuredClone({ rows: state.rows, logs: state.logs });
      try { return await callback(prisma); } catch (error) { state.rows = before.rows; state.logs = before.logs; throw error; } },
  };
  const source = (type, config) => ({
    syncToInventory: async org => {
      state.active++; state.peak = Math.max(state.peak, state.active); state.calls.push({ type, config: structuredClone(config), org });
      try { if (state.gate) await state.gate.promise; if (state.throwSource) throw new Error('Fixture source failure');
        const failed = state.failSource || state.failTypes?.has(type);
        const errors = failed ? ['Fixture source denied'] : [];
        const processed = failed ? 0 : 1;
        return { success: !errors.length, status: errors.length ? 'failed' : 'success', itemsProcessed: processed,
          itemsCreated: processed, itemsUpdated: 0, errorCount: errors.length, errors, duration: 10,
          clustersCreated: 0, clustersUpdated: 0, hostsCreated: processed, hostsUpdated: 0, vmsCreated: 0, vmsUpdated: 0,
          datastoresProcessed: 0, interfacesProcessed: processed, vlansProcessed: 0, policiesProcessed: 0, addressesProcessed: 0 };
      } finally { state.active--; }
    }, closeSession: async () => { state.cleanups++; if (state.cleanupFail) throw new Error('Fixture cleanup failure'); },
  });
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [state.now])); } static now() { return state.now; } }
  const dependencies = {
    'next/server': { NextRequest, NextResponse }, '@/lib/prisma': { prisma: options.database || prisma }, '@/lib/logger': { createLogger: () => quiet },
    '@/lib/license/client': { isLicenseValid: () => state.license },
    '@/lib/integrations/vmware': { VMwareService: class { constructor(config) { return source('VMWARE_VCENTER', config); } } },
    '@/lib/integrations/zabbix': { ZabbixService: class { constructor(config) { return source('ZABBIX', config); } } },
    '@/lib/integrations/fortigate': {},
    '@/lib/firewall/connector-factory': {
      getFortiGateConnector: async ({ configId } = {}) => { const row = state.rows.find(r => r.id === configId) || state.rows.find(r => r.type === 'FORTIGATE');
        return { service: source('FORTIGATE', { configId: configId || row?.id }), integration: row, target: { configId: configId || row?.id, vdom: 'root' } }; },
      fortiGateTargetSelectorFromUrl: url => load('lib/firewall/target.ts').fortiGateTargetSelectorFromUrl(url),
      clearFortiGateConnectors: async () => {},
    },
    '@/lib/integrations/vmware-python': { isVMwarePythonError: () => false },
    '@/lib/auth/api-permission': { authorizeApiRequest: async () => ({ allowed: true, auth: { role: 'ADMIN' } }) },
    '@/lib/auth/permission-policy': { canAccessSync: () => true },
    '@/lib/validators': { validateBody: (body, schema) => { const r = schema.safeParse(body); return r.success ? { success: true, data: r.data } : { success: false, error: 'Invalid fixture' }; } },
    zod: require('zod'),
  };
  const globals = { Date: Clock, console: quiet, globalThis: state.global, setInterval: (fn, ms) => { const id = ++state.nextTimer; state.timers.set(id, { fn, ms }); return id; },
    clearInterval: id => state.timers.delete(id) };
  const load = moduleLoader(dependencies, globals), scheduler = load('lib/integrations/inventory-scheduler.ts');
  const post = (type, body) => load(`app/api/integrations/${type}/route.ts`).POST(new NextRequest('http://fixture.invalid/api/integrations/' + type,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  return { state, add, load, scheduler, cycle: scheduler.runInventorySyncCycle, post,
    reload: () => moduleLoader(dependencies, globals)('lib/integrations/inventory-scheduler.ts') };
}
const tests = [], test = (name, fn) => tests.push([name, fn]);
for (const type of ['VMWARE_VCENTER', 'ZABBIX', 'FORTIGATE']) {
  test(`${type}: saved minute interval controls real due work and completion re-arms it`, async () => {
    const f = fixture(); f.add(type, 2); f.state.now += 119999; assert.equal((await f.cycle()).attempted, 0);
    f.state.now++; assert.equal((await f.cycle()).attempted, 1); assert.equal(f.state.calls.length, 1);
    assert.equal(f.state.logs[0].status, 'success'); f.state.now += 119999; await f.cycle(); assert.equal(f.state.calls.length, 1);
    f.state.now++; await f.cycle(); assert.equal(f.state.calls.length, 2);
  });
  test(`${type}: multiple enabled targets follow their inventory identity isolation contract`, async () => {
    const f = fixture(); f.add(type); f.add(type); f.state.now += 60000;
    const isolated = type !== 'FORTIGATE';
    assert.equal((await f.cycle()).skipped, isolated ? 0 : 2); assert.equal(f.state.calls.length, isolated ? 2 : 0);
    if (isolated) assert.equal(new Set(f.state.calls.map(c => c.config.integrationId)).size, 2);
  });
}
test('saved relational interval overrides stale JSON interval in VMware and Zabbix clients', async () => {
  const f = fixture(); f.add(); f.add('ZABBIX', 2); f.state.now += 120000; await f.cycle();
  assert.equal(f.state.calls.find(c => c.type === 'VMWARE_VCENTER').config.pollingInterval, 1);
  assert.equal(f.state.calls.find(c => c.type === 'ZABBIX').config.pollingInterval, 2);
});
for (const type of ['vmware', 'zabbix']) test(`${type}: actual save changes due time without a restart and preserves encrypted credentials`, async () => {
  const f = fixture(), row = f.add(type === 'vmware' ? 'VMWARE_VCENTER' : 'ZABBIX', 10);
  const config = { ...row.config, pollingInterval: 2 }; await f.post(type, { action: 'save-config', name: row.name, config });
  assert.match(row.config[type === 'vmware' ? 'password' : 'authToken'], /^enc:v1:/);
  f.state.now += 120000; await f.cycle(); assert.equal(f.state.calls.length, 1);
  assert.equal(f.state.calls[0].config[type === 'vmware' ? 'password' : 'authToken'], config[type === 'vmware' ? 'password' : 'authToken']);
  await f.post(type, { action: 'save-config', name: row.name, config: { ...config, pollingInterval: 5 } });
  f.state.now += 120000; await f.cycle(); assert.equal(f.state.calls.length, 1);
  f.state.now += 180000; await f.cycle(); assert.equal(f.state.calls.length, 2);
});
for (const value of [0, -1, 1.5, 1441, '2', null]) test(`invalid saved interval ${String(value)} cannot start a source`, async () => {
  const f = fixture(); f.add('ZABBIX', value); f.state.now += 90000000; assert.equal((await f.cycle()).skipped, 1); assert.equal(f.state.calls.length, 0);
});
for (const mode of ['disabled', 'deleted', 'license', 'DB-error']) test(`${mode} prevents automatic source work`, async () => {
  const f = fixture(), row = f.add(); f.state.now += 60000;
  if (mode === 'disabled') row.enabled = false; if (mode === 'deleted') f.state.rows = [];
  if (mode === 'license') f.state.license = false; if (mode === 'DB-error') f.state.dbFail = true;
  if (mode === 'DB-error') await assert.rejects(f.cycle()); else await f.cycle(); assert.equal(f.state.calls.length, 0);
});
for (const change of ['disable', 'extend', 'delete']) test(`re-read before work honors late ${change} without pushing the next due time`, async () => {
  const f = fixture(), row = f.add(); f.state.now += 60000;
  f.state.reload = () => { if (change === 'disable') row.enabled = false; else if (change === 'extend') row.syncInterval = 2; else f.state.rows = []; };
  await f.cycle(); assert.equal(f.state.calls.length, 0); f.state.reload = null;
  if (change === 'extend') { f.state.now += 60000; await f.cycle(); assert.equal(f.state.calls.length, 1); }
});
test('one global timer and cycle survive repeated start/module reload; actual callback dispatches due work', async () => {
  const f = fixture(); f.add(); f.scheduler.startInventorySyncScheduler(); f.scheduler.startInventorySyncScheduler(); f.reload().startInventorySyncScheduler();
  assert.equal(f.state.timers.size, 1); assert.equal([...f.state.timers.values()][0].ms, 15000);
  f.state.now += 60000; [...f.state.timers.values()][0].fn(); await flush(); assert.equal(f.state.calls.length, 1);
  f.scheduler.stopInventorySyncScheduler(); assert.equal(f.state.timers.size, 0);
});
test('same in-flight cycle is returned and concurrency is capped at two', async () => {
  const f = fixture(); f.add(); f.add('ZABBIX'); f.add('FORTIGATE'); f.state.now += 60000; f.state.gate = deferred();
  const a = f.cycle(), b = f.reload().runInventorySyncCycle(); assert.equal(a, b); await flush(); assert.equal(f.state.calls.length, 2);
  f.state.gate.resolve(); await a; assert.equal(f.state.calls.length, 3); assert.equal(f.state.peak, 2);
});
for (const type of ['vmware', 'zabbix']) test(`${type}: scheduled/manual overlap returns 409 and releases only after real completion`, async () => {
  const f = fixture(); f.add(type === 'vmware' ? 'VMWARE_VCENTER' : 'ZABBIX'); f.state.now += 60000; f.state.gate = deferred();
  const pending = f.cycle(); await flush(); const response = await f.post(type, { action: 'sync' });
  assert.equal(response.status, 409); assert.equal(f.state.calls.length, 1); f.state.gate.resolve(); await pending;
  assert.equal((await f.post(type, { action: 'sync' })).status, 200);
});
test('manual completion resets automatic due time through the same shared coordinator', async () => {
  const f = fixture(); f.add(); f.state.now += 50000; assert.equal((await f.post('vmware', { action: 'sync' })).status, 200);
  f.state.now += 10000; await f.cycle(); assert.equal(f.state.calls.length, 1); f.state.now += 50000; await f.cycle(); assert.equal(f.state.calls.length, 2);
});
test('metadata failure is not retried on every scan; ordinary source failure preserves failed metadata', async () => {
  const f = fixture(); f.add(); f.state.now += 60000; f.state.metadataFail = true;
  assert.equal((await f.cycle()).failed, 1); f.state.now += 15000; await f.cycle(); assert.equal(f.state.calls.length, 1);
  f.state.now += 45000; f.state.metadataFail = false; f.state.failSource = true; await f.cycle();
  assert.equal(f.state.logs.at(-1).status, 'failed'); assert.equal(f.state.calls.length, 2);
});
test('stop fences late DB results and does not start a source', async () => {
  const f = fixture(); f.add(); f.state.now += 60000; f.state.scanGate = deferred(); const p = f.cycle();
  f.scheduler.stopInventorySyncScheduler(); f.state.scanGate.resolve(); await p; assert.equal(f.state.calls.length, 0);
});
test('stop keeps running source locks, suppresses queued sources and restart re-arms later', async () => {
  const f = fixture(); f.add(); f.add('ZABBIX'); f.add('FORTIGATE'); f.state.now += 60000; f.state.gate = deferred();
  const p = f.cycle(); await flush(); f.scheduler.stopInventorySyncScheduler();
  assert.equal((await f.post('vmware', { action: 'sync' })).status, 409); f.state.gate.resolve(); await p; assert.equal(f.state.calls.length, 2);
  f.state.gate = null; f.scheduler.startInventorySyncScheduler(); await f.cycle(); assert.equal(f.state.calls.length, 3);
  f.scheduler.stopInventorySyncScheduler();
});
test('VMware owned session is closed after an unexpected collector exception and failed outcome is recorded', async () => {
  const f = fixture(); f.add(); f.state.now += 60000; f.state.throwSource = true; await f.cycle();
  assert.equal(f.state.cleanups, 1); assert.equal(f.state.logs[0].status, 'failed');
});
test('FortiGate manual sync uses the same coordinator exclusion as scheduled sync', async () => {
  const f = require('./check-fortigate-snmp.cjs').fixture(), gate = deferred();
  const p = f.load('lib/integrations/sync-coordinator.ts').withInventorySync('FORTIGATE', 'config-a', () => gate.promise);
  try { assert.equal((await f.post()).status, 409); assert.equal(f.state.inventory.length, 0); }
  finally { gate.resolve(); await p; }
});
test('real FortiGate connector uses the relational interval over a stale JSON copy', async () => {
  const f = require('./check-fortigate-snmp.cjs').fixture();
  f.state.configs[0].config.pollingInterval = 999; f.state.configs[0].syncInterval = 2;
  assert.equal((await f.connector()).config.pollingInterval, 2);
});
test('startup registers inventory work only after credential migration and initializers; license-server mode skips it', async () => {
  const events = [], state = { licenseServer: false }, mark = name => async () => { events.push(name); };
  const load = moduleLoader({
    '@/lib/license/server-mode': { isLicenseServerMode: () => state.licenseServer },
    '@/lib/security/integration-credential-migration': { migrateIntegrationCredentials: mark('credentials') },
    '@/lib/alarms/alarm-catalog': { syncAlarmCatalog: mark('catalog') },
    '@/lib/alarms/alarm-runner': { initializeAlarmRunner: mark('runner') },
    '@/lib/alarm-scheduler': { startAlarmScheduler: mark('alarms') },
    '@/lib/alarms/alarm-monitor': { startAlarmMonitor: mark('monitor') },
    '@/lib/alarms/retention-service': { startAlarmRetentionScheduler: mark('retention') },
    '@/lib/firewall/recovery-scheduler': { startFirewallRecoveryScheduler: mark('firewall') },
    '@/lib/integrations/inventory-scheduler': { startInventorySyncScheduler: mark('inventory') },
  });
  await load('instrumentation-node.ts').registerNodeInstrumentation();
  assert.deepEqual(events, ['credentials', 'catalog', 'runner', 'alarms', 'monitor', 'retention', 'firewall', 'inventory']);
  events.length = 0; state.licenseServer = true; await load('instrumentation-node.ts').registerNodeInstrumentation(); assert.equal(events.length, 0);
});
for (const type of ['vmware', 'zabbix']) for (const interval of [0, 1.5, 1441]) test(`${type}: invalid interval ${interval} is rejected by actual settings save`, async () => {
  const f = fixture(), row = f.add(type === 'vmware' ? 'VMWARE_VCENTER' : 'ZABBIX');
  assert.equal((await f.post(type, { action: 'save-config', name: row.name, config: { ...row.config, pollingInterval: interval } })).status, 400);
  assert.equal(row.syncInterval, 1);
});
test('FortiGate actual settings save changes automatic due time and encrypts its token', async () => {
  const f = fixture(), row = f.add('FORTIGATE', 10);
  assert.equal((await f.post('fortigate', { action: 'save-config', configId: row.id, name: row.name, config: { ...row.config, pollingInterval: 1 } })).status, 200);
  assert.equal(row.syncInterval, 1); assert.match(row.config.accessToken, /^enc:v1:/);
  f.state.now += 60000; await f.cycle(); assert.equal(f.state.calls.length, 1);
});
for (const interval of [0, 1.5, 1441]) test(`FortiGate invalid interval ${interval} is rejected before save`, async () => {
  const f = fixture(), row = f.add('FORTIGATE');
  assert.equal((await f.post('fortigate', { action: 'save-config', configId: row.id, config: { ...row.config, pollingInterval: interval } })).status, 400);
  assert.equal(row.syncInterval, 1);
});
for (const failure of ['wrong-key', 'no-organization']) test(`${failure} records a failed scheduled attempt without a remote login`, async () => {
  const f = fixture(), row = f.add(); f.state.now += 60000;
  if (failure === 'wrong-key') row.config.password = 'enc:v1:i:broken'; else f.state.noOrg = true;
  assert.equal((await f.cycle()).failed, 1); assert.equal(f.state.calls.length, 0); assert.equal(f.state.logs[0].status, 'failed');
});
test('VMware interval edits invalidate the actual previous cache scope when legacy JSON disagrees', async () => {
  const f = fixture(), row = f.add(), cache = f.load('lib/integrations/vmware-cache.ts');
  const previous = f.load('lib/integrations/vmware-source.ts').createSavedVMwareSource(row).scope;
  cache.cacheVMwareValue(previous, 'fixture-resource', { source: 'fixture-old' }, 300000);
  assert.ok(cache.getVMwareCachedValue(previous, 'fixture-resource'));
  assert.equal((await f.post('vmware', { action: 'save-config', name: row.name, config: { ...row.config, pollingInterval: 2 } })).status, 200);
  assert.equal(cache.getVMwareCachedValue(previous, 'fixture-resource'), undefined);
});
test('VMware configuration UI reads the authoritative saved interval without a source login', async () => {
  const f = fixture(); f.add('VMWARE_VCENTER', 2);
  const response = await f.load('app/api/integrations/vmware/route.ts').GET(new NextRequest('http://fixture.invalid/api/integrations/vmware?type=config'));
  assert.equal((await response.json()).config.pollingInterval, 2); assert.equal(f.state.calls.length, 0);
});
test('manual-first overlap skips the scheduled start and manual completion re-arms the timer', async () => {
  const f = fixture(); f.add(); f.state.now += 60000; f.state.gate = deferred();
  const p = f.post('vmware', { action: 'sync' }); await flush();
  assert.equal((await f.cycle()).skipped, 1); assert.equal(f.state.calls.length, 1);
  f.state.gate.resolve(); await p; f.state.now += 15000; await f.cycle(); assert.equal(f.state.calls.length, 1);
});
test('a failed source does not suppress the other source or its successful metadata', async () => {
  const f = fixture(); f.add(); f.add('ZABBIX'); f.state.now += 60000; f.state.failTypes = new Set(['VMWARE_VCENTER']);
  const result = await f.cycle(); assert.equal(result.attempted, 2); assert.equal(result.failed, 1);
  assert.deepEqual(f.state.logs.map(l => l.status).sort(), ['failed', 'success']);
});
async function main() { for (const [name, fn] of tests) { await fn(); console.log('PASS ' + name); }
  console.log(`Inventory scheduling regressions passed (${tests.length} scenarios; isolated clock/source/license/ORM).`); }
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { fixture, deferred };
