/* eslint-disable @typescript-eslint/no-require-imports -- Isolated PostgreSQL route regression. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// This script is deliberately restricted to the disposable incident test database.
const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
if (process.env.INFRASCOPE_INCIDENT_E2E !== '1' || process.env.INFRASCOPE_BUILDING_DB_TEST !== '1'
  || url.protocol !== 'postgresql:' || url.hostname !== 'postgres'
  || url.pathname !== '/infrascope_incident_e2e') {
  throw new Error('Explicit opt-in and private incident PostgreSQL fixture database required');
}
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const prefix = `building-assignment-${process.pid}-${Date.now()}`;
const ids = Object.fromEntries(['org', 'A', 'B', 'floorA', 'floorA2', 'floorB', 'a', 'b'].map(key => [key, `${prefix}-${key}`]));
let race = false;
let writeCount = 0;
let checks = 0;
const routeDb = {
  $transaction: fn => prisma.$transaction(tx => fn({
    ...tx,
    device: {
      findMany: args => tx.device.findMany({ ...args, orderBy: { id: 'asc' } }),
      updateMany: async args => {
        writeCount++;
        if (race && writeCount === 2) {
          // A separate connection commits a floor change after the route read it.
          await prisma.device.update({ where: { id: ids.b }, data: { floorId: ids.floorA2 } });
        }
        return tx.device.updateMany(args);
      },
    },
  })),
};
const cache = new Map();
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports;
  const fixtureModule = { exports: {} };
  cache.set(relative, fixtureModule);
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mockRequire = name => {
    if (name === 'next/server') return { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } };
    if (name === '@/lib/prisma') return { prisma: routeDb };
    if (name === '@/lib/auth/request-actor') return { getRequestActor: async () => ({ role: 'EDITOR' }) };
    if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`);
    if (name.startsWith('.')) return load(path.join(path.dirname(relative), name) + '.ts');
    throw new Error(`Unexpected live dependency ${name}`);
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: relative })(mockRequire, fixtureModule, fixtureModule.exports);
  return fixtureModule.exports;
}
const { PATCH } = load('app/api/network/building-devices/route.ts');
async function patch(action, buildingId, deviceIds, extra = {}) {
  writeCount = 0;
  return PATCH({ json: async () => ({ action, buildingId, deviceIds, ...extra }) });
}
async function position(id) {
  return prisma.device.findUniqueOrThrow({ where: { id }, select: { buildingId: true, floorId: true } });
}
async function check(name, run) {
  await run();
  checks++;
  console.log(`PASS PostgreSQL ${name}`);
}
async function main() {
  await prisma.organization.create({ data: { id: ids.org, name: prefix, code: prefix } });
  for (const name of ['A', 'B']) await prisma.building.create({ data: { id: ids[name], name, address: 'Synthetic fixture address', city: 'Fixture City', country: 'Fixture Country', organizationId: ids.org } });
  for (const [key, building, number] of [['floorA', 'A', 1], ['floorA2', 'A', 2], ['floorB', 'B', 1]]) {
    await prisma.floor.create({ data: { id: ids[key], buildingId: ids[building], name: `Floor ${number}`, floorNumber: number } });
  }
  for (const key of ['a', 'b']) await prisma.device.create({ data: { id: ids[key], name: key, type: 'SWITCH', tags: [], buildingId: ids.A, floorId: ids.floorA } });

  await check('same-building assignment retains the direct floor', async () => {
    assert.equal((await patch('assign', ids.A, [ids.a, ids.b])).status, 200);
    assert.deepEqual(await position(ids.a), { buildingId: ids.A, floorId: ids.floorA });
    assert.deepEqual(await position(ids.b), { buildingId: ids.A, floorId: ids.floorA });
  });
  await check('concurrent second-device floor change returns 409 and rolls back the first write', async () => {
    race = true;
    try {
      assert.equal((await patch('unassign', ids.A, [ids.a, ids.b])).status, 409);
    } finally { race = false; }
    assert.equal(writeCount, 2);
    assert.deepEqual(await position(ids.a), { buildingId: ids.A, floorId: ids.floorA });
    assert.deepEqual(await position(ids.b), { buildingId: ids.A, floorId: ids.floorA2 }, 'The other connection committed its floor; only this request rolls back');
  });
  await check('explicit cross-building move clears both previous floors atomically', async () => {
    assert.equal((await patch('assign', ids.B, [ids.a, ids.b], { allowReassign: true })).status, 200);
    for (const id of [ids.a, ids.b]) assert.deepEqual(await position(id), { buildingId: ids.B, floorId: null });
  });
  await check('wrong-building removal leaves the assigned floor unchanged', async () => {
    await prisma.device.update({ where: { id: ids.a }, data: { floorId: ids.floorB } });
    assert.equal((await patch('unassign', ids.A, [ids.a])).status, 409);
    assert.deepEqual(await position(ids.a), { buildingId: ids.B, floorId: ids.floorB });
  });
  await check('unassignment clears the direct floor and building', async () => {
    assert.equal((await patch('unassign', ids.B, [ids.a, ids.b])).status, 200);
    for (const id of [ids.a, ids.b]) assert.deepEqual(await position(id), { buildingId: null, floorId: null });
  });
  console.log(`Building assignment PostgreSQL: ${checks}/${checks} checks passed; synthetic records only.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  try {
    await prisma.device.deleteMany({ where: { id: { in: [ids.a, ids.b] } } });
    await prisma.organization.deleteMany({ where: { id: ids.org } });
  } finally { await prisma.$disconnect(); }
});
