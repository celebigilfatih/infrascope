/* eslint-disable @typescript-eslint/no-require-imports -- Exercise the real graph/router without a database. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const cache = new Map();
function load(file) {
  file = path.resolve(file); if (cache.has(file)) return cache.get(file);
  const loaded = { exports: {} }; cache.set(file, loaded.exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: file })(name => load(path.resolve(path.dirname(file), `${name}.ts`)), loaded, loaded.exports);
  return loaded.exports;
}
const { balancedBuildingOverview: project } = load('lib/topology/building-overview.ts');
const { routeBuildingOverview } = load('lib/topology/building-routing.ts');
const { buildings, links } = require('./fixtures/building-readable-map.cjs');
const nodes = buildings.map((b, i) => ({ id: `building-${b.id}`, type: 'building', position: { x: i * 10, y: 0 }, data: { buildingId: b.id, name: b.name } }));
const edges = links.map(l => ({ id: l.id, source: `building-${l.sourceBuildingId}`, target: `building-${l.destBuildingId}`, data: { buildingConnection: l } }));
const before = JSON.stringify({ nodes, edges });
const initialSaved = Object.fromEntries(nodes.map((n, i) => [n.id, { x: (i % 8) * 280, y: Math.floor(i / 8) * 230 }]));
const graph = project(nodes, edges, buildings, links, [], true, 'none', null, initialSaved);
assert.equal(graph.nodes.length, 32); assert.equal(graph.edges.length, 33);
function crosses(a, b, r) {
  return a.y === b.y ? a.y > r.y && a.y < r.bottom && Math.max(a.x, b.x) > r.x && Math.min(a.x, b.x) < r.right
    : a.x > r.x && a.x < r.right && Math.max(a.y, b.y) > r.y && Math.min(a.y, b.y) < r.bottom;
}
function verify(result) {
  for (const edge of result.edges) {
    const route = edge.data.buildingRoute;
    assert.ok(route?.points?.length >= 2, `${edge.id}: overview must use obstacle-aware route, not replace it with a Bezier`);
    for (const node of result.nodes) {
      const top = node.position.y + (node.id === result.centerId ? 80 : 64);
      const rect = { x: node.position.x, y: top, right: node.position.x + 160, bottom: top + 62 };
      for (let i = 1; i < route.points.length; i++) assert.ok(!crosses(route.points[i - 1], route.points[i], rect), `${edge.id} crosses ${node.id} name/count`);
    }
  }
}
verify(graph);
assert.equal(JSON.stringify({ nodes, edges }), before, 'Projection and routing cannot mutate input coordinates or links');
// A saved corridor with an intermediate building exercises the actual displayed routes.
const saved = Object.fromEntries(nodes.map((n, i) => [n.id, { x: (i % 8) * 280, y: Math.floor(i / 8) * 230 }]));
const savedBefore = JSON.stringify(saved), custom = project(nodes, edges, buildings, links, [], true, 'none', null, saved);
verify(custom);
assert.equal(JSON.stringify(saved), savedBefore);
for (const n of custom.nodes) assert.deepEqual(n.position, saved[n.id], 'Stored customer coordinates remain authoritative');
const defaults = project(nodes, edges, buildings, links, [], true, 'none');
verify(defaults);
const xs = defaults.nodes.map(n => n.position.x), ys = defaults.nodes.map(n => n.position.y);
assert.ok(Math.max(...xs) - Math.min(...xs) + 160 <= 1700, '32-building defaults must not grow into distant rings');
assert.ok(Math.max(...ys) - Math.min(...ys) + 148 <= 1250, 'Default layout must stay compact vertically');
const reversed = project([...nodes].reverse(), [...edges].reverse(), [...buildings].reverse(), [...links].reverse(), [], true, 'none');
for (const n of defaults.nodes) assert.deepEqual(n.position, reversed.nodes.find(other => other.id === n.id).position);
const filtered = project(nodes.slice(0, 20), edges.filter(e => !e.target.endsWith('31')), buildings, links, [], true, 'none');
for (const n of filtered.nodes) assert.deepEqual(n.position, defaults.nodes.find(other => other.id === n.id).position, 'Filtering must not move remaining buildings');
const parallelNodes = [{ id: 'a', type: 'building', position: { x: 0, y: 0 } }, { id: 'b', type: 'building', position: { x: 300, y: 0 } }];
for (const count of [3, 10]) {
  const parallel = Array.from({ length: count }, (_, i) => ({ id: `parallel-${i}`, source: i % 2 ? 'b' : 'a', target: i % 2 ? 'a' : 'b' }));
  const routed = routeBuildingOverview(parallelNodes, parallel);
  assert.equal(Object.keys(routed.routes).length, count);
  assert.equal(new Set(Object.values(routed.routes).map(route => route.path)).size, count, 'Every parallel/reverse connection needs an independent rendered path');
}
console.log('Overview routing passed: 32 buildings/33 actual paths, name/count clearance and unchanged saved coordinates.');
