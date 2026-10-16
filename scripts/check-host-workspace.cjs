// Real ESXi presentation, helper bridge and API; no live source or mutations.
/* eslint-disable @typescript-eslint/no-require-imports, @next/next/no-assign-module-variable */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const { EventEmitter } = require('node:events');
const React = require('react'); const { renderToStaticMarkup } = require('react-dom/server');
const { NextRequest, NextResponse } = require('next/server');
const { moduleLoader } = require('./check-alarm-occurrences.cjs');
const { host, hosts } = require('./fixtures/host-workspace.cjs');
const root = path.resolve(__dirname, '..');
function uiLoader() {
  const cache = new Map();
  const load = relative => {
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
    vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: relative })(local, module, module.exports); return module.exports;
  }; return load;
}
const load = uiLoader(), view = load('lib/virtualization/host-workspace.ts');
assert.equal(view.assessHost(host('1')).key, 'healthy');
assert.equal(view.assessHost(host('1', { overallStatus: 'red' })).key, 'critical');
assert.equal(view.assessHost(hosts[1]).label, 'Bakımda');
assert.equal(view.assessHost(hosts[2]).label, 'Bağlantı sorunu');
assert.equal(view.assessHost(hosts[4]).key, 'unknown');
assert.equal(view.assessHost(host('1', { maintenance: null })).key, 'unknown');
assert.equal(view.assessHost(host('1', { powerState: 'poweredOff' })).key, 'warning');
assert.equal(view.hostResource(host('1'), 'cpu').percent, 40);
assert.equal(view.hostResource(host('1', { usedCpuMHz: 0 }), 'cpu').percent, 0, 'Zero is a valid measurement');
assert.equal(view.hostResource(host('1', { connectionState: 'disconnected' }), 'cpu').used, null, 'Do not show old measurements after disconnect');
assert.equal(view.hostResource(host('1', { totalCpuMHz: 0 }), 'cpu').percent, null);
assert.equal(view.hostResource(host('1', { usedCpuMHz: null }), 'cpu').percent, null);
assert.equal(view.clusterLabel(hosts[3]), 'Bağımsız sunucu'); assert.equal(view.clusterLabel(hosts[4]), 'Küme bilgisi bilinmiyor');
const defaults = { search: '', cluster: 'all', health: 'all', connection: 'all' };
assert.equal(view.filterHosts(hosts, { ...defaults, search: 'ÜRETİM' }).length, 2);
assert.equal(view.filterHosts(hosts, { ...defaults, cluster: 'standalone' })[0].id, 'host-301');
assert.equal(view.filterHosts(hosts, { ...defaults, cluster: 'unknown' })[0].id, 'host-401');
assert.equal(view.filterHosts(hosts, { ...defaults, health: 'maintenance' })[0].id, 'host-102');
assert.equal(view.filterHosts(hosts, { ...defaults, connection: 'unknown' })[0].id, 'host-401');
const duplicateNames = [host('1', { clusterName: 'Aynı ad', clusterId: 'c1' }), host('2', { clusterName: 'Aynı ad', clusterId: 'c2' })];
assert.equal(view.clusterOptions(duplicateNames).length, 2);
assert.equal(view.filterHosts(duplicateNames, { ...defaults, cluster: 'c2' })[0].id, '2');
const csv = view.hostCsv([host('1', { name: '=SUM(1,2);"örnek"\n' })]); assert.ok(csv.startsWith('\uFEFF')); assert.match(csv, /"'=SUM\(1,2\);""örnek""\n"/); assert.match(csv, /vCenter sağlığı/);
assert.match(view.hostCsv([hosts[2]]), /"CPU kullanımı \(MHz\)"/); assert.doesNotMatch(view.hostCsv([hosts[2]]), /"32000"/, 'Offline CPU measurement cannot be exported');
const original = JSON.stringify(hosts);
const { HostWorkspace } = load('components/virtualization/HostWorkspace.tsx');
const render = props => renderToStaticMarkup(React.createElement(HostWorkspace, { hosts, loading: false, refreshing: false, error: null, collectedAt: '2026-10-16T12:00:00Z', onRefresh() {}, ...props }));
const html = render({}); assert.match(html, /CPU kullanımı/); assert.match(html, /role="meter"/); assert.match(html, /Bağımsız sunucu/); assert.match(html, /Küme bilgisi bilinmiyor/); assert.match(html, /Kullanım verisi yok/); assert.match(html, /Sunucu sağlığı filtresi/);
assert.match(render({ hosts: [], error: 'Kaynak yok.' }), /Sunucu verileri alınamadı/); assert.match(render({ error: 'Yenilenemedi.' }), /Son alınan veriler gösteriliyor/); assert.match(render({ hosts: [] }), /Bu kaynakta ESXi sunucusu bulunamadı/);
assert.equal(JSON.stringify(hosts), original);
assert.match(fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8'), /COPY[^\n]*vmware_workspace\.py[^\n]*get-host-workspace\.py[^\n]*\.\/scripts\//, 'Production image must contain the complete SDK reader');
async function bridgeChecks() {
  let rows = hosts, args, payload;
  const bridge = moduleLoader({ path, '@/lib/security/tls': { getPythonTlsPolicy: () => ({ verify: true }) }, child_process: { spawn: (...input) => {
    args = input; const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter(); child.stdout.setEncoding = () => {}; child.kill = () => {};
    child.stdin.end = data => { payload = JSON.parse(data); queueMicrotask(() => { child.stdout.emit('data', JSON.stringify({ protocol: 1, success: true, hostWorkspace: rows })); child.emit('close', 0); }); }; return child;
  } } }, { setTimeout, clearTimeout, process: { cwd: () => root, env: {} } })('lib/integrations/vmware-python.ts');
  const config = { host: 'fixture.invalid', username: 'fixture-reader', password: 'fixture-secret' };
  assert.equal((await bridge.runVMwarePython('hostWorkspace', config)).length, 5); assert.equal(args[2].shell, false); assert.ok(args[1][1].endsWith('get-host-workspace.py')); assert.equal(payload.password, config.password); assert.doesNotMatch(JSON.stringify(args), /fixture-secret/);
  rows = []; assert.equal((await bridge.runVMwarePython('hostWorkspace', config)).length, 0);
  for (const invalid of [[host('1'), host('1')], [{ ...host('1'), clusterId: null }], [{ ...hosts[3], clusterId: 'wrong' }], [{ ...host('1'), clusterMembership: 'invented' }], [{ ...host('1'), usedCpuMHz: '0' }], [{ ...host('1'), totalMemoryBytes: -1 }], [{ ...host('1'), vendor: undefined }]]) {
    rows = invalid; await assert.rejects(() => bridge.runVMwarePython('hostWorkspace', config), error => error.code === 'VMWARE_HELPER_OUTPUT_INVALID');
  }
}
async function routeChecks() {
  let allowed = true, calls = 0, bypass, sourceFault = false;
  const service = { authenticate: async () => true, fetchHostWorkspace: async () => { calls++; if (sourceFault) throw { code: 'VMWARE_HELPER_SOURCE_TIMEOUT' }; return hosts; } };
  const dependencies = {
    'next/server': { NextRequest, NextResponse }, '@/lib/auth/api-permission': { authorizeApiRequest: async () => allowed ? { allowed: true } : { allowed: false, response: NextResponse.json({ error: 'Denied' }, { status: 403 }) } },
    '@/lib/auth/permission-policy': {}, '@/lib/integrations/vmware': {}, '@/lib/integrations/vmware-source': { createSavedVMwareSource: () => ({ service, scope: 'fixture-scope' }) },
    '@/lib/integrations/inventory-source-selection': { InventorySourceSelectionError: class extends Error {}, selectInventorySource: async () => ({}) },
    '@/lib/integrations/vmware-cache': { vmwareResourceKey: type => type, loadVMwareCachedValue: async (_scope, key, ttl, callback, force) => { assert.equal(key, 'host-workspace'); assert.equal(ttl, 300000); bypass = force; return { data: await callback(), cache: 'MISS', age: 0 }; } },
    '@/lib/prisma': {}, '@/lib/integrations/sync-log': {}, '@/lib/integrations/sync-coordinator': {}, '@/lib/security/integration-credentials': {}, '@/lib/validators': {}, '@/lib/validators/integrations': {},
    '@/lib/integrations/vmware-python': { isVMwarePythonError: error => error?.code?.startsWith('VMWARE_HELPER_'), vmwareCollectionErrorMessage: () => 'Veri toplama süresi aşıldı.' },
  };
  const route = moduleLoader(dependencies)('app/api/integrations/vmware/route.ts');
  const request = headers => new NextRequest('http://fixture.invalid/api/integrations/vmware?type=host-workspace', { headers });
  let response = await route.GET(request()); assert.equal(response.status, 200); assert.equal((await response.json()).hosts.length, 5); assert.equal(bypass, false);
  response = await route.GET(request({ 'x-cache-bypass': '1' })); assert.equal(response.status, 200); assert.equal(bypass, true);
  allowed = false; response = await route.GET(request()); assert.equal(response.status, 403); assert.equal(calls, 2);
  allowed = true; sourceFault = true; response = await route.GET(request()); assert.equal(response.status, 504);
}
async function main() { await bridgeChecks(); await routeChecks(); console.log('ESXi workspace checks passed: real/unknown/maintenance health, usage and capacity, disconnected measurements, stable cluster IDs, independent hosts, filters, CSV, rendered states, SDK bridge, API authorization and refresh. No live source or writes.'); }
main().catch(error => { console.error(error); process.exitCode = 1; });
