/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const { getBezierPath, Position } = require('reactflow');
function load(file) {
  const fixture = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: file })(name => load(path.join(path.dirname(file), `${name}.ts`)), fixture, fixture.exports);
  return fixture.exports;
}
const { routeBuildingDeviceConnections: route, countDeviceRouteCrossings } = load('lib/topology/device-routing.ts');
const { defaultBuildingDevicePositions: arrange } = load('lib/topology/building-device-layout.ts');
const link = (sourceDeviceId, targetDeviceId, id = `${sourceDeviceId}-${targetDeviceId}`) => ({ id, sourceDeviceId, targetDeviceId });
const rect = p => ({ left: p.x, top: p.y, right: p.x + 140, bottom: p.y + 110 });
const inside = (p, r) => p.x > r.left + .01 && p.x < r.right - .01 && p.y > r.top + .01 && p.y < r.bottom - .01;
function renderedPoints(svg) {
  const tokens = svg.match(/[MLQ]|-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/g), result = [];
  let current;
  for (let i = 0; i < tokens.length;) {
    const command = tokens[i++];
    if (command === 'M' || command === 'L') { current = { x: Number(tokens[i++]), y: Number(tokens[i++]) }; result.push(current); }
    else {
      assert.equal(command, 'Q');
      const start = current, control = { x: Number(tokens[i++]), y: Number(tokens[i++]) }, end = { x: Number(tokens[i++]), y: Number(tokens[i++]) };
      for (let step = 1; step <= 16; step++) {
        const t = step / 16, s = 1 - t;
        result.push({ x: s * s * start.x + 2 * s * t * control.x + t * t * end.x, y: s * s * start.y + 2 * s * t * control.y + t * t * end.y });
      }
      current = end;
    }
  }
  return result;
}
function verify(positions, links, result) {
  assert.equal(Object.keys(result.routes).length, links.length, 'Every valid link remains available');
  assert.deepEqual(result.blockedIds, []);
  for (const edge of links) {
    const routed = result.routes[edge.id];
    assert.ok(routed.path.startsWith('M ') && !routed.path.includes('NaN'));
    const first = routed.points[0], last = routed.points.at(-1);
    for (const [endpoint, id] of [[first, edge.sourceDeviceId], [last, edge.targetDeviceId]]) {
      const p = positions[id];
      assert.ok((endpoint.y === p.y + 24 && [p.x + 46, p.x + 94].includes(endpoint.x)) || (endpoint.x === p.x + 70 && endpoint.y === p.y), 'Path terminates on the actual icon border');
    }
    for (let i = 1; i < routed.points.length; i++) {
      const a = routed.points[i - 1], b = routed.points[i];
      assert.ok(a.x === b.x || a.y === b.y, 'Routes are orthogonal');
      // Sample at subpixel intervals using the rendered geometry, independently
      // of the router's collision predicate. Endpoint stubs can only occupy the
      // empty strip beside their own icon, never any icon or device name.
      const steps = Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) * 2);
      for (let step = 0; step <= steps; step++) {
        const p = { x: a.x + (b.x - a.x) * step / steps, y: a.y + (b.y - a.y) * step / steps };
        for (const [id, node] of Object.entries(positions)) {
          assert.ok(!inside(p, { left: node.x + 46, top: node.y, right: node.x + 94, bottom: node.y + 48 }), `${edge.id} crosses icon ${id}`);
          assert.ok(!inside(p, { left: node.x, top: node.y + 54, right: node.x + 140, bottom: node.y + 110 }), `${edge.id} crosses name/IP ${id}`);
          const ownStub = (id === edge.sourceDeviceId && i === 1) || (id === edge.targetDeviceId && i === routed.points.length - 1);
          if (!ownStub) assert.ok(!inside(p, rect(node)), `${edge.id} crosses the reserved area for ${id}`);
        }
      }
    }
    for (const p of renderedPoints(routed.path)) for (const node of Object.values(positions)) {
      assert.ok(!inside(p, { left: node.x + 46, top: node.y, right: node.x + 94, bottom: node.y + 48 }), 'Rounded corners cannot cut through icons');
      assert.ok(!inside(p, { left: node.x, top: node.y + 54, right: node.x + 140, bottom: node.y + 110 }), 'Rounded corners cannot cut through labels');
    }
  }
}
assert.deepEqual(route({}, []), { routes: {}, blockedIds: [] });
const obstaclePositions = { a: { x: 0, y: 0 }, b: { x: 600, y: 0 }, blocker: { x: 280, y: -40 } };
verify(obstaclePositions, [link('a', 'b')], route(obstaclePositions, [link('a', 'b')]));
const positions = {
  core: { x: 220, y: 180 }, hub1: { x: 0, y: 0 }, hub2: { x: 220, y: 0 },
  leaf: { x: 0, y: 180 }, b1: { x: 0, y: 360 }, b2: { x: 220, y: 360 }, b4: { x: 440, y: 360 }, b5: { x: 440, y: 180 },
};
const links = ['core', 'hub1', 'hub2'].flatMap(id => ['b1', 'b2', 'b4', 'b5'].map(peer => link(id, peer))).concat(link('core', 'leaf'));
const before = JSON.stringify(positions), started = performance.now(), network = route(positions, links);
verify(positions, links, network);
function legacyCurve(edge) {
  const source = positions[edge.sourceDeviceId], target = positions[edge.targetDeviceId];
  const [svg] = getBezierPath({ sourceX: source.x + 70, sourceY: source.y + 48, targetX: target.x + 70, targetY: target.y, sourcePosition: Position.Bottom, targetPosition: Position.Top });
  const n = svg.match(/-?\d+(?:\.\d+)?/g).map(Number);
  return Array.from({ length: 61 }, (_, i) => {
    const t = i / 60, s = 1 - t;
    return { x: s ** 3 * n[0] + 3 * s ** 2 * t * n[2] + 3 * s * t ** 2 * n[4] + t ** 3 * n[6], y: s ** 3 * n[1] + 3 * s ** 2 * t * n[3] + 3 * s * t ** 2 * n[5] + t ** 3 * n[7] };
  });
}
function properCross(a, b, c, d) {
  const turn = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return turn(a, b, c) * turn(a, b, d) < -.001 && turn(c, d, a) * turn(c, d, b) < -.001;
}
const legacy = links.map(legacyCurve);
let legacyCrossingPairs = 0, routedCrossingPairs = 0;
for (let i = 0; i < links.length; i++) for (let j = i + 1; j < links.length; j++) {
  const crosses = (a, b) => a.slice(1).some((point, index) => b.slice(1).some((peer, peerIndex) => properCross(a[index], point, b[peerIndex], peer)));
  if (crosses(legacy[i], legacy[j])) legacyCrossingPairs++;
  if (crosses(renderedPoints(network.routes[links[i].id].path), renderedPoints(network.routes[links[j].id].path))) routedCrossingPairs++;
}
assert.ok(routedCrossingPairs < legacyCrossingPairs, 'Dense-map routes must reduce crossing pairs compared with the previous Bézier drawing');
assert.equal(JSON.stringify(positions), before, 'Routing cannot change saved icon coordinates');
assert.deepEqual(route(Object.fromEntries(Object.entries(positions).reverse()), [...links].reverse()), network, 'API and inventory ordering cannot change routes');
const overlaps = route({ a: { x: 0, y: 0 }, b: { x: 0, y: 0 } }, [link('a', 'b')]);
assert.deepEqual(overlaps.blockedIds, ['a-b'], 'Overlapping icons must not fall back to an unsafe straight line');
assert.equal(Object.keys(overlaps.routes).length, 0);
const parallels = [link('a', 'b', 'first'), link('a', 'b', 'parallel'), link('b', 'a', 'reverse')];
const parallelRoutes = route(obstaclePositions, parallels);
verify(obstaclePositions, parallels, parallelRoutes);
assert.ok(new Set(Object.values(parallelRoutes.routes).map(r => r.path)).size > 1, 'Parallel connections use separate corridors');
const moved = { ...positions, b2: { x: 370.5, y: 580.25 } };
const rerouted = route(moved, links);
verify(moved, links, rerouted);
assert.notEqual(rerouted.routes['core-b2'].path, network.routes['core-b2'].path, 'Moving an icon updates the route');
const ids = Array.from({ length: 122 }, (_, i) => `device-${i}`), inventoryLinks = ids.slice(1, 15).map(id => link(ids[0], id));
const inventoryPositions = arrange(ids, inventoryLinks);
verify(inventoryPositions, inventoryLinks, route(inventoryPositions, inventoryLinks));
assert.equal(Object.keys(route(positions, [link('core', 'core'), link('missing', 'core')]).routes).length, 0);
console.log(JSON.stringify({ result: 'Routing passed: icon/name clearance, obstacles, dense graph, stable order, manual coordinates, moved nodes, parallel/reverse links, overlap fallback, 122-device inventory.', legacyCrossingPairs, routedCrossingPairs, denseCrossings: countDeviceRouteCrossings(network.routes), milliseconds: Math.round(performance.now() - started) }));
