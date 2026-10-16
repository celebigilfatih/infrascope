/* eslint-disable @typescript-eslint/no-require-imports, @next/next/no-assign-module-variable */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), sandbox = require('node:vm'), ts = require('typescript');
const { EventEmitter } = require('node:events');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const { NextRequest, NextResponse } = require('next/server');
const { moduleLoader } = require('./check-alarm-occurrences.cjs');
const { NOW, DAY, snapshot, vm, vms } = require('./fixtures/snapshot-workspace.cjs');
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
const view = load('lib/virtualization/snapshot-workspace.ts'), capabilities = { create: true, delete: true, revert: true };
const defaults = { search: '', vm: 'all', age: 'all', sort: 'oldest' }, rows = view.snapshotRows(vms);
assert.equal(view.snapshotAge(snapshot('1', { createTime: new Date(NOW-7*DAY).toISOString() }), NOW).key, 'old');
assert.equal(view.snapshotAge(snapshot('1', { createTime: new Date(NOW-7*DAY+1).toISOString() }), NOW).key, 'recent');
assert.equal(view.snapshotAge(snapshot('1', { createTime: new Date(NOW-30*DAY).toISOString() }), NOW).key, 'veryOld');
assert.equal(view.snapshotAge(snapshot('1', { createTime: new Date(NOW+1).toISOString() }), NOW).key, 'unknown');
assert.equal(view.snapshotAge(snapshot('1', { createTime: null }), NOW).key, 'unknown');
assert.equal(view.snapshotAge(snapshot('1', { createTime: 'bad-date' }), NOW).key, 'unknown');
assert.equal(view.snapshotAge(snapshot('1', { createTime: '2026-10-16T16:00:00+03:00' }), NOW).elapsed, 0);
assert.equal(view.snapshotDate('bad-date'), 'Tarih bilinmiyor'); assert.match(view.snapshotDate('2026-10-16T13:00:00Z'), /16:00/);
assert.equal(view.snapshotSize(rows[0]), 20*1024**3+1024**2);
assert.equal(view.snapshotSize(rows[1]), 23*1024**3+2*1024**2);
const totals = view.snapshotSizeTotal(rows);
assert.equal(totals.bytes, 33*1024**3+6*1024**2, 'Shared base disk is counted once per VM; identical file keys on another VM stay distinct'); assert.equal(totals.unknownSnapshots, 2);
assert.equal(view.snapshotSizeTotal([]).bytes, 0);
assert.equal(view.snapshotSizeTotal([rows[4]]).bytes, null);
const zero = { vm: vm('zero', { files: [{ key: 1, sizeBytes: 0 }] }), snapshot: snapshot('zero', { fileKeys: [1] }) };
assert.equal(view.snapshotSize(zero), 0); assert.equal(view.snapshotSize({ ...zero, snapshot: snapshot('missing', { fileKeys: [999] }) }), null);
assert.equal(view.snapshotRows(vms).length, 6);
assert.notEqual(view.snapshotKey(rows[0]), view.snapshotKey(rows[3]), 'Snapshot ID alone cannot identify a row across VMs');
assert.equal(view.filterSnapshots(vms, { ...defaults, age: 'old' }, NOW).length, 3);
assert.equal(view.filterSnapshots(vms, { ...defaults, age: 'veryOld' }, NOW).length, 1);
assert.equal(view.filterSnapshots(vms, { ...defaults, age: 'unknown' }, NOW).length, 2);
assert.equal(view.filterSnapshots(vms, { ...defaults, vm: 'vm-102' }, NOW)[0].vm.id, 'vm-102');
assert.equal(view.filterSnapshots(vms, { ...defaults, search: 'GÜVENLİK' }, NOW)[0].snapshot.id, 'snapshot-2');
assert.equal(view.filterSnapshots(vms, { ...defaults, sort: 'size' }, NOW)[0].snapshot.id, 'snapshot-3');
assert.equal(view.snapshotCreateOptions(vms).length, 3);
const original = JSON.stringify(vms);
const csv = view.snapshotCsv([{ vm: vm('csv'), snapshot: snapshot('csv', { name: '=SUM(1,2);"ö"\n' }) }], NOW);
assert.ok(csv.startsWith('\uFEFF')); assert.match(csv, /"'=SUM\(1,2\);""ö""\n"/); assert.match(csv, /satırlar arasında paylaşılabilir/);
assert.match(view.snapshotCsv([{ vm: vm('utc'), snapshot: snapshot('utc', { createTime: '2026-10-16T16:00:00+03:00' }) }], NOW), /2026-10-16T13:00:00\.000Z/);
const { SnapshotWorkspace } = load('components/virtualization/SnapshotWorkspace.tsx');
const render = props => renderToStaticMarkup(React.createElement(SnapshotWorkspace, { vms, loading: false, refreshing: false, error: null, capabilities, now: NOW, collectedAt: '2026-10-16T13:00:00Z', onRefresh() {}, onMutation: async () => { throw new Error('Unexpected write'); }, ...props }));
const html = render({}); assert.match(html, /3 görüntü en az 7 gündür tutuluyor/); assert.match(html, /Gelecek tarih/); assert.match(html, /Yaş bilinmiyor/); assert.match(html, /Oluşturulma \(TSİ\)/); assert.match(html, /temel|disk ve durum/);
assert.match(render({ error: 'Test' }), /Son alınan veriler korunuyor/); assert.match(render({ stale: true }), /Önbellekteki veriler gösteriliyor/);
assert.match(render({ vms: [], error: 'Test' }), /Anlık görüntü bilgileri alınamadı/); assert.match(render({ vms: [] }), /Bu kaynakta anlık görüntü bulunamadı/);
assert.doesNotMatch(render({ capabilities: { create: false, delete: false, revert: false } }), />Yeni görüntü</);
assert.equal(JSON.stringify(vms), original);
assert.match(fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8'), /COPY[^\n]*get-snapshot-workspace\.py[^\n]*\.\/scripts\//);
async function mutationChecks() {
  const calls = [], fetcher = async (...args) => { calls.push(args); return { ok: true, json: async () => ({ success: true }) }; };
  await view.requestSnapshotMutation(vms, { action: 'snapshot-delete', vmId: 'vm-102', snapshotId: 'snapshot-1' }, capabilities, fetcher);
  assert.deepEqual(JSON.parse(calls[0][1].body), { action: 'snapshot-delete', vmId: 'vm-102', snapshotId: 'snapshot-1' });
  await view.requestSnapshotMutation(vms, { action: 'snapshot-revert', vmId: 'vm-101', snapshotId: 'snapshot-2' }, capabilities, fetcher);
  await view.requestSnapshotMutation(vms, { action: 'snapshot-create', vmId: 'vm-201', name: ' Before update ', description: 'Fixture only' }, capabilities, fetcher);
  assert.deepEqual(JSON.parse(calls[2][1].body), { action: 'snapshot-create', vmId: 'vm-201', name: 'Before update', description: 'Fixture only' });
  for (const [mutation, permission] of [[{ action: 'snapshot-delete', vmId: 'vm-101', snapshotId: 'snapshot-1' }, { ...capabilities, delete: false }], [{ action: 'snapshot-create', vmId: 'vm-201', name: '  ', description: '' }, capabilities], [{ action: 'snapshot-revert', vmId: 'vm-101', snapshotId: 'missing' }, capabilities], [{ action: 'snapshot-delete', vmId: 'vm-401', snapshotId: 'snapshot-unknown' }, capabilities]]) {
    await assert.rejects(view.requestSnapshotMutation(vms, mutation, permission, fetcher));
  }
  assert.equal(calls.length, 3, 'Invalid/unauthorized operations must not send a write');
  const mutation = { action: 'snapshot-delete', vmId: 'vm-101', snapshotId: 'snapshot-1' };
  await assert.rejects(view.requestSnapshotMutation(vms, mutation, capabilities, async () => ({ ok: false, json: async () => ({ error: 'Yetki yok' }) })), /Yetki yok/);
  await assert.rejects(view.requestSnapshotMutation(vms, mutation, capabilities, async () => ({ ok: true, json: async () => ({ success: 1 }) })), /kabul edilmedi/);
}
async function bridgeChecks() {
  let data = vms, args;
  const bridge = moduleLoader({ path, '@/lib/security/tls': { getPythonTlsPolicy: () => ({ verify: true }) }, child_process: { spawn: (...input) => {
    args = input; const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter(); child.stdout.setEncoding = () => {}; child.kill = () => {};
    child.stdin.end = () => queueMicrotask(() => { child.stdout.emit('data', JSON.stringify({ protocol: 1, success: true, snapshotWorkspace: data })); child.emit('close', 0); }); return child;
  } } }, { setTimeout, clearTimeout, process: { cwd: () => root, env: {} } })('lib/integrations/vmware-python.ts');
  const config = { host: 'fixture.invalid', username: 'fixture-reader', password: 'fixture-secret' };
  assert.equal((await bridge.runVMwarePython('snapshotWorkspace', config)).length, 5); assert.equal(args[2].shell, false); assert.ok(args[1][1].endsWith('get-snapshot-workspace.py')); assert.doesNotMatch(JSON.stringify(args), /fixture-secret/);
  data = []; assert.equal((await bridge.runVMwarePython('snapshotWorkspace', config)).length, 0);
  for (const invalid of [[vm('1'), vm('1')], [vm('1', { snapshots: [snapshot('1'), snapshot('1')] })], [vm('1', { snapshots: [snapshot('1', { createTime: 'invalid' })] })], [vm('1', { snapshots: [snapshot('1', { fileKeys: [1, 1] })] })], [vm('1', { files: [{ key: 1, sizeBytes: -1 }] })], [vm('1', { files: [{ key: 1, sizeBytes: 0 }, { key: 1, sizeBytes: 2 }] })], [vm('1', { template: undefined })]]) {
    data = invalid; await assert.rejects(bridge.runVMwarePython('snapshotWorkspace', config), error => error.code === 'VMWARE_HELPER_OUTPUT_INVALID');
  }
}
async function routeChecks() {
  let role = 'admin', allowed = true, calls = 0, cached, bypass, fail = false;
  const service = { authenticate: async () => true, fetchSnapshotWorkspace: async () => { calls++; if (fail) throw { code: 'VMWARE_HELPER_SOURCE_TIMEOUT' }; return vms; } };
  const dependencies = {
    'next/server': { NextRequest, NextResponse }, '@/lib/auth/api-permission': { authorizeApiRequest: async () => allowed ? { allowed: true, auth: { role } } : { allowed: false, response: NextResponse.json({ error: 'Denied' }, { status: 403 }) } },
    '@/lib/auth/permission-policy': { canAccessSync: (role, resource, action) => { assert.equal(resource, 'devices'); return role === 'admin' || role === 'editor' && action === 'write'; } },
    '@/lib/integrations/vmware': {}, '@/lib/integrations/vmware-source': { createSavedVMwareSource: () => ({ service, scope: 'fixture-scope' }) },
    '@/lib/integrations/inventory-source-selection': { InventorySourceSelectionError: class extends Error {}, selectInventorySource: async () => ({}) },
    '@/lib/integrations/vmware-cache': { vmwareResourceKey: type => type, loadVMwareCachedValue: async (scope, key, ttl, callback, force) => { assert.equal(scope, 'fixture-scope'); assert.equal(key, 'snapshot-workspace'); assert.equal(ttl, 120000); bypass = force; cached = !cached || force ? await callback() : cached; assert.equal(cached.capabilities, undefined); return { data: cached, cache: 'HIT', age: 1 }; } },
    '@/lib/prisma': {}, '@/lib/integrations/sync-log': {}, '@/lib/integrations/sync-coordinator': {}, '@/lib/security/integration-credentials': {}, '@/lib/validators': {}, '@/lib/validators/integrations': {}, '@/lib/integrations/vmware-python': { isVMwarePythonError: error => error?.code?.startsWith('VMWARE_HELPER_'), vmwareCollectionErrorMessage: () => 'Veri toplama süresi aşıldı.' },
  };
  const route = moduleLoader(dependencies)('app/api/integrations/vmware/route.ts');
  const request = headers => new NextRequest('http://fixture.invalid/api/integrations/vmware?type=snapshot-workspace', { headers });
  let response = await route.GET(request()), json = await response.json(); assert.equal(response.status, 200); assert.equal(json.vms.length, 5); assert.deepEqual(json.capabilities, capabilities); assert.ok(json.collectedAt); assert.equal(bypass, false);
  role = 'viewer'; response = await route.GET(request()); assert.deepEqual((await response.json()).capabilities, { create: false, delete: false, revert: false }); assert.equal(calls, 1);
  role = 'editor'; response = await route.GET(request()); assert.deepEqual((await response.json()).capabilities, { create: true, delete: false, revert: true }); assert.equal(calls, 1);
  await route.GET(request({ 'x-cache-bypass': '1' })); assert.equal(bypass, true); assert.equal(calls, 2);
  allowed = false; response = await route.GET(request()); assert.equal(response.status, 403); assert.equal(calls, 2);
  allowed = true; fail = true; response = await route.GET(request({ 'x-cache-bypass': '1' })); assert.equal(response.status, 504); assert.equal(cached.vms.length, 5);
}
async function main() { await mutationChecks(); await bridgeChecks(); await routeChecks(); console.log('Snapshot workspace checks passed: exact age thresholds, timezone and invalid/future dates, own/shared/missing/zero file sizes, composite VM/snapshot IDs, filters/sorting/CSV, rendered states, unchanged write payloads, SDK validation, per-request capabilities and refresh. Synthetic records and mocked writes only.'); }
main().catch(error => { console.error(error); process.exitCode = 1; });
