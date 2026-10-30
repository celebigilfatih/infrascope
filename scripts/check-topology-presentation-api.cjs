/* eslint-disable @typescript-eslint/no-require-imports -- Execute real handlers with a synthetic storage boundary. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
let actor = { role: 'EDITOR' }, row = null, offline = false, race = false, activeIds=['one','two'];
const prisma = {
  building: { findMany: async () => activeIds.map(id=>({id})) },
  systemConfig: {
    findUnique: async () => { if (offline) throw Error('offline'); return row && { ...row }; },
    create: async ({ data }) => { if (row) throw { code:'P2002' }; row = { ...data }; return row; },
    updateMany: async ({ where, data }) => { if (race) { row.value = JSON.stringify({ revision: 9, document: { ...base, backboneIds: ['two'] } }); race = false; } if (!row || row.value !== where.value) return { count:0 }; row = { ...row, ...data }; return { count:1 }; },
  },
};
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const loaded = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path.resolve(file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(source, { exports: loaded.exports, require: name => {
    if (name === 'next/server') return { NextResponse: { json: (body, opts = {}) => ({ body, status: opts.status || 200 }) } };
    if (name === '@/lib/prisma') return { prisma };
    if (name === '@/lib/auth/request-actor') return { getRequestActor: async () => actor };
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
    return require(name);
  }, console });
  cache.set(file, loaded.exports); return loaded.exports;
}
const { GET, PUT } = load('app/api/network/topology-presentation/route.ts');
const base = { version:1, backboneIds:['one'], sections:[{ id:'area', name:'Bölüm', buildingIds:['two'] }], positions:{}, pinned:{} };
const save = (baseRevision = 0, document = base) => PUT({ json: async () => ({ baseRevision, document }) });
(async () => {
  actor = null; assert.equal((await GET({})).status,401); assert.equal((await save()).status,401); assert.equal(row,null);
  actor = { role:'VIEWER' }; assert.equal((await GET({})).body.data.canEdit,false); assert.equal((await save()).status,403); assert.equal(row,null);
  actor = { role:'EDITOR' };
  assert.equal((await GET({})).body.data.revision,0);
  assert.equal((await save(0,{ ...base, backboneIds:['missing'] })).status,400);
  assert.equal((await save(0,{ ...base, backboneIds:['two'] })).status,400);
  const first = await save(); assert.equal(first.status,200); assert.equal(first.body.data.revision,1);
  assert.equal((await save()).body.data.revision,1,'A lost-response retry does not increment the revision');
  const different = { ...base, sections:[{ ...base.sections[0], name:'Güncel' }] };
  assert.equal((await save(0,different)).status,409); assert.equal(JSON.parse(row.value).revision,1);
  assert.equal((await save(1,different)).body.data.revision,2);
  race = true; assert.equal((await save(2,base)).status,409,'Compare-and-swap prevents a race between read and write');
  assert.equal(JSON.parse(row.value).revision,9);
  activeIds=['one'];const stale=row.value;const reconciled=(await GET({})).body.data;
  assert.equal(reconciled.document.sections[0].buildingIds.length,0,'Deleted buildings cannot permanently block view edits');
  assert.equal(row.value,stale,'A read cannot rewrite shared presentation');
  assert.equal((await save(9,reconciled.document)).status,200);
  offline = true; assert.equal((await GET({})).status,503); assert.equal((await save(10,reconciled.document)).status,503);
  console.log('Topology presentation API passed: no-session/read-only denial, validation, read/write, lost-response replay, stale revision, concurrent CAS and unavailable storage. Synthetic store only.');
})().catch(error => { console.error(error); process.exitCode = 1; });
