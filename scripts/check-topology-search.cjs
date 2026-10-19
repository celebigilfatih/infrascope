/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync('lib/topology/search.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const loaded = { exports: {} };
vm.runInNewContext(`(function(exports){${code}\n})`, {})(loaded.exports);
const { topologySearchMatches, topologySearchText } = loaded.exports;
const items = [
  { id: 'empty', kind: 'building', name: 'Genel Müdürlük', description: 'Bursa' },
  { id: 'a', kind: 'building', name: 'A Blok' },
  { id: 'b', kind: 'building', name: 'İşletmeler' },
  { id: 'device', kind: 'device', name: 'ÇIKIŞ-SW', description: '10.0.0.1 · A Blok' },
  { id: 'same-1', kind: 'device', name: 'SW', description: 'A Blok' },
  { id: 'same-2', kind: 'device', name: 'SW', description: 'B Blok' },
];
const ids = (query, source = items) => Array.from(topologySearchMatches(source, query), item => item.id);
assert.deepEqual(ids('  '), []);
assert.deepEqual(ids('GENEL MUDURLUK'), ['empty'], 'Empty buildings must remain searchable, with Turkish and ASCII spelling');
assert.deepEqual(ids('isletmeler'), ['b']);
assert.deepEqual(ids('cikis-sw'), ['device']);
assert.deepEqual(ids('10.0.0.1'), ['device'], 'IP lookup remains available');
assert.deepEqual(ids('SW'), ['same-1', 'same-2', 'device'], 'Exact names rank first and same-named devices remain distinct');
assert.equal(ids('A Blok')[0], 'a', 'A building name ranks above devices whose location matches');
assert.deepEqual(ids('does-not-exist'), []);
assert.deepEqual(ids('ÇIKIŞ', items.filter(item => item.kind === 'building')), [], 'Callers can scope results to their visible workspace');
assert.equal(topologySearchText('İşletmeler  IŞIK'), 'isletmeler  isik');
assert.equal(items[0].id, 'empty', 'Search must not rearrange inventory or graph inputs');
console.log('Topology search passed: buildings without devices, Turkish/ASCII names, IPs, ranking, duplicate names, scope, no matches and immutable inventory. No live data changed.');
