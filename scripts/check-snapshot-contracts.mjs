// Actual snapshot model, Python bridge, API, permissions and cache; synthetic I/O only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { NextRequest, NextResponse } from 'next/server.js';
import { moduleLoader } from './check-alarm-occurrences.cjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vm = (id = 'vm-1') => ({
  id, name: 'Same VM name', template: false, connectionState: 'connected', powerState: 'poweredOff',
  snapshots: [{ id: 'snapshot-1', name: 'Fixture snapshot', description: '', state: 'poweredOff',
    createTime: '2026-10-16T12:00:00Z', fileKeys: [1, 2] }],
  files: [{ key: 1, sizeBytes: 0 }, { key: 2, sizeBytes: 1024 }],
});
const model = moduleLoader({})('lib/virtualization/snapshot-workspace.ts');
const caps = { create: true, delete: true, revert: true };
const results = [];
async function check(name, run) {
  try { await run(); results.push(true); console.log(`PASS ${name}`); }
  catch (error) { results.push(false); console.error(`FAIL ${name}`, error); }
}

await check('unknown sizes stay unknown; actual zero, shared files and composite identities survive', () => {
  const source = vm(), row = { vm: source, snapshot: source.snapshots[0] };
  assert.equal(model.snapshotSize(row), 1024);
  assert.equal(model.snapshotSize({ ...row, snapshot: { ...row.snapshot, fileKeys: [] } }), null);
  assert.equal(model.snapshotSize({ ...row, snapshot: { ...row.snapshot, fileKeys: [3] } }), null);
  assert.equal(model.snapshotSize({ ...row, snapshot: { ...row.snapshot, fileKeys: [1] } }), 0);
  assert.equal(model.snapshotSize({ ...row, vm: { ...source, files: null } }), null);
  source.snapshots.push({ ...source.snapshots[0], id: 'snapshot-2' });
  assert.equal(model.snapshotSizeTotal(model.snapshotRows([source, vm('vm-2')])).bytes, 2048);
  assert.equal(model.snapshotSizeTotal([]).bytes, 0);
  assert.notEqual(model.snapshotKey(row), model.snapshotKey({ vm: vm('vm-2'), snapshot: row.snapshot }));
  assert.equal(model.snapshotAge(row.snapshot, Date.parse('2026-10-16T11:00:00Z')).key, 'unknown');
  assert.equal(model.snapshotTimestamp('2026-10-16T15:00:00+03:00'), Date.parse(row.snapshot.createTime));
});

await check('bridge preserves stdin credentials and rejects invalid/inexact/duplicate measurements', async () => {
  let data = [vm()], exit = 0, success = true, code, args, input;
  const bridge = moduleLoader({ path, '@/lib/security/tls': { getPythonTlsPolicy: () => ({ verify: true }) },
    child_process: { spawn: (...values) => {
      args = values;
      const child = new EventEmitter();
      child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
      child.stdout.setEncoding = () => {}; child.kill = () => {};
      child.stdin.end = value => {
        input = JSON.parse(value);
        queueMicrotask(() => { child.stdout.emit('data', JSON.stringify({ protocol: 1, success, code, snapshotWorkspace: data })); child.emit('close', exit); });
      };
      return child;
    } },
  }, { setTimeout, clearTimeout, process: { cwd: () => root, env: { NODE_ENV: 'test' } } })('lib/integrations/vmware-python.ts');
  const config = { host: 'fixture.invalid', username: 'fixture-reader', password: 'fixture-secret' };
  const read = () => bridge.runVMwarePython('snapshotWorkspace', config);
  assert.equal((await read()).length, 1);
  assert.ok(args[1][1].endsWith('get-snapshot-workspace.py')); assert.equal(args[2].shell, false);
  assert.doesNotMatch(JSON.stringify(args), /fixture-secret/); assert.equal(input.password, config.password);
  assert.equal(input.operation, 'snapshotWorkspace'); assert.equal(input.tls.verify, true);
  for (const mutate of [
    row => { row.files[0].sizeBytes = 0.5; },
    row => { row.files[0].sizeBytes = Number.MAX_SAFE_INTEGER + 1; },
    row => { row.snapshots[0].fileKeys = []; },
    row => { row.snapshots[0].fileKeys = [Number.MAX_SAFE_INTEGER + 1]; },
    row => { row.files[0].key = Number.MAX_SAFE_INTEGER + 1; },
    row => { row.files.push({ ...row.files[0] }); },
    row => { row.snapshots.push({ ...row.snapshots[0] }); },
    row => { row.snapshots[0].createTime = '2026-10-16T12:00:00'; },
  ]) {
    const row = vm(); mutate(row); data = [row];
    await assert.rejects(read(), error => error.code === 'VMWARE_HELPER_OUTPUT_INVALID');
  }
  data = [vm(), vm()]; await assert.rejects(read(), error => error.code === 'VMWARE_HELPER_OUTPUT_INVALID');
  data = []; assert.equal((await read()).length, 0);
  success = false; code = 'PERMISSION_DENIED'; exit = 1;
  await assert.rejects(read(), error => error.code === 'VMWARE_HELPER_PERMISSION_DENIED' && !error.message.includes('fixture-secret'));
});

await check('API shares data cache across roles without sharing privileges; targets remain isolated', async () => {
  let role = 'ADMIN', allowed = true, fail = false, auth = true;
  const calls = { a: 0, b: 0 }, writes = [];
  const services = Object.fromEntries(['a', 'b'].map(id => [id, {
    authenticate: async () => auth,
    fetchSnapshotWorkspace: async () => { calls[id]++; if (fail) throw { code: 'VMWARE_HELPER_SOURCE_TIMEOUT' }; return [{ ...vm(), name: id }]; },
    deleteSnapshot: async (...args) => { writes.push({ target: id, args }); return { success: true }; },
  }]));
  const load = moduleLoader({
    'next/server': { NextRequest, NextResponse },
    '@/lib/auth/api-permission': { authorizeApiRequest: async (_request, resource, action) => {
      assert.equal(resource, 'devices');
      return allowed && (action === 'read' || role !== 'VIEWER') ? { allowed: true, auth: { role } }
        : { allowed: false, response: NextResponse.json({ error: 'Denied' }, { status: 403 }) };
    }, forbiddenApiPermission: () => NextResponse.json({ error: 'Denied' }, { status: 403 }) },
    '@/lib/integrations/vmware': {},
    '@/lib/integrations/vmware-source': { createSavedVMwareSource: config => ({ service: services[config.id], scope: `snapshot-contract-${config.id}` }) },
    '@/lib/prisma': { prisma: { integrationConfig: { findMany: async ({ where }) => ['a', 'b'].filter(id => !where.id || where.id === id).map(id => ({ id })) } } },
    '@/lib/integrations/sync-log': {}, '@/lib/integrations/sync-coordinator': {}, '@/lib/security/integration-credentials': {},
    '@/lib/validators': {}, '@/lib/validators/integrations': {},
    '@/lib/integrations/vmware-python': { isVMwarePythonError: error => error?.code?.startsWith('VMWARE_HELPER_'), vmwareCollectionErrorMessage: () => 'Veri toplama süresi aşıldı.' },
  }, { setTimeout, clearTimeout });
  const route = load('app/api/integrations/vmware/route.ts');
  const read = (id, bypass = false) => route.GET(new NextRequest(`http://fixture.invalid/api/integrations/vmware?type=snapshot-workspace${id ? `&configId=${id}` : ''}`,
    { headers: bypass ? { 'x-cache-bypass': '1' } : {} }));
  assert.equal((await read()).status, 409, 'Ambiguous source selection must fail before collecting');
  let response = await read('a'), json = await response.json();
  assert.equal(response.headers.get('x-cache'), 'MISS'); assert.equal(json.vms[0].name, 'a'); assert.deepEqual(json.capabilities, caps);
  role = 'VIEWER'; response = await read('a');
  assert.equal(response.headers.get('x-cache'), 'HIT'); assert.deepEqual((await response.json()).capabilities, { create: false, delete: false, revert: false });
  role = 'EDITOR'; response = await read('a'); assert.deepEqual((await response.json()).capabilities, { create: true, delete: false, revert: true });
  assert.equal(calls.a, 1);
  response = await read('b'); assert.equal((await response.json()).vms[0].name, 'b'); assert.equal(calls.b, 1);
  fail = true; response = await read('a', true); assert.equal(response.status, 504); assert.equal((await response.json()).vms, undefined);
  response = await read('a'); assert.equal(response.headers.get('x-cache'), 'HIT'); assert.equal((await response.json()).vms[0].name, 'a');
  fail = false; auth = false; assert.equal((await read('a', true)).status, 401);
  allowed = false; const before = calls.a; assert.equal((await read('a')).status, 403); assert.equal(calls.a, before);
  allowed = true; auth = true;
  const request = () => new NextRequest('http://fixture.invalid/api/integrations/vmware', {
    method: 'POST', body: JSON.stringify({ action: 'snapshot-delete', vmId: 'vm-1', snapshotId: 'snapshot-1', configId: 'b' }),
  });
  assert.equal((await route.POST(request())).status, 403, 'EDITOR cannot delete snapshots'); assert.equal(writes.length, 0);
  role = 'ADMIN'; assert.equal((await route.POST(request())).status, 200);
  assert.deepEqual(writes, [{ target: 'b', args: ['vm-1', 'snapshot-1'] }]);
});

await check('mutation helper forwards explicit source identity and rejects unauthorized calls before fetch', async () => {
  const calls = [];
  const fetcher = async (...args) => { calls.push(args); return { ok: true, json: async () => ({ success: true }) }; };
  const mutation = { action: 'snapshot-delete', vmId: 'vm-1', snapshotId: 'snapshot-1', configId: 'profile-b' };
  await model.requestSnapshotMutation([vm()], mutation, caps, fetcher);
  assert.deepEqual(JSON.parse(calls[0][1].body), mutation);
  await assert.rejects(model.requestSnapshotMutation([vm()], mutation, { ...caps, delete: false }, fetcher));
  assert.equal(calls.length, 1);
  await assert.rejects(model.requestSnapshotMutation([vm()], mutation, caps, async () => ({ ok: true, json: async () => ({ success: false }) })));
});

await check('runtime Docker package includes the collector and both shared Python dependencies', () => {
  const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
  const copy = dockerfile.split('\n').find(line => line.startsWith('COPY ') && line.includes('get-snapshot-workspace.py'));
  assert.ok(copy);
  for (const script of ['get-snapshot-workspace.py', 'vmware_helper.py', 'vmware_workspace.py']) {
    assert.ok(copy.includes(`scripts/${script}`)); assert.ok(fs.existsSync(path.join(root, 'scripts', script)));
  }
  assert.match(dockerfile, /ENV VMWARE_PYTHON_BIN=\/opt\/vmware\/bin\/python3/);
});
if (results.some(passed => !passed)) process.exitCode = 1;
else console.log(`Snapshot contracts passed (${results.length} groups; no source, database or remote mutation).`);
