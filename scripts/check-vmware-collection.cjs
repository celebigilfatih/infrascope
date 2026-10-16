// Real bridge/service/route code with synthetic I/O and deterministic timers.
const assert = require('node:assert/strict'), path = require('node:path');
const { EventEmitter } = require('node:events');
const { NextRequest, NextResponse } = require('next/server');
const { moduleLoader } = require('./check-alarm-occurrences.cjs');
const { fixture: alarmFixture } = require('./check-alarm-dispatch.cjs');
const quiet = new Proxy({}, { get: () => () => {} });
const flush = async () => { for (let i = 0; i < 160; i++) await Promise.resolve(); };
const profile = () => ({ host: 'fixture.invalid', username: 'fixture-reader', password: 'fixture-secret', pollingInterval: 10,
  enabledModules: { datacenters: true, hosts: true, clusters: true, vms: true, datastores: true } });
const snapshot = (vmId = 'vm-1') => ({ id: 'snapshot-1', vmId, vmName: 'Fixture VM', name: 'Fixture snapshot',
  description: '', createTime: '2026-10-16T00:00:00Z', state: 'poweredOn', size: 1024 });
const host = (id = 'host-1') => ({ host_moid: id, name: 'Duplicate name', vendor: 'Fixture', model: 'Fixture',
  cpu_cores: 8, memory_size_mb: 16384, esxi_version: '8.fixture', esxi_build: 'fixture', esxi_full_name: 'Fixture ESXi' });
function fixture() {
  const state = { now: Date.UTC(2026, 9, 16), config: profile(), processes: [], transport: [], modes: {}, timers: new Map(),
    auth: true, legacy: false, tls: { verify: true, caPem: 'fixture-ca' }, restHosts: [{ host: 'host-1', name: 'Duplicate name' }],
    helperHosts: [host()], snapshots: [snapshot()], allowed: true, role: 'ADMIN', kills: 0, shellCalls: 0 };
  let timerId = 0;
  class Clock extends Date { static now() { return state.now; } }
  const globals = { Date: Clock, globalThis: {}, console: quiet, URL, AbortSignal, AbortController,
    process: { env: { NODE_ENV: 'production' }, cwd: () => '/fixture-workspace' },
    setTimeout: callback => { const id = ++timerId; state.timers.set(id, callback); return id; },
    clearTimeout: id => state.timers.delete(id) };
  function spawn(binary, args, options) {
    const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
    child.stdout.setEncoding = () => child.stdout; child.kill = () => { state.kills++; return true; };
    const op = args[1].endsWith('get-snapshots.py') ? 'snapshots' : args[1].endsWith('get-host-details.py') ? 'hosts' : 'preflight';
    child.stdin.end = input => {
      const payload = JSON.parse(input); state.processes.push({ binary, args, options, input, payload });
      const mode = state.modes[op] || {};
      const finish = () => {
        if (mode.spawnError) return child.emit('error', new Error('Synthetic OS error with secret'));
        if (mode.stdinError) return child.stdin.emit('error', new Error('Synthetic EPIPE'));
        if (mode.stderr) child.stderr.emit('data', Buffer.from(mode.stderr));
        const value = mode.value !== undefined ? mode.value : { protocol: 1, success: true,
          ...(op === 'preflight' ? { runtime: { python: '3.fixture', sdk: 'pyvmomi' } }
            : { [op]: op === 'hosts' ? state.helperHosts : state.snapshots.filter(row => !payload.vmId || row.vmId === payload.vmId) }) };
        child.stdout.emit('data', mode.raw !== undefined ? mode.raw : JSON.stringify(value));
        child.emit('close', mode.exit === undefined ? 0 : mode.exit);
      };
      if (!mode.hang) Promise.resolve().then(finish); else mode.release = finish;
    };
    return child;
  }
  const prisma = { integrationConfig: { findFirst: async () => ({ id: 'fixture-config', config: state.config }),
    findMany: async () => [{ id: 'fixture-config', config: state.config }] } };
  const dependencies = {
    path, child_process: { spawn, execSync: () => { state.shellCalls++; throw new Error('Shell forbidden'); } },
    'next/server': { NextRequest, NextResponse }, zod: require('zod'),
    '@prisma/client': { ...require('@prisma/client'), PrismaClient: class { constructor() { return prisma; } } },
    '@/lib/logger': { createLogger: () => quiet }, '@/lib/prisma': { prisma },
    '@/lib/auth/api-permission': {
      authorizeApiRequest: async () => state.allowed ? { allowed: true, auth: { role: state.role } }
        : { allowed: false, response: NextResponse.json({ error: 'Denied' }, { status: 401 }) },
      forbiddenApiPermission: () => NextResponse.json({ error: 'Denied' }, { status: 403 }) },
    '@/lib/auth/permission-policy': { canAccessSync: role => role === 'ADMIN' },
    '@/lib/validators': { validateBody: (value, schema) => { const result = schema.safeParse(value);
      return result.success ? { success: true, data: result.data } : { success: false, error: 'Fixture validation failed' }; } },
    '@/lib/security/tls': {
      getPythonTlsPolicy: () => { if (state.tlsFail) throw new Error('Synthetic invalid CA'); return state.tls; },
      secureFetch: async (_kind, url, options = {}) => {
        state.transport.push({ url, options });
        if (options.method === 'DELETE') return new Response(null, { status: 204 });
        if (url.endsWith('/api/session')) return new Response('"owned-fixture-session"', { status: state.auth && !state.legacy ? 200 : 401 });
        if (url.endsWith('/rest/com/vmware/cis/session')) return new Response(JSON.stringify({ value: 'owned-legacy-session' }), { status: state.auth ? 200 : 401 });
        if (url.includes('/appliance/version')) return new Response('{"version":"8.fixture"}');
        if (url.endsWith('/vcenter/host')) return new Response(JSON.stringify(state.restHosts));
        return new Response('[]');
      } },
  };
  const load = moduleLoader(dependencies, globals);
  const service = new (load('lib/integrations/vmware.ts').VMwareService)(state.config);
  const route = () => load('app/api/integrations/vmware/route.ts');
  return { state, load, service,
    run: (op = 'snapshots', config = state.config, vmId) => load('lib/integrations/vmware-python.ts').runVMwarePython(op, config, vmId),
    get: (type = 'snapshots') => route().GET(new NextRequest('http://fixture.invalid/api/integrations/vmware?type=' + type)),
    test: () => route().POST(new NextRequest('http://fixture.invalid/api/integrations/vmware', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'test', config: state.config }) })),
    fault: (op, code) => { state.modes[op] = { value: { protocol: 1, success: false, code, error: 'fixture-secret must never escape' }, exit: 1 }; } };
}
const tests = [], test = (name, run) => tests.push([name, run]);
test('repro: batch source failure rejects instead of an empty dataset', async f => {
  f.fault('snapshots', 'SOURCE_ERROR');
  await assert.rejects(f.service.fetchAllSnapshots(), e => e.code === 'VMWARE_HELPER_SOURCE_ERROR');
});
test('shell characters and Unicode are preserved only in stdin', async f => {
  const config = { ...profile(), host: 'fixture.invalid;$(touch nope)', username: 'reader";' + String.fromCharCode(96) + 'whoami',
    password: ' şifre \' " $() & | ; \n 雪 ' };
  const vmId = 'vm-1";$(touch nope)'; f.state.snapshots = [snapshot(vmId)];
  await f.run('snapshots', config, vmId); const call = f.state.processes[0];
  assert.equal(call.options.shell, false); assert.equal(call.options.windowsHide, true);
  assert.deepEqual(Array.from(call.args), ['-B', '/fixture-workspace/scripts/get-snapshots.py']);
  for (const field of ['host', 'username', 'password']) assert.equal(call.payload[field], config[field]);
  assert.equal(call.payload.vmId, vmId); assert.ok(!JSON.stringify(call.args).includes(config.password));
  assert.equal(call.options.env.DATABASE_URL, undefined); assert.equal(f.state.shellCalls, 0);
});
test('preflight sends no secrets and uses its fixed script', async f => {
  assert.equal((await f.run('preflight')).sdk, 'pyvmomi');
  assert.deepEqual(f.state.processes[0].payload, { protocol: 1, operation: 'preflight' });
});
for (const op of ['snapshots', 'hosts']) test(op + ' accepts explicit empty success', async f => {
  f.state.modes[op] = { value: { protocol: 1, success: true, [op]: [] } }; assert.equal((await f.run(op)).length, 0);
});
for (const code of ['SDK_MISSING', 'AUTH_FAILED', 'PERMISSION_DENIED', 'TLS_ERROR', 'TLS_POLICY', 'SOURCE_TIMEOUT', 'SOURCE_ERROR', 'VM_NOT_FOUND'])
  test(code + ' is sanitized and cannot succeed', async f => {
    f.fault('snapshots', code);
    await assert.rejects(f.run(), e => e.code === 'VMWARE_HELPER_' + code && !e.message.includes('fixture-secret'));
  });
for (const [name, mode] of [
  ['invalid JSON', { raw: 'Traceback: fixture-secret' }], ['missing collection', { value: { protocol: 1, success: true } }],
  ['missing protocol', { value: { success: true, snapshots: [] } }], ['truthy success', { value: { protocol: 1, success: 'true', snapshots: [] } }],
  ['malformed item', { value: { protocol: 1, success: true, snapshots: [{ id: 'snapshot-1' }] } }],
  ['timezone-free time', { value: { protocol: 1, success: true, snapshots: [{ ...snapshot(), createTime: '2026-10-16T00:00:00' }] } }],
  ['invalid array', { value: { protocol: 1, success: true, snapshots: {} } }],
  ['nonzero success exit', { value: { protocol: 1, success: true, snapshots: [] }, exit: 2 }],
  ['terminated process', { raw: '', exit: null }], ['missing interpreter', { spawnError: true }], ['stdin error', { stdinError: true }],
]) test(name + ' rejects without claiming absence', async f => {
  f.state.modes.snapshots = mode; await assert.rejects(f.run(), e => /^VMWARE_HELPER_/.test(e.code)); assert.equal(f.state.timers.size, 0);
});
test('timeout kills the helper and clears its deadline', async f => {
  f.state.modes.snapshots = { hang: true }; const pending = f.run(); await flush();
  const rejected = assert.rejects(pending, e => e.code === 'VMWARE_HELPER_SOURCE_TIMEOUT');
  [...f.state.timers.values()][0](); await rejected;
  assert.equal(f.state.kills, 1); assert.equal(f.state.timers.size, 0);
});
for (const stream of ['stdout', 'stderr']) test(stream + ' is bounded', async f => {
  f.state.modes.snapshots = stream === 'stdout' ? { raw: 'x'.repeat(10 * 1024 * 1024 + 1) } : { stderr: 'x'.repeat(10 * 1024 * 1024 + 1) };
  await assert.rejects(f.run(), e => e.code === 'VMWARE_HELPER_OUTPUT_LIMIT'); assert.equal(f.state.kills, 1);
});
test('unknown script selector and oversized input cannot start a process', async f => {
  await assert.rejects(f.run('../not-a-helper'), e => e.code === 'VMWARE_HELPER_INVALID_REQUEST');
  await assert.rejects(f.run('snapshots', { ...profile(), password: 'x'.repeat(1024 * 1024) }), e => e.code === 'VMWARE_HELPER_INVALID_REQUEST');
  assert.equal(f.state.processes.length, 0);
});
test('unsafe TLS cannot reach the helper', async f => {
  f.state.tlsFail = true; await assert.rejects(f.run(), e => e.code === 'VMWARE_HELPER_TLS_POLICY'); assert.equal(f.state.processes.length, 0);
});
test('per-VM source cannot return another VM', async f => {
  f.state.modes.snapshots = { value: { protocol: 1, success: true, snapshots: [snapshot('vm-other')] } };
  await assert.rejects(f.service.getSnapshots('vm-1'), e => e.code === 'VMWARE_HELPER_OUTPUT_INVALID');
});
test('recent snapshot source failure propagates', async f => {
  f.fault('snapshots', 'AUTH_FAILED'); await assert.rejects(f.service.fetchRecentlyCreatedSnapshots(60), e => e.code === 'VMWARE_HELPER_AUTH_FAILED');
});
test('failed source cannot poison the snapshot cache', async f => {
  f.fault('snapshots', 'SOURCE_ERROR'); await assert.rejects(f.service.fetchAllSnapshots()); delete f.state.modes.snapshots;
  assert.equal((await f.service.fetchAllSnapshots()).length, 1); assert.equal(f.state.processes.length, 2);
});
test('host enrichment uses MoRefs for duplicate names', async f => {
  f.state.restHosts.push({ host: 'host-2', name: 'Duplicate name' });
  f.state.helperHosts.push({ ...host('host-2'), cpu_cores: 24 });
  const hosts = await f.service.fetchHosts(); assert.equal(hosts[0].summary.numCpuCores, 8); assert.equal(hosts[1].summary.numCpuCores, 24);
});
test('missing host hardware is unavailable rather than zero capacity', async f => {
  f.state.helperHosts = []; await assert.rejects(f.service.fetchHosts(), e => e.code === 'VMWARE_HELPER_SOURCE_INCOMPLETE');
});
test('malformed REST host inventory is not successful empty enrichment', async f => {
  f.state.restHosts = { error: 'fixture-source-error' };
  await assert.rejects(f.service.fetchHosts(), e => e.code === 'VMWARE_HELPER_SOURCE_INCOMPLETE');
});
test('VM mapping cannot hide Python host failure', async f => {
  f.fault('hosts', 'PERMISSION_DENIED'); await assert.rejects(f.service.fetchVMs(), e => e.code === 'VMWARE_HELPER_PERMISSION_DENIED');
});
for (const type of ['snapshots', 'dashboard', 'vms', 'hosts']) test(type + ' API fails explicitly without caching empty success', async f => {
  f.fault(type === 'snapshots' || type === 'dashboard' ? 'snapshots' : 'hosts', 'SOURCE_ERROR');
  const response = await f.get(type), data = await response.json();
  assert.equal(response.status, 503); assert.equal(data.code, 'VMWARE_HELPER_SOURCE_ERROR');
  assert.equal(response.headers.get('X-Cache'), null); assert.doesNotMatch(data.error, /fixture-secret/);
});
test('source timeout maps to HTTP 504', async f => {
  f.fault('snapshots', 'SOURCE_TIMEOUT'); assert.equal((await f.get()).status, 504);
});
test('failed stale refresh preserves age and recovers', async f => {
  await f.get(); f.state.now += 120_001; f.fault('snapshots', 'SOURCE_ERROR');
  assert.equal((await f.get()).headers.get('X-Cache'), 'STALE'); await flush();
  f.state.now += 1000; const retry = await f.get(); await flush(); assert.equal(retry.headers.get('X-Cache-Age'), '121');
  delete f.state.modes.snapshots; await f.get(); await flush();
  assert.equal((await f.get()).headers.get('X-Cache'), 'HIT'); assert.equal(f.state.processes.length, 4);
});
test('test endpoint exercises real capability and both collectors with entered credentials', async f => {
  f.state.config.password = ' entered \' "$() şifre '; const result = await (await f.test()).json();
  assert.equal(result.connected, true); assert.equal(result.version, '8.fixture');
  assert.deepEqual(f.state.processes.map(c => c.payload.operation).sort(), ['hosts', 'preflight', 'snapshots']);
  for (const c of f.state.processes.filter(c => c.payload.operation !== 'preflight')) {
    assert.equal(c.payload.password, f.state.config.password); assert.deepEqual(c.payload.tls, f.state.tls);
  }
  const auth = f.state.transport.find(c => c.options.method === 'POST' && c.url.endsWith('/api/session'));
  assert.equal(auth.options.headers.Authorization, 'Basic ' + Buffer.from('fixture-reader:' + f.state.config.password).toString('base64'));
  assert.ok(f.state.transport.some(c => c.options.method === 'DELETE'));
});
for (const op of ['preflight', 'hosts', 'snapshots']) test(op + ' failure makes connection test fail', async f => {
  f.fault(op, op === 'preflight' ? 'SDK_MISSING' : 'PERMISSION_DENIED');
  const result = await (await f.test()).json(); assert.equal(result.connected, false); assert.match(result.code, /^VMWARE_HELPER_/);
  assert.doesNotMatch(result.error, /fixture-secret/);
  assert.equal(f.state.transport.some(c => c.options.method === 'DELETE'), op !== 'preflight');
  if (op === 'preflight') assert.equal(f.state.transport.length, 0);
});
test('connection test cannot warm snapshot caches', async f => {
  assert.equal((await f.service.testConnection()).connected, true); f.fault('snapshots', 'SOURCE_ERROR');
  await assert.rejects(f.service.fetchAllSnapshots());
});
test('REST auth denial stops collection', async f => {
  f.state.auth = false; assert.equal((await f.service.testConnection()).connected, false);
  assert.deepEqual(f.state.processes.map(c => c.payload.operation), ['preflight']);
});
test('owned session closes only after all collectors settle', async f => {
  f.fault('snapshots', 'SOURCE_ERROR'); f.state.modes.hosts = { hang: true };
  const pending = f.service.testConnection(); await flush(); assert.ok(!f.state.transport.some(c => c.options.method === 'DELETE'));
  f.state.modes.hosts.release(); assert.equal((await pending).connected, false);
  assert.ok(f.state.transport.some(c => c.options.method === 'DELETE'));
});
test('legacy REST session closes on its own endpoint', async f => {
  f.state.legacy = true; assert.equal((await f.service.testConnection()).connected, true);
  const close = f.state.transport.find(c => c.options.method === 'DELETE');
  assert.match(close.url, /\/rest\/com\/vmware\/cis\/session$/); assert.equal(close.options.headers['vmware-api-session-id'], 'owned-legacy-session');
});
for (const mode of ['anonymous', 'editor']) test(mode + ' cannot start runtime preflight or collection', async f => {
  if (mode === 'anonymous') f.state.allowed = false; else f.state.role = 'EDITOR';
  assert.equal((await f.test()).status, mode === 'anonymous' ? 401 : 403);
  assert.equal(f.state.processes.length, 0); assert.equal(f.state.transport.length, 0);
});
for (const code of ['SNAPSHOT_CREATED', 'MULTIPLE_SNAPSHOTS', 'SNAPSHOT_DISK_GROWTH', 'SNAPSHOT_OLD']) test(code + ' evaluator exposes the real source failure', async f => {
  f.fault('snapshots', 'SOURCE_ERROR'); const e = alarmFixture().engine(false); e.vmwareService = f.service;
  const result = await e.evaluateVMwareAlarm({ code, detectionLogic: { timeWindowMinutes: 60, filter: code === 'SNAPSHOT_OLD' ? 'snapshotAgeDays > 1' : '' } });
  assert.match(result.error, /VMWARE_HELPER_SOURCE_ERROR/); assert.equal(result.triggered, false);
});
test('successful empty snapshots remain a clean alarm evaluation', async f => {
  f.state.snapshots = []; const e = alarmFixture().engine(false); e.vmwareService = f.service;
  const result = await e.evaluateVMwareAlarm({ code: 'SNAPSHOT_CREATED', detectionLogic: { timeWindowMinutes: 60, filter: '' } });
  assert.equal(result.error, undefined); assert.equal(result.matchCount, 0);
});
function tlsFixture(env) {
  return moduleLoader({ fs: { readFileSync: filename => { assert.equal(filename, '/fixture/ca.pem'); return 'fixture-added-ca'; } },
    tls: require('node:tls'), undici: { Agent: class {} } }, { process: { env } })('lib/security/tls.ts');
}
test('configured CA and verification match Node TLS policy', async () => {
  const tls = tlsFixture({ NODE_ENV: 'production', VMWARE_TLS_CA_CERT_PATH: '/fixture/ca.pem' });
  const a = tls.getHttpsRequestTlsOptions('VMWARE'), b = tls.getPythonTlsPolicy('VMWARE');
  assert.equal(a.rejectUnauthorized, true); assert.equal(b.verify, true); assert.equal(b.caPem, a.ca.join('\n'));
});
test('default trust carries Node bundled roots', async () => {
  assert.equal(tlsFixture({ NODE_ENV: 'production' }).getPythonTlsPolicy('VMWARE').caPem, require('node:tls').rootCertificates.join('\n'));
});
for (const env of [{ NODE_ENV: 'production', VMWARE_TLS_INSECURE: '1' }, { NODE_ENV: 'production', NODE_TLS_REJECT_UNAUTHORIZED: '0' }])
  test('production bypass is blocked before Python', async () => { assert.throws(() => tlsFixture(env).getPythonTlsPolicy('VMWARE')); });
test('explicit development TLS remains compatible', async () => {
  assert.equal(tlsFixture({ NODE_ENV: 'development', VMWARE_TLS_INSECURE: 'true' }).getPythonTlsPolicy('VMWARE').verify, false);
});
for (const mode of ['preflight', 'missing-interpreter', 'missing-script']) test('actual process pipes: ' + mode, async () => {
  const load = moduleLoader({ path, child_process: require('node:child_process'),
    '@/lib/security/tls': { getPythonTlsPolicy: () => ({ verify: true }) } }, {
    process: { env: { PATH: process.env.PATH, NODE_ENV: 'production',
      VMWARE_PYTHON_BIN: mode === 'missing-interpreter' ? '/fixture-no-such-python' : process.env.VMWARE_PYTHON_BIN },
      cwd: () => mode === 'missing-script' ? '/fixture-no-such-root' : process.cwd() },
    setTimeout, clearTimeout, console: quiet,
  });
  const run = () => load('lib/integrations/vmware-python.ts').runVMwarePython('preflight');
  if (mode === 'preflight') assert.equal((await run()).sdk, 'pyvmomi');
  else await assert.rejects(run(), e => e.code === (mode === 'missing-interpreter' ? 'VMWARE_HELPER_UNAVAILABLE' : 'VMWARE_HELPER_PROCESS_EXIT'));
});
async function main() {
  for (const [name, run] of tests) { await run(fixture()); console.log('PASS ' + name); }
  console.log('VMware collection regressions passed (' + tests.length + ' scenarios; isolated source/process/ORM fixtures).');
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
