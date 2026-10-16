// Actual VMware/cache/route code with deterministic time and synthetic I/O.
const assert = require('node:assert/strict');
const { NextRequest, NextResponse } = require('next/server');
const { moduleLoader } = require('./check-alarm-occurrences.cjs');
const quiet = new Proxy({}, { get: () => () => {} });
const profile = (host = 'a.fixture.invalid', password = 'fixture-a') => ({
  host, username: 'fixture-reader', password, pollingInterval: 10,
  enabledModules: { datacenters: true, clusters: true, hosts: true, vms: true, datastores: true },
});
const flush = async () => { for (let i = 0; i < 150; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function clock(state) { return class Clock extends Date { static now() { return state.now; } }; }
function serviceFixture(shared = {}) {
  const state = { now: 1000, calls: [], http: [], success: true, version: 1 };
  const dependencies = {
    '@prisma/client': { PrismaClient: class {} },
    '@/lib/logger': { createLogger: () => quiet },
    '@/lib/security/tls': { secureFetch: async (_kind, url, options) => {
      state.http.push({ url, options });
      return new Response(JSON.stringify({ value: 'snapshot-new' }), { status: state.success ? 200 : 403 });
    } },
    '@/lib/integrations/vmware-python': { isVMwarePythonError: () => false, runVMwarePython: async (_operation, config, vmId) => {
      const args = [config.host, config.username, config.password, vmId];
      state.calls.push(args);
      return [{ id: 'snapshot-1', vmId: args[3] || 'vm-1',
        name: args.slice(0, 3).join('|') + '|' + state.version }];
    } },
  };
  const globals = { console: quiet, globalThis: shared, Date: clock(state) };
  const load = moduleLoader(dependencies, globals);
  return { state, load, Service: load('lib/integrations/vmware.ts').VMwareService,
    reload: () => moduleLoader(dependencies, globals)('lib/integrations/vmware.ts').VMwareService };
}
function routeFixture(realService = false) {
  const state = { now: 1000, config: profile(), auth: [], calls: [], selfFetch: 0, reads: 0,
    enabled: true, exists: true, allowed: true, version: 1, authenticated: true, fail: null, gate: null, dbFail: false, saveFail: false };
  class Service {
    constructor(config) { this.config = structuredClone(config); this.version = state.version; }
    async authenticate() { state.auth.push(this.config); return state.authenticated; }
    async source(op, data) {
      state.calls.push({ op, config: this.config });
      const gate = state.gate;
      if (gate && op === 'vms') await gate.promise;
      if (state.fail === op) throw new Error('Synthetic source failure');
      return data;
    }
    name() { return this.config.host + '|' + this.config.password + '|' + this.version; }
    async fetchVMs() { return this.source('vms', [{ vm: { value: 'vm-1' }, name: this.name(), parent: { value: 'host-1' }, summary: { guestState: 'running', connectionState: 'connected' } }]); }
    async fetchHosts() { return this.source('hosts', [{ host: { value: 'host-1' }, name: this.name(), parent: { value: 'cluster-1' }, summary: { connectionState: 'connected' } }]); }
    async fetchClusters() { return this.source('clusters', [{ cluster: { value: 'cluster-1' }, name: this.name(), summary: {} }]); }
    async fetchDatastores() { return this.source('datastores', [{ datastore: { value: 'datastore-1' }, name: this.name(), summary: {} }]); }
    async fetchAllSnapshots(options) { state.snapshotOptions = options; return this.source('snapshots', [{ id: 'snapshot-1', vmId: 'vm-1', name: this.name(), createTime: '2026-01-01T00:00:00Z' }]); }
    async getSnapshots(vmId, options) { state.snapshotOptions = options; return this.source('snapshots', [{ id: 'snapshot-1', vmId, name: this.name() }]); }
    async getStatus() { return { connected: true }; }
  }
  const shared = {};
  const dependencies = {
    'next/server': { NextRequest, NextResponse },
    '@/lib/auth/api-permission': {
      authorizeApiRequest: async () => state.allowed ? ({ allowed: true, auth: { role: 'ADMIN' } }) : ({ allowed: false, response: NextResponse.json({ error: 'Denied' }, { status: 401 }) }),
      forbiddenApiPermission: () => NextResponse.json({ error: 'Denied' }, { status: 403 }),
    },
    '@/lib/auth/permission-policy': { canAccessSync: () => true },
    '@/lib/prisma': { prisma: { integrationConfig: {
      findMany: async () => {
        state.reads++;
        if (state.dbFail) throw new Error('Synthetic settings failure');
        return state.exists && state.enabled ? [{ id: 'fixture-config', config: structuredClone(state.config) }] : [];
      },
      findFirst: async ({ where }) => {
        state.reads++;
        if (state.dbFail) throw new Error('Synthetic settings failure');
        return !state.exists || (where.enabled && !state.enabled) ? null : { id: 'fixture-config', config: structuredClone(state.config) };
      },
      upsert: async ({ update }) => {
        if (state.saveFail) throw new Error('Synthetic save failure');
        state.config = structuredClone(update.config);
        state.enabled = true;
      },
    } } },
    '@/lib/integrations/vmware': realService ? undefined : { VMwareService: Service },
    '@/lib/integrations/vmware-python': { isVMwarePythonError: () => false, vmwareCollectionErrorMessage: () => 'Fixture collection failure', runVMwarePython: async () => [] },
    '@/lib/validators': { validateBody: value => ({ success: true, data: { ...profile(), ...value } }) },
    '@/lib/validators/integrations': {},
    '@prisma/client': { PrismaClient: class {} },
    '@/lib/logger': { createLogger: () => quiet },
    '@/lib/security/tls': { secureFetch: async (_kind, url, options) => {
      if (url.endsWith('/api/session')) {
        state.auth.push({ url, basic: options.headers.Authorization });
        return new Response('"fixture-owned-session"', { status: state.authenticated ? 200 : 401 });
      }
      if (url.endsWith('/rest/com/vmware/cis/session')) return new Response('{}', { status: 401 });
      state.calls.push({ url, session: options.headers['vmware-api-session-id'] });
      return new Response('[]');
    } },
    child_process: { execSync: () => { throw new Error('Child-process execution forbidden'); } },
  };
  const globals = { globalThis: shared, console: quiet, URL, Date: clock(state),
    fetch: async () => { state.selfFetch++; throw new Error('Self HTTP is forbidden'); },
    setTimeout: fn => { fn(); return 1; },
  };
  const load = moduleLoader(dependencies, globals);
  const request = (type = 'summary', vmId, bypass = false) => {
    const url = new URL('http://fixture.invalid/api/integrations/vmware');
    url.searchParams.set('type', type);
    if (vmId) url.searchParams.set('vmId', vmId);
    return new NextRequest(url, { headers: bypass ? { 'x-cache-bypass': '1' } : {} });
  };
  return { state, load, shared, request,
    get: (type, vmId, bypass) => load('app/api/integrations/vmware/route.ts').GET(request(type, vmId, bypass)),
    reloadGet: type => moduleLoader(dependencies, globals)('app/api/integrations/vmware/route.ts').GET(request(type)),
    save: config => load('app/api/integrations/vmware/route.ts').POST(new NextRequest('http://fixture.invalid/api/integrations/vmware', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save-config', config }),
    })),
    scope: () => load('lib/integrations/vmware-cache.ts').getVMwareCacheScope(state.config),
  };
}
const tests = [], test = (name, run) => tests.push([name, run]);
test('repro: batch snapshots are isolated between vCenters with identical MoRefs', async () => {
  const f = serviceFixture(), a = new f.Service(profile()), b = new f.Service(profile('b.fixture.invalid', 'fixture-b'));
  assert.match((await a.fetchAllSnapshots())[0].name, /a.fixture.invalid/);
  assert.match((await b.fetchAllSnapshots())[0].name, /b.fixture.invalid/);
  assert.equal(f.state.calls.length, 2);
});
test('per-VM snapshots are isolated between vCenters with identical MoRefs', async () => {
  const f = serviceFixture(), a = new f.Service(profile()), b = new f.Service(profile('b.fixture.invalid'));
  await a.getSnapshots('vm-1');
  assert.match((await b.getSnapshots('vm-1'))[0].name, /b.fixture.invalid/);
  assert.equal(f.state.calls.length, 2);
});
test('same connection profile shares snapshots across service instances and reloads', async () => {
  const f = serviceFixture();
  await new f.Service(profile()).fetchAllSnapshots();
  const Reloaded = f.reload();
  await new Reloaded(profile()).fetchAllSnapshots();
  assert.equal(f.state.calls.length, 1);
});
for (const [field, value] of [['password', 'fixture-new'], ['username', 'other-reader'], ['thumbprint', 'fixture-thumb'], ['pollingInterval', 3], ['enabledModules', { hosts: false }]]) {
  test('snapshot profile identity includes ' + field, async () => {
    const f = serviceFixture();
    await new f.Service(profile()).fetchAllSnapshots();
    await new f.Service({ ...profile(), [field]: value }).fetchAllSnapshots();
    assert.equal(f.state.calls.length, 2);
  });
}
test('host normalization and immutable construction keep identity and source aligned', async () => {
  const f = serviceFixture(), config = profile('https://A.fixture.invalid///'), a = new f.Service(config);
  config.host = 'b.fixture.invalid'; config.password = 'fixture-changed'; config.enabledModules.hosts = false;
  assert.match((await a.fetchAllSnapshots())[0].name, /a.fixture.invalid\|fixture-reader\|fixture-a/);
  await new f.Service(profile()).fetchAllSnapshots();
  assert.equal(f.state.calls.length, 1);
});
test('snapshot expiry fetches again at the five-minute boundary', async () => {
  const f = serviceFixture(), a = new f.Service(profile());
  await a.fetchAllSnapshots(); f.state.now += 299_999; await a.fetchAllSnapshots();
  assert.equal(f.state.calls.length, 1);
  f.state.now++; await a.fetchAllSnapshots(); assert.equal(f.state.calls.length, 2);
});
test('snapshot bypass reaches source despite an inner fresh entry', async () => {
  const f = serviceFixture(), a = new f.Service(profile());
  await a.fetchAllSnapshots(); await a.fetchAllSnapshots({ bypassCache: true });
  await a.getSnapshots('vm-1'); await a.getSnapshots('vm-1', { bypassCache: true });
  assert.equal(f.state.calls.length, 4);
});
for (const action of ['createSnapshot', 'deleteSnapshot', 'revertSnapshot']) {
  for (const success of [true, false]) test(action + ' invalidates only its target on ' + (success ? 'success' : 'failure (retains cache)'), async () => {
    const f = serviceFixture(), a = new f.Service(profile()), b = new f.Service(profile('b.fixture.invalid'));
    await a.fetchAllSnapshots(); await a.getSnapshots('vm-1');
    await b.fetchAllSnapshots(); await b.getSnapshots('vm-1');
    f.state.success = success;
    assert.equal((await a[action]('vm-1', 'snapshot-1')).success, success);
    await a.fetchAllSnapshots(); await a.getSnapshots('vm-1');
    await b.fetchAllSnapshots(); await b.getSnapshots('vm-1');
    assert.equal(f.state.calls.length, success ? 6 : 4);
  });
}
test('repro: stale refresh uses saved source authentication without self HTTP', async () => {
  const f = routeFixture();
  await f.get(); f.state.now += 300_001;
  assert.equal((await f.get()).headers.get('X-Cache'), 'STALE');
  await flush();
  assert.equal(f.state.auth.length, 2); assert.equal(f.state.selfFetch, 0);
  assert.equal(f.state.auth[1].password, 'fixture-a');
  assert.equal((await f.get()).headers.get('X-Cache'), 'HIT');
});
test('actual route and VMware authenticate use current Basic credentials and owned session', async () => {
  const f = routeFixture(true);
  await f.get(); f.state.now += 300_001; await f.get(); await flush();
  assert.equal(f.state.auth.length, 2);
  assert.equal(f.state.auth[1].basic, 'Basic ' + Buffer.from('fixture-reader:fixture-a').toString('base64'));
  f.state.config = profile('b.fixture.invalid', 'fixture-b'); await f.get();
  assert.match(f.state.auth[2].url, /b.fixture.invalid/);
  assert.equal(f.state.auth[2].basic, 'Basic ' + Buffer.from('fixture-reader:fixture-b').toString('base64'));
  assert.ok(f.state.calls.every(call => call.session === 'fixture-owned-session'));
  assert.equal(f.state.selfFetch, 0);
});
for (const type of ['dashboard', 'summary', 'vms', 'hosts', 'clusters', 'datastores', 'snapshots']) {
  test(type + ' response cache is target scoped and retains its response shape', async () => {
    const f = routeFixture();
    const first = await f.get(type); const data = await first.json(); await flush();
    assert.equal(first.status, 200);
    assert.ok(type === 'dashboard' || type === 'summary' ? data.summary : data[type]);
    f.state.config = profile('b.fixture.invalid', 'fixture-b');
    const second = await f.get(type); const result = await second.json(); await flush();
    assert.equal(second.headers.get('X-Cache'), 'MISS');
    if (result[type]?.length) assert.match(result[type][0].name, /b.fixture.invalid/);
    assert.ok(f.state.auth.some(config => config.host === 'b.fixture.invalid'));
  });
}
test('fresh cache reuse checks enabled settings but does not authenticate again', async () => {
  const f = routeFixture(); await f.get(); f.state.now += 299_999;
  const response = await f.get();
  assert.equal(response.headers.get('X-Cache'), 'HIT'); assert.equal(response.headers.get('X-Cache-Age'), '300');
  assert.equal(f.state.auth.length, 1); assert.equal(f.state.reads, 2);
});
test('password and trust changes cannot reuse a fresh response', async () => {
  const f = routeFixture(); await f.get('hosts');
  f.state.config.password = 'fixture-new'; assert.equal((await f.get('hosts')).headers.get('X-Cache'), 'MISS');
  f.state.config.thumbprint = 'fixture-thumb'; assert.equal((await f.get('hosts')).headers.get('X-Cache'), 'MISS');
  assert.equal(f.state.auth.length, 3); assert.equal(f.state.auth[1].password, 'fixture-new');
});
test('early bypass refreshes a fresh entry while authorization still applies', async () => {
  const f = routeFixture(); await f.get();
  assert.equal((await f.get('summary', null, true)).headers.get('X-Cache'), 'MISS'); assert.equal(f.state.auth.length, 2);
  f.state.allowed = false; const reads = f.state.reads;
  assert.equal((await f.get('summary', null, true)).status, 401); assert.equal(f.state.reads, reads);
});
test('cached data cannot be read without application authorization', async () => {
  const f = routeFixture(); await f.get(); f.state.allowed = false;
  assert.equal((await f.get()).status, 401); assert.equal(f.state.auth.length, 1); assert.equal(f.state.reads, 1);
});
for (const mode of ['disabled', 'deleted', 'db-error']) test(mode + ' settings cannot expose an old cached response', async () => {
  const f = routeFixture(); await f.get();
  if (mode === 'db-error') f.state.dbFail = true;
  else if (mode === 'deleted') f.state.exists = false;
  else f.state.enabled = false;
  const response = await f.get();
  assert.equal(response.headers.get('X-Cache'), null);
  assert.equal(response.status, mode === 'db-error' ? 500 : 200);
  const data = await response.json(); assert.equal(data.summary, undefined);
  assert.equal(f.state.auth.length, 1);
});
test('cold authentication failure is 401 and is not cached', async () => {
  const f = routeFixture(); f.state.authenticated = false;
  assert.equal((await f.get()).status, 401); assert.equal((await f.get()).status, 401);
  assert.equal(f.state.auth.length, 2); assert.equal(f.state.calls.length, 0);
  f.state.authenticated = true; assert.equal((await f.get()).headers.get('X-Cache'), 'MISS');
});
for (const failure of ['auth', 'source']) test('stale ' + failure + ' failure preserves age and releases refresh for retry', async () => {
  const f = routeFixture(); await f.get('hosts'); f.state.now += 300_001;
  if (failure === 'auth') f.state.authenticated = false; else f.state.fail = 'hosts';
  const first = await f.get('hosts'); await flush();
  assert.equal(first.headers.get('X-Cache'), 'STALE');
  f.state.now += 1000; const second = await f.get('hosts'); await flush();
  assert.equal(second.headers.get('X-Cache'), 'STALE'); assert.equal(second.headers.get('X-Cache-Age'), '301');
  assert.equal(f.state.auth.length, 3);
  f.state.authenticated = true; f.state.fail = null; await f.get('hosts'); await flush();
  assert.equal((await f.get('hosts')).headers.get('X-Cache'), 'HIT');
});
test('expired stale window awaits live loading and returns source failure', async () => {
  const f = routeFixture(); await f.get('hosts'); f.state.now += 35 * 60_000;
  f.state.fail = 'hosts'; const response = await f.get('hosts');
  assert.equal(response.status, 500); assert.equal(response.headers.get('X-Cache'), null);
});
test('simultaneous cold requests share one authenticated load', async () => {
  const f = routeFixture(); f.state.gate = deferred();
  const requests = Array.from({ length: 8 }, () => f.get()); await flush();
  assert.equal(f.state.auth.length, 1); f.state.gate.resolve();
  const responses = await Promise.all(requests); assert.ok(responses.every(r => r.status === 200));
});
test('simultaneous failed authentication responses each have a readable body', async () => {
  const f = routeFixture(); f.state.authenticated = false;
  const responses = await Promise.all(Array.from({ length: 8 }, () => f.get()));
  assert.equal(f.state.auth.length, 1);
  assert.ok(responses.every(r => r.status === 401));
  const bodies = await Promise.all(responses.map(response => response.json()));
  assert.ok(bodies.every(body => body.error));
});
test('simultaneous stale requests serve immediately and share one refresh', async () => {
  const f = routeFixture(); await f.get(); f.state.now += 300_001; f.state.gate = deferred();
  const responses = await Promise.all(Array.from({ length: 8 }, () => f.get()));
  assert.ok(responses.every(r => r.headers.get('X-Cache') === 'STALE'));
  assert.equal(f.state.auth.length, 2); f.state.gate.resolve(); await flush();
  assert.equal((await f.get()).headers.get('X-Cache'), 'HIT');
});
test('background cross-warm uses one authenticated profile and enriches hosts', async () => {
  const f = routeFixture(); await f.get('vms'); await flush();
  for (const type of ['hosts', 'clusters', 'datastores']) {
    const response = await f.get(type); assert.equal(response.headers.get('X-Cache'), 'HIT');
    const result = await response.json(); assert.match(result[type][0].name, /a.fixture.invalid/);
    if (type === 'hosts') assert.match(result.hosts[0].cluster, /a.fixture.invalid/);
  }
  assert.equal(f.state.auth.length, 1);
});
test('HTTP snapshot refresh bypasses the lower five-minute snapshot cache', async () => {
  const f = routeFixture(); await f.get('snapshots'); assert.equal(f.state.snapshotOptions.bypassCache, true);
  f.state.now += 120_001; await f.get('snapshots'); await flush();
  assert.equal(f.state.calls.filter(call => call.op === 'snapshots').length, 2);
});
test('per-VM snapshot responses retain distinct MoRef keys', async () => {
  const f = routeFixture();
  assert.equal((await (await f.get('snapshots', 'vm-1')).json()).snapshots[0].vmId, 'vm-1');
  assert.equal((await (await f.get('snapshots', 'vm-2')).json()).snapshots[0].vmId, 'vm-2');
  assert.equal(f.state.auth.length, 2);
});
test('successful identical settings save invalidates its response and snapshot scope', async () => {
  const f = routeFixture(); await f.get('hosts');
  const cache = f.load('lib/integrations/vmware-cache.ts'), scope = f.scope();
  cache.cacheVMwareValue(scope, 'all_snapshots', ['synthetic'], 300_000);
  assert.equal((await f.save(profile())).status, 200);
  assert.equal(cache.getVMwareCachedValue(scope, 'all_snapshots'), undefined);
  assert.equal((await f.get('hosts')).headers.get('X-Cache'), 'MISS');
});
test('settings save retains another target and failed save retains existing cache', async () => {
  const f = routeFixture(); await f.get('hosts');
  f.state.config = profile('b.fixture.invalid'); await f.get('hosts');
  assert.equal((await f.save(profile('b.fixture.invalid'))).status, 200);
  f.state.config = profile(); assert.equal((await f.get('hosts')).headers.get('X-Cache'), 'HIT');
  f.state.saveFail = true; assert.equal((await f.save(profile())).status, 500);
  assert.equal((await f.get('hosts')).headers.get('X-Cache'), 'HIT');
});
test('password-preserving save invalidates the resolved saved profile', async () => {
  const f = routeFixture(); await f.get('hosts');
  assert.equal((await f.save({ ...profile(), password: '' })).status, 200);
  assert.match(f.state.config.password, /^enc:v1:/);
  assert.equal(f.load('lib/security/integration-credentials.ts').unprotectIntegrationConfig(f.state.config, 'VMWARE_VCENTER').password, 'fixture-a');
  assert.equal((await f.get('hosts')).headers.get('X-Cache'), 'MISS');
});
test('late old-target refresh cannot replace current target data', async () => {
  const f = routeFixture(); await f.get('hosts');
  // A paused summary load belongs to A even if B is saved before it finishes.
  f.state.gate = deferred(); const old = f.get('summary'); await flush();
  await f.save(profile('b.fixture.invalid', 'fixture-b'));
  f.state.gate.resolve(); await old; f.state.gate = null;
  assert.match((await (await f.get('hosts')).json()).hosts[0].name, /b.fixture.invalid/);
});
test('invalidation fences late same-profile loads and their cross-warm children', async () => {
  const f = routeFixture(); f.state.gate = deferred(); const old = f.get('vms'); await flush();
  assert.equal((await f.save(profile())).status, 200);
  f.state.gate.resolve(); await old; await flush(); f.state.gate = null; f.state.version = 2;
  const hosts = await f.get('hosts');
  assert.equal(hosts.headers.get('X-Cache'), 'MISS'); assert.match((await hosts.json()).hosts[0].name, /\|2$/);
  assert.equal((await f.get('vms')).headers.get('X-Cache'), 'MISS');
});
test('process-global cache and refresh dedup survive module reload', async () => {
  const f = routeFixture(); await f.get();
  assert.equal((await f.reloadGet('summary')).headers.get('X-Cache'), 'HIT');
  f.state.now += 300_001; f.state.gate = deferred();
  await Promise.all([f.get(), f.reloadGet('summary')]); assert.equal(f.state.auth.length, 2);
  f.state.gate.resolve(); await flush();
});
test('shared authentication failure retains 401 across module reloads', async () => {
  const f = routeFixture(); f.state.authenticated = false;
  const responses = await Promise.all([f.get(), f.reloadGet('summary')]);
  assert.ok(responses.every(response => response.status === 401));
  assert.equal(f.state.auth.length, 1);
  assert.ok((await Promise.all(responses.map(response => response.json()))).every(body => body.error));
});
test('headers and response cache metadata contain no connection credentials', async () => {
  const f = routeFixture(), response = await f.get('summary');
  assert.doesNotMatch(JSON.stringify([...response.headers]), /fixture-reader|fixture-a|a\.fixture\.invalid/);
  assert.doesNotMatch(JSON.stringify(await response.json()), /fixture-reader|fixture-a|a\.fixture\.invalid/);
});
test('cache invalidation prevents a retired promise deleting a newer in-flight token', async () => {
  const f = routeFixture(), cache = f.load('lib/integrations/vmware-cache.ts'), scope = f.scope();
  const a = deferred(), b = deferred();
  const old = cache.loadVMwareCachedValue(scope, 'race', 1000, () => a.promise);
  await flush(); cache.invalidateVMwareCache(scope);
  const current = cache.loadVMwareCachedValue(scope, 'race', 1000, () => b.promise);
  a.resolve('old'); await old;
  const joined = cache.loadVMwareCachedValue(scope, 'race', 1000, () => { throw new Error('Duplicate load'); });
  b.resolve('new'); assert.equal((await current).data, 'new'); assert.equal((await joined).data, 'new');
  assert.equal((await cache.loadVMwareCachedValue(scope, 'race', 1000, async () => 'wrong')).data, 'new');
});
async function main() {
  for (const [name, run] of tests) { await run(); console.log('PASS ' + name); }
  console.log('VMware cache regressions passed (' + tests.length + ' scenarios; isolated source/configuration I/O).');
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
