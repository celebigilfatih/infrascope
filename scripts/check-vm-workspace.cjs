/* eslint-disable @typescript-eslint/no-require-imports, @next/next/no-assign-module-variable */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), sandbox = require('node:vm'), ts = require('typescript');
const { EventEmitter } = require('node:events');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const { NextRequest, NextResponse } = require('next/server');
const { moduleLoader } = require('./check-alarm-occurrences.cjs');
const { vm, vms } = require('./fixtures/vm-workspace.cjs');
const root = path.resolve(__dirname, '..'), cache = new Map();
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports;
  const module = { exports: {} }; cache.set(relative, module);
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const local = name => {
    if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name === 'next/link') return { __esModule: true, default: ({ children, href, ...props }) => React.createElement('a', { href, ...props }, children) };
    if (name.startsWith('@/') || name.startsWith('.')) {
      const target = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(relative), name);
      return load(['.ts', '.tsx'].map(ext => target + ext).find(file => fs.existsSync(path.join(root, file))));
    }
    return require(name);
  };
  sandbox.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: relative })(local, module, module.exports); return module.exports;
}
const view = load('lib/virtualization/vm-workspace.ts'), defaults = { search: '', state: 'all', host: 'all', health: 'all' };
assert.equal(view.vmPowerState(vm('v1', { guestState: 'unknown' }).powerState), 'Çalışıyor');
assert.equal(view.formatVMCpu(20), '20 MHz'); assert.equal(view.formatVMCpu(null), 'Bilinmiyor');
assert.equal(view.vmHealth(vms[4]).key, 'critical'); assert.equal(view.vmHealth(vms[5]).key, 'unknown');
assert.equal(view.vmResource(vm('v1'), 'cpu').percent, 25); assert.equal(view.vmResource(vm('v1'), 'memory').percent, 37.5);
assert.equal(view.vmResource(vm('v1', { usedCpuMHz: 0 }), 'cpu').percent, 0);
assert.equal(view.vmResource(vm('v1', { cpuCapacityMHz: null }), 'cpu').used, 2500);
assert.equal(view.vmResource(vm('v1', { cpuCapacityMHz: 0 }), 'cpu').percent, null);
for (const record of [vms[2], vms[3], vms[4], vms[5]]) assert.equal(view.vmResource(record, 'memory').used, null);
assert.equal(view.filterVMs(vms, { ...defaults, search: 'ÜRETİM' }).length, 2);
assert.equal(view.filterVMs(vms, { ...defaults, state: 'suspended' })[0].id, 'vm-301');
assert.equal(view.filterVMs(vms, { ...defaults, state: 'unknown' })[0].id, 'vm-501');
assert.equal(view.filterVMs(vms, { ...defaults, host: 'unassigned' })[0].id, 'vm-201');
assert.equal(view.filterVMs(vms, { ...defaults, host: 'unknown' }).length, 2);
const duplicate = [vm('1', { hostName: 'Same', hostId: 'h1' }), vm('2', { hostName: 'Same', hostId: 'h2' })];
assert.equal(view.vmHostOptions(duplicate).length, 2); assert.equal(view.filterVMs(duplicate, { ...defaults, host: 'h2' })[0].id, '2');
assert.deepEqual(view.powerOperations(vms[0]), ['off', 'suspend', 'reset']); assert.deepEqual(view.powerOperations(vms[2]), ['on']);
assert.deepEqual(view.powerOperations(vm('v1', { template: null })), []); assert.deepEqual(view.powerOperations(vms[4]), []);
assert.match(view.powerDescription(vms[0], 'reset').description, /Kaydedilmemiş/);
assert.match(view.vmCsv([vm('1', { name: '=SUM(1,2);"ö"\n' })]), /"'=SUM\(1,2\);""ö""\n"/);
assert.doesNotMatch(view.vmCsv([vm('1', { powerState: 'poweredOff', usedCpuMHz: 9876 })]), /9876/);
const { VMWorkspace } = load('components/virtualization/VMWorkspace.tsx');
const original = JSON.stringify(vms);
const render = props => renderToStaticMarkup(React.createElement(VMWorkspace, { vms, loading: false, refreshing: false, error: null, collectedAt: '2026-10-16T12:00:00Z', canPower: false, onRefresh() {}, onPower: async () => { throw new Error('Unexpected write'); }, ...props }));
assert.match(render({}), /Aktif bellek/); assert.match(render({}), /Atanan sanal işlemci/); assert.match(render({}), /role="meter"/);
assert.match(render({ vms: [vm('1', { cpuCapacityMHz: null })] }), /Oran hesaplanamıyor/);
assert.match(render({ error: 'Test' }), /Son alınan veriler gösteriliyor/);
assert.match(render({ stale: true }), /Önbellekteki veriler gösteriliyor/);
assert.match(render({ vms: [], error: 'Test' }), /Sanal makine verileri alınamadı/); assert.match(render({ vms: [] }), /Bu kaynakta sanal makine bulunamadı/);
assert.equal(JSON.stringify(vms), original);
assert.match(fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8'), /COPY[^\n]*get-vm-workspace\.py[^\n]*\.\/scripts\//);
async function powerChecks() {
  const calls = [];
  const fetcher = async (...args) => { calls.push(args); return { ok: true, json: async () => ({ success: true }) }; };
  await view.requestVMPower(vms[0], 'off', fetcher);
  assert.deepEqual(JSON.parse(calls[0][1].body), { action: 'vm-power', vmId: 'vm-101', operation: 'off' });
  await assert.rejects(view.requestVMPower(vms[4], 'reset', fetcher)); assert.equal(calls.length, 1);
  await assert.rejects(view.requestVMPower(vms[0], 'off', async () => ({ ok: false, json: async () => ({ error: 'Yetki yok' }) })), /Yetki yok/);
  await assert.rejects(view.requestVMPower(vms[0], 'off', async () => ({ ok: true, json: async () => ({}) })), /kabul edilmedi/);
}
async function bridgeChecks() {
  let rows = vms, args;
  const bridge = moduleLoader({ path, '@/lib/security/tls': { getPythonTlsPolicy: () => ({ verify: true }) }, child_process: { spawn: (...input) => {
    args = input; const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter(); child.stdout.setEncoding = () => {}; child.kill = () => {};
    child.stdin.end = () => queueMicrotask(() => { child.stdout.emit('data', JSON.stringify({ protocol: 1, success: true, vmWorkspace: rows })); child.emit('close', 0); }); return child;
  } } }, { setTimeout, clearTimeout, process: { cwd: () => root, env: {} } })('lib/integrations/vmware-python.ts');
  const config = { host: 'fixture.invalid', username: 'fixture-reader', password: 'fixture-secret' };
  assert.equal((await bridge.runVMwarePython('vmWorkspace', config)).length, 6); assert.equal(args[2].shell, false); assert.ok(args[1][1].endsWith('get-vm-workspace.py')); assert.doesNotMatch(JSON.stringify(args), /fixture-secret/);
  for (const invalid of [[vm('1'), vm('1')], [vm('1', { hostId: null })], [vm('1', { hostAssignment: 'unknown' })], [vm('1', { usedCpuMHz: '0' })], [vm('1', { memoryBytes: -1 })], [vm('1', { template: undefined })]]) { rows = invalid; await assert.rejects(bridge.runVMwarePython('vmWorkspace', config), error => error.code === 'VMWARE_HELPER_OUTPUT_INVALID'); }
}
async function routeChecks() {
  let allowed = true, role = 'admin', calls = 0, bypass, cached;
  const service = { authenticate: async () => true, fetchVMWorkspace: async () => { calls++; return vms; } };
  const dependencies = {
    'next/server': { NextRequest, NextResponse }, '@/lib/auth/api-permission': { authorizeApiRequest: async () => allowed ? { allowed: true, auth: { role } } : { allowed: false, response: NextResponse.json({ error: 'Denied' }, { status: 403 }) } },
    '@/lib/auth/permission-policy': { canAccessSync: (r, resource, action) => { assert.equal(resource, 'devices'); assert.equal(action, 'write'); return r === 'admin'; } },
    '@/lib/integrations/vmware': {}, '@/lib/integrations/vmware-source': { createSavedVMwareSource: () => ({ service, scope: 'fixture-scope' }) },
    '@/lib/integrations/inventory-source-selection': { InventorySourceSelectionError: class extends Error {}, selectInventorySource: async () => ({}) },
    '@/lib/integrations/vmware-cache': { vmwareResourceKey: type => type, loadVMwareCachedValue: async (_scope, key, ttl, callback, force) => { assert.equal(key, 'vm-workspace'); assert.equal(ttl, 300000); bypass = force; cached = !cached || force ? await callback() : cached; assert.equal(cached.canPower, undefined); return { data: cached, cache: 'HIT', age: 1 }; } },
    '@/lib/prisma': {}, '@/lib/integrations/sync-log': {}, '@/lib/integrations/sync-coordinator': {}, '@/lib/security/integration-credentials': {}, '@/lib/validators': {}, '@/lib/validators/integrations': {}, '@/lib/integrations/vmware-python': { isVMwarePythonError: () => false },
  };
  const route = moduleLoader(dependencies)('app/api/integrations/vmware/route.ts');
  const request = headers => new NextRequest('http://fixture.invalid/api/integrations/vmware?type=vm-workspace', { headers });
  let response = await route.GET(request()), json = await response.json(); assert.equal(response.status, 200); assert.equal(json.vms.length, 6); assert.equal(json.canPower, true); assert.ok(json.collectedAt); assert.equal(bypass, false);
  role = 'viewer'; response = await route.GET(request()); assert.equal((await response.json()).canPower, false); assert.equal(calls, 1, 'Cached data must not cache role capability');
  await route.GET(request({ 'x-cache-bypass': '1' })); assert.equal(bypass, true); assert.equal(calls, 2);
  allowed = false; response = await route.GET(request()); assert.equal(response.status, 403); assert.equal(calls, 2);
}
async function main() { await powerChecks(); await bridgeChecks(); await routeChecks(); console.log('VM workspace checks passed: runtime power, exact host IDs, active memory, unknown/zero/offline usage, filters, CSV, rendered states, unchanged power payload, SDK validation, per-request capability on cached data. Synthetic records and mocked writes only.'); }
main().catch(error => { console.error(error); process.exitCode = 1; });
