// Real presentation, bridge and API code; synthetic source/ORM/process only.
/* eslint-disable @typescript-eslint/no-require-imports, @next/next/no-assign-module-variable */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { EventEmitter } = require('node:events');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { NextRequest, NextResponse } = require('next/server');
const { cluster, host, clusters } = require('./fixtures/cluster-workspace.cjs');
const { moduleLoader } = require('./check-alarm-occurrences.cjs');
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
    vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: relative })(local, module, module.exports);
    return module.exports;
  };
  return load;
}
const load = uiLoader();
const view = load('lib/virtualization/cluster-workspace.ts');
assert.equal(view.clusterHealth(cluster('a')).key, 'healthy');
assert.equal(view.clusterHealth(cluster('a', { overallStatus: 'gray' })).key, 'unknown');
assert.equal(view.clusterHealth(cluster('a', { overallStatus: 'red' })).key, 'critical');
assert.equal(view.clusterHealth(cluster('a', { hosts: [host('1'), host('2', { maintenance: true })] })).key, 'warning');
assert.equal(view.clusterHealth(cluster('a', { hosts: [host('1', { maintenance: null }), host('2')] })).key, 'unknown');
assert.equal(view.clusterHealth(clusters[2]).label, 'Bağlantı sorunu');
assert.equal(view.clusterHealth(clusters[3]).key, 'empty', '0 / 0 hosts is not healthy');
assert.equal(view.clusterUsage(cluster('a'), 'cpu').percent, 40);
assert.equal(view.clusterUsage(clusters[2], 'memory').percent, null, 'Offline host is not zero usage');
assert.equal(view.clusterUsage(cluster('a', { hosts: [host('1')] }), 'cpu').used, null, 'Partial membership cannot imply complete usage');
assert.equal(view.clusterUsage(cluster('a', { totalCpuMHz: 0 }), 'cpu').percent, null);
assert.equal(view.clusterUsage(cluster('a', { hosts: [host('1', { usedCpuMHz: null }), host('2')] }), 'cpu').percent, null);
assert.equal(view.sumKnown([1, null, 2]), null);
assert.equal(view.formatMemory(1024 ** 4), '1 TiB'); assert.equal(view.formatCpu(160000), '160 GHz');
assert.equal(view.filterClusters(clusters, 'yedek-02', 'all')[0].id, 'domain-c102');
assert.equal(view.filterClusters(clusters, 'ÜRETİM', 'healthy').length, 1);
assert.equal(view.filterClusters(clusters, '', 'warning').length, 2);
const csv = view.clusterCsv([cluster('a', { name: '=SUM(1,2);"örnek"\n' })]);
assert.match(csv, /"'=SUM\(1,2\);""örnek""\n"/); assert.ok(csv.startsWith('\uFEFF')); assert.match(csv, /Küme adı/);
const original = JSON.stringify(clusters);
const { ClusterWorkspace } = load('components/virtualization/ClusterWorkspace.tsx');
const render = props => renderToStaticMarkup(React.createElement(ClusterWorkspace, { clusters, loading: false, refreshing: false, error: null, collectedAt: '2026-10-16T12:00:00Z', onRefresh() {}, ...props }));
const html = render({}); assert.match(html, /Üretim Kümesi/); assert.match(html, /ESXi sunucularını incele/); assert.match(html, /Kullanım verisi eksik/); assert.match(html, /role="meter"/);
const failed = render({ clusters: [], error: 'Kaynak yapılandırılmadı.' }); assert.match(failed, /Küme verileri alınamadı/); assert.doesNotMatch(failed, />Sağlıklı<\/span>/); assert.match(failed, /disabled=""[^>]*><svg[^]*?CSV indir/);
assert.match(render({ error: 'Örnek bağlantı hatası' }), /Son alınan veriler gösteriliyor/);
assert.match(render({ clusters: [] }), /Bu kaynakta küme bulunamadı/);
assert.equal(JSON.stringify(clusters), original, 'Presentation never mutates source data');
async function bridgeChecks() {
  let rows = clusters, input, spawnArgs;
  const bridge = moduleLoader({ path, '@/lib/security/tls': { getPythonTlsPolicy: () => ({ verify: true }) }, child_process: { spawn: (...args) => {
    spawnArgs = args; const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter(); child.stdout.setEncoding = () => {}; child.kill = () => {};
    child.stdin.end = data => { input = JSON.parse(data); queueMicrotask(() => { child.stdout.emit('data', JSON.stringify({ protocol: 1, success: true, clusters: rows })); child.emit('close', 0); }); }; return child;
  } } }, { setTimeout, clearTimeout, process: { cwd: () => root, env: {} } })('lib/integrations/vmware-python.ts');
  const config = { host: 'fixture.invalid', username: 'fixture-reader', password: 'fixture-secret' };
  assert.equal((await bridge.runVMwarePython('clusters', config)).length, 4);
  assert.ok(spawnArgs[1][1].endsWith('get-cluster-details.py')); assert.equal(spawnArgs[2].shell, false); assert.equal(input.operation, 'clusters'); assert.equal(input.password, config.password); assert.doesNotMatch(JSON.stringify(spawnArgs), /fixture-secret/);
  rows = []; assert.equal((await bridge.runVMwarePython('clusters', config)).length, 0);
  for (const invalid of [[{ ...cluster('a'), hosts: [host('1'), host('1')] }], [cluster('a'), cluster('a')], [{ ...cluster('a'), totalCpuMHz: -1 }], [{ ...cluster('a'), effectiveHosts: undefined }], [{ ...cluster('a'), hosts: [{ ...host('1'), usedCpuMHz: '0' }] }]]) {
    rows = invalid; await assert.rejects(() => bridge.runVMwarePython('clusters', config), error => error.code === 'VMWARE_HELPER_OUTPUT_INVALID');
  }
}
async function routeChecks() {
  let allowed = true, calls = 0, bypass, sourceFault = false;
  const service = { authenticate: async () => true, fetchClusterWorkspace: async () => { calls++; if (sourceFault) throw { code: 'VMWARE_HELPER_SOURCE_TIMEOUT' }; return clusters; } };
  const dependencies = {
    'next/server': { NextRequest, NextResponse }, '@/lib/auth/api-permission': { authorizeApiRequest: async () => allowed ? { allowed: true } : { allowed: false, response: NextResponse.json({ error: 'Denied' }, { status: 403 }) } },
    '@/lib/auth/permission-policy': {}, '@/lib/integrations/vmware': {}, '@/lib/integrations/vmware-source': { createSavedVMwareSource: () => ({ service, scope: 'fixture-scope' }) },
    '@/lib/integrations/inventory-source-selection': { InventorySourceSelectionError: class extends Error {}, selectInventorySource: async () => ({}) },
    '@/lib/integrations/vmware-cache': { vmwareResourceKey: type => type, loadVMwareCachedValue: async (_scope, key, ttl, callback, force) => { assert.equal(key, 'cluster-workspace'); assert.equal(ttl, 300000); bypass = force; return { data: await callback(), cache: 'MISS', age: 0 }; } },
    '@/lib/prisma': {}, '@/lib/integrations/sync-log': {}, '@/lib/integrations/sync-coordinator': {}, '@/lib/security/integration-credentials': {}, '@/lib/validators': {}, '@/lib/validators/integrations': {},
    '@/lib/integrations/vmware-python': { isVMwarePythonError: error => error?.code?.startsWith('VMWARE_HELPER_'), vmwareCollectionErrorMessage: () => 'Veri toplama süresi aşıldı.' },
  };
  const route = moduleLoader(dependencies)('app/api/integrations/vmware/route.ts');
  const request = headers => new NextRequest('http://fixture.invalid/api/integrations/vmware?type=cluster-workspace', { headers });
  let response = await route.GET(request()); assert.equal(response.status, 200); assert.equal((await response.json()).clusters.length, 4); assert.equal(bypass, false);
  response = await route.GET(request({ 'x-cache-bypass': '1' })); assert.equal(response.status, 200); assert.equal(bypass, true);
  allowed = false; response = await route.GET(request()); assert.equal(response.status, 403); assert.equal(calls, 2);
  allowed = true; sourceFault = true; response = await route.GET(request()); assert.equal(response.status, 504); assert.equal((await response.json()).error, 'Veri toplama süresi aşıldı.');
}
async function main() { await bridgeChecks(); await routeChecks(); console.log('Cluster workspace checks passed: health/unknown/empty, physical capacity and usage completeness, filters, CSV, rendered states, real SDK bridge contract, authorization and refresh. No live source or writes.'); }
main().catch(error => { console.error(error); process.exitCode = 1; });
