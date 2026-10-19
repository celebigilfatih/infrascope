/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync('lib/topology/building-graph.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const loaded = { exports: {} };
vm.runInNewContext('(function(exports){' + code + '\n})', {})(loaded.exports);
const { buildingConnectionDraft, matchingBuildingConnection, buildingGraphPositions } = loaded.exports;
const ids = ['hub', ...Array.from({ length: 8 }, (_, i) => `building-${i}`)];
const links = ids.slice(1).map((id, i) => ({ id: `link-${i}`, sourceBuildingId: 'hub', destBuildingId: id, connectionType: 'FIBER_SINGLE_MODE' }));
const draft = buildingConnectionDraft({ source: 'building-hub', target: 'building-building-0' }, ids);
assert.equal(draft.sourceBuildingId, 'hub'); assert.equal(draft.destBuildingId, 'building-0');
for (const invalid of [
  { source: 'building-hub', target: 'building-hub' },
  { source: 'building-hub', target: 'building-unassigned' },
  { source: null, target: 'building-hub' },
  { source: 'device-hub', target: 'building-building-0' },
]) assert.equal(buildingConnectionDraft(invalid, ids), null);
assert.equal(matchingBuildingConnection(links, draft, 'FIBER_SINGLE_MODE').id, 'link-0');
assert.equal(matchingBuildingConnection(links, { sourceBuildingId: draft.destBuildingId, destBuildingId: draft.sourceBuildingId }, 'FIBER_SINGLE_MODE').id, 'link-0');
assert.equal(matchingBuildingConnection(links, draft, 'FIBER_MULTI_MODE'), undefined);
assert.equal(matchingBuildingConnection(links, draft, 'FIBER_SINGLE_MODE', 'link-0'), undefined);
const positions = buildingGraphPositions([...ids.slice(1), 'hub', 'unassigned'], links, false, 'unassigned');
assert.equal(positions.hub.x, 0); assert.equal(positions.hub.y, 0);
assert.equal(Object.keys(positions).length, 10);
assert.equal(new Set(Object.values(positions).map(p => `${p.x},${p.y}`)).size, 10);
for (const id of ids.slice(1)) assert.ok(Math.abs(positions[id].x) <= 300 && Math.abs(positions[id].y) <= 190);
assert.ok(positions.unassigned.x > 300);
const rows = buildingGraphPositions(['a', 'b'], [], true, 'unassigned');
assert.equal(rows.b.y - rows.a.y, 152);
const large = Array.from({ length: 42 }, (_, i) => String(i));
const rings = buildingGraphPositions(large, [], false, 'unassigned');
assert.equal(new Set(Object.values(rings).map(p => `${p.x},${p.y}`)).size, 42);
console.log('Building graph passed: drag endpoints, self/virtual rejection, reverse duplicates, edit exclusion, eight-spoke hub, isolated unassigned group and 42-building layout. No live data changed.');
