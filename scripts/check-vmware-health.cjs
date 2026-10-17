/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS regression harness with synchronous VM dependency adapters. */
// Real health route, saved-source resolution and VMware REST client; synthetic ORM/transport only.
const assert = require('node:assert/strict');
const { NextRequest, NextResponse } = require('next/server');
const { moduleLoader } = require('./check-alarm-occurrences.cjs');
const { fixture: alarmFixture } = require('./check-alarm-dispatch.cjs');
const quiet = new Proxy({}, { get: () => () => {} });
const record = (id = 'saved-b') => ({ id, type: 'VMWARE_VCENTER', enabled: true, name: 'Synthetic vCenter',
  createdAt: new Date('2026-01-01T00:00:00Z'), lastSyncAt: new Date('2026-10-16T08:00:00Z'), lastSyncStatus: 'success',
  config: { host: `${id}.invalid`, username: 'synthetic-reader', password: 'synthetic-password',
    thumbprint: 'synthetic-thumbprint', pollingInterval: 10,
    enabledModules: { datacenters: true, clusters: true, hosts: true, vms: true, datastores: true } } });
const flush = async () => { for (let i = 0; i < 200; i++) await Promise.resolve(); };
function fixture() {
  const state = { now: Date.parse('2026-10-16T12:00:00Z'), records: [record()], calls: [], queries: [], timers: new Map(),
    env: {}, auth: true, legacy: false, version: '8.fixture', cleanupStatus: 204, collectionCalls: 0 };
  let timerId = 0;
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [state.now])); } static now() { return state.now; } }
  const prisma = {
    $queryRaw: async () => [],
    integrationConfig: { findMany: async ({ where }) => structuredClone(state.records.filter(r => r.type === where.type && r.enabled && (!where.id || r.id === where.id))),
      findFirst: async ({ where, orderBy }) => {
      state.queries.push({ where, orderBy });
      if (state.dbGate && where.type === 'VMWARE_VCENTER') await state.dbGate;
      if (state.dbError && where.type === 'VMWARE_VCENTER') throw new Error('Synthetic storage failure containing synthetic-password');
      return structuredClone(state.records.filter(r => r.type === where.type && (where.enabled === undefined || r.enabled === where.enabled))
        .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))[0] || null);
    } },
    systemConfig: { findUnique: async () => null }, device: { count: async () => 0 }, nmsHealthMetric: { count: async () => 0 },
  };
  const waitForAbort = signal => new Promise((resolve, reject) => {
    state.release = resolve;
    if (!state.ignoreAbort) signal.addEventListener('abort', () => { state.aborts = (state.aborts || 0) + 1; reject(new Error('Synthetic aborted I/O')); }, { once: true });
  });
  const load = moduleLoader({
    'next/server': { NextRequest, NextResponse }, '@/lib/prisma': { prisma }, '@/lib/logger': { createLogger: () => quiet },
    '@prisma/client': { ...require('@prisma/client'), PrismaClient: class {} },
    '@/lib/alarm-scheduler': { getSchedulerStatus: () => ({ running: true }) },
    '@/lib/alarms/alarm-monitor': { getAlarmMonitor: () => ({ getStatus: () => ({ running: true }) }) },
    '@/lib/alarms/detection-engine': { getEventCacheStatus: () => null },
    '@/lib/alarms/health': { getAlarmHealthStats: async () => ({ totalDefinitions: 0, enabledDefinitions: 0, recentEvents: 0, recentErrors: 0, unresolvedErrorChecks: 0 }) },
    '@/lib/notifications/dlq-worker': { getDLQStats: async () => ({ pending: 0, delivered: 0, failedPermanent: 0 }) },
    '@/lib/integrations/fortianalyzer': { getSharedFortiAnalyzerService: () => null, getFortiAnalyzerLoginHealth: () => ({}) },
    '@/lib/integrations/vmware-python': { runVMwarePython: async () => { state.collectionCalls++; throw new Error('Collection forbidden'); },
      isVMwarePythonError: () => false },
    '@/lib/security/tls': { secureFetch: async (_source, rawUrl, options = {}) => {
      const url = new URL(rawUrl); state.calls.push({ url: rawUrl, host: url.host, options });
      const stage = options.method === 'DELETE' ? 'cleanup' : url.pathname.includes('/appliance/version') ? 'version' : 'login';
      if (state.gate && stage === 'login' && url.host === 'saved-b.invalid') await state.gate;
      if (state.transportError === stage) throw new Error('Synthetic transport error containing synthetic-password');
      if (state.hang === stage || (stage === 'cleanup' && state.hangCleanup)) return waitForAbort(options.signal);
      if (stage === 'cleanup') return new Response(null, { status: state.cleanupStatus });
      if (state.hang === stage + '-body') return { ok: true,
        text: () => waitForAbort(options.signal), json: () => waitForAbort(options.signal) };
      if (url.pathname === '/api/session') return new Response(state.loginRaw ?? '"synthetic-modern-session"', { status: state.auth && !state.legacy ? 200 : 401 });
      if (url.pathname === '/rest/com/vmware/cis/session') return new Response(state.legacyRaw ?? '{"value":"synthetic-legacy-session"}', { status: state.auth ? 200 : 401 });
      if (url.pathname === '/rest/appliance/version') return new Response(state.versionRaw ?? JSON.stringify({ version: state.version }), { status: state.versionStatus || 200 });
      throw new Error('Unexpected VMware endpoint');
    } },
    '@/lib/auth/api-permission': { authorizeApiRequest: async () => ({ allowed: true, auth: { role: 'ADMIN' } }) },
    '@/lib/auth/permission-policy': { canAccessSync: () => true },
    '@/lib/validators': {}, '@/lib/validators/integrations': {},
  }, { Date: Clock, console: quiet, URL, AbortController, AbortSignal, process: { env: state.env },
    setTimeout: (fn, ms) => { const id = ++timerId; state.timers.set(id, { fn, due: state.now + ms }); return id; },
    clearTimeout: id => state.timers.delete(id),
    fetch: async () => ({ ok: true, json: async () => ({ poller_alive: true, registered_devices: 0 }) }),
  });
  const health = async () => (await load('app/api/health/route.ts').GET()).json();
  const apiStatus = async () => (await load('app/api/integrations/vmware/route.ts').GET(new NextRequest('http://localhost/api/integrations/vmware?type=status'))).json();
  const advance = async () => { await flush(); const next = [...state.timers.entries()].sort((a, b) => a[1].due - b[1].due)[0];
    assert.ok(next, 'A blocked source must own a deadline'); state.timers.delete(next[0]); state.now = next[1].due; next[1].fn(); await flush(); };
  return { state, load, health, apiStatus, advance };
}
const tests = [], test = (name, fn) => tests.push([name, fn]);
test('saved DB profile is checked without VMware ENV credentials', async f => {
  const status = await f.health(); assert.equal(status.datasources.vmware.status, 'healthy');
  assert.ok(f.state.calls.length); assert.ok(f.state.calls.every(c => c.host === 'saved-b.invalid'));
});
test('old ENV host and credentials cannot override the saved target', async f => {
  Object.assign(f.state.env, { VMWARE_HOST: 'old-a.invalid', VMWARE_USERNAME: 'old-user', VMWARE_PASSWORD: 'old-password' });
  const status = await f.health(); assert.equal(status.datasources.vmware.status, 'healthy');
  assert.ok(f.state.calls.every(c => c.host === 'saved-b.invalid'));
  assert.equal(f.state.calls[0].options.headers.Authorization, `Basic ${Buffer.from('synthetic-reader:synthetic-password').toString('base64')}`);
});
test('saved target metadata and sync history come from the same selected record', async f => {
  const status = await f.health(); const vm = status.datasources.vmware;
  assert.equal(vm.target.configId, 'saved-b'); assert.equal(vm.lastSyncAt, '2026-10-16T08:00:00.000Z');
  assert.equal(vm.lastSyncStatus, 'success');
});
test('health-owned session is closed on its matching endpoint', async f => {
  await f.health(); assert.ok(f.state.calls.some(c => c.options.method === 'DELETE' && c.url.endsWith('/api/session')));
});
for (const mode of ['missing', 'disabled']) test(`${mode} saved source stays unknown even when legacy ENV is set`, async f => {
  Object.assign(f.state.env, { VMWARE_HOST: 'old.invalid', VMWARE_USERNAME: 'old-user', VMWARE_PASSWORD: 'old-password' });
  if (mode === 'missing') f.state.records = []; else f.state.records[0].enabled = false;
  const status = await f.health(); assert.equal(status.datasources.vmware.status, 'unknown'); assert.equal(status.status, 'healthy');
  assert.equal(f.state.calls.length, 0);
});
test('store errors are unhealthy without ENV fallback or leaking storage diagnostics', async f => {
  f.state.dbError = true; f.state.env.VMWARE_HOST = 'old.invalid';
  const status = await f.health(); assert.equal(status.datasources.vmware.status, 'unhealthy'); assert.equal(status.status, 'degraded');
  assert.equal(status.datasources.vmware.code, 'VMWARE_HEALTH_CONFIGURATION_UNAVAILABLE');
  assert.equal(f.state.calls.length, 0); assert.ok(!JSON.stringify(status).includes('synthetic-password'));
});
for (const value of [null, [], 'invalid']) test(`invalid saved profile ${JSON.stringify(value)} cannot be a successful source`, async f => {
  f.state.records[0].config = value;
  const status = await f.health(); assert.equal(status.datasources.vmware.status, 'unhealthy');
  assert.equal(status.datasources.vmware.code, 'VMWARE_HEALTH_CONFIGURATION_INVALID');
  assert.equal(status.datasources.vmware.target.configId, 'saved-b'); assert.equal(f.state.calls.length, 0);
});
for (const field of ['host', 'username', 'password']) for (const value of ['', '  ', 10]) {
  test(`invalid ${field} ${JSON.stringify(value)} never borrows an ENV credential`, async f => {
    f.state.env.VMWARE_HOST = 'old.invalid'; f.state.records[0].config[field] = value;
    const status = await f.health(); assert.equal(status.datasources.vmware.status, 'unhealthy');
    assert.equal(status.datasources.vmware.code, 'VMWARE_HEALTH_CONFIGURATION_INVALID'); assert.equal(f.state.calls.length, 0);
  });
}
for (const host of ['https://user:password@vc.invalid', 'vc.invalid/path', 'vc.invalid?secret=value']) test(`a malformed host cannot redirect health credentials: ${host}`, async f => {
  f.state.records[0].config.host = host;
  const status = await f.health(); assert.equal(status.datasources.vmware.status, 'unhealthy'); assert.equal(f.state.calls.length, 0);
});
test('saved host normalization and exact special-character credentials match the operational source', async f => {
  Object.assign(f.state.records[0].config, { host: ' HTTPS://SAVED-B.INVALID:8443/// ', username: 'synthetic\\reader', password: ' şifre & $() : \' " 雪 ' });
  const status = await f.health(); assert.equal(status.datasources.vmware.status, 'healthy');
  assert.ok(f.state.calls.every(c => c.host === 'saved-b.invalid:8443'));
  const expected = Buffer.from(`${f.state.records[0].config.username}:${f.state.records[0].config.password}`).toString('base64');
  assert.equal(f.state.calls[0].options.headers.Authorization, `Basic ${expected}`);
  const source = f.load('lib/integrations/vmware-source.ts').createSavedVMwareSource(f.state.records[0]);
  assert.equal(source.service.config.thumbprint, 'synthetic-thumbprint');
});
test('selection is deterministic and skips an older disabled profile', async f => {
  f.state.records = [record('saved-z'), record('saved-a'), { ...record('disabled'), enabled: false, createdAt: new Date('2025-01-01') }];
  const status = await f.health(); assert.equal(status.datasources.vmware.target.configId, 'saved-a');
  assert.ok(f.state.calls.every(c => c.host === 'saved-a.invalid'));
  assert.deepEqual(JSON.parse(JSON.stringify(f.state.queries.find(query => query.where.type === 'VMWARE_VCENTER').orderBy)), [{ createdAt: 'asc' }, { id: 'asc' }]);
});
test('health and the operational API use the same saved target and no ENV credentials', async f => {
  f.state.env.VMWARE_HOST = 'old.invalid'; await f.health(); const status = await f.apiStatus();
  assert.equal(status.connected, true); assert.ok(f.state.calls.every(c => c.host === 'saved-b.invalid'));
});
test('alarm initialization resolves the same normalized saved profile and thumbprint', async () => {
  const f = alarmFixture(); f.state.configs.VMWARE_VCENTER = record();
  f.state.configs.VMWARE_VCENTER.config.host = 'HTTPS://SAVED-B.INVALID/';
  f.state.rules = [{ id: 'vm-rule', code: 'DATASTORE_SPACE_CRITICAL', enabled: true, source: 'vmware',
    severity: 'ALARM_HIGH', category: 'OPERATIONAL', notifyEmail: false, cooldownMinutes: 5,
    detectionLogic: { source: 'vmware', logtype: 'vmware', threshold: 1, filter: 'datastoreFreePercent < 10' } }];
  const result = await f.engine(false).evaluateAllAlarms({ sources: ['vmware'] });
  assert.equal(result[0].error, undefined); assert.equal(f.state.lastVMConfig.host, 'saved-b.invalid');
  assert.equal(f.state.lastVMConfig.password, 'synthetic-password'); assert.equal(f.state.lastVMConfig.thumbprint, 'synthetic-thumbprint');
});
test('repeated checks pick up newly saved host and credentials instead of reusing an old profile', async f => {
  await f.health(); f.state.calls = [];
  Object.assign(f.state.records[0].config, { host: 'replacement.invalid', username: 'new-reader', password: 'new-password' });
  f.state.records[0].lastSyncStatus = 'failed';
  const status = await f.health(); assert.equal(status.datasources.vmware.lastSyncStatus, 'failed');
  assert.ok(f.state.calls.every(c => c.host === 'replacement.invalid'));
  assert.equal(f.state.calls[0].options.headers.Authorization, `Basic ${Buffer.from('new-reader:new-password').toString('base64')}`);
});
test('a source disabled after a previous healthy probe does not retain a healthy cache entry', async f => {
  await f.health(); f.state.calls = []; f.state.records[0].enabled = false;
  const status = await f.health(); assert.equal(status.datasources.vmware.status, 'unknown'); assert.equal(f.state.calls.length, 0);
});
test('modern and legacy session cleanup use their own target and token', async f => {
  f.state.legacy = true; const status = await f.health(); assert.equal(status.datasources.vmware.status, 'healthy');
  const close = f.state.calls.find(c => c.options.method === 'DELETE');
  assert.ok(close.url.endsWith('/rest/com/vmware/cis/session')); assert.equal(close.options.headers['vmware-api-session-id'], 'synthetic-legacy-session');
});
test('authentication failure degrades health and does not pretend an inventory source is clean', async f => {
  f.state.auth = false; const status = await f.health(); assert.equal(status.datasources.vmware.status, 'unhealthy');
  assert.equal(status.status, 'degraded'); assert.equal(status.datasources.vmware.target.configId, 'saved-b');
  assert.equal(f.state.calls.filter(c => c.options.method === 'DELETE').length, 0);
});
for (const raw of ['', '""', '{}', '[]', 'null']) test(`invalid modern login reply ${JSON.stringify(raw)} cannot establish health`, async f => {
  f.state.loginRaw = raw; const status = await f.health(); assert.equal(status.datasources.vmware.status, 'unhealthy');
});
test('malformed legacy authentication cannot establish health', async f => {
  f.state.legacy = true; f.state.legacyRaw = '{}';
  const status = await f.health(); assert.equal(status.datasources.vmware.status, 'unhealthy');
});
test('optional version permission does not invalidate an authenticated connection', async f => {
  f.state.versionStatus = 403; const status = await f.health(); assert.equal(status.datasources.vmware.status, 'healthy');
  assert.equal(status.datasources.vmware.version, undefined);
});
test('a version body failure remains unhealthy and still closes the owned session', async f => {
  f.state.versionRaw = 'not-json'; const status = await f.health(); assert.equal(status.datasources.vmware.status, 'unhealthy');
  assert.ok(f.state.calls.some(c => c.options.method === 'DELETE'));
});
for (const stage of ['login', 'version']) test(`transport failure during ${stage} is sanitized`, async f => {
  f.state.transportError = stage; const status = await f.health(); assert.equal(status.datasources.vmware.status, 'unhealthy');
  assert.ok(!JSON.stringify(status).includes('synthetic-password'));
});
test('failure to close an otherwise healthy session is visible', async f => {
  f.state.cleanupStatus = 500; const status = await f.health(); assert.equal(status.datasources.vmware.status, 'unhealthy');
  assert.equal(status.datasources.vmware.code, 'VMWARE_HEALTH_CLEANUP_FAILED'); assert.equal(status.datasources.vmware.sessionCleanupFailed, true);
});
for (const stage of ['login', 'login-body', 'version', 'version-body']) test(`the entire ${stage} operation is bounded and aborts source I/O`, async f => {
  f.state.hang = stage; const pending = f.health(); await f.advance(); const status = await pending;
  assert.equal(status.datasources.vmware.code, 'VMWARE_HEALTH_TIMEOUT'); assert.equal(status.datasources.vmware.status, 'unhealthy');
  assert.ok(f.state.aborts > 0); assert.ok(status.datasources.vmware.responseTimeMs <= 6000);
  if (stage.startsWith('version')) assert.ok(f.state.calls.some(c => c.options.method === 'DELETE'));
});
test('a stalled cleanup has its own bounded budget', async f => {
  f.state.hang = 'cleanup'; const pending = f.health(); await f.advance(); const status = await pending;
  assert.equal(status.datasources.vmware.code, 'VMWARE_HEALTH_CLEANUP_FAILED'); assert.equal(status.datasources.vmware.responseTimeMs, 1000);
});
test('a timed-out DB lookup cannot later start source I/O', async f => {
  let release; f.state.dbGate = new Promise(resolve => { release = resolve; });
  const pending = f.health(); await f.advance(); const status = await pending;
  assert.equal(status.datasources.vmware.code, 'VMWARE_HEALTH_TIMEOUT'); assert.equal(f.state.calls.length, 0);
  release(); await flush(); assert.equal(f.state.calls.length, 0);
});
test('a source ignoring cancellation cannot publish a late healthy result or start fallback requests', async f => {
  f.state.hang = 'login'; f.state.ignoreAbort = true;
  const pending = f.health(); await f.advance(); const status = await pending;
  assert.equal(status.datasources.vmware.code, 'VMWARE_HEALTH_TIMEOUT');
  f.state.release(new Response('"late-session"')); await flush();
  assert.equal(f.state.calls.length, 1); assert.equal(status.datasources.vmware.status, 'unhealthy');
});
test('health stays a REST probe without Python collectors, inventory sync or background warming', async f => {
  await f.health(); assert.equal(f.state.collectionCalls, 0); assert.equal(f.state.timers.size, 0);
  assert.ok(f.state.calls.every(c => ['/api/session', '/rest/appliance/version'].some(path => c.url.endsWith(path))));
});
test('public health data contains safe target metadata without credentials, host or session tokens', async f => {
  const status = await f.health(); const output = JSON.stringify(status);
  for (const secret of ['synthetic-password', 'synthetic-reader', 'synthetic-modern-session', 'saved-b.invalid', 'synthetic-thumbprint']) assert.ok(!output.includes(secret));
  assert.equal(status.datasources.vmware.target.configId, 'saved-b');
});
test('simultaneous checks preserve their own saved target and sync metadata during a settings change', async f => {
  let release; f.state.gate = new Promise(resolve => { release = resolve; });
  const earlier = f.health(); await flush();
  f.state.records = [record('saved-c')]; f.state.records[0].lastSyncAt = new Date('2026-10-16T10:00:00Z');
  const later = await f.health(); release(); const first = await earlier;
  assert.equal(first.datasources.vmware.target.configId, 'saved-b'); assert.equal(first.datasources.vmware.lastSyncAt, '2026-10-16T08:00:00.000Z');
  assert.equal(later.datasources.vmware.target.configId, 'saved-c'); assert.equal(later.datasources.vmware.lastSyncAt, '2026-10-16T10:00:00.000Z');
  const closed = f.state.calls.filter(c => c.options.method === 'DELETE').map(c => c.host).sort();
  assert.deepEqual(closed, ['saved-b.invalid', 'saved-c.invalid']);
});
test('an invalid selected profile cannot be hidden by falling back to another saved target', async f => {
  f.state.records = [record('saved-a'), record('saved-b')]; delete f.state.records[0].config.password;
  const status = await f.health(); assert.equal(status.datasources.vmware.status, 'unhealthy');
  assert.equal(status.datasources.vmware.target.configId, 'saved-a'); assert.equal(f.state.calls.length, 0);
});
test('probe timeout followed by cleanup timeout retains the primary error within six seconds', async f => {
  f.state.hang = 'version-body'; f.state.hangCleanup = true;
  const pending = f.health(); await f.advance(); await f.advance(); const status = await pending;
  assert.equal(status.datasources.vmware.code, 'VMWARE_HEALTH_TIMEOUT'); assert.equal(status.datasources.vmware.sessionCleanupFailed, true);
  assert.equal(status.datasources.vmware.responseTimeMs, 6000); assert.equal(f.state.timers.size, 0);
});
test('a configured source with no prior sync retains explicit null metadata', async f => {
  f.state.records[0].lastSyncAt = null; f.state.records[0].lastSyncStatus = null;
  const status = await f.health(); assert.equal(status.datasources.vmware.status, 'healthy');
  assert.equal(status.datasources.vmware.lastSyncAt, null); assert.equal(status.datasources.vmware.lastSyncStatus, null);
});
async function main() {
  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      let timer;
      try { await Promise.race([fn(fixture()), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Health fixture did not settle within five seconds')), 5000); })]); }
      finally { clearTimeout(timer); }
      console.log(`PASS ${name}`);
    }
    catch (error) { failed++; console.error(`FAIL ${name}\n${error.stack}`); }
  }
  assert.equal(failed, 0, `${failed} VMware health regressions failed`);
  console.log(`VMware health regressions passed (${tests.length} scenarios; isolated source and database I/O).`);
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { fixture, record };
