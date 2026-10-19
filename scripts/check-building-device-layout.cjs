/* eslint-disable @typescript-eslint/no-require-imports */
// Run the real handlers against synthetic authentication, inventory and storage.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const rows = new Map();
let auth = { role: 'EDITOR' };
let unavailable = false;
let failResetWrite = false;
let graphUnavailable = false;
const devices = [
  { id: 'direct', name: 'Anahtar', buildingId: 'a', rackId: null },
  { id: 'rack', name: 'Sunucu', buildingId: 'b', rackId: 'rack1', rack: { room: { floor: { buildingId: 'a' } } } },
  { id: 'free', name: 'Konumsuz', buildingId: null, rackId: null },
];
function matches(device, where) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') return value.every(clause => matches(device, clause));
    if (key === 'OR') return value.some(clause => matches(device, clause));
    if (value && typeof value === 'object') return device[key] && matches(device[key], value);
    return device[key] === value;
  });
}
const prisma = {
  deviceLink: { findMany: async () => [] },
  building: { findUnique: async ({ where }) => ['a', 'b'].includes(where.id) ? { id: where.id } : null },
  device: {
    findFirst: async ({ where }) => devices.find(device => matches(device, where)) || null,
    findMany: async ({ where }) => devices.filter(device => !where || matches(device, where)).sort((a, b) => a.name.localeCompare(b.name)),
  },
  connection: { findMany: async () => {
    if (graphUnavailable) throw new Error('Graph offline');
    return [{ id: 'link', status: 'UP', sourcePort: { name: 'Gi1', switchDevice: { id: 'direct' } }, sourceInterface: { name: 'eth0', device: { id: 'rack' } } }];
  } },
  nmsTopologyLink: { findMany: async () => [] },
  $transaction: async operation => {
    const before = new Map(rows);
    try { return await operation(prisma); }
    catch (err) { rows.clear(); for (const [key, value] of before) rows.set(key, value); throw err; }
  },
  systemConfig: {
    findMany: async ({ where }) => {
      if (unavailable) throw new Error('Storage offline');
      return [...rows].filter(([key]) => key.startsWith(where.key.startsWith)).map(([key, value]) => ({ key, value }));
    },
    upsert: async ({ where, create, update }) => {
      if (unavailable) throw new Error('Storage offline');
      rows.set(where.key, rows.has(where.key) ? update.value : create.value);
    },
    deleteMany: async ({ where }) => {
      if (unavailable) throw new Error('Storage offline');
      for (const key of rows.keys()) if (key.startsWith(where.key.startsWith)) rows.delete(key);
    },
    createMany: async ({ data }) => {
      if (failResetWrite) throw new Error('Reset write failed');
      for (const { key, value } of data) rows.set(key, value);
    },
  },
};
function load(relative) {
  const loaded = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const fixtureRequire = name => {
    if (name === 'next/server') return { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200, headers: options.headers }) } };
    if (name === '@/lib/prisma') return { prisma };
    if (name === '@/lib/auth/request-actor') return { getRequestActor: async () => auth };
    if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`);
    if (name.startsWith('.')) return load(`${path.join(path.dirname(relative), name)}.ts`);
    throw new Error(`Unexpected dependency ${name}`);
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: relative })(fixtureRequire, loaded, loaded.exports);
  return loaded.exports;
}
const { GET, PUT, POST } = load('app/api/network/building-device-layout/route.ts');
const { deviceLayoutPrefix, readDeviceLayout } = load('lib/topology/building-device-layout.ts');
const virtual = '__unassigned-devices__';
const request = (body, buildingId = 'a') => ({ json: async () => body, nextUrl: { searchParams: new URLSearchParams({ buildingId }) } });
const move = (deviceId, buildingId, position = { x: 200.25, y: -80.5 }) => PUT(request({ deviceId, buildingId, position }));
const reset = (buildingId = 'a') => POST(request({ action: 'reset', buildingId }));
async function main() {
  auth = null;
  assert.equal((await GET(request())).status, 401);
  assert.equal((await move('direct', 'a')).status, 401);
  assert.equal((await reset()).status, 401);
  auth = { role: 'VIEWER' };
  assert.equal((await GET(request())).body.data.canEdit, false);
  assert.equal((await move('direct', 'a')).status, 403);
  assert.equal((await reset()).status, 403);
  auth = { role: 'EDITOR' };
  for (const body of [null, {}, { buildingId: 'a:direct', deviceId: 'direct', position: { x: 1, y: 1 } }, { buildingId: 'a', deviceId: 'direct:other', position: { x: 1, y: 1 } }, ...[NaN, Infinity, 1e9, '2', null].map(x => ({ buildingId: 'a', deviceId: 'direct', position: { x, y: 0 } }))]) assert.equal((await PUT(request(body))).status, 400);
  assert.equal((await GET(request(null, 'a:other'))).status, 400);
  assert.equal((await GET(request(null, 'missing'))).status, 404);
  assert.equal((await move('direct', 'missing')).status, 404);
  assert.equal((await move('missing', 'a')).status, 409);
  assert.equal((await move('direct', 'b')).status, 409);
  assert.equal((await move('rack', 'b')).status, 409, 'Rack-derived membership takes priority over a stale direct assignment');
  assert.equal((await move('rack', virtual)).status, 409);
  assert.equal(rows.size, 0, 'Invalid and unauthorized writes must not mutate storage');
  assert.equal((await move('direct', 'a')).status, 200);
  assert.equal((await move('rack', 'a', { x: -300, y: 450 })).status, 200);
  assert.equal((await move('free', virtual)).status, 200);
  const initial = await GET(request());
  assert.match(initial.headers['Cache-Control'], /no-store/);
  assert.equal(initial.body.data.canEdit, true);
  assert.deepEqual({ ...initial.body.data.positions }, { direct: { x: 200.25, y: -80.5 }, rack: { x: -300, y: 450 } });
  devices[0].buildingId = 'b';
  assert.equal((await move('direct', 'a')).status, 409, 'Moving a device away invalidates stale writes');
  assert.equal((await move('direct', 'b', { x: 10, y: 20 })).status, 200);
  assert.deepEqual((await GET(request(null, 'b'))).body.data.positions.direct, { x: 10, y: 20 });
  assert.deepEqual((await GET(request())).body.data.positions.direct, { x: 200.25, y: -80.5 }, 'Each building retains its own layout independently');
  rows.set(`${deviceLayoutPrefix('a')}bad`, 'invalid json');
  rows.set(`${deviceLayoutPrefix('a')}invalid`, JSON.stringify({ x: null, y: 0 }));
  rows.set('network.topology.building-position:building-a', '{"x":0,"y":0}');
  const restored = await GET(request());
  assert.deepEqual({ ...restored.body.data.positions }, { ...initial.body.data.positions });
  assert.equal(rows.get('network.topology.building-position:building-a'), '{"x":0,"y":0}');
  assert.deepEqual({ ...readDeviceLayout('a', [{ key: `${deviceLayoutPrefix('b')}direct`, value: '{"x":1,"y":1}' }]) }, {});
  for (const invalid of [null, {}, { action: 'unexpected', buildingId: 'a' }, { action: 'reset', buildingId: 'a:other' }]) assert.equal((await POST(request(invalid))).status, 400);
  assert.equal((await reset('missing')).status, 404);
  devices[0].buildingId = 'a';
  const beforeReset = new Map(rows);
  failResetWrite = true;
  assert.equal((await reset()).status, 503);
  assert.deepEqual(rows, beforeReset, 'Partial reset writes must roll back to the previous saved layout');
  failResetWrite = false; graphUnavailable = true;
  assert.equal((await reset()).status, 503);
  assert.deepEqual(rows, beforeReset, 'Unavailable connections must not replace the previous layout');
  graphUnavailable = false;
  const automatic = await reset();
  assert.equal(automatic.status, 200);
  assert.deepEqual(automatic.body.data.positions, { direct: { x: 0, y: 0 }, rack: { x: 220, y: 0 } }, 'Reset includes all members and uses the connection-aware initial layout');
  assert.deepEqual({ ...(await GET(request())).body.data.positions }, automatic.body.data.positions, 'The automatic layout must be stored and restored');
  assert.deepEqual((await reset()).body.data.positions, automatic.body.data.positions, 'Repeated resets must be deterministic');
  assert.equal(rows.get(`${deviceLayoutPrefix('b')}direct`), beforeReset.get(`${deviceLayoutPrefix('b')}direct`), 'Other building layouts must be untouched');
  assert.equal(rows.get(`${deviceLayoutPrefix(virtual)}free`), beforeReset.get(`${deviceLayoutPrefix(virtual)}free`));
  assert.equal(rows.get('network.topology.building-position:building-a'), '{"x":0,"y":0}');
  assert.equal((await reset('b')).status, 200, 'An empty building can clear obsolete saved device positions');
  assert.deepEqual({ ...(await GET(request(null, 'b'))).body.data.positions }, {});
  assert.deepEqual((await reset(virtual)).body.data.positions, { free: { x: 0, y: 0 } });
  unavailable = true;
  assert.equal((await GET(request())).status, 503);
  assert.equal((await move('rack', 'a')).status, 503);
  assert.equal((await reset()).status, 503);
  console.log('Building device layout passed: auth, validation, membership, per-building isolation, reload, deterministic all-device reset, empty/virtual groups, atomic rollback, unavailable sources and storage failures. Synthetic storage only.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
