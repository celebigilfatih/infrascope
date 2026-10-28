/* eslint-disable @typescript-eslint/no-require-imports */
// Actual building-create handler with a transactional synthetic store; no live DB.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
let actor = { role: 'EDITOR' }, failure = '', rows = [];
const matches = (row, where) => Object.entries(where).every(([key, value]) => key === 'OR' ? value.some(part => matches(row, part)) : row[key] === value);
const prisma = {
  building: { count: async ({ where }) => where.id.in.filter(id => ['one', 'two'].includes(id)).length },
  buildingConnection: {
    findFirst: async ({ where }) => rows.find(row => matches(row, where)) || null,
    create: async ({ data }) => { if (failure) throw { code: failure }; const row = { id: `created-${rows.length}`, ...data }; rows.push(row); return row; },
  },
  $transaction: async (operation, options) => { assert.equal(options.isolationLevel, 'Serializable'); const before = structuredClone(rows); try { return await operation(prisma); } catch (error) { rows = before; throw error; } },
};
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const loaded = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const requireFixture = name => {
    if (name === 'next/server') return { NextResponse: { json: (body, opts = {}) => ({ body, status: opts.status || 200 }) } };
    if (name === '@/lib/prisma') return { prisma };
    if (name === '@/lib/auth/request-actor') return { getRequestActor: async () => actor };
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
    if (name.startsWith('.')) return load(path.join(path.dirname(file), name) + '.ts');
    return require(name);
  };
  vm.runInNewContext(source, { exports: loaded.exports, require: requireFixture, console, Date, Map, Set, URL, Response, JSON });
  cache.set(file, loaded.exports); return loaded.exports;
}
const { POST } = load('app/api/building-connections/route.ts');
const base = { sourceBuildingId: 'one', destBuildingId: 'two', connectionType: 'FIBER_SINGLE_MODE', bandwidth: '10 Gbps', notes: 'Fixture' };
const create = extra => POST({ json: async () => ({ ...base, ...extra }) });
(async () => {
  actor = null; assert.equal((await create()).status, 401, 'Missing session must never create a link'); assert.equal(rows.length, 0);
  actor = { role: 'VIEWER' }; assert.equal((await create()).status, 403); assert.equal(rows.length, 0);
  actor = { role: 'EDITOR' };
  for (const extra of [{ destBuildingId: 'one' }, { sourceBuildingId: '' }, { connectionType: 'INVALID' }, { status: 'green' }, { distance: -1 }, { distance: 'nan' }, { bandwidth: 'infinity' }, { name: {} }]) assert.equal((await create(extra)).status, 400);
  assert.equal((await POST({ json: async () => { throw Error('Invalid JSON'); } })).status, 400);
  assert.equal((await create({ destBuildingId: 'missing' })).status, 404); assert.equal(rows.length, 0);
  const first = await create(); assert.equal(first.status, 201); assert.equal(first.body.data.status, 'UNKNOWN');
  const replay = await create(); assert.equal(replay.status, 200); assert.equal(replay.body.data.id, first.body.data.id); assert.equal(rows.length, 1, 'Lost response retry must not create another link');
  assert.equal((await create({ sourceBuildingId: 'two', destBuildingId: 'one' })).status, 200, 'Reverse traversal identifies the same building link');
  assert.equal((await create({ notes: 'different' })).status, 409); assert.equal(rows.length, 1);
  assert.equal((await create({ connectionType: 'VPN' })).status, 201, 'Different physical types are preserved');
  for (const code of ['P2002', 'P2034']) { failure = code; assert.equal((await create({ connectionType: 'WIRELESS' })).status, 409); }
  failure = 'offline'; assert.equal((await create({ connectionType: 'WIRELESS' })).status, 503);
  console.log('Topology create passed: session/role, field/endpoints, unknown default, exact/reversed replay, conflicts and storage failure. Synthetic records only.');
})().catch(error => { console.error(error); process.exitCode = 1; });
