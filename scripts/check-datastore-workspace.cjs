/* eslint-disable @typescript-eslint/no-require-imports, @next/next/no-assign-module-variable */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), sandbox = require('node:vm'), ts = require('typescript');
const { EventEmitter } = require('node:events');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const { NextRequest, NextResponse } = require('next/server');
const { moduleLoader } = require('./check-alarm-occurrences.cjs');
const { datastore, mount, datastores } = require('./fixtures/datastore-workspace.cjs');
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
const view = load('lib/virtualization/datastore-workspace.ts');
const defaults = { search: '', type: 'all', host: 'all', access: 'all', usage: 'all' };
assert.equal(view.formatStorage(0), '0 B'); assert.equal(view.formatStorage(1024**4), '1 TiB'); assert.equal(view.formatStorage(null), 'Bilinmiyor');
const full = datastore('full', { capacityBytes: 1024, freeBytes: 0 });
assert.equal(view.datastoreCapacity(full).used, 1024); assert.equal(view.datastoreCapacity(full).percent, 100); assert.equal(view.datastoreUsage(full).key, 'critical');
assert.equal(view.datastoreUsage(datastore('warning', { capacityBytes: 1000, freeBytes: 250 })).key, 'warning');
assert.equal(view.datastoreUsage(datastore('normal', { capacityBytes: 1000, freeBytes: 251 })).key, 'normal');
for (const override of [{ accessible: false }, { accessible: null }, { freeBytes: null }, { capacityBytes: null }, { freeBytes: -1 }, { capacityBytes: 100, freeBytes: 101 }]) {
  const ds = datastore('unknown', override); assert.equal(view.datastoreCapacity(ds).used, null); assert.equal(view.datastoreCapacity(ds).percent, null); assert.equal(view.datastoreUsage(ds).key, 'unknown');
}
assert.equal(view.datastoreCapacity(datastore('zero', { capacityBytes: 0, freeBytes: 0 })).used, 0);
assert.equal(view.datastoreCapacity(datastore('zero', { capacityBytes: 0, freeBytes: 0 })).percent, null);
const weighted = view.datastoreTotals([datastore('small', { capacityBytes: 1000, freeBytes: 100 }), datastore('large', { capacityBytes: 9000, freeBytes: 8100 })]);
assert.equal(weighted.total, 10000); assert.equal(weighted.used, 1800); assert.equal(weighted.free, 8200); assert.equal(weighted.percent, 18, 'General occupancy must be capacity-weighted, not the mean of two percentages');
const partial = view.datastoreTotals([full, datastore('offline', { accessible: false })]);
assert.equal(partial.measured, 1); assert.equal(partial.omitted, 1); assert.equal(partial.total, 1024, 'Inaccessible capacity must not inflate totals');
assert.equal(view.datastoreTotals([datastore('shared')]).total, 10*1024**4, 'Shared store is counted once, not once per host');
assert.equal(view.datastoreTotals([]).total, 0); assert.equal(view.datastoreTotals([datastores[5]]).total, null);
assert.equal(view.datastoreAccess(null).tone, 'neutral');
assert.equal(view.mountState(mount('1', { accessible: null })).tone, 'neutral');
assert.equal(view.mountState(mount('1', { connectionState: 'disconnected' })).tone, 'neutral');
assert.equal(view.mountState(mount('1', { accessible: false })).tone, 'danger');
assert.equal(view.mountMode('readOnly'), 'Salt okunur');
assert.equal(view.filterDatastores(datastores, { ...defaults, search: 'ÜRETİM' }).length, 2);
assert.equal(view.filterDatastores(datastores, { ...defaults, host: 'none' })[0].id, 'datastore-401');
assert.equal(view.filterDatastores(datastores, { ...defaults, host: 'unknown' })[0].id, 'datastore-501');
assert.equal(view.filterDatastores(datastores, { ...defaults, usage: 'critical' }).length, 2);
assert.equal(view.filterDatastores(datastores, { ...defaults, access: 'inaccessible' })[0].id, 'datastore-301');
assert.equal(view.filterDatastores(datastores, { ...defaults, type: 'NFS' })[0].id, 'datastore-201');
const duplicates = [datastore('1', { hosts: [mount('h1', { name: 'Same' })] }), datastore('2', { hosts: [mount('h2', { name: 'Same' })] })];
assert.equal(view.datastoreHostOptions(duplicates).length, 2); assert.equal(view.filterDatastores(duplicates, { ...defaults, host: 'h2' })[0].id, '2');
const csv = view.datastoreCsv([datastore('csv', { name: '=SUM(1,2);"ö"\n' })]);
assert.ok(csv.startsWith('\uFEFF')); assert.match(csv, /"'=SUM\(1,2\);""ö""\n"/); assert.match(csv, /Kullanılan alan \(bayt\)/); assert.match(csv, /host-101 \| host-102/);
assert.doesNotMatch(view.datastoreCsv([datastore('offline', { accessible: false, capacityBytes: 98765 })]), /98765/);
const { DatastoreWorkspace } = load('components/virtualization/DatastoreWorkspace.tsx'), original = JSON.stringify(datastores);
const render = props => renderToStaticMarkup(React.createElement(DatastoreWorkspace, { datastores, loading: false, refreshing: false, error: null, collectedAt: '2026-10-16T13:00:00Z', onRefresh() {}, ...props }));
assert.match(render({}), /role="meter"/); assert.match(render({}), /Genel doluluk/); assert.match(render({}), /Boş alan/); assert.match(render({}), /1 bağlantıda erişim sorunu/); assert.match(render({}), /4 \/ 6 depoda doğrulanan ölçüm/);
assert.match(render({ datastores: [datastore('invalid', { capacityBytes: 100, freeBytes: 101 })] }), /Kapasite ölçümü tutarsız/);
assert.match(render({ error: 'Test' }), /Son alınan veriler gösteriliyor/); assert.match(render({ stale: true }), /Önbellekteki veriler gösteriliyor/);
assert.match(render({ datastores: [], error: 'Test' }), /Veri deposu bilgileri alınamadı/); assert.match(render({ datastores: [] }), /Bu kaynakta veri deposu bulunamadı/);
assert.equal(JSON.stringify(datastores), original);
assert.match(fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8'), /COPY[^\n]*get-datastore-workspace\.py[^\n]*\.\/scripts\//);
async function bridgeChecks() {
  let rows = datastores, args;
  const bridge = moduleLoader({ path, '@/lib/security/tls': { getPythonTlsPolicy: () => ({ verify: true }) }, child_process: { spawn: (...input) => {
    args = input; const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter(); child.stdout.setEncoding = () => {}; child.kill = () => {};
    child.stdin.end = () => queueMicrotask(() => { child.stdout.emit('data', JSON.stringify({ protocol: 1, success: true, datastoreWorkspace: rows })); child.emit('close', 0); }); return child;
  } } }, { setTimeout, clearTimeout, process: { cwd: () => root, env: {} } })('lib/integrations/vmware-python.ts');
  const config = { host: 'fixture.invalid', username: 'fixture-reader', password: 'fixture-secret' };
  assert.equal((await bridge.runVMwarePython('datastoreWorkspace', config)).length, 6); assert.equal(args[2].shell, false); assert.ok(args[1][1].endsWith('get-datastore-workspace.py')); assert.doesNotMatch(JSON.stringify(args), /fixture-secret/);
  rows = []; assert.equal((await bridge.runVMwarePython('datastoreWorkspace', config)).length, 0);
  for (const invalid of [[datastore('1'), datastore('1')], [datastore('1', { hosts: [mount('h1'), mount('h1')] })], [datastore('1', { hosts: [{ ...mount('1'), mounted: undefined }] })], [datastore('1', { hosts: {} })], [datastore('1', { freeBytes: '0' })], [datastore('1', { capacityBytes: -1 })], [datastore('1', { accessible: undefined })]]) {
    rows = invalid; await assert.rejects(bridge.runVMwarePython('datastoreWorkspace', config), error => error.code === 'VMWARE_HELPER_OUTPUT_INVALID');
  }
}
async function routeChecks() {
  let allowed = true, calls = 0, bypass, cached, fail = false;
  const service = { authenticate: async () => true, fetchDatastoreWorkspace: async () => { calls++; if (fail) throw { code: 'VMWARE_HELPER_SOURCE_TIMEOUT' }; return datastores; } };
  const dependencies = {
    'next/server': { NextRequest, NextResponse }, '@/lib/auth/api-permission': { authorizeApiRequest: async () => allowed ? { allowed: true, auth: { role: 'viewer' } } : { allowed: false, response: NextResponse.json({ error: 'Denied' }, { status: 403 }) } },
    '@/lib/auth/permission-policy': {}, '@/lib/integrations/vmware': {}, '@/lib/integrations/vmware-source': { createSavedVMwareSource: () => ({ service, scope: 'fixture-scope' }) },
    '@/lib/integrations/inventory-source-selection': { InventorySourceSelectionError: class extends Error {}, selectInventorySource: async () => ({}) },
    '@/lib/integrations/vmware-cache': { vmwareResourceKey: type => type, loadVMwareCachedValue: async (scope, key, ttl, callback, force) => { assert.equal(scope, 'fixture-scope'); assert.equal(key, 'datastore-workspace'); assert.equal(ttl, 300000); bypass = force; cached = !cached || force ? await callback() : cached; return { data: cached, cache: 'HIT', age: 1 }; } },
    '@/lib/prisma': {}, '@/lib/integrations/sync-log': {}, '@/lib/integrations/sync-coordinator': {}, '@/lib/security/integration-credentials': {}, '@/lib/validators': {}, '@/lib/validators/integrations': {}, '@/lib/integrations/vmware-python': { isVMwarePythonError: error => error?.code?.startsWith('VMWARE_HELPER_'), vmwareCollectionErrorMessage: () => 'Veri toplama süresi aşıldı.' },
  };
  const route = moduleLoader(dependencies)('app/api/integrations/vmware/route.ts');
  const request = headers => new NextRequest('http://fixture.invalid/api/integrations/vmware?type=datastore-workspace', { headers });
  let response = await route.GET(request()), json = await response.json(); assert.equal(response.status, 200); assert.equal(json.datastores.length, 6); assert.ok(json.collectedAt); assert.equal(bypass, false);
  await route.GET(request()); assert.equal(calls, 1);
  await route.GET(request({ 'x-cache-bypass': '1' })); assert.equal(bypass, true); assert.equal(calls, 2);
  allowed = false; response = await route.GET(request()); assert.equal(response.status, 403); assert.equal(calls, 2);
  allowed = true; fail = true; response = await route.GET(request({ 'x-cache-bypass': '1' })); assert.equal(response.status, 504); assert.equal(cached.datastores.length, 6);
}
async function main() { await bridgeChecks(); await routeChecks(); console.log('Datastore workspace checks passed: exact bytes, full/zero/unknown/inconsistent capacities, weighted totals, shared-store counting, host mounts and IDs, filters, CSV, rendered states, SDK validation, read authorization and cache bypass. Synthetic records only, no live source or writes.'); }
main().catch(error => { console.error(error); process.exitCode = 1; });
