/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
function load(file) {
  const fixture = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: file })(name => load(path.join(path.dirname(file), `${name}.ts`)), fixture, fixture.exports);
  return fixture.exports;
}
const { routeBuildingConnections: route, buildingMapViewport, BUILDING_ROUTING_GEOMETRY: geometry } = load('lib/topology/building-routing.ts');
const { buildingGraphPositions } = load('lib/topology/building-graph.ts');
const { countDeviceRouteCrossings } = load('lib/topology/device-routing.ts');
const { visibleConnectionLabelIds } = load('lib/topology/device-labels.ts');
const link = (source, target, id = `${source}-${target}`) => ({ id, source, target });
const inside = (p, left, top, right, bottom) => p.x > left + .01 && p.x < right - .01 && p.y > top + .01 && p.y < bottom - .01;
function verify(positions, links, result) {
  assert.equal(Object.keys(result.routes).length, links.length);
  assert.deepEqual(result.blockedIds, []);
  for (const edge of links) {
    const routed = result.routes[edge.id];
    assert.ok(!routed.path.includes('NaN') && routed.path.startsWith('M '));
    for (const [point, id] of [[routed.points[0], edge.source], [routed.points.at(-1), edge.target]]) {
      const node = positions[id];
      assert.ok(point.y === node.y + 28 && [node.x + 36, node.x + 92].includes(point.x) || point.x === node.x + 64 && point.y === node.y, 'Line terminates at the 56px building icon border');
    }
    for (let i = 1; i < routed.points.length; i++) {
      const a = routed.points[i - 1], b = routed.points[i], steps = Math.ceil(Math.hypot(a.x - b.x, a.y - b.y));
      assert.ok(a.x === b.x || a.y === b.y);
      for (let step = 0; step <= steps; step++) {
        const p = { x: a.x + (b.x - a.x) * step / steps, y: a.y + (b.y - a.y) * step / steps };
        for (const [id, n] of Object.entries(positions)) {
          assert.ok(!inside(p, n.x + 36, n.y, n.x + 92, n.y + 56), `${edge.id} intersects icon ${id}`);
          assert.ok(!inside(p, n.x, n.y + 62, n.x + 128, n.y + 116), `${edge.id} intersects name/count ${id}`);
          const ownStub = id === edge.source && i === 1 || id === edge.target && i === routed.points.length - 1;
          if (!ownStub) assert.ok(!inside(p, n.x, n.y, n.x + 128, n.y + 116), `${edge.id} enters reserved building area ${id}`);
        }
      }
    }
  }
}
assert.deepEqual(route({}, []), { routes: {}, blockedIds: [] });
const ids = ['hub', ...Array.from({ length: 8 }, (_, i) => `building-${i}`), 'unassigned'];
const links = ids.slice(1, -1).map(id => link('hub', id));
const positions = buildingGraphPositions(ids, links.map(edge => ({ sourceBuildingId: edge.source, destBuildingId: edge.target })), false, 'unassigned');
const before = JSON.stringify(positions), star = route(positions, links);
verify(positions, links, star);
assert.equal(JSON.stringify(positions), before, 'Saved building coordinates are never rewritten by routing');
assert.deepEqual(route(Object.fromEntries(Object.entries(positions).reverse()), [...links].reverse()), star, 'Reordering inventory or API results must not change routes');
const obstacle = { a: { x: -300, y: 0 }, b: { x: 400, y: 0 }, unassigned: { x: 30, y: -40 } };
verify(obstacle, [link('a', 'b')], route(obstacle, [link('a', 'b')]));
const moved = { ...positions, 'building-0': { x: 99.5, y: -390.25 } }, movedRoutes = route(moved, links);
verify(moved, links, movedRoutes);
assert.notEqual(movedRoutes.routes['hub-building-0'].path, star.routes['hub-building-0'].path, 'Dragging a building immediately changes its route');
const parallelLinks = [link('a', 'b', 'fiber'), link('a', 'b', 'ethernet'), link('b', 'a', 'reverse')], parallels = route(obstacle, parallelLinks);
verify(obstacle, parallelLinks, parallels);
assert.ok(new Set(Object.values(parallels.routes).map(item => item.path)).size > 1, 'Parallel connections keep separate corridors');
assert.deepEqual(route({ a: { x: 0, y: 0 }, b: { x: 0, y: 0 } }, [link('a', 'b')]).blockedIds, ['a-b']);
assert.equal(Object.keys(route(positions, [link('hub', 'hub'), link('hub', 'missing')]).routes).length, 0);
const crossing = { a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, c: { x: 0, y: 300 }, d: { x: 400, y: 300 } }, crossingLinks = [link('a', 'd'), link('b', 'c')];
const crossingRoutes = route(crossing, crossingLinks);
verify(crossing, crossingLinks, crossingRoutes);
assert.equal(countDeviceRouteCrossings(crossingRoutes.routes), 0, 'The two diagonals that previously crossed must take separate routes');
assert.deepEqual([...visibleConnectionLabelIds({ a: { x: 0, y: 0 } }, [{ id: 'near-count', x: 64, y: 148, width: 220 }, { id: 'safe', x: 64, y: 220, width: 220 }], geometry)], ['safe'], 'Label planning includes both name lines and the building device-count line');
for (const [width, height, top] of [[980, 470, 90], [350, 520, 140]]) {
  const viewport = buildingMapViewport(positions, Object.values(star.routes), width, height, top);
  const corners = Object.values(positions).flatMap(p => [p, { x: p.x + 128, y: p.y + 116 }]);
  for (const p of [...corners, ...Object.values(star.routes).flatMap(item => item.points)]) {
    const x = p.x * viewport.zoom + viewport.x, y = p.y * viewport.zoom + viewport.y;
    assert.ok(x >= 31.99 && x <= width - 31.99, 'Overview includes all building and route bounds');
    assert.ok(y >= top - .01 && y <= height - 59.99, 'Overview leaves the toolbar and bottom controls clear');
  }
}
assert.deepEqual(buildingMapViewport({}, [], 980, 470, 90), { x: 0, y: 0, zoom: 1 });
console.log('Building routing passed: 56px icons, two-line names/counts, eight-spoke hub, virtual obstacles, saved coordinates, moved buildings, stable order, parallel/reverse links, overlap handling and crossing reduction. Synthetic records only.');
