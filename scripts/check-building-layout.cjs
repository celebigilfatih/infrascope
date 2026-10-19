/* eslint-disable @typescript-eslint/no-require-imports */
// Exercise the actual layout handlers with synthetic authentication and storage.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const rows = new Map();
let auth = { role: 'EDITOR', actor: { id: 'editor' } };
let unavailable = false;
let writes = 0;
let failResetWrite = false;
const resetBuildings = [
  { id: 'a', name: 'Sistem Odası' }, { id: 'b', name: 'Genel Müdürlük' },
  ...Array.from({ length: 7 }, (_, i) => ({ id: `wing-${i}`, name: `Bina ${i}` })),
];
const prisma = {
  building: {
    findUnique: async ({ where }) => ['a', 'b'].includes(where.id) ? { id: where.id } : null,
    findMany: async () => resetBuildings.map(building => ({ ...building })),
  },
  // A different building has the most links: reset must still center Sistem Odası.
  buildingConnection: { findMany: async () => resetBuildings.filter(b => b.id !== 'b').map(b => ({ sourceBuildingId: 'b', destBuildingId: b.id })) },
  $transaction: async operation => {
    const before = new Map(rows);
    try { return await operation(prisma); }
    catch (error) { rows.clear(); before.forEach((value, key) => rows.set(key, value)); throw error; }
  },
  systemConfig: {
    findMany: async ({ where }) => {
      if (unavailable) throw new Error('Synthetic storage unavailable');
      return [...rows].filter(([key]) => key.startsWith(where.key.startsWith)).map(([key, value]) => ({ key, value }));
    },
    upsert: async ({ where, create, update }) => {
      if (unavailable) throw new Error('Synthetic storage unavailable');
      writes++;
      rows.set(where.key, rows.has(where.key) ? update.value : create.value);
    },
    deleteMany: async ({ where }) => {
      if (unavailable) throw new Error('Synthetic storage unavailable');
      for (const key of rows.keys()) if (key.startsWith(where.key.startsWith)) rows.delete(key);
    },
    createMany: async ({ data }) => {
      if (failResetWrite) throw new Error('Synthetic reset write failure');
      data.forEach(row => rows.set(row.key, row.value));
    },
  },
};
function load(relative) {
  const loaded = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const requireFixture = name => {
    if (name === 'next/server') return { NextResponse: { json: (body, options = {}) => ({ status: options.status || 200, headers: options.headers, body }) } };
    if (name === '@/lib/prisma') return { prisma };
    if (name === '@/lib/auth/request-actor') return { getRequestActor: async () => auth };
    if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`);
    throw new Error(`Unexpected live dependency: ${name}`);
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: relative })(requireFixture, loaded, loaded.exports);
  return loaded.exports;
}
const { BUILDING_LAYOUT_KEY_PREFIX: prefix, UNASSIGNED_BUILDING_NODE_ID: unassigned } = load('lib/topology/building-layout.ts');
const { GET, PUT, POST } = load('app/api/network/building-layout/route.ts');
const request = body => ({ json: async () => body });
async function main() {
  auth = null;
  assert.equal((await GET(request())).status, 401);
  assert.equal((await PUT(request({}))).status, 401);
  assert.equal((await POST(request({ action: 'reset' }))).status, 401);
  auth = { role: 'VIEWER' };
  assert.equal((await GET(request())).body.data.canEdit, false);
  assert.equal((await PUT(request({ nodeId: 'building-a', position: { x: 1, y: 2 } }))).status, 403);
  assert.equal((await POST(request({ action: 'reset' }))).status, 403);
  auth = { role: 'EDITOR' };
  for (const body of [null, {}, { nodeId: 'device-a', position: { x: 1, y: 2 } }, { nodeId: 'building-a', position: { x: '1', y: 2 } }, { nodeId: 'building-a', position: { x: Infinity, y: 2 } }, { nodeId: 'building-a', position: { x: 1, y: NaN } }, { nodeId: 'building-a', position: { x: 1e9, y: 2 } }]) {
    assert.equal((await PUT(request(body))).status, 400);
  }
  assert.equal((await PUT({ json: async () => { throw new SyntaxError('bad json'); } })).status, 400);
  assert.equal((await PUT(request({ nodeId: 'building-missing', position: { x: 1, y: 2 } }))).status, 404);
  assert.equal(writes, 0);
  await Promise.all([
    PUT(request({ nodeId: 'building-a', position: { x: -125.25, y: 80.5 } })),
    PUT(request({ nodeId: 'building-b', position: { x: 320, y: -90 } })),
  ]);
  await PUT(request({ nodeId: 'building-a', position: { x: -200, y: 180 } }));
  await PUT(request({ nodeId: unassigned, position: { x: 500, y: 0 } }));
  rows.set(`${prefix}building-corrupt`, 'invalid json');
  rows.set(`${prefix}building-invalid`, JSON.stringify({ x: null, y: 0 }));
  rows.set('unrelated-setting', 'untouched');
  const reload = await GET(request());
  assert.equal(reload.status, 200);
  assert.match(reload.headers['Cache-Control'], /no-store/);
  assert.equal(reload.body.data.canEdit, true);
  assert.deepEqual(reload.body.data.positions, {
    'building-a': { x: -200, y: 180 }, 'building-b': { x: 320, y: -90 }, [unassigned]: { x: 500, y: 0 },
  });
  assert.equal(rows.get('unrelated-setting'), 'untouched');
  assert.equal((await POST(request({ action: 'unexpected' }))).status, 400);
  assert.equal((await POST(request(null))).status, 400);
  const beforeReset = new Map(rows);
  failResetWrite = true;
  assert.equal((await POST(request({ action: 'reset' }))).status, 503);
  assert.deepEqual(rows, beforeReset, 'A failed reset must preserve the entire previous layout');
  failResetWrite = false;
  const reset = await POST(request({ action: 'reset' }));
  assert.equal(reset.status, 200);
  assert.deepEqual(reset.body.data.positions['building-a'], { x: 0, y: 0 });
  assert.equal(Object.keys(reset.body.data.positions).length, 10, 'Every building and the virtual group must reset, including filtered-out nodes');
  assert.equal(new Set(Object.values(reset.body.data.positions).map(p => `${p.x},${p.y}`)).size, 10);
  assert.deepEqual((await GET(request())).body.data.positions, reset.body.data.positions, 'Reset positions must survive reload');
  assert.equal(rows.get('unrelated-setting'), 'untouched');
  assert.ok(!rows.has(`${prefix}building-corrupt`));
  assert.deepEqual((await POST(request({ action: 'reset' }))).body.data.positions, reset.body.data.positions, 'Repeated resets must be deterministic');
  unavailable = true;
  assert.equal((await GET(request())).status, 503);
  assert.equal((await PUT(request({ nodeId: 'building-a', position: { x: 0, y: 0 } }))).status, 503);
  assert.equal((await POST(request({ action: 'reset' }))).status, 503);
  console.log('Building layout passed: authenticated reads/writes/reset, validation, independent moves, reload restoration, deterministic Sistem Odası reset, hidden buildings, virtual group, atomic rollback and storage failures. Synthetic storage only.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
